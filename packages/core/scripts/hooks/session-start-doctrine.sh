#!/usr/bin/env bash
# Claude Code hook — SessionStart, matcher: startup|resume
# INJECTS the Tier 0 doctrine content directly into the session context
# (decision 2026-06-10: injection over instruction — "cat this file" relies on
# model compliance and silently degrades after compaction; the habit files are
# small (≤60 lines each) so we pay the tokens and remove the failure mode).
#
# Bookshelf detail files stay load-on-demand via Bash `cat` with $HOME-expanded
# ABSOLUTE PATHS — never a literal `~` (the Read tool does NOT expand `~`; on a
# foreign $HOME the model would otherwise guess `/root`).
#
# SessionStart CANNOT block a session (only PreToolUse can). This hook only
# *injects context*; the hard-stop on missing doctrine lives in
# pre-doctrine-guard.sh. We inject via hookSpecificOutput.additionalContext
# (NOT bare stdout) to avoid interleaving with plugin-hook output.
#
# Input JSON (stdin): may include `agent_type` (present ONLY when this very
# invocation passed --agent) and `source` (startup|resume|clear|compact).
#
# jq is a hard dependency (same as the other productune hooks).

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"

AGENT_TYPE=""
SOURCE=""
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  SOURCE="$(printf '%s' "$EVENT_JSON" | jq -r '.source // ""' 2>/dev/null)"
fi

COMMON_TIER0="$HOME/.productune/doctrine/common/habit.md"

# Emit the additionalContext JSON envelope and exit. $1 = the context text.
emit_ctx() {
  printf '%s' "$1" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
  exit 0
}

# ── Persona branch: agent_type matches pdt-(po|developer|qa|designer) ─────────
PERSONA=""
case "$AGENT_TYPE" in
  pdt-po)        PERSONA="po" ;;
  pdt-developer) PERSONA="developer" ;;
  pdt-qa)        PERSONA="qa" ;;
  pdt-designer)  PERSONA="designer" ;;
esac

if [ -n "$PERSONA" ]; then
  PERSONA_TIER0="$HOME/.productune/doctrine/persona/$PERSONA/habit.md"

  # PO is orchestrator-only and does NOT read the common (worker) habit —
  # common doctrine governs dispatched workers (designer / developer / qa).
  NEED_COMMON=1
  [ "$PERSONA" = "po" ] && NEED_COMMON=0

  # fail-loud: required Tier0 file(s) absent.
  MISSING=""
  [ "$NEED_COMMON" = "1" ] && [ ! -f "$COMMON_TIER0" ] && MISSING="$MISSING $COMMON_TIER0"
  [ ! -f "$PERSONA_TIER0" ] && MISSING="$MISSING $PERSONA_TIER0"
  if [ -n "$MISSING" ]; then
    printf '[!] productune doctrine MISSING for agent %s:%s\n' "$AGENT_TYPE" "$MISSING" >&2
    emit_ctx "[productune doctrine — MISSING]
Your Tier 0 doctrine file(s) are NOT present on this machine:$MISSING
STOP. Do not proceed. Run packages/core/scripts/install.sh to restore doctrine.
Do not act without doctrine."
  fi

  COMMON_BLOCK=""
  if [ "$NEED_COMMON" = "1" ]; then
    COMMON_BLOCK="----- BEGIN Tier 0 common ($COMMON_TIER0) -----
$(cat "$COMMON_TIER0")
----- END Tier 0 common -----

"
  fi

  emit_ctx "[productune doctrine — $AGENT_TYPE session start — Tier 0 injected]
Your Tier 0 doctrine is injected in full below. Do NOT re-read the injected file(s); act on the injected text. Bookshelf detail files referenced inside still load on demand via Bash \`cat\` under the \$HOME-expanded base $HOME/.productune/ (the Read tool does NOT expand \`~\`; never guess \`/root\`).

$COMMON_BLOCK----- BEGIN Tier 0 persona ($PERSONA_TIER0) -----
$(cat "$PERSONA_TIER0")
----- END Tier 0 persona -----

Act per the doctrine above."
fi

# ── Fallback: no agent_type (resume w/o --agent, source clear/compact, etc.) ──
# fail-loud if even the common Tier0 is absent.
if [ ! -f "$COMMON_TIER0" ]; then
  printf '[!] productune common Tier0 doctrine MISSING: %s\n' "$COMMON_TIER0" >&2
  emit_ctx "[productune doctrine — MISSING]
The common Tier 0 doctrine file is NOT present on this machine: $COMMON_TIER0
STOP. Do not proceed. Run packages/core/scripts/install.sh to restore doctrine.
Do not act without doctrine."
fi

emit_ctx "[productune doctrine — session start, persona unspecified — Tier 0 common injected]
The Tier 0 common doctrine is injected below. If you are a pdt-* persona, ALSO load your persona habit before acting: Bash \`cat $HOME/.productune/doctrine/persona/<persona>/habit.md\` (\$HOME-expanded absolute path — the Read tool does NOT expand \`~\`; never guess \`/root\`).

----- BEGIN Tier 0 common ($COMMON_TIER0) -----
$(cat "$COMMON_TIER0")
----- END Tier 0 common -----

Act per the doctrine above."
