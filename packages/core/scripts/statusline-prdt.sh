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
# Format: <slug> <stage> <vdone>/<vtotal> T-NNN <task>→<persona> branch: <branch> | running … | dec … | req …
#   - T-849: the leading segments are space-joined (no version segment, no `|`
#     between them); the slug is an OSC 8 link to `.prdt/scratch/viewer/viewer.html`
#     when that file exists, plain text otherwise. ` | ` only opens the footer.
#   - <vdone>/<vtotal> is ONE version-wide count over every ticket (open+done)
#     in the current version dir, every type included (`decision` too) — T-755:
#     a per-type "which stage is this ticket in" guess (the old TYPE_TO_STAGE
#     map) read wrong the moment a `design`-typed ticket was actually Build
#     work, so the count no longer estimates a stage from ticket type at all.
#   - <task> slug is capped at 16 chars (+ …) so a long slug can't blow out the line.
#   - Trailing footer (T-682, T-849): `running T-NNN[»T-NNN…] | dec T-NNN[»T-NNN…] | req T-NNN[»T-NNN…]`
#     — `dec` = every open `type: decision` ticket, `req` = every open
#     `assignee: user` ticket that is not a decision, across EVERY version
#     directory under docs/tickets (backlog excluded) — the same rule as the
#     viewer Home (`waitLists`, packages/viewer/lib/home-graph.mjs, T-881).
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
import json, os, re, sqlite3, subprocess, sys, unicodedata
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

# ticket progress for the current version dir: ONE version-wide count over
# every open+done ticket, every type included (`decision` too) — T-755 removed
# the per-type "which stage is this ticket in" guess (TYPE_TO_STAGE) that used
# to narrow this to a stage-matched subset; a ticket's `type` no longer affects
# the count at all, only its `status`.
vdone = vtotal = 0
# Directory names reach the filesystem here only SHAPE-MATCHED (VERSION_RE), so
# no `../` and no `<withheld>` ever reaches os.listdir/os.path.join.
# T-849 `dec` / `req`: open `type: decision` tickets, and open `assignee: user`
# tickets that are not decisions, over EVERY version directory (not only the
# current one — a ticket left open in an earlier version folder still waits on
# the user). `backlog` and any non-version-shaped directory are skipped; the
# current version dir is also the one the done/total count reads.
dec = []
req = []
tickets_root = os.path.join(root, "docs", "tickets")
try:
    vdirs = sorted(d for d in os.listdir(tickets_root)
                   if VERSION_RE.match(d) and os.path.isdir(os.path.join(tickets_root, d)))
except OSError:
    vdirs = []
for vd in vdirs:
    dpath = os.path.join(tickets_root, vd)
    try:
        names = os.listdir(dpath)
    except OSError:
        continue
    is_current = vd == version
    for fn in names:
        if not (fn.startswith("T-") and fn.endswith(".md")):
            continue
        try:
            head = open(os.path.join(dpath, fn)).read(600)
        except OSError:
            continue
        ms = re.search(r"^status:\s*(\S+)", head, re.M)
        s = ms.group(1) if ms else ""
        if s not in ("done", "open"):
            continue
        if is_current:
            vtotal += 1
            vdone += s == "done"
        if s != "open":
            continue
        mt = re.search(r"^(?:type|stage):\s*(\S+)", head, re.M)
        ttype = mt.group(1) if mt else ""
        ma = re.search(r"^assignee:\s*(\S+)", head, re.M)
        tassignee = ma.group(1) if ma else ""
        tid = fn[:-3]
        if not TICKET_RE.match(tid):
            continue
        if ttype == "decision":
            dec.append(tid)
        elif tassignee == "user":
            req.append(tid)


def _tid_key(t):
    return int(t[2:])


dec = sorted(set(dec), key=_tid_key)
req = sorted(set(req), key=_tid_key)

if vtotal:
    parts.append(f"{stage} {vdone}/{vtotal}")
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
    # T-842: `.prdt/scratch/**` may hold a committed symlink. Walk
    # .prdt/scratch/viewer/at one component at a time with O_NOFOLLOW (a
    # symlinked one → no link at all) and write the stub relative to that
    # descriptor: O_EXCL|O_NOFOLLOW temp, rename inside the same directory.
    fd = None
    try:
        fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        for part in VIEWER_JUMP_REL.split(os.sep):
            try:
                os.mkdir(part, 0o755, dir_fd=fd)
            except FileExistsError:
                pass
            nfd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nfd
        tmp = f"{tid}.html.tmp{os.getpid()}"
        try:
            os.unlink(tmp, dir_fd=fd)
        except FileNotFoundError:
            pass
        wfd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o644, dir_fd=fd)
        with os.fdopen(wfd, "w", encoding="utf-8") as f:
            f.write(body)
        os.replace(tmp, f"{tid}.html", src_dir_fd=fd, dst_dir_fd=fd)
    except OSError:
        return None
    finally:
        if fd is not None:
            os.close(fd)
    return page


def ticket_link_target(con, tid):
    """The OSC 8 link target for `tid`: `ticket_path()` still gates existence
    + path safety exactly as before (an id the index doesn't know, or whose
    path carries a control byte, links to nothing at all — unchanged); once
    gated, the link is always the viewer jump page, degrading to no link at
    all — never to the raw md — when no viewer exists yet (T-805)."""
    if ticket_path(con, tid) is None:
        return None
    return viewer_jump_path(tid)


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
idx = open_index_ro() if (running or dec or req or ct_tid) else None
if ct_tid:
    links[ct_tid] = ticket_link_target(idx, ct_tid)  # F4: the current_task id links too


def fmt_group(ids, limit, succ_limit, with_persona=None):
    shown, extra = collapse(ids, limit)
    bits = []
    for tid in shown:
        links[tid] = ticket_link_target(idx, tid)
        seg = tid
        if with_persona is not None and with_persona.get(tid):
            seg += "→" + "+".join(with_persona[tid])
        succ = dependents(idx, tid) if succ_limit else []
        if succ:
            s_shown, s_extra = collapse(succ, succ_limit)
            for s in s_shown:
                links.setdefault(s, ticket_link_target(idx, s))
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
    if dec:
        out.append("dec " + fmt_group(dec, wait_lim, succ_lim))
    if req:
        out.append("req " + fmt_group(req, wait_lim, succ_lim))
    return out


# Width budget (F6): the belt below caps the whole line at LINE_CAP, and at
# full fan-out the cap used to fall INSIDE the waiting segment — the last one,
# so the one that got cut. The two segments are built with the widest limits
# (running/waiting/successors = 3/3/2) and, when the line would still exceed
# the cap, rebuilt tighter (2/2/1, then 1/1/0) before the belt ever sees it:
# collapsing to counts is the rule the acceptance names, truncation is not.
head = " ".join(parts)
line = clean(head, cap=LINE_CAP, bar=True)
if running or dec or req:
    for limits in ((3, 3, 2), (2, 2, 1), (1, 1, 0)):
        candidate = " | ".join([head] + tail_segments(limits))
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


def wrap_slug(text):
    """T-849: the project slug (always the first token of the line) as an OSC 8
    link to `.prdt/scratch/viewer/viewer.html` when that file exists; plain
    text otherwise. Pure display — only an isfile check, no write. Run AFTER
    wrap_links (the viewer path may itself contain a `T-NNN` directory name),
    and only when the line still opens with the plain slug."""
    viewer = os.path.join(root, VIEWER_HTML_REL)
    if not (slug and os.path.isfile(viewer) and text.startswith(slug)):
        return text
    uri = "file://" + quote(viewer, safe="/")
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in uri):
        return text
    return f"\x1b]8;;{uri}\x1b\\{slug}\x1b]8;;\x1b\\" + text[len(slug):]


print(wrap_slug(wrap_links(line, links)))
PYEOF
exit 0
