#!/usr/bin/env bash
# prdt — audience-mode injection for the PO's conversational output (T-326).
# Registered on the SAME events/matchers as prdt-session-start.sh, as its own
# small hook command entry — the T-358 pattern: a small must-not-be-lost payload
# gets its own hook process so the main discipline payload's persist-truncation
# can never drop it (see prdt-overrides-inject.sh, fact--claude-hooks).
#
# Mode source: $PRDT_HOME/audience-mode — USER-level, one token. The register
# belongs to the operator reading the PO, not to the project, so it lives in
# ~/.prdt (never .prdt/config.json). Written by the GUI (onboarding + Settings)
# via @productune/core settings/audience-mode.ts; both sides share the shape:
#   planner   → inject discipline/po/audience-planner.md (plain vocabulary,
#               conclusion first, progressive disclosure)
#   developer → emit NOTHING (current PO register, byte-identical behavior)
#   missing/invalid → planner (product default, T-326/PRD v1.5)
#
# Scope: PO only (v1.5). Worker output reaches the user re-voiced by the PO, so
# it is covered here; workers' own direct register is out of scope.
# Ordering: registered BEFORE prdt-overrides-inject.sh on the same matcher so
# machine overrides arrive after this block and win (last-wins).
#
# NOTE the two separate paths of T-326: fixed GUI strings (buttons, labels,
# onboarding copy) are i18n (packages/gui/src/locales); the PO's model-generated
# prose cannot be i18n'd — THIS hook is that second path.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_NAME="SessionStart"
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EN="$(printf '%s' "$EVENT_JSON" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  [ -n "$EN" ] && EVENT_NAME="$EN"
fi

# PO only — audience-mode shapes the PO's conversational output (T-326 scope).
[ "$AGENT_TYPE" = "prdt-po" ] || exit 0

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"

MODE="$(cat "$PRDT_HOME/audience-mode" 2>/dev/null | tr -d '[:space:]')"
case "$MODE" in
  developer) exit 0 ;;   # current register — inject nothing at all
  planner)   ;;          # explicit selection
  *)         ;;          # unset/invalid → planner (default)
esac

BODY_FILE="$PRDT_HOME/discipline/po/audience-planner.md"
[ -s "$BODY_FILE" ] || exit 0   # stale mirror without the file → degrade silently

PAYLOAD="[prdt audience-mode: planner — PO conversational register]
The operator selected (or defaulted to) the planner audience. Apply the register
below to every line the user reads. Machine overrides (a separate hook output,
if present) still win over this block (last-wins).

----- BEGIN audience-planner ($BODY_FILE) -----
$(cat "$BODY_FILE")
----- END audience-planner -----"

printf '%s' "$PAYLOAD" | jq -Rs --arg ev "$EVENT_NAME" '{hookSpecificOutput:{hookEventName:$ev,additionalContext:.}}'
exit 0
