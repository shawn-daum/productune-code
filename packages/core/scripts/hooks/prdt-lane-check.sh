#!/usr/bin/env bash
# prdt — idle gate lane check (T-1272).
# Registered on Stop (matcher-less: Stop takes none). Acts for the PO only
# (`agent_type` == `prdt-po`); every other Stop — a worker, a plain session —
# exits silently.
#
# WHY. The lane loop (`spare-capacity` playbook) lived only in text the PO reads:
# Fill ran on a turn close or a worker return, and when every live job was long
# and the dispatch gate denied, nothing re-tried — lanes sat idle for an hour
# (T-1272 §실측). This hook catches the idle lane at the PO's Stop.
#
# WHAT IT DOES. It reads the lanes `prdt schedule` computes (`prdt_lanes.
# compute_schedule`, imported — never re-derived) for every product in stage
# `build`, and blocks the stop ONCE when a GATE lane (a 합격선 row, never the
# 자투리 lane) is IDLE:
#   - linked, not finished, nothing in flight (`working` empty), a `ready` row;
#   - not stopped by the user's need — its head (the lane's first open ticket in
#     `prdt schedule` row order) is an open decision or `assignee: user`
#     request (`waiting-user` row);
#   - not paused by the user's stop — a RECORDED state, never guessed from
#     transcript text: the PO runs `prdt lanes pause [<lane>…]` the turn the user
#     says stop (`resume` on go); the state is `<PRDT_HOME>/run/lanes-paused/
#     <project key>.json`, key = sha256(physical project root)[:16] (the CLI's
#     `_lane_run_key`). Named lanes → those lanes, none named → every lane;
#   - no `prdt dispatch wait` running FOR THIS PROJECT: each wait writes its own
#     marker `<PRDT_HOME>/run/lane-waits/<project key>/<pid>.json`; a live pid
#     whose command line is still `prdt dispatch wait` counts, another
#     project's wait never does.
# The reason names the idle lanes and their `ready` ids.
#
# ONE BLOCK, NEVER TWO. `stop_hook_active` (true on the Stop that follows a
# block) makes this hook exit silently — the harness's own loop guard, the same
# one prdt-question-check.sh relies on.
#
# OFF SWITCH. `PRDT_LANE_CHECK=off` in the hook's environment turns it off.
#
# FAILS OPEN. No project, no prdt_lanes module, a schedule error, a run past RUN_BUDGET_S seconds — each exits 0 with no output.
#
# THE EVENT REACHES PYTHON ON STDIN, NEVER THROUGH AN ENVIRONMENT VARIABLE
# (T-688 개정 1: ARG_MAX on a large `last_assistant_message`).

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0
# Fork-0 pre-filter: every non-PO Stop leaves here before python3 starts.
case "$EVENT_JSON" in
  *'"prdt-po"'*) ;;
  *) exit 0 ;;
esac
[ "${PRDT_LANE_CHECK:-on}" = "off" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0
PRDT_LANE_HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" \
  python3 -I -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')" <<<"$EVENT_JSON"
exit 0
# The heredoc below is never executed (`exit 0` above): it only keeps the python
# body out of bash's parser, so `bash -n` still reads this file end to end.
: <<'PYEOF'
# ---- python ----
import hashlib, json, os, re, signal, subprocess, sys, unicodedata

# WORDING: designer inject-edit (T-1272, settled 2026-10-26).
# %s = the idle lanes with their ready ids ("L1: T-1270, T-1271 · L3: T-1268").
LANE_CHECK_REASON = (
    "[prdt lane check] idle gate lane — a `next`/`ready` row, nothing in flight, no user stop: %s. "
    "Dispatch its next row now, in the background (`spare-capacity` playbook §Fill). Dispatch gate "
    "WAITING deny → Bash `prdt dispatch wait` with `run_in_background`; its exit re-runs Fill — never "
    "wait for a return. Row skipped for file overlap with a live dispatch, or lane the user stopped → "
    "one reply line naming it."
)
LIST_CAP = 5
RUN_BUDGET_S = 5
WAIT_RE = re.compile(r"(?:^|[\s/])prdt\s+dispatch(?:\s+--?[\w-]+(?:[= ]\S+)?)*\s+wait(?:\s|$)")


def read_event():
    try:
        raw = sys.stdin.read()
        ev = json.loads(raw) if raw.strip() else None
    except Exception:
        return None
    return ev if isinstance(ev, dict) else None


def project_root(cwd):
    # OUTERMOST dir holding .prdt/po-state.json, physical path first (T-484/T-493),
    # the same walk prdt-user-prompt.sh and prdt-post-dispatch.sh make.
    d = os.path.realpath(cwd or os.getcwd())
    root = None
    while d and d != "/":
        if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
            root = d
        # T-1112: a track worktree (tracks/T-NNN, .git is a file) is a project boundary
        if (os.path.isfile(os.path.join(d, ".git")) and os.path.basename(os.path.dirname(d)) == "tracks"
                and re.match(r"\AT-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?[0-9]{1,5}\Z", os.path.basename(d))):  # T-1298: T-NNN or T-<PREFIX>-<n>
            root = None
            break
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    return root


def load_lanes_module():
    here = os.environ.get("PRDT_LANE_HOOK_DIR") or ""
    for c in (os.path.join(here, "..", "bin"), os.path.join(here, "..")):
        if os.path.isfile(os.path.join(c, "prdt_lanes.py")):
            sys.path.insert(0, os.path.realpath(c))
            import prdt_lanes
            return prdt_lanes
    return None


def prdt_home():
    return os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")


def run_key(root):
    return hashlib.sha256(os.path.realpath(root).encode("utf-8")).hexdigest()[:16]


def paused_lanes(root):
    """None = nothing paused; "all" = every lane; else a set of lane names (the recorded state
    `prdt lanes pause` wrote)."""
    try:
        with open(os.path.join(prdt_home(), "run", "lanes-paused", run_key(root) + ".json"), encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(d, dict):
        return None
    if d.get("all"):
        return "all"
    names = {x for x in d.get("lanes") or [] if isinstance(x, str)}
    return names or None


def wait_running(root):
    """A live `prdt dispatch wait` of THIS project: its own marker, pid alive, command line still the wait."""
    d = os.path.join(prdt_home(), "run", "lane-waits", run_key(root))
    try:
        files = [f for f in os.listdir(d) if f.endswith(".json")]
    except OSError:
        return False
    for f in files:
        try:
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                m = json.load(fh)
            pid = m.get("pid")
            if not isinstance(m, dict) or not isinstance(pid, int) or pid <= 0:
                continue
            if os.path.realpath(m.get("project_root") or "") != os.path.realpath(root):
                continue
            os.kill(pid, 0)
            out = subprocess.run(["ps", "-p", str(pid), "-o", "args="], capture_output=True, text=True, timeout=2).stdout
        except PermissionError:
            continue
        except Exception:
            continue
        if WAIT_RE.search(out):
            return True
    return False


def idle_lanes(pl, root):
    st = pl.read_json(os.path.join(root, ".prdt", "po-state.json")) or {}
    out = []
    for line in pl.gate_lines(root):
        if pl.line_state(st, line)[0] != "build":
            continue
        s = pl.compute_schedule(root, line=line)
        order = [r["id"] for r in s.get("rows") or []]
        state = {r["id"]: r["state"] for r in s.get("rows") or []}
        for ln in s.get("lanes") or []:
            if ln.get("besteffort") or not ln.get("linked") or ln.get("finished"):
                continue
            if ln.get("working") or not ln.get("ready"):
                continue
            members = set(ln.get("tickets") or [])
            head = next((t for t in order if t in members), None)
            if head is not None and state.get(head) == "waiting-user":
                continue
            out.append((ln["name"], list(ln["ready"])))
    return out


def safe_label(text, limit=60):
    # T-1294: repo-sourced names (lane · ticket id) on a Stop reason — the CLI's
    # safe_label contract: fold line breaks / invisible / format chars to a space,
    # clip to `limit`.
    s = "".join(" " if (unicodedata.category(c) in ("Cf", "Cc", "Zl", "Zp") or c == "\x85") else c
                for c in str(text))
    return s[:limit]


def cap(items):
    items = [safe_label(i) for i in items]
    shown = ", ".join(items[:LIST_CAP])
    return shown + (", +%d more" % (len(items) - LIST_CAP) if LIST_CAP < len(items) else "")


def main():
    ev = read_event()
    if ev is None:
        return
    if ev.get("hook_event_name") != "Stop" or ev.get("agent_type") != "prdt-po":
        return
    if ev.get("stop_hook_active") is True:
        return
    root = project_root(ev.get("cwd"))
    if not root:
        return
    pl = load_lanes_module()
    if pl is None:
        return
    idle = idle_lanes(pl, root)
    if not idle:
        return
    stop = paused_lanes(root)
    if stop == "all":
        return
    if stop:
        idle = [(n, ids) for n, ids in idle if n not in stop]
    if not idle or wait_running(root):
        return
    parts = ["%s: %s" % (safe_label(n), cap(ids)) for n, ids in idle]
    lanes = " · ".join(parts[:LIST_CAP]) + (" · +%d more" % (len(parts) - LIST_CAP) if LIST_CAP < len(parts) else "")
    sys.stdout.write(json.dumps({"decision": "block", "reason": LANE_CHECK_REASON % lanes}, ensure_ascii=False))


def _out_of_budget(*_):
    raise TimeoutError()


try:
    signal.signal(signal.SIGALRM, _out_of_budget)
    signal.alarm(RUN_BUDGET_S)
    main()
except BaseException:
    pass
sys.exit(0)
PYEOF
