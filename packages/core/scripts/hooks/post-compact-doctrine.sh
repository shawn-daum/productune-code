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

# If Tier 0 is unexpectedly missing, fall back to a loud pointer (cannot inject).
if [ ! -f "$COMMON" ] || [ ! -f "$DOCTRINE" ]; then
  cat <<EOF
[productune doctrine — post-compaction, Tier 0 MISSING]
Expected Tier 0 file(s) absent: $COMMON $DOCTRINE
STOP. Re-run packages/core/scripts/install.sh to restore doctrine. Do not act without doctrine.
EOF
  exit 0
fi

# Unquoted heredoc so $HOME-expanded absolute paths and the $(cat …) injections
# expand (NOT a literal `~` — the Read tool does not expand `~`). `\$` keeps an
# intended literal `$`; the repo-relative po-state path stays literal (it is
# relative to cwd, not $HOME).
cat <<EOF
[productune doctrine — re-injected after compaction — Tier 0 injected]

Your Tier 0 doctrine is injected in full below. Do NOT re-read these two files; act on the injected text.

----- BEGIN Tier 0 common ($COMMON) -----
$(cat "$COMMON")
----- END Tier 0 common -----

----- BEGIN Tier 0 persona/$PERSONA ($DOCTRINE) -----
$(cat "$DOCTRINE")
----- END Tier 0 persona -----

Dynamic state — re-read these now (load via Bash \`cat\`; the Read tool does NOT expand \`~\`):
  - $PERSONAL                            (Tier 2 personal — user prefs + product taste + workflow)
  - ./.productune/po-state.json          (current_task, recent_turns, close_gate — PO only)
  - $HOME/.productune/doctrine/persona/$PERSONA/bookshelf/<name>.md  (detail per topic; load on demand)

PO is orchestrator-only — authors no content; never self-generate a session_id.
EOF

if [ ! -f "$PERSONAL" ]; then
  echo
  echo "[!] $PERSONAL not found — re-run packages/core/scripts/install.sh to restore it."
fi

exit 0
