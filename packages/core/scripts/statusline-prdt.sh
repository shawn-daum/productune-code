#!/usr/bin/env bash
# prdt statusline — PURE DISPLAY (§10). No writes, no side effects, with one
# narrow exception (T-805): a ticket id's OSC 8 link target is the tiny viewer
# jump stub `.prdt/scratch/viewer/at/T-NNN.html` (T-746) already written by
# `prdt tickets --link`/`prdt viewer`, created here on demand when missing —
# a small, idempotent, derived-artifact write (doctrine #6: a tool maintains
# what it can generate), never project state, and never the full viewer
# regeneration those commands also do (see `viewer_jump_path` below for why).
# T-1382: a dec/req id links `at/progress/T-NNN.html` instead — the viewer on
# home/progress with that ticket's detail open — written here the same way.
# The state/cost recording that full's statusline smuggled in lives in
# hooks/prdt-post-dispatch.sh.
#
# Format (T-984, user-confirmed 2026-10-06; T-961 release lines):
#   <label> <version> | stage: <stage> n/m | total tickets <vdone>/<vtotal> | branch: <b>   (T-1017: branch last)
#   lane: <name>  d/t | working <ids|0> | next <id> | blockers …   (T-1147; T-1330: every stage, the
#     only home of in-flight work — no `working` cell on the product row)
#   T-1019: empty = `0` (never `—`), a stage without a count = `0/0`; no bar follows Hangul.
#   dec <ids|0> | req <ids|0>
#   T-1015: every label (branch · stage · ticket · working · persona · dec · req ·
#   `+N lines`) reads in the CLI language — the same rule as `cli_lang()` in
#   scripts/prdt (PRDT_LANG en*/ko* wins, else the device token `cli-lang`,
#   default ko; OS LANG never read) — from the `statusline.*` keys of the
#   sibling `prdt-messages.json`. The labels in this comment are the English forms.
#   - One row per product, the first product (the project slug) first, then each
#     product declared in `.prdt/config.json` `products` (T-1108; old `lines` still read).
#   - The `dec … | req …` row is ALWAYS its own last row (`dec 0 | req 0` when
#     empty), single-line and multi-line projects alike (T-988 = A, T-984
#     reversed by the user 2026-10-06).
#   - Never more than MAX_ROWS (17, measured on the user's machine) rows; product and lane
#     rows share the cap and fold past it into one `+N more rows` row (T-1330: T-1372 2 = A,
#     T-1374 = A — n counts hidden rows); the dec/req last row always stays.
#   - `<stage> n/m` (T-923) = done/total of this version's tickets in the current
#     stage, by the viewer's type rule; retro · idle → 0/0. No checklist record is read.
#   - `<label> <version>` is ONE OSC 8 link to `.prdt/scratch/viewer/viewer.html`
#     when that file exists, plain text otherwise. Successor ids inside a
#     group use `>`.
#   - <vdone>/<vtotal> is ONE version-wide count over every ticket (open+done)
#     in the line's current version dir, every type included (T-755).
#   - `dec` = every open `type: decision` ticket, `req` = every open
#     `assignee: user` ticket that is not a decision, across EVERY version
#     directory of every line (backlog excluded) — the same rule as the
#     viewer Home (`waitLists`, packages/viewer/lib/home-graph.mjs, T-881).
#   - T-965: lane `working` ids carry their persona abbreviated (`T-959(des)`,
#     `T-700(dev+qa)`); a working id sits under the product whose folder holds
#     its ticket; `>` successors list ONLY tickets in that line's current
#     version folder.
#   - T-984 dropped the separate `T-NNN <task>→<persona>` current-task segment;
#     T-1330 moved in-flight work from the product row onto the lane rows.
# Missing pieces degrade silently (init is deterministic, so slug/stage exist from 0s).

set +e
INPUT="$(cat 2>/dev/null || true)"

CWD=""
if [ -n "$INPUT" ] && command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.workspace.current_dir // .cwd // ""' 2>/dev/null)"
fi
[ -z "$CWD" ] && CWD="$(pwd)"

# projectRoot: the FIFTH resolver of the same contract, and until T-493 the odd
# one out twice over — nearest-wins (everything else took the OUTERMOST marker
# since T-484) and lexical (the CLI resolves physically). Both are fixed here so
# all five answer identically; keep in lockstep with `find_project_root` in
# scripts/prdt, the bash `find_proj` in hooks/prdt-session-start.sh and
# hooks/prdt-project-overrides-inject.sh, and the python twins in
# hooks/prdt-post-dispatch.sh / hooks/prdt-user-prompt.sh.
#   * PHYSICAL: `cd -P … && pwd -P` resolves symlink components exactly as python
#     `os.path.realpath` does. Measured 2026-08-18 with `<decoy>/link -> <real>/code`:
#     from `<decoy>/link` this statusline displayed <decoy>'s slug/version/stage
#     while `prdt` in the same terminal read and WROTE <real>'s po-state — the
#     display and the writes describing two different projects. No attacker needed.
#   * OUTERMOST: nearest-wins let a `.prdt/po-state.json` planted anywhere in the
#     cloned CODE tree (an inner dir by construction under the v1.3 meta split)
#     take over the display. Legitimate layouts carry exactly one marker on the
#     chain, so for them outermost == nearest, byte-identical.
PHYS="$(cd -P -- "$CWD" 2>/dev/null && pwd -P)"
D="${PHYS:-$CWD}"; ROOT=""
while [ -n "$D" ] && [ "$D" != "/" ]; do
  [ -f "$D/.prdt/po-state.json" ] && ROOT="$D"
  # T-1112: a track worktree (tracks/T-NNN, .git is a file) is a project boundary — never walk out of it
  if [ -f "$D/.git" ] && [ "$(basename "$(dirname "$D")")" = "tracks" ]; then
    [[ "${D##*/}" =~ ^T-([BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?[0-9]{1,5}$ ]] && { ROOT=""; break; }   # T-1298: T-NNN or T-<PREFIX>-<n>
  fi
  UP="$(dirname "$D")"
  [ "$UP" = "$D" ] && break
  D="$UP"
done
[ -z "$ROOT" ] && exit 0

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)"
ROOT="$ROOT" SCRIPT_DIR="$SCRIPT_DIR" python3 -I - <<'PYEOF'
import json, os, re, sqlite3, stat, subprocess, sys, unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

# T-1104: product-first docs layout (docs/artifacts/v1.14/product-first-docs-layout.html).
# KEEP `project_products` / `tickets_homes` in lockstep with `project_products` /
# `product_docs_dirs(root, "tickets")` in scripts/prdt (parity test:
# test/scripts/product-first-shell-readers.test.ts). Layout = `docs/_shared/` is a
# real dir; first product = config `slug`, then `products[].name`, then any
# `docs/<kebab>/` holding `prd/` or `tickets/`. [] = legacy (docs/tickets).
_PROD_NAME_RE = re.compile(r"^(?!v[0-9])(?!backlog\Z)[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def _product_dir_name(slug):
    """config `slug` -> its `docs/<kebab>` folder name (same rule as `product_dir_name` in scripts/prdt)."""
    if not isinstance(slug, str) or not slug:
        return None
    k = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    if not _PROD_NAME_RE.match(k):
        return "product"
    # T-1215: layout-reserved names (PRODUCT_RESERVED_NAMES in prdt_lanes.py) get a suffix
    return k + "-product" if k in ("prd", "tickets", "artifacts", "wiki", "features", "archive", "po", "designer", "developer", "qa") else k


def project_products(root):
    sh = os.path.join(root, "docs", "_shared")
    if not os.path.isdir(sh) or os.path.islink(sh):
        return []
    try:
        with open(os.path.join(root, ".prdt", "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    cfg = cfg if isinstance(cfg, dict) else {}
    out = []

    def add(n):
        if isinstance(n, str) and _PROD_NAME_RE.match(n) and n not in out:
            out.append(n)
    add(_product_dir_name(cfg.get("slug")))
    prods = cfg.get("products")
    for e in (prods if isinstance(prods, list) else []):
        add(e.get("name") if isinstance(e, dict) else None)
    try:
        names = sorted(os.listdir(os.path.join(root, "docs")))
    except OSError:
        names = []
    for n in names:
        d = os.path.join(root, "docs", n)
        if os.path.isdir(d) and not os.path.islink(d) and not n.startswith(("_", ".")) \
                and (os.path.isdir(os.path.join(d, "prd")) or os.path.isdir(os.path.join(d, "tickets"))):
            add(n)
    return out


def tickets_homes(root):
    """[(product|None, dir)] — every product's tickets dir, then the shared
    backlog; legacy → [(None, docs/tickets)]."""
    prods = project_products(root)
    if not prods:
        return [(None, os.path.join(root, "docs", "tickets"))]
    return ([(p, os.path.join(root, "docs", p, "tickets")) for p in prods]
            + [(None, os.path.join(root, "docs", "_shared", "tickets"))])


root = os.environ["ROOT"]
try:  # T-906: the shared symlink-safe walk/writers, beside this script
    sys.path.append(os.environ.get("SCRIPT_DIR", ""))
    import prdt_safe_fs as _sfs
except ImportError:
    _sfs = None
try:
    st = json.load(open(os.path.join(root, ".prdt", "po-state.json")))
except Exception:
    raise SystemExit(0)
try:
    cfg_slug = json.load(open(os.path.join(root, ".prdt", "config.json"))).get("slug")
except Exception:
    cfg_slug = None

# --- T-493: nothing from a project-local file reaches the display raw ----------
# `.prdt/po-state.json` and `.prdt/config.json` travel with a clone and are the
# two easiest files in a repo to tamper with, and this script printed their values
# straight through: a CR / U+2028 in `slug` or `version` forged extra display
# lines, an ESC sequence repainted the line, and `version` was additionally
# spliced into the ticket-dir PATH below. Same prescription prdt-user-prompt.sh
# applies to the same four tokens (T-471) — shape-match and emit the MATCHED
# token, never the file's bytes — plus a sanitizer for the two genuinely free-form
# strings (project slug, task slug) and for the git branch.
# KEEP the enums / regex in lockstep with prdt-user-prompt.sh.
#   stage    ∈ define|build|ship|retro|idle
#   version    v<N>[.<m>[.<p>]]
#   ticket_id  T-NNN
#   assignee ∈ po|designer|developer|qa|user
STAGES = ("define", "build", "ship", "retro", "idle")
ASSIGNEES = ("po", "designer", "developer", "qa", "user")
VERSION_RE = re.compile(r"\Av[0-9]{1,4}(?:\.[0-9]{1,4}){0,2}\Z")
TICKET_RE = re.compile(r"\AT-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?[0-9]{1,5}\Z")


def token(raw, ok, absent=""):
    """The MATCHED token; `absent` when empty; `<withheld>` when off-shape. A
    withheld field says so on the line rather than being dropped — this is a
    display, and silently showing nothing is how the T-358 class of bug reads."""
    v = raw.strip() if isinstance(raw, str) else raw
    if not v:
        return absent
    return v if isinstance(v, str) and ok(v) else "<withheld>"


def clean(raw, cap=40, bar=False):
    """Free-form text → ONE displayable segment. Every character that could add a
    line, move the cursor, or hide text is dropped (unicodedata categories Cc, Cf,
    Zl, Zp — covers LF, CR, VT, FF, ESC, NEL, U+2028/9, ZWSP, the bidi overrides),
    and so is `|` unless `bar` — the separator belongs to this line's own layout,
    not to any value, or a slug/branch carrying one would forge segments. The
    result is then capped."""
    if not isinstance(raw, str):
        return ""
    s = "".join(c for c in raw if (bar or c != "|")
                and unicodedata.category(c) not in ("Cc", "Cf", "Zl", "Zp")).strip()
    return cut_cols(s, cap)


def dw(s):
    """Display columns of `s`: a wide/fullwidth char (Hangul, CJK) is 2, a
    combining mark 0, anything else 1 (T-1015)."""
    n = 0
    for c in s:
        if unicodedata.combining(c):
            continue
        n += 2 if unicodedata.east_asian_width(c) in ("W", "F") else 1
    return n


def cut_cols(s, cols):
    """`s` cut to at most `cols` display columns, `…` (1 column) appended on a cut."""
    if dw(s) <= cols:
        return s
    out, n = [], 0
    for c in s:
        w = dw(c)
        if n + w > cols - 1:
            break
        out.append(c)
        n += w
    return "".join(out) + "\u2026"


# ── T-1015: label language — the CLI's own rule and catalog ─────────────────
# Keep the resolution in lockstep with `cli_lang()` in scripts/prdt; the
# catalog is the sibling `prdt-messages.json` (install.sh mirrors both into
# bin/). A missing file or key shows the key itself, so a gap is visible.
def _cli_lang():
    env = (os.environ.get("PRDT_LANG") or "").strip().lower()
    if env.startswith("en"):
        return "en"
    if env.startswith("ko"):
        return "ko"
    home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
    try:
        tok = "".join(open(os.path.join(home, "cli-lang"), encoding="utf-8", errors="replace").read().split())
    except OSError:
        tok = ""
    return "en" if tok == "en" else "ko"


try:
    _cat = json.load(open(os.path.join(os.environ.get("SCRIPT_DIR", ""), "prdt-messages.json"), encoding="utf-8"))
    _labels = _cat.get(_cli_lang())
except Exception:
    _labels = None
_labels = _labels if isinstance(_labels, dict) else {}


def L(key, **kw):
    t = _labels.get("statusline." + key, "statusline." + key)
    return t.format(**kw) if kw else t


slug = clean(cfg_slug) or clean(os.path.basename(root)) or "?"


# ── T-1249: first-line cells after the version cell ─────────────────────────
# Each helper returns a display string or "" (= no cell). `home_cells()` is the
# one place first-line cells are listed, in print order (T-1252 adds its own).
def priority_cell():
    """`우선 n/m` — this project's rank in the machine's `priority.projects`
    (comma-separated slugs in `$PRDT_HOME/priority-projects`). Only with 2+
    listed names and this project's explicit config slug among them."""
    home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
    try:
        raw = "".join(open(os.path.join(home, "priority-projects"), encoding="utf-8", errors="replace").read().split())
    except OSError:
        return ""
    names = [n for n in raw.split(",") if n]
    if len(names) < 2 or not isinstance(cfg_slug, str) or cfg_slug not in names:
        return ""
    return L("priority", n=names.index(cfg_slug) + 1, m=len(names))


def _vkey(v):
    """`v1` == `v1.0` == `v1.0.0` — version id as a 3-int tuple, or None off-shape."""
    if not (isinstance(v, str) and VERSION_RE.match(v)):
        return None
    n = [int(x) for x in v[1:].split(".")]
    return tuple(n + [0] * (3 - len(n)))


def _deployed_version(row):
    """The `deployed.version` of this row's product (T-1186 record), or None.
    Reads `docs/<product>/DEPLOY.md` frontmatter only — the one-line flow
    `deployed: {version: v1.2, at: ..., ref: ...}` and the block form. No record,
    no file, a symlink, or an off-shape value all read as None (never raised)."""
    prods = project_products(root)
    if prods:
        path = os.path.join(root, "docs", row["line"] or prods[0], "DEPLOY.md")
    elif row["line"] is None:
        path = os.path.join(root, "docs", "DEPLOY.md")
    else:
        return None
    try:
        if os.path.islink(path) or not os.path.isfile(path):
            return None
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(65536).split("\n")
    except OSError:
        return None
    if not head or head[0].strip() != "---":
        return None
    block = False
    for ln in head[1:]:
        if ln.strip() == "---":
            return None
        if block:
            m = re.match(r"\A\s+version\s*:\s*(.*?)\s*\Z", ln)
            if m:
                return m.group(1).strip("\"'")
            if ln.strip() and not ln[:1].isspace():
                return None
            continue
        m = re.match(r"\Adeployed\s*:\s*(.*?)\s*\Z", ln)
        if not m:
            continue
        if not m.group(1):
            block = True
            continue
        m2 = re.search(r"[{,]\s*version\s*:\s*([^,}\s]+)", m.group(1))
        return m2.group(1).strip("\"'") if m2 else None
    return None


def deployed_cell(row):
    """`배포 vX · 개발 vY` — only when this product has a readable deployed
    record that differs from the dev version its row shows (T-1252)."""
    dev = row.get("version")
    if not _vkey(dev):
        return ""
    dep = _deployed_version(row)
    if not _vkey(dep) or _vkey(dep) == _vkey(dev):
        return ""
    return L("deployed", dep=dep, dev=dev)


def home_cells():
    return [c for c in (priority_cell(),) if c]

# ── T-961 / T-1108: products (pre-v1.14 name: release lines) ─
# The first product is the project slug and reads po-state's top-level stage /
# version; every added product is declared in `.prdt/config.json` `products`
# and reads `po-state.products.<product>`, its tickets under `docs/<product>/tickets/`
# (legacy layout: `docs/tickets/<product>/`). Old `lines` keys are still read.
# No `products` → one row, the single-product project as before (plus T-984 layout).
# KEEP LINE_NAME_RE and the declared-line filter in lockstep with
# LINE_NAME_RE / project_lines in scripts/prdt.
LINE_NAME_RE = re.compile(r"\A(?!v[0-9])(?!backlog\Z)[a-z0-9]+(?:-[a-z0-9]+)*\Z")
# T-923 / T-1384: `<stage> n/m` = done/total of the current version's tickets that count
# in the current stage — the ticket's own `stage:`, else the stage po-state held on its
# `created` day, else the type rule (`prdt_lanes.ticket_stage`, the one rule; the viewer's
# JS twin is `stageOfTicket` in packages/viewer/lib/home-graph.mjs — parity test:
# type-to-stage-parity). The module missing → the type rule alone.
try:
    import prdt_lanes as _pl
except Exception:
    _pl = None


def stage_of_type(t):
    if t in ("design", "decision"):
        return "define"
    if t in ("qa", "ops"):
        return "ship"
    return "build"


def ticket_stage_of(row, head):
    fm = re.match(r"---\n(.*?)\n---", head, re.S)
    block = fm.group(1) if fm else ""
    mty = re.search(r"^type:\s*(\S+)", block, re.M)
    mst = re.search(r"^stage:\s*(\S+)", block, re.M)
    mcr = re.search(r"^created:\s*[\"']?(\d{4}-\d{2}-\d{2})", block, re.M)
    ttype = mty.group(1) if mty else ""
    if _pl is None:
        return stage_of_type(ttype)
    if "stage_hist" not in row:
        try:
            row["stage_hist"] = _pl.stage_history(root, row["line"], row["version"])
        except Exception:
            row["stage_hist"] = []
    try:
        return _pl.ticket_stage(mst.group(1) if mst else None, mcr.group(1) if mcr else None,
                                ttype, row["stage_hist"])
    except Exception:
        return stage_of_type(ttype)


# Rows this statusline may print — measured on the user's machine 2026-10-06:
# 17 of a 30-row test statusline were visible (T-961 log).
MAX_ROWS = 17

try:
    cfg = json.load(open(os.path.join(root, ".prdt", "config.json")))
except Exception:
    cfg = None
cfg = cfg if isinstance(cfg, dict) else {}


def declared_lines():
    """Added lines in declaration order — legal, unique, not the slug."""
    # T-1108 ⑦: `products`; the pre-v1.14 `lines` is still read.
    raw = cfg.get("products") if "products" in cfg or "lines" not in cfg else cfg.get("lines")
    out, seen = [], set()
    for e in (raw if isinstance(raw, list) else []):
        name = e.get("name") if isinstance(e, dict) else None
        if isinstance(name, str) and LINE_NAME_RE.match(name) and name not in seen and name != cfg_slug:
            seen.add(name)
            out.append(e)
    return out


def stage_seg(raw_stage, sdone, stotal):
    """T-923: `stage: <stage> n/m` (ko `단계: …`) — n/m counts this version's tickets of the stage
    (retro · idle · off-shape stage → 0/0; digits end the segment, T-1019)."""
    stage = token(raw_stage, lambda v: v in STAGES, absent="?") or "?"
    name = L("stage." + stage) if stage in STAGES else stage
    return L("stagelabel", name=f"{name} {sdone.get(stage, 0)}/{stotal.get(stage, 0)}")


# branch (T-426): meta/code split projects (PRD history §v1.3) carry no `.git` at
# root — the code repo lives at `<root>/<config.code.dir>` (default "code").
# Mirrors project-kind.ts codeDirName/codeRoot (THE CONTRACT) so this stays in
# lockstep with the CLI/GUI resolution; kept local since this is a pure bash+
# python display script with no import path into that TS module.
CODE_DIR_DEFAULT = "code"


def code_dir_name():
    """config.code.dir (a non-empty str, not escaping root) or None."""
    if isinstance(cfg.get("code"), dict):
        d = cfg["code"].get("dir")
        if isinstance(d, str) and d.strip():
            t = d.strip()
            if os.path.isabs(t) or ".." in re.split(r"[/\\]+", t):
                return None
            return t
    return None


def line_code_dir(entry):
    """An added line's `code.dir` — relative to the project root and, unlike the
    home line's, allowed to climb out of it (`../ntf-archive/code`,
    release-lines.md §1): it is only ever handed to `git rev-parse`. Absolute or
    absent → None (no branch segment for that row)."""
    c = entry.get("code") if isinstance(entry, dict) else None
    d = c.get("dir") if isinstance(c, dict) else None
    if isinstance(d, str) and d.strip() and not os.path.isabs(d.strip()):
        return os.path.normpath(os.path.join(root, d.strip()))
    return None


def git_branch(path):
    if not path:
        return None
    try:
        r = subprocess.run(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
                            capture_output=True, text=True, timeout=2)
        b = r.stdout.strip()
        return b if r.returncode == 0 and b else None
    except Exception:
        return None


def home_branch():
    # Root repo wins (non-split projects, unchanged); else the configured/default
    # code repo; else the segment is silently absent (pure-display degrade rule).
    br = git_branch(root)
    if br is None:
        br = git_branch(os.path.join(root, code_dir_name() or CODE_DIR_DEFAULT))
    return br


_st_pk = "products" if "products" in st or "lines" not in st else "lines"
st_lines = st.get(_st_pk) if isinstance(st.get(_st_pk), dict) else {}
rows = [{"line": None, "label": slug, "st": st, "branch": home_branch()}]
for e in declared_lines():
    ent = st_lines.get(e["name"])
    rows.append({"line": e["name"], "label": e["name"], "st": ent if isinstance(ent, dict) else {},
                 "branch": git_branch(line_code_dir(e))})
for r in rows:
    r["version"] = token(r["st"].get("version"), lambda v: VERSION_RE.match(v) is not None)
    # T-922: `<label> <version>` opens the row (one OSC 8 link, see wrap_slug);
    # version is omitted only when po-state carries none.
    r["slug_ver"] = f"{r['label']} {r['version']}" if r["version"] else r["label"]
    # T-1252: a differing deployed record turns the version cell itself into `<label> 배포 vX · 개발 vY`
    _dc = deployed_cell(r)
    if _dc:
        r["slug_ver"] = f"{r['label']} {_dc}"
    r["branch"] = clean(r["branch"])
    r["vdone"] = r["vtotal"] = 0
    r["sdone"], r["stotal"] = {}, {}
row_by_line = {r["line"]: r for r in rows}

# Ticket progress per row: ONE version-wide count over every open+done ticket
# in that line's current version dir, every type included (T-755).
# Directory names reach the filesystem here only SHAPE-MATCHED (VERSION_RE,
# LINE_NAME_RE), so no `../` and no `<withheld>` ever reaches os.listdir/join.
# T-849 `dec` / `req`: open `type: decision` tickets, and open `assignee: user`
# tickets that are not decisions, over EVERY version directory of EVERY line
# (backlog excluded) — the same rule as the viewer Home (`waitLists`). T-1491: `req` also
# holds a design|impl|qa ticket whose `## options` waits on the user (prdt_lanes rule).
dec = []
req = []
req_deps = {}   # req candidate id -> its `deps` ids
tid_status = {}  # every scanned ticket id -> status (any status)
tid_line = {}  # ticket id -> the line whose folder holds it (None = home)
tickets_root = os.path.join(root, "docs", "tickets")
# T-1104: product layout — the home row (line None) reads the FIRST product's
# `docs/<p>/tickets`, an added line `L` reads `docs/L/tickets`; legacy keeps
# `docs/tickets[/<line>]` byte-for-byte. `ticket_prods[0]` = first product.
ticket_prods = project_products(root)


def tickets_base(line):
    if not ticket_prods:
        return tickets_root if line is None else os.path.join(tickets_root, line)
    return os.path.join(root, "docs", ticket_prods[0] if line is None else line, "tickets")


def _fm_deps(head):
    """`deps` ids of a ticket's frontmatter: inline list, bare id, or `- T-n` block."""
    fm = re.match(r"---\n(.*?)\n---", head, re.S)
    block = fm.group(1) if fm else head
    m = re.search(r"^deps:[ \t]*(.*(?:\n[ \t]+-[^\n]*)*)", block, re.M)
    return re.findall(r"T-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d+", m.group(1)) if m else []


def scan(base, row):
    try:
        vdirs = sorted(d for d in os.listdir(base)
                       if VERSION_RE.match(d) and os.path.isdir(os.path.join(base, d)))
    except OSError:
        return
    for vd in vdirs:
        dpath = os.path.join(base, vd)
        try:
            names = os.listdir(dpath)
        except OSError:
            continue
        is_current = vd == row["version"]
        for fn in names:
            if not (fn.startswith("T-") and fn.endswith(".md")):
                continue
            try:
                head = open(os.path.join(dpath, fn)).read(2000)
            except OSError:
                continue
            ms = re.search(r"^status:\s*(\S+)", head, re.M)
            s = ms.group(1) if ms else ""
            if TICKET_RE.match(fn[:-3]):
                tid_status.setdefault(fn[:-3], s)
            if s not in ("done", "open"):
                continue
            if is_current:
                row["vtotal"] += 1
                row["vdone"] += s == "done"
                stg = ticket_stage_of(row, head)
                row["stotal"][stg] = row["stotal"].get(stg, 0) + 1
                row["sdone"][stg] = row["sdone"].get(stg, 0) + (s == "done")
            tid = fn[:-3]
            if not TICKET_RE.match(tid):
                continue
            tid_line.setdefault(tid, row["line"])
            if s != "open":
                continue
            mt = re.search(r"^(?:type|stage):\s*(\S+)", head, re.M)
            ttype = mt.group(1) if mt else ""
            ma = re.search(r"^assignee:\s*(\S+)", head, re.M)
            tassignee = ma.group(1) if ma else ""
            if ttype == "decision":
                dec.append(tid)
            elif tassignee == "user":
                req.append(tid)
                req_deps[tid] = _fm_deps(head)
            elif _pl is not None and ttype in ("design", "impl", "qa"):
                # T-1491: a work ticket with a filled `## options` row and no user quote in
                # that section waits on the user — `prdt_lanes`' one rule (the schedule's).
                # A module that lacks the rule (or throws) never costs the statusline: not counted.
                try:
                    _wait = _pl.work_ticket_waits_on_options(ttype, os.path.join(dpath, fn))
                except Exception:
                    _wait = False
                if _wait:
                    req.append(tid)
                    req_deps[tid] = _fm_deps(head)


for r in rows:
    scan(tickets_base(r["line"]), r)
    r["stage"] = stage_seg(r["st"].get("stage"), r["sdone"], r["stotal"])


def _tid_key(t):
    head, _, n = t.rpartition("-")   # T-1298: `T-12` → ("T", 12), `T-RCH-001` → ("T-RCH", 1)
    return head, int(n)


dec = sorted(set(dec), key=_tid_key)
# `req` lists only what the user can do NOW: a ticket whose `deps` still name an
# open ticket is blocked and hidden (same rule as the viewer Home `waitLists`).
req = sorted((t for t in set(req) if not any(tid_status.get(d) == "open" for d in req_deps.get(t, []))), key=_tid_key)


def line_of(tid):
    """The row a ticket id belongs to: its folder's line; unknown → home."""
    ln = tid_line.get(tid)
    return ln if ln in row_by_line else None

# ── T-682: "running" / "waiting" footer segments ────────────────────────────
# running = dispatches in flight right now, machine-generated: markers written
# by prdt-post-dispatch.sh at SubagentStart (the mode-independent start —
# slice 3; PostToolUse:Agent fires AFTER SubagentStop for a foreground call)
# and stamped `stopped_at` at SubagentStop — never PO narration. A marker
# from a dispatch that crashed or was quota-killed before SubagentStop fired
# never gets its stamp, so THIS read side ages it out instead: older than
# STALE_HOURS → not displayed. Nothing here deletes: the statusline stays pure
# display; the hook that owns run/dispatches prunes files past its own
# retention (24 h, stated there). STALE_HOURS=4 is not contradicted by real
# durations (QA, T-682: the longest contiguous run measured was 128 min); it
# is a display safety margin, not a measured ceiling.
STALE_HOURS = 4


def _prdt_home():
    env = os.environ.get("PRDT_HOME")
    return env if env else os.path.join(os.path.expanduser("~"), ".prdt")


def _parse_iso(ts):
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def running_dispatches():
    """[(ticket_id, [persona, …])] for THIS project (`project_root == root`),
    ONE row per ticket id (F3 — a developer and a QA worker on the same ticket
    are one row, personas joined), ordered by the oldest live `since`, stopped
    markers skipped, never-stopped ones aged out past STALE_HOURS. Best-effort
    throughout: a missing directory, a corrupt marker, or an unreadable file
    is skipped, never raised — same "pure display, degrade silently" rule as
    everywhere else in this script."""
    d = os.path.join(_prdt_home(), "run", "dispatches")
    try:
        names = sorted(os.listdir(d))
    except OSError:
        return []
    now = datetime.now(timezone.utc)
    by_ticket = {}
    for n in names:
        if not n.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(d, n)))
        except Exception:
            continue
        if not isinstance(data, dict) or data.get("project_root") != root or data.get("stopped_at"):
            continue
        tid = data.get("ticket_id")
        if not (isinstance(tid, str) and TICKET_RE.match(tid)):
            continue
        persona = data.get("persona")
        if not (isinstance(persona, str) and persona in ASSIGNEES):
            persona = None
        since = _parse_iso(data.get("since") or "")
        if since is None or (now - since).total_seconds() > STALE_HOURS * 3600:
            continue
        row = by_ticket.setdefault(tid, [since, []])
        row[0] = min(row[0], since)
        if persona and persona not in row[1]:
            row[1].append(persona)
    return [(tid, sorted(ps)) for tid, (_, ps) in sorted(by_ticket.items(), key=lambda kv: kv[1][0])]


def open_index_ro():
    """Read-only handle on the derived `.prdt/index.db` (T-674), or None —
    absent/corrupt/mid-rebuild is a normal state (contracts: "derived,
    rebuildable"), so successors/blocks/links are just omitted, never a
    reason to fail this display. `immutable=1` (F7/F8): SQLite then takes NO
    lock and creates NO sidecar (-journal/-wal/-shm) — a rebuild holding an
    EXCLUSIVE lock cannot stall this prompt-time render, and a pure-display
    script writes nothing next to the db. The price is a possibly torn read
    mid-rebuild, which the try/except below turns into an omitted segment."""
    p = os.path.join(root, ".prdt", "index.db")
    if not os.path.isfile(p):
        return None
    try:
        return sqlite3.connect(f"file:{p}?mode=ro&immutable=1", uri=True, timeout=0)
    except Exception:
        return None


def persona_label(p):
    return L("persona." + p) if p in ASSIGNEES else p


def dependents(con, tid):
    """Tickets that name `tid` in THEIR OWN `deps` (edges: rel='deps' rows are
    (src depends on dst) — a ticket depending on X is the row (X's dependant,
    'deps', X)). One query answers both directions this ticket asks for: a
    running ticket's direct successors, and a waiting ticket's "what this
    blocks" — both are "who has ME in their deps." T-965: only dependants whose
    file lives in the CURRENT version's folder (index `tickets.path`) — T-961:
    the current version of the line `tid` belongs to (`docs/tickets/<line>/…`
    for an added line); a line without a version shows none."""
    line = line_of(tid)
    ver = row_by_line[line]["version"]
    if con is None or not ver:
        return []
    if ticket_prods:   # T-1104: index paths look like docs/PRODUCT/tickets/VERSION/…
        prefix = f"docs/{line or ticket_prods[0]}/tickets/{ver}/%"
    else:
        prefix = f"docs/tickets/{line}/{ver}/%" if line else f"docs/tickets/{ver}/%"
    try:
        rows_ = con.execute(
            "SELECT DISTINCT e.src FROM edges e JOIN tickets t ON t.id = e.src "
            "WHERE e.rel='deps' AND e.dst=? AND t.path LIKE ? ORDER BY e.src",
            (tid, prefix),
        ).fetchall()
    except Exception:
        return []
    return [x[0] for x in rows_ if isinstance(x[0], str) and TICKET_RE.match(x[0])]


def ticket_path(con, tid):
    """Absolute path of `tid`'s file from the derived index, or None. F5: the
    index is derived from files a clone carries, so its `path` is untrusted
    input like everything else here — a value carrying any control/format
    character (Cc/Cf/Zl/Zp: ESC, BEL, CR, U+2028 …) is REFUSED outright rather
    than cleaned, since it would land inside an OSC 8 URI where a stray ESC or
    BEL terminates the sequence; and it must stay under root."""
    if con is None:
        return None
    try:
        row = con.execute("SELECT path FROM tickets WHERE id=?", (tid,)).fetchone()
    except Exception:
        return None
    if not (row and isinstance(row[0], str) and row[0]):
        return None
    if any(unicodedata.category(c) in ("Cc", "Cf", "Zl", "Zp") for c in row[0]):
        return None
    p = os.path.normpath(os.path.join(root, row[0]))
    return p if p.startswith(root + os.sep) else None


# T-805: a ticket id's link target — never `ticket_path()`'s raw md above,
# always the viewer jump page `prdt tickets --link` prints for the SAME id
# (T-746/T-792): a person clicking a statusline ticket wants the viewer, not
# a bare markdown file. `VIEWER_HTML_REL`/`VIEWER_JUMP_REL` mirror the CLI's
# own `VIEWER_REL`/`VIEWER_JUMP_DIR` (scripts/prdt) — kept as literal path
# segments rather than an import, since that script has no `.py` extension
# and this one is a separate bash+python file; drift is caught the moment the
# CLI's own tests (prdt-tickets-link.test.ts) or this file's move, not before.
VIEWER_HTML_REL = os.path.join(".prdt", "scratch", "viewer", "viewer.html")
VIEWER_JUMP_REL = os.path.join(".prdt", "scratch", "viewer", "at")
# T-1382: a dec/req id opens the viewer on home/progress with that ticket's
# detail over it, so closing the detail returns to progress. Its own folder:
# `at/T-NNN.html` stays the `#id` page the generator and `prdt tickets --link`
# share (and prune), never rewritten here.
VIEWER_PROGRESS_SUB = "progress"


def viewer_jump_path(tid, progress=False):
    """The forwarding page for `tid` — same path and same two-line
    redirect-to-`viewer.html#id` body `viewer_jump()` (scripts/prdt) writes —
    or None when no viewer has ever been generated for this project (a jump
    page pointing at a `viewer.html` that was never built would just be a
    dead link; that degrades the same silent way every other missing piece
    in this script does).

    Deliberately NOT `viewer_regenerate()`: that shells out to node and
    rebuilds the WHOLE static viewer — measured ~1.4s in this repo — far too
    slow to pay on every statusline render. Keeping viewer.html itself fresh
    is someone else's job (the CLI's own commands; the background regen a
    docs/**/*.md write already schedules, T-802); this function only writes
    the tiny stub, which costs one small file write regardless of how fresh
    the target it points at is. A ticket id is already a safe filename as-is
    (TICKET_RE = T-\\d+, inside `viewer_jump()`'s own safe charset), so there
    is no hash-suffix branch to mirror."""
    if not os.path.isfile(os.path.join(root, VIEWER_HTML_REL)):
        return None
    parts = VIEWER_JUMP_REL.split(os.sep) + ([VIEWER_PROGRESS_SUB] if progress else [])
    page = os.path.join(root, *parts, f"{tid}.html")
    if progress:
        url = f"../../viewer.html?view=home&amp;group=progress&amp;kind=ticket&amp;id={tid}"
        body = ('<!doctype html><meta charset="utf-8">'
                f'<meta http-equiv="refresh" content="0;url={url}">'
                f'<a href="{url}">viewer.html#{tid}</a>\n')
    else:
        body = ('<!doctype html><meta charset="utf-8">'
                f'<meta http-equiv="refresh" content="0;url=../viewer.html#{tid}">'
                f'<a href="../viewer.html#{tid}">viewer.html#{tid}</a>\n')
    # T-842: `.prdt/scratch/**` may hold a committed symlink. T-906: the walk
    # and the write are the shared prdt_safe_fs module's — every component of
    # .prdt/scratch/viewer/at opened with O_NOFOLLOW (a link anywhere → no link
    # target at all), the stub written relative to that descriptor via an
    # O_EXCL|O_NOFOLLOW temp renamed inside the same directory; an existing
    # stub keeps its mode, a new one is 0644 whatever the umask. A module that
    # is not beside this script degrades the same way a refused link does.
    # T-1081: written only when missing — an existing plain single-link stub
    # holding exactly `body` is left untouched (no rename, mode and mtime
    # kept); anything else at the leaf (absent, a link, other bytes) is
    # replaced as before. The read goes through the same O_NOFOLLOW walk.
    if _sfs is None:
        return None
    fd = None
    try:
        fd = _sfs.open_dir(root, parts, create=True)
        if not _stub_current(fd, f"{tid}.html", body):
            _sfs.write_atomic(fd, f"{tid}.html", body)
    except OSError:
        return None
    finally:
        if fd is not None:
            os.close(fd)
    return page


def _stub_current(dfd, name, body):
    """True when `name` in `dfd` is a regular single-link file whose bytes are
    exactly `body` — read with O_NOFOLLOW, so a link at the leaf is never
    read through (it reads as not current and gets replaced)."""
    st = _sfs.lstat(dfd, name)
    if st is None or not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
        return False
    want = body.encode("utf-8")
    if st.st_size != len(want):
        return False
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=dfd)
    except OSError:
        return False
    try:
        return os.read(fd, len(want) + 1) == want
    finally:
        os.close(fd)


_link_memo = {}  # T-1081: (tid, progress) -> link target, resolved once per render


def ticket_link_target(con, tid, progress=False):
    """Memoized per id for the render (T-1081): action_row() rebuilds its
    segments once per (limit, successor tier) candidate, and every rebuild
    asks for the same ids again — the answer cannot change within one render."""
    key = (tid, progress)
    if key not in _link_memo:
        _link_memo[key] = _ticket_link_target(con, tid, progress)
    return _link_memo[key]


def _ticket_link_target(con, tid, progress=False):
    """The OSC 8 link target for `tid`: `ticket_path()` still gates existence
    + path safety exactly as before (an id the index doesn't know, or whose
    path carries a control byte, links to nothing at all — unchanged); once
    gated, the link is always the viewer jump page, degrading to no link at
    all — never to the raw md — when no viewer exists yet (T-805)."""
    if ticket_path(con, tid) is None:
        # T-1014: no index row (index stale: a ticket made or moved since the
        # last reindex) is not "no ticket" — this render already scanned the
        # md files, so a scanned id links without it. A row that EXISTS but
        # failed the path-safety gate stays refused.
        if tid not in tid_status or _index_has_row(con, tid):
            return None
    return viewer_jump_path(tid, progress)


def _index_has_row(con, tid):
    if con is None:
        return False
    try:
        return con.execute("SELECT 1 FROM tickets WHERE id=?", (tid,)).fetchone() is not None
    except Exception:
        return False


def collapse(items, limit):
    """`items` capped to `limit`, with the dropped count — the "long lists
    collapse to a count + first ids" width-budget rule."""
    return (items, 0) if len(items) <= limit else (items[:limit], len(items) - limit)

LINE_CAP = 200
links = {}  # ticket_id -> resolved viewer link target (T-805), filled in as segments are built;
            # consumed AFTER the belt-clean below, never before (clean() would
            # strip the OSC 8 escape bytes as control characters, same as it
            # strips any other Cc/Cf/Zl/Zp — see the wrap step's own note).

# ── T-1147 (v1.14 `lanes`) · T-1330 (= T-1328 C): lane rows under every product row ──
# The lane computation is `prdt_lanes.compute_schedule` — the module `prdt schedule`
# itself imports (T-1145, design R6), imported here, never re-implemented. A module
# import keeps python's bytecode cache (spawning the 20k-line `prdt` recompiled it on
# every render). Read-only: nothing is written. A missing/stale module or any failure =
# no lane rows (degrade silently). T-1330: read in every stage; a version with no gate
# lane gets one default 자투리 lane over its open+done tickets (the module's own fill).


def read_lanes():
    """{line (None = home): [lane dict]} for every product, any stage; absent = no lane rows."""
    want = [r["line"] for r in rows]
    if not want:
        return {}
    try:
        import prdt_lanes
        from pathlib import Path
        tickets = prdt_lanes._schedule_tickets(Path(root))
        in_flight = prdt_lanes._schedule_in_flight(Path(root))
    except Exception:
        return {}
    out = {}
    for ln in want:
        try:
            sched = prdt_lanes.compute_schedule(root, tickets=tickets, line=ln)
            lanes = [x for x in (sched.get("lanes") if isinstance(sched.get("lanes"), list) else [])
                     if isinstance(x, dict)]
            if not lanes:
                ver = sched.get("version")
                rest = [t for t, (rr, _p) in tickets.items() if rr["version"] == ver and rr["status"] in ("open", "done")]
                lane = prdt_lanes._lane_new(prdt_lanes.LANE_BESTEFFORT_NAME, None, True, ver, besteffort=True)
                prdt_lanes._lane_fill(lane, rest, tickets, in_flight,
                                      {x.get("id"): i for i, x in enumerate(sched.get("rows") or [])})
                lanes = [lane]
        except Exception:
            continue
        out[ln] = lanes
    return out


lane_data = read_lanes()


def _ids(v):
    return [t for t in (v if isinstance(v, list) else []) if isinstance(t, str) and TICKET_RE.match(t)]



running = running_dispatches()
idx = open_index_ro() if (running or dec or req or lane_data) else None


def fmt_group(ids, limit, succ_limit, with_persona=None):
    shown, extra = collapse(ids, limit)
    bits = []
    for tid in shown:
        links[tid] = ticket_link_target(idx, tid, progress=True)  # T-1382: the dec/req id itself
        seg = tid
        if with_persona is not None and with_persona.get(tid):
            seg += "(" + "+".join(persona_label(x) for x in with_persona[tid]) + ")"
        succ = dependents(idx, tid) if succ_limit else []
        if succ:
            s_shown, s_extra = collapse(succ, succ_limit)
            for s in s_shown:
                links.setdefault(s, ticket_link_target(idx, s))
            s_txt = ",".join(s_shown) + (f"+{s_extra}" if s_extra else "")
            seg += f">{s_txt}"
        bits.append(seg)
    if extra:
        bits.append(f"+{extra}")
    return " ".join(bits)


personas = {tid: ps for tid, ps in running}


def action_seg(wait_lim, succ_lim):
    """T-984: the things the user must act on — `dec … | req …`, `0` when empty (T-1019)."""
    return " | ".join([L("decision") + " " + (fmt_group(dec, wait_lim, succ_lim) if dec else "0"),
                       L("request") + " " + (fmt_group(req, wait_lim, succ_lim) if req else "0")])


def action_row():
    """T-1044: the action row is its own row, so it has its own width budget —
    it lists every open id that fits (successors tier 2/1/0 before an id is
    dropped), `+N` only on overflow. Width = `$COLUMNS` when a positive integer
    (capped at LINE_CAP), else LINE_CAP; the belt-clean at the end stays."""
    try:
        cols = int(os.environ.get("COLUMNS", ""))
    except ValueError:
        cols = 0
    cap = min(cols, LINE_CAP) if cols > 0 else LINE_CAP
    candidate = ""
    for lim in range(max(len(dec), len(req), 1), 0, -1):
        for succ in (2, 1, 0):
            candidate = action_seg(lim, succ)
            if dw(candidate) <= cap:
                return clean(candidate, cap=cap, bar=True)
    return clean(candidate, cap=cap, bar=True)


def fit(build, tail=""):
    """T-1017: `tail` (the branch segment) is reserved at the row's end — the
    working segment collapses by tiers, then is cut, to make room; the tail is
    never dropped or truncated mid-name. Width budget (F6): build at the widest limits (working/waiting/successors
    = 3/3/2) and, while the row would exceed LINE_CAP, tighter (2/2/1, then
    1/1/0) — collapsing to counts, never truncation. Belt: sanitized once more
    and capped, so every row stays ONE row whatever any input held."""
    sep = " | " + tail if tail else ""
    for limits in ((3, 3, 2), (2, 2, 1), (1, 1, 0)):
        candidate = build(limits)
        if dw(candidate) + dw(sep) <= LINE_CAP:
            break
    cut = clean(candidate, cap=LINE_CAP - dw(sep), bar=True)
    return cut + sep


def lane_name(lane):
    """R11: the 합격선 name whole (words included); the 자투리 lane's fixed label."""
    return L("lane.besteffort") if lane.get("besteffort") is True else (clean(lane.get("name"), cap=10**6) or "?")


def lane_text(lane, cap):
    """R3 cells of ONE unfinished lane row (plain text; links wrap later):
    `working` ids, then `next` = the head of the lane queue only (R12, shown
    beside `working`), then blockers. `lane: NAME  d/t` is never cut; to fit
    `cap` the working ids fold 3 → 2 → 1 + `+N` → persona off → ids as `+N` →
    one blocker id + `+N` (kind kept) → `…` cut."""
    head = L("lane", name=lane_name(lane)) + "  "
    if not lane.get("linked"):
        return head + L("lane.unlinked")
    head += f"{int(lane.get('done') or 0)}/{int(lane.get('total') or 0)}"
    work, nxt = _ids(lane.get("working")), _ids(lane.get("ready"))[:1]
    work_owner = lane.get("working_owner") if isinstance(lane.get("working_owner"), dict) else {}
    next_owner = lane.get("ready_owner") if isinstance(lane.get("ready_owner"), dict) else {}
    blockers = [(b["id"], b["kind"]) for b in (lane.get("blockers") if isinstance(lane.get("blockers"), list) else [])
                if isinstance(b, dict) and isinstance(b.get("id"), str) and TICKET_RE.match(b["id"])
                and b.get("kind") in ("decision", "request")]
    owners = {t: (personas.get(t) or ([work_owner[t]] if work_owner.get(t) in ASSIGNEES else [])) for t in work}
    owners.update({t: ([next_owner[t]] if next_owner.get(t) in ASSIGNEES else []) for t in nxt})

    def tag(t, persona):
        links.setdefault(t, ticket_link_target(idx, t))
        return t + ("(" + "+".join(persona_label(x) for x in owners[t]) + ")" if persona and owners[t] else "")

    def cells(lim, persona, blk_lim):
        out = [head]
        if work:
            shown, extra = collapse(work, lim) if lim is not None else ([], len(work))
            bits = [tag(t, persona) for t in shown]
            if extra:
                bits.append(f"+{extra}")
            out.append(L("lane.work") + " " + " ".join(bits))
        if nxt:
            out.append(L("lane.next") + " " + tag(nxt[0], persona))
        if not work and not nxt and not blockers:
            out.append(L("lane.work") + " 0")
        if blockers:
            shown, extra = collapse(blockers, blk_lim)
            bits = []
            for t, kind in shown:
                links.setdefault(t, ticket_link_target(idx, t, progress=True))  # T-1382: a dec/req blocker
                bits.append(f"{t}({L('decision' if kind == 'decision' else 'request')})")
            if extra:
                bits.append(f"+{extra}")
            out.append(L("lane.blocker") + " " + " ".join(bits))
        return " | ".join(out)

    steps = [(n, True, 99) for n in (3, 2, 1)] + [(1, False, 99), (None, False, 99), (None, False, 1)]
    cand = ""
    for lim, persona, blk in steps:
        cand = cells(lim, persona, blk)
        if dw(cand) <= cap:
            return cand
    if dw(lane_name(lane)) > 40:   # T-1184 F2b: a long name is never cut, nor are the cells beside it — the row wraps
        return cand
    return head + cut_cols(cand[len(head):], max(cap - dw(head), 1))


def lane_block(lanes, cap):
    """([finished entries], [(lane, text)]) for one product: T-1202 = B — every
    finished gate lane (never 자투리) is an `NAME d/t` entry the product's FIRST
    row carries as `done lanes: …`, table order; then one row per other lane,
    자투리 last. The row cap (MAX_ROWS) counts these rows too (T-1330)."""
    done = [x for x in lanes if x.get("finished") is True and x.get("besteffort") is not True]
    ents = [clean(f"{lane_name(x)} {int(x.get('done') or 0)}/{int(x.get('total') or 0)}", cap=10**6) for x in done]
    out = [(x, lane_text(x, cap)) for x in lanes if not (x.get("finished") is True and x.get("besteffort") is not True)]
    return ents, out


def done_segment(ents, room):
    """(segment, overflow rows): the `done lanes: A 1/1 · B 2/2` first-row segment
    holds as many whole entries as fit `room` columns (T-1184 F2: never cut an
    entry; the first always stays); the rest continue on nameless rows, each
    whole, under the product row."""
    if not ents:
        return "", []
    pre = L("lane.finished", lanes="")
    seg, rest = pre + ents[0], []
    for k, e in enumerate(ents[1:], 1):
        if dw(seg + " · " + e) <= room:
            seg += " · " + e
        else:
            rest = ents[k:]
            break
    rows, cur = [], ""
    for e in rest:
        if cur and room < dw(cur + " · " + e):
            rows.append(({}, cur))
            cur = e
        else:
            cur = cur + " · " + e if cur else e
    if cur:
        rows.append(({}, cur))
    return seg, rows


def lane_cap():
    try:
        cols = int(os.environ.get("COLUMNS", ""))
    except ValueError:
        cols = 0
    return min(cols, LINE_CAP) if cols > 0 else LINE_CAP


# T-984 layout (user-confirmed 2026-10-06):
#   <label> <version> | stage: <stage> n/m | total tickets n/m | branch: <b>   (T-1017; T-1330: no working)
# One row per line, home first, then ALWAYS one `dec … | req …` row last
# (`dec 0 | req 0` when empty, T-1019), single-line and multi-line alike.
# Never more than MAX_ROWS rows, lane rows included (T-1330 / T-1372 2 = A): past it the
# trailing product + lane rows fold into one `+N more rows` row (T-1374 = A).
out_rows = []
running_rows = set()  # T-1442: indexes of out_rows holding a running dispatch id


def lanes_with_running(lanes, r):
    """T-1330: the product row has no `working` cell — every running dispatch of the
    product sits on a lane row. One no lane row holds (another version's ticket, a
    finished lane, a lane read that failed) joins the 자투리 lane, made when absent;
    a failed lane read leaves one default 자투리 lane over the version's counts."""
    lanes = [dict(x) for x in lanes]
    if not lanes:
        lanes = [{"besteffort": True, "linked": True, "done": r["vdone"], "total": r["vtotal"], "working": []}]
    held = {t for x in lanes if x.get("linked") and not (x.get("finished") is True and x.get("besteffort") is not True)
            for t in _ids(x.get("working"))}
    extra = [tid for tid, _ in running if line_of(tid) == r["line"] and tid not in held]
    if extra:
        be = next((x for x in lanes if x.get("besteffort") is True), None)
        if be is None:
            be = {"besteffort": True, "linked": True, "done": 0, "total": 0, "working": []}
            lanes.append(be)
        be["working"] = _ids(be.get("working")) + extra
    return lanes


# T-1147: parallel to `rows` — [(lane, text)] under each product row. A lane
# rendering failure (odd data) = the default 자투리 row only; the rest stays intact.
lane_parts = []
for r in rows:
    try:
        lane_parts.append(lane_block(lanes_with_running(lane_data.get(r["line"], []), r), lane_cap()))
    except Exception:
        lane_parts.append(lane_block(lanes_with_running([], r), lane_cap()))

# T-1147: lane rows go right under their product row; T-1330: they count toward MAX_ROWS.

# product rows — T-1330: no `working` cell; running dispatches sit on lane rows
for k, r in enumerate(rows):
    head = [r["slug_ver"]] + (home_cells() if r["line"] is None else []) + [r["stage"]]
    if r["vtotal"]:
        head.append(L("ticket", n=f"{r['vdone']}/{r['vtotal']}"))
    branch = L("branch", name=r["branch"]) if r["branch"] else ""
    # T-1202 = B: finished lanes ride the first row (after tickets, before working); what does not fit continues below
    try:
        floor = " | ".join(head + ([branch] if branch else []))
        done_seg, done_more = done_segment(lane_parts[k][0], max(lane_cap() - dw(floor) - 3, 1))
    except Exception:
        done_seg, done_more = "", []
    if done_seg:
        head.append(done_seg)
    lane_rows_k = done_more + lane_parts[k][1]
    out_rows.append((r["slug_ver"], fit(lambda lim, head=head: " | ".join(head), branch)))
    out_rows.extend((None, t) for _, t in lane_rows_k)
    # T-1442: lane rows that carry a running dispatch id are never folded away
    for j, (lane_x, _) in enumerate(lane_rows_k):
        if isinstance(lane_x, dict) and lane_x.get("linked") and _ids(lane_x.get("working")):
            running_rows.add(len(out_rows) - len(lane_rows_k) + j)
if len(out_rows) >= MAX_ROWS:
    keep = MAX_ROWS - 2
    kept = out_rows[:keep] + [r_ for i, r_ in enumerate(out_rows) if i >= keep and i in running_rows]
    out_rows = kept + [(None, L("lines", n=len(out_rows) - len(kept)))]
out_rows.append((None, action_row()))


def wrap_links(text, link_map):
    """OSC 8-wraps EVERY occurrence of each ticket id in `text` that resolved
    to a file (F4 — a running and a waiting id can be the same ticket), run
    AFTER the belt-clean above (never before — clean()
    strips Cc, which an OSC 8 escape is made of, so linking earlier would just
    delete the links it added). Only ever wraps a `T-NNN` token this script
    itself put in `text` (TICKET_RE-matched throughout), never raw project
    text; the URI is percent-encoded (F5 — a root with a space is still a
    valid `file://` link, and no byte outside RFC 3986's unreserved set, let
    alone a control byte, can reach the terminal's OSC parser). A terminal
    that does not understand OSC 8 reads to the ST terminator and shows
    nothing but the id (ECMA-48) — the same graceful degrade `prdt`'s own
    OSC 8 output already relies on (T-409); which actual Claude Code surfaces
    render it as clickable (CLI terminal vs. the GUI's embedded terminal) is
    unverified from here and is left for a human to confirm by running it."""
    for tid, p in link_map.items():
        if not p:
            continue
        uri = "file://" + quote(p, safe="/")
        if any(ord(c) < 0x20 or ord(c) == 0x7F for c in uri):
            continue  # belt: nothing but printable ASCII enters the OSC 8 payload
        pat = re.compile(r"(?<![A-Za-z0-9_-])" + re.escape(tid) + r"(?![A-Za-z0-9_-])")
        link = f"\x1b]8;;{uri}\x1b\\{tid}\x1b]8;;\x1b\\"
        text = pat.sub(lambda m, link=link: link, text)
    return text


def wrap_slug(text, slug_ver):
    """T-849/T-922: a row's `<label> <version>` (always its first segment) as
    ONE OSC 8 link to `.prdt/scratch/viewer/viewer.html` when that file exists;
    plain text otherwise. Pure display — only an isfile check, no write. Run
    AFTER wrap_links (the viewer path may itself contain a `T-NNN` directory
    name), and only when the row still opens with the plain label."""
    viewer = os.path.join(root, VIEWER_HTML_REL)
    if not (slug_ver and os.path.isfile(viewer) and text.startswith(slug_ver)):
        return text
    uri = "file://" + quote(viewer, safe="/")
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in uri):
        return text
    return f"\x1b]8;;{uri}\x1b\\{slug_ver}\x1b]8;;\x1b\\" + text[len(slug_ver):]


print("\n".join(wrap_slug(wrap_links(t, links), sv) for sv, t in out_rows))
PYEOF
exit 0
