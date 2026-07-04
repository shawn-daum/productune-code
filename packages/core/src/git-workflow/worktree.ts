import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readGitRules } from './rules'
import { buildBranchName, resolveBranchConflict } from './branchNamer'
import { stateDir, STATE_DIR_NAME, detectProjectKind } from '../state/project-kind'

const execFileAsync = promisify(execFile)

export type WorktreeErrorReason =
  | 'base-dirty'
  | 'branch-exists'
  | 'hook-not-installed'
  | 'git-error'

export type WorktreeCreateResult =
  | { ok: true; worktreePath: string; branchName: string }
  | { ok: false; reason: WorktreeErrorReason; detail: string }

export interface CreateWorktreeArgs {
  projectDir: string
  ticketId: string
  slug: string
  type: 'feature' | 'fix'
}

function worktreeDir(projectDir: string, ticketId: string): string {
  return path.join(stateDir(projectDir), 'worktrees', ticketId)
}

async function isBaseDirty(projectDir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: projectDir })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function fetchBase(projectDir: string, baseBranch: string): Promise<void> {
  try {
    await execFileAsync('git', ['fetch', 'origin', baseBranch], {
      cwd: projectDir,
      timeout: 15_000,
    })
  } catch {
    // OQ-T020-4: silent fallback on offline / rate-limit
  }
}

async function ensureGitignoreEntry(projectDir: string): Promise<void> {
  const gitignorePath = path.join(projectDir, '.gitignore')
  const entry = `${STATE_DIR_NAME[detectProjectKind(projectDir)]}/worktrees/`
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8')
      if (content.includes(entry)) return
      fs.appendFileSync(gitignorePath, `\n${entry}\n`)
    } else {
      fs.writeFileSync(gitignorePath, `${entry}\n`)
    }
  } catch {
    // non-fatal
  }
}

export async function createWorktree(args: CreateWorktreeArgs): Promise<WorktreeCreateResult> {
  const { projectDir, ticketId, slug, type } = args

  // idempotent: if worktree directory already exists, return existing info
  const wtPath = worktreeDir(projectDir, ticketId)
  if (fs.existsSync(wtPath)) {
    // read branch from existing worktree
    try {
      const headPath = path.join(wtPath, '.git')
      // .git is a file (gitdir pointer) in a worktree
      if (fs.existsSync(headPath)) {
        const gitfileContent = fs.readFileSync(headPath, 'utf-8')
        const gitdirMatch = gitfileContent.match(/^gitdir:\s*(.+)$/m)
        if (gitdirMatch) {
          const gitdir = gitdirMatch[1].trim()
          const headFile = path.join(path.isAbsolute(gitdir) ? gitdir : path.join(wtPath, gitdir), 'HEAD')
          if (fs.existsSync(headFile)) {
            const head = fs.readFileSync(headFile, 'utf-8').trim()
            const branchMatch = head.match(/^ref: refs\/heads\/(.+)$/)
            if (branchMatch) {
              return { ok: true, worktreePath: wtPath, branchName: branchMatch[1] }
            }
          }
        }
      }
    } catch {
      // fall through — return path with unknown branch
    }
    return { ok: true, worktreePath: wtPath, branchName: `feature/${ticketId}/${slug}` }
  }

  const rules = readGitRules(projectDir).merged
  const baseBranch = rules.protectedBranches[0] ?? 'main'

  // OQ-T020-2: base dirty → return error so renderer can show modal
  if (await isBaseDirty(projectDir)) {
    return { ok: false, reason: 'base-dirty', detail: 'Base branch has uncommitted changes.' }
  }

  // OQ-T020-4: pre-emptive fetch
  await fetchBase(projectDir, baseBranch)

  const baseName = buildBranchName({
    ticketId,
    slug,
    type,
    prefixes: { feature: rules.featureBranchPrefix, fix: rules.fixBranchPrefix },
  })

  const branchName = await resolveBranchConflict(projectDir, baseName)

  // ensure <state-dir>/worktrees/ exists
  fs.mkdirSync(path.join(stateDir(projectDir), 'worktrees'), { recursive: true })

  await ensureGitignoreEntry(projectDir)

  try {
    await execFileAsync(
      'git',
      ['worktree', 'add', '-b', branchName, wtPath, baseBranch],
      { cwd: projectDir },
    )
  } catch (e: any) {
    return { ok: false, reason: 'git-error', detail: e?.message ?? 'git worktree add failed' }
  }

  return { ok: true, worktreePath: wtPath, branchName }
}

export async function worktreeExists(projectDir: string, ticketId: string): Promise<boolean> {
  return fs.existsSync(worktreeDir(projectDir, ticketId))
}

/**
 * stashAndCreate — git stash -u (OQ-T092-1 option b) → createWorktree retry.
 * Atomic: on worktree creation failure after a successful stash, pops the stash
 * to restore user's changes.
 */
export async function stashAndCreate(args: CreateWorktreeArgs): Promise<WorktreeCreateResult> {
  const { projectDir } = args

  // stash -u: include untracked files (designer recommendation OQ-T092-1 b)
  try {
    await execFileAsync('git', ['stash', '-u'], { cwd: projectDir })
  } catch (e: any) {
    return { ok: false, reason: 'git-error', detail: `stash failed: ${e?.message ?? 'git stash -u failed'}` }
  }

  const result = await createWorktree(args)

  if (!result.ok) {
    // Atomic guarantee: pop stash if worktree creation failed
    try {
      await execFileAsync('git', ['stash', 'pop'], { cwd: projectDir })
    } catch {
      // best-effort restore; non-fatal
    }
    // Re-map reason to 'git-error' with stash context if it wasn't base-dirty
    return result
  }

  return result
}

/**
 * commitAndCreate — git add -A + git commit (OQ-T092-2 option a auto message)
 * → createWorktree retry.
 */
export async function commitAndCreate(
  args: CreateWorktreeArgs & { message?: string },
): Promise<WorktreeCreateResult> {
  const { projectDir, ticketId, slug } = args
  const commitMsg = args.message ?? `chore(base): save before ${ticketId} ${slug}`

  try {
    await execFileAsync('git', ['add', '-A'], { cwd: projectDir })
    await execFileAsync('git', ['commit', '-m', commitMsg], { cwd: projectDir })
  } catch (e: any) {
    return { ok: false, reason: 'git-error', detail: `commit failed: ${e?.message ?? 'git commit failed'}` }
  }

  return createWorktree(args)
}

export async function worktreeCleanup(
  _projectDir: string,
  _ticketId: string,
): Promise<{ ok: boolean; reason?: string }> {
  // Phase 5 placeholder
  return { ok: false, reason: 'Phase 5 lock — not implemented' }
}
