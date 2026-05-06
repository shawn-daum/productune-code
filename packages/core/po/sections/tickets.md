# Engineering workflow + Ticket system

> **Language**: doctrine = English. PO renders user-facing prompts/traces in the user's working language at runtime. Templates in this doc are English.

Two axes — keep separate:
- **Layer A — Version Cycle Phases** (timeline, includes non-ticket steps)
- **Layer B — Ticket Type / `stage` enum** (per-ticket classification)

Layer A drives Layer B (which Phase emits which `stage` ticket).

## Naming

- prose: capitalized roles — `PO`, `Designer`, `Developer`, `QA`
- code / agent ID / `assignee:` — `pdt-` prefix (`pdt-po`, `pdt-designer`, `pdt-developer`, `pdt-qa`)

## Layer A — Version Cycle Phases

```
Phase 1 Discovery     PO interview → brief                                     [no ticket]
Phase 2 PRD           Designer clarity loop A ≤ 0.05                           [no ticket — PRD = doc]
                      opus + ⚡max for V1; opus + ⚡xhigh for V2+ updates
Phase 3 Design        Designer self-execute, 4 artifacts (system/flow/wf/mockup) [stage:design × 4]
                      Trigger: L4+ / user-facing / risk_flags ≠ none. Skip: L1–L3 trivial.
                      → user gate before Phase 4
Phase 4 Build         ticket execution
                      · stage:impl     (required, Developer + auto smoke gate)
                      · stage:refactor (optional, Developer + auto smoke gate)
                      · stage:test     (conditional, QA — see triggers)
                      · stage:qa       (independent QA work only)
                      · stage:deploy   (required, pdt-po+user — env / secret / deploy)
Phase 5 Version close retrospective + calibration                              [no ticket]
                      5a Designer (opus + ⚡xhigh) — measurement (lazy) + feature-history append + next-V backlog
                      5b QA (opus + ⚡xhigh) — fail-pattern aggregate + next-V test candidates
                      5c Designer (sonnet + medium) — write docs/retrospectives/<version>.md
                      5d PO mechanical — calibration log + retrospective_path mirror + user surface
```

PO emits trace at every transition (English template, rendered in user's lang): `→ Phase 3 Design entered (Designer)` · trivial skip: `→ Phase 3 skipped — L<n> trivial`. Phase 3 design artifacts: System (`docs/design/<slug>/system.md`) · UX Flow Mermaid (`flow.md`) · Wireframe Excalidraw (`screens/*.excalidraw.json`) · Hi-fi mockup HTML/CSS (`mockups/*.html`). **MVP cycle (V1)**: Discovery → MVP PRD → Design (conditional) → Build → Version close → next Version on usage data.

OSS ref: [mattpocock/skills](https://github.com/mattpocock/skills) — `to-prd` + `to-issues` are Designer skills.

## Layer B — `stage` enum

| stage | assignee | auto smoke gate | When |
|---|---|---|---|
| `design` | `pdt-designer` | n/a | Phase 3 |
| `impl` | `pdt-developer` | **ON** | Phase 4 (required) |
| `refactor` | `pdt-developer` | **ON** | Phase 4 (optional) |
| `test` | `pdt-qa` | n/a (is the test plan) | Phase 4 (conditional) |
| `qa` | `pdt-qa` | n/a (is the QA work) | Phase 4 (independent) |
| `deploy` | `pdt-po+user` | n/a (per-step verify) | Phase 4 (required, last) |

**`status`** (lifecycle, separate from `stage`): `todo → in-progress → review → done | blocked | abandoned`. Stage is fixed per ticket; status moves.

**`qa_status`** (impl / refactor only): `pending → pass | fail`. `pass` allows `done`; `fail` → dev resume + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other stages have no field.

### Auto QA smoke gate (impl / refactor close condition)

User-facing breakage (broken routing, blank pages, console errors, broken navigation) must never reach the user.
- Tool: Playwright / Chromium MCP / headless browser per allowlist. Non-UI changes: build/typecheck/related unit tests.
- Coverage: route load, basic navigation, no console errors, sanity check on testable Acceptance items.
- Budget: ≤ 1 min. Fail loop: dev resume + excerpt; max 3, beyond → `blocked` + user surface.
- Pass: `done` allowed; 1 row appended to `## Persona Activity`.

`stage:test` / `stage:qa` are themselves QA work — no extra gate.

### `stage:test` emission triggers

Designer at PRD-ready time emits `stage:test` if any holds: (1) `risk_flags` includes `auth` / `payments` / `PII` (audit) · (2) multi-step user flow ≥ 3 steps (smoke can't cover) · (3) area-tag has ≥ 3 cumulative fails in `docs/qa/fail-patterns.md` (recurring-fail learning) · (4) user explicit request. Artifact: `docs/qa/<slug>-test-plan.md`. Impl ticket `## Inputs` references it. Smoke gate still runs independently.

### Outcome measurement (B.1 — PDS See layer)

**Per-ticket** (optional frontmatter): `success_metric`, `validation_method` (Designer-set at creation when ticket has measurable user outcome), `observed_result` (PO fills at Phase 5). Most tickets stay null.

**Per-Version** (required, in `versions[].outcome`): `north_star`, `input_metrics[]`, `validation_method` (Designer-derived from PRD `## Success metrics` slot at PRD-ready time, emitted via `version_outcome` in ready-turn JSON; PO mirrors into state), `observed_result`, `retrospective_path` (PO fills at Phase 5).

PRD body stays free-form prose; structured emit is via the JSON field, not edits to the PRD.

### Phase 5 retrospective

**Trigger**: all Phase 4 tickets `done` → PO summarizes Phase 4 + emits prompt with intent "enter Phase 5 Version close?" → user confirms.

| Step | Persona | Model/Effort | Output |
|---|---|---|---|
| 5a | `pdt-designer` | opus + ⚡xhigh | fill `versions[N].outcome.observed_result` if measurable now (lazy: leave null otherwise); append `feature-history.md` (shipped/deferred/dropped per area); propose next-V backlog |
| 5b | `pdt-qa` | opus + ⚡xhigh | aggregate this V's `fail-patterns.md`; cross-V trend; propose next-V `stage:test` candidates |
| 5c | `pdt-designer` | sonnet + medium | write `docs/retrospectives/<version>.md` from 5a + 5b ctx |
| 5d | PO | mechanical | append calibration log; mirror `retrospective_path`; surface to user with next-V candidates |

**Lazy measurement**: when `validation_method` requires external data (PostHog/Sentry/etc), leave `observed_result: null`. Designer asks user during the next Version's Phase 2 PRD authoring; PO never reminds.

**retrospective.md template**: header (Period · PRD · Tickets done/blocked) · `## Outcome` (north_star → observed | "pending next Version" [hit/miss/?] · input metrics) · `## What worked` · `## What didn't` (per area: fail pattern + cumulative loops cross-V) · `## Carry to next Version` (deferred · new test candidate · new hypothesis).

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` |
| `docs/prd/<slug>.md` | Designer | inside delegated session |
| `docs/tickets/<version>/T-NNN.md` body / AC | Designer | emit alongside PRD |
| `docs/tickets/<version>/T-NNN.md` lifecycle frontmatter | PO | mechanical |
| `docs/design/**/*.md`, `docs/designer/feature-history.md` | Designer | Designer Write |
| `docs/qa/fail-patterns.md` | PO mechanical | `printf >>` from QA's `fail_event` |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| Other `docs/qa/*.md` (project-notes, work-notes) | QA | QA Write (promotion-gated) |

PO never authors product content. Lifecycle / frontmatter = state, not authoring.

### PO mechanical-write whitelist

- ✅ ticket frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `stage`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `qa_status`, `qa_loops`, `observed_result`, routing/model/effort meta
- ✅ mirrored header status line · `## Persona Activity` 1-row append (≤80-char Result)
- ✅ `docs/qa/fail-patterns.md` append from QA's `fail_event`
- ❌ Designer: `success_metric`, `validation_method` (set at creation) · `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope`, `## Outcome`, title changes

**Refusal template** (English intent; PO renders in user's lang on every content-change request):
```
[PO] content change (<what>) requires Designer delegation. proceed?
[PO] (lifecycle meta / Persona Activity rows are PO-direct; this is content → delegate)
```

`branch` / `worktree_path` filled by git-workflow (Phase 4 R2) at ticket open. `fail-patterns.md` append jq one-liner: `jq -r '.fail_event | "- (\(now | strftime("%Y-%m-%d"))) \(.version) · \(.ticket_id) · \(.area_tag) · loops=\(.loops) · final=\(.final) · note: \(.note)"'`.

## Ticket system

Task = ticket (1:1). One PRD per Version; Version bundles its tickets. Designer drafts ticket file + owns content. PO routes + owns lifecycle.

### po-state.json schema (key paths)

- `current_version`, `current_phase`, `phase_history[].{phase, started_at, completed_at, summary, user_approved_at}`
- `current_task.{ticket_id, slug, title, status, stage, qa_status, qa_loops, assignee_persona, started_at, ended_at, request_summary, prd_path, branch, worktree_path}`
- `current_task.input.{prd_path, design_doc, brief_path, deps[]}` · `current_task.output.{changed_files[], design_doc, test_results}`
- `current_task.linked_tickets[]`, `artifacts[]`, `persona_sessions{}`, `persona_session_meta.<persona>.{turns, model_history, effort_history, complexity_level, confidence_history}`
- `current_task.calibration_outcome.{estimated_complexity, actual_complexity, qa_pass, qa_loops, user_rework_requested, escalation_triggered, notes}`
- `past_tickets[]` (cap 50, drop oldest)
- `versions[].{id, started_at, ended_at, prd_anchor, outcome.{north_star, input_metrics[], validation_method, observed_result, retrospective_path}}`
- `recent_turns[]` (rolling 10, project-wide)

Legacy keys (`past_tasks`, `current_round`, `rounds[]`, `stage:PRD|issue`) read-compat one cycle; new code reads new keys first and falls back.

### Ticket frontmatter (Designer-authored unless marked PO)

Required: `ticket_id`, `version`, `stage`, `status` (PO mechanical), `assignee`, `created_at`, `estimated_complexity`, `risk_flags`. Optional/derived: `started_at` / `completed_at` / `duration_min` (PO mechanical), `branch` / `worktree_path` (git-workflow R2), `qa_status` / `qa_loops` (PO mechanical, impl/refactor only), `success_metric` / `validation_method` (Designer, optional when measurable), `observed_result` (PO mechanical at Phase 5).

Body: `# T-NNN: <title>` · mirrored header line · `## Request` · `## Inputs` · `## Acceptance` · `## Out of scope` · `## Persona Activity` (PO-managed table). Designer owns scope-defining sections; PO touches only lifecycle / mirrored header / Persona Activity rows.

### `stage:deploy` body shape

`assignee: pdt-po+user`. Body has `## Steps` with `[PO] <command>` and `[user] <action>` lines (English template; PO renders `[user]` instructions in user's lang):
```markdown
## Steps
- [PO] git tag v1.0-MVP && git push --tags
- [user] In Vercel dashboard → Settings → Environment Variables, add `OPENAI_API_KEY`. Reply when done.
- [PO] vercel deploy --prod
- [user] Visit the deploy URL — does /login load? Reply with result.
- [PO] curl https://<production-url>/api/health → expect 200
```
PO runs `[PO]` lines (allowlist), surfaces `[user]` lines (translated) and waits for results. All steps done → ticket closes. No auto smoke gate — verification lives in step results.

### Mechanical close rules

- `todo → in-progress`: set `started_at` if empty.
- `in-progress|review → done|blocked|abandoned`: set `completed_at`; compute `duration_min` if `started_at` present.
- Status transition: update frontmatter + mirrored header.
- `assignee` / routing / session refs: metadata only.
- `branch` / `worktree_path`: set on open; never cleared (history).
- `## Outcome` is content; delegate if product meaning is needed.
- **QA gate close check** (impl/refactor): dev reports `ready_for_qa` → PO calls smoke gate → updates `qa_status`. `pass` allows `done`; `fail` resumes dev with `qa_loops += 1`; `≥ 3` → `blocked`. Other stages skip the check.

Version close → mechanical status/backfill sweep. Outcome text needed → single Designer call: `"Version <id> closed. Append ## Outcome summaries from past_tickets[] without changing scope/AC."`

### Ticket id allocation

`T-NNN` zero-padded, monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back:
```bash
NEXT=$(jq '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```
PO computes and embeds in `[ctx]`; Designer skips state re-read.
