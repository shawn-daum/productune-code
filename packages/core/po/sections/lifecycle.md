# Task lifecycle + Timeline

Sessions scoped per **task**, not project. Same-intent follow-ups stay in `current_task`. Genuinely different work = new task with fresh persona sessions.

State key is `past_tickets` (legacy `past_tasks` read-compat one round).

## Disposition (Stage 1 step 2)

Inspect `current_task` + `past_tickets`. Classify:

**(a) Continuation of `current_task`** — silent default:
- pronouns ("그", "방금", "이거 좀 더", "이어서"), verbs without new scope ("추가", "수정", "다시")
- references files/PRD slugs in `current_task.artifacts`
→ keep `current_task`, `--resume` persona sessions.

**(b) Revival of `past_tickets[i]`** — propose-and-confirm:
- mention of past slug/title or its artifacts; high keyword overlap
→ ask: `이건 'login-modal-forgot-pw' 후속처럼 보여요. 그 task 이어서 갈까요? (y/n/[다른 slug])`
→ on **y**: archive current → past, restore that past entry as current.

**(c) New task** — neither (a) nor (b): different feature/file/intent.
→ announce `새 task '<slug>' 시작합니다.`, archive current → past, allocate new.

## Archive `current_task` → `past_tickets` (mandatory before b/c)

Always write **1–2 sentence outcome** before archiving — synthesized verdict (what shipped, what's open, status), not persona dump.

```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
OUTCOME="Shipped LoginModal.tsx + readme typo. QA pass. 'forgot-pw' copy TBD."
tmp=$(mktemp) && jq --arg now "$NOW" --arg s "$FINAL_STATUS" --arg o "$OUTCOME" '
  if .current_task != null then
    .past_tickets = ((.past_tickets // []) + [(.current_task + {ended_at:$now, final_status:$s, outcome_summary:$o})])
    | .past_tickets |= (.[-50:]) | .current_task = null
  else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`final_status`: `done` (delivered/QA pass or N/A) · `blocked` (QA fail loop cap or external dep) · `abandoned` (user moved on / "그냥 접자").

**Hook enforcement**: `pre-delegate-task-check.sh` blocks new-slug delegation when previous turn's slug missing from `past_tickets`. Skipping archive not optional.

## Allocate new `current_task` (case c)

```bash
SLUG="<kebab>"; TITLE="<one-line>"; SUMMARY="<paraphrase>"; NOW=$(date -u +%FT%TZ)
tmp=$(mktemp) && jq --arg slug "$SLUG" --arg title "$TITLE" --arg summary "$SUMMARY" --arg now "$NOW" '
  .current_task = {slug:$slug, title:$title, started_at:$now, request_summary:$summary,
    artifacts:[], persona_sessions:{}, persona_session_meta:{}}
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Revive past ticket (case b)

```bash
SLUG="login-modal-forgot-pw"
# 1. archive current (with outcome). 2. pluck matching past → make current (drop ended_at)
tmp=$(mktemp) && jq --arg slug "$SLUG" '
  (.past_tickets | map(select(.slug == $slug)) | last) as $f
  | if $f != null
    then .current_task = ($f | del(.ended_at, .final_status, .outcome_summary))
       | .past_tickets |= map(select(.slug != $slug))
    else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`current_task.persona_sessions` repopulates from past entry; resume seamlessly.

## Update `current_task.artifacts`

```bash
ARTIFACT="docs/design/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction

Auto-compaction defaults **70%** via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `~/.productune/productune.env` (sourced by `productune` wrapper). Direct `claude --agent` calls don't inherit — `export` in shell rc if needed. Single task >50 turns on one persona → ask user to split.

## Disk cleanup

Claude Code session transcripts: `cleanupPeriodDays` (default 30) in `~/.claude/settings.json`. `past_tickets` never auto-deleted; oldest dropped only when length > 50.

---

## Timeline / project history

User asks history / "지금까지 뭐 했어" / 타임라인 — **never invoke persona, never derive from `git`**. Source = `past_tickets` + `current_task` in `po-state.json`. Sort by `started_at`, render chronologically:

```
## 프로젝트 타임라인 (<repo>)

<started_at> – <ended_at>  <slug>  [<final_status>]
  요청  : <request_summary>
  플로우: <personas in order, pass/fail>
  산출물: <artifacts>
  결과  : <outcome_summary>

진행중: <current_task.slug>  [in-progress]
```

Specific task detail beyond summary: read PRD `docs/prd/<slug>.md`, persona notes `docs/<persona>/*.md`, or `git log --since=<task.started_at> --until=<task.ended_at> -- <artifacts>`. `claude --resume` against past session = last resort (re-loads context — never for routine timeline).
