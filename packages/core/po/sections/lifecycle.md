# Task lifecycle + Timeline

Sessions scoped per **task** (not project). Same-intent follow-ups stay in `current_task`. State key: `current_task` (live) + ticket md files (`docs/tickets/<version>/T-NNN.md` = SoT for closed tickets, fs-scanned). Legacy `past_tickets[]` removed in v2; `past_tasks`, `current_round` / `rounds[]` legacy keys read-compat one cycle, then drop.

## Disposition (Step 1 step 2)

Inspect `current_task` + recent ticket md (fs scan, last 5 closed). Classify:

- **(a) Continuation** — pronouns / temporal back-reference ("that one", "just now", "continue"), files in `current_task.artifacts`, same scope → keep, `--resume`.
- **(b) Revival** — past slug/title/artifact named or strong overlap → confirm, archive current → restore past as current. Prompt template (in user's lang): `"this looks like follow-up to '<slug>'. continue that task? (y/n/[other slug])"`.
- **(c) New** — different feature/file/intent → archive current → past, allocate. Announce: `"starting new task '<slug>'"` (in user's lang).

## Archive `current_task` → ticket md (mandatory before b/c)

Always write 1–2 sentence outcome before archiving — synthesized verdict (what shipped, open items, status), not persona dump. Outcome lands in ticket md `## Outcome` section (Designer-authored when content needed; PO appends mechanical row to `## Persona Activity` table). State `current_task` cleared.

```bash
NOW=$(date -u +%FT%TZ); FINAL_STATUS="done"   # done | blocked | abandoned
TID=$(jq -r '.current_task.ticket_id' "$STATE")
VER=$(jq -r '.current_task.version // .current_version' "$STATE")
TICKET_MD="docs/tickets/$VER/$TID.md"
sed -i.bak -E "s/^status:.*/status: $FINAL_STATUS/" "$TICKET_MD" && rm -f "${TICKET_MD}.bak"
tmp=$(mktemp) && jq '.current_task = null' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

`final_status`: `done` (delivered/QA pass or N/A) · `blocked` (QA fail loop cap or external dep) · `abandoned` (user explicitly drops — intent: "let's drop this" / "abandon").

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

`persona_sessions{}` **not** revived — closed-ticket per-turn meta dropped per v2. New session ids allocated by claude on resume.

## Version id naming rule (T-P4-095)

`versions[].id` MUST match `^v\d+(\.\d+)?$`. Allowed: `v1`, `v2`, `v0.1`, `v1.2`. Rejected: `paepyeong-v1` (slug prefix), `v1-rc`, `V1`, `version-1`, `1.0`.

**version-create validation** — before pushing new entry to `versions[]`:

```bash
VERSION_ID="<proposed>"
if ! echo "$VERSION_ID" | grep -qE '^v[0-9]+(\.[0-9]+)?$'; then
  echo "version id must match v<N> or v<N>.<M> (e.g. v1, v0.1). Please choose valid id."
  exit 1
fi
```

User natural-language hints (`"start v2"` → use `v2`; `"next version"` → confirm `"v2"` before proceeding). PO appends to `versions[]` only after valid id confirmed.

When project new (po-state.json absent), read `initial_version` from `.productune/config.json` as first version id suggestion. Validate before using.

## Update `current_task.artifacts`

```bash
ARTIFACT="docs/design/login-modal.md"
tmp=$(mktemp) && jq --arg a "$ARTIFACT" '.current_task.artifacts |= ((. // []) + [$a] | unique)' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
```

## Compaction + cleanup

Auto-compaction 70% via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70` in `productune.env` (sourced by wrapper; direct `claude --agent` doesn't inherit — `export` if needed). >50 turns one persona → ask user to split.

Claude transcripts: `cleanupPeriodDays` (default 30) in `~/.claude/settings.json`. Ticket md files retained indefinitely (= SoT). `versions[]` in po-state capped at 5; older versions reachable via `outcome.retrospective_path` (`docs/retrospectives/<version>.md`).

## Timeline / project history → `sections/_details/lifecycle-timeline.md`
