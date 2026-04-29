# Task lifecycle + Timeline

Sessions are scoped per **task**, not per project. A task spans the initial user request and any follow-up turns that refine the same work. When the user moves to something genuinely different, that's a new task with fresh persona sessions.

## Disposition — which task does this prompt belong to? (Stage 1 step 2)

Inspect `current_task` and `past_tasks` in `po-state.json`. Then classify:

**(a) Continuation of `current_task`** — silent default when:
- pronouns/demonstratives referring to immediately prior work ("그", "방금", "아까", "이거 좀 더", "이어서")
- verbs like "추가", "수정", "다시", "고쳐" without naming a different scope
- references files / paths / PRD slugs in `current_task.artifacts`
→ keep `current_task`, just resume its persona sessions

**(b) Revival of `past_tasks[i]`** — propose-and-confirm:
- user mentions a past task's slug or title or one of its artifacts
- topical keyword overlap is high with `past_tasks[i].title` or `request_summary`
- examples: "어제 만든 login modal 좀 더 둥글게", "전에 했던 readme 정리 작업 마저 끝내자"
→ propose: `이건 'login-modal-forgot-pw' 후속처럼 보여요. 그 task 이어서 갈까요? (y/n/[다른 slug])`
→ on **y**: archive current → past, restore that past entry as current (see Archive/Revive below)
→ on **n** or different slug: handle as (c) or specified slug

**(c) New task** — when neither (a) nor (b):
- different feature, different file area, different intent
- announce: `새 task '<auto-slug>' 시작합니다.`
- archive current → past, allocate new current_task

When (a) signals are weak but (b) candidates exist with good match, prefer asking. When (b) candidates are weak too, default to (c).

## Archive `current_task` → `past_tasks` (transitioning to b or c)

Before pushing the current task into the past array, write a brief **outcome** so the timeline view later has something to render. The outcome is your synthesized 1–2 sentence verdict, *not* a reused JSON dump from a persona — it captures what shipped, what's still open, and the final status.

```bash
NOW=$(date -u +%FT%TZ)
FINAL_STATUS="done"   # or "blocked" / "abandoned"
OUTCOME_SUMMARY="Shipped 2 files (LoginModal.tsx + readme typo). QA pass. Designer flagged copy of forgot-pw link as 'TBD' — open follow-up."
tmp=$(mktemp) && jq \
  --arg now "$NOW" --arg status "$FINAL_STATUS" --arg outcome "$OUTCOME_SUMMARY" '
  if .current_task != null then
    .past_tasks = ((.past_tasks // []) + [(.current_task + {ended_at: $now, final_status: $status, outcome_summary: $outcome})])
    | .past_tasks |= (.[-50:])
    | .current_task = null
  else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

Default `final_status`:
- `done` — delivered, QA passed (or QA wasn't applicable)
- `blocked` — stopped due to QA failure that hit the loop cap, or external dependency
- `abandoned` — user moved on without explicit completion (when (b)/(c) auto-archives a stale current_task)

If user asks "이거 그냥 접자" / "취소" / abandons silently, write `final_status="abandoned"` and an outcome describing what was reached.

## Allocate new `current_task` (case c)

```bash
SLUG="<kebab-case-derived-from-user-request>"
TITLE="<one-line summary>"
SUMMARY="<paraphrase of user request, 1–2 sentences>"
NOW=$(date -u +%FT%TZ)
tmp=$(mktemp) && jq --arg slug "$SLUG" --arg title "$TITLE" --arg summary "$SUMMARY" --arg now "$NOW" '
  .current_task = {
    slug: $slug, title: $title, started_at: $now,
    request_summary: $summary, artifacts: [],
    persona_sessions: {}, persona_session_meta: {}
  }
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Revive a past task (case b)

```bash
SLUG_TO_REVIVE="login-modal-forgot-pw"
NOW=$(date -u +%FT%TZ)
# 1. archive current
tmp=$(mktemp) && jq --arg now "$NOW" '
  if .current_task != null then
    .past_tasks = ((.past_tasks // []) + [(.current_task + {ended_at: $now})])
    | .past_tasks |= (.[-50:])
    | .current_task = null
  else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
# 2. pluck the matching past_task and make it current (drop ended_at)
tmp=$(mktemp) && jq --arg slug "$SLUG_TO_REVIVE" '
  (.past_tasks | map(select(.slug == $slug)) | .[-1]) as $found
  | if $found != null
    then .current_task = ($found | del(.ended_at))
       | .past_tasks |= map(select(.slug != $slug))
    else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

After revive, persona sessions resume seamlessly via the standard invocation template (`current_task.persona_sessions` already populated from the past entry).

## Updating `current_task.artifacts`

Whenever a persona returns a new artifact (PRD path, design doc, code file changed), append:

```bash
ARTIFACT="docs/design/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction (still automatic, just less critical now)

Within a single task, sessions can grow large if it drags on. Claude Code's auto-compaction at ~95% kicks in. `install.sh` defaults this to **70%** by writing `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` to `~/.productune/productune.env` — `productune` (the wrapper) sources this with `set -a`, so any persona spawned through it inherits the override.

To override:
```sh
sed -i.bak 's/^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=.*/CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80/' ~/.productune/productune.env
```

Direct `claude --agent pdt-X` calls **don't** inherit this — add `export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` to your shell rc if you also use direct calls.

If a single task somehow exceeds 50 turns on a given persona — extremely rare under task-scoped sessions — flag to user: "이 task 가 pdt-designer 한테 50 턴이나 갔어요. 새 task 로 분리할까요?"

## Disk cleanup

Claude Code deletes session transcripts older than `cleanupPeriodDays` days (default 30). Override in `~/.claude/settings.json`:

```json
{ "cleanupPeriodDays": 14 }
```

Past task entries in `po-state.json` are *not* auto-deleted; oldest are dropped only when `past_tasks` exceeds 50.

---

## Timeline / project history (when user asks)

When the user asks for the project's history, timeline, log, or "지금까지 뭐 했어" — *do not invoke any persona*. The data is already in `po-state.json`. Read `current_task` + `past_tasks`, sort by `started_at`, and render chronologically:

```
## 프로젝트 타임라인 (<repo-name>)

<started_at> – <ended_at>  <slug>  [<final_status>]
  요청  : <request_summary, 1 line>
  플로우: <personas that ran, in order, with pass/fail>
  산출물: <artifacts>
  결과  : <outcome_summary, 1 line>

... (repeat per task, oldest → newest) ...

진행중: <current_task.slug>  [in-progress]
  요청  : ...
  플로우 (지금까지): PO planning ✓, pdt-designer ✓, pdt-developer (turn 2) ⏳
  현재 산출물: ...
```

If user asks for a *specific* task's detail beyond the summary:
- read the PRD if one exists at `docs/prd/<slug>.md`
- read persona project notes at `docs/<persona>/*.md` filtered by date/keywords
- as a last resort, `claude --resume <session-id>` against that task's persona session and ask for a summary (re-loads context — use sparingly, never for routine timeline rendering)

For "what changed in task X" specifically: `git log --since=<task.started_at> --until=<task.ended_at>` over the artifact paths — much cheaper than re-resuming.
