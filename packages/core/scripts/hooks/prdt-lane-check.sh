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
#   - not stopped by the user's explicit stop — the latest user prompt of the
#     session carries a stop phrase (STOP_RE); it names lanes → those lanes,
#     names none → every lane;
#   - no `prdt dispatch wait` running on this machine: a denied dispatch the PO
#     is waiting out counts as in flight (the gate's caps are machine-wide, so a
#     running wait covers every lane).
# The reason names the idle lanes and their `ready` ids.
#
# ONE BLOCK, NEVER TWO. `stop_hook_active` (true on the Stop that follows a
# block) makes this hook exit silently — the harness's own loop guard, the same
# one prdt-question-check.sh relies on.
#
# OFF SWITCH. `PRDT_LANE_CHECK=off` in the hook's environment turns it off.
#
# FAILS OPEN. No project, no prdt_lanes module, a schedule error, an unreadable
# transcript, a run past RUN_BUDGET_S seconds — each exits 0 with no output.
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
import json, os, re, signal, subprocess, sys

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
# The user's explicit stop (`spare-capacity` §Stop: "퇴근", "기록만").
STOP_RE = re.compile(
    r"퇴근|기록만|멈춰|멈추|멈춤|그만|스톱|발주\s*(?:하지|말|멈|중단)|디스패치\s*(?:하지|말|멈|중단)"
    r"|\bstop\s+(?:dispatch|filling|here|for\s+(?:the\s+day|today))|\bcall\s+it\s+a\s+day\b", re.I)
WAIT_RE = re.compile(r"(?:^|[\s/])prdt\s+dispatch\s+wait(?:\s|$)")


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
                and os.path.basename(d)[:2] == "T-" and os.path.basename(d)[2:7].isascii()
                and os.path.basename(d)[2:].isdigit() and len(os.path.basename(d)) <= 7):
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


def latest_prompt(path):
    """The session's latest user-typed prompt text (never a tool result, a task
    notification or another `<…>`-tagged injection); None when unreadable."""
    try:
        if not (isinstance(path, str) and os.path.isfile(path)):
            return None
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - 4 * 1024 * 1024))
            lines = f.read().decode("utf-8", "replace").split("\n")
    except OSError:
        return None
    for jl in reversed(lines):
        jl = jl.strip()
        if not jl:
            continue
        try:
            rec = json.loads(jl)
        except Exception:
            continue
        if not isinstance(rec, dict) or rec.get("type") != "user" or rec.get("isSidechain") is not False:
            continue
        msg = rec.get("message")
        content = msg.get("content") if isinstance(msg, dict) else None
        if isinstance(content, str):
            texts = [content]
        elif isinstance(content, list):
            texts = [b.get("text") for b in content if isinstance(b, dict) and b.get("type") == "text"
                     and isinstance(b.get("text"), str)]
        else:
            continue
        texts = [t for t in texts if t.strip() and not t.lstrip().startswith("<")]
        if texts:
            return "\n".join(texts)
    return None


def stopped_lanes(prompt, names):
    """None = no stop; a set of lane names = those lanes; "all" = every lane."""
    if not prompt or not STOP_RE.search(prompt):
        return None
    # a lane is named by its whole name or its first word (`L1 결정/질문` → `L1`)
    named = {n for n in names if any(re.search(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(k), prompt)
                                     for k in {n, n.split()[0] if n.split() else n})}
    return named or "all"


def wait_running():
    try:
        out = subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=2).stdout
    except Exception:
        return False
    return any(WAIT_RE.search(ln) for ln in out.splitlines())


def idle_lanes(pl, root):
    st = pl.read_json(os.path.join(root, ".prdt", "po-state.json")) or {}
    out = []
    for line in [None] + list(pl.project_line_names(root)):
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


def cap(items):
    shown = ", ".join(items[:LIST_CAP])
    return shown + (", +%d more" % (len(items) - LIST_CAP) if len(items) > LIST_CAP else "")


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
    stop = stopped_lanes(latest_prompt(ev.get("transcript_path")), [n for n, _ in idle])
    if stop == "all":
        return
    if stop:
        idle = [(n, ids) for n, ids in idle if n not in stop]
    if not idle or wait_running():
        return
    parts = ["%s: %s" % (n, cap(ids)) for n, ids in idle]
    lanes = " · ".join(parts[:LIST_CAP]) + (" · +%d more" % (len(parts) - LIST_CAP) if len(parts) > LIST_CAP else "")
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
