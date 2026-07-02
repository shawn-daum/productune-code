#!/usr/bin/env bash
# prdt — Claude Code SessionStart hook (v1 hook #1; matcher: startup|resume|clear)
#
# Injects the discipline set (§9): doctrine.md + contracts.md + <persona> habit
# + ~/.prdt/overrides/<persona>.md (last-wins overlay, §8) + playbook menu(s).
# PO gets every persona's menu (dispatch routing needs them); a worker gets its own.
# Dynamic state (po-state, wiki index) is NOT injected — the PO habit reads it
# at turn open (it changes between turns; a snapshot would go stale).
#
# fail-loud: a required file missing/empty on this machine → inject STOP notice.
# Output via hookSpecificOutput.additionalContext (jq is a hard dependency).

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_CWD=""
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null)"
fi

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
DISC="$PRDT_HOME/discipline"
DOCTRINE="$PRDT_HOME/doctrine.md"
CONTRACTS="$DISC/contracts.md"

emit_ctx() {
  printf '%s' "$1" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
  exit 0
}

find_proj() {
  local d="$1"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -f "$d/.prdt/po-state.json" ] && { printf '%s' "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 0
}

PERSONA=""
case "$AGENT_TYPE" in
  prdt-po)        PERSONA="po" ;;
  prdt-designer)  PERSONA="designer" ;;
  prdt-developer) PERSONA="developer" ;;
  prdt-qa)        PERSONA="qa" ;;
esac

if [ -z "$PERSONA" ]; then
  # Plain session (no prdt agent). Point, don't inject — this machine runs other tools too.
  PROJ="$(find_proj "$EVENT_CWD")"
  [ -z "$PROJ" ] && exit 0
  [ ! -s "$CONTRACTS" ] && exit 0
  emit_ctx "[prdt — session start, persona unspecified]
You are in a prdt project ($PROJ). Acting as the PO → load discipline via Bash:
cat \"$DOCTRINE\" \"$CONTRACTS\" \"$DISC/po/habit.md\" (menus: \"$DISC/*/playbooks/_index.md\").
The Read tool does NOT expand ~ — use the \$HOME-expanded paths above."
fi

HABIT="$DISC/$PERSONA/habit.md"
MISSING=""
for f in "$DOCTRINE" "$CONTRACTS" "$HABIT"; do
  [ ! -s "$f" ] && MISSING="$MISSING $f"
done
if [ -n "$MISSING" ]; then
  printf '[!] prdt discipline MISSING for %s:%s\n' "$AGENT_TYPE" "$MISSING" >&2
  emit_ctx "[prdt discipline — MISSING]
Required discipline file(s) absent on this machine:$MISSING
STOP. Run prdt-install.sh to restore the ~/.prdt mirror. Do not act without discipline."
fi

block() { # $1 label, $2 path — emits a delimited block when the file exists
  [ -s "$2" ] && printf -- '----- BEGIN %s (%s) -----\n%s\n----- END %s -----\n\n' "$1" "$2" "$(cat "$2")" "$1"
}

MENUS=""
if [ "$PERSONA" = "po" ]; then
  for p in po designer developer qa; do
    MENUS="$MENUS$(block "$p playbook menu" "$DISC/$p/playbooks/_index.md")"
  done
else
  MENUS="$(block "$PERSONA playbook menu" "$DISC/$PERSONA/playbooks/_index.md")"
fi

PAYLOAD="[prdt discipline — $AGENT_TYPE session start]
Discipline injected below (doctrine → contracts → habit → overrides, later wins).
Playbook bodies load on demand via Bash cat under $DISC/ (Read does NOT expand ~).

$(block "doctrine" "$DOCTRINE")$(block "contracts" "$CONTRACTS")$(block "$PERSONA habit" "$HABIT")$(block "user overrides" "$PRDT_HOME/overrides/$PERSONA.md")$MENUS
Act per the discipline above. Do NOT acknowledge or narrate this injection in any register —
your first user-facing line must be product substance."

emit_ctx "$PAYLOAD"
