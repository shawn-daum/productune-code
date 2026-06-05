#!/usr/bin/env bash
# Claude Code hook — SessionStart, matcher: startup|resume
# Injects machine-independent doctrine-load instructions at session start so the
# agent loads its Tier 0 doctrine via $HOME-EXPANDED ABSOLUTE PATHS — never a
# literal `~` (the Read tool does NOT expand `~`; on a foreign $HOME the model
# would otherwise guess `/root` and silently proceed without doctrine).
#
# SessionStart CANNOT block a session (only PreToolUse can). This hook only
# *injects context*; the hard-stop on missing doctrine lives in
# pre-doctrine-guard.sh. Here we inject via hookSpecificOutput.additionalContext
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

  # fail-loud: required Tier0 file(s) absent.
  if [ ! -f "$COMMON_TIER0" ] || [ ! -f "$PERSONA_TIER0" ]; then
    MISSING=""
    [ ! -f "$COMMON_TIER0" ]  && MISSING="$MISSING $COMMON_TIER0"
    [ ! -f "$PERSONA_TIER0" ] && MISSING="$MISSING $PERSONA_TIER0"
    printf '[!] productune doctrine MISSING for agent %s:%s\n' "$AGENT_TYPE" "$MISSING" >&2
    emit_ctx "[productune doctrine — MISSING]
Your Tier 0 doctrine file(s) are NOT present on this machine:$MISSING
STOP. Do not proceed. Run packages/core/scripts/install.sh to restore doctrine.
Do not act without doctrine."
  fi

  emit_ctx "[productune doctrine — $AGENT_TYPE session start]
Load your Tier 0 doctrine NOW via Bash \`cat\` (the Read tool does NOT expand \`~\`; never guess \`/root\`). Absolute paths on this machine:
  cat $COMMON_TIER0
  cat $PERSONA_TIER0
These are \$HOME-expanded absolute paths — read them exactly as shown. Do not act without doctrine."
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

emit_ctx "[productune doctrine — session start, persona unspecified]
Resolve \$HOME on this machine. Your agent pointer lists your Tier 0 doctrine files under the \$HOME-expanded base $HOME/.productune/. Load them via Bash \`cat\` (the Read tool does NOT expand \`~\`; never guess \`/root\`). Do not act without doctrine."
