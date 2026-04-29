#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Blocks `claude --agent pdt-*` / `claude --resume` invocations when the project's
# current_task is missing a semantic slug + request_summary. Forces PO to
# jq-write current_task before delegating instead of relying on the post-delegate
# hook's auto-<timestamp> fallback.
#
# Quiet pass-through on:
#  - non-claude-agent Bash commands
#  - first call where current_task is missing AND PO supplies it in same Bash
#    (multi-line: detect `jq` write of current_task earlier in the command)
#  - resume calls where current_task already has semantic slug

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

COMMAND="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)"

case "$COMMAND" in
  *"claude --agent pdt-"*) ;;
  *"claude --resume "*)    ;;
  *) exit 0 ;;
esac

# If the same compound command writes current_task before delegating, allow
case "$COMMAND" in
  *"current_task"*"jq"*"claude --agent"*) exit 0 ;;
  *"jq"*".current_task ="*"claude --agent"*) exit 0 ;;
esac

EVENT_CWD="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd') or '')
except Exception:
    print('')
" 2>/dev/null)"

find_po_state() {
  local d="${1:-$PWD}"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    [ -f "$d/.productune/po-state.json" ] && { echo "$d/.productune/po-state.json"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

STATE="$(find_po_state "$EVENT_CWD" || find_po_state "$PWD" || true)"
[ -z "$STATE" ] && exit 0

# Inspect current_task: must have slug not starting with "auto-" and request_summary present
SLUG="$(jq -r '.current_task.slug // ""' "$STATE" 2>/dev/null)"
SUMMARY="$(jq -r '.current_task.request_summary // ""' "$STATE" 2>/dev/null)"

if [ -z "$SLUG" ] || [ "${SLUG#auto-}" != "$SLUG" ] || [ -z "$SUMMARY" ] || [ "$SUMMARY" = "(auto-opened by post-delegate hook)" ]; then
  cat <<JSON
{"decision":"block","reason":"Before delegating to a persona, write current_task with a semantic slug and request_summary. Run something like:\n\n  jq '.current_task = {slug: \"<kebab-task>\", started_at: \"$(date -u +%FT%TZ)\", request_summary: \"<one-line>\", artifacts: [], persona_sessions: {}, persona_session_meta: {}}' .productune/po-state.json | sponge .productune/po-state.json\n\nThen retry the persona invocation. (See ~/.productune/sections/stages.md §Stage 2 step 8.)"}
JSON
  exit 0
fi

exit 0
