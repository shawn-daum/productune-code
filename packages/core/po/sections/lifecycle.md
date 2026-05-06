# Task lifecycle + Timeline

Sessions scoped per **task** (not project). Same-intent follow-ups stay in `current_task`. State key: `past_tickets` (legacy `past_tasks` + `current_round` / `rounds[]` — read-compat one cycle, then drop).

## Disposition (Step 1 step 2)

Inspect `current_task` + `past_tickets`. Classify:

- **(a) Continuation** — pronouns / temporal back-reference (intent: "that one", "just now", "continue"), files in `current_task.artifacts`, same scope → keep, `--resume`.
- **(b) Revival** — past slug/title/artifact named or strong overlap → confirm, archive current → restore past as current. Prompt template (rendered in user's lang): `"this looks like a follow-up to '<slug>'. continue that task? (y/n/[other slug])"`.
- **(c) New** — different feature/file/intent → archive current → past, allocate. Announce: `"starting new task '<slug>'"` (in user's lang).

## Archive `current_task` → `past_tickets` (mandatory before b/c)

Always write 1–2 sentence outcome before archiving — synthesized verdict (what shipped, open items, status), not persona dump.

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

`final_status`: `done` (delivered/QA pass or N/A) · `blocked` (QA fail loop cap or external dep) · `abandoned` (user explicitly drops the task — intent: "let's drop this" / "abandon").

Hook `pre-delegate-task-check.sh` blocks new-slug delegation if previous slug missing from `past_tickets`. Skipping not optional.

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
# 1. archive current (with outcome). 2. pluck matching past → current.
SLUG="login-modal-forgot-pw"
tmp=$(mktemp) && jq --arg slug "$SLUG" '
  (.past_tickets | map(select(.slug == $slug)) | last) as $f
  | if $f != null
    then .current_task = ($f | del(.ended_at, .final_status, .outcome_summary))
       | .past_tickets |= map(select(.slug != $slug))
    else . end
' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`persona_sessions` repopulates from past entry; resume seamlessly.

## Update `current_task.artifacts`

```bash
ARTIFACT="docs/design/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction + cleanup

Auto-compaction 70% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `productune.env` (sourced by wrapper; direct `claude --agent` doesn't inherit — `export` if needed). >50 turns one persona → ask user to split.

Claude transcripts: `cleanupPeriodDays` (default 30) in `~/.claude/settings.json`. `past_tickets` capped at 50.

---

## Timeline / project history

User asks for project history (intent: "what have we done", "show timeline", "summary so far") — **never invoke persona, never `git log`**. Source = `past_tickets` + `current_task`. Sort by `started_at`, render in user's lang per template:

```
## Project timeline (<repo>)

<started_at> – <ended_at>  <slug>  [<final_status>]
  request : <request_summary>
  flow    : <personas in order, pass/fail>
  artifacts: <artifacts>
  outcome : <outcome_summary>

in progress: <current_task.slug>  [in-progress]
```

Detail beyond summary: read PRD `docs/prd/<slug>.md`, persona notes, or `git log --since=<task.started_at> --until=<task.ended_at> -- <artifacts>`. `claude --resume` past session = last resort.

**Phase 4 R2 git-workflow**: ticket-level commit detail = `git -C <worktree_path> log --oneline` (worktree-isolated). Timeline itself derived from `past_tickets`.
