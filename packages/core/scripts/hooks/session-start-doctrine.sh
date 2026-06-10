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
EVENT_CWD=""
if [ -n "$EVENT_JSON" ] && command -v jq >/dev/null 2>&1; then
  AGENT_TYPE="$(printf '%s' "$EVENT_JSON" | jq -r '.agent_type // ""' 2>/dev/null)"
  SOURCE="$(printf '%s' "$EVENT_JSON" | jq -r '.source // ""' 2>/dev/null)"
  EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null)"
fi

COMMON_TIER0="$HOME/.productune/doctrine/common/habit.md"

# ── Pending-migration scan (PO only) ──────────────────────────────────────────
# ~/.productune/migrations/*.md (id / auto_check frontmatter) 를 프로젝트의
# .productune/config.json :: schema_v 와 대조. auto_check exit 0 = 적용 필요.
# 결과 블록은 PO 컨텍스트에 주입 — PO 가 turn 시작에 사용자에게 적용을 제안한다.
build_migration_block() {
  local d="${1:-}" proj=""
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    [ -f "$d/.productune/po-state.json" ] && { proj="$d"; break; }
    d="$(dirname "$d")"
  done
  [ -z "$proj" ] && return 0
  local migdir="$HOME/.productune/migrations"
  [ -d "$migdir" ] || return 0
  local schema_v
  schema_v="$(jq -r '.schema_v // 0' "$proj/.productune/config.json" 2>/dev/null)"
  case "$schema_v" in (''|*[!0-9]*) schema_v=0 ;; esac
  local pending="" f id check title
  for f in "$migdir"/*.md; do
    [ -f "$f" ] || continue
    id="$(grep -m1 '^id:' "$f" | awk '{print $2}')"
    case "$id" in (''|*[!0-9]*) continue ;; esac
    [ "$id" -le "$schema_v" ] && continue
    check="$(grep -m1 '^auto_check:' "$f" | sed 's/^auto_check:[[:space:]]*//')"
    if [ -n "$check" ]; then
      ( cd "$proj" && bash -c "$check" ) >/dev/null 2>&1 || continue
    fi
    title="$(grep -m1 '^title:' "$f" | sed 's/^title:[[:space:]]*//')"
    pending="$pending
  - migration $id: $title — task spec: $f"
  done
  [ -z "$pending" ] && return 0
  printf '%s' "

[productune migrations — PENDING for this project]$pending
At turn start, surface these to the user (1-line each, user lang) and offer to apply. Each file's '## PO 지시 프롬프트' section IS the task — route it per normal delegation rules. Apply ONLY on user approval; after migration N completes, set .productune/config.json schema_v=N via jq."
}

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

  # Tier 1 (project, cwd walk-up) + Tier 2 (personal) — optional files, injected
  # when present. Injection order = layer priority (0 common → 0 persona → 1 → 2,
  # last wins), so the read-order rule is structural, not instructional.
  TIER1_BLOCK=""
  PROJ="$EVENT_CWD"
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
  TIER2_FILE="$HOME/.productune/$PERSONA/habit.md"
  if [ -f "$TIER2_FILE" ]; then
    TIER2_BLOCK="

----- BEGIN Tier 2 personal ($TIER2_FILE) -----
$(cat "$TIER2_FILE")
----- END Tier 2 personal -----"
  fi

  MIGRATION_BLOCK=""
  [ "$PERSONA" = "po" ] && MIGRATION_BLOCK="$(build_migration_block "$EVENT_CWD")"

  emit_ctx "[productune doctrine — $AGENT_TYPE session start — all habit tiers injected]
Your habit tiers are injected in full below, in layer-priority order (later layers override earlier on the same topic). Bookshelf detail files referenced inside load on demand via Bash \`cat\` under the \$HOME-expanded base $HOME/.productune/ (the Read tool does NOT expand \`~\`; never guess \`/root\`).

$COMMON_BLOCK----- BEGIN Tier 0 persona ($PERSONA_TIER0) -----
$(cat "$PERSONA_TIER0")
----- END Tier 0 persona -----$TIER1_BLOCK$TIER2_BLOCK

Act per the doctrine above.$MIGRATION_BLOCK"
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
