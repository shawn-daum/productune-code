# Git workflow — PO-managed

PO owns all git. Personas never run git directly. Exception: Developer may run git scoped to their own worktree during impl — never touch branches/worktrees outside scope.

## Posture — stay resident on `v<N>`

PO/session stays RESIDENT on `v<N>`. NEVER `git checkout <ticket-branch>` in the main working tree — it displaces `v<N>` and collapses the PO-orchestrate / dev-work role split. Ticket work is worktree-isolated; PO merges ticket branches INTO `v<N>` while staying on it.

## Branch model

| Branch | Created at | From | Merged to | Deleted at |
|---|---|---|---|---|
| `v<N>` | P1 entry | `main` | `main` | P5 close (post-merge) |
| `v<N>-T-<N>-<slug>` | ticket open | `v<N>` | `v<N>` | ticket done (post-merge) |

Branch tickets from the version branch, never `main`. Naming: lowercase kebab, e.g. `v0.5-T-3-user-flow`.

## Commit rules

One commit per ticket done: write ticket frontmatter to `done` first, then commit (ticket `.md` in same commit). Stage only artifact scope (`artifacts[]` + ticket `.md`); never `git add .`. Message: `[T-N] <request_summary one-liner>` from ticket `request_summary`.

## Merge flow

1. Ticket done → commit → `git merge --no-ff <ticket-branch>` into version branch → delete ticket branch.
2. P5 Close → all tickets merged → PR `v<N> → main` → user final approval → merge + `git tag v<N>` → delete version branch.
3. Never force-push. Never rebase published branches.

## PR policy

- P3 tickets (impl/refactor): PR (ticket → version) before merge when `risk_flags` ∈ {auth, payments, PII}; else merge direct.
- P5 version close: always PR (version → `main`) + user surface before merge.

## Worktree policy

EVERY ticket gets worktree isolation — not just ≥2-parallel. This keeps `v<N>` resident in the main tree and separates PO-orchestrate from dev-work.

- Path: `.productune/worktrees/<ticket-id>/`
- Create: on ticket open (always). Branch lives in the worktree, never checked out in the main tree.
- Remove: after ticket branch merge + ticket done.
- `.productune/worktrees/` in `.gitignore` (added by `productune init`).
