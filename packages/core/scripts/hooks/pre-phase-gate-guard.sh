#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Mechanical close-gate enforcement (decision 2026-06-10, board #8 — supersedes
# the backlog items "close_gate turn-open hard-inject hook" and "close_gate
# deterministic 자가치유": both are absorbed here + prompt-gate-inject.sh).
#
#   G1. Self-heal: current_phase == 3 && close_gate absent/null/empty →
#       deterministically materialize the canonical 4-step array (idempotent;
#       in-progress done/waived items are never touched). The canonical literal
#       lives in ONE file shared by every executable site:
#       ~/.productune/config/close-gate.p3.json (mirror; repo SoT fallback).
#   G2. Block any `.current_phase = N` write to po-state while close_gate has
#       an unresolved item (status ∉ done|waived|na).
#   G3. Block a `waived` status on a non-waivable item (no-waiver gate steps
#       have no bypass by design).
#
# Out of reach (tracked in docs/backlog.md): the GUI `phase:approve` IPC writes
# po-state from TypeScript and bypasses Bash hooks — GUI write-path parity is a
# separate ticket.
#
# Prose discipline gets skipped under completion pressure; hooks don't.

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

# Fast path: only commands that touch po-state.json AND assign current_phase
# (G1–G3) or ended_at (G4 — version close). `=` must not be `==` (the turn-open
# sweep jq COMPARES .current_phase == 3).
case "$COMMAND" in
  *po-state.json*) ;;
  *) exit 0 ;;
esac
PHASE_WRITE=0
CLOSE_WRITE=0
VSTART_WRITE=0
printf '%s' "$COMMAND" | grep -Eq '\.current_phase[[:space:]]*=[[:space:]]*[^=]' && PHASE_WRITE=1
# [^=n[:space:]] : `==` 비교와 `= null`(reopen/clear) 은 write 가 아님.
printf '%s' "$COMMAND" | grep -Eq '\.ended_at[[:space:]]*=[[:space:]]*[^=n[:space:]]' && CLOSE_WRITE=1
printf '%s' "$COMMAND" | grep -Eq '\.current_version[[:space:]]*=[[:space:]]*[^=n[:space:]]' && VSTART_WRITE=1
[ "$PHASE_WRITE" = "0" ] && [ "$CLOSE_WRITE" = "0" ] && [ "$VSTART_WRITE" = "0" ] && exit 0

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

# Canonical gate literal: mirror first, repo SoT (relative to this script) second.
GATE_FILE="$HOME/.productune/config/close-gate.p3.json"
[ -f "$GATE_FILE" ] || GATE_FILE="$(cd "$(dirname "$0")/../../config" 2>/dev/null && pwd)/close-gate.p3.json"
GATE_LITERAL="[]"
[ -f "$GATE_FILE" ] && GATE_LITERAL="$(cat "$GATE_FILE")"

emit_block() {
  printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
  exit 0
}

# ── G1: deterministic self-heal (P3 && gate empty → materialize) ─────────────
PHASE="$(jq -r '.current_phase // 0' "$STATE" 2>/dev/null)"
GATE_LEN="$(jq -r '(.close_gate // []) | length' "$STATE" 2>/dev/null)"
if [ "$PHASE" = "3" ] && [ "$GATE_LEN" = "0" ] && [ "$GATE_LITERAL" != "[]" ]; then
  tmp="$(mktemp)"
  if jq --argjson gate "$GATE_LITERAL" '.close_gate = $gate' "$STATE" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$STATE"
    printf '[productune] close_gate self-heal: P3 gate materialized from %s\n' "$GATE_FILE" >&2
  else
    rm -f "$tmp"
  fi
fi

if [ "$PHASE_WRITE" = "1" ]; then
  # ── G3: no-waiver violation (waived status on waivable:false item) ─────────
  NOWAIVER_WAIVED="$(jq -r '[(.close_gate // [])[] | select(.waivable == false and .status == "waived")] | map(.step) | join(", ")' "$STATE" 2>/dev/null)"
  if [ -n "$NOWAIVER_WAIVED" ]; then
    emit_block "close-gate G3: no-waiver step(s) marked waived: $NOWAIVER_WAIVED. These steps have no bypass by design — resolve to done (or na with user approval) before any phase transition. (SoT: lifecycle/p3-build.md)"
  fi

  # ── G2: unresolved gate items block the phase write ─────────────────────────
  UNRESOLVED="$(jq -r '[(.close_gate // [])[] | select(.status as $s | ["done","waived","na"] | index($s) | not)] | map("  - " + .step + " (" + .status + (if .waivable then ", waivable" else ", NO-WAIVER" end) + ")") | join("\n")' "$STATE" 2>/dev/null)"
  if [ -n "$UNRESOLVED" ]; then
    emit_block "close-gate G2: phase transition blocked — unresolved close_gate item(s):

$UNRESOLVED

Resolve each item (run its close ticket → done; waivable items may be waived on explicit user approval; na needs user approval) BEFORE writing current_phase. Sequence SoT: ~/.productune/doctrine/persona/po/bookshelf/lifecycle/p3-build.md. Surface this to the user — do not look for a workaround."
  fi
fi

# ── G4: version close (ended_at write) requires the PRD snapshot ──────────────
# p5-close.md ## Master archive — the snapshot is the GUI's PRD view for the
# closed version; closing without it loses the point-in-time record.
PROJ_ROOT="$(dirname "$(dirname "$STATE")")"
if [ "$CLOSE_WRITE" = "1" ]; then
  CV="$(jq -r '.current_version // ""' "$STATE" 2>/dev/null)"
  if [ -n "$CV" ] && [ ! -f "$PROJ_ROOT/docs/prd/versions/$CV.md" ]; then
    emit_block "close G4: version close blocked — PRD snapshot missing: docs/prd/versions/$CV.md

Run the P5 Master archive FIRST (p5-close.md):
  mkdir -p docs/prd/versions docs/designer/archive
  cp docs/prd/PRD.md \"docs/prd/versions/$CV.md\"
  cp docs/designer/design-system.md \"docs/designer/archive/design-system-$CV.md\"

then retry the ended_at write."
  fi
fi

# ── G5: new version start (current_version write) — safety net ────────────────
# Catches a close that slipped past G4 (GUI write path, hand edit): the most
# recently ENDED version must have its PRD snapshot before a new version opens.
if [ "$VSTART_WRITE" = "1" ]; then
  LASTV="$(jq -r '[.versions[]? | select(.ended_at != null)] | sort_by(.ended_at) | last | .id // ""' "$STATE" 2>/dev/null)"
  if [ -n "$LASTV" ] && [ ! -f "$PROJ_ROOT/docs/prd/versions/$LASTV.md" ]; then
    emit_block "version-start G5: new version blocked — the last closed version ($LASTV) has no PRD snapshot: docs/prd/versions/$LASTV.md

Snapshot it from the close-time content first (git history if the master has moved on):
  mkdir -p docs/prd/versions
  cp docs/prd/PRD.md \"docs/prd/versions/$LASTV.md\"   # or extract from git at the close commit

then retry opening the new version."
  fi
fi

exit 0
