# Engineering workflow + Ticket system

Doctrine = English. PO renders user-facing prompts/traces in working language at runtime.

## Pointer index

- `type:design` 4-ticket auto-emit (Phase 2) + `type:test` triggers → `pdt-designer.md`
- Phase 3 close 3-ticket (T1+T2 design, T3 qa security) → `po-loop.md §Phase 3 Build close gate` + `_details/security-checklist.md`
- `type:deploy` body + Phase 5 5d → `pdt-po.md` · Phase 5 5a/5c → `pdt-designer.md` · 5b → `pdt-qa.md`
- PO mechanical ops → `lifecycle-mechanics.md` · `po-state.json` schema → `memory.md`

Owns here: phase defs (Layer A), type taxonomy (Layer B), naming, ticket file format, id allocation, who-writes-what.

## Two axes

- **Layer A** = Version Cycle Phases (timeline; non-ticket steps included) 1..5
- **Layer B** = Ticket Type / `type` enum (per-ticket classification). Layer A drives Layer B.

## Naming

- prose: `PO`, `Designer`, `Developer`, `QA`
- code/agent ID/assignee: `pdt-` prefix · deploy assignee: `pdt-po+user` (collaborative)

## Layer A — Version Cycle Phases

```
Phase 1 PRD       Designer clarity loop A ≤ 0.05                   [no ticket]
                  opus/max V1; opus/xhigh V2+. Clarity = discovery (no separate interview).
Phase 2 Design    Designer self-execute, 4 auto-emit tickets       [type:design × 4]
                  ① system  ② flow  ③ wireframe  ④ hi-fi mockup
                  → single user gate after all 4 surfaced → Phase 3
Phase 3 Build     ticket execution                                 [type:impl/refactor/test/qa]
                  · impl (required, Dev+smoke) · refactor (optional, Dev+smoke)
                  · test (conditional, QA) · qa (independent QA)
                  ─── Phase 3 close: 3 sequential gate tickets ───
                  · type:design T1 디자인 검토   (Designer, mandatory — sonnet/medium)
                  · type:design T2 PRD 요구사항  (pdt-po+user, waivable docs/pure-design)
                  · type:qa     T3 보안 6항목   (QA/Developer, waivable docs/pure-design)
                  All 3 done → Phase 3→4 gate fires.
Phase 4 Deploy    type:deploy (pdt-po+user, per-step verify)       [type:deploy]
                  Trigger: Phase 3 done + user confirms. N/A skip: productune-internal /
                  library / docs-only / Electron desktop.
Phase 5 Close     5a→5b→5c→5d sequence                             [no ticket]
                  detail in lifecycle-mechanics.md + persona files
```

PO traces every Phase transition: `→ Phase 2 Design entered (Designer)` · skip: `→ Phase 2 skipped — L<n> trivial`. MVP cycle (V1): PRD → Design (cond) → Build → Deploy → Close → next Version on usage data.

## Layer B — `type` enum

| type | assignee | smoke gate | When | Body | Closes by |
|---|---|---|---|---|---|
| `design` | `pdt-designer` | n/a | Phase 2 (×4) + Phase 3 close T1/T2 | `## Request` / `## Inputs` / `## Acceptance` / `## Out of scope` | artifact checked-in (P2) / checklist ✓ or N/A (P3 close) |
| `impl` | `pdt-developer` | **ON** | Phase 3 required | standard | smoke `pass` + `done` |
| `refactor` | `pdt-developer` | **ON** | Phase 3 optional | standard | smoke `pass` + `done` |
| `test` | `pdt-qa` | n/a | Phase 3 conditional | standard | test plan written |
| `qa` | `pdt-qa` | n/a | Phase 3 (indep + close T3 security) | standard | QA verdict / security ✓ |
| `deploy` | `pdt-po+user` | n/a | Phase 4 required, sole type | `## Steps` (`[PO]/[user]` per-step) | all steps `done` |

Smoke gate + close rules → `lifecycle-mechanics.md`.

**status** (lifecycle, separate from type): `todo → in-progress → review → done | blocked | abandoned`. Type fixed; status moves.

**qa_status** (impl/refactor only): `pending → pass | fail`. `pass` → `done`; `fail` → dev resume + `qa_loops += 1`; `qa_loops ≥ 3` → `blocked`. Other types have no field.

**Phase 3 close waiver**: T2 (PRD) + T3 (security) waivable only for `type:docs` / pure-design — user explicit inline in `## Outcome`; surfaced again at Phase 4 gate. T1 (design) mandatory, no waiver.

## Ticket file format

`docs/tickets/<version>/T-NNN.md` — full frontmatter schema (required + optional + version format + emit sequence + body sections) → `_formats/ticket-frontmatter.md`.

**Folder rule**: `<version>` MUST equal `po-state.current_version` at emit time (e.g. `v1.0-mvp`). Designer auto-creates folder if absent. PO stamps `version:` post-delegate if Designer omits. One `<version>` covers both `docs/artifacts/<version>/` + `docs/tickets/<version>/` buckets.

**Plan doctrine**: `plan_path:` deprecated. Embed plan as `## §Plan` inline. Artifact outputs flat within `docs/artifacts/<version>/`; no sub-folders. Path rule → `prd-and-output.md §Artifact output paths`.

## Who writes what

| Artifact | Owner |
|---|---|
| `.productune/briefs/<slug>.md` | PO `printf >>` |
| `docs/prd/<slug>.md` + ticket md body/AC | Designer (delegated) |
| ticket md lifecycle frontmatter | PO mechanical |
| `docs/artifacts/**/*.md` + `docs/designer/feature-history.md` + retrospectives | Designer Write |
| `docs/qa/fail-patterns.md` | PO mechanical (`printf >>` from QA `fail_event`) |
| `po-state.json` | PO + post-delegate hook (`jq`) |
| `~/.productune/po-memory.md` (calib) | PO `printf >>` |
| Source / configs / scripts | Developer Write/Edit |
| Other `docs/qa/*.md` notes | QA Write (promotion-gated) |

PO never authors product content. Lifecycle / frontmatter = state, not authoring.

## PO mechanical-write whitelist → `_details/can-mechanical-writes.md`

Short: ticket frontmatter (`status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `type`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, `qa_status`, `qa_loops`, `observed_result`, **`version`** stamp, routing/model/effort) · header status line · `## Persona Activity` 1-row append (≤80 char Result; PO 단독) · `fail-patterns.md` append · `po-state.json pending_gate`. **Delegate to Designer**: `success_metric` / `validation_method` · `## Request`/`## Inputs`/`## Acceptance`/`## Out of scope`/`## Outcome` / title. Refusal → `po-instructions.md §NEVER`.

## Ticket id allocation → `_formats/ticket-id-allocation.md`

`T-NNN` zero-padded, monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fs scan fallback. PO embeds id in `[ctx]`.
