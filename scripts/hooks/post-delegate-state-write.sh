#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Detects when PO (or any caller) invokes `claude --agent pdt-<x>` or
# `claude --resume <uuid>`, then deterministically writes the resulting
# session_id into <project>/.productune/po-state.json. Without this hook,
# PO sometimes skips the mechanical state writes that doctrine requires
# (~/.productune/po-instructions.md "Mechanical state writes — every turn").
#
# Silent on no-match. Prints a one-liner on successful update so PO and
# the user see what changed.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# Fast path — only act on Bash calls that involve the claude CLI for personas
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

# Extract tool_response stdout (Claude Code may name it stdout|output)
STDOUT="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    r = d.get('tool_response', {})
    print(r.get('stdout') or r.get('output') or '')
except Exception:
    print('')
" 2>/dev/null)"

[ -z "$STDOUT" ] && exit 0

# Pull .session_id from the response JSON (line-based — claude --print --output-format json
# emits a single JSON envelope; tolerate stray prefix/suffix lines)
SID="$(printf '%s' "$STDOUT" | python3 -c "
import json, re, sys
text = sys.stdin.read()
m = re.search(r'\{.*\}', text, re.DOTALL)
if not m:
    sys.exit(0)
try:
    d = json.loads(m.group())
    sid = d.get('session_id') or ''
    print(sid)
except Exception:
    print('')
" 2>/dev/null)"

# UUID validation (8-4-4-4-12 hex)
case "$SID" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-*) ;;
  *) exit 0 ;;
esac

# Persona name — from `--agent pdt-<name>` if present, else infer via existing po-state
PERSONA=""
if printf '%s' "$COMMAND" | grep -qE -- '--agent pdt-[a-z-]+'; then
  PERSONA="$(printf '%s' "$COMMAND" | sed -nE 's/.*--agent (pdt-[a-z-]+).*/\1/p' | head -1)"
fi

# Find the project's .productune/po-state.json — prefer event cwd, fall back to PWD walk-up
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

# Resolve persona from --resume <uuid> by reverse-lookup in existing persona_sessions
if [ -z "$PERSONA" ]; then
  RESUME_UUID="$(printf '%s' "$COMMAND" | sed -nE 's/.*--resume "?([0-9a-f-]+)"?.*/\1/p' | head -1)"
  if [ -n "$RESUME_UUID" ]; then
    PERSONA="$(jq -r --arg u "$RESUME_UUID" '
      (.current_task // {}) | (.persona_sessions // {}) | to_entries[] | select(.value == $u) | .key
    ' "$STATE" 2>/dev/null | head -1)"
  fi
fi

[ -z "$PERSONA" ] && exit 0

# Mechanical state write — current_task auto-create if missing, capture session_id, bump turns
NOW="$(date -u +%FT%TZ)"
TMP="$(mktemp)"
jq --arg persona "$PERSONA" --arg sid "$SID" --arg now "$NOW" '
  .current_task = (
    .current_task // {
      slug: ("auto-" + ($now | gsub("[^0-9]"; "") | .[:14])),
      started_at: $now,
      request_summary: "(auto-opened by post-delegate hook)",
      artifacts: [],
      persona_sessions: {},
      persona_session_meta: {}
    }
  )
  | .current_task.persona_sessions[$persona] = $sid
  | .current_task.persona_session_meta[$persona] = (
      (.current_task.persona_session_meta[$persona] // {turns: 0, model_history: [], effort_history: []})
      + {id: $sid, last_seen: $now}
      + {turns: ((.current_task.persona_session_meta[$persona].turns // 0) + 1)}
    )
  | .recent_turns = (
      ((.recent_turns // []) + [{
        ts: $now,
        persona: $persona,
        session_id: $sid,
        task_slug: (.current_task.slug // "unknown"),
        source: "post-delegate-hook"
      }])[-10:]
    )
' "$STATE" > "$TMP" 2>/dev/null

if [ -s "$TMP" ]; then
  mv "$TMP" "$STATE"
  SHORT_SID="$(echo "$SID" | cut -c1-8)"
  echo "[productune] state-write: persona=$PERSONA session=$SHORT_SID turns+=1 → $STATE"
else
  rm -f "$TMP"
fi

exit 0
