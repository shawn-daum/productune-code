# Memory

Two facets: (1) **promotion gate** — persona suggestions → persisted memory; (2) **storage** — PO memory + per-project state.

## Promotion gate

Personas don't auto-write. They return `promotion_candidates`. PO surfaces; on user approval writes. Project + wiki tier both need approval.

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

`tier:"project"` — append one line to a file in the project repo (shows in `git status`):
```bash
TARGET=$(jq -r '.target' <<<"$CANDIDATE"); DELTA=$(jq -r '.delta' <<<"$CANDIDATE")
mkdir -p "$(dirname "$TARGET")"; printf '%s\n' "$DELTA" >> "$TARGET"
```

`tier:"wiki"` — backend-aware (`WIKI_BACKEND` from `productune.env`):

- **graphiti** — fire-and-forget `claude --resume "$SID"` with `[PROMOTION-APPROVED] mcp__graphiti__add_memory: group_id="$TARGET" name="$EPISODE_NAME" episode_body="$EPISODE_BODY". Confirm only.` Run in `( ... ) &`; track via job file under `~/.productune/wiki-jobs/<id>.{pending,done}`. Echo `[PO] saved (background, job=<id>)`.
- **keeper** — invoke `claude --agent pdt-wiki-keeper --model haiku` with `WRITE [PROMOTION-APPROVED]\npersona: $TARGET\nepisode_name: $EPISODE_NAME\nepisode_body: $EPISODE_BODY`. Sync — keeper handles file write + INDEX update.
- **fs** — direct filesystem. Write `~/.productune/wiki/$TARGET/<ts>--<slug>.md` with frontmatter (`persona`, `episode_name`, `created_at`, `superseded_by:null`, `related:[]`) + body. Rebuild `<dir>/INDEX.md` (one line per file with `[<date>] <name> [active|superseded]` + first-line excerpt). Echo `[PO] saved: <FILE>`.

Background job tracking (graphiti) — at start of every turn:
```bash
JOBS_DIR="$HOME/.productune/wiki-jobs"; [ -d "$JOBS_DIR" ] && rm -f "$JOBS_DIR"/*.done 2>/dev/null
for j in "$JOBS_DIR"/*.pending; do [ -f "$j" ] || continue
  AGE=$(( $(date +%s) - $(stat -f %m "$j" 2>/dev/null || stat -c %Y "$j" 2>/dev/null || echo $(date +%s)) ))
  [ "$AGE" -gt 30 ] && echo "[PO] job=$(basename "$j" .pending) ${AGE}s — check Ollama (cat $j.log)"
done
```

Pre-persona wiki search (keeper only) — inject `wiki_consult:` into TASK:
```bash
[ "${WIKI_BACKEND:-graphiti}" = "keeper" ] && WIKI_RESULT=$(NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
  "SEARCH
persona: $PERSONA_SHORT
query: $TASK_KEYWORDS" | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}') && TASK="$TASK
wiki_consult: $WIKI_RESULT"
```

(`graphiti` personas call `search_memory_facts` themselves via MCP. `fs` personas read `INDEX.md` directly.)

### Persistence (deferred surface)

If candidate can't be surfaced inline (background sub-agent result received mid-turn, persona turn closed without immediate user prompt window, etc.) → enqueue into `pending_promotions[]` (schema below) with `status:"pending"`. Next PO turn-start surfaces queued entries before new work (see `stages.md` — separate ticket).

### Why gated

Earlier doctrine auto-promoted on heuristic; memory grew invisibly. Rule: **never persist without user approval**. Repeated dismissals → append to `po-memory.md` Workflow preferences; future turns lower the surface threshold.

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

### `## Product taste` — positive-feedback log

Schema: `- (YYYY-MM-DD) <area-tag>: <what worked> · "<user phrase verbatim, kept in original lang>"`.

- **Write trigger**: Step 3 step 14b (positive intent — `stages.md`). One line per turn-close-time satisfaction signal.
- **Read trigger**: Step 1 disposition. PO scans recent N entries cross-project to bias routing toward validated patterns (similar area-tag → reuse the approach that landed last time).
- area-tag follows `<feature>/<sub-area>` — shared with `fail-patterns.md` and `feature-history.md`.
- User phrase is kept verbatim in any language. It's a literal quote, not doctrine prose.

Example entries (mixed-lang user phrases preserved):
```
- (2026-05-13) auth/login-modal: forgot-pw retry flow finally smooth · "오 이제 잘 되네"
- (2026-05-20) onboarding/welcome: 3-step minimum without skip · "exactly what I wanted"
```

## Per-project state: `./.productune/po-state.json` (canonical schema)

Repo-local JSON. Sessions scoped per **task**. Each top-level user request = one task with own persona session ids.

Key paths:
- `current_version`, `current_phase`, `phase_history[].{phase, started_at, completed_at, summary, user_approved_at}`
- `pending_gate?` (set when PO emits a phase-transition gate prompt; cleared on approve/modify) — `{from_phase, to_phase, summary, prompt, emitted_at}`
- `current_task.{ticket_id, slug, title, status, stage, qa_status, qa_loops, assignee_persona, started_at, ended_at, request_summary, prd_path, branch, worktree_path}`
- `current_task.input.{prd_path, design_doc, brief_path, deps[]}` · `current_task.output.{changed_files[], design_doc, test_results}`
- `current_task.linked_tickets[]`, `artifacts[]`, `persona_sessions{}`, `persona_session_meta.<persona>.{turns, model_history, effort_history, complexity_level, confidence_history}`
- `current_task.calibration_outcome.{estimated_complexity, actual_complexity, qa_pass, qa_loops, user_rework_requested, escalation_triggered, notes}`
- `past_tickets[]` (cap 50, drop oldest) — retain `slug`, `title`, `request_summary`, `artifacts`, `persona_sessions` for revival match
- `versions[].{id, started_at, ended_at, prd_anchor, outcome.{north_star, input_metrics[], validation_method, observed_result, retrospective_path}}`
- `recent_turns[]` (rolling 10, project-wide, task-independent — failure-pattern detection)
- `pending_promotions[]` — persona-returned `promotion_candidates` queued for user approval (deferred surface). Lifecycle: `pending` → (`approved` | `dropped` | `edited`) on next turn-start prompt.
  - `id` (string) — `promo-<YYYYMMDD>-<NNN>` (date + per-day sequence). Dedupe within same turn.
  - `persona` (string) — `pdt-designer` / `pdt-developer` / `pdt-qa` / `pdt-wiki-keeper`.
  - `turn_id` (string) — persona session turn marker at surface time (snapshot of `persona_session_meta.<persona>.turns`).
  - `tier` (string) — `project` / `wiki` / `work-note` (drives mechanical-writes branch above).
  - `target` (string) — `tier=project`: file path · `tier=wiki`: graphiti `group_id` or keeper persona · `tier=work-note`: file path under `docs/<persona>/`.
  - `delta` (string) — line to append (project / work-note) or episode body (wiki).
  - `rationale` (string) — one-line reason shown in surface prompt.
  - `status` (string) — `pending` / `approved` / `dropped` / `edited`.
  - `surfaced_at` (ISO timestamp, optional) — when PO presented the prompt.
  - `decided_at` (ISO timestamp, optional) — when user response landed.
  - `final_target` (string, optional) — populated on `status:"edited"` with user-revised target / delta payload actually written.

Legacy keys (`past_tasks`, `current_round`, `rounds[]`, `stage:PRD|issue`) read-compat one cycle; new code reads new keys first and falls back.

Pre-delegate: glance `recent_turns`. Persona ≥3 fails / last 5 → flag in Step 1 risk (`evolution.md`).
Post-turn: append outcome + bump `current_task.persona_session_meta.<persona>.turns` via `jq`. Never burn a Claude call.

## Persona product-memory (structured operational logs)

Append-only Version-tagged logs. Two layers separate from narrative `decisions.md` / `project-notes.md` (which go through promotion gate):

| File | Owner of write | Read by | Purpose |
|---|---|---|---|
| `docs/qa/fail-patterns.md` | PO mechanical (from QA's `fail_event` output) | Designer at Phase 1 | Test ticket trigger #3 — same area-tag ≥3 累累 fail → emit `stage:test`. |
| `docs/designer/feature-history.md` | Designer Write at Phase 4 Version close | Designer at Phase 1 (next Version) | Recall prior Version decisions / surface deferred items. |

Both share schema convention: `- (YYYY-MM-DD) <version> · <area-tag> · ... · note: <one-line>`. PO writes for fail-patterns are mechanical (no semantic interpretation) — `printf '%s\n' "$LINE" >> "$TARGET"`. Designer writes for feature-history happen inside Designer's session at Phase 4.

These are **distinct from promotion-gated memory** (`decisions.md`, `project-notes.md`, work-notes, wiki). They're operational ground truth — like `~/.productune/po-memory.md` calibration log — append-only, no opinion.
