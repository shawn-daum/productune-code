#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit|Bash
# Guards po-state.json against v1-shape writes and non-canonical current_task.status.
#
# Channels:
#   Write  — full JSON parse of proposed content; strict shape check.
#   Edit   — conservative literal scan of new_string.
#   Bash   — CONSERVATIVE static detection only: block iff a command
#            UNAMBIGUOUSLY writes a non-v2 shape literal into po-state.json.
#            Variable-interpolated / computed values → PASS (PostToolUse is the net).
#
# Flags (blocks exit 2):
#   • schema_version explicitly set to a value < 2
#   • past_tickets key present in the write
#   • current_task.status set to a non-canonical value (enum from ticket-status-enum.json)
#
# NOTE (T-PATCH-153): an ACTIVE current_task may carry same-session work-state
# scratch (progress / decisions / next / carry, etc). Non-canonical current_task
# sub-fields are therefore NO LONGER blocked — scratch writes are allowed. Only
# the three flags above are guarded.
#
# Cardinal rule: OVER-BLOCKING a valid write is a hard outage; under-blocking is
# recoverable. When in doubt, PASS.
#
# AC-4, AC-6, AC-7 (T-PATCH-139)

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# ── Extract tool_input field (shared helper) ──────────────────────────────────
read_json() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', {})
    print(ti.get('$1', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON"
}

TOOL_NAME="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"

# ── Enum definitions (single-source via config mirror; hardcoded fallback) ────
# SoT: packages/core/config/ticket-status-enum.json → mirrored to
# ~/.productune/config/ticket-status-enum.json by install.sh.
# No new enum copy — reuse same loading pattern as pre-frontmatter-lint.sh (AC-6).
STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"
ENUM_CONFIG="$HOME/.productune/config/ticket-status-enum.json"
if [ -f "$ENUM_CONFIG" ]; then
  _loaded="$(python3 -c "
import json
try:
    d = json.load(open('$ENUM_CONFIG'))
    s = '|'.join(d.get('status', []))
    if s:
        print(s)
except Exception:
    pass
" 2>/dev/null)"
  [ -n "$_loaded" ] && STATUS_ENUM="$_loaded"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
emit_block_sv() {
  printf '[po-state-shape-guard] schema_version: "%s" — must be 2 (or omit to let migrate hook stamp it).\n' "$1" >&2
  printf '  Fix: remove the schema_version key or set it to 2.\n' >&2
}

emit_block_pt() {
  printf '[po-state-shape-guard] past_tickets write blocked — ticket md files are the source of truth.\n' >&2
  printf '  Never write past_tickets into po-state.json. Remove it.\n' >&2
}

emit_block_status() {
  printf '[po-state-shape-guard] current_task.status: "%s" not in canonical enum.\n' "$1" >&2
  printf '  allowed: %s\n' "$(printf '%s' "$STATUS_ENUM" | tr '|' ' ' | sed 's/  */ | /g')" >&2
  printf '  Fix the value and retry.\n' >&2
}

is_po_state_path() {
  case "$1" in
    *".productune/po-state.json") return 0 ;;
    *) return 1 ;;
  esac
}

# ════════════════════════════════════════════════════════════════════════════
# Channel: Write — full JSON parse of proposed content
# ════════════════════════════════════════════════════════════════════════════
if [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH="$(read_json file_path)"
  is_po_state_path "$FILE_PATH" || exit 0

  CONTENT="$(read_json content)"
  [ -z "$CONTENT" ] && exit 0

  # Full JSON parse for Write — we have the complete proposed content.
  CHECK="$(python3 -c "
import json, sys
content = '''$CONTENT'''
try:
    d = json.loads(content)
except Exception:
    # Not valid JSON or multiline issue — try via sys.argv
    sys.exit(0)

status_enum = set('$STATUS_ENUM'.split('|'))
issues = []

sv = d.get('schema_version')
if sv is not None and isinstance(sv, (int,float)) and int(sv) < 2:
    issues.append(('schema_version', str(sv)))

if 'past_tickets' in d:
    issues.append(('past_tickets', None))

ct = d.get('current_task')
if isinstance(ct, dict):
    st = ct.get('status')
    if st and st not in status_enum:
        issues.append(('status', st))

for kind, val in issues:
    if kind == 'schema_version':
        print('sv:' + val)
    elif kind == 'past_tickets':
        print('past_tickets')
    elif kind == 'status':
        print('status:' + val)
" 2>/dev/null || true)"

  RC=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      sv:*)      emit_block_sv "${line#sv:}";      RC=2 ;;
      past_tickets) emit_block_pt;                  RC=2 ;;
      status:*)  emit_block_status "${line#status:}"; RC=2 ;;
    esac
  done <<< "$CHECK"
  exit $RC
fi

# ════════════════════════════════════════════════════════════════════════════
# Channel: Edit — conservative literal scan of new_string
# ════════════════════════════════════════════════════════════════════════════
if [ "$TOOL_NAME" = "Edit" ]; then
  FILE_PATH="$(read_json file_path)"
  is_po_state_path "$FILE_PATH" || exit 0

  NEW_STR="$(read_json new_string)"
  [ -z "$NEW_STR" ] && exit 0

  # Conservative: only flag literal non-2 schema_version, past_tickets, non-enum status.
  # Variable-interpolated values → pass. Non-canonical current_task scratch fields
  # are allowed (T-PATCH-153) — not flagged here.

  # schema_version check: "schema_version": N where N != 2
  if printf '%s' "$NEW_STR" | grep -qE '"schema_version"[[:space:]]*:[[:space:]]*[0-9]+'; then
    SV_VAL="$(printf '%s' "$NEW_STR" | grep -oE '"schema_version"[[:space:]]*:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+$')"
    if [ -n "$SV_VAL" ] && [ "$SV_VAL" -ne 2 ] 2>/dev/null; then
      emit_block_sv "$SV_VAL"
      exit 2
    fi
  fi

  # past_tickets
  if printf '%s' "$NEW_STR" | grep -qE '"past_tickets"'; then
    emit_block_pt
    exit 2
  fi

  # Non-canonical current_task.status — only literal string values
  if printf '%s' "$NEW_STR" | grep -qE '"status"[[:space:]]*:[[:space:]]*"[A-Za-z0-9_-]+"'; then
    ST_VAL="$(printf '%s' "$NEW_STR" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[A-Za-z0-9_-]+"' | head -1 | grep -oE '"[A-Za-z0-9_-]+"$' | tr -d '"')"
    if [ -n "$ST_VAL" ] && ! printf '%s' "$ST_VAL" | grep -qE "^(${STATUS_ENUM})$"; then
      emit_block_status "$ST_VAL"
      exit 2
    fi
  fi

  exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
# Channel: Bash — CONSERVATIVE static detection only.
# Block iff the command UNAMBIGUOUSLY writes a non-v2 shape literal into
# a po-state.json. Anything with variable interpolation / command substitution
# around the flagged values → PASS (PostToolUse is the safety net).
# ════════════════════════════════════════════════════════════════════════════
if [ "$TOOL_NAME" = "Bash" ]; then
  CMD="$(read_json command)"
  [ -z "$CMD" ] && exit 0

  # Gate 1: command must reference po-state.json
  printf '%s' "$CMD" | grep -qE '\.productune/po-state\.json' || exit 0

  # Bail on shell-expansion metachars near the flagged constructs — ambiguous → pass.
  # (Checked per-pattern below, not globally, to stay precise.)

  # ── schema_version literal check ────────────────────────────────────────────
  # Detect jq expressions that set .schema_version to a literal non-2 integer.
  # Pattern: .schema_version = N  OR  "schema_version": N  where N is a digit
  SV_CANDS="$(printf '%s' "$CMD" | grep -oE '(\.schema_version|"schema_version")[[:space:]]*=[[:space:]]*[0-9]+|"schema_version"[[:space:]]*:[[:space:]]*[0-9]+' 2>/dev/null || true)"
  if [ -n "$SV_CANDS" ]; then
    # Check no $ or ` immediately around the value
    if ! printf '%s' "$CMD" | grep -qE '(\.schema_version|"schema_version")[[:space:]]*(=|:)[[:space:]]*(\$|`)'; then
      while IFS= read -r cand; do
        [ -z "$cand" ] && continue
        SV_NUM="$(printf '%s' "$cand" | grep -oE '[0-9]+$')"
        if [ -n "$SV_NUM" ] && [ "$SV_NUM" -ne 2 ] 2>/dev/null; then
          emit_block_sv "$SV_NUM"
          exit 2
        fi
      done <<< "$SV_CANDS"
    fi
  fi

  # ── past_tickets literal check ───────────────────────────────────────────────
  # Detect jq/json expressions that assign .past_tickets or "past_tickets"
  if printf '%s' "$CMD" | grep -qE '(\.past_tickets|"past_tickets")[[:space:]]*(=|\+?=)'; then
    # Not ambiguous variable? Then block.
    if ! printf '%s' "$CMD" | grep -qE '(\.past_tickets|"past_tickets")[[:space:]]*(=|\+?=)[[:space:]]*\$'; then
      emit_block_pt
      exit 2
    fi
  fi

  # ── Non-canonical current_task.status literal check (§3 enum guard) ──────────
  # Detect jq expressions like .current_task.status = "planning"
  CT_STATUS_CANDS="$(printf '%s' "$CMD" | grep -oE '\.current_task\.status[[:space:]]*=[[:space:]]*"[A-Za-z0-9_-]+"' 2>/dev/null || true)"
  if [ -n "$CT_STATUS_CANDS" ]; then
    # Bail if value is shell-variable
    if ! printf '%s' "$CMD" | grep -qE '\.current_task\.status[[:space:]]*=[[:space:]]*(\$|`)'; then
      while IFS= read -r cand; do
        [ -z "$cand" ] && continue
        ST_VAL="$(printf '%s' "$cand" | grep -oE '"[A-Za-z0-9_-]+"$' | tr -d '"')"
        if [ -n "$ST_VAL" ] && ! printf '%s' "$ST_VAL" | grep -qE "^(${STATUS_ENUM})$"; then
          emit_block_status "$ST_VAL"
          exit 2
        fi
      done <<< "$CT_STATUS_CANDS"
    fi
  fi

  # Non-canonical current_task scratch fields are allowed (T-PATCH-153) — not flagged.

  exit 0
fi

exit 0
