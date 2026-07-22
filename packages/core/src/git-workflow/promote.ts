/**
 * promote.ts — the NTF canonical solo branch model as a product operation
 * (T-323 / T-381). productune orchestrates the user project's git so a
 * non-developer never types a git command.
 *
 * Canonical model (T-381, solo-tuned):
 *   - `dev`  — the residence branch. Daily work commits here directly.
 *   - `main` — the deploy branch. Reached ONLY by promoting from dev; direct
 *              push is blocked by the pre-push hook (hooks.ts). Hard rule.
 *   - `v*`   — an immutable release tag, fixed at version close. There is NO
 *              long-lived version branch (v1·v1.1…) — the delta T-381 patched.
 *
 * Scope note (T-323 decision 2026-07-21): the "code-only sync, docs excluded"
 * (A안 파생-미러) promote step is NOT built. v1.3+ projects are meta-split, so
 * `docs/` is structurally absent from the CODE repo — promoting dev→main is a
 * plain merge and nothing needs filtering. The legacy (non-split) promote step
 * is scoped out; a demand for it goes to backlog.
 *
 * Every git op here anchors at codeRoot (PRD §v1.3 설계 결정 4) — in a split
 * project the code `.git` lives under `<projectRoot>/<code.dir>`, not the meta
 * projectRoot. Following worktree.ts's contract exactly.
 *
 * These operations mutate ONLY local refs (branch create, checkout, merge, tag).
 * They never push — pushing `main` is the confirm-gated deploy step (contracts:
 * "No push … without explicit user instruction"), and a `v*` tag likewise ships
 * only when the user deploys.
 */

import { readGitRules } from './rules'
import { codeGit as git, branchExists, currentBranch, errMessage } from './git-helpers'

export const DEV_BRANCH = 'dev'
export const MAIN_BRANCH = 'main'

// git / branchExists / currentBranch / errMessage are the shared codeRoot-anchored
// primitives (git-helpers.ts, T-387) — this module only adds its own isDirty gate.

async function isDirty(projectDir: string): Promise<boolean> {
  try {
    const out = await git(projectDir, ['status', '--porcelain'])
    return out.length > 0
  } catch {
    return false
  }
}

// ── ensureDevBranch — establish the residence branch ────────────────────────────

export type EnsureDevReason = 'created' | 'checked-out' | 'already-current' | 'git-error'

export type EnsureDevResult =
  | { ok: true; reason: Exclude<EnsureDevReason, 'git-error'>; branch: string }
  | { ok: false; reason: 'git-error'; detail: string }

/**
 * Ensure `dev` exists and is the checked-out (residence) branch.
 *
 * - Absent → created from `main` (or from the current position when `main` is
 *   absent, e.g. a repo whose default branch was never renamed, OR a fresh repo
 *   with no commits yet) and checked out.
 * - Present but not current → checked out.
 * - Already current → no-op.
 *
 * No pre-emptive dirty gate: `checkout -b dev` is always data-safe (it carries
 * any in-progress edits onto the new residence), and a plain `checkout dev` is
 * refused by git itself when local changes would be overwritten — surfacing as
 * git-error with git's own message rather than a guess of ours.
 */
export async function ensureDevBranch(projectDir: string): Promise<EnsureDevResult> {
  try {
    const current = await currentBranch(projectDir)
    if (current === DEV_BRANCH) {
      return { ok: true, reason: 'already-current', branch: DEV_BRANCH }
    }

    if (!(await branchExists(projectDir, DEV_BRANCH))) {
      if (await branchExists(projectDir, MAIN_BRANCH)) {
        // Base the new residence on main, even if it isn't the current branch.
        await git(projectDir, ['checkout', '-b', DEV_BRANCH, MAIN_BRANCH])
      } else {
        // No main → branch from the current position. Omit the start-point so
        // this also works on an UNBORN HEAD (fresh `git init`, zero commits):
        // `checkout -b dev HEAD` fails there (HEAD resolves to nothing — T-386
        // C6), but with no start-point git simply relabels the unborn branch to
        // dev, establishing residence before the first commit.
        await git(projectDir, ['checkout', '-b', DEV_BRANCH])
      }
      return { ok: true, reason: 'created', branch: DEV_BRANCH }
    }

    await git(projectDir, ['checkout', DEV_BRANCH])
    return { ok: true, reason: 'checked-out', branch: DEV_BRANCH }
  } catch (e) {
    return { ok: false, reason: 'git-error', detail: errMessage(e) }
  }
}

// ── promoteDevToMain — dev → main promotion (plain merge, meta-split premise) ────

export type PromoteReason =
  | 'promoted'
  | 'up-to-date'
  | 'dev-missing'
  | 'dirty'
  | 'merge-conflict'
  | 'git-error'

export interface PromoteOptions {
  /**
   * Merge strategy for dev→main. `no-ff` (default) records an explicit merge
   * commit so `main` history shows each promotion boundary; `ff-only` refuses
   * unless main can fast-forward. Never fabricates a squash — history stays honest.
   */
  strategy?: 'no-ff' | 'ff-only'
  /** Merge commit subject (no-ff only). Defaults to a conventional promote line. */
  message?: string
  /**
   * Return to `dev` (residence) after a successful promote. Default true — the
   * user works on dev, main is a transient checkout for the merge only.
   */
  returnToDev?: boolean
}

export type PromoteResult =
  | { ok: true; reason: 'promoted' | 'up-to-date'; mergedSha: string }
  | { ok: false; reason: Exclude<PromoteReason, 'promoted' | 'up-to-date'>; detail: string }

/**
 * Promote `dev` into `main` with a plain local merge, then (default) return to
 * dev. Does NOT push — main ships via the confirm-gated deploy step.
 *
 * Meta-split premise (T-323): the CODE repo carries no `docs/`, so this is an
 * ordinary merge — no docs-exclusion / mirror rewrite. Refuses on a dirty tree
 * or a merge conflict, aborting the conflicted merge so the repo is left clean.
 */
export async function promoteDevToMain(
  projectDir: string,
  opts: PromoteOptions = {},
): Promise<PromoteResult> {
  const strategy = opts.strategy ?? 'no-ff'
  const returnToDev = opts.returnToDev ?? true

  try {
    if (!(await branchExists(projectDir, DEV_BRANCH))) {
      return { ok: false, reason: 'dev-missing', detail: `No '${DEV_BRANCH}' branch to promote.` }
    }
    if (await isDirty(projectDir)) {
      return { ok: false, reason: 'dirty', detail: 'Working tree has uncommitted changes; commit them on dev before promoting.' }
    }

    // Already merged? (dev is an ancestor of main → nothing to promote.)
    if (await branchExists(projectDir, MAIN_BRANCH)) {
      try {
        await git(projectDir, ['merge-base', '--is-ancestor', DEV_BRANCH, MAIN_BRANCH])
        const sha = await git(projectDir, ['rev-parse', MAIN_BRANCH])
        return { ok: true, reason: 'up-to-date', mergedSha: sha }
      } catch {
        // not an ancestor → there is something to promote; fall through
      }
      await git(projectDir, ['checkout', MAIN_BRANCH])
    } else {
      // No main yet → create it at dev (first promotion of a fresh repo).
      await git(projectDir, ['checkout', '-b', MAIN_BRANCH, DEV_BRANCH])
      const sha = await git(projectDir, ['rev-parse', 'HEAD'])
      if (returnToDev) await git(projectDir, ['checkout', DEV_BRANCH])
      return { ok: true, reason: 'promoted', mergedSha: sha }
    }

    const mergeArgs =
      strategy === 'ff-only'
        ? ['merge', '--ff-only', DEV_BRANCH]
        : ['merge', '--no-ff', '-m', opts.message ?? `chore: promote ${DEV_BRANCH} → ${MAIN_BRANCH}`, DEV_BRANCH]

    try {
      await git(projectDir, mergeArgs)
    } catch (e) {
      // Leave the repo clean: abort a conflicted merge, restore residence.
      try {
        await git(projectDir, ['merge', '--abort'])
      } catch {
        /* nothing to abort (ff-only refusal) */
      }
      if (returnToDev) {
        try { await git(projectDir, ['checkout', DEV_BRANCH]) } catch { /* best-effort */ }
      }
      const detail = errMessage(e)
      const reason: PromoteReason =
        /conflict|automatic merge failed/i.test(detail) ? 'merge-conflict' : 'git-error'
      return { ok: false, reason, detail }
    }

    const sha = await git(projectDir, ['rev-parse', 'HEAD'])
    if (returnToDev) await git(projectDir, ['checkout', DEV_BRANCH])
    return { ok: true, reason: 'promoted', mergedSha: sha }
  } catch (e) {
    return { ok: false, reason: 'git-error', detail: errMessage(e) }
  }
}

// ── tagVersion — immutable v* release tag at version close ───────────────────────

export type TagReason = 'tagged' | 'exists' | 'invalid-version' | 'git-error'

export type TagResult =
  | { ok: true; reason: 'tagged'; tag: string; sha: string }
  | { ok: false; reason: Exclude<TagReason, 'tagged'>; detail: string; tag?: string }

export interface TagVersionOptions {
  /** Ref to tag. Default `HEAD`. Version close typically tags main after promote. */
  ref?: string
  /** Annotation message. Defaults to `Release <tag>`. */
  message?: string
}

/** Normalize a version string to a `v<N…>` tag name. Accepts `1.2`, `v1.2`. */
export function versionToTag(version: string): string | null {
  const trimmed = version.trim().replace(/^v/i, '')
  // A version tag is dot-separated numerics: 1, 1.2, 1.2.3.
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null
  return `v${trimmed}`
}

/**
 * Create an immutable annotated `v<version>` tag at version close.
 *
 * Immutable = refuses if the tag already exists (never moves a released tag).
 * Local only — the tag ships on the next deploy, not here.
 */
export async function tagVersion(
  projectDir: string,
  version: string,
  opts: TagVersionOptions = {},
): Promise<TagResult> {
  const tag = versionToTag(version)
  if (!tag) {
    return { ok: false, reason: 'invalid-version', detail: `Not a valid version: '${version}' (expected e.g. 1.2 or v1.2).` }
  }

  try {
    const existing = await git(projectDir, ['tag', '--list', tag])
    if (existing === tag) {
      return { ok: false, reason: 'exists', detail: `Tag ${tag} already exists — release tags are immutable.`, tag }
    }

    const ref = opts.ref ?? 'HEAD'
    const message = opts.message ?? `Release ${tag}`
    await git(projectDir, ['tag', '-a', tag, '-m', message, ref])
    const sha = await git(projectDir, ['rev-list', '-n', '1', tag])
    return { ok: true, reason: 'tagged', tag, sha }
  } catch (e) {
    return { ok: false, reason: 'git-error', detail: errMessage(e), tag }
  }
}

// ── Convenience: is a project already on the canonical residence? ────────────────

/**
 * True when the project both has `dev` and is currently on it — the steady state
 * the canonical model expects during daily work. Uses git-rules only to decide
 * whether the residence model applies at all (useDevBranch).
 */
export async function isOnResidence(projectDir: string): Promise<boolean> {
  const rules = readGitRules(projectDir).merged
  if (!rules.useDevBranch) return false
  return (await currentBranch(projectDir)) === DEV_BRANCH
}
