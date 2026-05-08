#!/usr/bin/env bash
# v1-to-v2.sh — productune po-state.json migration: schema_version 1 → 2.
#
# Idempotent: re-running on already-v2 state is a no-op.
#
# Combines three v2 changes from T-P4-065:
#   - sub-a: Phase 1..5 (was 1..4). Old phase=4 (Close) re-mapped to 5.
#            Phase 4 (Deploy) only forward-applies — no back-fill.
#   - sub-d: ticket frontmatter `stage` → `type` rename.
#            (`current_task.stage` → `current_task.type`,
#             `past_tickets[].stage` → `past_tickets[].type` for one final
#             pass before slim deletes `past_tickets`.)
#   - sub-f: po-state slim:
#            · `past_tickets[]` removed entirely (ticket md = SoT).
#            · `current_task.persona_sessions` / `persona_session_meta` dropped
#              (live state only; per-ticket audit lives in ticket md).
#            · `versions[]` capped at last 5 (older → retrospective_path).
#            · `phase_history[]` kept as-is (current-version only by convention).
#
# Usage:
#   ./v1-to-v2.sh <project-dir>
#
# Backup: writes <project-dir>/.productune/po-state.json.bak.<UTC-iso> before
# transform. Restore via `cp <bak> <state>` if anything goes wrong.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <project-dir>" >&2
  exit 64
fi

PROJECT_DIR="$1"
STATE="$PROJECT_DIR/.productune/po-state.json"

if [ ! -f "$STATE" ]; then
  echo "no po-state.json at $STATE — nothing to migrate" >&2
  exit 0
fi

# Idempotent gate — exit early if already v2.
CURRENT_V=$(jq -r '.schema_version // 1' "$STATE")
if [ "$CURRENT_V" -ge 2 ] 2>/dev/null; then
  echo "po-state.json already at schema_version=$CURRENT_V — skip"
  exit 0
fi

BACKUP="$STATE.bak.$(date -u +%FT%TZ)"
cp "$STATE" "$BACKUP"
echo "backup: $BACKUP"

tmp=$(mktemp)
jq '
  if (.schema_version // 1) >= 2 then .   # safety net (race)
  else
    # ── sub-a: Phase 4 (Close in v1) → Phase 5 (Close in v2) ────────────────
    (if .current_phase == 4 then .current_phase = 5 else . end)
    | (if (.phase_history // []) | type == "array"
        then .phase_history |= map(if .phase == 4 then .phase = 5 else . end)
        else . end)
    | (if .pending_gate != null and .pending_gate.from_phase == 4
        then .pending_gate.from_phase = 5 else . end)
    | (if .pending_gate != null and .pending_gate.to_phase == 4
        then .pending_gate.to_phase = 5 else . end)
    # ── sub-d: stage → type rename (current_task + past_tickets) ────────────
    | (if (.current_task // {}) | has("stage")
        then .current_task |= (.type = .stage | del(.stage))
        else . end)
    | (if (.past_tickets // []) | type == "array"
        then .past_tickets |= map(
            if has("stage") and (has("type") | not)
            then .type = .stage | del(.stage)
            else . end)
        else . end)
    # ── sub-f: slim ────────────────────────────────────────────────────────
    | del(.past_tickets)
    | del(.current_task.persona_sessions)
    | del(.current_task.persona_session_meta)
    | (.versions = ((.versions // []) | sort_by(.started_at // "") | .[-5:]))
    | (.phase_history = (.phase_history // []))
    # ── pending_promotions[] — ensure array present (T-P4-066) ───────────
    | (.pending_promotions = (.pending_promotions // []))
    # ── stamp ──────────────────────────────────────────────────────────────
    | .schema_version = 2
  end
' "$STATE" > "$tmp"

mv "$tmp" "$STATE"

# Verify post-conditions.
if ! jq -e '
  .schema_version == 2
  and ((.past_tickets // null) == null)
  and (.current_task | has("stage") | not)
  and (.current_task | has("persona_sessions") | not)
  and (.current_task | has("persona_session_meta") | not)
  and ((.versions // []) | length <= 5)
' "$STATE" >/dev/null; then
  echo "ERROR: post-migration verify failed — restoring backup" >&2
  cp "$BACKUP" "$STATE"
  exit 1
fi

echo "migrated: $STATE → schema_version=2"
