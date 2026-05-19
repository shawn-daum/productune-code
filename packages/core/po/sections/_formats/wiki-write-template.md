# PO mechanical wiki write — invocation template (T-P4-121)

PO is sole mechanical executor of approved wiki episodes. Subagent dispatch path retired — claude code 2.1.142 MCP non-inheritance + agent whitelist tool-name resolution. PO subprocess (`claude --print` with no `--agent`) = only currently-functional path.

## Preconditions (PO self-check)

1. User emitted `[PROMOTION-APPROVED]` marker on surfacing turn (semantic intent: explicit approval of previously-surfaced wiki promotion candidate; PO matches user lang semantically).
2. `promotion_candidates[]` entry from persona output with `tier:"wiki"` — PO uses `.target` (graphiti `group_id`), `.episode_name` (graphiti `name`), `.episode_body` verbatim.
3. Parent PO shell has graphiti MCP registered. Quick check:
   `claude mcp list | grep -q '^graphiti' || echo "MISSING — run claude mcp add graphiti ..."`. Missing → surface to user, do not invoke.

## Invocation template

```bash
# Inputs from approved promotion_candidates[] entry:
GROUP_ID="persona-designer"                       # from .target
EPISODE_NAME="knowledge-state-anchored-alternatives"   # from .episode_name
EPISODE_BODY="When reporting N≥2 alternatives ..."     # verbatim from .episode_body
SRC_DESC="T-P4-NNN doctrine adoption"             # PO auto-generates: see convention below

TASK="[PROMOTION-APPROVED] mcp__graphiti__add_memory call:
group_id=\"$GROUP_ID\"
name=\"$EPISODE_NAME\"
episode_body=\"$EPISODE_BODY\"
source=\"text\"
source_description=\"$SRC_DESC\"
Confirm with episode id only. No commentary."

# Fire-and-forget. Background job for non-blocking PO turn.
JOBS_DIR="$HOME/.productune/wiki-jobs"
JOB_ID="wiki-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$JOBS_DIR"
touch "$JOBS_DIR/$JOB_ID.pending"

(
  NO_COLOR=1 claude --print --output-format json "$TASK" > "$JOBS_DIR/$JOB_ID.log" 2>&1
  mv "$JOBS_DIR/$JOB_ID.pending" "$JOBS_DIR/$JOB_ID.done"
) &

echo "[PO] saved (background, job=$JOB_ID)"
```

## `source_description` auto-generation convention

PO synthesizes mechanically (no semantic interpretation). Two forms:

```
"<ticket_id> doctrine adoption"                                    # default
"<ticket_id> + <YYYY-MM-DD> dogfood after <one-line trigger>"      # retry / dogfood context
```

Drawn from `current_task.ticket_id` + `current_task.slug` + today date.

Examples:
- `"T-P4-120 doctrine adoption"`
- `"T-P4-120 + 2026-05-15 dogfood retry after env restore"`

## Job tracking

Reuses background job pattern from `sections/memory.md`. Pending jobs >30s → warning at next turn-start; user can `cat $JOBS_DIR/$JOB_ID.log` to inspect output/error.

## What PO does NOT do

- Edit `episode_body` content (persona-authored verbatim).
- Skip `[PROMOTION-APPROVED]` marker check (gate enforces user approval).
- Call `mcp__graphiti__add_memory` directly in PO session (MCP integration in PO shell not part of doctrine — subprocess only).
- Use `claude --agent pdt-<persona>` or `claude --resume "$SID"` into persona session for wiki writes — explicitly retired path.
