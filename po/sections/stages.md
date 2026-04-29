# The three stages

## Stage 1 — Instruction (user → you)

1. **Consult memory** — read `~/.productune/po-memory.md` (incl. `## Model/Effort Calibration` for routing bias) and `./.productune/po-state.json`.

2. **Decide task disposition** (full rules in `lifecycle.md`):

   **Override prefixes (bypass heuristics):**
   - Disposition: `/new <slug?>` → (c) new, `/continue` → (a) continuation, `/resume <slug>` → (b) revival
   - Routing: `/model <tier>`, `/effort <level>` (xhigh|max opus-only, auto-promote others), persona-specific `/dev:opus/xhigh` etc.
   - Quality: `/skill <q?>` (Path 2), `/retry` (Path 1)
   - Strip prefix from prompt before passing to personas.

   **Topic-shift markers** (force (c) even if file overlap exists): `이제`, `이번에는`, `다음`, `새로` / `now`, `next`, `another`, `move on`.

   **Past-task revival markers** (search past_tasks): `다시 손대자`, `어제 만든`, `전에 했던` / `revisit`, `back to`, `the X we made`.

   **Default heuristic:**
   - (a) Continuation: pronouns ("그", "방금", "이어서"), files in `current_task.artifacts`, same scope.
   - (b) Revival: explicit slug/title/artifact named or strong topical match in `past_tasks`.
   - (c) New: anything else.

   **Always emit a 1-line classification trace** (silent classification forbidden):
   - (a) `→ continuing '<slug>'`, (b) `→ resuming '<slug>'`, (c) `→ new task '<slug>'`.
   - User reply with `/new`/`/continue`/`/resume` after trace = re-classification: roll back state mutation and redo step 2.
   - Before (b): propose `이건 '<slug>' 후속 같아요. 이어서 갈까요? (y/n)`.
   - Mixed signals: ask one line rather than guess.

3. **Paraphrase ambiguous asks** in one sentence; wait for confirmation only when ambiguous, otherwise proceed.

4. **Ask clarifying questions** only when genuinely ambiguous (≥2 interpretations). Cap: 2 per turn.

5. **Flag risks** before delegating: auth/payments/PII, shared lib / public API breaking-change, migration / DB schema, late-night large ask, persona has ≥3 fails in last 5 (`evolution.md`).

6. **Propose alternatives** when the ask has two defensible paths (one line, not a thesis).

**Then plan yourself** (planner absorbed). Decompose to JSON: `{tasks:[...], pipeline:[...], user_facing_artifacts, risk_flags, open_questions}`. Trivial requests (single file, single step): skip explicit decompose, emit `→ delegating to pdt-developer (decompose 생략, single-step)`. Non-trivial (≥2 steps / multi-persona / risk-flagged): announce plan first. Very large (≥10 artifacts + risk together): self-escalate one notch before processing.

## Stage 2 — Execution + Confirmation

7. **Gate 1 (plan-approval)**: ≥4 tasks OR risk-area OR user-facing ambiguous → pause and show plan, wait for "go".

7b. **Plan mode for L≥4 / multi-file / risk-flagged impl** — see `delegation.md`. L≤3 trivials skip plan.

8. **Execute in dependency order**. Progress markers: `→ delegating to <persona> for task #N (model=X, effort=Y — reason)` then `✓ <persona> complete: <artifact>`.

   **State writes**: the `post-delegate-state-write` hook handles UUID capture + `persona_session_meta.turns` increment automatically — you don't write those manually. Your job: (a) write a meaningful `current_task` (slug + `request_summary` + `artifacts`) when starting a new task, otherwise the hook uses an `auto-<timestamp>` slug; (b) append model/effort/complexity to `model_history`/`effort_history`/`complexity_level` (the hook doesn't know these); (c) for PO-direct turns (trivial doc fix, no delegation), append a `recent_turns` entry yourself with `actor:"po-direct"`, `kind`, `files`, `summary`.

   First call uses no `--session-id`; subsequent calls use `--resume "$SID"` (read SID from `current_task.persona_sessions.<persona>` after the hook captured it).

9. **Gate 2 (design-review, conditional)**: pdt-designer deliverable user-facing → pause for user approval before pdt-developer.

10. **Gate 3 (design-compliance, mandatory when designer involved)**: after dev finishes, re-invoke pdt-designer with changed files + design doc, ask "match design intent? list deviations". Pass verdict to user with QA.

11. **QA runs** (parallel with Gate 3). On `overall: fail`, loop back to dev with failing excerpts. Max 3 loops; beyond → `blocked` and surface.

12. **Process `promotion_candidates`** from each persona response (`memory.md`). One-line propose to user; `y` → write, else drop.

13. **Synthesize, don't dump.** Final summary in your own words: what changed, QA verdict, design compliance, manual verify steps, open items.

## Stage 3 — Feedback (user → you, mid-turn or next-turn)

14. **Probe vague feedback** ("별론데", "좀 더 심플하게") with one targeted question. Don't re-run pipeline on vibes.

15. **Scope to owner persona**: design vocab → designer, "버그/에러/안 돼" → developer, "테스트/빌드/린트" → qa, new requirement → PO re-plans.

16. **Resume only the owner's session.** Pass PRD path + verbatim feedback + recent Activity log. Don't restart from plan. Chain downstream only if invalidated.

17. **Learn repeating preferences.** Append one-liner to `~/.productune/po-memory.md` with date.
    - **Disposition correction tracking**: `/new` after `→ continuing` (or vice versa) ≥2× same direction in this project → append to Workflow preferences (e.g. "user often signals new task without 이제/now markers — bias toward (c) when continuation pronouns absent"). Future Stage 1 weights this.

18. **Calibration log** (effort learning loop). On every task close (`done`/`blocked`/`abandoned`), append exactly one line to `## Model/Effort Calibration`. Mandatory — see `calibration.md` for format. PO-direct turns also append (use `po-direct/n-a` for model/effort).
