#!/usr/bin/env bash
# prdt — plan-tier injection for the PO's fable model gate (T-423).
# Registered on the SAME events/matchers as prdt-session-start.sh, as its own
# small hook command entry — the T-358 pattern: a small must-not-be-lost payload
# gets its own hook process so the main discipline payload's persist-truncation
# can never drop it (see prdt-overrides-inject.sh, prdt-audience-inject.sh,
# fact--claude-hooks).
#
# Value source: $PRDT_HOME/plan-tier — USER-level, one token, written by the
# GUI (Settings) via @productune/core settings/plan-tier.ts, OR by the PO
# itself (atomic tmp+rename) the first time it asks the user and gets an
# answer. Tokens: `max-x20` | `team-premium` (fable-eligible) | `other` (not
# eligible) | missing/invalid (never asked yet).
#
# T-391's fable plan gate used to require the PO to re-ask every session
# ("confirmed" == the user said so THIS session) — this hook turns that into a
# device-scoped answer: once written, every future session (this hook fires on
# SessionStart AND SubagentStart) reads it back instead of re-asking.
#
# Scope: PO only — plan-tier only matters for the PO's own model-routing
# decisions (contracts.md §Route + dispatch); workers never route models.
# Ordering: registered BEFORE both override hooks on the same matcher; those
# blocks say in their own text that they outrank this one, which is what actually
# settles it (T-445: co-registered hooks render in completion order, not
# registration order, so position alone decides nothing).

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_NAME="SessionStart"
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EN="$(printf '%s' "$EVENT_JSON" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  [ -n "$EN" ] && EVENT_NAME="$EN"
fi

# PO only — plan-tier shapes the PO's own model-routing decisions (T-423 scope).
[ "$AGENT_TYPE" = "prdt-po" ] || exit 0

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"

RAW="$(cat "$PRDT_HOME/plan-tier" 2>/dev/null | tr -d '[:space:]')"
case "$RAW" in
  max-x20|team-premium)
    TIER="$RAW"; ELIGIBLE="fable-eligible — fable floors apply as designed"
    ;;
  other)
    TIER="$RAW"; ELIGIBLE="NOT fable-eligible — every fable floor resolves to opus at the same effort"
    ;;
  *)
    TIER="unset"; ELIGIBLE=""
    ;;
esac

if [ "$TIER" = "unset" ]; then
  PAYLOAD="[prdt plan-tier: unset — fable gate]
No stored answer at $PRDT_HOME/plan-tier: ask the user ONCE this session and persist the answer per PO habit §Route (Fable plan gate) — one of max-x20 | team-premium | other; device-scoped, never re-asked once written. Until answered, every fable floor resolves to opus at the same effort."
else
  PAYLOAD="[prdt plan-tier: $TIER — fable gate]
Stored at $PRDT_HOME/plan-tier: $ELIGIBLE. Never re-ask, this session or any later one — device-scoped; a plan change is the user's to raise (GUI Settings or a direct file edit)."
fi

printf '%s' "$PAYLOAD" | jq -Rs --arg ev "$EVENT_NAME" '{hookSpecificOutput:{hookEventName:$ev,additionalContext:.}}'
exit 0
