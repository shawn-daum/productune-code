/**
 * meta-git.ts — meta-only local git core module (T-364, PRD §v1.2).
 *
 * The META repo lives in a separate git-dir (`<stateDir>/meta.git`) with the
 * PROJECT ROOT as its work-tree and tracks ONLY the allowlist (PRD 경계 결정 1);
 * the CODE repo (`.git`, at codeRoot — projectRoot in legacy layout, or
 * `<projectRoot>/<code.dir>` once physically split, PRD §v1.3) tracks everything
 * else. Meta git ops here always anchor at projectRoot; code detection anchors
 * at codeRoot (resolved via state/project-kind).
 *
 * v1.3 physical split (설계 결정 2): the code `.gitignore` managed block is GONE
 * — once code lives under `code/`, the meta work-tree no longer contains a code
 * `.gitignore` that ignores meta paths, so meta commits stage with a plain
 * `git add`. In LEGACY layout (not yet split) the code `.gitignore` still sits
 * at the project root, so meta staging stays ignore-immune (collectStageableFiles).
 *
 * This module is the shared core primitive for CLI · GUI parity — init,
 * allowlist-scoped auto-commit (reusing the §10 autosave lifecycle signals),
 * history read, and opt-in remote add. It never pushes (backup is manual /
 * opt-in per PRD Non-goals) and performs no destructive git.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  stateDir,
  STATE_DIR_NAME,
  codeRoot,
  codeDirName,
  isPhysicallySplit,
  CODE_DIR_DEFAULT,
  type ProjectKind,
} from '../state/project-kind'
import { parseLogOutput, type HistoryEntry } from './history'

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
 * by basename anywhere in the tree). The physical code dir (`<code.dir>/`) is
 * appended per-project at init when the project is split (PRD §v1.3 설계 결정 3)
 * so the code tree never shows up in the meta `git status`.
 */
export const DEFAULT_META_EXCLUDE: string[] = [
  'meta.git/',
  'index.db',
  'turns.jsonl',
  'sessions.json',
  '.cost-*.json',
  '.subagent-gate.json',
  // Code worktree checkouts live under `<stateDir>/worktrees/` (meta area, outside
  // the code tree — T-378 decision). They are code checkouts, never meta history,
  // so the meta repo must not track them (matches at any depth; the only
  // `worktrees/` dir under an allowlisted path is the state dir's).
  'worktrees/',
]

const META_GIT_IDENTITY = { name: 'prdt', email: 'prdt@localhost' }

/**
 * Timeout for meta git calls that hit the NETWORK (fetch / push / remote
 * set-head). The default 10s is fine for the local index/commit ops that
 * dominate this module, but a fetch of a large backup or a push over a slow
 * line easily exceeds it — a fixed 10s there produces spurious SIGTERM
 * failures (T-386 C7; peekRemoteStateKind already uses 30s asymmetrically).
 */
const NETWORK_TIMEOUT_MS = 120_000

/**
 * Timeout for the one staging `git add` of a beat/first-snapshot (T-371 B3).
 * The default 10s is ample for an incremental beat, but the FIRST snapshot of a
 * large repo (thousands of files under docs/tickets) can walk long enough to be
 * spuriously SIGTERM'd at 10s — this is not a network op, just a big local index
 * write, so it gets its own generous ceiling. Normal-size repos never approach
 * it (staging completes in ms), so observable behavior is unchanged.
 */
const STAGE_TIMEOUT_MS = 120_000

/**
 * Max explicit path arguments per `git add -f` invocation (T-371 B3). The
 * legacy ignore-immune path enumerates every stageable file and passes them as
 * argv; a first snapshot of thousands of files would blow the OS ARG_MAX limit
 * ("Argument list too long") in one call. Staging in chunks builds the SAME
 * index as one call (git add accumulates), so a normal repo (< one chunk) is
 * byte-for-byte the single call it always was.
 */
const STAGE_CHUNK = 500

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
export function scrubbedGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_')) continue
    env[k] = v
  }
  return env
}

/**
 * Run a git command scoped to the meta repo (git-dir + work-tree). Local ops
 * use the default 10s timeout; network ops (fetch/push/set-head) MUST pass
 * `{ timeout: NETWORK_TIMEOUT_MS }` so a slow line isn't killed mid-transfer
 * (T-386 C7). `maxBuffer` defaults to Node's execFile default (1 MB); callers
 * that read large `ls-files`/`ls-tree` output pass their own (T-371 B1: the
 * single meta-repo git runner — meta-migrate.ts wraps this instead of keeping a
 * byte-identical copy).
 */
export async function metaGit(
  projectDir: string,
  args: string[],
  opts: { timeout?: number; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const gitDir = metaGitDir(projectDir)
  return execFileAsync(
    'git',
    ['--git-dir', gitDir, '--work-tree', projectDir, ...args],
    { cwd: projectDir, timeout: opts.timeout ?? 10_000, maxBuffer: opts.maxBuffer, env: scrubbedGitEnv() },
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

// ── info/exclude propagation ──────────────────────────────────────────────────

/**
 * The desired meta `info/exclude` contents for this project: the derived/gate
 * artifacts (DEFAULT_META_EXCLUDE) plus the physical code dir (`<code.dir>/`)
 * when the project is split, so the code tree never surfaces in meta status.
 */
function desiredMetaExclude(projectDir: string): string {
  const cd = codeDirName(projectDir)
  const lines = cd ? [...DEFAULT_META_EXCLUDE, cd.replace(/\/+$/, '') + '/'] : DEFAULT_META_EXCLUDE
  return lines.join('\n') + '\n'
}

/**
 * Bring the meta repo's `info/exclude` up to the current desired set
 * (idempotent — writes ONLY when the on-disk contents differ). This is the
 * propagation path for EXISTING meta repos: `initMetaRepo` runs it at init, and
 * `commitMeta` runs it before staging, so a repo created before a new exclude
 * entry landed (e.g. `worktrees/` — T-386 C4) or before its `code.dir` was
 * recorded (T-386 C3) self-heals on the next meta write instead of tracking a
 * code checkout into meta history. The file is prdt-managed wholesale for the
 * meta git-dir (a user's own exclude lines would be overwritten — acknowledged
 * as a low-severity trade vs. the leak this prevents; see T-385 backlog note).
 */
function ensureMetaExclude(projectDir: string): void {
  const excludePath = path.join(metaGitDir(projectDir), 'info', 'exclude')
  const desired = desiredMetaExclude(projectDir)
  try {
    if (fs.readFileSync(excludePath, 'utf-8') === desired) return
  } catch {
    /* missing / unreadable → (re)write below */
  }
  fs.mkdirSync(path.dirname(excludePath), { recursive: true })
  fs.writeFileSync(excludePath, desired)
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

    // Derived/gate artifacts excluded from tracking even under allowlisted dirs,
    // plus the physical code dir (`<code.dir>/`) when split so the code tree stays
    // out of the meta `git status` (PRD §v1.3 설계 결정 3). Idempotent (re-run
    // refreshes an existing repo — the T-386 C3/C4 propagation path).
    ensureMetaExclude(projectDir)

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
 * LEGACY-layout staging (not yet physically split): the code repo shares the
 * meta work-tree and its `.gitignore` still sits at the project root. A prdt
 * meta allowlist that a legacy code `.gitignore` ignores (e.g. a pre-v1.3
 * managed block, or a user rule) would make a plain `git add -A -- <allowlist>`
 * refuse the whole allowlist ("paths are ignored by one of your .gitignore
 * files", exit 1). So we stage ignore-immune:
 *  - tracked changes (`ls-files --modified --deleted`) — ignore rules never
 *    apply to tracked files;
 *  - new files (`ls-files --others --exclude-from=<meta info/exclude>`) —
 *    honoring ONLY the meta repo's own derived-artifact excludes, never the
 *    code repo's `.gitignore`.
 * The combined set is then staged with `add -f` (deleted paths stage the
 * removal). `-z` keeps non-ASCII paths unquoted.
 *
 * Once physically split (isPhysicallySplit) the code `.gitignore` no longer
 * lives at the project root, so commitMeta uses a plain `git add -A` instead
 * (PRD §v1.3 설계 결정 4) — see stageAllowlist.
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
 * Stage the allowlist for one meta commit. Two strategies, keyed on layout:
 *  - PHYSICALLY SPLIT (PRD §v1.3): the code `.gitignore` no longer sits at the
 *    project root, so a plain `git add -A -- <allowlist>` correctly stages
 *    adds/edits/deletions while honoring the meta repo's own info/exclude
 *    (derived artifacts + `<code.dir>/`). No ignore-immune dance needed.
 *  - LEGACY (shared work-tree): ignore-immune staging (collectStageableFiles +
 *    `add -f`) so a code-side `.gitignore` cannot refuse the allowlist.
 * Either way code files never enter the meta repo — the allowlist never names
 * the code dir, and the two repos have distinct git-dirs.
 */
async function stageAllowlist(projectDir: string, paths: string[]): Promise<void> {
  if (isPhysicallySplit(projectDir)) {
    // `paths` is the allowlist top-levels (~13 entries) — no ARG_MAX risk — but
    // git walks them into thousands of files on a first snapshot, so give the
    // add the staging timeout (T-371 B3).
    await metaGit(projectDir, ['add', '-A', '--', ...paths], { timeout: STAGE_TIMEOUT_MS })
    return
  }
  const files = await collectStageableFiles(projectDir, paths)
  // Chunk the enumerated file argv so a first snapshot of thousands of files
  // stays under ARG_MAX; each chunk adds into the same index (T-371 B3).
  for (let i = 0; i < files.length; i += STAGE_CHUNK) {
    await metaGit(projectDir, ['add', '-f', '--', ...files.slice(i, i + STAGE_CHUNK)], {
      timeout: STAGE_TIMEOUT_MS,
    })
  }
}

/**
 * Stage the allowlist and commit one logical meta change.
 *
 * - Stages ONLY the allowlist (via stageAllowlist) — code files can never enter
 *   the meta repo.
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

  // Self-heal info/exclude before staging so an EXISTING meta repo (created
  // before a new exclude entry or before its code.dir was recorded) never
  // stages a code worktree checkout into meta history (T-386 C3/C4). Cheap:
  // rewrites only when the on-disk set differs.
  ensureMetaExclude(projectDir)

  const allowlist = readMetaAllowlist(projectDir)

  const paths = existingAllowlistPaths(projectDir, allowlist)
  if (paths.length === 0) {
    return { committed: false, skipReason: 'nothing-allowlisted' }
  }

  try {
    await stageAllowlist(projectDir, paths)
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

// ── Push (explicit user-invoked backup; never automatic, never force) ─────────

export interface MetaPushResult {
  ok: boolean
  /** The remote's default branch that carried the push (present on success). */
  branch?: string
  error?: string
}

/**
 * Push the meta repo's local branches to a configured backup remote (T-374 ①).
 *
 * This is the EXPLICIT counterpart to addMetaRemote: `remote add` only records
 * the url, and no beat / hook / autosave path ever pushes (PRD §v1.2 Non-goal:
 * no automatic push). A push happens ONLY when the user runs this command, so
 * the backup remote is the durable history a second machine bootstraps from
 * (bootstrapMetaRepo). Never `--force` — a fast-forward push preserves the
 * remote's history; a rejected non-ff surfaces as an error for the user to
 * resolve, never a silent overwrite.
 */
export async function pushMetaRemote(
  projectDir: string,
  name: string,
): Promise<MetaPushResult> {
  if (!metaRepoExists(projectDir)) {
    return { ok: false, error: 'meta repo not initialized' }
  }
  const remotes = await listMetaRemotes(projectDir)
  if (!remotes.some((r) => r.name === name)) {
    return {
      ok: false,
      error: `meta remote '${name}' not configured — add it first: prdt meta remote add ${name} <url>`,
    }
  }

  // Verify there is actually a commit to push. `symbolic-ref` resolves the
  // branch name even on an UNBORN HEAD (a freshly-init'd repo), so it cannot
  // stand in for "has commits" — rev-parse --verify HEAD does.
  try {
    await metaGit(projectDir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  } catch {
    return { ok: false, error: 'meta repo has no commits to push yet' }
  }
  let branch: string | undefined
  try {
    branch = (await metaGit(projectDir, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim()
  } catch {
    /* detached HEAD — no branch to push */
  }
  if (!branch) {
    return { ok: false, error: 'meta repo is in a detached HEAD state — no branch to push' }
  }

  try {
    // Push the current branch, setting upstream so a later `prdt meta log`/pull
    // knows its remote. No --force, no --mirror: a non-ff push is rejected by
    // git and returned as an error rather than overwriting the backup.
    await metaGit(projectDir, ['push', '--set-upstream', name, branch], { timeout: NETWORK_TIMEOUT_MS })
    return { ok: true, branch }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Bootstrap (second machine: restore meta.git from a backup remote) ─────────

export type MetaBootstrapRefusal =
  | 'no-git'
  | 'meta-repo-exists'
  | 'fetch-failed'
  | 'no-remote-history'

export interface MetaBootstrapResult {
  ok: boolean
  refusal?: MetaBootstrapRefusal
  /** The branch adopted from the backup remote's HEAD. */
  branch?: string
  /**
   * The state-dir name the meta repo was bootstrapped under (`.prdt` or the
   * legacy `.productune`) — derived from the backup's own paths. Surfaces so a
   * caller can point conflict-resolution guidance at the right git-dir.
   */
  stateDir?: string
  /** Meta repo HEAD after bootstrap. */
  headSha?: string
  /** Files checked out into the work-tree because they were missing (post-pull). */
  restoredCount: number
  /**
   * Work-tree meta files that DIFFER from the backup history — left UNTOUCHED
   * (never overwritten). Non-empty ⇒ the user must reconcile manually; `ok` is
   * false so a surface can warn instead of claiming a clean bootstrap.
   */
  conflicts: string[]
  /** Files the bootstrapped meta repo now tracks. */
  metaTrackedCount: number
  error?: string
}

/**
 * Code repo exists at codeRoot? (`.git` dir or file). codeRoot resolves to the
 * project root in legacy layout, or `<projectRoot>/<code.dir>` once split (PRD
 * §v1.3). Local copy — meta-migrate has its own.
 *
 * NB (T-377 follow-up): on a FRESH second machine the meta backup — which
 * carries `.prdt/config.json` and thus `code.dir` — has not been restored yet,
 * so codeRoot falls back to projectRoot here. A split-layout bootstrap that
 * runs from inside `code/` must re-anchor to the parent (projectRoot) before
 * calling in; the python bootstrap owns that re-anchoring (PRD §v1.3 T-374 정합).
 */
function bootstrapCodeRepoExists(projectDir: string): boolean {
  try {
    // Config-driven codeRoot — present in legacy layout or once the backup's
    // config.json (carrying code.dir) has been restored.
    if (fs.existsSync(path.join(codeRoot(projectDir), '.git'))) return true
    // Chicken-egg (T-378): on a FRESH second machine `.prdt/config.json` is not
    // restored yet, so codeDirName()→null and codeRoot() collapses to projectRoot,
    // missing a code repo cloned into the conventional `<projectRoot>/code`. Accept
    // that layout too so a split-clone bootstrap isn't mis-refused as `no-git`.
    if (fs.existsSync(path.join(projectDir, CODE_DIR_DEFAULT, '.git'))) return true
    return false
  } catch {
    return false
  }
}

/**
 * Peek the backup remote's tree to decide which state-dir kind (`.prdt` vs
 * legacy `.productune`) the project uses — and double as the connectivity probe.
 *
 * Why this is load-bearing: `stateDir()` is a heuristic (`.prdt` present wins,
 * else legacy default). On a fresh second machine that has pulled the split,
 * NEITHER state dir exists, so `stateDir()` would default to `.productune` and
 * the meta git-dir would be created there — then the first restored
 * `.prdt/config.json` would flip `detectProjectKind` to `.prdt` mid-operation
 * and every subsequent meta git call would target the wrong (non-existent)
 * git-dir. Pinning the kind from the backup's own paths BEFORE init removes that
 * race and puts meta.git in the same state dir the restored files live under.
 *
 * Shallow (`--depth 1`) — we only need the tree's top-level path prefixes.
 * Throws on an unreachable / empty remote (the caller maps it to fetch-failed).
 */
async function peekRemoteStateKind(url: string): Promise<ProjectKind> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-meta-peek-'))
  const env = scrubbedGitEnv()
  try {
    await execFileAsync('git', ['init', '--bare', '-q', tmp], { timeout: 10_000, env })
    let branch = 'HEAD'
    try {
      const { stdout } = await execFileAsync('git', ['ls-remote', '--symref', url, 'HEAD'], {
        timeout: 15_000,
        env,
      })
      const m = /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m.exec(stdout)
      if (m) branch = m[1]
    } catch {
      /* fall back to fetching HEAD directly */
    }
    await execFileAsync('git', ['--git-dir', tmp, 'fetch', '--depth', '1', url, branch], {
      timeout: 30_000,
      env,
    })
    const { stdout } = await execFileAsync(
      'git',
      ['--git-dir', tmp, 'ls-tree', '-r', '--name-only', 'FETCH_HEAD'],
      { timeout: 15_000, env, maxBuffer: 16 * 1024 * 1024 },
    )
    const paths = stdout.split('\n')
    const legacyPrefix = STATE_DIR_NAME.productune + '/'
    const prdtPrefix = STATE_DIR_NAME.prdt + '/'
    // Legacy only when the backup carries `.productune/*` and no `.prdt/*`;
    // everything else (incl. an ambiguous/empty meta) resolves to the forward
    // standard `.prdt`.
    if (paths.some((p) => p.startsWith(legacyPrefix)) && !paths.some((p) => p.startsWith(prdtPrefix))) {
      return 'productune'
    }
    return 'prdt'
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Bootstrap a meta repo on a SECOND machine from a backup remote (T-374 ②).
 *
 * The failure mode this heals: machine A ran the split (meta rm'd from code
 * tracking) and pushed meta.git to a backup remote. When machine B pulls the
 * split commit, git DELETES the now-untracked meta files from its work-tree and
 * B has no meta.git — the meta would be lost. This restores B to a working
 * split state whose history comes from the backup remote:
 *   ① init `.prdt/meta.git` with full T-364/365/366 hardening (initMetaRepo:
 *      repo-local identity, commit.gpgsign=false, hooksPath pinned, info/exclude;
 *      all meta git calls run through scrubbedGitEnv)
 *   ② add the backup remote + fetch its history
 *   ③ adopt the remote's default branch as local HEAD; read-tree its tree
 *   ④ restore ONLY work-tree files that are missing (the pull-deleted ones)
 *
 * Safety for the not-yet-pulled machine (meta files still on disk): a work-tree
 * file that differs from the backup history is a CONFLICT — it is left
 * untouched and reported in `conflicts[]`, never overwritten (no --force, no
 * reset --hard). meta.git is still created (that is non-destructive — a new
 * git-dir), so the user can reconcile with plain git afterwards.
 *
 * Refuses (touching nothing) when: no code repo (`no-git`); a meta repo already
 * exists locally (`meta-repo-exists` — bootstrap never clobbers local history;
 * use `prdt meta remote add` + a manual pull instead); the remote is
 * unreachable / empty (`fetch-failed` / `no-remote-history` — the freshly
 * created git-dir is rolled back so a corrected re-run is clean).
 */
export async function bootstrapMetaRepo(
  projectDir: string,
  url: string,
  name = 'backup',
): Promise<MetaBootstrapResult> {
  const base: MetaBootstrapResult = {
    ok: false,
    restoredCount: 0,
    conflicts: [],
    metaTrackedCount: 0,
  }

  if (!bootstrapCodeRepoExists(projectDir)) return { ...base, refusal: 'no-git' }
  if (metaRepoExists(projectDir)) return { ...base, refusal: 'meta-repo-exists' }

  // Pin the state-dir kind from the backup BEFORE touching the filesystem, so
  // metaGitDir() is stable for the whole operation (see peekRemoteStateKind).
  // This is also the connectivity probe — an unreachable remote fails here.
  let kind: ProjectKind
  try {
    kind = await peekRemoteStateKind(url)
  } catch (err) {
    return {
      ...base,
      refusal: 'fetch-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const stateDirName = STATE_DIR_NAME[kind]
  fs.mkdirSync(path.join(projectDir, stateDirName), { recursive: true })

  const gitDir = metaGitDir(projectDir)
  const rollback = () => {
    try {
      fs.rmSync(gitDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }

  // ① init with full hardening (identity, gpgsign, hooksPath, info/exclude).
  const init = await initMetaRepo(projectDir)
  if (!init.initialized) {
    rollback()
    return { ...base, error: `meta repo init failed: ${init.error}` }
  }

  // ② add remote + fetch history.
  const add = await addMetaRemote(projectDir, name, url)
  if (!add.ok) {
    rollback()
    return { ...base, error: `remote add failed: ${add.error}` }
  }
  try {
    await metaGit(projectDir, ['fetch', name], { timeout: NETWORK_TIMEOUT_MS })
  } catch (err) {
    rollback()
    return {
      ...base,
      refusal: 'fetch-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ③ resolve the remote's default branch and adopt it locally.
  let branch: string | undefined
  try {
    await metaGit(projectDir, ['remote', 'set-head', name, '-a'], { timeout: NETWORK_TIMEOUT_MS })
    const sym = (await metaGit(projectDir, ['symbolic-ref', `refs/remotes/${name}/HEAD`])).stdout.trim()
    const m = new RegExp(`^refs/remotes/${name}/(.+)$`).exec(sym)
    if (m) branch = m[1]
  } catch {
    /* fall through to enumeration */
  }
  if (!branch) {
    try {
      const { stdout } = await metaGit(projectDir, [
        'for-each-ref', '--format=%(refname:short)', `refs/remotes/${name}`,
      ])
      const candidates = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((r) => r !== `${name}/HEAD`)
      if (candidates.length > 0) branch = candidates[0].replace(new RegExp(`^${name}/`), '')
    } catch {
      /* none */
    }
  }
  if (!branch) {
    rollback()
    return { ...base, refusal: 'no-remote-history' }
  }

  let headSha: string
  try {
    headSha = (await metaGit(projectDir, ['rev-parse', `refs/remotes/${name}/${branch}`])).stdout.trim()
    await metaGit(projectDir, ['update-ref', `refs/heads/${branch}`, headSha])
    await metaGit(projectDir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`])
    await metaGit(projectDir, ['branch', `--set-upstream-to=${name}/${branch}`, branch])
    // Load the index from the fetched tree WITHOUT writing the work-tree, so we
    // can classify each path (missing vs present-and-equal vs conflict) before
    // touching any file.
    await metaGit(projectDir, ['read-tree', 'HEAD'])
  } catch (err) {
    rollback()
    return { ...base, error: `adopt-branch failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  // ④ classify and restore ONLY the missing files; never overwrite differences.
  try {
    const splitZ = (s: string) => s.split('\0').filter(Boolean)
    const deleted = splitZ((await metaGit(projectDir, ['ls-files', '--deleted', '-z'])).stdout)
    // worktree-vs-index diff = deleted ∪ present-but-differing.
    const diffed = splitZ((await metaGit(projectDir, ['diff', '--name-only', '-z'])).stdout)
    const deletedSet = new Set(deleted)
    const conflicts = diffed.filter((f) => !deletedSet.has(f))

    if (deleted.length > 0) {
      // Restore from the index; these paths are absent on disk so nothing is
      // overwritten. `checkout -- <path>` recreates each from the index.
      await metaGit(projectDir, ['checkout', '--', ...deleted])
    }

    // T-386 C3: init ① ran BEFORE the backup was restored, so `.prdt/config.json`
    // (and thus `code.dir`) did not yet exist — info/exclude was written without
    // the `<code.dir>/` line and machine B's meta status would show the code tree.
    // Now that the config is on disk, refresh the exclude (idempotent init re-run).
    await initMetaRepo(projectDir)

    const metaTracked = splitZ((await metaGit(projectDir, ['ls-files', '-z'])).stdout)

    return {
      ok: conflicts.length === 0,
      branch,
      stateDir: stateDirName,
      headSha,
      restoredCount: deleted.length,
      conflicts,
      metaTrackedCount: metaTracked.length,
      error:
        conflicts.length === 0
          ? undefined
          : `meta.git bootstrapped, but ${conflicts.length} work-tree file(s) differ from the backup ` +
            `history and were left untouched — reconcile before relying on the split ` +
            `(git --git-dir .prdt/meta.git status)`,
    }
  } catch (err) {
    // meta.git is set up; report the failure but do NOT roll it back — history
    // is already safely local.
    return {
      ...base,
      branch,
      stateDir: stateDirName,
      headSha,
      error: `work-tree restore failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
