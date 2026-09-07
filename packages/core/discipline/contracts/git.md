---
name: git
section: Git
when: "promoting `dev → main` · cutting a version or patch tag · creating the remote · deciding worktree isolation"
---
# Contracts §Git — annex

Continues `contracts.md` §Git; binds every persona the same way, loaded on demand at the moment `when` names.

## Promotion `dev → main`, version boundary, patch rolls
- `dev → main`: whether that merge lands locally or through a pull request is the REPOSITORY's policy, which `prdt doctor` reads off the repo and names when it is the PR path — follow what it reports, never assume the shape from another project. Version boundary = an **immutable `v<N>.<m>` tag** fixed at close (never a long-lived version branch) + wiki `retro--v<N>.<m>.md`. A fix that surfaces AFTER a version closed and needs a deploy rolls a **patch `v<N>.<m>.<p>`** instead of a new minor — same tag + `docs/tickets/` system, immutable tag, lightweight retro (see PO lifecycle).

## The mechanical block, and the optional `feat/*` · PR · `staging` default
- The mechanical block is a per-clone pre-push hook that `prdt init` / `prdt doctor` writes into the code repo's own `.git/hooks`: a clone carries no hooks, and any `core.hooksPath` (a global husky/dotfiles setup, an org `.githooks`) makes that dir inert — where doctor has not run, or reports the block inactive or unverified (it vouches for its own hook only, never for one it did not write), nothing but you stops the push. **Optional as OUR default, never a gate the product imposes** (only when isolation/preview/pre-deploy checks are wanted): `feat/*` branches, PRs, a `staging` env — but a repo or org that REQUIRES one (branch protection, an org `.githooks` hook naming a PR promotion path) has already fixed that project's promotion path, and its policy outranks this default there.

## Remote setup
- **Remote default branch = `main`, always** (GitHub repo setting). Vercel auto-binds the default branch to production — if `dev` becomes the default, every residence push deploys to prod. Set it at repo creation (`gh repo edit --default-branch main`); with `main` default, `dev` pushes land as previews, which is the intended mapping.

## Isolation
- Isolation (branch + worktree, Agent-native option) only on three triggers: ① parallel tracks sharing a resource — types/contracts, lockfile, migration numbers, ports, or a local dev store/scratchpad — not just overlapping file paths ② experimental / throwaway refactor ③ a second PO instance on the same project. Cut from `dev`; adopt = merge back then delete branch; abandon = drop whole.
