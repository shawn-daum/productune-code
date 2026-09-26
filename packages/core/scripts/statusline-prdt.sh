#!/usr/bin/env bash
# prdt statusline — PURE DISPLAY (§10). No writes, no side effects; the state/cost
# recording that full's statusline smuggled in lives in hooks/prdt-post-dispatch.sh.
#
# Format: <slug> | <version> | <stage> <sdone>/<stotal> | total <vdone>/<vtotal> | T-NNN <task>→<persona> | branch: <branch>
#   - <stage> N/M counts ONLY tickets whose type maps to the current stage
#     (TYPE_TO_STAGE); `| total` is the version-wide open+done count, appended
#     only when out-of-stage tickets exist (else it would duplicate the stage count).
#   - <task> slug is capped at 16 chars (+ …) so a long slug can't blow out the line.
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
  UP="$(dirname "$D")"
  [ "$UP" = "$D" ] && break
  D="$UP"
done
[ -z "$ROOT" ] && exit 0

ROOT="$ROOT" python3 - <<'PYEOF'
import json, os, re, sqlite3, subprocess, unicodedata
from datetime import datetime, timezone
from urllib.parse import quote

root = os.environ["ROOT"]
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
    return (s[:cap] + "\u2026") if len(s) > cap else s


slug = clean(cfg_slug) or clean(os.path.basename(root)) or "?"
stage = token(st.get("stage"), lambda v: v in STAGES, absent="?") or "?"
version = token(st.get("version"), lambda v: VERSION_RE.match(v) is not None)
parts = [slug]

# ticket type → prdt stage. Keyed on the REAL ticket-type enum (design/impl/qa/ops
# — TICKET_TYPES in scripts/prdt); idiomatic aliases follow so free-form/legacy
# frontmatter still buckets. Prior map keyed on types that never ship (feature/
# deploy/…) and sent qa→retro + left ops unmapped, so the `ship` bucket was always
# empty (T-403 LOW). ops→ship fixes that. Unmapped types fall to the version total.
TYPE_TO_STAGE = {
    # canonical enum
    "design": "define", "impl": "build", "qa": "build", "ops": "ship",
    # tolerated aliases
    "docs": "define", "prd": "define", "spec": "define", "feature": "define",
    "build": "build", "refactor": "build", "bug": "build", "fix": "build",
    "chore": "build", "test": "build",
    "deploy": "ship", "release": "ship",
    "retro": "retro", "close": "retro",
}

# ticket progress for the current version dir:
#   sdone/stotal — tickets whose type maps to the current stage
#   vdone/vtotal — all open+done tickets in the version (version-wide)
sdone = stotal = vdone = vtotal = 0
# `version` reaches the filesystem here, so only a SHAPE-MATCHED value is used
# (`<withheld>` / off-shape → no counting, and no `../` reaching os.listdir).
tdir = os.path.join(root, "docs", "tickets", version) if VERSION_RE.match(version or "") else ""
# T-682 "waiting": open `type: decision` and open `assignee: user` tickets —
# scoped to this SAME current-version directory (not a repo-wide walk on every
# prompt): reused from the loop below that already opens every ticket file
# here for the stage/version counts, so this costs no extra file reads.
waiting = []
if tdir and os.path.isdir(tdir):
    for fn in os.listdir(tdir):
        if not (fn.startswith("T-") and fn.endswith(".md")):
            continue
        try:
            head = open(os.path.join(tdir, fn)).read(600)
        except OSError:
            continue
        ms = re.search(r"^status:\s*(\S+)", head, re.M)
        s = ms.group(1) if ms else ""
        if s not in ("done", "open"):
            continue
        is_done = s == "done"
        vtotal += 1
        vdone += is_done
        mt = re.search(r"^(?:type|stage):\s*(\S+)", head, re.M)
        ttype = mt.group(1) if mt else ""
        if TYPE_TO_STAGE.get(ttype) == stage:
            stotal += 1
            sdone += is_done
        if s == "open":
            ma = re.search(r"^assignee:\s*(\S+)", head, re.M)
            tassignee = ma.group(1) if ma else ""
            if ttype == "decision" or tassignee == "user":
                tid = fn[:-3]
                if TICKET_RE.match(tid):
                    waiting.append(tid)
waiting = sorted(set(waiting))

if version and version != slug:
    parts.append(version)
if stotal:
    prog = f"{stage} {sdone}/{stotal}"
    if vtotal != stotal:  # out-of-stage tickets exist → surface the version total too
        prog += f" | total {vdone}/{vtotal}"
    parts.append(prog)
elif vtotal:
    parts.append(f"{stage} | total {vdone}/{vtotal}")
else:
    parts.append(stage)

ct = st.get("current_task")
ct_tid = None  # the TICKET_RE-matched current_task id, for the OSC 8 link step (F4)
if isinstance(ct, dict) and (ct.get("ticket_id") or ct.get("slug")):
    tid = token(ct.get("ticket_id"), lambda v: TICKET_RE.match(v) is not None)
    ct_tid = tid if TICKET_RE.match(tid or "") else None
    who = token(ct.get("assignee"), lambda v: v in ASSIGNEES)
    tslug = clean(ct.get("slug"), cap=16)  # cap so a long slug can't blow out the line
    seg = " ".join(x for x in (tid, tslug) if x)
    if seg:
        parts.append(f"{seg}→{who}" if who else seg)

# branch (T-426): meta/code split projects (PRD history §v1.3) carry no `.git` at
# root — the code repo lives at `<root>/<config.code.dir>` (default "code").
# Mirrors project-kind.ts codeDirName/codeRoot (THE CONTRACT) so this stays in
# lockstep with the CLI/GUI resolution; kept local since this is a pure bash+
# python display script with no import path into that TS module.
CODE_DIR_DEFAULT = "code"


def code_dir_name():
    """config.code.dir (a non-empty str, not escaping root) or None."""
    try:
        cfg = json.load(open(os.path.join(root, ".prdt", "config.json")))
    except Exception:
        return None
    if isinstance(cfg, dict) and isinstance(cfg.get("code"), dict):
        d = cfg["code"].get("dir")
        if isinstance(d, str) and d.strip():
            t = d.strip()
            if os.path.isabs(t) or ".." in re.split(r"[/\\]+", t):
                return None
            return t
    return None


def git_branch(path):
    try:
        r = subprocess.run(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
                            capture_output=True, text=True, timeout=2)
        b = r.stdout.strip()
        return b if r.returncode == 0 and b else None
    except Exception:
        return None


# Root repo wins (non-split projects, unchanged); else the configured/default
# code repo; else the segment is silently absent (pure-display degrade rule).
br = git_branch(root)
if br is None:
    br = git_branch(os.path.join(root, code_dir_name() or CODE_DIR_DEFAULT))
br = clean(br)
if br:
    parts.append(f"branch: {br}")

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


def dependents(con, tid):
    """Tickets that name `tid` in THEIR OWN `deps` (edges: rel='deps' rows are
    (src depends on dst) — a ticket depending on X is the row (X's dependant,
    'deps', X)). One query answers both directions this ticket asks for: a
    running ticket's direct successors, and a waiting ticket's "what this
    blocks" — both are "who has ME in their deps."."""
    if con is None:
        return []
    try:
        rows = con.execute(
            "SELECT DISTINCT src FROM edges WHERE rel='deps' AND dst=? ORDER BY src", (tid,)
        ).fetchall()
    except Exception:
        return []
    return [r[0] for r in rows if isinstance(r[0], str) and TICKET_RE.match(r[0])]


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


def collapse(items, limit):
    """`items` capped to `limit`, with the dropped count — the "long lists
    collapse to a count + first ids" width-budget rule."""
    return (items, 0) if len(items) <= limit else (items[:limit], len(items) - limit)


LINE_CAP = 200
links = {}  # ticket_id -> resolved path, filled in as segments are built;
            # consumed AFTER the belt-clean below, never before (clean() would
            # strip the OSC 8 escape bytes as control characters, same as it
            # strips any other Cc/Cf/Zl/Zp — see the wrap step's own note).

running = running_dispatches()
idx = open_index_ro() if (running or waiting or ct_tid) else None
if ct_tid:
    links[ct_tid] = ticket_path(idx, ct_tid)  # F4: the current_task id links too


def fmt_group(ids, limit, succ_limit, with_persona=None):
    shown, extra = collapse(ids, limit)
    bits = []
    for tid in shown:
        links[tid] = ticket_path(idx, tid)
        seg = tid
        if with_persona is not None and with_persona.get(tid):
            seg += "→" + "+".join(with_persona[tid])
        succ = dependents(idx, tid) if succ_limit else []
        if succ:
            s_shown, s_extra = collapse(succ, succ_limit)
            for s in s_shown:
                links.setdefault(s, ticket_path(idx, s))
            s_txt = ",".join(s_shown) + (f"+{s_extra}" if s_extra else "")
            seg += f"»{s_txt}"
        bits.append(seg)
    if extra:
        bits.append(f"+{extra}")
    return " ".join(bits)


def tail_segments(limits):
    run_lim, wait_lim, succ_lim = limits
    out = []
    if running:
        personas = {tid: ps for tid, ps in running}
        out.append("running " + fmt_group([tid for tid, _ in running], run_lim, succ_lim, personas))
    if waiting:
        out.append("waiting " + fmt_group(waiting, wait_lim, succ_lim))
    return out


# Width budget (F6): the belt below caps the whole line at LINE_CAP, and at
# full fan-out the cap used to fall INSIDE the waiting segment — the last one,
# so the one that got cut. The two segments are built with the widest limits
# (running/waiting/successors = 3/3/2) and, when the line would still exceed
# the cap, rebuilt tighter (2/2/1, then 1/1/0) before the belt ever sees it:
# collapsing to counts is the rule the acceptance names, truncation is not.
line = clean(" | ".join(parts), cap=LINE_CAP, bar=True)
if running or waiting:
    for limits in ((3, 3, 2), (2, 2, 1), (1, 1, 0)):
        candidate = " | ".join(parts + tail_segments(limits))
        if len(candidate) <= LINE_CAP:
            break
    # Belt: the assembled line is sanitized once more and length-capped, so this
    # script emits exactly ONE line no matter what any input held.
    line = clean(candidate, cap=LINE_CAP, bar=True)


def wrap_links(text, link_map):
    """OSC 8-wraps EVERY occurrence of each ticket id in `text` that resolved
    to a file (F4 — the current_task id and a running/waiting id can be the
    same ticket), run AFTER the belt-clean above (never before — clean()
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


print(wrap_links(line, links))
PYEOF
exit 0
