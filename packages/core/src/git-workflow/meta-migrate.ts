/**
 * meta-migrate.ts — existing-project meta-split migration (T-366, PRD §v1.2
 * 경계 결정 4, 공통 마이그레이션 절차).
 *
 * Takes a MIXED repo (code + meta both tracked by `.git`) to the split state:
 *   ① init `.prdt/meta.git` (T-364 initMetaRepo — reused, not reimplemented)
 *   ② first meta snapshot commit (T-364 commitMeta; also resyncs the T-365
 *      `.gitignore` managed block as its built-in beat)
 *   ③ code repo `git rm -r --cached` over the allowlist + commit the removal
 *      together with the managed block — tracking removal ONLY
 *   ④ verify both sides via `git ls-files`
 *
 * Auto / confirm boundary (§10 git abstraction, contract "no force-push /
 * destructive git without explicit user instruction"):
 *  - runMetaMigration NEVER runs on prdt's own initiative — it is reached only
 *    from an explicit user action (CLI `prdt meta split` after a y/N prompt,
 *    GUI settings button after an in-app confirm). That explicit action is the
 *    user instruction; the plan (file count, "1 commit will land on the code
 *    repo") is shown BEFORE confirmation by both surfaces.
 *  - Within a confirmed run the tracking-removal commit is created
 *    automatically: it is non-destructive (no history rewrite, no force-push,
 *    work-tree untouched), and leaving it half-staged would leak git state to
 *    a user who never touches git. Pushing is NEVER done here — origin only
 *    changes when the user's normal push/deploy flow next runs.
 *  - History rewrite (filter-repo/BFG) is out of scope by policy — explicit
 *    opt-in only, never automated (PRD 경계 결정 4 (b)).
 *
 * Refusals: `no-git` (unsupported per PRD Non-goals) · `already-split`
 * (re-run is a no-op) · `staged-changes` (a pre-staged user change would be
 * swept into the migration commit — ask the user to land/unstage it first).
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  initMetaRepo,
  commitMeta,
  metaGitDir,
  metaRepoExists,
  readMetaAllowlist,
} from './meta-git'

const execFileAsync = promisify(execFile)

/** Subject of the meta repo's first commit (mirrors python `prdt init`'s wording). */
export const MIGRATION_SNAPSHOT_MESSAGE = 'initial meta snapshot (prdt migrate)'

/** Subject of the code repo's tracking-removal commit. */
export const MIGRATION_UNTRACK_MESSAGE =
  'chore(prdt): split prdt meta out of code tracking (rm --cached only, history preserved)'

export type MetaMigrationRefusal = 'no-git' | 'already-split' | 'staged-changes'

export interface MetaMigrationPlan {
  status: 'eligible' | MetaMigrationRefusal
  /** Code-repo tracked files the migration will untrack (empty on refusal). */
  trackedMetaFiles: string[]
  allowlist: string[]
  /** True when `.prdt/meta.git` already exists (resuming a partial migration). */
  resuming: boolean
}

export interface MetaMigrationResult {
  ok: boolean
  refusal?: MetaMigrationRefusal
  /** Meta repo HEAD after the snapshot commit (① ②). */
  snapshotSha?: string
  /** Code repo tracking-removal commit (③). */
  untrackCommitSha?: string
  /** Files removed from the code repo's index. */
  untrackedCount: number
  /** ④ — code ls-files meta-free AND meta ls-files ⊆ allowlist AND non-empty. */
  verified: boolean
  codeTrackedMetaCount: number
  metaTrackedCount: number
  error?: string
}

/**
 * Env with every GIT_* variable stripped — same guarantee as meta-git.ts's
 * scrubbedGitEnv (T-364 QA-HIGH: ambient GIT_INDEX_FILE etc. inside a hook
 * would redirect our git calls at the wrong index). Local copy: that helper is
 * deliberately private and meta-git.ts is under concurrent edit (T-367).
 */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_')) env[k] = v
  }
  return env
}

/** Run git against the CODE repo (`<projectDir>/.git`). */
async function codeGit(projectDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', projectDir, ...args], {
    timeout: 30_000,
    env: scrubbedEnv(),
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

/** Run git against the META repo (separate git-dir, project root work-tree). */
async function metaGit(projectDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['--git-dir', metaGitDir(projectDir), '--work-tree', projectDir, ...args],
    { cwd: projectDir, timeout: 30_000, env: scrubbedEnv(), maxBuffer: 16 * 1024 * 1024 },
  )
  return stdout
}

/** Code repo exists? (`.git` dir, or file for worktrees/submodules.) */
function codeRepoExists(projectDir: string): boolean {
  try {
    return fs.existsSync(path.join(projectDir, '.git'))
  } catch {
    return false
  }
}

/** Files tracked by the CODE repo under the allowlist (NUL-safe). */
async function codeTrackedMetaFiles(projectDir: string, allowlist: string[]): Promise<string[]> {
  if (allowlist.length === 0) return []
  const out = await codeGit(projectDir, ['ls-files', '-z', '--', ...allowlist])
  return out.split('\0').filter(Boolean)
}

/**
 * True when the code repo's INDEX carries staged changes. Read via
 * `status --porcelain -z` (works on a repo with no HEAD yet, unlike
 * `diff --cached`): first status letter ∉ {' ', '?'} = staged.
 */
async function hasStagedChanges(projectDir: string): Promise<boolean> {
  const out = await codeGit(projectDir, ['status', '--porcelain', '-z'])
  for (const entry of out.split('\0')) {
    if (entry.length >= 2 && entry[0] !== ' ' && entry[0] !== '?') return true
  }
  return false
}

/**
 * Inspect the project and classify it for migration. Read-only — safe to call
 * from any surface at render time.
 */
export async function planMetaMigration(projectDir: string): Promise<MetaMigrationPlan> {
  const allowlist = readMetaAllowlist(projectDir)
  const base: MetaMigrationPlan = {
    status: 'eligible',
    trackedMetaFiles: [],
    allowlist,
    resuming: metaRepoExists(projectDir),
  }

  if (!codeRepoExists(projectDir)) return { ...base, status: 'no-git', resuming: false }

  let tracked: string[]
  try {
    tracked = await codeTrackedMetaFiles(projectDir, allowlist)
  } catch (err) {
    // an unreadable code repo is as unsupported as a missing one
    return { ...base, status: 'no-git' }
  }

  // Already split = meta repo present AND the code repo tracks no meta.
  // (meta repo present + meta still tracked = a partial/crashed migration →
  // eligible again, idempotent resume.)
  if (base.resuming && tracked.length === 0) return { ...base, status: 'already-split' }

  if (await hasStagedChanges(projectDir)) {
    return { ...base, status: 'staged-changes', trackedMetaFiles: tracked }
  }

  return { ...base, trackedMetaFiles: tracked }
}

/**
 * Execute the confirmed migration (①→④). Refuses (without touching anything)
 * unless planMetaMigration says `eligible` — callers MUST have shown the plan
 * and obtained explicit confirmation first (see module header). Never pushes,
 * never rewrites history, never touches work-tree file contents.
 */
export async function runMetaMigration(projectDir: string): Promise<MetaMigrationResult> {
  const fail = (partial: Partial<MetaMigrationResult>): MetaMigrationResult => ({
    ok: false,
    untrackedCount: 0,
    verified: false,
    codeTrackedMetaCount: -1,
    metaTrackedCount: -1,
    ...partial,
  })

  const plan = await planMetaMigration(projectDir)
  if (plan.status !== 'eligible') return fail({ refusal: plan.status })

  // ① meta repo init (idempotent — also the resume path)
  const init = await initMetaRepo(projectDir)
  if (!init.initialized) return fail({ error: `meta repo init failed: ${init.error}` })

  // ② first snapshot commit. commitMeta also resyncs the .gitignore managed
  // block (T-365 built-in beat) and stages ignore-immune. diff-empty /
  // nothing-allowlisted are acceptable here (resume after a completed ②,
  // or a project whose meta exists only in git history).
  const snapshot = await commitMeta(projectDir, MIGRATION_SNAPSHOT_MESSAGE)
  if (!snapshot.committed && snapshot.skipReason === 'manager-error') {
    return fail({ error: `meta snapshot failed: ${snapshot.detail}` })
  }
  let snapshotSha = snapshot.sha
  if (!snapshotSha) {
    try {
      snapshotSha = (await metaGit(projectDir, ['rev-parse', 'HEAD'])).trim()
    } catch {
      /* empty meta repo — verification below reports it */
    }
  }

  // ③ code repo: stage the managed block + drop meta from the index.
  //    rm --cached only — work-tree contents and history stay untouched.
  try {
    if (fs.existsSync(path.join(projectDir, '.gitignore'))) {
      await codeGit(projectDir, ['add', '--', '.gitignore'])
    }
    if (plan.trackedMetaFiles.length > 0) {
      await codeGit(projectDir, [
        'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...plan.allowlist,
      ])
    }
  } catch (err) {
    return fail({
      error: `tracking removal failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  let untrackCommitSha: string | undefined
  try {
    // commit only when something is actually staged (idempotent resume)
    await codeGit(projectDir, ['diff', '--cached', '--quiet'])
  } catch {
    try {
      await codeGit(projectDir, ['commit', '-m', MIGRATION_UNTRACK_MESSAGE])
      untrackCommitSha = (await codeGit(projectDir, ['rev-parse', 'HEAD'])).trim()
    } catch (err) {
      return fail({
        error: `tracking-removal commit failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ④ verify both sides
  let codeTrackedMetaCount = -1
  let metaTrackedCount = -1
  let metaOutsideAllowlist = 0
  try {
    codeTrackedMetaCount = (await codeTrackedMetaFiles(projectDir, plan.allowlist)).length
    const metaFiles = (await metaGit(projectDir, ['ls-files', '-z'])).split('\0').filter(Boolean)
    metaTrackedCount = metaFiles.length
    const inAllowlist = (f: string) =>
      plan.allowlist.some((e) => f === e || f.startsWith(e.replace(/\/+$/, '') + '/'))
    metaOutsideAllowlist = metaFiles.filter((f) => !inAllowlist(f)).length
  } catch (err) {
    return fail({
      snapshotSha,
      untrackCommitSha,
      untrackedCount: plan.trackedMetaFiles.length,
      error: `verification failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const verified =
    codeTrackedMetaCount === 0 && metaTrackedCount > 0 && metaOutsideAllowlist === 0

  return {
    ok: verified,
    snapshotSha,
    untrackCommitSha,
    untrackedCount: plan.trackedMetaFiles.length,
    verified,
    codeTrackedMetaCount,
    metaTrackedCount,
    error: verified
      ? undefined
      : `verification mismatch: code still tracks ${codeTrackedMetaCount} meta file(s), ` +
        `meta tracks ${metaTrackedCount} (outside allowlist: ${metaOutsideAllowlist})`,
  }
}
