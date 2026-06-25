# Ticket ops

## Frontmatter at emission — `phase:` is NEVER optional

Every ticket frontmatter MUST carry `phase: <int>` (1–5, unquoted) stamped at emission =
`po-state.current_phase` at that moment (patch-round tickets included — `round:` does NOT
substitute for `phase:`). The statusline counter and GUI progress read `phase:` + `status:`
only; a phase-less ticket is invisible to both, which reads as "phase running with no
tickets" (T-PATCH-118: 27 v0.5 patch tickets + all 128 v0.4 tickets were emitted without
it). Lint: `scripts/ci/check-ticket-frontmatter.sh` fails the batch on a missing/non-int
`phase:` or unknown `status:`.

## Git — ticket open/close ops

On every ticket open: `git worktree add .productune/worktrees/<ticket-id>/ -b <version>/T-<N>-<slug> v<N>` — never `git checkout` the ticket branch in the main tree (stay resident on `v<N>`; see `bookshelf/git-workflow.md` ## Posture).
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
- Data-layer touch (DAL / select / RLS / column grant): build-green + bundle-grep CANNOT catch runtime permission errors — close only after a real page render (route 200 + content) or a direct anon REST probe.
- Dispatch GRILL (not basic) when change ∈ {doctrine edit · core/load-bearing feature · loss-risk refactor/compression · security/data-layer}; else basic.

## Code-review gate (per-ticket, risk-gated)

Beside the smoke gate, on dev `ready_for_qa` for `impl`/`refactor` tickets, PO runs a per-ticket code-review on the ticket worktree diff via the harness `/code-review` skill (and `/simplify` for quality-only passes) — 3 axes: **correctness · reuse/dedup · simplify**.
- **Risk-gate** — run the review only when ANY holds (numbers are tunable guidelines, not hard constants): `risk_flags` non-empty · OR ≥ ~6 files changed · OR ≥ ~300 LOC changed in the ticket worktree. Non-risk tickets are NOT per-ticket reviewed — the close-gate cumulative pass (`lifecycle/p3-build.md` ## Close gate) covers them.
- **Semantics** — a **correctness** finding is BLOCKING: loop back to dev like a QA fail, reusing the same ≤3-retry cap → beyond → `blocked` + surface. **reuse/simplify** findings are ADVISORY: record as actionable rows in `## Persona Activity`, never block.
- Auto-fix (`--fix` / `/simplify` apply) is propose-only here; auto-apply is deferred (backlog). This is a build-loop event — it does NOT touch the `close_gate` sequence.
