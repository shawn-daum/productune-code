"""prdt_lanes — the ONE lane computation (T-1145 / T-1147, design R1–R3).

Everything `compute_lanes` needs and nothing else: the ticket scan, the open PRD
section's `### 합격선` read and the dispatch-marker liveness read. `prdt` imports
it (schedule · dispatch gate) and so does statusline-prdt.sh — python caches this
module's bytecode (a main script gets no .pyc), so a lane read no longer compiles
the whole CLI. Read-only: it writes nothing. Mirrored beside `prdt` by install.sh.
"""
import json, math, os, re, stat, subprocess
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


TICKET_INDEX_FIELDS = ("id", "slug", "type", "status", "assignee", "feature", "created", "closed", "lane", "gate")


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


def line_product(root, line=None):
    """T-1214: the product folder a per-product READER computes for — `line`
    (an added product), else the first product. Never `current_product`: what
    po-state is focused on does not change which product a computation is about.
    None in the legacy layout (`product_docs_dir` ignores it there)."""
    prods = project_products(root)
    if not prods:
        return None
    return line or prods[0]


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
               "lane": f["lane"], "gate": f["gate"],
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


def gate_lines(root):
    """Every line a gate runs over: the home product (None) first, then each added product."""
    return [None] + list(project_line_names(root))


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
    product = line_product(root, line)
    prd_md = docs_path(root, "prd", product) / "PRD.md"
    try:
        text = prd_md.read_text(encoding="utf-8")
    except OSError:
        return None, []
    lines = _md_structural_lines(text)
    all_heads = _prd_line_headings(text, project_line_names(root))
    # T-1214: product layout = one PRD.md per product, its sections headed `## v…`;
    # legacy = one shared PRD.md, an added line's sections headed `## <line> v…`.
    own = (None, line) if product else (line,)
    heads = [(v, ln) for l, v, ln in all_heads if l in own]
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


def _ts(v):
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _worker_past_stop(data):
    """T-1387: True when the worker transcript has an `assistant` record at least
    one second past `stopped_at` (second-truncated, so the final turn's own
    second never counts). SubagentStop stamps `stopped_at` even when another
    SubagentStop hook (prdt-return-check.sh) BLOCKS that stop and the worker runs
    on with no new SubagentStart — measured 2026-11-03, d-v116-t1094-dev2. A
    later SubagentStop re-stamps (prdt-post-dispatch.sh marker_stop), so a worker
    that truly finished has no assistant record past its last stamp.
    Reads the transcript tail backwards, stopping at the first record older
    than the stop; an mtime before the threshold skips the read."""
    stop = _ts(data.get("stopped_at") or "")
    t = _dispatch_transcript(data)
    if stop is None or not t:
        return False
    limit = stop + 1
    try:
        if os.path.getmtime(t) < limit:
            return False
        size = os.path.getsize(t)
        with open(t, "rb") as f:
            span = 65536
            while True:
                start = max(0, size - span)
                f.seek(start)
                lines = f.read(size - start).split(b"\n")
                if start > 0:
                    lines = lines[1:]  # first piece may be a partial line
                for raw in reversed(lines):
                    if not raw.strip():
                        continue
                    try:
                        rec = json.loads(raw)
                    except Exception:
                        continue
                    ts = _ts(rec.get("timestamp")) if isinstance(rec, dict) and isinstance(rec.get("timestamp"), str) else None
                    if ts is None:
                        continue
                    if ts < stop:
                        return False
                    if rec.get("type") == "assistant" and ts >= limit:
                        return True
                if start == 0:
                    return False
                span *= 4
    except OSError:
        return False


def _dispatch_state(data, now):
    """The gate's verdict for one marker: `live` (counted) or why it is not."""
    if data.get("stopped_at") and not _worker_past_stop(data):
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


def schedule_inputs_key(root, in_flight):
    """T-1427: a digest of everything `compute_schedule` reads, cheap to take
    (stats, no file bodies): every ticket md and PRD md (path · mtime_ns · size),
    `.prdt/po-state.json` · `.prdt/config.json`, and the live dispatch set
    `in_flight` (it carries the time-based liveness). Same key → same schedule."""
    import hashlib
    root = Path(root)
    h = hashlib.sha256()

    def add(p):
        try:
            st = os.stat(p)
            h.update(("%s\0%d\0%d\n" % (p, st.st_mtime_ns, st.st_size)).encode("utf-8", "replace"))
        except OSError:
            h.update(("%s\0-\n" % p).encode("utf-8", "replace"))

    add(root / ".prdt" / "po-state.json")
    add(root / ".prdt" / "config.json")
    dirs = [d for _p, d in product_docs_dirs(root, "tickets")] + [d for _p, d in product_docs_dirs(root, "prd")]
    dirs.append(shared_docs_dir(root) / "prd")
    for base in dirs:
        for d, sub, files in os.walk(base):
            sub.sort()
            for fn in sorted(files):
                if fn.endswith(".md"):
                    add(os.path.join(d, fn))
    h.update(json.dumps(sorted((k, v or "") for k, v in in_flight.items())).encode("utf-8"))
    return h.hexdigest()[:32]


# T-1427 (T-1390 acceptance 3): a ready row whose work already left the worker —
# its track is merging into its base, or its latest dispatch is a QA that passed.
TRACK_LAND_LOCK = "prdt-track-land.lock"   # = prdt_cli TRACK_LOCK
TRACK_MERGE_ARGS_RE = re.compile(r"\btrack\s+(?:merge|land)\b(.*)")
TICKET_ARG_RE = re.compile(r"(?<![A-Za-z0-9-])(T-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d{1,6})(?!\d)")


def _code_git_common_dir(root):
    cfg = read_json(Path(root) / ".prdt" / "config.json")
    d = cfg.get("code", {}).get("dir") if isinstance(cfg, dict) and isinstance(cfg.get("code"), dict) else None
    code = Path(root) / d.strip() if isinstance(d, str) and d.strip() and not os.path.isabs(d.strip()) \
        and ".." not in re.split(r"[/\\]+", d.strip()) else Path(root)
    g = code / ".git"
    if g.is_dir():
        return g
    try:   # a worktree checkout: `.git` is a file naming its gitdir, whose `commondir` names the shared one
        m = re.match(r"gitdir:\s*(.+)", g.read_text(encoding="utf-8").strip())
        gd = Path(m.group(1)) if m else None
        if gd is not None and not gd.is_absolute():
            gd = (code / gd).resolve()
        cd = (gd / "commondir").read_text(encoding="utf-8").strip() if gd is not None else ""
        return (gd / cd).resolve() if cd else gd
    except (OSError, AttributeError):
        return None


def _merging_ticket(root):
    """The ticket a live `prdt track merge` (or `land`) of this project's code repo
    is merging now — read from the merge lock's pid and that process's arguments —
    or None."""
    gd = _code_git_common_dir(root)
    if gd is None:
        return None
    try:
        pid = int((gd / TRACK_LAND_LOCK).read_text(encoding="utf-8").split()[0])
        if pid <= 0:
            return None
        os.kill(pid, 0)
        args = subprocess.run(["ps", "-p", str(pid), "-o", "args="], capture_output=True, text=True,
                              timeout=2).stdout
    except PermissionError:
        return None
    except Exception:
        return None
    m = TRACK_MERGE_ARGS_RE.search(args)
    t = TICKET_ARG_RE.search(m.group(1)) if m else None
    return t.group(1) if t else None


def _final_envelope(transcript):
    """The worker's last return envelope (dict) from its transcript tail, or None:
    the text of the last assistant record, or its SubagentHandback message."""
    try:
        size = os.path.getsize(transcript)
        with open(transcript, "rb") as f:
            f.seek(max(0, size - 262144))
            raw = f.read().decode("utf-8", "replace").split("\n")
    except OSError:
        return None
    for jl in reversed(raw):
        if '"assistant"' not in jl:
            continue
        try:
            rec = json.loads(jl)
        except Exception:
            continue
        if not (isinstance(rec, dict) and rec.get("type") == "assistant"):
            continue
        c = (rec.get("message") or {}).get("content") if isinstance(rec.get("message"), dict) else None
        if not isinstance(c, list):
            continue
        txt = "".join(b.get("text") or "" for b in c if isinstance(b, dict) and b.get("type") == "text")
        if not txt.strip():
            hb = [b for b in c if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "SubagentHandback"]
            txt = (hb[0].get("input") or {}).get("message") or "" if hb else ""
        if not txt.strip():
            continue
        try:
            env = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
        except Exception:
            return None
        return env if isinstance(env, dict) else None
    return None


def _qa_passed(env):
    """A QA envelope whose every `results[]` row is `pass` and that is not
    blocked, refused or waiting on information."""
    if not isinstance(env, dict) or any(env.get(k) for k in ("blocked", "refused", "needs_info")):
        return False
    rows = env.get("results")
    return isinstance(rows, list) and bool(rows) and all(
        isinstance(r, dict) and r.get("verdict") == "pass" for r in rows)


def settled_tickets(root, ids):
    """T-1427: {ticket id: "merging" | "qa-passed"} among `ids` — a track merge of
    that ticket is running now, or the ticket's latest dispatch marker for this
    project is a finished `qa` dispatch whose return passed every row."""
    ids = set(ids or ())
    out = {}
    if not ids:
        return out
    m = _merging_ticket(root)
    if m in ids:
        out[m] = "merging"
    d = prdt_home() / "run" / "dispatches"
    latest = {}
    here = Path(root).resolve()
    try:
        files = sorted(d.glob("*.json"))
    except OSError:
        files = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("ticket_id") not in ids or data.get("ticket_id") in out:
                continue
            pr = data.get("project_root")
            if not isinstance(pr, str) or Path(pr).resolve() != here:
                continue
        except Exception:
            continue
        since = _ts(data.get("since") or "") or 0
        tid = data["ticket_id"]
        if tid not in latest or since > latest[tid][0]:
            latest[tid] = (since, data)
    for tid, (_s, data) in latest.items():
        if data.get("persona") != "qa" or not data.get("stopped_at") or _worker_past_stop(data):
            continue
        t = _dispatch_transcript(data)
        if t and _qa_passed(_final_envelope(t)):
            out[tid] = "qa-passed"
    return out


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


def _closed_section_body(root, line, version):
    """T-1256: [(line_no, line)] of the PRD section of a CLOSED `version` (id as a
    ticket row carries it, `<line>/` prefix for an added line): the `## v…` section
    still in PRD.md, else the closed round file `prd/versions/[<line>/]<v>.md`
    (immutable, written at close). [] when neither exists."""
    root = Path(root)
    ln_, bare = split_line_id(version)
    line = line or ln_
    product = line_product(root, line)
    prd_dir = docs_path(root, "prd", product)
    key = _version_id_canon(bare)
    try:
        text = (prd_dir / "PRD.md").read_text(encoding="utf-8")
    except OSError:
        text = ""
    if text and key is not None:
        all_heads = _prd_line_headings(text, project_line_names(root))
        own = (None, line) if product else (line,)
        heads = [(v, ln) for l, v, ln in all_heads if l in own]
        chosen = next((h for h in heads if _version_id_canon(h[0]) == key), None)
        if chosen is not None:
            later = sorted(ln for _, _, ln in all_heads if ln > chosen[1])
            end_ln = later[0] if later else None
            return [(ln, t) for ln, t in _md_structural_lines(text)
                    if ln > chosen[1] and (end_ln is None or ln < end_ln)]
    vdir = prd_dir / "versions"
    if line and not product:
        vdir = vdir / line
    try:
        vtext = (vdir / f"{bare}.md").read_text(encoding="utf-8")
    except OSError:
        return []
    return _md_structural_lines(vtext)


def _lane_gate_rows(root, st, line, closed_version=None):
    """[(name, gate_path_or_None, named)] — one per 합격선 row of the open PRD
    section's `### 합격선` table, in table order (R1); `named` False = the
    A · B · C fallback (R11). `closed_version` (T-1256) reads that closed
    version's section instead of the open one."""
    if closed_version:
        body = _closed_section_body(root, line, closed_version)
    else:
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


def _lane_records(tickets, version):
    """[(name, gate_path_or_None, gate_ticket)] — T-1359 (design v1.16
    lane-records-design §1): this version's open+done tickets carrying a
    `lane:` frontmatter record, in ticket-number order. [] → the 합격선 table."""
    recs = [t for t, (r, _p) in tickets.items()
            if r["version"] == version and r["status"] in ("open", "done")
            and isinstance(r.get("lane"), str) and r["lane"].strip()]
    return [(tickets[t][0]["lane"].strip(), (tickets[t][0].get("gate") or "").strip() or None, t)
            for t in sorted(recs, key=_ticket_num_key)]


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
        elif r["assignee"] == "user" or work_ticket_waits_on_options(r["type"], tickets[t][1]):
            lane["blockers"].append({"id": t, "kind": "request"})  # T-1491: options fork waits on the user too

    def satisfied(d):
        return d not in tickets or tickets[d][0]["status"] in ("done", "dropped")
    # T-1158 = B: `ready` = R3's 다음 criteria, shown even while the lane has work running.
    # `next` stays the dispatch-gate-facing value (T-1147): only when nothing is running.
    ready = [t for t in ids if tickets[t][0]["status"] == "open"
             and tickets[t][0]["type"] != "decision" and tickets[t][0]["assignee"] != "user"
             and t not in in_flight and not work_ticket_waits_on_options(tickets[t][0]["type"], tickets[t][1]) and all(satisfied(d) for d in tickets[t][0]["deps"])]
    lane["ready"] = sorted(ready, key=lambda t: (pos.get(t, math.inf), _ticket_num_key(t)))
    lane["ready_owner"] = {t: tickets[t][0]["assignee"] for t in lane["ready"]}
    if not lane["working"]:
        lane["next"], lane["next_owner"] = list(lane["ready"]), dict(lane["ready_owner"])


def _lane_new(name, gpath, named, version, besteffort=False):
    return {"name": name, "gate_path": gpath, "gate_ticket": None, "linked": besteffort, "done": 0,
            "total": 0, "finished": False, "tickets": [], "working": [], "working_owner": {},
            "next": [], "next_owner": {}, "ready": [], "ready_owner": {}, "blockers": [], "warning": None,
            "unnamed": not named, "besteffort": besteffort, "_version": version}


def compute_lanes(root, tickets, st, line, version, in_flight, order=None, closed=False):
    """[lane dict] — one per lane record (T-1359: a gate ticket's `lane:`
    frontmatter, ticket-number order), or with no record in this version one
    per 합격선 row of the PRD table; then the 자투리 lane; [] when neither
    exists (R1–R3, R7–R12). `order` = ticket ids in `prdt schedule`
    row order (the lane queue order, R12); None → ticket-number order.
    {name, gate_path, gate_ticket, linked, done, total, finished, tickets,
    working, next, ready, blockers:[{id, kind: decision|request}], warning,
    unnamed, besteffort}. A ticket belongs to ONE lane: the earliest row whose
    gate ticket's deps closure holds it (R8); this version's open+done tickets
    in no row's closure are the 자투리 lane (R7), present only when non-empty."""
    records = _lane_records(tickets, version)
    rows = [(n, g, True) for n, g, _t in records] if records else _lane_gate_rows(root, st, line, version if closed else None)
    if not rows:
        return []
    pos = {t: i for i, t in enumerate(order or [])}
    cache = {}

    def body(t):
        if t not in cache:
            cache[t] = parse_frontmatter(tickets[t][1])[1] or ""
        return cache[t]
    lanes, taken, claimed = [], set(), set()

    def link(lane, gate):
        """Mark `gate` as `lane`'s gate ticket; its deps closure not yet held by
        an earlier lane is the lane's members (R8)."""
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
        claimed.update(seen)
        return members

    if records:
        # T-1359: the record IS the gate ticket — no body search, always linked.
        names = set()
        for name, gpath, gate in records:
            lane = _lane_new(name, gpath, True, version)
            lanes.append(lane)
            if name in names:
                lane["warning"] = f"lane {name}: another lane record of {version} already has this name"
            names.add(name)
            _lane_fill(lane, link(lane, gate), tickets, in_flight, pos)
        rows = []
    for name, gpath, named in rows:
        lane = _lane_new(name, gpath, named, version)
        lanes.append(lane)
        members = []
        if gpath:
            alt = gpath
            try:
                alt = resolve_docs_ref(root, gpath, line_product(root, line)) or gpath
            except Exception:
                pass
            gate = _lane_find_gate_ticket(tickets, version, [gpath, alt], body)
            if gate is not None and gate in taken:
                lane["warning"] = (f"lane {name}: its gate path reaches {gate}, which an earlier lane already "
                                   f"holds — not linked")
            elif gate is not None:
                members = link(lane, gate)
        _lane_fill(lane, members, tickets, in_flight, pos)
    rest = [t for t, (r, _p) in tickets.items()
            if r["version"] == version and r["status"] in ("open", "done") and t not in claimed]
    if rest:
        lane = _lane_new(LANE_BESTEFFORT_NAME, None, True, version, besteffort=True)
        _lane_fill(lane, rest, tickets, in_flight, pos)
        lanes.append(lane)
    return lanes


def lanes_for(root, line=None, version=None):
    """[lane dict] of one product (`line` None = the home product) — the statusline's read.
    Same inputs `compute_schedule` hands `compute_lanes`, so `prdt schedule --json`'s `lanes`
    and this are one computation (T-1184: the schedule itself, so a lane queue has its order)."""
    if version:
        # T-1256: a CLOSED version's lanes as at close (viewer idle home) — gate-ticket `lane:`
        # records first, else its `### 합격선` table from PRD.md or `prd/versions/`. Nothing in
        # flight, no queue order. `version` None = the unchanged current-version read above.
        root = Path(root)
        st = read_json(root / ".prdt" / "po-state.json") or {}
        return compute_lanes(root, _schedule_tickets(root), st, line, version, set(), closed=True)
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


# T-1491 (T-1490 rule R2): an ask laying out alternatives during work keeps its options
# table in the work ticket's `## options` and the user's answer in a `### 확인` slice
# INSIDE that section (the request read-back under `## problem` is not the answer). A work
# ticket (design|impl|qa) holding a filled option row and no user quote in that slice waits on
# the user, so the ask stays in the "waiting on user" list. Quote shapes and the
# `### 확인` / `### confirm` label are the dispatch gate's own (prdt-dispatch-gate.sh).
WORK_TICKET_TYPES = ("design", "impl", "qa")
_OPT_H2_RE = re.compile(r"^##[ \t]+(options|대안)[ \t]*$", re.I)
_CONFIRM_H3_RE = re.compile(r"^###[ \t]+(확인|confirm)([ \t(:,./?-]|$)", re.I)
_TABLE_SEP_CELL_RE = re.compile(r"^:?-+:?$")
_QUOTE_RE = re.compile("\x01[^\x01\x02]*[^ \t\x01\x02][^\x01\x02]*\x02"
                       "|\x03[^\x03\x04]*[^ \t\x03\x04][^\x03\x04]*\x04")


def _line_holds_user_quote(line):
    l = re.sub(r"`[^`]*`", " ", line)
    l = l.replace('*"', "\x01").replace('"*', "\x02").replace("\u201c", "\x01").replace("\u201d", "\x02")
    l = l.replace("\u300c", "\x03").replace("\u300d", "\x04")
    return bool(_QUOTE_RE.search(l))


def ticket_body_waits_on_options(text):
    """True when the ticket text has a filled option row under `## options` and no
    user quote inside that section's own `### 확인` / `### confirm` slice. The
    `## problem` → `### 확인` (the request read-back) is never read here (T-1491)."""
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        text = text[end + 4:] if end >= 0 else text
    in_fence = False
    in_options = False
    in_confirm = False
    seen_sep = False
    pending = None   # last table row, not yet known to be a header (a separator right after makes it one)
    filled = False
    quoted = False

    def flush():
        nonlocal pending, filled
        if pending is not None and seen_sep and any(pending):
            filled = True
        pending = None
    for ln in text.splitlines():
        if re.match(r"^[ \t]*(```|~~~)", ln):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if re.match(r"^##[ \t]", ln):
            flush()
            in_options = bool(_OPT_H2_RE.match(ln.rstrip()))
            in_confirm = False
            seen_sep = False
            continue
        if re.match(r"^###[ \t]", ln):
            flush()
            in_confirm = bool(_CONFIRM_H3_RE.match(ln))
            continue
        if ln.startswith("#"):
            continue
        if in_options and in_confirm and _line_holds_user_quote(ln):
            quoted = True
        if in_options and ln.lstrip().startswith("|"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if all(_TABLE_SEP_CELL_RE.match(c) for c in cells if c) and any(cells):
                pending = None   # the row above was a header
                seen_sep = True
                continue
            flush()
            pending = cells
        elif in_options:
            flush()
    flush()
    return filled and not quoted


def work_ticket_waits_on_options(ttype, path):
    """The schedule's read of `ticket_body_waits_on_options` for one ticket file."""
    if ttype not in WORK_TICKET_TYPES:
        return False
    try:
        return ticket_body_waits_on_options(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return False


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
        if (r["type"] == "decision" or r["assignee"] == "user"
                or work_ticket_waits_on_options(r["type"], p)):
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
        # T-1365: where the lanes came from — `records` (gate tickets' `lane:`) or the PRD `table`
        out["lanes_from"] = "records" if _lane_records(tickets, version) else "table"
        # T-1184 R10: the version total the lane sums must equal (text `total` line)
        here = [r for r, _p in tickets.values() if r["version"] == version and r["status"] in ("open", "done")]
        impl = [r for r in here if r["type"] == "impl"]
        out["totals"] = {"done": sum(r["status"] == "done" for r in here), "total": len(here),
                         "impl_done": sum(r["status"] == "done" for r in impl), "impl_total": len(impl)}
    return out


# ── meta git: the trust check and the one runner (moved from prdt_cli for T-1384 —
# the stage history read below runs meta git from the statusline and the viewer, which
# import this module and never the CLI) ──
def meta_git_dir(root):
    return Path(root) / ".prdt" / "meta.git"


def _scrubbed_git_env():
    """No GIT_* inheritance — inside a code-repo hook, GIT_INDEX_FILE etc. would
    redirect meta git at the CODE repo's index (meta-git.ts T-364 QA-HIGH)."""
    return {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}


def _git(args, cwd, timeout=10):
    return subprocess.run(["git", *args], cwd=str(cwd), env=_scrubbed_git_env(),
                          capture_output=True, text=True, timeout=timeout)


# T-848: `.prdt/meta.git` sits in the project tree, so a cloned repository can
# carry one — config, hooks and all. Observed by running (git 2.54): a carried
# `core.fsmonitor`, `core.hooksPath`, `$GIT_DIR/hooks/*`, an `include.path`, and a
# `filter.<x>.clean` named by `$GIT_DIR/info/attributes` each RUN a command on
# plain `status` / `add` / `commit`. Two layers, same on the TS side
# (meta-git.ts metaGit — keep both in step):
#  1. every meta git run pins the hook / fsmonitor / signing knobs on the
#     command line (command-line config outranks every file);
#  2. before any run, the repo's own config must hold only keys prdt or
#     `prdt meta remote add` write — a driver key (filter / diff / merge /
#     pager / editor / sshCommand / gpg / credential / alias / include / …)
#     can't be neutralised by name, so an unknown key refuses the run.
META_GIT_HARDEN = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
                   "-c", "commit.gpgsign=false"]
_META_CONFIG_ALLOWED = re.compile(
    r"(core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase"
    r"|precomposeunicode|symlinks|worktree|hookspath)"
    r"|extensions\.(objectformat|refstorage)"
    r"|user\.(name|email)|commit\.gpgsign|push\.(followtags|default)"
    r"|remote\..+\.(url|pushurl|fetch)|branch\..+\.(remote|merge))")
_meta_trust_cache = {}
_META_URL_SCHEMES = {"https", "http", "ssh", "git", "git+ssh", "ssh+git", "ftp", "ftps"}


# T-917 (user decision T-913 = A): a meta backup remote is a NETWORK remote only.
# A push to a local repository runs THAT repository's hooks on this machine
# (`-c core.hooksPath=/dev/null` never reaches the receiving side), so every
# local path is refused — relative, absolute, `~`, `file://` — inside the
# project or not. Shared fixture list with meta-git.ts metaRemoteUrlProblem:
# test/fixtures/meta-remote-urls.json (keep both sides in step).
META_LOCAL_REMOTE_RULE = "meta backup allows only network remotes (https, ssh, git or user@host:path)"


def _meta_remote_url_problem(url):
    """None for a network remote URL git reaches over https/http/ssh/git (or
    scp-like `user@host:path`), else why not: a `<helper>::` transport or a
    non-network `<scheme>://` (runs `git-remote-<x>`; `ext::` runs its
    argument), or any local path (its hooks run on push)."""
    if "::" in url.split("/", 1)[0]:
        return "a remote-helper URL"
    m = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*)://", url)
    if m:
        scheme = m.group(1).lower()
        if scheme in _META_URL_SCHEMES:
            return None
        if scheme != "file":
            return "a remote-helper URL"
    elif re.match(r"^[^/]+:", url):
        return None  # scp-like host:path — git's own rule: a colon before any slash
    return "a local path — " + META_LOCAL_REMOTE_RULE


def _meta_gitfile_problem(gd):
    """`.prdt/meta.git` as a FILE: git follows a `gitdir: <path>` file to a
    repository anywhere — never handed to git."""
    try:
        with open(gd, "rb") as fh:
            head = fh.read(4096).decode("utf-8", "replace")
    except OSError:
        head = ""
    if head.startswith("gitdir:"):
        tgt = head[len("gitdir:"):].strip().splitlines()[0] if head[len("gitdir:"):].strip() else "?"
        return f".prdt/meta.git is a file pointing elsewhere (gitdir: {tgt})"
    return ".prdt/meta.git is a file, not a directory"


def meta_repo_present(root):
    """Something stands at `.prdt/meta.git` that a meta command must answer for:
    a repo (HEAD) or a non-directory there (a gitfile / symlink — refused by
    meta_git_trust_problem, never silently 'not split')."""
    gd = meta_git_dir(Path(root))
    if (gd / "HEAD").exists() or (os.path.lexists(gd) and not gd.is_dir()) or gd.is_symlink():
        return True
    # refs/ or objects/ without a HEAD is still something to answer for — the
    # trust check says "has refs but no config" (T-848 fix2)
    return (gd / "refs").exists() or (gd / "objects").exists()


def meta_git_trust_problem(root):
    """None when `.prdt/meta.git` may be handed to git, else why not (one
    English line). Never raises; never runs a command the repo could name
    (`git config --file` reads one file and follows no include).
    Order (T-848 fix1): every structural check runs BEFORE the 'no config yet'
    answer — a config-less repo with a `commondir` reads ITS config instead."""
    root = Path(root)
    gd = meta_git_dir(root)
    for p in (root / ".prdt", gd):
        try:
            st_ = os.lstat(p)
        except FileNotFoundError:
            return None  # no meta repo yet — nothing to trust
        except OSError:
            return f"cannot inspect {p.relative_to(root)}"
        if stat.S_ISLNK(st_.st_mode):
            return f"{p.relative_to(root)} is a symbolic link"
    if not stat.S_ISDIR(os.lstat(gd).st_mode):
        return _meta_gitfile_problem(gd)
    for name in ("commondir", "config.worktree"):
        if os.path.lexists(gd / name):
            return f".prdt/meta.git/{name} exists"
    try:
        if stat.S_ISLNK(os.lstat(gd / "config").st_mode):
            return ".prdt/meta.git/config is a symbolic link"
    except FileNotFoundError:
        for name in ("HEAD", "objects", "refs"):
            if os.path.lexists(gd / name):
                return f".prdt/meta.git has {name} but no config"
        return None  # empty / not-yet-initialised dir — git sees no repo there
    except OSError:
        return "cannot inspect .prdt/meta.git/config"
    try:
        st = os.stat(gd / "config")
        key = (str(gd), st.st_ino, st.st_size, st.st_mtime_ns)
    except OSError:
        return "cannot read .prdt/meta.git/config"
    if key in _meta_trust_cache:
        return _meta_trust_cache[key]
    r = _git(["config", "--file", str(gd / "config"), "--no-includes", "--list", "-z"], root)
    if r.returncode != 0:
        prob = "cannot parse .prdt/meta.git/config"
    else:
        prob = None
        for ent in r.stdout.split("\0"):
            if not ent:
                continue
            k, _, v = ent.partition("\n")
            if not _META_CONFIG_ALLOWED.fullmatch(k):
                prob = f".prdt/meta.git/config sets {k}"
                break
            if k.endswith((".url", ".pushurl")) and k.startswith("remote."):
                why = _meta_remote_url_problem(v)
                if why:
                    prob = f".prdt/meta.git/config {k} ({v}) is {why}"
                    break
        if prob is None:
            # branch.<b>.remote may name a URL/path instead of a remote (T-848 fix1)
            ents = [e.partition("\n") for e in r.stdout.split("\0") if e]
            names = {m.group(1) for k, _, _ in ents
                     for m in [re.fullmatch(r"remote\.(.+)\.(?:url|pushurl|fetch)", k)] if m}
            for k, _, v in ents:
                if k.startswith("branch.") and k.endswith(".remote") and v not in names:
                    why = _meta_remote_url_problem(v)
                    if why:
                        prob = f".prdt/meta.git/config {k} ({v}) is {why}"
                        break
    _meta_trust_cache[key] = prob
    return prob


# ── T-1384 (decision T-1385 = A): a ticket counts in the stage it was created in ──
# Readers: statusline-prdt.sh (`stage n/m`) and the viewer stage bar (collect.mjs →
# home-graph.mjs `stageOfTicket`, the JS twin of `ticket_stage` — parity test:
# packages/gui/scripts/qa/type-to-stage-parity.test.ts).
COUNTED_STAGES = ("define", "build", "ship")
STAGE_DEFINE_TYPES = ("design", "decision")
STAGE_SHIP_TYPES = ("qa", "ops")
_DAY_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def stage_of_type(ttype):
    """The pre-T-1384 rule, now the fallback: design · decision → define, qa · ops → ship,
    every other type → build."""
    if ttype in STAGE_DEFINE_TYPES:
        return "define"
    if ttype in STAGE_SHIP_TYPES:
        return "ship"
    return "build"


def stage_history(root, line=None, version=None, limit=400):
    """[[YYYY-MM-DD, stage], …] oldest-first: each day po-state's stage for (`line`,
    `version`) changed, while po-state named that version. `version` is the bare id
    (`v1.16`); None = the line's current one.
    Source: the meta repo's history of `.prdt/po-state.json` (the record `_build_entry_date`
    reads; po-state keeps no history of its own). A snapshot lands at or after the stage
    write, so a day here is the write's day or later. The walk runs newest-first and
    stops at the first snapshot naming another version. Committer dates are LOCAL days,
    the calendar a ticket's `created` uses (T-1210). No meta repo, an untrusted one
    (`meta_git_trust_problem`), or any git failure → []. Read-only."""
    root = Path(root)
    gd = meta_git_dir(root)
    if not (gd / "HEAD").exists():
        return []
    if version is None:
        _s, vid, _c = line_state(read_json(root / ".prdt" / "po-state.json"), line)
        version = split_line_id(vid)[1] if vid else None
    if not version:
        return []
    want = join_line_id(line, version)
    # A hit runs no git, so it is safe before the trust check (only trusted runs fill it).
    ckey = _stage_cache_key(gd, int(limit))
    cached = _stage_cache_get(gd, want, ckey)
    if cached is not None:
        return cached
    if meta_git_trust_problem(root):
        return []
    base = [*META_GIT_HARDEN, "-c", "log.showSignature=false", "--git-dir", str(gd)]
    # `log -n N -- <path>` walks back until N snapshots touch po-state: a version holds a
    # few, so read a small window and widen it only while every snapshot read still names
    # this version (measured on this repo, 8k meta commits: -n5 0.11 s, -n20 0.42 s).
    n = 4
    while True:
        seen, done = _stage_snapshots(root, base, min(n, int(limit)), line, want)
        if seen is None:
            return []
        if done or n >= int(limit):
            break
        n *= 4
    hist_out = []
    for day, stage in reversed(seen):
        if not hist_out or hist_out[-1][1] != stage:
            hist_out.append([day, stage])
    _stage_cache_put(gd, want, ckey, hist_out)
    return hist_out


# T-1384 follow-up: the git walk above costs ~0.7 s cold, and the statusline runs once per
# call. The answer changes only when the meta repo's branch moves, so it is cached per
# (meta.git, line+version) under a per-user temp dir, keyed by the stat of HEAD, the ref
# HEAD names and packed-refs (a commit rewrites the ref file → new key). A failed or
# unreadable cache is a miss, never an error; only trusted-repo results are ever stored.
def _stage_cache_key(gd, limit):
    parts = [str(limit)]
    try:
        names = ["HEAD", "packed-refs"]
        head = (gd / "HEAD").read_text(errors="replace").strip()
        if head.startswith("ref: "):
            names.append(head[5:].strip())
        parts.append(head)
        for n in names:
            try:
                st = os.stat(gd / n)
                parts.append(f"{n}:{st.st_mtime_ns}:{st.st_size}")
            except OSError:
                parts.append(f"{n}:-")
    except OSError:
        return None
    return "|".join(parts)


def _stage_cache_path(gd):
    import hashlib
    import tempfile
    h = hashlib.sha1(str(Path(gd).resolve()).encode()).hexdigest()[:16]
    d = Path(tempfile.gettempdir()) / f"prdt-stage-hist-{os.getuid()}"
    return d, d / f"{h}.json"


def _stage_cache_get(gd, want, ckey):
    if ckey is None:
        return None
    try:
        _d, f = _stage_cache_path(gd)
        st = os.stat(f)
        if st.st_uid != os.getuid():
            return None
        ent = json.loads(f.read_text()).get(want)
        if not isinstance(ent, dict) or ent.get("key") != ckey:
            return None
        hist = ent.get("hist")
        if isinstance(hist, list) and all(
                isinstance(r, list) and len(r) == 2 and all(isinstance(x, str) for x in r)
                for r in hist):
            return hist
    except (OSError, ValueError, AttributeError):
        pass
    return None


def _stage_cache_put(gd, want, ckey, hist):
    if ckey is None:
        return
    try:
        d, f = _stage_cache_path(gd)
        d.mkdir(mode=0o700, exist_ok=True)
        try:
            data = json.loads(f.read_text())
            if not isinstance(data, dict):
                data = {}
        except (OSError, ValueError):
            data = {}
        data[want] = {"key": ckey, "hist": hist}
        tmp = f.with_name(f"{f.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(data))
        os.replace(tmp, f)
    except (OSError, ValueError, TypeError):
        pass


def _stage_snapshots(root, base, n, line, want):
    """([(day, stage)] newest-first while po-state names `want`, done) over the newest `n`
    po-state snapshots; done = a snapshot naming another version ended the run, or fewer
    than `n` exist. (None, True) on any git failure."""
    try:
        r = _git([*base, "log", f"-n{n}", "--date=format-local:%Y-%m-%d",
                  "--format=%H %cd", "--", ".prdt/po-state.json"], root)
        if r.returncode != 0:
            return None, True
        commits = [row.split(" ", 1) for row in r.stdout.splitlines() if " " in row]
        if not commits:
            return [], True
        b = subprocess.run(["git", *base, "cat-file", "--batch"], cwd=str(root),
                           env=_scrubbed_git_env(), capture_output=True, timeout=10,
                           input="".join(f"{sha}:.prdt/po-state.json\n" for sha, _d in commits).encode())
        if b.returncode != 0:
            return None, True
    except (OSError, subprocess.SubprocessError, ValueError):
        return None, True
    out, pos, seen = b.stdout, 0, []
    for _sha, day in commits:
        nl = out.find(b"\n", pos)
        if nl < 0:
            return seen, True
        head = out[pos:nl].split()
        pos = nl + 1
        hist = None
        if len(head) == 3 and head[1] == b"blob":
            size = int(head[2])
            try:
                hist = json.loads(out[pos:pos + size].decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                hist = None
            pos += size + 1
        stage, ver, _c = line_state(hist, line)
        if ver != want:
            return seen, True
        if isinstance(stage, str) and _DAY_RE.fullmatch(day[:10] if day else ""):
            seen.append((day[:10], stage))
    return seen, len(commits) < n


def ticket_stage(fm_stage, created, ttype, history):
    """The stage a ticket counts in (T-1385 = A): its own `stage:` when that is
    define · build · ship; else the stage po-state held on its `created` day (the last
    `history` change on or before that day — a same-day change wins); else, when neither
    decides it — and, T-1386 = B, never a stage earlier than
    `stage_of_type` (the later of the two, define < build < ship) — (no key, no history, created before the version's first recorded stage,
    or a retro · idle answer), the type rule `stage_of_type`."""
    if fm_stage in COUNTED_STAGES:
        # T-1386 = B: an explicit key obeys the same floor — never earlier than the type's stage
        return max(fm_stage, stage_of_type(ttype), key=COUNTED_STAGES.index)
    day = created[:10] if isinstance(created, str) else ""
    if _DAY_RE.fullmatch(day):
        hit = None
        for d, s in history or ():
            if d <= day:
                hit = s
            else:
                break
        if hit in COUNTED_STAGES:
            # T-1386 = B: never earlier than the type's stage (define < build < ship)
            by_type = stage_of_type(ttype)
            return max(hit, by_type, key=COUNTED_STAGES.index)
    return stage_of_type(ttype)
