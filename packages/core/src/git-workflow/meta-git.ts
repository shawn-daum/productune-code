/**
 * meta-git.ts — meta-only local git core module (T-364, PRD §v1.2).
 *
 * Two git repos share one working tree. The CODE repo (`.git`) tracks
 * everything except the meta allowlist; the META repo lives in a separate
 * git-dir (`<stateDir>/meta.git`) with the project root as its work-tree and
 * tracks ONLY the allowlist (PRD 경계 결정 1). Because the two repos have
 * distinct git-dirs, a meta commit never touches the code repo's index or
 * history, and an allowlist-scoped `git add` never stages code files.
 *
 * This module is the shared core primitive for CLI · GUI parity — init,
 * allowlist-scoped auto-commit (reusing the §10 autosave lifecycle signals),
 * history read, and opt-in remote add. It never pushes (backup is manual /
 * opt-in per PRD Non-goals) and performs no destructive git.
 *
 * Out of scope here (downstream tickets): the code repo `.gitignore` managed
 * block (T-365), existing-project migration (T-366), and CLI/GUI surfaces
 * (T-367) — all consume the API exposed here.
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { stateDir } from '../state/project-kind'
import { parseLogOutput, type HistoryEntry } from './history'
import { syncGitignoreManagedBlock } from './gitignore-managed-block'

const execFileAsync = promisify(execFile)

// ── Defaults ────────────────────────────────────────────────────────────────

/**
 * Default meta allowlist — the paths prdt authors (PRD 경계 결정 1).
 * Everything else (incl. user-authored files) is code. Stored per-project in
 * `<stateDir>/config.json` under `meta.allowlist`; editable via
 * writeMetaAllowlist so a project can add loose meta files.
 */
export const DEFAULT_META_ALLOWLIST: string[] = [
  '.prdt',
  '.productune',
  'briefs',
  'docs/prd',
  'docs/tickets',
  'docs/wiki',
  'docs/designer',
  'docs/developer',
  'docs/po',
  'docs/qa',
  'docs/artifacts',
  'docs/retrospectives',
  'docs/archive',
]

/**
 * Derived/gate artifacts that must never enter the meta repo even though they
 * live under an allowlisted dir (PRD: index.db · turns.jsonl · sessions.json ·
 * gate caches are gitignored on both sides; the meta git-dir ignores itself).
 * Written to the meta repo's `info/exclude` at init (gitignore syntax, matched
 * by basename anywhere in the tree).
 */
export const DEFAULT_META_EXCLUDE: string[] = [
  'meta.git/',
  'index.db',
  'turns.jsonl',
  'sessions.json',
  '.cost-*.json',
  '.subagent-gate.json',
]

const META_GIT_IDENTITY = { name: 'prdt', email: 'prdt@localhost' }

// ── Paths ─────────────────────────────────────────────────────────────────────

/** Absolute path to the meta repo git-dir (`<stateDir>/meta.git`). */
export function metaGitDir(projectDir: string): string {
  return path.join(stateDir(projectDir), 'meta.git')
}

/** True if the meta repo has been initialized. */
export function metaRepoExists(projectDir: string): boolean {
  try {
    return fs.existsSync(path.join(metaGitDir(projectDir), 'HEAD'))
  } catch {
    return false
  }
}

// ── git invocation ──────────────────────────────────────────────────────────

/**
 * Env with every `GIT_*` variable stripped (T-364 QA-HIGH).
 *
 * A meta git subprocess must NOT inherit an ambient git operation's
 * redirection env. Inside a git hook / lint-staged run the parent sets
 * GIT_INDEX_FILE / GIT_DIR / GIT_WORK_TREE / GIT_OBJECT_DIRECTORY /
 * GIT_COMMON_DIR pointing at the CODE repo. The `--git-dir`/`--work-tree`
 * flags override GIT_DIR/GIT_WORK_TREE, but NOT GIT_INDEX_FILE or the object
 * dirs — so meta's `git add` would stage into the code repo's index against
 * meta's odb, corrupting the code index and failing the meta commit. Scrubbing
 * all GIT_* is the robust guarantee (the meta repo needs none of them — it
 * carries its own repo-local identity and config).
 */
function scrubbedGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_')) continue
    env[k] = v
  }
  return env
}

/** Run a git command scoped to the meta repo (git-dir + work-tree). */
async function metaGit(
  projectDir: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const gitDir = metaGitDir(projectDir)
  return execFileAsync(
    'git',
    ['--git-dir', gitDir, '--work-tree', projectDir, ...args],
    { cwd: projectDir, timeout: 10_000, env: scrubbedGitEnv() },
  )
}

// ── Allowlist config (persisted in <stateDir>/config.json) ────────────────────

function configPath(projectDir: string): string {
  return path.join(stateDir(projectDir), 'config.json')
}

function readConfig(projectDir: string): Record<string, any> {
  try {
    const raw = fs.readFileSync(configPath(projectDir), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // missing / corrupt → empty
  }
  return {}
}

/**
 * The project's meta allowlist. Reads `meta.allowlist` from config.json,
 * falling back to DEFAULT_META_ALLOWLIST when unset.
 */
export function readMetaAllowlist(projectDir: string): string[] {
  const cfg = readConfig(projectDir)
  const list = cfg?.meta?.allowlist
  if (Array.isArray(list) && list.every((e) => typeof e === 'string')) {
    return list
  }
  return [...DEFAULT_META_ALLOWLIST]
}

/**
 * Persist the meta allowlist into config.json (atomic tmp+rename), preserving
 * all other config fields (slug, created_at, surfaces, …).
 */
export function writeMetaAllowlist(projectDir: string, allowlist: string[]): void {
  const cfg = readConfig(projectDir)
  const meta = (cfg.meta && typeof cfg.meta === 'object') ? cfg.meta : {}
  cfg.meta = { ...meta, allowlist }

  const fp = configPath(projectDir)
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  const tmp = fp + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, fp)
}

// ── Init ──────────────────────────────────────────────────────────────────────

export interface MetaInitResult {
  /** True if init ran; false only on error. */
  initialized: boolean
  gitDir: string
  /** True when the repo already existed (init is a no-op refresh of config/exclude). */
  alreadyExisted: boolean
  error?: string
}

/**
 * Initialize the meta repo at `<stateDir>/meta.git` with the project root as
 * its work-tree. Idempotent: re-running on an existing repo refreshes the
 * repo-local config (identity, worktree) and the info/exclude list without
 * touching history. Never adds a remote and never commits.
 */
export async function initMetaRepo(projectDir: string): Promise<MetaInitResult> {
  const gitDir = metaGitDir(projectDir)
  const alreadyExisted = metaRepoExists(projectDir)

  try {
    const env = scrubbedGitEnv()
    if (!alreadyExisted) {
      fs.mkdirSync(path.dirname(gitDir), { recursive: true })
      await execFileAsync('git', ['init', '--bare', gitDir], { timeout: 10_000, env })
    }

    // Two-git/one-worktree config — non-bare with an explicit work-tree so all
    // meta commands operate on the project root. Idempotent (re-run repropagates
    // to an existing repo).
    const setConfig = async (key: string, value: string) =>
      execFileAsync('git', ['--git-dir', gitDir, 'config', key, value], { timeout: 10_000, env })
    await setConfig('core.bare', 'false')
    await setConfig('core.worktree', projectDir)
    await setConfig('user.name', META_GIT_IDENTITY.name)
    await setConfig('user.email', META_GIT_IDENTITY.email)
    // Neutralize a user's global git config on the meta repo (T-364 QA-MED):
    //  - commit.gpgsign=true would make every meta auto-commit fail silently
    //    (signing a synthetic identity is meaningless anyway).
    //  - a global core.hooksPath (husky/lint-staged) would run the user's code
    //    hooks on every meta commit. Pin it to the meta repo's own empty hooks
    //    dir so local wins over global.
    await setConfig('commit.gpgsign', 'false')
    await setConfig('core.hooksPath', path.join(gitDir, 'hooks'))

    // Derived/gate artifacts excluded from tracking even under allowlisted dirs.
    const excludePath = path.join(gitDir, 'info', 'exclude')
    fs.mkdirSync(path.dirname(excludePath), { recursive: true })
    fs.writeFileSync(excludePath, DEFAULT_META_EXCLUDE.join('\n') + '\n')

    return { initialized: true, gitDir, alreadyExisted }
  } catch (err) {
    return {
      initialized: false,
      gitDir,
      alreadyExisted,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Commit ────────────────────────────────────────────────────────────────────

export type MetaCommitSkipReason =
  | 'diff-empty'
  | 'meta-repo-missing'
  | 'nothing-allowlisted'
  | 'manager-error'

export interface MetaCommitResult {
  committed: boolean
  /** Present when committed. */
  sha?: string
  skipReason?: MetaCommitSkipReason
  detail?: string
}

/** Allowlist entries that currently exist on disk (git add rejects unmatched pathspecs). */
function existingAllowlistPaths(projectDir: string, allowlist: string[]): string[] {
  return allowlist.filter((entry) => {
    try {
      return fs.existsSync(path.join(projectDir, entry))
    } catch {
      return false
    }
  })
}

/**
 * Files to stage for one meta commit: allowlist-scoped adds, edits, deletions.
 *
 * Staging must be immune to the CODE repo's `.gitignore` (T-365): its managed
 * block ignores every meta path, and the meta repo shares the work-tree — so a
 * plain `git add -A -- <allowlist>` refuses the whole allowlist ("paths are
 * ignored by one of your .gitignore files", exit 1). Instead:
 *  - tracked changes (`ls-files --modified --deleted`) — ignore rules never
 *    apply to tracked files;
 *  - new files (`ls-files --others --exclude-from=<meta info/exclude>`) —
 *    honoring ONLY the meta repo's own derived-artifact excludes, never the
 *    code repo's `.gitignore`.
 * The combined set is then staged with `add -f` (deleted paths stage the
 * removal). `-z` keeps non-ASCII paths unquoted.
 */
async function collectStageableFiles(
  projectDir: string,
  paths: string[],
): Promise<string[]> {
  const listZ = async (flags: string[]): Promise<string[]> => {
    const { stdout } = await metaGit(projectDir, ['ls-files', '-z', ...flags, '--', ...paths])
    return stdout.split('\0').filter(Boolean)
  }

  const tracked = await listZ(['--modified', '--deleted'])

  const excludeFile = path.join(metaGitDir(projectDir), 'info', 'exclude')
  const othersFlags = ['--others']
  if (fs.existsSync(excludeFile)) othersFlags.push('--exclude-from', excludeFile)
  const others = await listZ(othersFlags)

  return [...new Set([...tracked, ...others])]
}

/**
 * Stage the allowlist and commit one logical meta change.
 *
 * - Stages ONLY the allowlist (via collectStageableFiles) — code files can
 *   never enter the meta repo, and the code repo's `.gitignore` managed block
 *   can never block meta staging.
 * - Captures adds, edits, and deletions over existing allowlisted dirs.
 * - Empty staged diff → skip (`diff-empty`), matching the §10 autosave contract.
 * - `message` should be built via buildAutosaveMessage so history stays
 *   naturalize-parseable.
 */
export async function commitMeta(
  projectDir: string,
  message: string,
): Promise<MetaCommitResult> {
  if (!metaRepoExists(projectDir)) {
    return { committed: false, skipReason: 'meta-repo-missing' }
  }

  const allowlist = readMetaAllowlist(projectDir)

  // T-365 (경계 결정 3): the meta turn beat doubles as the `.gitignore`
  // managed-block resync beat — an allowlist edit in config.json propagates to
  // the code repo's ignore block on the next logical meta change. Best-effort:
  // a sync failure must never block the meta commit.
  try {
    syncGitignoreManagedBlock(projectDir, allowlist)
  } catch {
    /* best-effort */
  }

  const paths = existingAllowlistPaths(projectDir, allowlist)
  if (paths.length === 0) {
    return { committed: false, skipReason: 'nothing-allowlisted' }
  }

  try {
    const files = await collectStageableFiles(projectDir, paths)
    if (files.length > 0) {
      await metaGit(projectDir, ['add', '-f', '--', ...files])
    }
  } catch (err) {
    return {
      committed: false,
      skipReason: 'manager-error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  // Empty staged diff → nothing to commit (diff-empty skip).
  try {
    await metaGit(projectDir, ['diff', '--cached', '--quiet'])
    // exit 0 → no staged changes
    return { committed: false, skipReason: 'diff-empty' }
  } catch {
    // non-zero exit → staged changes present, proceed to commit
  }

  try {
    await metaGit(projectDir, ['commit', '-m', message, '--allow-empty-message'])
    const { stdout } = await metaGit(projectDir, ['rev-parse', 'HEAD'])
    return { committed: true, sha: stdout.trim() }
  } catch (err) {
    return {
      committed: false,
      skipReason: 'manager-error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── History read ────────────────────────────────────────────────────────────

/**
 * Read the meta commit timeline (newest-first). Reuses parseLogOutput so the
 * shape matches scanGitHistory; groupByTicket applies unchanged. Graceful
 * fallback to [] on a missing repo or git error.
 */
export async function scanMetaHistory(
  projectDir: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<HistoryEntry[]> {
  if (!metaRepoExists(projectDir)) return []

  const args = ['log', '--format=%H|%s|%ai']
  if (opts.since) args.push(`--after=${opts.since.toISOString()}`)
  args.push('-n', String(opts.limit ?? 200))

  try {
    const { stdout } = await metaGit(projectDir, args)
    return parseLogOutput(stdout)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Non-fatal — repo may have no commits yet (`log` errors on empty HEAD).
    console.warn('[meta-git] scanMetaHistory: git log failed —', msg)
    return []
  }
}

// ── Remote (opt-in backup; add only, never push) ──────────────────────────────

export interface MetaRemote {
  name: string
  url: string
}

export interface MetaRemoteResult {
  ok: boolean
  error?: string
}

/**
 * Add (or update) a backup remote on the meta repo. Opt-in only — this never
 * pushes; the user pushes manually (PRD: no auto-push, no bidirectional sync).
 */
export async function addMetaRemote(
  projectDir: string,
  name: string,
  url: string,
): Promise<MetaRemoteResult> {
  if (!metaRepoExists(projectDir)) {
    return { ok: false, error: 'meta repo not initialized' }
  }
  try {
    const existing = await listMetaRemotes(projectDir)
    if (existing.some((r) => r.name === name)) {
      await metaGit(projectDir, ['remote', 'set-url', name, url])
    } else {
      await metaGit(projectDir, ['remote', 'add', name, url])
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** List configured meta remotes. */
export async function listMetaRemotes(projectDir: string): Promise<MetaRemote[]> {
  if (!metaRepoExists(projectDir)) return []
  try {
    const { stdout } = await metaGit(projectDir, ['remote', '-v'])
    const seen = new Map<string, string>()
    for (const raw of stdout.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      // Format: "<name>\t<url> (fetch|push)"
      const m = /^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/.exec(line)
      if (m) seen.set(m[1], m[2])
    }
    return [...seen].map(([name, url]) => ({ name, url }))
  } catch {
    return []
  }
}
