# Ticket md schema

Path: `docs/tickets/<version>/T-NNN.md`. `<version>` = `po-state.current_version`.
Folder auto-created on first ticket of version. ≤100 lines.

## Frontmatter

```yaml
---
ticket_id: T-NNN
version: v0.4-meta-dogfood
slug: short-kebab
title: Human-friendly title
type: design | impl | refactor | test | qa | deploy | close | docs | doctrine
status: planned | in-progress | qa-pending | user-pending | done | blocked | cancelled
phase: 1 | 2 | 3 | 4 | 5
assignee: pdt-designer | pdt-developer | pdt-qa | pdt-po
requires_qa: true | false
requires_user_gate: true | false
area_tag: <kebab-area>
estimated_complexity: L1 | L2 | L3 | L4 | L5 | L6 | L7
risk_flags: []        # auth | payments | PII | data-migration | external-api
created_at: ISO8601
started_at: ISO8601   # PO mechanical
completed_at: ISO8601 # PO mechanical
duration_min: <int>   # PO mechanical
---
```

### Lifecycle fields (PO mechanical only)
`status` transitions · `started_at` / `completed_at` / `duration_min` · `qa_status` / `qa_loops` (impl/refactor only; `qa_status ∈ pending|pass|fail`) · `observed_result` (Phase 5).

### `version:` regex
`^v\d+(\.\d+)?(-[\w-]+)?$` — exception: archive ids (`legacy/...`) with `legacy: true`.

## 9 ticket types
| type | assignee | when |
|:--|:--|:--|
| `design` | pdt-designer | Phase 1 PRD · Phase 2 (T1 design system + mockup / T2 user flow + wireframe / T3 hi-fi mockup) · Phase 3 close gate review |
| `impl` | pdt-developer | Phase 3 build |
| `refactor` | pdt-developer | Phase 3 cleanup / debt |
| `test` | pdt-qa | risk-triggered test plan (auth / payments / PII / multi-step ≥3 / area ≥3 fails) |
| `qa` | pdt-qa | impl verification loop |
| `deploy` | pdt-po | Phase 4 env / release |
| `close` | persona-routed | Phase 3 close-gate items · Phase 5 close |
| `docs` | persona-routed | doc-only update (no functional change) |
| `doctrine` | persona-routed | habit / bookshelf / sections edit |

## 7 status values
| status | meaning |
|:--|:--|
| `planned` | emitted, not started |
| `in-progress` | assignee dispatched |
| `qa-pending` | impl done, awaiting QA |
| `user-pending` | awaiting user gate / approval |
| `done` | closed |
| `blocked` | assignee returned blocked |
| `cancelled` | superseded / dropped |

## Body sections

```markdown
# T-NNN: <title>

## Request
<verbatim user ask + PO paraphrase>

## Acceptance
- BDD: Given <state> / When <action> / Then <observable outcome>

## Out of scope
- <explicit nons — prevents scope creep>

## Plan
<inline plan — replaces deprecated `plan_path:`. Includes §QA scope table when type ∈ impl/refactor.>

## Outcome
<filled at Phase 5 by assignee: shipped | deferred | dropped | scope-change + observed_result | null>

## Persona Activity
<PO-managed table: dispatch rows — persona / session_id / started_at / completed_at / model / effort>
```

## Ownership
- Designer owns scope-defining sections (Request / Acceptance / Out of scope / Plan).
- PO touches only lifecycle frontmatter + Persona Activity rows + mirrored header line.
- `type:deploy` uses `## Steps` body section instead of `## Plan` (see `pdt-po.md`).
