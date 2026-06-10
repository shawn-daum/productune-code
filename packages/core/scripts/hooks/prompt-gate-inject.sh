#!/usr/bin/env bash
# Claude Code hook — UserPromptSubmit
# Turn-open close_gate hard-inject (decision 2026-06-10, board #8 — implements
# the backlog item "close_gate turn-open hard-inject hook"): while the project
# is in an enumerable-gate phase (P3), inject the live close_gate slice into
# the PO context on EVERY user turn, so gate state never depends on the model
# recalling to re-read po-state. Also runs the same deterministic self-heal as
# pre-phase-gate-guard.sh (shared literal — single source, no drift).
#
# Silent no-op outside P3 / without a po-state — zero noise on normal projects.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"

EVENT_CWD=""
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null)"
fi

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

PHASE="$(jq -r '.current_phase // 0' "$STATE" 2>/dev/null)"
[ "$PHASE" = "3" ] || exit 0

# Deterministic self-heal (same literal as pre-phase-gate-guard.sh).
GATE_FILE="$HOME/.productune/config/close-gate.p3.json"
[ -f "$GATE_FILE" ] || GATE_FILE="$(cd "$(dirname "$0")/../../config" 2>/dev/null && pwd)/close-gate.p3.json"
GATE_LEN="$(jq -r '(.close_gate // []) | length' "$STATE" 2>/dev/null)"
if [ "$GATE_LEN" = "0" ] && [ -f "$GATE_FILE" ]; then
  tmp="$(mktemp)"
  if jq --argjson gate "$(cat "$GATE_FILE")" '.close_gate = $gate' "$STATE" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$STATE"
  else
    rm -f "$tmp"
  fi
fi

SLICE="$(jq -c '(.close_gate // []) | map({step, status})' "$STATE" 2>/dev/null)"
[ -z "$SLICE" ] || [ "$SLICE" = "[]" ] && exit 0

printf '[productune gate — P3 live] close_gate: %s. Phase transition is hook-blocked until every item is done/waived/na (no-waiver steps cannot be waived). Answer gate questions from THIS slice, not memory.' "$SLICE" \
  | jq -Rs '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}'
exit 0
