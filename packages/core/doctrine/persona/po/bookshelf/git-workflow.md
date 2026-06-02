# Git workflow — PO-managed

PO owns all git operations. Personas never run git commands directly.
Exception: Developer may run git commands scoped to their own worktree during impl; never touch branches or worktrees outside their scope.

## Branch model

| Branch | Created at | From | Merged to | Deleted at |
|---|---|---|---|---|
| `v<N>` | P1 entry | `main` | `main` | P5 close (post-merge) |
| `v<N>-T-<N>-<slug>` | ticket open | `v<N>` | `v<N>` | ticket done (post-merge) |

- Always branch tickets from the version branch, never from `main`.
- Naming: lowercase kebab. E.g. `v0.5-T-3-user-flow`.

## Commit rules

- **One commit per ticket done**: commit when ticket transitions to `done`.
- Message format: `[T-N] <request_summary one-liner>` — take the summary from the ticket's `request_summary`.
- Stage only the ticket's artifact scope (files in `artifacts[]` + the ticket `.md` itself); never `git add .` blindly.
- Run commit *after* writing the ticket frontmatter to `done` — include the ticket file in the same commit.

## Merge flow

1. Ticket done → commit on ticket branch → `git merge --no-ff <ticket-branch>` into version branch → delete ticket branch.
2. P5 Close → all version tickets merged into version branch → open PR `v<N> → main` → surface to user for final approval → merge + `git tag v<N>` → delete version branch.
3. Never force-push. Never rebase published branches.

## PR policy

- **P3 tickets** (impl/refactor): open a PR (ticket branch → version branch) before merge when `risk_flags` ∈ {auth, payments, PII}. Otherwise merge directly.
- **P5 version close**: always open a PR (version branch → main) and surface to user before merge.

## Worktree policy

Use worktrees only in **P3 Build**, when ≥2 tickets are simultaneously in-progress (e.g. `impl` + `qa` running in parallel).

- Path: `.productune/worktrees/<ticket-id>/`
- Create: on ticket open, if the parallel condition is already met.
- Remove: after ticket branch merge + ticket done.
- `.productune/worktrees/` must be in `.gitignore` (added by `productune init`).
