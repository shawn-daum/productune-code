#!/usr/bin/env bash
# prdt — machine overrides, dedicated small hook (T-358).
# Registered TWICE, on the SAME events/matchers as prdt-session-start.sh:
#   SessionStart (matcher: startup|resume|clear)
#   SubagentStart (matcher: ^prdt-)
# but as a SEPARATE hook command entry — never merged into that script's
# additionalContext string.
#
# Incident (2026-07-15, T-358): the main hook injects doctrine + contracts +
# habit + overrides + menus as ONE additionalContext string. Once that string
# crosses the harness's persist-truncation threshold (~10KB observed), the
# harness writes the full text to a tool-results file and shows only a ~2KB
# PREVIEW in context. The overrides block sat last in the string, so it fell
# entirely outside the preview — a PO session ran to completion having never
# seen 3 machine overrides.
#
# Fix, empirically confirmed same-day: when two hook commands are registered
# on the same event, each hook PROCESS's own additionalContext output is
# persist-checked INDEPENDENTLY of the others (live SubagentStart dogfood: a
# large first hook's output was persisted-and-previewed while a small second
# hook's output on the same turn rendered in full). This script exploits
# exactly that — its own output is nothing but the override file body (small
# by construction) and will essentially never itself cross the threshold, so
# it survives no matter how large prdt-session-start.sh's payload grows.
#
# Overrides-absent machines: no override file for this persona → NO stdout at
# all (no JSON emitted, hook contributes nothing). That is byte-identical to
# pre-T-358 behavior, where the main payload's overrides block was already
# conditionally omitted whenever the file was absent/empty.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_NAME="SessionStart"
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EN="$(printf '%s' "$EVENT_JSON" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  [ -n "$EN" ] && EVENT_NAME="$EN"
fi

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"

PERSONA=""
case "$AGENT_TYPE" in
  prdt-po)        PERSONA="po" ;;
  prdt-designer)  PERSONA="designer" ;;
  prdt-developer) PERSONA="developer" ;;
  prdt-qa)        PERSONA="qa" ;;
esac

# No persona resolved (plain session, or jq missing) → nothing to override, stay silent.
[ -z "$PERSONA" ] && exit 0

OVERRIDES="$PRDT_HOME/overrides/$PERSONA.md"
[ -s "$OVERRIDES" ] || exit 0

PAYLOAD="[prdt discipline — machine overrides for $AGENT_TYPE — LAST-WINS]
This machine's user-level overrides (~/.prdt/overrides/$PERSONA.md). They take
priority over EVERYTHING in the main discipline injection (doctrine, contracts,
habit, playbooks) — resolve any conflict in favor of the text below. Injected as
its own hook output (T-358) so it cannot be lost to additionalContext
persist-truncation when the main discipline payload is large.

----- BEGIN overrides ($OVERRIDES) -----
$(cat "$OVERRIDES")
----- END overrides -----"

printf '%s' "$PAYLOAD" | jq -Rs --arg ev "$EVENT_NAME" '{hookSpecificOutput:{hookEventName:$ev,additionalContext:.}}'
exit 0
