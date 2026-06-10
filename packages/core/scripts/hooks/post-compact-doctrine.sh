#!/usr/bin/env bash
# Claude Code hook — PostCompact
# Re-INJECTS the Tier 0 doctrine content into the session right after Claude
# compacts its context (decision 2026-06-10: injection over instruction — a
# compaction can drop the doctrine from the rolling context, and a "re-read
# these files" reminder relies on model compliance at exactly the moment it is
# weakest; the habit files are small so we inject them verbatim).
#
# Persona detection mirrors session-start-doctrine.sh: `agent_type` is present
# on stdin only when the invocation passed --agent; default = po (the only
# persona with long-lived sessions that actually compact).
#
# Stdout from a PostCompact hook is appended to the session as a system
# message. Dynamic state (Tier 2 personal habit, po-state) stays as re-read
# pointers — it changes between turns, so injecting a snapshot would go stale.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"

AGENT_TYPE=""
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
fi

PERSONA="po"
case "$AGENT_TYPE" in
  pdt-developer) PERSONA="developer" ;;
  pdt-qa)        PERSONA="qa" ;;
  pdt-designer)  PERSONA="designer" ;;
esac

COMMON="$HOME/.productune/doctrine/common/habit.md"
DOCTRINE="$HOME/.productune/doctrine/persona/$PERSONA/habit.md"
PERSONAL="$HOME/.productune/$PERSONA/habit.md"

# PO is orchestrator-only and does NOT read the common (worker) habit.
NEED_COMMON=1
[ "$PERSONA" = "po" ] && NEED_COMMON=0

# If Tier 0 is unexpectedly missing, fall back to a loud pointer (cannot inject).
if { [ "$NEED_COMMON" = "1" ] && [ ! -f "$COMMON" ]; } || [ ! -f "$DOCTRINE" ]; then
  cat <<EOF
[productune doctrine — post-compaction, Tier 0 MISSING]
Expected Tier 0 file(s) absent (persona: $PERSONA): $COMMON $DOCTRINE
STOP. Re-run packages/core/scripts/install.sh to restore doctrine. Do not act without doctrine.
EOF
  exit 0
fi

COMMON_BLOCK=""
if [ "$NEED_COMMON" = "1" ]; then
  COMMON_BLOCK="----- BEGIN Tier 0 common ($COMMON) -----
$(cat "$COMMON")
----- END Tier 0 common -----

"
fi

# Tier 1 (project, cwd walk-up) + Tier 2 (personal) — optional, injected when present.
EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null)"
TIER1_BLOCK=""
PROJ="${EVENT_CWD:-$PWD}"
while [ -n "$PROJ" ] && [ "$PROJ" != "/" ]; do
  [ -f "$PROJ/.productune/po-state.json" ] && break
  PROJ="$(dirname "$PROJ")"
done
if [ -n "$PROJ" ] && [ "$PROJ" != "/" ] && [ -f "$PROJ/docs/$PERSONA/habit.md" ]; then
  TIER1_BLOCK="

----- BEGIN Tier 1 project ($PROJ/docs/$PERSONA/habit.md) -----
$(cat "$PROJ/docs/$PERSONA/habit.md")
----- END Tier 1 project -----"
fi

TIER2_BLOCK=""
if [ -f "$PERSONAL" ]; then
  TIER2_BLOCK="

----- BEGIN Tier 2 personal ($PERSONAL) -----
$(cat "$PERSONAL")
----- END Tier 2 personal -----"
fi

# Unquoted heredoc so $HOME-expanded absolute paths and the $(cat …) injections
# expand (NOT a literal `~` — the Read tool does not expand `~`). `\$` keeps an
# intended literal `$`; the repo-relative po-state path stays literal (it is
# relative to cwd, not $HOME).
cat <<EOF
[productune doctrine — re-injected after compaction — all habit tiers injected]

Your habit tiers are injected in full below, in layer-priority order (later layers override earlier on the same topic).

$COMMON_BLOCK----- BEGIN Tier 0 persona/$PERSONA ($DOCTRINE) -----
$(cat "$DOCTRINE")
----- END Tier 0 persona -----$TIER1_BLOCK$TIER2_BLOCK

Dynamic state — re-read now (load via Bash \`cat\`; the Read tool does NOT expand \`~\`):
  - ./.productune/po-state.json          (current_task, recent_turns, close_gate — PO only)
  - $HOME/.productune/doctrine/persona/$PERSONA/bookshelf/<name>.md  (detail per topic; load on demand)

PO is orchestrator-only — authors no content; never self-generate a session_id.
EOF

exit 0
