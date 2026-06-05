#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit|Bash
# Hard-stop: if a productune persona session (agent_type pdt-*) tries to act
# while its Tier 0 doctrine is MISSING on this machine, DENY the tool call.
# SessionStart can only *inject* context (cannot block); this is the actual
# enforcement of "no doctrine → no action".
#
# CRITICAL — fail OPEN. This hook is registered GLOBALLY (~/.claude/settings.json)
# and fires for EVERY Claude session on the machine, productune or not. It must
# ONLY act when agent_type starts with `pdt-`. Without that guard a missing
# ~/.productune would brick Bash/Write/Edit for unrelated users' sessions.
#
# jq is a hard dependency (same as the other productune hooks).

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
# Fail OPEN on any parse problem — never block unrelated sessions.
[ -z "$EVENT_JSON" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"

# Only act on productune persona sessions. Any other / missing → fail OPEN.
case "$AGENT_TYPE" in
  pdt-*) ;;
  *) exit 0 ;;
esac

case "$AGENT_TYPE" in
  pdt-po)        PERSONA="po" ;;
  pdt-developer) PERSONA="developer" ;;
  pdt-qa)        PERSONA="qa" ;;
  pdt-designer)  PERSONA="designer" ;;
  *) exit 0 ;;  # unknown pdt-* → fail OPEN (don't brick on a typo'd agent)
esac

COMMON_TIER0="$HOME/.productune/doctrine/common/habit.md"
PERSONA_TIER0="$HOME/.productune/doctrine/persona/$PERSONA/habit.md"

MISSING=""
[ ! -f "$COMMON_TIER0" ]  && MISSING="$COMMON_TIER0"
[ ! -f "$PERSONA_TIER0" ] && MISSING="${MISSING:+$MISSING, }$PERSONA_TIER0"

[ -z "$MISSING" ] && exit 0  # doctrine present → allow.

REASON="productune Tier0 doctrine not found at $MISSING — run packages/core/scripts/install.sh. Refusing to act without doctrine."
jq -n --arg r "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
