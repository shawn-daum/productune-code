#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Firm rules before `claude --agent pdt-*` / `--resume`:
#   R1. current_task must have semantic slug + request_summary (no auto-*).
#   R2. New task: previous current_task slug must be archived to past_tickets
#       (else PO is task-switching without proper close).
#   R4. --resume <uuid> must use a UUID present in current_task.persona_sessions
#       (else PO is reusing a session from a prior task).
#
# (R3 — the .md-boundary check — was retired in the orchestrator rework. PO
#  authors no files at all in the new doctrine, so the boundary is the empty
#  set. Frontmatter `tools:` no longer includes Write/Edit on PO either.)

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

COMMAND="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)"

case "$COMMAND" in
  *"claude --agent pdt-"*) ;;
  *"claude --resume "*)    ;;
  *) exit 0 ;;
esac

# Same compound command writes current_task before delegating → R1 satisfied
SAME_COMPOUND_WRITES_CT=0
case "$COMMAND" in
  *"current_task"*"jq"*"claude --agent"*)        SAME_COMPOUND_WRITES_CT=1 ;;
  *"jq"*".current_task ="*"claude --agent"*)     SAME_COMPOUND_WRITES_CT=1 ;;
esac

EVENT_CWD="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd') or '')
except Exception:
    print('')
" 2>/dev/null)"

find_po_state() {
  local d="${1:-$PWD}"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    [ -f "$d/.productune/po-state.json" ] && { echo "$d/.productune/po-state.json"; return 0; }
    [ -f "$d/.codex/po-state.json" ]      && { echo "$d/.codex/po-state.json";      return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

STATE="$(find_po_state "$EVENT_CWD" || find_po_state "$PWD" || true)"
[ -z "$STATE" ] && exit 0

emit_block() {
  printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
  exit 0
}

# Derive a heuristic slug + summary from the delegate command's TASK string and
# write current_task in-place. Returns 0 on success (caller continues without
# block), 1 on failure (caller falls back to emit_block). Used by R1.
emit_autofill() {
  local task slug summary now tmp
  task="$(printf '%s' "$COMMAND" | python3 -c "
import shlex, sys
try:
    parts = shlex.split(sys.stdin.read().strip())
    print(parts[-1] if parts and not parts[-1].startswith('-') else '')
except Exception:
    print('')
" 2>/dev/null)"

  slug="$(printf '%s' "$task" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | awk -F- '{n=NF<6?NF:5; for(i=1;i<=n;i++) printf "%s%s", (i>1?"-":""), $i; print ""}' \
    | cut -c1-50 | sed 's/-*$//')"
  [ -z "$slug" ] && slug="task-$(date +%s | tail -c 7)"

  summary="$(printf '%s' "$task" | head -c 200)"
  [ -z "$summary" ] && summary="(auto-fill: empty TASK)"

  now="$(date -u +%FT%TZ)"
  tmp="$(mktemp)"
  if jq --arg slug "$slug" --arg now "$now" --arg summary "$summary" '
    .current_task = ((.current_task // {}) + {
      slug: $slug,
      started_at: $now,
      request_summary: $summary,
      artifacts: ((.current_task.artifacts // [])),
      persona_sessions: ((.current_task.persona_sessions // {})),
      persona_session_meta: ((.current_task.persona_session_meta // {})),
      auto_filled_by_hook: true
    })
  ' "$STATE" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$STATE"
    printf '[productune] R1 auto-fill: current_task.slug="%s" (PO skipped pre-write — hook seeded; refine at Stage 3 archive if heuristic is off)\n' "$slug" >&2
    SLUG="$slug"
    SUMMARY="$summary"
    return 0
  else
    rm -f "$tmp"
    return 1
  fi
}

SLUG="$(jq -r '.current_task.slug // ""' "$STATE" 2>/dev/null)"
SUMMARY="$(jq -r '.current_task.request_summary // ""' "$STATE" 2>/dev/null)"

# ── R1: current_task must have semantic slug + summary. Auto-fill if missing ─
# (Was: block. Now: hook seeds current_task from TASK heuristic, leaving R2/R4
# to do their normal checks. PO can refine slug at archive time.)
if [ "$SAME_COMPOUND_WRITES_CT" = "0" ]; then
  if [ -z "$SLUG" ] || [ "${SLUG#auto-}" != "$SLUG" ] || [ -z "$SUMMARY" ] || [ "$SUMMARY" = "(auto-opened by post-delegate hook)" ]; then
    if ! emit_autofill; then
      emit_block "R1 auto-fill failed (jq error). Write current_task manually before delegating (portable — no sponge):

  jq '.current_task = {slug: \"<kebab-task>\", started_at: \"$(date -u +%FT%TZ)\", request_summary: \"<one-line>\", artifacts: [], persona_sessions: {}, persona_session_meta: {}}' .productune/po-state.json > .productune/po-state.json.tmp && mv .productune/po-state.json.tmp .productune/po-state.json

(See ~/.productune/sections/lifecycle.md.)"
    fi
  fi
fi

# ── R2: new task — previous slug must be archived ────────────────────────────
PREV_SLUG="$(jq -r '.recent_turns // [] | (last // {}) | .task_slug // ""' "$STATE" 2>/dev/null)"
if [ -n "$PREV_SLUG" ] && [ -n "$SLUG" ] && [ "$PREV_SLUG" != "$SLUG" ]; then
  ARCHIVED="$(jq -r --arg s "$PREV_SLUG" '
    ((.past_tickets // .past_tasks // []) | map(select(.slug == $s)) | length)
  ' "$STATE" 2>/dev/null)"
  if [ "$ARCHIVED" = "0" ]; then
    emit_block "Switching to task '$SLUG' but previous task '$PREV_SLUG' was never archived. Archive it first (portable — no sponge):

  jq --arg now \"\$(date -u +%FT%TZ)\" '
    if .current_task != null and .current_task.slug != \"$SLUG\" then
      .past_tickets = ((.past_tickets // []) + [(.current_task + {ended_at: \$now, final_status: \"done\", outcome_summary: \"<1-line synthesis>\"})])
      | .past_tickets |= (.[-50:])
    else . end
  ' .productune/po-state.json > .productune/po-state.json.tmp && mv .productune/po-state.json.tmp .productune/po-state.json

Then jq-write the new current_task and retry. (See ~/.productune/sections/lifecycle.md §Archive.)"
  fi
fi

# ── R4: --resume UUID must belong to current_task.persona_sessions ───────────
RESUME_UUID="$(printf '%s' "$COMMAND" | sed -nE 's/.*--resume "?([0-9a-f-]+)"?.*/\1/p' | head -1)"
if [ -n "$RESUME_UUID" ]; then
  KNOWN="$(jq -r --arg u "$RESUME_UUID" '
    ((.current_task.persona_sessions // {}) | to_entries | map(select(.value == $u)) | length)
  ' "$STATE" 2>/dev/null)"
  if [ "$KNOWN" = "0" ]; then
    emit_block "Resume UUID $RESUME_UUID is not in current_task.persona_sessions for slug '$SLUG'. New task = first call WITHOUT --session-id (Claude Code returns one in .session_id). Don't reuse UUIDs from past tasks. (See ~/.productune/po-instructions.md §Hard rules — Persona invocation.)"
  fi
fi

exit 0
