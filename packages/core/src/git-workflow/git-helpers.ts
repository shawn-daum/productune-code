/**
 * git-helpers.ts — shared CODE-repo git primitives for the git-workflow modules
 * (T-387 reuse).
 *
 * promote.ts and worktree.ts had each grown their own byte-identical copies of
 * "run git at codeRoot", "does this local branch exist", "what branch am I on",
 * and "fold a child_process error's stdout+stderr into one searchable string".
 * They live here once. Every op still anchors at codeRoot (PRD §v1.3 설계 결정 4):
 * in a split project the code `.git` sits under `<projectRoot>/<code.dir>`, not
 * the meta projectRoot — confusing the two is `fatal: not a git repository`.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { codeRoot } from '../state/project-kind'

const execFileAsync = promisify(execFile)

/**
 * Default ceiling for a local code-repo git call (was promote.ts's inline 30s).
 * Local ref ops are instant, so this never fires in practice — it only guards
 * against a hung git. Callers with a network op pass their own timeout.
 */
export const CODE_GIT_TIMEOUT_MS = 30_000

/**
 * Run a git command in the CODE repo (cwd = codeRoot) and return trimmed stdout.
 */
export async function codeGit(
  projectDir: string,
  args: string[],
  opts: { timeout?: number } = {},
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: codeRoot(projectDir),
    timeout: opts.timeout ?? CODE_GIT_TIMEOUT_MS,
  })
  return stdout.trim()
}

/** True when a local branch ref exists. Best-effort: never throws. */
export async function branchExists(projectDir: string, branch: string): Promise<boolean> {
  try {
    await codeGit(projectDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    return true
  } catch {
    return false
  }
}

/** The checked-out branch name, or null on a detached HEAD / error. */
export async function currentBranch(projectDir: string): Promise<string | null> {
  try {
    const name = await codeGit(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    return name === 'HEAD' ? null : name
  } catch {
    return null
  }
}

/**
 * Flatten a child_process error into a single searchable string. git writes
 * conflict / failure detail to stdout+stderr, NOT into Error.message (which is
 * just "Command failed: git …"), so both must be folded in.
 */
export function errMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyErr = e as { message?: string; stdout?: unknown; stderr?: unknown }
    const parts = [anyErr.message, anyErr.stdout, anyErr.stderr]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (parts.length) return parts.join('\n')
  }
  return e instanceof Error ? e.message : String(e)
}
