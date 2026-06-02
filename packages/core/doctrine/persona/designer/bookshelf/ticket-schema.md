# Ticket md schema

Write each ticket at `docs/tickets/<version>/T-NNN.md`, where `<version>` = `po-state.current_version`. Folder auto-created on the first ticket of a version.

## Frontmatter

```yaml
---
ticket_id: T-NNN
version: version name
slug: short-kebab
title: Human-friendly title
type: design | impl | refactor | test | qa | deploy | close | docs | doctrine
status: todo | in-progress | review | user-verify | done | blocked | abandoned
phase: 1 | 2 | 3 | 4 | 5
assignee: pdt-designer | pdt-developer | pdt-qa | pdt-po
requires_qa: true | false
requires_user_gate: true | false
area_tag: <kebab-area>
estimated_complexity: L1 | L2 | L3 | L4 | L5 | L6 | L7
risk_flags: []        # auth | payments | PII | data-migration | external-api
created_at: ISO8601
started_at: ISO8601   
completed_at: ISO8601
duration_min: <int> 
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
| `todo` | emitted, not started |
| `in-progress` | assignee dispatched |
| `review` | impl done, awaiting QA |
| `user-verify` | awaiting user gate / approval |
| `done` | closed |
| `blocked` | assignee returned blocked |
| `abandoned` | superseded / dropped |

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
<inline plan. Includes §QA scope table when type ∈ impl/refactor.>

## Outcome
<filled at Phase 5 by assignee: shipped | deferred | dropped | scope-change + observed_result | null>

## Persona Activity
<PO-managed table: dispatch rows — persona / session_id / started_at / completed_at / model / effort>
```
