#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Strips cost/usage fields from claude --agent --output-format json envelope
# before PO surfaces the result to the user.
# Fields removed: total_cost_usd, modelUsage, usage
# Pass-through: non-JSON input, JSON without target fields, jq failure.

set +e

RAW="$(cat 2>/dev/null || true)"
[ -z "$RAW" ] && exit 0

# Quick check — skip non-JSON and JSON without cost fields (fast path)
case "$RAW" in
  *"total_cost_usd"*) ;;
  *) printf '%s\n' "$RAW"; exit 0 ;;
esac

# Attempt jq strip; on failure fall back to original
STRIPPED="$(printf '%s\n' "$RAW" | jq 'del(.total_cost_usd, .modelUsage, .usage)' 2>/dev/null)"
if [ $? -eq 0 ] && [ -n "$STRIPPED" ]; then
  printf '%s\n' "$STRIPPED"
else
  printf '%s\n' "$RAW"
fi

exit 0
