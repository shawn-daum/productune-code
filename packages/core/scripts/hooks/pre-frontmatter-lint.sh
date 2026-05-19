#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit
# Validates ticket frontmatter `status:` + `qa_status:` against canonical enums.
# Blocks (exit 2) on violation; passes (exit 0) on clean or non-ticket paths.
#
# T-P4-136 — 2026-05-19

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# ── Extract tool_name, file_path, content ─────────────────────────────────────
read_json() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', {})
    print(ti.get('$1', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON"
}

FILE_PATH="$(read_json file_path)"

# ── Path filter — only docs/tickets/*/T-*.md ─────────────────────────────────
# Normalise: strip leading ./ or /
FILE_PATH="${FILE_PATH#./}"
FILE_PATH="${FILE_PATH#/}"
[[ "$FILE_PATH" == docs/tickets/*/T-*.md ]] || exit 0

TOOL_NAME="$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"

# ── Extract text to lint ──────────────────────────────────────────────────────
if [[ "$TOOL_NAME" == "Write" ]]; then
  LINT_TEXT="$(read_json content)"
elif [[ "$TOOL_NAME" == "Edit" ]]; then
  LINT_TEXT="$(read_json new_string)"
else
  exit 0
fi

[ -z "$LINT_TEXT" ] && exit 0

# ── Enum definitions ──────────────────────────────────────────────────────────
STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"
QA_STATUS_ENUM="pending|pass|fail"

# ── status: validation ────────────────────────────────────────────────────────
if printf '%s' "$LINT_TEXT" | grep -qE '^status:'; then
  STATUS_VAL="$(printf '%s' "$LINT_TEXT" | grep -E '^status:' | head -1 \
    | sed 's/^status:[[:space:]]*//' | tr -d '"'"'"' ')"
  if [ -n "$STATUS_VAL" ]; then
    if ! printf '%s' "$STATUS_VAL" | grep -qE "^($STATUS_ENUM)$"; then
      printf '[frontmatter-lint] status: "%s" not in canonical enum.\n' "$STATUS_VAL" >&2
      printf '  allowed: %s\n' "$(printf '%s' "$STATUS_ENUM" | tr '|' ' | ')" >&2
      printf '  Fix the value and retry.\n' >&2
      exit 2
    fi
  fi
fi

# ── qa_status: validation (only when key present) ────────────────────────────
if printf '%s' "$LINT_TEXT" | grep -qE '^qa_status:'; then
  QA_VAL="$(printf '%s' "$LINT_TEXT" | grep -E '^qa_status:' | head -1 \
    | sed 's/^qa_status:[[:space:]]*//' | tr -d '"'"'"' ')"
  if [ -n "$QA_VAL" ]; then
    if ! printf '%s' "$QA_VAL" | grep -qE "^($QA_STATUS_ENUM)$"; then
      printf '[frontmatter-lint] qa_status: "%s" not in canonical enum.\n' "$QA_VAL" >&2
      printf '  allowed: %s\n' "$(printf '%s' "$QA_STATUS_ENUM" | tr '|' ' | ')" >&2
      printf '  Fix the value and retry.\n' >&2
      exit 2
    fi
  fi
fi

exit 0
