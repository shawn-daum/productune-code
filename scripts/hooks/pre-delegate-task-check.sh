#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Firm rules before `claude --agent pdt-*` / `--resume`:
#   R1. current_task must have semantic slug + request_summary (no auto-*).
#   R2. New task: previous current_task slug must be archived to past_tickets
#       (else PO is task-switching without proper close).
#   R3. .md-only artifacts + delegating to pdt-developer = boundary violation
#       (PO must Edit the .md directly).
#   R4. --resume <uuid> must use a UUID present in current_task.persona_sessions
#       (else PO is reusing a session from a prior task).

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

# Same compound command writes current_task before delegating → R1 satisfied
SAME_COMPOUND_WRITES_CT=0
case "$COMMAND" in
  *"current_task"*"jq"*"claude --agent"*)        SAME_COMPOUND_WRITES_CT=1 ;;
  *"jq"*".current_task ="*"claude --agent"*)     SAME_COMPOUND_WRITES_CT=1 ;;
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
    [ -f "$d/.codex/po-state.json" ]      && { echo "$d/.codex/po-state.json";      return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

STATE="$(find_po_state "$EVENT_CWD" || find_po_state "$PWD" || true)"
[ -z "$STATE" ] && exit 0

emit_block() {
  printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
  exit 0
}

SLUG="$(jq -r '.current_task.slug // ""' "$STATE" 2>/dev/null)"
SUMMARY="$(jq -r '.current_task.request_summary // ""' "$STATE" 2>/dev/null)"

# ── R1: semantic slug + request_summary required ─────────────────────────────
if [ "$SAME_COMPOUND_WRITES_CT" = "0" ]; then
  if [ -z "$SLUG" ] || [ "${SLUG#auto-}" != "$SLUG" ] || [ -z "$SUMMARY" ] || [ "$SUMMARY" = "(auto-opened by post-delegate hook)" ]; then
    emit_block "Before delegating, write current_task with a semantic slug and request_summary. Example (portable — no sponge):

  jq '.current_task = {slug: \"<kebab-task>\", started_at: \"$(date -u +%FT%TZ)\", request_summary: \"<one-line>\", artifacts: [], persona_sessions: {}, persona_session_meta: {}}' .productune/po-state.json > .productune/po-state.json.tmp && mv .productune/po-state.json.tmp .productune/po-state.json

(See ~/.productune/sections/lifecycle.md.)"
  fi
fi

# ── R2: new task — previous slug must be archived ────────────────────────────
PREV_SLUG="$(jq -r '.recent_turns // [] | (last // {}) | .task_slug // ""' "$STATE" 2>/dev/null)"
if [ -n "$PREV_SLUG" ] && [ -n "$SLUG" ] && [ "$PREV_SLUG" != "$SLUG" ]; then
  ARCHIVED="$(jq -r --arg s "$PREV_SLUG" '
    ((.past_tickets // .past_tasks // []) | map(select(.slug == $s)) | length)
  ' "$STATE" 2>/dev/null)"
  if [ "$ARCHIVED" = "0" ]; then
    emit_block "Switching to task '$SLUG' but previous task '$PREV_SLUG' was never archived. Archive it first (portable — no sponge):

  jq --arg now \"\$(date -u +%FT%TZ)\" '
    if .current_task != null and .current_task.slug != \"$SLUG\" then
      .past_tickets = ((.past_tickets // []) + [(.current_task + {ended_at: \$now, final_status: \"done\", outcome_summary: \"<1-line synthesis>\"})])
      | .past_tickets |= (.[-50:])
    else . end
  ' .productune/po-state.json > .productune/po-state.json.tmp && mv .productune/po-state.json.tmp .productune/po-state.json

Then jq-write the new current_task and retry. (See ~/.productune/sections/lifecycle.md §Archive.)"
  fi
fi

# ── R3: .md-only artifacts → PO direct, no dev delegation ────────────────────
if printf '%s' "$COMMAND" | grep -q -- "--agent pdt-developer"; then
  ALL_MD="$(jq -r '
    (.current_task.artifacts // []) as $a
    | if ($a | length) > 0 and ($a | all(test("\\.md$|\\.MD$"; "i")))
      then "yes" else "no" end
  ' "$STATE" 2>/dev/null)"
  if [ "$ALL_MD" = "yes" ]; then
    ARTS="$(jq -r '.current_task.artifacts | join(", ")' "$STATE" 2>/dev/null)"
    emit_block ".md-only artifacts ($ARTS) — PO must Edit directly, not delegate to pdt-developer. File-write authority allows **/*.md. (See agents/pdt-po.md §File-write authority.)"
  fi
fi

# ── R4: --resume UUID must belong to current_task.persona_sessions ───────────
RESUME_UUID="$(printf '%s' "$COMMAND" | sed -nE 's/.*--resume "?([0-9a-f-]+)"?.*/\1/p' | head -1)"
if [ -n "$RESUME_UUID" ]; then
  KNOWN="$(jq -r --arg u "$RESUME_UUID" '
    ((.current_task.persona_sessions // {}) | to_entries | map(select(.value == $u)) | length)
  ' "$STATE" 2>/dev/null)"
  if [ "$KNOWN" = "0" ]; then
    emit_block "Resume UUID $RESUME_UUID is not in current_task.persona_sessions for slug '$SLUG'. New task = first call WITHOUT --session-id (Claude Code returns one in .session_id). Don't reuse UUIDs from past tasks. (See ~/.productune/po-instructions.md §Hard rules — Persona invocation.)"
  fi
fi

exit 0
