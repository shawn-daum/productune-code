#!/usr/bin/env bash
# prdt — Claude Code stage-guard hook (v1 hook #4). Registered ONCE:
#   UserPromptSubmit (no matcher) — every user prompt in the main session.
#
# WHY (T-336, hanta 2026-07-13): the PO habit's lifecycle signal points were
# "turn open" + "prdt doctor" — both probabilistic. In a 10-day resumed session
# the PO read po-state once (day 1) and never ran doctor, so "main pr →
# 머지완료 → 배포 완료" executed a full deploy with stage still "build": no
# ship-entry readiness, no stage write, and Retro only when the user asked.
# This hook makes the signal deterministic:
#   a) every prompt re-injects ONE live po-state line (the turn-open read the
#      habit assumes, now guaranteed even in long-lived sessions);
#   b) a deploy-shaped prompt while stage is define/build gets an explicit
#      ship-entry warning at exactly the observed failure moment.
# Advisory only (additionalContext) — soft stages stay soft, the PO judges;
# false positives cost one line. Silent no-op outside prdt projects and on any
# read/parse failure (a state hook must never break a session).

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

PRDT_EVENT_JSON="$EVENT_JSON" python3 - <<'PYEOF'
import json, os, re, sys

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    sys.exit(0)
if not isinstance(ev, dict):
    sys.exit(0)

# project root: walk up from event cwd (same routine as prdt-post-dispatch.sh)
d = ev.get("cwd") or os.getcwd()
state_path = None
while d and d != "/":
    p = os.path.join(d, ".prdt", "po-state.json")
    if os.path.isfile(p):
        state_path = p
        break
    d = os.path.dirname(d)
if not state_path:
    sys.exit(0)

try:
    with open(state_path) as f:
        st = json.load(f)
    if not isinstance(st, dict):
        sys.exit(0)
except Exception:
    sys.exit(0)

stage = st.get("stage") or "?"
version = st.get("version") or "?"
ct = st.get("current_task")
if isinstance(ct, dict):
    task = f"{ct.get('ticket_id') or '?'}({ct.get('assignee') or '?'})"
else:
    task = "none"

lines = [f"[prdt state] stage={stage} · version={version} · current_task={task}"]

# deploy tripwire — the tokens observed sailing past stage=build in hanta
# ("main pr" · "머지완료" · "배포 완료") plus their obvious variants. Word
# boundaries for English. Korean has no \b and bare substrings over-fire
# (QA round: 라이브러리→라이브, 머지소트→머지, "배포는 안 함"→배포), so Korean
# tokens are PHRASES: the noun plus a completion/imperative/target suffix that
# actually signals deploy intent.
DEPLOY_RE = re.compile(
    r"(?:\b(?:deploy(?:ment)?|release|launch|go[- ]?live|prod(?:uction)?|merge|ship\s?it)\b"
    r"|\bmain\s+pr\b"
    r"|배포\s*(?:완료|해|하|할|중|되|됐|됨|부탁|진행|가능|후)|배포\s*[.!?~]*\s*$"
    r"|머지\s*(?:완료|해|하|할|되|됐|됨|후|부탁)"
    r"|프로덕션\s*(?:배포|반영|릴리|출시|나가)"
    r"|라이브\s*(?:배포|반영|전환|나가)"
    r"|출시|릴리즈|릴리스)",
    re.IGNORECASE,
)
prompt = ev.get("prompt") or ""
if stage in ("define", "build") and isinstance(prompt, str) and DEPLOY_RE.search(prompt):
    lines.append(
        f"[prdt stage guard] deploy-shaped request while stage={stage} — deploy belongs to "
        "ship. Ship entry is due FIRST: readiness pass (readiness-dispatch playbook) + "
        "po-state stage write, or an explicit N/A-skip line in docs/wiki/log.md. "
        "Raise it before doing the deploy work (PO habit — Lifecycle judgment)."
    )

print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "\n".join(lines),
}}, ensure_ascii=False))
PYEOF
exit 0
