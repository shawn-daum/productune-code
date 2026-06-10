# Ticket ops

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
- Dispatch GRILL (not basic) when change ∈ {doctrine edit · core/load-bearing feature · loss-risk refactor/compression · security/data-layer}; else basic.
