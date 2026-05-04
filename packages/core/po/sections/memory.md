# Memory

Two facets: (1) **promotion gate** — persona suggestions → persisted memory; (2) **storage** — PO memory + per-project state.

## Promotion gate

Personas don't auto-write. Return candidates in `promotion_candidates`. PO surfaces, on approval writes. Project + wiki tier both need user approval.

After every persona turn, inspect `promotion_candidates`. Per entry:
```
[PO] pdt-designer wants to remember:
     project · docs/designer/decisions.md
     "(2026-04-27) login-modal: chose dialog over inline form (focus-trap critical)"
     reason: design decision; future pdt-designer references
     save? [y/N]
```
For `tier:"work-note"` (multi-paragraph artifact, not one-liner): show title + body preview (first 6 lines, "…" if more), full path, and reason.
```
[PO] pdt-developer wants to remember:
     work-note · docs/developer/R1-login-modal.md
     title: "Login modal — Next 16 middleware notes"
     preview:
       Implementation hit Next.js 16 routing rename. middleware.ts → proxy.ts.
       Bun-only deps (`bun add`) replaced with `pnpm` to keep Vercel build green.
       Test fixture lives in __tests__/login-modal.spec.ts; uses pwfix matcher.
       …
     reason: future devs hitting the same router migration need this
     save? [y/N]
```
- **y** → write (below). Ack `[PO] saved: <path>.`
- **n / Enter / skip** → drop silently.
- **edit** → prompt edited version (project: one line; work-note: open `$EDITOR` on body), save.

>3 candidates → numbered list; user replies `1,3` for selective approve.

After all candidates resolved, append a **promotion outcome line** to the same task's turn-log so audit trail is complete:
```bash
# After processing every candidate's y/n/edit, before moving on:
TURNS_DIR="$TARGET/.productune/turns"; SLUG=$(jq -r '.current_task.slug // "unknown"' "$STATE")
LOG="$TURNS_DIR/$SLUG.jsonl"; mkdir -p "$TURNS_DIR"
# $OUTCOMES_JSON is a JSON array PO built while running the gate, e.g.:
# [{"tier":"work-note","target":"docs/developer/R1-login-modal.md","decision":"approved"},
#  {"tier":"project","target":"docs/developer/project-notes.md","decision":"declined"}]
python3 -c "
import json,datetime,sys,pathlib
line={'kind':'promotion','ts':datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
      'persona':'$PERSONA','task_slug':'$SLUG','session_id':'$SID','outcomes':json.loads('''$OUTCOMES_JSON''')}
pathlib.Path('$LOG').parent.mkdir(parents=True,exist_ok=True)
open('$LOG','a',encoding='utf-8').write(json.dumps(line,ensure_ascii=False)+'\n')"
```
Outcomes — one per surfaced candidate: `decision ∈ {approved, declined, edited, skipped}`. Empty `[]` when persona returned no candidates (still log the empty turn for completeness).

### Mechanical writes

**`tier:"project"`** — append dated one-liner:
```bash
TARGET=$(jq -r '.target' <<<"$CANDIDATE"); DELTA=$(jq -r '.delta' <<<"$CANDIDATE")
mkdir -p "$(dirname "$TARGET")"; printf '%s\n' "$DELTA" >> "$TARGET"
```
File lives in target project repo → shows in `git status`. `decisions.md` / `project-notes.md` accumulates lines over months — long-term cheat-sheet.

**`tier:"work-note"`** — create per-turn richer artifact (overwrite-if-exists, not append):
```bash
TARGET=$(jq -r '.target' <<<"$CANDIDATE"); TITLE=$(jq -r '.title' <<<"$CANDIDATE")
BODY=$(jq -r '.body' <<<"$CANDIDATE")
mkdir -p "$(dirname "$TARGET")"
{ printf '# %s\n\n' "$TITLE"; printf '%s\n' "$BODY"; } > "$TARGET"
```
Path convention `docs/<persona>/<R<n>>-<slug>.md` (e.g. `docs/developer/R1-login-modal.md`). Multi-paragraph, sections OK. Each turn's work-note is a separate file; never append. PO surfaces preview before write so user can edit.

**`tier:"wiki"`** — backend-aware (`WIKI_BACKEND` from `~/.productune/productune.env`):
```bash
WIKI_BACKEND="${WIKI_BACKEND:-graphiti}"
case "$WIKI_BACKEND" in
  graphiti)
    JOB_ID=$(uuidgen 2>/dev/null | head -c 8 || date +%s | tail -c 8)
    JOBS_DIR="$HOME/.productune/wiki-jobs"; mkdir -p "$JOBS_DIR"; touch "$JOBS_DIR/$JOB_ID.pending"
    ( NO_COLOR=1 claude --resume "$SID" --print --output-format json \
        "[PROMOTION-APPROVED] mcp__graphiti__add_memory: group_id=\"$TARGET\" name=\"$EPISODE_NAME\" episode_body=\"$EPISODE_BODY\". Confirm only." \
        > "$JOBS_DIR/$JOB_ID.log" 2>&1
      RC=$?
      if [ "$RC" -eq 0 ]; then mv "$JOBS_DIR/$JOB_ID.pending" "$JOBS_DIR/$JOB_ID.done"
      else mv "$JOBS_DIR/$JOB_ID.pending" "$JOBS_DIR/$JOB_ID.failed"; fi ) &
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
JOBS_DIR="$HOME/.productune/wiki-jobs"
[ -d "$JOBS_DIR" ] || JOBS_DIR=""
if [ -n "$JOBS_DIR" ]; then
  # 1) ack completed jobs (1 line per .done) then garbage-collect
  for j in "$JOBS_DIR"/*.done; do [ -f "$j" ] || continue
    echo "[PO] wiki saved (job=$(basename "$j" .done))"
    rm -f "$j"
  done
  # 2) surface failed jobs (1 line per .failed) — point user to log; keep file until user clears
  for j in "$JOBS_DIR"/*.failed; do [ -f "$j" ] || continue
    echo "[PO] ⚠ wiki save failed (job=$(basename "$j" .failed)) — see $j.log"
  done
  # 3) stale .pending — Ollama / network might be down
  for j in "$JOBS_DIR"/*.pending; do [ -f "$j" ] || continue
    AGE=$(( $(date +%s) - $(stat -f %m "$j" 2>/dev/null || stat -c %Y "$j" 2>/dev/null || echo $(date +%s)) ))
    [ "$AGE" -gt 30 ] && echo "[PO] ⚠ wiki job=$(basename "$j" .pending) ${AGE}s pending — Ollama/network 확인 (cat $j.log)"
  done
fi
```

**Pre-persona wiki search** — inject `wiki_consult:` into TASK + capture for turn-log.

```bash
WIKI_RESULT='{}'
case "${WIKI_BACKEND:-graphiti}" in
  keeper)
    WIKI_RESULT=$(NO_COLOR=1 claude --agent pdt-wiki-keeper --model haiku --print --output-format json \
      "SEARCH
persona: $PERSONA_SHORT
query: $TASK_KEYWORDS" | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}')
    ;;
  graphiti)
    # Pre-search via MCP node lookup so PO can log wiki_consult; persona may also call MCP itself.
    WIKI_RESULT=$(NO_COLOR=1 claude --agent "$PERSONA" --model haiku --print --output-format json \
      "PRE-SEARCH ONLY (no writes): mcp__graphiti__search_memory_nodes group_id=\"persona-$PERSONA_SHORT\" query=\"$TASK_KEYWORDS\" max_nodes=3. Return JSON {hits:N, top_titles:[...]} only." \
      | python3 -c "import json,sys,re
try: r=json.loads(sys.stdin.read()).get('result',''); m=re.search(r'\{.*\}',r,re.DOTALL); print(m.group() if m else '{}')
except: print('{}')" 2>/dev/null || echo '{}')
    ;;
esac
[ -n "$WIKI_RESULT" ] && [ "$WIKI_RESULT" != '{}' ] && TASK="$TASK
wiki_consult: $WIKI_RESULT"
# Stash for delegation.md turn-log writer:
export WIKI_CONSULT_JSON="$WIKI_RESULT"
```

(`fs` personas read INDEX directly inside their workflow — no PO pre-search.) The `WIKI_CONSULT_JSON` env var is consumed by the delegation block's python3 turn-log writer when present.

### Why gated

Earlier doctrine auto-promoted on heuristic. Made memory grow invisibly. New rule: **never persist without user approval**. User dismisses repeatedly → append to `po-memory.md` Workflow preferences; future turns lower surface threshold.

---

## PO memory: `~/.productune/po-memory.md`

Cross-session notepad about **collaborator** (not project facts).

```markdown
# PO memory for <user>
## Communication preferences
## Product taste
## Workflow preferences
## Recent corrections / to-avoid
- (YYYY-MM-DD) user asked me not to X because Y
```

Read at session start. Append (don't rewrite) on: ≥2 pushbacks, "always/never/내가 싫어하는 건", multi-turn pattern. Mark contradictions `[SUPERSEDED YYYY-MM-DD]`. Never delete — receipts not summary.

---

## Per-project state: `./.productune/po-state.json`

Repo-local JSON. Sessions scoped per **task** (not project). Each top-level user request = one task with own persona session ids.

```json
{
  "current_task": {
    "slug": "login-modal-forgot-pw", "title": "...", "started_at": "2026-04-23T14:30:00Z",
    "request_summary": "...", "artifacts": ["docs/design/login-modal.md", "..."],
    "persona_sessions": {"pdt-designer":"<uuid>","pdt-developer":"<uuid>","pdt-qa":"<uuid>"},
    "persona_session_meta": {"pdt-developer": {"id":"<uuid>","turns":3,"created_at":"...",
      "model_history":["sonnet","opus"],"effort_history":["medium","high"]}},
    "calibration_outcome": {"estimated_complexity":"L6","actual_complexity":"L7",
      "qa_pass":true,"qa_loops":1,"user_rework_requested":false,"escalation_triggered":true}
  },
  "past_tasks": [{"slug":"...","title":"...","started_at":"...","ended_at":"...",
                  "request_summary":"...","artifacts":[],"persona_sessions":{}}],
  "recent_turns": [{"ts":"...","persona":"pdt-qa","task":"...","result":"fail","notes":"..."}]
}
```

`recent_turns` — project-wide rolling 10, task-independent — failure-pattern detection.
`past_tasks` — cap 50, drop oldest. Retain `title` + `request_summary` + `artifacts` for revival match.

Pre-delegate: glance `recent_turns`. Persona ≥3 fails / last 5 → flag in Stage 1 risk (`evolution.md`).
Post-turn: append outcome + bump `current_task.persona_session_meta.<persona>.turns` via `jq`. Never burn Claude call.
