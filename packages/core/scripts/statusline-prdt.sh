#!/usr/bin/env bash
# prdt statusline — PURE DISPLAY (§10). No writes, no side effects, with one
# narrow exception (T-805): a ticket id's OSC 8 link target is the tiny viewer
# jump stub `.prdt/scratch/viewer/at/T-NNN.html` (T-746) already written by
# `prdt tickets --link`/`prdt viewer`, created here on demand when missing —
# a small, idempotent, derived-artifact write (doctrine #6: a tool maintains
# what it can generate), never project state, and never the full viewer
# regeneration those commands also do (see `viewer_jump_path` below for why).
# The state/cost recording that full's statusline smuggled in lives in
# hooks/prdt-post-dispatch.sh.
#
# Format (T-984, user-confirmed 2026-10-06; T-961 release lines):
#   <label> <version> | stage: <stage> n/m | total tickets <vdone>/<vtotal> | working <ids|0> | branch: <b>   (T-1017: branch last)
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
#   - Never more than MAX_ROWS (17, measured on the user's machine) rows.
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
#   - T-965: `working` ids carry their persona abbreviated (`T-959(des)`,
#     `T-700(dev+qa)`); a working id sits on the row of the line whose folder
#     holds its ticket; `>` successors list ONLY tickets in that line's current
#     version folder.
#   - T-984 dropped the separate `T-NNN <task>→<persona>` current-task segment;
#     in-flight work reads from `working`.
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
    case "${D##*/}" in T-[0-9]|T-[0-9][0-9]|T-[0-9][0-9][0-9]|T-[0-9][0-9][0-9][0-9]|T-[0-9][0-9][0-9][0-9][0-9]) ROOT=""; break ;; esac
  fi
  UP="$(dirname "$D")"
  [ "$UP" = "$D" ] && break
  D="$UP"
done
[ -z "$ROOT" ] && exit 0

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)"
ROOT="$ROOT" SCRIPT_DIR="$SCRIPT_DIR" python3 - <<'PYEOF'
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
    return k if _PROD_NAME_RE.match(k) else "product"


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
TICKET_RE = re.compile(r"\AT-[0-9]{1,5}\Z")


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

# ── T-961 / T-1108: products (pre-v1.14 name: release lines) ─
# The first product is the project slug and reads po-state's top-level stage /
# version; every added product is declared in `.prdt/config.json` `products`
# and reads `po-state.products.<product>`, its tickets under `docs/<product>/tickets/`
# (legacy layout: `docs/tickets/<product>/`). Old `lines` keys are still read.
# No `products` → one row, the single-product project as before (plus T-984 layout).
# KEEP LINE_NAME_RE and the declared-line filter in lockstep with
# LINE_NAME_RE / project_lines in scripts/prdt.
LINE_NAME_RE = re.compile(r"\A(?!v[0-9])(?!backlog\Z)[a-z0-9]+(?:-[a-z0-9]+)*\Z")
# T-923: `<stage> n/m` = done/total of the current version's tickets that belong
# to the current stage. KEEP stage_of_type in lockstep with `stageOfTicketType`
# in packages/viewer/lib/home-graph.mjs (parity test: statusline-stage-parity).
STAGE_DEFINE_TYPES = ("design", "decision")
STAGE_SHIP_TYPES = ("qa", "ops")


def stage_of_type(t):
    if t in STAGE_DEFINE_TYPES:
        return "define"
    if t in STAGE_SHIP_TYPES:
        return "ship"
    return "build"


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
# (backlog excluded) — the same rule as the viewer Home (`waitLists`).
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
    return re.findall(r"T-\d+", m.group(1)) if m else []


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
                mty = re.search(r"^(?:type|stage):\s*(\S+)", head, re.M)
                stg = stage_of_type(mty.group(1) if mty else "")
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


for r in rows:
    scan(tickets_base(r["line"]), r)
    r["stage"] = stage_seg(r["st"].get("stage"), r["sdone"], r["stotal"])


def _tid_key(t):
    return int(t[2:])


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


def viewer_jump_path(tid):
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
    jdir = os.path.join(root, VIEWER_JUMP_REL)
    page = os.path.join(jdir, f"{tid}.html")
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
        fd = _sfs.open_dir(root, VIEWER_JUMP_REL.split(os.sep), create=True)
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


_link_memo = {}  # T-1081: tid -> link target, resolved once per render


def ticket_link_target(con, tid):
    """Memoized per id for the render (T-1081): action_row() rebuilds its
    segments once per (limit, successor tier) candidate, and every rebuild
    asks for the same ids again — the answer cannot change within one render."""
    if tid not in _link_memo:
        _link_memo[tid] = _ticket_link_target(con, tid)
    return _link_memo[tid]


def _ticket_link_target(con, tid):
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
    return viewer_jump_path(tid)


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

running = running_dispatches()
idx = open_index_ro() if (running or dec or req) else None


def fmt_group(ids, limit, succ_limit, with_persona=None):
    shown, extra = collapse(ids, limit)
    bits = []
    for tid in shown:
        links[tid] = ticket_link_target(idx, tid)
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


def working_seg(ids, limits):
    run_lim, _, succ_lim = limits
    return L("working") + " " + (fmt_group(ids, run_lim, succ_lim, personas) if ids else "0")


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


# T-984 layout (user-confirmed 2026-10-06):
#   <label> <version> | stage: <stage> n/m | total tickets n/m | working … | branch: <b>   (T-1017)
# One row per line, home first, then ALWAYS one `dec … | req …` row last
# (`dec 0 | req 0` when empty, T-1019), single-line and multi-line alike.
# Never more than MAX_ROWS rows: past it, the last line rows fold into `+N lines`.
line_budget = MAX_ROWS - 1
shown = rows if len(rows) <= line_budget else rows[:line_budget - 1]
out_rows = []
for r in shown:
    head = [r["slug_ver"], r["stage"]]
    if r["vtotal"]:
        head.append(L("ticket", n=f"{r['vdone']}/{r['vtotal']}"))
    ids = [tid for tid, _ in running if line_of(tid) == r["line"]]
    branch = L("branch", name=r["branch"]) if r["branch"] else ""
    out_rows.append((r["slug_ver"], fit(lambda lim, head=head, ids=ids:
                                        " | ".join(head + [working_seg(ids, lim)]), branch)))
if len(shown) < len(rows):
    out_rows.append((None, L("lines", n=len(rows) - len(shown))))
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
