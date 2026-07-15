#!/usr/bin/env bash
# prdt — Claude Code discipline-injection hook (v1 hook #1). Registered TWICE:
#   SessionStart (matcher: startup|resume|clear)  — `claude --agent prdt-*` process path
#   SubagentStart (matcher: ^prdt-)               — Agent-tool subagent path (2026-07-02:
#     dogfood E1/E3 실측 — SessionStart는 sidechain에 발화하지 않음; SubagentStart가 공식 주입 채널)
# agents/prdt-*.md self-load is the belt-and-suspenders fallback for both.
#
# Injects the discipline set (§9): doctrine.md + contracts.md + <persona> habit
# + playbook menu(s). PO gets every persona's menu (dispatch routing needs
# them); a worker gets its own.
# Dynamic state (po-state, wiki index) is NOT injected — the PO habit reads it
# at turn open (it changes between turns; a snapshot would go stale).
#
# ~/.prdt/overrides/<persona>.md (last-wins overlay, §8) is INTENTIONALLY NOT
# appended here — it is injected by a separate hook, prdt-overrides-inject.sh,
# registered on these same events/matchers (T-358). A payload approaching/
# exceeding the harness's additionalContext persist-truncation threshold used
# to silently drop the overrides block (it sat last in this string, past the
# ~2KB preview cutoff). Splitting it into its own hook output means it is
# persist-checked independently and survives regardless of how large this
# payload grows. Do not re-add overrides here.
#
# fail-loud: a required file missing/empty on this machine → inject STOP notice.
# Output via hookSpecificOutput.additionalContext (jq is a hard dependency).

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
AGENT_TYPE=""; EVENT_CWD=""; EVENT_NAME="SessionStart"
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null)"
  EN="$(printf '%s' "$EVENT_JSON" | jq -r '.hook_event_name // ""' 2>/dev/null)"
  [ -n "$EN" ] && EVENT_NAME="$EN"
fi

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
DISC="$PRDT_HOME/discipline"
DOCTRINE="$PRDT_HOME/doctrine.md"
CONTRACTS="$DISC/contracts.md"

emit_ctx() {
  printf '%s' "$1" | jq -Rs --arg ev "$EVENT_NAME" '{hookSpecificOutput:{hookEventName:$ev,additionalContext:.}}'
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
STOP. Run install.sh (packages/core/scripts) to restore the ~/.prdt mirror. Do not act without discipline."
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

# 1회용 migration 온보딩 (PO만): prdt migrate가 남긴 플래그를 발견하면 자기-브리핑
# 지시를 주입하고 플래그를 소거 — 사용자가 첫 마디를 조립할 필요를 없앤다.
ONBOARD=""
if [ "$PERSONA" = "po" ]; then
  PROJ_PO="$(find_proj "$EVENT_CWD")"
  FLAG="$PROJ_PO/.prdt/migration-briefing-pending"
  if [ -n "$PROJ_PO" ] && [ -f "$FLAG" ]; then
    ONBOARD="----- MIGRATION ONBOARDING (one-shot) -----
This project was JUST migrated to prdt: $(cat "$FLAG")
current_task was reset. Whatever the user's first message says, OPEN with a short
briefing you build yourself — stage/version, open tickets (prdt tickets --status open,
read their bodies incl. migration comments), PRD presence, latest commits — then propose
the next move. Do not ask the user to reconstruct context; the repo has it.
----- END MIGRATION ONBOARDING -----

"
    rm -f "$FLAG" 2>/dev/null || true
  fi
fi

PAYLOAD="[prdt discipline — $AGENT_TYPE session start]
Discipline injected below (doctrine → contracts → habit, later wins). Machine
overrides (if any) arrive as a SEPARATE hook output right around this one —
those take priority over everything here (last-wins, T-358).
Playbook bodies load on demand via Bash cat under $DISC/ (Read does NOT expand ~).

$(block "doctrine" "$DOCTRINE")$(block "contracts" "$CONTRACTS")$(block "$PERSONA habit" "$HABIT")$MENUS$ONBOARD
Act per the discipline above. Do NOT acknowledge or narrate this injection in any register —
your first user-facing line must be product substance."

emit_ctx "$PAYLOAD"
