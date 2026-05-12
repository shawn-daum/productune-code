# Engineering workflow + Ticket system

> **Language**: doctrine = English. PO renders user-facing prompts/traces in the user's working language at runtime. Templates in this doc are English.

## Pointer index (where to find what)

- **Type-specific doctrine** lives with the persona that owns the type:
  - `type:design` 4-artifact set + `type:test` emission triggers → `~/.claude/agents/pdt-designer.md`
  - `type:deploy` body shape (`[PO]/[user]` steps) + Phase 5 step 5d → `~/.claude/agents/pdt-po.md`
  - Phase 5 step 5a / 5c (Designer measurement + retrospective narrative) → `~/.claude/agents/pdt-designer.md`
  - Phase 5 step 5b (QA fail-pattern aggregate) → `~/.claude/agents/pdt-qa.md`
- **PO mechanical operations** (smoke gate, close rules, outcome measurement, lazy measurement, retro template, Phase 5 sequence) → `~/.productune/sections/lifecycle-mechanics.md`
- **`po-state.json` schema** → `~/.productune/sections/memory.md`

This file owns: cycle phase definitions (Layer A), ticket type taxonomy (Layer B), naming convention, ticket file format, ticket id allocation, who-writes-what + PO mechanical-write whitelist.

## Two axes

- **Layer A — Version Cycle Phases** (timeline; non-ticket steps included) — 1..5
- **Layer B — Ticket Type / `type` enum** (per-ticket classification)

Layer A drives Layer B (which Phase emits which `type` ticket).

## Naming

- prose: capitalized roles — `PO`, `Designer`, `Developer`, `QA`
- code / agent ID / `assignee:` — `pdt-` prefix (`pdt-po`, `pdt-designer`, `pdt-developer`, `pdt-qa`)
- deploy assignee: `pdt-po+user` (collaborative)

## Layer A — Version Cycle Phases

```
Phase 1 PRD           Designer clarity loop A ≤ 0.05                           [no ticket — PRD = doc]
                      opus + max for V1; opus + xhigh for V2+ updates
                      Clarity loop is the discovery mechanism — PO relays questions
                      to user and answers back; no separate interview phase.
Phase 2 Design        Designer self-execute, 4 artifacts                       [type:design × 4]
                      Trigger: L4+ / user-facing / risk_flags ≠ none. Skip: L1–L3 trivial.
                      → user gate before Phase 3 (4-artifact paths in pdt-designer.md)
Phase 3 Build         ticket execution                                         [type:impl/refactor/test/qa]
                      · type:impl     (required, Developer + auto smoke gate)
                      · type:refactor (optional, Developer + auto smoke gate)
                      · type:test     (conditional, QA — triggers in pdt-designer.md)
                      · type:qa       (independent QA work only)
Phase 4 Deploy        type:deploy ticket execution                             [type:deploy]
                      (pdt-po+user collaborative; per-step verify; body shape in pdt-po.md)
                      Trigger: Phase 3 done + user confirms deploy.
                      Exit: deploy ticket `done` → Phase 4→5 gate.
Phase 5 Version close retrospective + calibration                              [no ticket]
                      sequence in lifecycle-mechanics.md; per-step detail in persona files
```

PO emits trace at every Phase transition (English template, rendered in user's lang): `→ Phase 2 Design entered (Designer)` · trivial skip: `→ Phase 2 skipped — L<n> trivial`. **MVP cycle (V1)**: PRD (clarity loop) → Design (conditional) → Build → Deploy → Version close → next Version on usage data.

OSS ref: [mattpocock/skills](https://github.com/mattpocock/skills) — `to-prd` + `to-issues` are Designer skills.

## Layer B — `type` enum

| type | assignee | auto smoke gate | When | Body shape | Closes by |
|---|---|---|---|---|---|
| `design` | `pdt-designer` | n/a | Phase 2 | `## Request` / `## Inputs` / `## Acceptance` / `## Out of scope` | artifact path checked-in |
| `impl` | `pdt-developer` | **ON** | Phase 3 (required) | standard | smoke gate `pass` + `done` |
| `refactor` | `pdt-developer` | **ON** | Phase 3 (optional) | standard | smoke gate `pass` + `done` |
| `test` | `pdt-qa` | n/a (is the test plan) | Phase 3 (conditional) | standard | test plan written |
| `qa` | `pdt-qa` | n/a (is the QA work) | Phase 3 (independent) | standard | QA verdict written |
| `deploy` | `pdt-po+user` | n/a (per-step verify) | Phase 4 (required, sole type) | `## Steps` (`[PO]/[user]` per-step) | all steps verified `done` |

Smoke gate behavior + close rules → `lifecycle-mechanics.md`.

**`status`** (lifecycle, separate from `type`): `todo → in-progress → review → done | blocked | abandoned`. Type is fixed per ticket; status moves.

**`qa_status`** (impl / refactor only): `pending → pass | fail`. `pass` allows `done`; `fail` → dev resume + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other types have no field.

## Ticket file format

`docs/tickets/<version>/T-NNN.md` frontmatter (Designer-authored unless marked PO):

Required: `ticket_id`, `version`, `slug`, `type`, `status` (PO mechanical), `assignee`, `created_at`, `estimated_complexity`, `risk_flags`. Optional/derived: `started_at` / `completed_at` / `duration_min` (PO mechanical), `branch` / `worktree_path` (git-workflow R2), `qa_status` / `qa_loops` (PO mechanical, impl/refactor only; `qa_status ∈ pending|pass|fail`), `success_metric` / `validation_method` (Designer, optional when measurable), `observed_result` (PO mechanical at Phase 5).

**`version:` field format rule (T-P4-095)**: value MUST match `^v\d+(\.\d+)?$` (e.g. `v1`, `v0.1`). Exception: `legacy/phase3-fixes` and similar artificial ids — mark with `legacy: true` in frontmatter. Lint: `packages/gui/scripts/check-ticket-version.mjs` — run during `pnpm build` in gui package and available for project-level use with `--project-dir <path>`.

Body: `# T-NNN: <title>` · mirrored header line · `## Request` · `## Inputs` · `## Acceptance` · `## Out of scope` · `## Persona Activity` (PO-managed table). Designer owns scope-defining sections; PO touches only lifecycle / mirrored header / Persona Activity rows. `type:deploy` body uses `## Steps` (see `pdt-po.md`).

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` |
| `docs/prd/<slug>.md` | Designer | inside delegated session |
| `docs/tickets/<version>/T-NNN.md` body / AC | Designer | emit alongside PRD |
| `docs/tickets/<version>/T-NNN.md` lifecycle frontmatter | PO | mechanical |
| `docs/design/**/*.md`, `docs/designer/feature-history.md` | Designer | Designer Write |
| `docs/qa/fail-patterns.md` | PO mechanical | `printf >>` from QA's `fail_event` |
| `docs/retrospectives/<version>.md` | Designer | Phase 5 step 5c |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| Other `docs/qa/*.md` (project-notes, work-notes) | QA | QA Write (promotion-gated) |

PO never authors product content. Lifecycle / frontmatter = state, not authoring.

### PO mechanical-write whitelist

**PO direct (mechanical)**: ticket frontmatter (`status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `qa_status`, `qa_loops`, `observed_result`, routing/model/effort meta) · mirrored header status line · `## Persona Activity` 1-row append (≤80-char Result) · `docs/qa/fail-patterns.md` append from QA's `fail_event` · `po-state.json` `pending_gate` set/clear at Phase boundary.

**Delegate to Designer**: `success_metric`, `validation_method` (set at creation) · `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope`, `## Outcome`, title changes.

**Refusal template** (English intent; PO renders in user's lang on every content-change request):
```
[PO] content change (<what>) requires Designer delegation. proceed?
[PO] (lifecycle meta / Persona Activity rows are PO-direct; this is content → delegate)
```

`branch` / `worktree_path` filled by git-workflow (R2) at ticket open. `fail-patterns.md` append jq one-liner: `jq -r '.fail_event | "- (\(now | strftime("%Y-%m-%d"))) \(.version) · \(.ticket_id) · \(.area_tag) · loops=\(.loops) · final=\(.final) · note: \(.note)"'`.

## Ticket id allocation

`T-NNN` zero-padded, monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back to fs scan:
```bash
NEXT=$(node scripts/po/scan-tickets.mjs "$PROJECT_DIR" \
  | jq '([.[].ticket_id // empty, .current_task.ticket_id // empty]
    | map(select(. != null) | sub("^T-(P[0-9]+-)?"; "") | tonumber? // 0) | max // 0) + 1')
TID=$(printf "T-%03d" "$NEXT")
```
PO computes and embeds in `[ctx]`; Designer skips state re-read. (v2 doctrine: `past_tickets[]` removed — all ticket data lives in ticket md = SoT.)
