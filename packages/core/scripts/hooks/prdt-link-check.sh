#!/usr/bin/env bash
# prdt — unlinked-ticket-mention check (T-899; need and wording: T-898 = A).
# Registered on Stop (matcher-less: Stop takes none), its own entry. Acts for the
# PO only (`agent_type` == `prdt-po`); every other Stop exits silently.
#
# WHY. The PO's first mention of a `T-NNN` in a reply carries its viewer link
# (`prdt tickets --link`), and it is often forgotten (T-898: user "이거 자동으로
# 붙게 못하나 링크"). This acts at Stop: the reply is returned to the PO ONCE, so it
# posts the missing link output in the same turn.
#
# WHAT IT CHECKS. The reply's FIRST mention of each ticket id (`T-NNN`, legacy
# `T-PATCH-NNN`) that has a ticket file under docs/tickets. A first mention is
# LINKED when it sits inside a markdown link's text (`[T-NNN](file://…)`, the
# `prdt tickets --link` shape). Later mentions of an id need no link. Ignored:
# fenced code blocks, inline code spans, link destinations, and anything that is
# part of a path or a longer token (`docs/tickets/v1.13/T-899.md`, `xT-1`). An
# id with no ticket file is prose, not a ticket (and `prdt tickets --link` would
# have nothing to print for it).
#
# COEXISTENCE WITH THE OTHER STOP HOOKS.
#   prdt-question-check.sh (blocking, default OFF) — a separate entry, run by the
#     harness for the same Stop. Each hook judges the reply on its own and exits
#     silently on `stop_hook_active`, so the two share ONE retry: the Stop that
#     follows ANY block carries `stop_hook_active: true` and neither hook blocks
#     again. If both would block on the same first Stop, both reasons reach the
#     PO in that one retry (each hook's own `block` output; the harness merges
#     them — if it ever kept only one, the other's notice is dropped, never
#     deferred to a second retry).
#   prdt-user-prompt.sh on Stop (form=outline counter) — never blocks or prints
#     on Stop, so it takes no part in the retry.
#
# ONE BLOCK, NEVER TWO. `stop_hook_active` true → silent.
# WORDING: LINK_CHECK_REASON is the user-approved text (T-899 log, 2026-10-01
# "ㅇㅇ"), used verbatim.
#
# FAILS OPEN. No project (`.prdt/po-state.json` on the cwd chain), malformed
# JSON, missing python3, an unreadable tickets dir, a run past RUN_BUDGET_S —
# each exits 0 silently. A Stop hook must never strand a session.
#
# THE EVENT REACHES PYTHON ON STDIN, NEVER AN ENVIRONMENT VARIABLE (ARG_MAX,
# T-688 개정 1).

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0
case "$EVENT_JSON" in
  *'"prdt-po"'*) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$EVENT_JSON" | python3 -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
: <<'PYEOF'
# ---- python ----
import json, os, re, signal, sys

# User-approved wording (T-899, 2026-10-01). %s #1 joined ', ', #2 joined ' '.
LINK_CHECK_REASON = (
    "[prdt link check] unlinked first mention: %s. "
    "Post `prdt tickets --link %s` output now, in this turn."
)
RUN_BUDGET_S = 5
TICKET_DIR = os.path.join("docs", "tickets")

ID_RE = re.compile(r"(?<![A-Za-z0-9_./\\-])(T-(?:PATCH-)?\d{1,6})(?![\dA-Za-z_]|-[A-Za-z]|\.(?:md|html)\b|/)")
FENCE_RE = re.compile(r"^\s*(?:`{3,}|~{3,})")
CODE_SPAN_RE = re.compile(r"(`+)(?:(?!\1).)+?\1", re.S)
LINK_RE = re.compile(r"\[([^\]\n]*)\]\(([^)\n]*)\)")


def project_root(cwd):
    d = os.path.realpath(cwd or os.getcwd())
    root = None
    while d and d != "/":
        if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
            root = d
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    return root


def ticket_ids(root):
    """Set of ticket ids with a file under docs/tickets; None = unreadable (fail open)."""
    base = os.path.join(root, TICKET_DIR)
    if not os.path.lexists(base):
        return set()
    if not os.path.isdir(base) or not os.access(base, os.R_OK | os.X_OK):
        return None
    out, broken = set(), []
    for d, dirs, files in os.walk(base, onerror=broken.append):
        if d[len(base):].count(os.sep) >= 3:
            dirs[:] = []
        for fn in files:
            m = re.match(r"^(T-(?:PATCH-)?\d{1,6})\.md$", fn)
            if m:
                out.add(m.group(1))
    return None if broken else out


def mask_code(text):
    """Blank fenced blocks and inline code spans (same length, newlines kept)."""
    out, in_fence = [], False
    for ln in text.split("\n"):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
            out.append(" " * len(ln))
        elif in_fence:
            out.append(" " * len(ln))
        else:
            out.append(CODE_SPAN_RE.sub(lambda m: " " * len(m.group(0)), ln))
    return "\n".join(out)


def unlinked_first_mentions(text, known):
    masked = mask_code(text)
    # link regions: label span (a mention there is LINKED) and destination span
    # (a mention there is not a mention at all)
    labels, dests = [], []
    for m in LINK_RE.finditer(masked):
        labels.append((m.start(1), m.end(1)))
        dests.append((m.start(2), m.end(2)))
    inside = lambda spans, p: any(a <= p < b for a, b in spans)
    seen, bad = set(), []
    for m in ID_RE.finditer(masked):
        tid, pos = m.group(1), m.start(1)
        if tid in seen or tid not in known or inside(dests, pos):
            continue
        seen.add(tid)
        if not inside(labels, pos):
            bad.append(tid)
    return bad


def main():
    try:
        raw = sys.stdin.read()
        ev = json.loads(raw) if raw.strip() else None
    except Exception:
        return
    if not isinstance(ev, dict):
        return
    if ev.get("hook_event_name") != "Stop" or ev.get("agent_type") != "prdt-po":
        return
    if ev.get("stop_hook_active") is True:
        return
    reply = ev.get("last_assistant_message")
    if not (isinstance(reply, str) and reply.strip()) or "T-" not in reply:
        return
    root = project_root(ev.get("cwd"))
    if not root:
        return
    known = ticket_ids(root)
    if not known:
        return
    bad = unlinked_first_mentions(reply, known)
    if not bad:
        return
    sys.stdout.write(json.dumps({
        "decision": "block",
        "reason": LINK_CHECK_REASON % (", ".join(bad), " ".join(bad)),
    }))


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
