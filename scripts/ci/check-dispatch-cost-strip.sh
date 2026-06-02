#!/usr/bin/env bash
# scripts/ci/check-dispatch-cost-strip.sh
#
# Dispatch-cost-strip behavior check for T-021 (C1 fresh-install CI smoke),
# check (d).
#
# A post-install PO session pipes each `claude --agent` Bash result through the
# PostToolUse hook scripts/hooks/post-bash-strip-cost.sh, which must remove cost
# /usage fields before the PO surfaces the result to the user. Running a real
# PO session in CI requires an authed claude CLI (not available on a clean CI
# runner), so this check drives the SAME hook the installed session uses with
# representative fixtures and asserts the strip contract:
#
#   1. JSON mode  — total_cost_usd / modelUsage / usage removed; payload kept.
#   2. Text mode  — claude CLI cost-summary lines removed; prose preserved.
#   3. Pass-through — non-cost input emitted unchanged.
#
# The hook path is resolved relative to the repo so the check tracks whatever
# install.sh wires into ~/.claude/settings.json.
#
# Exit 0 = strip contract holds. Exit 1 = any assertion fails.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOK="$REPO_ROOT/packages/core/scripts/hooks/post-bash-strip-cost.sh"

if [ ! -x "$HOOK" ] && [ ! -f "$HOOK" ]; then
  printf 'FAIL: strip hook not found at %s\n' "$HOOK" >&2
  exit 1
fi

fail=0
note() { printf '[check-dispatch-cost-strip] %s\n' "$*"; }
bad()  { printf 'FAIL: %s\n' "$*" >&2; fail=1; }

run_hook() { bash "$HOOK"; }

# ── 1. JSON mode ───────────────────────────────────────────────────────────
json_in='{"persona":"developer","summary":"done","total_cost_usd":0.0385,"modelUsage":{"x":1},"usage":{"input_tokens":10}}'
json_out="$(printf '%s' "$json_in" | run_hook)"

if printf '%s' "$json_out" | grep -q 'total_cost_usd'; then
  bad "JSON mode: total_cost_usd not stripped"
fi
if printf '%s' "$json_out" | grep -q 'modelUsage'; then
  bad "JSON mode: modelUsage not stripped"
fi
if printf '%s' "$json_out" | grep -q '"usage"'; then
  bad "JSON mode: usage not stripped"
fi
# payload must survive (tolerant of jq pretty-print spacing: "summary": "done")
if ! printf '%s' "$json_out" | grep -qE '"summary"[[:space:]]*:[[:space:]]*"done"'; then
  bad "JSON mode: payload field 'summary' lost"
fi
[ "$fail" -eq 0 ] && note "JSON mode OK (cost fields stripped, payload intact)"

# ── 2. Text mode ───────────────────────────────────────────────────────────
# NOTE: the text fixture must NOT contain the literal token "total_cost_usd".
# The hook routes any input containing that token into its JSON fast-path
# (case "$RAW" in *"total_cost_usd"*), where a jq parse of non-JSON text fails
# and the hook deliberately passes the input through UNCHANGED. The plain-text
# "total_cost_usd" field-dump strip is covered as its own fast-path case below.
text_in='persona done.
Cost: $0.0385
Total cost: $3.85
the item price was $3.85 today'
text_out="$(printf '%s\n' "$text_in" | run_hook)"

if printf '%s\n' "$text_out" | grep -qE '^[[:space:]]*[Cc]ost:[[:space:]]*\$[0-9]'; then
  bad "text mode: 'Cost: \$N' summary line not stripped"
fi
if printf '%s\n' "$text_out" | grep -qE '^[[:space:]]*[Tt]otal[[:space:]_][Cc]ost'; then
  bad "text mode: 'Total cost' summary line not stripped"
fi
# prose containing a dollar amount must NOT be stripped
if ! printf '%s\n' "$text_out" | grep -q 'the item price was \$3.85 today'; then
  bad "text mode: legitimate prose line with \$ amount was wrongly stripped"
fi
if ! printf '%s\n' "$text_out" | grep -q 'persona done.'; then
  bad "text mode: leading prose line lost"
fi
[ "$fail" -eq 0 ] && note "text mode OK (cost lines stripped, prose preserved)"

# ── 2b. JSON fast-path on plain-text field dump ──────────────────────────────
# When a result carries the literal token total_cost_usd but is NOT valid JSON,
# the hook keeps it unchanged (jq parse fails → pass-through). A VALID JSON
# envelope carrying total_cost_usd is stripped (covered in step 1). Assert the
# pass-through arm so the JSON-routing contract is pinned.
ftext_in='result text mentioning total_cost_usd inline, not valid json'
ftext_out="$(printf '%s\n' "$ftext_in" | run_hook)"
if [ "$(printf '%s' "$ftext_out" | tr -d '\n')" != "$ftext_in" ]; then
  bad "JSON fast-path: non-JSON text carrying total_cost_usd token was altered (got: '$ftext_out')"
fi
[ "$fail" -eq 0 ] && note "JSON fast-path pass-through OK (non-JSON cost-token text unchanged)"

# ── 3. Pass-through ────────────────────────────────────────────────────────
plain_in='just a normal line with no cost data'
plain_out="$(printf '%s' "$plain_in" | run_hook)"
if [ "$(printf '%s' "$plain_out" | tr -d '\n')" != "$plain_in" ]; then
  bad "pass-through: non-cost input was altered (got: '$plain_out')"
fi
[ "$fail" -eq 0 ] && note "pass-through OK (non-cost input unchanged)"

if [ "$fail" -ne 0 ]; then
  printf '\n[check-dispatch-cost-strip] FAIL — dispatch-cost-strip contract broken.\n' >&2
  exit 1
fi

note "OK — dispatch-cost-strip contract holds."
exit 0
