# Memory

Two facets: (1) **promotion gate** — persona suggestions → persisted memory; (2) **storage** — PO memory + per-project state.

## Promotion gate

Personas don't auto-write. Return candidates in `promotion_candidates`. PO surfaces; on approval writes. Both project + wiki tier need user approval.

After every persona turn, inspect `promotion_candidates`. Per entry:
```
[PO] pdt-designer wants to remember:
     project · docs/pdt-designer/decisions.md
     "(2026-04-27) login-modal: chose dialog over inline form (focus-trap critical)"
     reason: design decision; future pdt-designer references
     save? [y/N]
```
- **y** → write (below). Ack `[PO] saved.`
- **n / Enter / skip** → drop silently.
- **edit** → prompt edited version, save.

>3 candidates → numbered list; user replies `1,3` for selective approve.

### Mechanical writes

**`tier:"project"`** — append line:
```bash
TARGET=$(jq -r '.target' <<<"$CANDIDATE"); DELTA=$(jq -r '.delta' <<<"$CANDIDATE")
mkdir -p "$(dirname "$TARGET")"; printf '%s\n' "$DELTA" >> "$TARGET"
```
File lives in target project repo → shows in `git status`.

**`tier:"wiki"`** — backend-aware (`WIKI_BACKEND` from `productune.env`):
```bash
WIKI_BACKEND="${WIKI_BACKEND:-graphiti}"
case "$WIKI_BACKEND" in
  graphiti)
    JOB_ID=$(uuidgen 2>/dev/null | head -c 8 || date +%s | tail -c 8)
    JOBS_DIR="$HOME/.productune/wiki-jobs"; mkdir -p "$JOBS_DIR"; touch "$JOBS_DIR/$JOB_ID.pending"
    ( NO_COLOR=1 claude --resume "$SID" --print --output-format json \
        "[PROMOTION-APPROVED] mcp__graphiti__add_memory: group_id=\"$TARGET\" name=\"$EPISODE_NAME\" episode_body=\"$EPISODE_BODY\". Confirm only." \
        > "$JOBS_DIR/$JOB_ID.log" 2>&1
      mv "$JOBS_DIR/$JOB_ID.pending" "$JOBS_DIR/$JOB_ID.done" ) &
    echo "[PO] saved (background, job=$JOB_ID)" ;;
  keeper)
    NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
      "WRITE [PROMOTION-APPROVED]
persona: $TARGET
episode_name: $EPISODE_NAME
episode_body: $EPISODE_BODY" | python3 -c "import json,sys
try: print(json.loads(sys.stdin.read()).get('result',''))
except: pass" ;;
  fs)
    WIKI_DIR="$HOME/.productune/wiki/$TARGET"; mkdir -p "$WIKI_DIR"
    TS=$(date -u '+%Y-%m-%dT%H-%M-%SZ')
    SLUG=$(printf '%s' "$EPISODE_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cs 'a-z0-9-' '-' | sed 's/-*$//')
    FILE="$WIKI_DIR/${TS}--${SLUG}.md"
    cat > "$FILE" <<EPISODE
---
persona: $TARGET
episode_name: $EPISODE_NAME
created_at: $(date -u '+%FT%TZ')
superseded_by: null
related: []
---
$EPISODE_BODY
EPISODE
    { echo "# $TARGET wiki index"; echo "<!-- auto -->"; echo ""
      ls -r "$WIKI_DIR"/*.md 2>/dev/null | grep -v INDEX.md | while read -r f; do
        n=$(grep -m1 '^episode_name:' "$f" | sed 's/episode_name: //')
        d=$(grep -m1 '^created_at:' "$f" | sed 's/created_at: //' | cut -c1-10)
        s=$(grep -m1 '^superseded_by:' "$f" | sed 's/superseded_by: //'); st="active"; [[ "$s" != "null" && -n "$s" ]] && st="superseded"
        b=$(tail -n +6 "$f" | head -1 | cut -c1-80)
        echo "- [$d] $n [$st]"; [ -n "$b" ] && echo "  $b"
      done; } > "$WIKI_DIR/INDEX.md"
    echo "[PO] saved: $FILE" ;;
esac
```

**Background job tracking (graphiti)** — start of turn:
```bash
JOBS_DIR="$HOME/.productune/wiki-jobs"; [ -d "$JOBS_DIR" ] && rm -f "$JOBS_DIR"/*.done 2>/dev/null
for j in "$JOBS_DIR"/*.pending; do [ -f "$j" ] || continue
  AGE=$(( $(date +%s) - $(stat -f %m "$j" 2>/dev/null || stat -c %Y "$j" 2>/dev/null || echo $(date +%s)) ))
  [ "$AGE" -gt 30 ] && echo "[PO] job=$(basename "$j" .pending) ${AGE}s — check Ollama (cat $j.log)"
done
```

**Pre-persona wiki search (keeper only)** — inject `wiki_consult:` into TASK:
```bash
[ "${WIKI_BACKEND:-graphiti}" = "keeper" ] && WIKI_RESULT=$(NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
  "SEARCH
persona: $PERSONA_SHORT
query: $TASK_KEYWORDS" | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}') && TASK="$TASK
wiki_consult: $WIKI_RESULT"
```

(`graphiti` personas call `search_memory_facts` themselves via MCP. `fs` personas read INDEX directly.)

### Why gated

Earlier doctrine auto-promoted on heuristic. Memory grew invisibly. Rule: **never persist without user approval**. Repeated dismissals → append to `po-memory.md` Workflow preferences; future turns lower surface threshold.

---

## PO memory: `~/.productune/po-memory.md`

Cross-session notepad about **collaborator**, not project facts.

```markdown
# PO memory for <user>
## Communication preferences
## Product taste
## Workflow preferences
## Recent corrections / to-avoid
- (YYYY-MM-DD) user asked me not to X because Y
```

Read at session start. Append (don't rewrite) on: ≥2 pushbacks, intent class "always / never / what I dislike" (any user lang), multi-turn pattern. Mark contradictions `[SUPERSEDED YYYY-MM-DD]`. Never delete — receipts not summary.

---

## Per-project state: `./.productune/po-state.json` (canonical schema)

Repo-local JSON. Sessions scoped per **task**. Each top-level user request = one task with own persona session ids.

Key paths:
- `current_version`, `current_phase`, `phase_history[].{phase, started_at, completed_at, summary, user_approved_at}`
- `current_task.{ticket_id, slug, title, status, stage, qa_status, qa_loops, assignee_persona, started_at, ended_at, request_summary, prd_path, branch, worktree_path}`
- `current_task.input.{prd_path, design_doc, brief_path, deps[]}` · `current_task.output.{changed_files[], design_doc, test_results}`
- `current_task.linked_tickets[]`, `artifacts[]`, `persona_sessions{}`, `persona_session_meta.<persona>.{turns, model_history, effort_history, complexity_level, confidence_history}`
- `current_task.calibration_outcome.{estimated_complexity, actual_complexity, qa_pass, qa_loops, user_rework_requested, escalation_triggered, notes}`
- `past_tickets[]` (cap 50, drop oldest) — retain `slug`, `title`, `request_summary`, `artifacts`, `persona_sessions` for revival match
- `versions[].{id, started_at, ended_at, prd_anchor, outcome.{north_star, input_metrics[], validation_method, observed_result, retrospective_path}}`
- `recent_turns[]` (rolling 10, project-wide, task-independent — failure-pattern detection)

Legacy keys (`past_tasks`, `current_round`, `rounds[]`, `stage:PRD|issue`) read-compat one cycle; new code reads new keys first and falls back.

Pre-delegate: glance `recent_turns`. Persona ≥3 fails / last 5 → flag in Step 1 risk (`evolution.md`).
Post-turn: append outcome + bump `current_task.persona_session_meta.<persona>.turns` via `jq`. Never burn Claude call.

---

## Persona product-memory (structured operational logs)

Append-only Version-tagged logs. Two layers separate from narrative `decisions.md` / `project-notes.md` (which go through promotion gate):

| File | Owner of write | Read by | Purpose |
|---|---|---|---|
| `docs/qa/fail-patterns.md` | PO mechanical (from QA's `fail_event` output) | Designer at Phase 2 | Test ticket trigger #3 — same area-tag ≥3 累累 fail → emit `stage:test`. |
| `docs/designer/feature-history.md` | Designer Write at Phase 5 Version close | Designer at Phase 2 (next Version) | Recall prior Version decisions / surface deferred items. |

Both share schema convention: `- (YYYY-MM-DD) <version> · <area-tag> · ... · note: <one-line>` where area-tag = `<feature>/<sub-area>`. PO writes for fail-patterns are mechanical (no semantic interpretation) — `printf '%s\n' "$LINE" >> "$TARGET"`. Designer writes for feature-history happen inside Designer's session at Phase 5.

These are **distinct from promotion-gated memory** (`decisions.md`, `project-notes.md`, work-notes, wiki). They're operational ground truth — like `~/.productune/po-memory.md` calibration log — append-only, no opinion.
