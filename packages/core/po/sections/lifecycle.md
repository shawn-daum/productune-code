# Task lifecycle + Timeline

Sessions scoped per **task** (not project). Same-intent follow-ups stay in `current_task`. State key: `current_task` (live) + ticket md files (`docs/tickets/<version>/T-NNN.md` = SoT for closed tickets, fs-scanned). Legacy `past_tickets[]` removed in v2; `past_tasks`, `current_round` / `rounds[]` legacy keys read-compat one cycle, then drop.

## Disposition (Step 1 step 2)

Inspect `current_task` + recent ticket md (fs scan, last 5 closed). Classify:

- **(a) Continuation** — pronouns / temporal back-reference (intent: "that one", "just now", "continue"), files in `current_task.artifacts`, same scope → keep, `--resume`.
- **(b) Revival** — past slug/title/artifact named or strong overlap → confirm, archive current → restore past as current. Prompt template (rendered in user's lang): `"this looks like a follow-up to '<slug>'. continue that task? (y/n/[other slug])"`.
- **(c) New** — different feature/file/intent → archive current → past, allocate. Announce: `"starting new task '<slug>'"` (in user's lang).

## Archive `current_task` → ticket md (mandatory before b/c)

Always write 1–2 sentence outcome before archiving — synthesized verdict (what shipped, open items, status), not persona dump. Outcome lands in ticket md `## Outcome` section (Designer-authored when content needed; PO appends mechanical row to `## Persona Activity` table). State `current_task` is then cleared.

```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
# 1. PO updates ticket md frontmatter mechanically (status, completed_at, duration_min)
TID=$(jq -r '.current_task.ticket_id' "$STATE")
VER=$(jq -r '.current_task.version // .current_version' "$STATE")
TICKET_MD="docs/tickets/$VER/$TID.md"
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD" && rm -f "${TICKET_MD}.bak"
# 2. PO clears current_task (live state)
tmp=$(mktemp) && jq '.current_task = null' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`final_status`: `done` (delivered/QA pass or N/A) · `blocked` (QA fail loop cap or external dep) · `abandoned` (user explicitly drops the task — intent: "let's drop this" / "abandon").

Hook `pre-delegate-task-check.sh` blocks new-slug delegation if previous ticket md missing required `status` and `## Outcome`. Skipping not optional.

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
# 1. archive current (with outcome). 2. fs-scan ticket md → seed current_task.
SLUG="login-modal-forgot-pw"
SCAN=$(node scripts/po/scan-tickets.mjs "$PROJECT_DIR")
MATCH=$(echo "$SCAN" | jq -r --arg slug "$SLUG" '[.[] | select(.slug == $slug)] | last')
if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
  tmp=$(mktemp) && jq --argjson f "$MATCH" '
    .current_task = {ticket_id:$f.ticket_id, slug:$f.slug, title:$f.title,
                      type:$f.type, status:$f.status, request_summary:$f.request_summary,
                      artifacts:[], persona_sessions:{}, persona_session_meta:{}}
  ' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
fi
```

`persona_sessions{}` is **not** revived — closed-ticket per-turn meta is dropped per v2 doctrine. New session ids allocated by claude on resume.

## Update `current_task.artifacts`

```bash
ARTIFACT="docs/design/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction + cleanup

Auto-compaction 70% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `productune.env` (sourced by wrapper; direct `claude --agent` doesn't inherit — `export` if needed). >50 turns one persona → ask user to split.

Claude transcripts: `cleanupPeriodDays` (default 30) in `~/.claude/settings.json`. Ticket md files retained indefinitely (= SoT). `versions[]` in po-state capped at 5; older versions reachable via `outcome.retrospective_path` (`docs/retrospectives/<version>.md`).

---

## Timeline / project history

User asks for project history (intent: "what have we done", "show timeline", "summary so far") — **never invoke persona, never `git log`**. Source = fs scan of `docs/tickets/**/*.md` + `current_task` + `versions[]` in state. Sort by `started_at`, render in user's lang per template:

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

**R2 git-workflow**: ticket-level commit detail = `git -C <worktree_path> log --oneline` (worktree-isolated). Timeline itself derived from fs scan of ticket md files.
