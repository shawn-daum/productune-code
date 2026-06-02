# Lifecycle mechanics — version + phase orchestration

A version is one 5-phase cycle: P1 PRD → P2 Design → P3 Build → P4 Deploy → P5 Close.
Every ticket carries a `phase:` and lives in exactly one phase — keep it there, never skip
ahead. Advance only on explicit user confirm at each boundary.

## The 5 phases

### P1 — PRD
- **In**: the user's raw ask + a read of `feature-history.md` + `fail-patterns.md`.
- **Out**: `docs/prd/PRD.md` (versioned section, master EN) + `docs/artifacts/<version>/PRD.html` (user-lang).
- **Persona**: pdt-designer, clarity loop — opus/max (R1 net-new), opus/xhigh (R2+).
- **Emit at entry**: one `type:design` "PRD authoring" ticket immediately — the user↔PO↔Designer comms vehicle; its `## Plan` holds the clarity-loop steps.
- **Mechanism**: clarity score `A = 1 − Σ(clarityᵢ × weightᵢ)`; ready at `A ≤ 0.05`. Hard cap 5 loops; a PO "finalize" ships `ready` even at `confidence < 0.7`.
- **Git**: `git checkout -b v<N> main` on P1 entry. All version work lives on this branch.
- **Exit**: PRD `state:"ready"` → P2.

### P2 — Design  (skip unless L4+ / user-facing / `risk_flags` ≠ none)
- **In**: ready PRD.
- **Emit**: 3 sequential `type:design` tickets (you emit, Designer executes via session resume), opus/xhigh each:
  - **T1 design system + key screens** — `docs/designer/design-system.md` (opus/max net-new) + up to 3 screens (T1a: 3 candidates → user picks; T1b: finalize on the chosen system).
  - **T2 user flow + wireframe** — `docs/artifacts/<version>/<slug>-flow.html` + optional `…-wireframe.excalidraw.json`.
  - **T3 hi-fi mockup** — `docs/artifacts/<version>/<ticket-id>-mockup.{html,tsx}` via the `frontend-design` skill (shadcn/ui + react-icons default; productune-internal = lucide-react).
- **Gate**: one user gate after all 3 are surfaced.
- **P2 close — archive non-SoT artifacts**: On user approval, move all T1/T3 candidate files that were NOT adopted as SoT (i.e. rejected mockup variants) to `docs/artifacts/<version>/archive/`. The adopted SoT file stays in `docs/artifacts/<version>/`.
- **Exit**: user approval → P3.

### P3 — Build
- **In**: approved design + emitted `impl` / `refactor` / `test` / `qa` tickets.
- **Out**: working code, QA pass, close-gate items resolved.
- **Persona**: pdt-developer (impl/refactor), pdt-qa (test/qa loop), pdt-designer (close-gate review).
- **Build loop**: impl ↔ qa auto-loop, PO-owned — see *Auto QA smoke gate* below.
- **Test trigger**: emit `type:test` on any of — risk flag ∈ {auth, payments, PII} · multi-step flow ≥3 · area-tag ≥3 cumulative fails in `fail-patterns.md` · user explicit.
- **Close gate** (sequential, once build is complete): T+0 `type:design` design review (Designer sonnet/medium, **mandatory, no waiver** — `designer/bookshelf/phase3-close-gate.md`) → T+1 `type:design` PRD-requirements check (PO + user, waivable) → T+2 `type:qa` 6 security items (waivable).
- **Exit**: all close-gate tickets `done` → P4.

### P4 — Deploy  (project-type gate)
- Meaningful target (web / API / mobile) → run. N/A (internal / library / docs-only) → skip; P3 goes straight to P5.
- **In**: green build. **Out**: deployed env + verified health.
- **Persona**: pdt-po (deploy coord, `## Steps` body), pdt-developer (env config), pdt-qa (post-deploy smoke).
- **Mechanism**: one `type:deploy` ticket; manage env via platform-native tools (e.g. `vercel env`).
- **Exit**: deploy verified → P5.

### P5 — Close  (stored-memory only; never spawn fresh analysis)
- **Git**: open PR `v<N> → main`, surface to user for final approval → merge + `git tag v<N>` → delete version branch. Full: `bookshelf/git-workflow.md`.
- **In**: shipped version. Run 5a → 5b → 5c → 5d:
  - **5a** Designer (opus/xhigh): fill `outcome.observed_result`, append `docs/designer/feature-history.md` (direct write), propose next-version backlog.
  - **5b** QA (opus/xhigh): aggregate fail-patterns → `docs/qa/version-summaries/<version>.md`.
  - **5c** Designer (sonnet/medium): write `docs/retrospectives/<version>.md`.
  - **5d** PO: append the calibration line, drain `pending_promotions` to the user, copy the DS snapshot.
- **Mechanism**: `outcome.observed_result` lazy-fills (null if not yet observable); the next version's P1 picks up the null + `validation_method` and asks the user.
- **Exit**: version archived; next version's P1 opens.

## Phase transition write
On user approval (chat reply):
```bash
jq '.current_phase = <N>
  | .phase_history += [{"phase":<N>,"started_at":"<ISO>","user_approved_at":"<ISO>"}]
  | .pending_gate = null' .productune/po-state.json > /tmp/ps.json && mv /tmp/ps.json .productune/po-state.json
```

## Git — ticket open/close ops
On every ticket open: `git checkout -b <version>/T-<N>-<slug> v<N>`.
On every ticket done: stage artifact files + ticket `.md` → `git commit -m "[T-N] <request_summary>"` → `git merge --no-ff <ticket-branch>` into version branch → delete ticket branch.
Full rules: `bookshelf/git-workflow.md`.

## Mechanical close rules
- `todo → in-progress`: set `started_at` if empty.
- `in-progress | review → done | blocked | abandoned`: set `completed_at`; compute `duration_min` if `started_at` present.
- Status transition: update frontmatter + mirrored header.
- `assignee` / routing / session refs: metadata only.
- `branch` / `worktree_path`: set on open; never clear (history).
- `## Outcome` is content — delegate Designer if product meaning is needed.
- **QA gate close** (impl / refactor): on dev `ready_for_qa`, run the *Auto QA smoke gate* below and set status by its outcome.
- **`user-verify`**: result needs user confirmation (UI placement / visual check) → set status `user-verify` + surface to the user; user confirms → `done`; user rejects → back to `in-progress`. Typically after a QA pass on user-facing visual work.

## Auto QA smoke gate
Never let user-facing breakage reach the user.
- Tool: Playwright / Chromium MCP / headless. Non-UI = build / typecheck / unit tests.
- Coverage: route load · navigation · no console errors · sanity Acceptance check.
- Budget: ≤1 min — not the full test plan.
- Fail loop: resume dev with the fail excerpt; max 3 retries; beyond → `blocked` + surface.
- Pass: ticket `done` allowed; append 1 row to `## Persona Activity`.
- `type:test` / `type:qa` / `type:design` self-verify; `type:deploy` verifies per-step.

## Outcome measurement
Append-only; never blocks lifecycle.
- **Per-version** (required `versions[].outcome`): `north_star`, `input_metrics[]`, `validation_method` — Designer derives from the ready PRD, emits via `version_outcome` in the ready-turn JSON; mirror into state. `observed_result`, `retrospective_path` filled at P5.
- **Lazy protocol**: when `validation_method` needs external data (PostHog / Sentry / GA), leave `observed_result: null` at P5; Designer chases it in the next version's P1. Never remind. No next version → it never runs.

## Retrospective read sources (P5)
At 5a/5b/5c read stored memory only; never spawn fresh analysis:
1. project notes — `docs/{designer,developer,qa}/bookshelf/*.md`
2. po-state `recent_turns` — rolling 5
3. global persona memory — `~/.productune/<persona>/{habit,bookshelf}.md` (file-read ahead, inject via `[ctx]`)
4. po-memory — `~/.productune/po/habit.md` + `~/.productune/po/bookshelf/calibration-log.md`
5. approved-promotion archive — `pending_promotions[]` with `status ∈ {approved, edited}` ∧ `decided_at ∈ [version.started_at, version.ended_at]`

## Master archive at version close
```bash
mkdir -p "docs/artifacts/$VERSION"
cp docs/designer/design-system.md "docs/artifacts/$VERSION/design-system-snapshot.md"
cp docs/prd/PRD.md "docs/artifacts/$VERSION/PRD-snapshot.md"
```

## State lazy-prompts + versions cap
Surface only when the condition holds, ask once, leave the field as-is on silence:

| Field | Condition | Ask |
|:--|:--|:--|
| `phase_history[]` | open > 14d | "Phase {n} open {N}d — still active?" |
| `pending_gate` | age ≥ 7d, same phase | "pending_gate {N}d old — keep / clear?" |
| `versions[].outcome.observed_result` | null + `ended_at` non-null | "Version {id} closed — what happened?" |

`versions[]` cap: retain ≤5; rotate older entries to an `outcome.retrospective_path` ref (out of the state file for size, not purged).
