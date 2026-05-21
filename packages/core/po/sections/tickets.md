# Engineering workflow + Ticket system

> Doctrine = English. PO renders user-facing prompts/traces in user's working language at runtime. Templates here = English.
## Pointer index

- **Type-specific doctrine** lives with persona that owns the type:
  - `type:design` 2-ticket auto-emit (Phase 2) + `type:test` emission triggers → `~/.claude/agents/pdt-designer.md`
  - Phase 3 close 3-ticket sequence: T1+T2 `type:design` (Designer / pdt-po+user) + T3 `type:qa` (security) → `~/.productune/sections/po-loop.md` §Phase 3 Build close gate + `~/.productune/sections/_details/security-checklist.md`
  - `type:deploy` body shape (`[PO]/[user]` steps) + Phase 5 step 5d → `~/.claude/agents/pdt-po.md`
  - Phase 5 step 5a / 5c (Designer measurement + retrospective narrative) → `~/.claude/agents/pdt-designer.md`
  - Phase 5 step 5b (QA fail-pattern aggregate) → `~/.claude/agents/pdt-qa.md`
- **PO mechanical operations** (smoke gate, close rules, outcome measurement, lazy measurement, retro template, Phase 5 sequence) → `~/.productune/sections/lifecycle-mechanics.md`
- **`po-state.json` schema** → `~/.productune/sections/memory.md`

This file owns: cycle phase definitions (Layer A), ticket type taxonomy (Layer B), naming, ticket file format, ticket id allocation, who-writes-what + PO mechanical-write whitelist.
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
                      Clarity loop = discovery mechanism — PO relays Qs to user, no separate interview.
Phase 2 Design        Designer self-execute, 2 auto-emit tickets                [type:design × 2]
                      Trigger: L4+ / user-facing / risk_flags ≠ none. Skip: L1–L3 trivial.
                      · Ticket 1: system.md + flow.md + wireframe (optional)    → Gate A user OK
                      · Ticket 2: interactive component code (frontend-design)  → Gate B user OK
                      → both gates must pass before Phase 3
Phase 3 Build         ticket execution                                         [type:impl/refactor/test/qa]
                      · type:impl     (required, Developer + auto smoke gate)
                      · type:refactor (optional, Developer + auto smoke gate)
                      · type:test     (conditional, QA — triggers in pdt-designer.md)
                      · type:qa       (independent QA work only)
                      ─── Phase 3 close: 3 auto-emit tickets (sequential gates) ───
                      · type:design T1: 디자인 요소 검토    (Designer, mandatory — sonnet/medium auto-check)
                      · type:design T2: PRD 최종 요구사항   (pdt-po+user, waivable docs/pure-design)
                      · type:qa     T3: 보안 체크리스트     (QA/Developer auto-check, waivable docs/pure-design)
                      All 3 done → Phase 3→4 gate fires.
Phase 4 Deploy        type:deploy ticket execution                             [type:deploy]
                      (pdt-po+user collaborative; per-step verify; body shape in pdt-po.md)
                      Trigger: Phase 3 done + user confirms deploy.
                      Exit: deploy ticket `done` → Phase 4→5 gate.
Phase 5 Version close retrospective + calibration                              [no ticket]
                      sequence in lifecycle-mechanics.md; per-step detail in persona files
```

PO emits trace at every Phase transition: `→ Phase 2 Design entered (Designer)` · trivial skip: `→ Phase 2 skipped — L<n> trivial`. **MVP cycle (V1)**: PRD → Design (conditional) → Build → Deploy → Version close → next Version on usage data.

OSS ref: [mattpocock/skills](https://github.com/mattpocock/skills) — `to-prd` + `to-issues` = Designer skills.

## Layer B — `type` enum

| type | assignee | auto smoke gate | When | Body shape | Closes by |
|---|---|---|---|---|---|
| `design` | `pdt-designer` | n/a | Phase 2 (× 2 auto-emit) + Phase 3 close T1/T2 | `## Request` / `## Inputs` / `## Acceptance` / `## Out of scope` | artifact path checked-in (Phase 2) / checklist ✓ or N/A (Phase 3 close) |
| `impl` | `pdt-developer` | **ON** | Phase 3 (required) | standard | smoke gate `pass` + `done` |
| `refactor` | `pdt-developer` | **ON** | Phase 3 (optional) | standard | smoke gate `pass` + `done` |
| `test` | `pdt-qa` | n/a (is the test plan) | Phase 3 (conditional) | standard | test plan written |
| `qa` | `pdt-qa` | n/a (is the QA work) | Phase 3 (independent + Phase 3 close T3 security) | standard | QA verdict written / security checklist resolved |
| `deploy` | `pdt-po+user` | n/a (per-step verify) | Phase 4 (required, sole type) | `## Steps` (`[PO]/[user]` per-step) | all steps verified `done` |

Smoke gate behavior + close rules → `lifecycle-mechanics.md`.

**`status`** (lifecycle, separate from `type`): `todo → in-progress → review → done | blocked | abandoned`. Type fixed per ticket; status moves.

**`qa_status`** (impl / refactor only): `pending → pass | fail`. `pass` allows `done`; `fail` → dev resume + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other types have no field.

**Phase 3 close ticket waiver rule**: T2 (PRD review) and T3 (security) are waivable only for `type:docs` or pure-design releases. User must explicitly waive inline in that ticket's `## Outcome`. Waiver is surfaced again at Phase 4 gate prompt. Not waivable silently. T1 (design review) is mandatory — no waiver.
## Ticket file format

`docs/tickets/<version>/T-NNN.md` — full frontmatter schema (required + optional + version format rule + emit sequence + body sections) → **`sections/_formats/ticket-frontmatter.md`**.

**Ticket folder rule (T-P4-160)**: `<version>` MUST equal `po-state.current_version` at emit time (e.g. `v1.0-mvp`). Designer auto-creates folder `docs/tickets/<version>/` if absent. PO stamps `version:` frontmatter field post-delegate (T-P4-086) if omitted by Designer. Consistent with artifact versioning: one `<version>` slug covers both `docs/artifacts/<version>/` and `docs/tickets/<version>/` buckets.

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` |
| `docs/prd/<slug>.md` | Designer | inside delegated session |
| `docs/tickets/<version>/T-NNN.md` body / AC | Designer | emit alongside PRD |
| `docs/tickets/<version>/T-NNN.md` lifecycle frontmatter | PO | mechanical |
| `docs/artifacts/**/*.md`, `docs/designer/feature-history.md` | Designer | Designer Write |
| `docs/qa/fail-patterns.md` | PO mechanical | `printf >>` from QA's `fail_event` |
| `docs/retrospectives/<version>.md` | Designer | Phase 5 step 5c |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| Other `docs/qa/*.md` (project-notes, work-notes) | QA | QA Write (promotion-gated) |

PO never authors product content. Lifecycle / frontmatter = state, not authoring.

**Plan doctrine (T-P4-153)**: `plan_path:` frontmatter field is **deprecated**. New
tickets embed the implementation plan as `## §Plan` inline in the ticket md.
Artifact outputs: flat within `docs/artifacts/<version>/` bucket — see T-P4-153 path rule in `sections/prd-and-output.md` §"Artifact output paths". No sub-folders within a version bucket. Global / non-ticket docs at `docs/artifacts/` root.

### PO mechanical-write whitelist

**PO direct (mechanical)**: ticket frontmatter (`status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `qa_status`, `qa_loops`, `observed_result`, **`version`** (stamp at emit if absent — T-P4-086), routing/model/effort meta) · mirrored header status line · `## Persona Activity` 1-row append (≤80-char Result) — PO **단독** 책임; persona 자가-write 금지 · `docs/qa/fail-patterns.md` append from QA's `fail_event` · `po-state.json` `pending_gate` set/clear at Phase boundary.

**Delegate to Designer**: `success_metric`, `validation_method` (set at creation) · `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope`, `## Outcome`, title changes.

Refusal template → `po-instructions.md` `## NEVER`.

`branch` / `worktree_path` filled by git-workflow (R2) at ticket open. `fail-patterns.md` append jq one-liner: `jq -r '.fail_event | "- (\(now | strftime("%Y-%m-%d"))) \(.version) · \(.ticket_id) · \(.area_tag) · loops=\(.loops) · final=\(.final) · note: \(.note)"'`.
## Ticket id allocation → `sections/_formats/ticket-id-allocation.md`

`T-NNN` zero-padded, monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fs scan fallback (script in sub-file). PO embeds computed id in `[ctx]`.
