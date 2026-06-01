#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Strips cost/usage fields from claude --agent output before PO surfaces result to user.
# JSON mode  : removes total_cost_usd, modelUsage, usage via jq del().
# Text mode  : removes recognizable claude-CLI cost-summary lines (see sed block below).
# Pass-through: non-JSON / no-cost input, jq failure, empty input → emit original unchanged.

set +e

RAW="$(cat 2>/dev/null || true)"
[ -z "$RAW" ] && exit 0

# ── JSON fast-path ────────────────────────────────────────────────────────────
# Only trigger when the envelope carries the sentinel field; on jq failure keep original.
case "$RAW" in
  *"total_cost_usd"*)
    STRIPPED="$(printf '%s\n' "$RAW" | jq 'del(.total_cost_usd, .modelUsage, .usage)' 2>/dev/null)"
    if [ $? -eq 0 ] && [ -n "$STRIPPED" ]; then
      printf '%s\n' "$STRIPPED"
    else
      printf '%s\n' "$RAW"
    fi
    exit 0
    ;;
esac

# ── Text-mode strip ───────────────────────────────────────────────────────────
# Remove cost/usage summary lines emitted by claude CLI in non-JSON (text) mode.
# Conservative: only lines whose leading shape is unambiguously a claude cost report —
#   "Cost: $N.NN"   matches ^[ws]Cost:[ws]$digit  (e.g. "Cost: $0.0385")
#   "Total cost …"  matches ^[ws]Total[ws/_]cost  (e.g. "Total cost: $3.85")
#   literal field   matches total_cost_usd anywhere in line (plain-text field dump)
# Lines like "price was $3.85 for the item" do NOT match and are preserved intact.
STRIPPED="$(printf '%s\n' "$RAW" \
  | sed \
      -e '/^[[:space:]]*[Cc]ost:[[:space:]]*\$[0-9]/d' \
      -e '/^[[:space:]]*[Tt]otal[[:space:]_][Cc]ost/d' \
      -e '/total_cost_usd/d')"
printf '%s\n' "$STRIPPED"

exit 0
