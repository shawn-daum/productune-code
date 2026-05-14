#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Chunking ceiling guard for pdt-designer dispatches.
# Counts artifact-signal keywords in TASK body. ≥3 signals → stderr warn (non-blocking).
#
# Excluded from count: ROADMAP rows, Activity Log appends (PO-mechanical).
# Only fires on: claude --agent pdt-designer   (not --resume, not other personas)

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

# Only fire on fresh pdt-designer dispatch (not --resume — short body, high FP)
case "$COMMAND" in
  *"claude --agent pdt-designer"*) ;;
  *) exit 0 ;;
esac

# Extract TASK body — last non-flag positional arg in the command
TASK_BODY="$(printf '%s' "$COMMAND" | python3 -c "
import shlex, sys
try:
    parts = shlex.split(sys.stdin.read().strip())
    for part in reversed(parts):
        if not part.startswith('-'):
            print(part)
            break
except Exception:
    pass
" 2>/dev/null)"

[ -z "$TASK_BODY" ] && exit 0

# ── Artifact signal counting ──────────────────────────────────────────────────
# Each pattern = 1 point (presence only, not occurrence count).
# Pattern groups are mutually exclusive signals to avoid double-counting.
COUNT=0
signal() {
    printf '%s' "$TASK_BODY" | grep -qiE "$1" && COUNT=$((COUNT + 1))
}

# Design system doc
signal 'system\.md'
# UX flow diagram
signal 'flow\.md'
# Wireframe (Excalidraw)
signal '\.excalidraw'
# Hi-fi mockup (HTML)
signal '\.html'
# Screens directory or set
signal 'screens/'
# Plan doc (design plan)
signal 'plan\.md'
# Test plan
signal 'test-plan\.md'
# Decisions log entry
signal 'decisions\.md'
# Feature history log
signal 'feature-history\.md'
# Korean artifact count hint ≥3
signal '(산출물[[:space:]]*[3-9]|[3-9][[:space:]]*산출물)'

# Exclusions: ROADMAP / Activity Log patterns intentionally absent from above list.
# Do NOT add: 'ROADMAP', 'Activity Log', 'ticket_id', 'status:' — PO-mechanical.

# ── Threshold check ───────────────────────────────────────────────────────────
if [ "$COUNT" -ge 3 ]; then
    printf '[productune] ⚠ chunking-warn: pdt-designer TASK signals ~%d artifact types (ceiling=2).\n' "$COUNT" >&2
    printf '  Consider splitting into ≤2 designer-owned artifacts per dispatch.\n' >&2
    printf '  ROADMAP/Activity rows are excluded (PO-mechanical). (non-blocking)\n' >&2
fi

exit 0
