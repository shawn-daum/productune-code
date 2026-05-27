# 5-Phase lifecycle definitions

Every ticket lives in exactly one phase. Persona checks `phase:` frontmatter before acting.
Out-of-phase ask → return `{blocked: true, reason: "phase mismatch"}`. ≤100 lines.

## Phase 1 — PRD

- **Input**: user prompt (raw ask) + prior `feature-history.md` + `fail-patterns.md` read.
- **Output**: `docs/prd/PRD.md` (versioned section) + first `type:design` ticket.
- **Persona**: pdt-designer (clarity loop). Model: opus / max (R1 net-new), opus / xhigh (R2+ incremental).
- **Mechanism**: clarity score `A = 1 − Σ(clarityᵢ × weightᵢ)`. Ready when `A ≤ 0.05`. Hard cap 5 loops; PO "finalize" ships `ready` with `confidence<0.7`.
- **Auto-ticket**: new version Phase 1 entry → emit T-NNN `type:design` "PRD 작성" immediately. Ticket = vehicle for user↔PO↔Designer comms during clarity loop. `## Plan` = clarity loop steps.
- **Exit**: PRD `state:"ready"` → enter Phase 2.

## Phase 2 — Design

- **Input**: ready PRD.
- **Output**: 3-ticket `type:design` sequence (PO orchestrates emit, Designer executes via session resume):
  - **T1 design system + mockup** — `docs/designer/design-system.md` (DS, opus/max net-new) + up to 3 key screens (T1a: 3 candidates → user picks; T1b: finalize with chosen system)
  - **T2 user flow + wireframe** — `docs/artifacts/<version>/<slug>-flow.md` + `docs/artifacts/<version>/<ticket-id>-wireframe.excalidraw.json` (optional)
  - **T3 hi-fi mockup** — `docs/artifacts/<version>/<ticket-id>-mockup.{html,tsx}` (interactive, via `anthropic/frontend-design` skill; shadcn/ui + react-icons default, productune-internal = lucide-react)
- **Persona**: pdt-designer (opus / xhigh per ticket).
- **Gate**: single user gate after all 3 surfaced.
- **Exit**: user approval → enter Phase 3.

## Phase 3 — Build

- **Input**: approved design artifacts + emitted `impl` / `refactor` / `test` / `qa` tickets.
- **Output**: working code + QA pass + close gate items resolved.
- **Persona**: pdt-developer (impl/refactor), pdt-qa (test/qa loop), pdt-designer (close gate review).
- **Mechanism**: impl ↔ qa auto-loop (`dev-qa-auto-loop.md`). Close gate = mandatory designer review at gate close (no waiver) — assignee Designer, type:design, sonnet/medium.
- **Test trigger**: `type:test` emit if any — risk flag ∈ {auth, payments, PII} · multi-step flow ≥3 · area-tag ≥3 cumulative fails in `fail-patterns.md` · user explicit.
- **Exit**: all close-gate tickets `done` → enter Phase 4.

## Phase 4 — Deploy

- **Input**: green build.
- **Output**: deployed env + verified health.
- **Persona**: pdt-po (deploy coord, `## Steps` body), pdt-developer (env config), pdt-qa (post-deploy smoke).
- **Mechanism**: `type:deploy` ticket. Env management via platform-native tools (e.g. `vercel env`).
- **Exit**: deploy verified → enter Phase 5.

## Phase 5 — Close

- **Input**: shipped version.
- **Output**:
  - `docs/retrospectives/<version>.md` (designer 5c, sonnet/medium)
  - `docs/designer/feature-history.md` append (designer 5a, opus/xhigh, direct write)
  - `docs/qa/version-summaries/<version>.md` (qa)
  - Promotion drain (PO surfaces pending_promotions to user)
  - `docs/artifacts/<version>/design-system-snapshot.md` (PO copies DS)
- **Persona**: pdt-designer (5a outcome fill + history + backlog propose; 5c retrospective), pdt-qa (version summary), pdt-po (coord + promotion drain + DS snapshot).
- **Mechanism**: `outcome.observed_result` lazy-filled (null if not yet observable); next-version Phase 1 N+1 picks up null + `validation_method` → ask user.
- **Exit**: version archived; next version Phase 1 opens.

## Phase boundary rule

Persona never skips phases. If dispatched out-of-phase → `{blocked: true, reason: "phase mismatch"}`. PO routes correction.
