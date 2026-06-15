#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Safety net for po-state.json shape violations that PreToolUse could not block
# (computed jq writes, variable-interpolated values, etc.).
#
# After any Bash command that references po-state.json, reads the ACTUAL on-disk
# file and surfaces corrective messages on stderr for:
#   • schema_version below 2
#   • past_tickets array present
#   • current_task fields outside the canonical 14-field whitelist
#   • current_task.status not in the canonical enum (§3 enum guard, AC-6)
#
# NON-BLOCKING by design (PostToolUse cannot exit 2 after a write has happened).
# Surfaces corrective messages so the model self-corrects in the same turn.
# Over-surfacing is harmless; over-blocking would be an outage.
#
# Enum SoT: packages/core/config/ticket-status-enum.json → ~/.productune/config/
# mirror. No new hardcoded enum copy — same loading pattern as pre-frontmatter-lint.sh.
#
# AC-4, AC-6, AC-7 (T-PATCH-139)

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

TOOL_NAME="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"
[ "$TOOL_NAME" = "Bash" ] || exit 0

CMD="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"
[ -z "$CMD" ] && exit 0

# Gate: only act when command references po-state.json
printf '%s' "$CMD" | grep -qE '\.productune/po-state\.json' || exit 0

# ── Locate po-state.json from command (extract literal path) ────────────────
# Try to get path from the command itself; fall back to cwd walk-up.
PO_STATE_PATH="$(printf '%s' "$CMD" | grep -oE '[^[:space:]"'"'"']*\.productune/po-state\.json' | head -1 || true)"

if [ -z "$PO_STATE_PATH" ] || [ ! -f "$PO_STATE_PATH" ]; then
  EVENT_CWD="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('cwd', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"

  find_po_state() {
    local d="${1:-$PWD}"
    while [ "$d" != "/" ] && [ -n "$d" ]; do
      [ -f "$d/.productune/po-state.json" ] && { printf '%s' "$d/.productune/po-state.json"; return 0; }
      d="$(dirname "$d")"
    done
    return 1
  }
  PO_STATE_PATH="$(find_po_state "$EVENT_CWD" 2>/dev/null || find_po_state "$PWD" 2>/dev/null || true)"
fi

[ -z "$PO_STATE_PATH" ] && exit 0
[ -f "$PO_STATE_PATH" ] || exit 0

# ── Enum (config mirror; hardcoded fallback — parity with pre-frontmatter-lint.sh) ──
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

# ── Canonical current_task field whitelist ────────────────────────────────────
# 13 from delegation.md + started_at (post-delegate-state-write.sh auto-open).
# Must stay in sync with session-start-po-state-migrate.sh and pre-po-state-shape-guard.sh.
CANONICAL_CT_FIELDS="slug request_summary artifacts type status persona_sessions persona_session_meta calibration_outcome ticket_id title model effort qa_status started_at"

# ── Parse on-disk file and surface violations ─────────────────────────────────
# Python writes violations to stdout; bash captures and re-routes to stderr so
# the model sees them. Python parse errors are suppressed (2>/dev/null) to keep
# the hook quiet on non-JSON targets.
VIOLATIONS="$(python3 - "$PO_STATE_PATH" "$STATUS_ENUM" "$CANONICAL_CT_FIELDS" 2>/dev/null <<'PYEOF'
import json, sys

path        = sys.argv[1]
status_enum = set(sys.argv[2].split('|'))
ct_allowed  = set(sys.argv[3].split())

try:
    with open(path) as f:
        state = json.load(f)
except Exception as e:
    # Not valid JSON — surface a parse error (to stdout so bash captures it)
    print(f'[po-state-shape-guard] {path}: invalid JSON — {e}')
    sys.exit(0)

issues = []

# 1. schema_version check
sv = state.get('schema_version')
if sv is not None and isinstance(sv, (int, float)) and int(sv) < 2:
    issues.append(
        f'[po-state-shape-guard] {path}: schema_version={sv} (must be 2). '
        f'Run session-start-po-state-migrate or set "schema_version": 2.'
    )
elif sv is None:
    issues.append(
        f'[po-state-shape-guard] {path}: schema_version missing — '
        f'stamp "schema_version": 2 (session-start-po-state-migrate.sh handles this at next startup).'
    )

# 2. past_tickets check
if 'past_tickets' in state:
    issues.append(
        f'[po-state-shape-guard] {path}: past_tickets array present — '
        f'remove it. Ticket history lives in docs/tickets/*/T-NNN.md (SoT).'
    )

# 3. current_task field whitelist + status enum
ct = state.get('current_task')
if isinstance(ct, dict):
    st = ct.get('status')
    if st and st not in status_enum:
        allowed_str = ' | '.join(sorted(status_enum))
        issues.append(
            f'[po-state-shape-guard] current_task.status: "{st}" not in canonical enum.\n'
            f'  allowed: {allowed_str}\n'
            f'  Fix: set current_task.status to a canonical value (e.g. in-progress, not planning).'
        )

    for k in ct:
        if k not in ct_allowed:
            issues.append(
                f'[po-state-shape-guard] current_task.{k} is not a canonical field — remove it.\n'
                f'  Running notes go in the ticket ## Persona Activity table or briefs/<slug>.md.\n'
                f'  Allowed fields: {" ".join(sorted(ct_allowed))}'
            )

for issue in issues:
    print(issue)

PYEOF
)"

if [ -n "$VIOLATIONS" ]; then
  printf '%s\n' "$VIOLATIONS" >&2
fi

exit 0
