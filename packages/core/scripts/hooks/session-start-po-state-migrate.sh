#!/usr/bin/env bash
# Claude Code hook — SessionStart, matcher: startup|resume
# Idempotently migrates po-state.json with schema_version < 2 to v2 shape:
#   • stamps schema_version = 2
#   • drops past_tickets array (docs/tickets/*/T-NNN.md is the SoT)
#   NOTE: An ACTIVE current_task may carry same-session work-state scratch
#         (progress / decisions / next / carry, etc). canonical-14 is the AT-REST
#         shape (no active task); the durable cross-session SoT is the brief
#         (briefs/<slug>.md). This hook therefore does NOT strip current_task —
#         active scratch is preserved; it is cleared only at ticket close when
#         current_task → null (T-PATCH-153).
#         persona_sessions + persona_session_meta are CANONICAL (delegation.md
#         §current_task) and likewise preserved.
#
# Safety (AC-5, oh-my-eyes slug lesson):
#   • writes .bak before any transform
#   • runs jq merge-only (never full-rewrite: only del/field-set)
#   • verifies load-bearing fields slug/request_summary/artifacts/persona_sessions/
#     version/current_phase survive the transform
#   • on any failure: aborts and restores the .bak
#
# Idempotent: a strict no-op when the file is already shape-clean.
#   Gate is SHAPE-based, not version-based (T-PATCH-146): needs_cleanup = TRUE when
#   schema_version < 2 (or non-numeric / float literal), OR past_tickets present.
#   current_task contents are NOT gated (active scratch is allowed — T-PATCH-153).
#   A v2-stamped-but-dirty file (e.g. v2 + leftover past_tickets) is therefore
#   re-cleaned; a genuinely clean v2 file (no past_tickets, numeric schema 2) is a
#   strict no-op (no output, no .bak). The jq transform is idempotent on
#   already-clean fields, so re-running it on partially-dirty v2 is safe.
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

# ── Shape-based idempotency gate (T-PATCH-146, T-PATCH-153) ──────────────────
# needs_cleanup = TRUE when ANY of:
#   1. schema_version < 2 (or non-numeric / float literal)
#   2. past_tickets present
# current_task contents are NOT gated (active scratch is allowed — T-PATCH-153).
# Genuinely clean v2 (no past_tickets, numeric schema 2) → needs_cleanup FALSE →
# strict no-op (no output, no .bak).
# ISSUE 1 (T-PATCH-146): a non-numeric schema_version (e.g. the string "2") is
# caught by the `type != "number"` clause below. A FLOAT literal (e.g. 2.0) is
# invisible to jq — jq treats 2.0 and 2 as the same number, so the gate can't
# distinguish them — but it survives in the JSON source text as "2.0", which the
# sibling shape-guard / downstream tooling may reject. Detect it at the raw-text
# level (no false-positive on integer literals) and force a re-clean; the jq
# transform's `.schema_version = 2` re-serialises it to the integer 2.
SV_NONINT_LITERAL=0
if grep -qE '"schema_version"[[:space:]]*:[[:space:]]*-?[0-9]+\.[0-9]+([eE][-+]?[0-9]+)?' "$STATE" 2>/dev/null; then
  SV_NONINT_LITERAL=1
fi

NEEDS_CLEANUP="$(jq -r --argjson svfloat "$SV_NONINT_LITERAL" '
  (
    ($svfloat == 1)
    or ((.schema_version | type) != "number")
    or ((.schema_version // 1) < 2)
    or has("past_tickets")
  ) | if . then "1" else "0" end
' "$STATE" 2>/dev/null || echo 1)"

# Parse failure or jq error → conservatively treat as needing cleanup (the
# transform is merge-only + guarded by .bak restore, so a re-clean is safe).
case "$NEEDS_CLEANUP" in (1) : ;; (0) exit 0 ;; (*) NEEDS_CLEANUP=1 ;; esac

# ── Backup (abort if bak write fails) ────────────────────────────────────────
TS_STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%s)"
BAK="${STATE}.bak.${TS_STAMP}"
if ! cp "$STATE" "$BAK" 2>/dev/null; then
  printf '[po-state-migrate] ERROR: .bak write failed (%s) — aborting migration\n' "$BAK" >&2
  exit 0
fi

# ── jq migration (in-place merge, never full-rewrite) ────────────────────────
# No version branch here (T-PATCH-146): the shape gate above already decided this
# file is dirty. The transform is idempotent on already-clean fields, so applying
# it to a v2-stamped-but-dirty file safely re-cleans only the violating parts.
TMP="$(mktemp)"
jq '
    # 1. drop past_tickets array (ticket md files are the SoT — never duplicate here)
    del(.past_tickets)
    # 2. stamp schema_version = 2
    | .schema_version = 2
' "$STATE" > "$TMP" 2>/dev/null

# ── Verify: non-empty + schema_version == 2 ──────────────────────────────────
if [ ! -s "$TMP" ]; then
  rm -f "$TMP"
  # File was NOT changed — discard the orphan .bak so it doesn't accumulate every
  # session start on a malformed/empty/array-root po-state (T-PATCH-146 ISSUE 2).
  rm -f "$BAK"
  printf '[po-state-migrate] ERROR: jq produced empty output — aborting (no change made)\n' >&2
  exit 0
fi

NEW_SV="$(jq -r '.schema_version // 0' "$TMP" 2>/dev/null || echo 0)"
if [ "$NEW_SV" != "2" ]; then
  rm -f "$TMP"
  # File was NOT changed — discard the orphan .bak (T-PATCH-146 ISSUE 2).
  rm -f "$BAK"
  printf '[po-state-migrate] ERROR: output schema_version=%s (expected 2) — aborting (no change made)\n' "$NEW_SV" >&2
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
MSG="[po-state-migrate] po-state.json normalised to canonical v2 shape ($(basename "$(dirname "$STATE")")/po-state.json)
  This is EXPECTED, not an error, and LOSSLESS — it is the routine session-start hygiene pass, not a malfunction or a loss of work-state.
  Dropped: past_tickets (the ticket .md under docs/tickets/*/ is the SoT — never duplicated here). schema_version stamped to 2. current_task is left intact — an active task's same-session work-state scratch (progress / decisions / next / carry) is preserved.
  The durable cross-session SoT for active-task work-state is the brief (briefs/<slug>.md) — po-state current_task scratch is a same-session convenience cache, cleared at ticket close.
  ⚠️ Do NOT restore the .bak unless debugging — it re-introduces any dropped past_tickets, which get re-cleaned at the very next session start. The .bak is retained for debug only.
  Backup (debug-only): ${BAK}"

printf '%s' "$MSG" | jq -Rs '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
exit 0
