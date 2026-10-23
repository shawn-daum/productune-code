"""prdt_lanes — the ONE lane computation (T-1145 / T-1147, design R1–R3).

Everything `compute_lanes` needs and nothing else: the ticket scan, the open PRD
section's `### 합격선` read and the dispatch-marker liveness read. `prdt` imports
it (schedule · dispatch gate) and so does statusline-prdt.sh — python caches this
module's bytecode (a main script gets no .pyc), so a lane read no longer compiles
the whole CLI. Read-only: it writes nothing. Mirrored beside `prdt` by install.sh.
"""
import json, math, os, re
from datetime import datetime, timezone
from pathlib import Path

TICKET_TYPES = ("design", "impl", "qa", "ops", "decision")


TICKET_STATUS = ("open", "done", "dropped")


LEGACY_ASSIGNEE_RE = re.compile(r"^pdtl?-")


def norm_assignee(v):
    """Strip the pre-rename prefix off a STRING assignee; every other shape is None.

    Deliberately NOT `str(v or "")` (T-556). That coercion turned `assignee:
    [developer]` into the cell "['developer']" — no crash, no warning, and
    `prdt tickets --assignee developer` silently missing the row. A stringified
    non-string in the index is the same quiet lie index_scalar exists to refuse;
    this normalizer runs AFTER that guard on the index path and must not undo it."""
    if not isinstance(v, str):
        return None
    return LEGACY_ASSIGNEE_RE.sub("", v) or None


def prdt_home():
    """Tool home — machine scope, one level above every project. Holds the
    discipline mirror plus the two stores that are NOT mirrored (`overrides/`,
    `wiki/`). `PRDT_HOME` redirects it, which is also how a test drives the
    machine scope without touching the real one."""
    env = os.environ.get("PRDT_HOME")
    return Path(env) if env else Path.home() / ".prdt"


def parse_frontmatter(path):
    """Minimal YAML-subset frontmatter parser: scalars, [a, b] + block lists, quoted strings."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return {}, ""
    return parse_frontmatter_text(text)


def parse_frontmatter_text(text):
    """`parse_frontmatter` over text already read (T-1079: a caller that read
    the file through a link-refusing descriptor parses the same bytes)."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    fm, body = {}, text[end + 4:].lstrip("\n")
    lines = text[4:end].splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", lines[i])
        if not m:
            i += 1
            continue
        k, v = m.group(1), m.group(2).strip()
        if v.startswith("[") and v.endswith("]"):
            fm[k] = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        elif v == "":
            items, j = [], i + 1
            while j < len(lines) and re.match(r"^\s+-\s+", lines[j]):
                items.append(re.sub(r"^\s+-\s+", "", lines[j]).strip().strip("'\""))
                j += 1
            if items:
                fm[k] = items
                i = j - 1
            else:
                fm[k] = ""
        else:
            fm[k] = v.strip("'\"")
        i += 1
    return fm, body


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def index_scalar(value):
    """(text, shape) for ONE frontmatter value on its way into the derived index.

    md is the SoT and it is hand-written, so any field can hold whatever shape the
    frontmatter parser yields — `feature: [gui]` is a list today, and a parser that
    grows mappings/numbers/bools/dates would yield those. sqlite3 binds only
    str/bytes/int/float/None, and it raises ProgrammingError — NOT IntegrityError —
    when it refuses, which is how one ticket used to kill the whole `prdt doctor`
    run before its first check (T-550).

    The rule is by CLASS, never by enumerating shapes: a str (or an absent value)
    passes through byte-identical; EVERY other shape is unusable, so the index cell
    becomes NULL and `shape` names the type for the caller's warning. Nothing is
    quietly coerced into a plausible string: `['gui']` sitting in the feature column
    would be a lie the seam checks then group by, and a NULL that a named warning
    accounts for is the honest derived value. Special-casing `list` here is exactly
    the fix T-550 rejects — the next shape would crash the same way."""
    if value is None or isinstance(value, str):
        return value, None
    return None, type(value).__name__


def index_list(value):
    """(list, shape) for ONE frontmatter value the row exposes as a SEQUENCE.

    T-565 C5. `deps`/`links` were declared the safe channel because the json
    encoder binds any shape into the index cell — true, and about the WRITE. The
    row is also the thing every consumer iterates, and `fm.get("deps") or []`
    handed them whatever the md held: `deps: T-500` (the bracketless form a human
    writes without thinking) arrives as the str "T-500", and `for d in
    t["deps"]` walks it one character at a time — five warnings about tickets
    named `T`, `-`, `5`, `0`, `0`, on the dependency graph that decides what is
    safe to close.

    Sibling of `index_scalar`, deliberately not a branch inside it: the rule
    there is "a str passes, every other shape is unusable", and it stays that
    way. Here the field's declared shape IS a list, so the rule is the list one:
      * absent/empty  → []
      * a list        → itself
      * a str         → a one-element list; the value is one dep, and the
                        brackets are notation, not meaning
      * anything else → [] plus a named problem — ONE reported problem instead
                        of N invented dependencies, which is the same trade
                        index_scalar makes with NULL."""
    if value is None or value == []:
        return [], None
    if isinstance(value, list):
        return value, None
    if isinstance(value, str):
        return [value], None
    return [], type(value).__name__


def _index_fields(fm, keys, problems):
    """Read `keys` off frontmatter through index_scalar, appending one problem line
    per unusable value. Shared by both row builders so the two write paths into
    index.db answer a bad shape identically."""
    out = {}
    for k in keys:
        text, shape = index_scalar(fm.get(k))
        if shape:
            problems.append(f"{k}: {shape} value is not a string — dropped from the index "
                            f"(frontmatter values are plain strings; lists belong in `deps`/`links`)")
        out[k] = text
    return out


TICKET_INDEX_FIELDS = ("id", "slug", "type", "status", "assignee", "feature", "created", "closed")


# ── T-1104: the docs-layout seam — every docs/ path reader goes through here ──
# Design: docs/artifacts/v1.14/product-first-docs-layout.html (fixed-path table,
# layer table, ② ③ ⑤ ⑧ = A). Two layouts:
#   product (To-Be) — `docs/_shared/` exists: product rows (prd · tickets ·
#     artifacts · DEPLOY.md · wiki/retro--v*.md) live in `docs/<product>/`,
#     everything else in `docs/_shared/`. First product = config `slug`.
#   legacy (As-Is) — no `docs/_shared/`: an unmigrated single-product project,
#     read AND written exactly as before (⑤ A). Every helper below returns the
#     pre-v1.14 path in this layout, so its byte output is unchanged.
DOCS_SHARED = "_shared"


# Fixed-path table rows that live in the product folder; the rest go to _shared.
PRODUCT_DOCS_KINDS = ("prd", "tickets", "artifacts", "DEPLOY.md")


def docs_layout(root):
    """"product" when `docs/_shared/` is a real dir, else "legacy"."""
    if not root:
        return "legacy"
    d = Path(root) / "docs" / DOCS_SHARED
    return "product" if d.is_dir() and not d.is_symlink() else "legacy"


def project_products(root):
    """Products in the product layout, first product (config `slug`) first, then
    config `products[].name`, then any other `docs/<kebab>/` dir holding `prd/`
    or `tickets/`. [] in the legacy layout."""
    if docs_layout(root) != "product":
        return []
    root = Path(root)
    cfg = read_json(root / ".prdt" / "config.json") or {}
    out = []

    def add(n):
        if isinstance(n, str) and LINE_NAME_RE.match(n) and n not in out:
            out.append(n)
    slug0 = cfg.get("slug") if isinstance(cfg, dict) else None
    # The first product is the folder init scaffolded: `product_dir_name(slug)`.
    add(product_dir_name(slug0) if isinstance(slug0, str) and slug0 else None)
    prods = cfg.get("products") if isinstance(cfg, dict) else None
    for e in (prods if isinstance(prods, list) else []):
        add(e.get("name") if isinstance(e, dict) else None)
    try:
        dirs = sorted((root / "docs").iterdir())
    except OSError:
        dirs = []
    for d in dirs:
        if d.is_dir() and not d.is_symlink() and not d.name.startswith(("_", ".")) \
                and ((d / "prd").is_dir() or (d / "tickets").is_dir()):
            add(d.name)
    return out


def _product_from_docs_path(root, p, prods):
    """`docs/<product>/…` (relative or absolute under root) → product, else None."""
    if not isinstance(p, (str, Path)) or not str(p):
        return None
    s = str(p).split("#", 1)[0]
    pp = Path(s)
    if pp.is_absolute():
        try:
            pp = pp.relative_to(Path(root))
        except ValueError:
            return None
    parts = pp.parts
    if len(parts) >= 2 and parts[0] == "docs" and parts[1] in prods:
        return parts[1]
    return None


def current_product(root, hint=None):
    """The product in focus (design layer table, 현재 제품): the `docs/<p>/` of
    `hint` (a `[ctx].prd_path` or a ticket file path) → po-state
    `current_task.product` → the first product. None in the legacy layout."""
    prods = project_products(root)
    if not prods:
        return None
    p = _product_from_docs_path(root, hint, prods)
    if p:
        return p
    st = read_json(Path(root) / ".prdt" / "po-state.json") or {}
    ct = st.get("current_task") if isinstance(st, dict) else None
    if isinstance(ct, dict):
        if ct.get("product") in prods:
            return ct["product"]
        p = _product_from_docs_path(root, ct.get("path"), prods)
        if p:
            return p
    return prods[0]


def product_docs_dir(root, product=None):
    """`docs/<product>/` (product layout) or `docs/` (legacy)."""
    root = Path(root)
    if docs_layout(root) != "product":
        return root / "docs"
    return root / "docs" / (product or current_product(root) or DOCS_SHARED)


def shared_docs_dir(root):
    """`docs/_shared/` (product layout) or `docs/` (legacy)."""
    root = Path(root)
    return root / "docs" / DOCS_SHARED if docs_layout(root) == "product" else root / "docs"


def docs_path(root, kind, product=None):
    """Home of one fixed-path row: `kind` is the first segment under docs/ in
    the As-Is layout (`prd`, `tickets`, `wiki`, `design.md`, `po`, …)."""
    if kind in PRODUCT_DOCS_KINDS:
        return product_docs_dir(root, product) / kind
    return shared_docs_dir(root) / kind


def product_docs_dirs(root, kind):
    """[(product|None, dir)] of `kind` across every product, first product
    first; legacy → [(None, docs/<kind>)]. The product layout adds the shared
    backlog (`docs/_shared/tickets/`, ① A) for `tickets` as product None."""
    prods = project_products(root)
    if not prods:
        return [(None, Path(root) / "docs" / kind)]
    out = [(p, Path(root) / "docs" / p / kind) for p in prods]
    if kind == "tickets":
        out.append((None, shared_docs_dir(root) / "tickets"))
    return out


class DocsLayoutError(ValueError):
    """A product-layout project that names no product, asked for a product path."""


def _need_product(root, rel, product=None):
    """The product a product-row path maps into; no product in a product layout
    → DocsLayoutError (never a `docs/None/…` path)."""
    p = product or current_product(root)
    if not p:
        raise DocsLayoutError(
            f"cannot map {rel}: docs/_shared/ exists but the project names no product — "
            f"set `slug` in .prdt/config.json, or create docs/<product>/prd or docs/<product>/tickets")
    return p


def resolve_docs_ref(root, rel, product=None):
    """③ A: an As-Is `docs/…` path (as written inside a closed PRD, a ticket, a
    wiki page) → its To-Be file. Files stay byte-identical; the READER maps.
    `docs/{prd,tickets,artifacts}/X` and `docs/DEPLOY.md` → `docs/<p>/…`;
    `docs/{wiki,features}/X` → product file when it exists, else `_shared`;
    any other `docs/X` → `docs/_shared/X`. A path already in the new layout,
    a non-docs path, or the legacy layout → unchanged. A product-row path in a
    product layout with no product → DocsLayoutError."""
    if not isinstance(rel, str) or docs_layout(root) != "product":
        return rel
    parts = rel.split("/")
    if len(parts) < 2 or parts[0] != "docs":
        return rel
    head = parts[1]
    prods = project_products(root)
    if head == DOCS_SHARED or head in prods:
        return rel
    tail = "/".join(parts[1:])
    if head in PRODUCT_DOCS_KINDS or (head == "wiki" and len(parts) == 3
                                      and parts[2].startswith("retro--v")):
        return f"docs/{_need_product(root, rel, product)}/{tail}"
    if head in ("wiki", "features"):
        p = product or current_product(root)
        if p and (Path(root) / "docs" / p / tail).exists():
            return f"docs/{p}/{tail}"
    return f"docs/{DOCS_SHARED}/{tail}"


def scan_tickets(root):
    """Yield (dict, path, problems[]) per ticket md. Enum violations reported, row still listed.

    Scalar fields are str-or-None by the time they leave here (T-550): the index
    write, and every check reading these rows, gets one shape contract instead of
    whatever the md happened to hold."""
    # T-1104: product layout → every `docs/<p>/tickets/` plus the shared backlog;
    # a non-first product's row carries `<p>/<version>` (⑧ A: prefix only
    # outside its own folder). Legacy → `docs/tickets/` as before.
    homes = product_docs_dirs(root, "tickets")
    first = homes[0][0]
    lines = set(project_line_names(root)) if first is None else set()
    for prod, tdir in homes:
        if tdir.is_dir():
            yield from _scan_ticket_dir(root, tdir, lines,
                                        prod if prod not in (None, first) else None)


def _scan_ticket_dir(root, tdir, lines, prefix):
    # `Path.relative_to` walks the parents per file (~40% of this scan on ~1300 tickets);
    # a prefix slice is the same string, `relative_to` stays as the fallback.
    root_prefix = str(root) + os.sep
    for p in sorted(tdir.rglob("T-*.md")):
        fm, _ = parse_frontmatter(p)
        version = p.parent.name
        # An added line's ticket sits in `docs/tickets/<line>/<version>/` — its
        # row carries the line id `<line>/<version>` (T-951 = A).
        if lines and p.parent.parent.parent == tdir and p.parent.parent.name in lines:
            version = f"{p.parent.parent.name}/{version}"
        if prefix:
            version = f"{prefix}/{version}"
        problems = []
        f = _index_fields(fm, TICKET_INDEX_FIELDS, problems)
        deps, deps_shape = index_list(fm.get("deps"))
        if deps_shape:
            problems.append(f"deps: {deps_shape} value is not a list or a ticket id — "
                            f"dropped (write `deps: [T-500, T-501]`, or `deps: T-500`)")
        # `id` keys the row, so it falls back to the filename the way it always has
        # — the dropped shape is already reported above, and a NULL primary key
        # would cost the row its identity on top of its value.
        # T-1104 (T-1102 = A): a shared ticket lives in the shipping product's
        # version dir and names the other product(s) in `also:`.
        also, also_shape = index_list(fm.get("also"))
        if also_shape:
            problems.append(f"also: {also_shape} value is not a list or a product name — "
                            f"dropped (write `also: [other-product]`)")
        also = [str(a) for a in also if isinstance(a, str) and a]
        row = {"id": f["id"] or p.stem, "slug": f["slug"], "type": f["type"],
               "status": f["status"], "assignee": norm_assignee(f["assignee"]),
               "feature": f["feature"], "deps": deps, "also": also,
               "created": f["created"], "closed": f["closed"],
               "version": version, "path": (sp[len(root_prefix):] if (sp := str(p)).startswith(root_prefix) else str(p.relative_to(root)))}
        if row["type"] not in TICKET_TYPES:
            problems.append(f"type '{row['type']}' not in {'/'.join(TICKET_TYPES)}")
        if row["status"] not in TICKET_STATUS:
            problems.append(f"status '{row['status']}' not in {'/'.join(TICKET_STATUS)}")
        if row["id"] != p.stem:
            problems.append(f"frontmatter id {row['id']} != filename {p.stem}")
        yield row, p, problems


# T-1215: top-level `docs/` names the layout owns — a product folder never takes one
# (`docs/qa/` beside `docs/_shared/` read as a half-moved layout). KEEP the five
# `_product_dir_name` copies (statusline · hooks) in lockstep with this tuple.
PRODUCT_RESERVED_NAMES = ("prd", "tickets", "artifacts", "wiki", "features", "archive", "po", "designer", "developer", "qa")


def product_dir_name(slug):
    """A config `slug` as the `docs/<kebab>/` folder name (first product, T-1104):
    lower-case, runs of non-[a-z0-9] → one hyphen; a result that is not a legal
    product name (empty · `v<digit>…` · `backlog`) → `product`; a layout-reserved
    name (`PRODUCT_RESERVED_NAMES`) → `<name>-product`."""
    k = re.sub(r"[^a-z0-9]+", "-", str(slug or "").lower()).strip("-")
    if not LINE_NAME_RE.match(k):
        return "product"
    return f"{k}-product" if k in PRODUCT_RESERVED_NAMES else k


VERSION_ID_RE = re.compile(r"^v\d+(?:\.\d+){0,2}$", re.ASCII)


def is_version_path_id(v):
    """T-1082 — True for a value po-state may hand to a path: a version id
    (`v<N>[.<m>[.<p>]]`, matched whole — no trailing newline) or `backlog`."""
    return isinstance(v, str) and (v == "backlog" or VERSION_ID_RE.fullmatch(v) is not None)


# `(?![\d.])` rather than `\b`: after the greedy component run, a heading like
# `## v1.x` is not a version heading at all (with `\b` it read as `v1`).
PRD_VERSION_HEADING_RE = re.compile(r"^## (v\d+(?:\.\d+){0,2})(?![\d.])", re.ASCII)


LINE_NAME_RE = re.compile(r"^(?!v[0-9])(?!backlog\Z)[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def _products_key(d):
    """The key a config / po-state dict keeps its per-product entries under:
    `products`, else the pre-v1.14 `lines` (T-1108 ⑦, read once and migrated)."""
    return "products" if "products" in d or "lines" not in d else "lines"


def _line_config_entries(root):
    cfg = read_json(Path(root) / ".prdt" / "config.json") if root else None
    if not isinstance(cfg, dict):
        return None, None
    raw = cfg.get(_products_key(cfg))
    return cfg.get("slug"), (raw if isinstance(raw, list) else ([] if raw is None else raw))


def project_lines(root):
    """Added release lines in declaration order — config entries whose `name` is
    legal, unique and not the slug; `line_config_warnings` names the rest.
    [] = a single-line project."""
    slug, raw = _line_config_entries(root)
    out, seen = [], set()
    for e in (raw if isinstance(raw, list) else []):
        name = e.get("name") if isinstance(e, dict) else None
        if (isinstance(name, str) and LINE_NAME_RE.match(name) and name not in PRODUCT_RESERVED_NAMES
                and name not in seen and name != slug):
            seen.add(name)
            out.append(e)
    return out


def project_line_names(root):
    return [e["name"] for e in project_lines(root)]


def split_line_id(vid):
    """`ntf-archive/v1.2` → ("ntf-archive", "v1.2"); `v1.2` → (None, "v1.2")."""
    if isinstance(vid, str) and "/" in vid:
        line, _, rest = vid.partition("/")
        if LINE_NAME_RE.match(line):
            return line, rest
    return None, vid


def join_line_id(line, vid):
    return f"{line}/{vid}" if line else vid


def line_state(st, line=None):
    """(stage, version id, checks) of one line in po-state: the top-level fields
    for the first product (`line` None), `products.<product>` for an added one — whose
    version comes back prefixed `<line>/`."""
    if not isinstance(st, dict):
        return None, None, None
    src = st
    if line is not None:
        ls = st.get(_products_key(st))
        src = ls.get(line) if isinstance(ls, dict) else None
        if not isinstance(src, dict):
            return None, None, None
    v = src.get("version")
    v = v.strip() if isinstance(v, str) and v.strip() else None
    # T-1082: a malformed version is no version here (po_state_warnings names it).
    if v is not None and not is_version_path_id(v):
        v = None
    return src.get("stage"), (join_line_id(line, v) if v else None), src.get("checks")


def _line_st(st, line):
    """A po-state view of one line shaped like the top level (`version` bare),
    for the single-line readers that take `st`. The home line gets `st` itself."""
    if line is None:
        return st
    stage, vid, checks = line_state(st, line)
    return {"stage": stage, "version": split_line_id(vid)[1] if vid else None, "checks": checks}


def _prd_line_headings(text, lines):
    """[(line|None, version, line_no)] for every version heading: home `## v…`
    plus `## <line> v…` for each DECLARED added line, fenced blocks excluded."""
    if not lines:
        return [(None, v, ln) for v, ln in _prd_version_headings(text)]
    alt = "|".join(re.escape(x) for x in lines)
    rx = re.compile(rf"^## (?:({alt}) )?(v\d+(?:\.\d+){{0,2}})(?![\d.])", re.ASCII)
    out = []
    for i, line in _md_structural_lines(text):
        m = rx.match(line)
        if m:
            out.append((m.group(1), m.group(2), i))
    return out


def _version_id_canon(v):
    """Canonical comparable form of a version id — trailing zero components
    dropped, so `v1` ≡ `v1.0` ≡ `v1.0.0` (user decision above). None when `v`
    is not a version id.

    Tuple order over these canonical forms IS version order, so one function
    answers both questions the check asks (same round? / which round is
    newer?). Dropping trailing zeros can never invert an order: two ids compare
    equal only when one is the other padded with zeros, which is exactly the
    case this collapses; whenever one canonical tuple is a strict prefix of the
    other, the longer one ends in a non-zero component and is genuinely newer.

    Distinct from `_version_key`, which parses a release TAG (leading `v`
    optional, trailing text tolerated) and is the ordering basis for the tag
    and release-notes checks. Left untouched on purpose: padding semantics are
    a PRD-layout question, and changing a shared helper to answer it would move
    behavior in checks this ticket never measured."""
    m = VERSION_ID_RE.match((v or "").strip())
    if not m:
        return None
    parts = [int(x) for x in m.group(0)[1:].split(".")]
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def _md_structural_lines(text):
    """[(line_no, line)] 1-based, with fenced code blocks dropped.

    Markdown inside ``` … ``` is quoted text, not structure. Measured cost of
    ignoring that (2026-09-22): this project's own PRD sections quote shell, so
    a `# comment` in a ```sh block read as an H1 — and under the pre-T-657 rule
    a single H1 anywhere waived every other shape rule in the file. The same
    blindness would now invent a finding rather than hide one: a PRD section
    that quotes `## v1.2` in a fence would be reported as a closed section
    sitting in the wrong file."""
    out = []
    fence = None
    for i, line in enumerate(text.split("\n"), 1):
        m = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if m:
            tok = m.group(1)[0]
            if fence is None:
                fence = tok
                continue
            if tok == fence:
                fence = None
            continue
        if fence is None:
            out.append((i, line))
    return out


def _prd_version_headings(text):
    """[(version, line_no)] for every `## v<N>[.<m>…]` heading in `text`, 1-based,
    fenced blocks excluded."""
    out = []
    for i, line in _md_structural_lines(text):
        m = PRD_VERSION_HEADING_RE.match(line)
        if m:
            out.append((m.group(1), i))
    return out


def _prd_open_section(root, st, line=None):
    """(version_id_as_written, [(line_no, line), ...]) for the ONE open `## v`
    section's BODY (heading line excluded, next `## v` heading excluded),
    fenced blocks already dropped. Same "which section is open" resolution
    `prd_layout_warnings` / `version_set_from_disk` use — po-state.json's
    `version` when it names a heading actually in the file, the first `## v`
    heading as a weak fallback otherwise (matches `version_set_from_disk`'s
    posture: a missing/stale po-state should not blind every open-section
    check at once). (None, []) when PRD.md is unreadable or carries no `## v`
    heading at all — callers stay silent rather than inventing a section
    (T-657's own posture: `prd_layout_warnings` is the check that judges the
    tree shape itself)."""
    root = Path(root)
    prd_md = docs_path(root, "prd") / "PRD.md"
    try:
        text = prd_md.read_text(encoding="utf-8")
    except OSError:
        return None, []
    lines = _md_structural_lines(text)
    all_heads = _prd_line_headings(text, project_line_names(root))
    heads = [(v, ln) for l, v, ln in all_heads if l == line]
    if not heads:
        return None, []
    st = _line_st(st, line)
    pv = st.get("version") if isinstance(st, dict) else None
    open_key = _version_id_canon(pv) if isinstance(pv, str) and pv.strip() else None
    chosen = next((h for h in heads if open_key is not None and _version_id_canon(h[0]) == open_key),
                  None)
    if chosen is None:
        if open_key is not None:
            return None, []  # po-state names a round PRD.md does not carry open
        chosen = heads[0]
    version, start_ln = chosen
    later = sorted(ln for _, _, ln in all_heads if ln > start_ln)
    end_ln = later[0] if later else None
    body = [(ln, line) for ln, line in lines
            if ln > start_ln and (end_ln is None or ln < end_ln)]
    return version, body


DISPATCH_STALE_HOURS = 4     # = the gate's STALE_H and the statusline's STALE_HOURS


DISPATCH_IDLE_MIN = 30       # = the gate's IDLE_MIN


DISPATCH_GRACE_S = 300       # = the gate's GRACE_S


def _dispatch_transcript(data):
    t = data.get("transcript")
    if isinstance(t, str) and t.startswith("/"):
        return t
    aid = data.get("agent_id")
    if not (isinstance(aid, str) and re.match(r"^[A-Za-z0-9_-]+$", aid)):
        return None
    cfg = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
    hits = sorted(Path(cfg, "projects").glob(f"*/*/subagents/agent-{aid}.jsonl")) if Path(cfg, "projects").is_dir() else []
    return str(hits[0]) if hits else None


def _dispatch_state(data, now):
    """The gate's verdict for one marker: `live` (counted) or why it is not."""
    if data.get("stopped_at"):
        return "stopped"
    try:
        since = datetime.strptime(data.get("since") or "", "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return "no-since"
    age = (now - since).total_seconds()
    if age >= DISPATCH_STALE_HOURS * 3600:
        return f"stale (since > {DISPATCH_STALE_HOURS} h)"
    t = _dispatch_transcript(data)
    if not t or not os.path.isfile(t):
        return "live (starting, no transcript yet)" if age < DISPATCH_GRACE_S else "phantom (no worker transcript)"
    try:
        with open(t, "rb") as f:
            f.seek(max(0, os.path.getsize(t) - 4000))
            last = f.read().decode("utf-8", "replace").rstrip("\n").split("\n")[-1]
        idle = now.timestamp() - os.path.getmtime(t)
    except OSError:
        return "live (starting, no transcript yet)" if age < DISPATCH_GRACE_S else "phantom (transcript unreadable)"
    if '"model":"<synthetic>"' in last:
        return "phantom (harness ended the run: session limit / interrupt)"
    if idle > DISPATCH_IDLE_MIN * 60:
        return f"phantom (transcript idle {int(idle // 60)} min > {DISPATCH_IDLE_MIN})"
    return "live"


def _ticket_num_key(tid):
    m = re.search(r"(\d+)$", tid or "")
    return (int(m.group(1)) if m else math.inf, tid or "")


def _schedule_in_flight(root):
    """Ticket ids this project has a LIVE dispatch marker for — the dispatch
    gate's liveness rule (`_dispatch_state`, T-695), read-only."""
    d = prdt_home() / "run" / "dispatches"
    hits = {}  # ticket id -> persona of its live dispatch (T-1145: `working T-1 (developer)`)
    if not d.is_dir():
        return hits
    now = datetime.now(timezone.utc)
    here = Path(root).resolve()
    for f in sorted(d.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue
            pr = data.get("project_root")
            tid = data.get("ticket_id")
            if not (isinstance(pr, str) and isinstance(tid, str)) or Path(pr).resolve() != here:
                continue
        except Exception:
            continue
        if _dispatch_state(data, now).startswith("live"):
            hits.setdefault(tid, data.get("persona") if isinstance(data.get("persona"), str) else None)
    return hits


def _schedule_tickets(root):
    """{id: (row, path)} over every ticket md — first file wins per id."""
    tickets = {}
    for row, p, _probs in scan_tickets(Path(root)):
        tickets.setdefault(row["id"], (row, p))
    return tickets


# ── T-1145 (v1.14 `lanes`): one lane per PRD 합격선 row ──────────────────────
# Design SoT: docs/artifacts/v1.14/lanes-design.html, rules R1–R3 + R6. The ONE
# lane computation: `prdt schedule` / `--json` render from it, the dispatch gate
# reads it, and the statusline (T-1147) and viewer home read `prdt schedule
# --json` `lanes` — nobody re-implements it. R1's gate-ticket rule is a Python
# twin of `findGateTicket` (packages/viewer/lib/home-graph.mjs); the parity
# test packages/core/test/scripts/prdt-lanes-gate-parity.test.ts pins the two.
LANE_GATE_PATH_RE = re.compile(r"`(docs/[^`\s]+)`")


# R11 (T-1184): the name is everything between `레인 ` and the first ` ·` — words included.
LANE_NAME_RE = re.compile(r"^레인\s+([^\s·].*?)\s*·")


# R7/R11: the 자투리 lane's fixed name (statusline label `statusline.lane.besteffort`).
LANE_BESTEFFORT_NAME = "자투리"


LANE_HEADING_RE = re.compile(r"^###\s+합격선(\s|$)")


def _lane_gate_rows(root, st, line):
    """[(name, gate_path_or_None, named)] — one per 합격선 row of the open PRD
    section's `### 합격선` table, in table order (R1); `named` False = the
    A · B · C fallback (R11)."""
    _v, body = _prd_open_section(root, st, line)
    rows, inside = [], False
    for _ln, text in body:
        if text.startswith("#"):
            inside = bool(LANE_HEADING_RE.match(text))
            continue
        if not inside or not text.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in text.strip().strip("|").split("|")]
        if len(cells) < 2 or cells[0].replace("**", "").strip() != "합격선":
            continue
        m = LANE_NAME_RE.match(cells[1].replace("**", "").strip())
        pm = LANE_GATE_PATH_RE.search(text)
        rows.append((m.group(1) if m else None, pm.group(1) if pm else None))
    return [(n or chr(65 + i), g, bool(n)) for i, (n, g) in enumerate(rows)]


def _lane_longest_ending_at(ids, preds):
    """{id: node count of the longest dep chain ending at it}, cycle-safe —
    twin of home-graph.mjs `longestEndingAt`."""
    memo, stack, idset = {}, set(), set(ids)

    def walk(i):
        if i in memo:
            return memo[i]
        if i in stack:
            return 0
        stack.add(i)
        n = 1
        for p_ in sorted((x for x in preds.get(i, []) if x in idset), key=_ticket_num_key):
            n = max(n, walk(p_) + 1)
        stack.discard(i)
        memo[i] = n
        return n
    for i in ids:
        walk(i)
    return memo


def _lane_find_gate_ticket(tickets, version, paths, bodies):
    """Twin of `findGateTicket`: among the current version's open+done tickets
    whose body names a gate path, the longest dep chain wins, then the higher number."""
    paths = [x for x in paths if x]
    if not paths:
        return None
    live = [t for t, (r, _p) in tickets.items() if r["status"] in ("open", "done") and r["version"] == version]
    hits = [t for t in live if any(g in bodies(t) for g in paths)]
    if not hits:
        return None
    memo = _lane_longest_ending_at(live, {t: tickets[t][0]["deps"] for t in live})
    return max(hits, key=lambda t: (memo.get(t, 0), _ticket_num_key(t)))


def _lane_fill(lane, ids, tickets, in_flight, pos):
    """R3 cells of one lane over its member `ids`: counts over this version's
    tickets, working, blockers, and the queue — `ready` in `prdt schedule`
    order (`pos`: id -> row position; R12), `next` = `ready` while nothing runs."""
    version = lane.pop("_version")
    ids = sorted(ids, key=_ticket_num_key)
    here = [t for t in ids if tickets[t][0]["version"] == version]
    lane["tickets"] = ids
    lane["total"] = len(here)
    lane["done"] = sum(1 for t in here if tickets[t][0]["status"] == "done")
    lane["finished"] = lane["total"] > 0 and lane["done"] == lane["total"]
    lane["working"] = [t for t in ids if t in in_flight]
    lane["working_owner"] = {t: in_flight[t] for t in lane["working"]}
    for t in ids:
        r = tickets[t][0]
        if r["status"] != "open":
            continue
        if r["type"] == "decision":
            lane["blockers"].append({"id": t, "kind": "decision"})
        elif r["assignee"] == "user":
            lane["blockers"].append({"id": t, "kind": "request"})

    def satisfied(d):
        return d not in tickets or tickets[d][0]["status"] in ("done", "dropped")
    # T-1158 = B: `ready` = R3's 다음 criteria, shown even while the lane has work running.
    # `next` stays the dispatch-gate-facing value (T-1147): only when nothing is running.
    ready = [t for t in ids if tickets[t][0]["status"] == "open"
             and tickets[t][0]["type"] != "decision" and tickets[t][0]["assignee"] != "user"
             and t not in in_flight and all(satisfied(d) for d in tickets[t][0]["deps"])]
    lane["ready"] = sorted(ready, key=lambda t: (pos.get(t, math.inf), _ticket_num_key(t)))
    lane["ready_owner"] = {t: tickets[t][0]["assignee"] for t in lane["ready"]}
    if not lane["working"]:
        lane["next"], lane["next_owner"] = list(lane["ready"]), dict(lane["ready_owner"])


def _lane_new(name, gpath, named, version, besteffort=False):
    return {"name": name, "gate_path": gpath, "gate_ticket": None, "linked": besteffort, "done": 0,
            "total": 0, "finished": False, "tickets": [], "working": [], "working_owner": {},
            "next": [], "next_owner": {}, "ready": [], "ready_owner": {}, "blockers": [], "warning": None,
            "unnamed": not named, "besteffort": besteffort, "_version": version}


def compute_lanes(root, tickets, st, line, version, in_flight, order=None):
    """[lane dict] — one per 합격선 row, then the 자투리 lane; [] when the PRD
    has no 합격선 row (R1–R3, R7–R12). `order` = ticket ids in `prdt schedule`
    row order (the lane queue order, R12); None → ticket-number order.
    {name, gate_path, gate_ticket, linked, done, total, finished, tickets,
    working, next, ready, blockers:[{id, kind: decision|request}], warning,
    unnamed, besteffort}. A ticket belongs to ONE lane: the earliest row whose
    gate ticket's deps closure holds it (R8); this version's open+done tickets
    in no row's closure are the 자투리 lane (R7), present only when non-empty."""
    rows = _lane_gate_rows(root, st, line)
    if not rows:
        return []
    pos = {t: i for i, t in enumerate(order or [])}
    cache = {}

    def body(t):
        if t not in cache:
            cache[t] = parse_frontmatter(tickets[t][1])[1] or ""
        return cache[t]
    lanes, taken, claimed = [], set(), set()
    for name, gpath, named in rows:
        lane = _lane_new(name, gpath, named, version)
        lanes.append(lane)
        members = []
        if gpath:
            alt = gpath
            try:
                alt = resolve_docs_ref(root, gpath, line) or gpath
            except Exception:
                pass
            gate = _lane_find_gate_ticket(tickets, version, [gpath, alt], body)
            if gate is not None and gate in taken:
                lane["warning"] = (f"lane {name}: its gate path reaches {gate}, which an earlier lane already "
                                   f"holds — not linked")
            elif gate is not None:
                taken.add(gate)
                lane["gate_ticket"], lane["linked"] = gate, True
                seen, stack = set(), [gate]
                while stack:
                    t = stack.pop()
                    if t in seen or t not in tickets or tickets[t][0]["status"] == "dropped":
                        continue
                    seen.add(t)
                    stack.extend(tickets[t][0]["deps"])
                members = [t for t in seen if t not in claimed]
                claimed |= seen
        _lane_fill(lane, members, tickets, in_flight, pos)
    rest = [t for t, (r, _p) in tickets.items()
            if r["version"] == version and r["status"] in ("open", "done") and t not in claimed]
    if rest:
        lane = _lane_new(LANE_BESTEFFORT_NAME, None, True, version, besteffort=True)
        _lane_fill(lane, rest, tickets, in_flight, pos)
        lanes.append(lane)
    return lanes


def lanes_for(root, line=None):
    """[lane dict] of one product (`line` None = the home product) — the statusline's read.
    Same inputs `compute_schedule` hands `compute_lanes`, so `prdt schedule --json`'s `lanes`
    and this are one computation (T-1184: the schedule itself, so a lane queue has its order)."""
    return compute_schedule(Path(root), line=line)["lanes"]


# ── T-1184: the schedule rank order lives here too, so a lane's queue (R12) is
# `prdt schedule`'s order for every reader (statusline · viewer · CLI). Moved
# verbatim from `prdt` (T-772 critical path).
# Item-address key, shared by the H4 form (P1 #2) and `prd_item`'s dst half
# (E4) — design §2.4 "항목 주소": same regex as the feature vocab key.
PRD_ITEM_KEY_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PRD_H4_RE = re.compile(r"^#### (.+)$")
# A ticket's src half: `prd_item: <version>#<key>` (T-663 §「항목 주소」).
PRD_ITEM_RE = re.compile(r"^((?:[a-z0-9]+(?:-[a-z0-9]+)*/)?v\d+(?:\.\d+){0,2})#([a-z0-9]+(?:-[a-z0-9]+)*)$", re.ASCII)


def _prd_h4_items(lines):
    """[(line_no, key_or_None, heading_content)] for every `#### ` line in
    `lines` ([(line_no, line), ...]). `key_or_None` is the parsed item key
    when the heading takes item-address form `#### <key> — <label>` (T-663
    §「항목 주소」: split on the FIRST ` — `, the left side read as the key,
    `^[a-z0-9]+(-[a-z0-9]+)*$`); None for any other `#### ` shape (a numbered
    `#### 1. …` heading, or no ` — ` separator at all) — P1 grades that as an
    address-less item, E4's key harvest just skips it."""
    out = []
    for ln, line in lines:
        m = PRD_H4_RE.match(line)
        if not m:
            continue
        content = m.group(1)
        key = None
        if " — " in content:
            head, _label = content.split(" — ", 1)
            if PRD_ITEM_KEY_RE.match(head):
                key = head
        out.append((ln, key, content))
    return out


def _resource_project_slug(root):
    if not root:
        return None
    cfg = read_json(Path(root) / ".prdt" / "config.json") or {}
    slug = cfg.get("slug")
    return slug if isinstance(slug, str) and slug else None


SCHEDULE_DISPATCHABLE = ("designer", "developer", "qa")


def compute_schedule(root, tickets=None, line=None):
    """The schedule as one dict (the `--json` shape; text renders from it).
    `tickets` = a `_schedule_tickets()` result the caller already holds."""
    import graphlib
    root = Path(root)
    st = read_json(root / ".prdt" / "po-state.json") or {}
    version = line_state(st, line)[1]
    if tickets is None:
        tickets = _schedule_tickets(root)
    out = {"version": version, "cycle": None, "critical_path": [], "cp_length": 0,
           "rows": [], "missing_deps": []}
    in_flight = _schedule_in_flight(root)
    # T-1184 R12: filled once the rows are ranked (a lane queue is this order); the key
    # is placed here so the --json key order is unchanged.
    out["lanes"] = []
    if project_line_names(root):
        out["product"] = line or _resource_project_slug(root)

    # node set: current version's open tickets, then open deps wherever they live
    nodes, stack = {}, [t for t, (r, _) in tickets.items()
                        if r["status"] == "open" and r["version"] == version]
    while stack:
        tid = stack.pop()
        if tid in nodes:
            continue
        nodes[tid] = tickets[tid]
        for d in nodes[tid][0]["deps"]:
            if d not in tickets:
                out["missing_deps"].append({"ticket": tid, "dep": d})
            elif tickets[d][0]["status"] == "open" and d not in nodes:
                stack.append(d)
    out["missing_deps"].sort(key=lambda m: (_ticket_num_key(m["ticket"]), _ticket_num_key(m["dep"])))
    preds = {t: sorted({d for d in r["deps"] if d in nodes and d != t} | ({t} if t in r["deps"] else set()))
             for t, (r, _) in nodes.items()}

    ts = graphlib.TopologicalSorter(preds)
    try:
        order = list(ts.static_order())
    except graphlib.CycleError as e:
        out["cycle"] = list(e.args[1]) if len(e.args) > 1 else []
        out["lanes"] = compute_lanes(root, tickets, st, line, version, in_flight)
        return out

    succ = {t: [] for t in nodes}
    for t, ps in preds.items():
        for p_ in ps:
            succ[p_].append(t)
    es = {}
    for t in order:
        es[t] = max((es[p_] + 1 for p_ in preds[t]), default=0)
    length = max(es.values(), default=-1) + 1
    ls = {}
    for t in reversed(order):
        ls[t] = min((ls[s] - 1 for s in succ[t]), default=length - 1)
    below = {}
    for t in reversed(order):
        acc = set()
        for s in succ[t]:
            acc.add(s)
            acc |= below[s]
        below[t] = acc

    h4 = {}
    open_v, body = _prd_open_section(root, st, line)
    if open_v is not None:
        for i, (_ln, key, _c) in enumerate(k for k in _prd_h4_items(body) if k[1]):
            h4.setdefault(key, i)
    open_vkey = _version_id_canon(open_v) if open_v else None

    rows = []
    for t, (r, p) in nodes.items():
        fm, _ = parse_frontmatter(p)
        prd_item = fm.get("prd_item") if isinstance(fm.get("prd_item"), str) else None
        m = PRD_ITEM_RE.match(prd_item.strip()) if prd_item else None
        m_line, m_ver = split_line_id(m.group(1)) if m else (None, None)
        prd_order = (h4.get(m.group(2)) if m and open_vkey is not None and m_line == line
                     and _version_id_canon(m_ver) == open_vkey else None)
        waits = sorted(preds[t], key=_ticket_num_key)
        if r["type"] == "decision" or r["assignee"] == "user":
            state = "waiting-user"
        elif r["assignee"] not in SCHEDULE_DISPATCHABLE:
            state = "po"
        elif t in in_flight:
            state = "in-flight"
        elif waits:
            state = "blocked"
        else:
            state = "ready"
        rows.append({"id": t, "slug": r["slug"], "version": r["version"], "type": r["type"],
                     "assignee": r["assignee"], "state": state, "slack": ls[t] - es[t],
                     "es": es[t], "ls": ls[t], "blocks": len(below[t]), "waits_on": waits,
                     "prd_item": prd_item, "prd_order": prd_order, "rank": None})

    def tie(row):
        return (-row["blocks"], row["prd_order"] if row["prd_order"] is not None else math.inf,
                _ticket_num_key(row["id"]))
    rows.sort(key=lambda row: (row["slack"], tie(row)))
    rank = 0
    for row in rows:
        if row["state"] == "ready":
            rank += 1
            row["rank"] = rank
    by_id = {row["id"]: row for row in rows}
    chain, cur = [], None
    while True:
        cand = [by_id[s] for s in (succ[cur] if cur else nodes)
                if by_id[s]["slack"] == 0 and es[s] == (es[cur] + 1 if cur else 0)]
        if not cand:
            break
        cur = min(cand, key=tie)["id"]
        chain.append(cur)
    out.update(critical_path=chain, cp_length=length if length > 0 else 0, rows=rows)
    out["lanes"] = compute_lanes(root, tickets, st, line, version, in_flight, [r["id"] for r in rows])
    if out["lanes"]:
        # T-1184 R10: the version total the lane sums must equal (text `total` line)
        here = [r for r, _p in tickets.values() if r["version"] == version and r["status"] in ("open", "done")]
        impl = [r for r in here if r["type"] == "impl"]
        out["totals"] = {"done": sum(r["status"] == "done" for r in here), "total": len(here),
                         "impl_done": sum(r["status"] == "done" for r in impl), "impl_total": len(impl)}
    return out
