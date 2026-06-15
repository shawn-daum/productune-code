#!/usr/bin/env bash
# Claude Code hook — SessionStart, matcher: startup|resume
# Idempotently migrates po-state.json with schema_version < 2 to v2 shape:
#   • stamps schema_version = 2
#   • drops past_tickets array (docs/tickets/*/T-NNN.md is the SoT)
#   • renames current_task.stage → type (T-P4-065 compat, if stage present and type absent)
#   • drops unknown current_task fields outside the canonical 14-field whitelist
#     (13 from delegation.md + started_at written by post-delegate-state-write.sh)
#   NOTE: persona_sessions + persona_session_meta are CANONICAL (delegation.md §current_task)
#         — NOT deleted here; they are preserved and cleared only at ticket close.
#
# Safety (AC-5, oh-my-eyes slug lesson):
#   • writes .bak before any transform
#   • runs jq merge-only (never full-rewrite: only del/with_entries/field-set)
#   • verifies load-bearing fields slug/request_summary/artifacts/persona_sessions/
#     version/current_phase survive the transform
#   • on any failure: aborts and restores the .bak
#
# Idempotent: second run on a v2 file is a strict no-op (gate: schema_version >= 2).
#
# SessionStart CANNOT block a session — this hook only performs file operations.
# Emits additionalContext when migration runs so PO sees it at session start.
#
# AC-3, AC-5, AC-7 (T-PATCH-139)

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0

EVENT_CWD=""
if [ -n "$EVENT_JSON" ]; then
  EVENT_CWD="$(printf '%s' "$EVENT_JSON" | jq -r '.cwd // ""' 2>/dev/null || true)"
fi

# ── Find project po-state.json via cwd walk-up ───────────────────────────────
find_po_state() {
  local d="${1:-$PWD}"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    [ -f "$d/.productune/po-state.json" ] && { printf '%s' "$d/.productune/po-state.json"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

STATE="$(find_po_state "$EVENT_CWD" 2>/dev/null || find_po_state "$PWD" 2>/dev/null || true)"
[ -z "$STATE" ] && exit 0
[ -f "$STATE" ] || exit 0

# ── Read current schema_version (default 1 if absent) ────────────────────────
SCHEMA_V="$(jq -r '.schema_version // 1' "$STATE" 2>/dev/null || echo 1)"
case "$SCHEMA_V" in (''|*[!0-9]*) SCHEMA_V=1 ;; esac

# Idempotent gate: already v2+ → strict no-op (no output, clean exit)
[ "$SCHEMA_V" -ge 2 ] && exit 0

# ── Backup (abort if bak write fails) ────────────────────────────────────────
TS_STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%s)"
BAK="${STATE}.bak.${TS_STAMP}"
if ! cp "$STATE" "$BAK" 2>/dev/null; then
  printf '[po-state-migrate] ERROR: .bak write failed (%s) — aborting migration\n' "$BAK" >&2
  exit 0
fi

# ── Canonical current_task whitelist ─────────────────────────────────────────
# 13 fields from delegation.md §current_task (2026-06-15) [T-PATCH-139]:
#   slug, request_summary, artifacts, type, status, persona_sessions,
#   persona_session_meta, calibration_outcome, ticket_id, title, model, effort, qa_status
# + started_at: written by post-delegate-state-write.sh auto-open block; not in the
#   canonical 13 but present in every live current_task — kept to prevent false-positive
#   field drops on real po-states.
CANONICAL='["slug","request_summary","artifacts","type","status","persona_sessions","persona_session_meta","calibration_outcome","ticket_id","title","model","effort","qa_status","started_at"]'

# ── jq migration (in-place merge, never full-rewrite) ────────────────────────
TMP="$(mktemp)"
jq --argjson allowed "$CANONICAL" '
  if (.schema_version // 1) >= 2 then . else
    # 1. stage → type rename in current_task (T-P4-065 sub-d compat)
    ( if ((.current_task // {}) | type) == "object"
          and (.current_task | has("stage"))
          and ((.current_task | has("type")) | not)
      then .current_task |= (.type = .stage | del(.stage))
      else . end )
    # 2. drop unknown current_task fields outside canonical whitelist
    | ( if ((.current_task // null) | type) == "object"
        then .current_task |= with_entries(
          select(.key as $k | ($allowed | index($k)) != null)
        )
        else . end )
    # 3. drop past_tickets array (ticket md files are the SoT — never duplicate here)
    | del(.past_tickets)
    # 4. stamp schema_version = 2
    | .schema_version = 2
  end
' "$STATE" > "$TMP" 2>/dev/null

# ── Verify: non-empty + schema_version == 2 ──────────────────────────────────
if [ ! -s "$TMP" ]; then
  rm -f "$TMP"
  printf '[po-state-migrate] ERROR: jq produced empty output — aborting, .bak at: %s\n' "$BAK" >&2
  exit 0
fi

NEW_SV="$(jq -r '.schema_version // 0' "$TMP" 2>/dev/null || echo 0)"
if [ "$NEW_SV" != "2" ]; then
  rm -f "$TMP"
  printf '[po-state-migrate] ERROR: output schema_version=%s (expected 2) — aborting, .bak at: %s\n' "$NEW_SV" "$BAK" >&2
  exit 0
fi

# ── Verify load-bearing field survival (AC-5) ────────────────────────────────
# Only checks fields that were NON-NULL in the original.
# Passes cleanly when current_task is null (fresh po-state with no active ticket).
LOST="$(python3 - "$STATE" "$TMP" <<'PYEOF' 2>/dev/null
import json, sys
try:
    with open(sys.argv[1]) as f:
        old = json.load(f)
    with open(sys.argv[2]) as f:
        new = json.load(f)
except Exception:
    sys.exit(0)  # parse failure → safety pass (jq already validated above)

checks = [
    ('version',          lambda d: d.get('version')),
    ('current_phase',    lambda d: d.get('current_phase')),
    ('slug',             lambda d: (d.get('current_task') or {}).get('slug')),
    ('request_summary',  lambda d: (d.get('current_task') or {}).get('request_summary')),
    ('artifacts',        lambda d: (d.get('current_task') or {}).get('artifacts')),
    ('persona_sessions', lambda d: (d.get('current_task') or {}).get('persona_sessions')),
]
lost = []
for name, getter in checks:
    old_val = getter(old)
    new_val = getter(new)
    # Only flag when the field was non-None/non-empty in original and is None in output
    if old_val is not None and old_val != {} and old_val != [] and new_val is None:
        lost.append(name)
print(','.join(lost))
PYEOF
)"

if [ -n "$LOST" ]; then
  rm -f "$TMP"
  printf '[po-state-migrate] ERROR: load-bearing field(s) lost: %s — aborting, restoring .bak\n' "$LOST" >&2
  cp "$BAK" "$STATE" 2>/dev/null
  exit 0
fi

# ── Apply ─────────────────────────────────────────────────────────────────────
mv "$TMP" "$STATE"

# Emit additionalContext so PO sees the migration at session start
MSG="[po-state-migrate] v1→v2 migration applied to $(basename "$(dirname "$STATE")")/po-state.json
  Changes: schema_version=2 stamped; past_tickets dropped; non-canonical current_task fields removed.
  Backup preserved at: ${BAK}
  Run state-hygiene turn-open sweep to confirm clean shape."

printf '%s' "$MSG" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
exit 0
