/**
 * meta-migrate.ts — existing-project meta-split migration (T-366, PRD §v1.2
 * 경계 결정 4, 공통 마이그레이션 절차).
 *
 * Takes a MIXED repo (code + meta both tracked by `.git`) to the split state:
 *   ① init `.prdt/meta.git` (T-364 initMetaRepo — reused, not reimplemented)
 *   ② first meta snapshot commit (T-364 commitMeta)
 *   ③ code repo `git rm -r --cached` over the allowlist + commit the removal —
 *      tracking removal ONLY (the `.gitignore` managed block was retired in
 *      PRD §v1.3 설계 결정 2, so nothing touches the code `.gitignore` here)
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
import { codeRoot, codeDirName, stateDir, CODE_DIR_DEFAULT } from '../state/project-kind'
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
  /**
   * ④ — code ls-files meta-free AND meta ls-files ⊆ allowlist AND (non-empty
   * OR no meta files exist in the work-tree — T-370 C5: an empty snapshot is
   * consistent when the meta lives only in git history).
   */
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

/**
 * Run git against the CODE repo. Anchored at codeRoot (`<projectRoot>/<code.dir>`
 * once physically split, or the project root in legacy layout — PRD §v1.3 설계
 * 결정 4). Meta ops (metaGit below) stay anchored at the project root.
 */
async function codeGit(projectDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', codeRoot(projectDir), ...args], {
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

/** Code repo exists at codeRoot? (`.git` dir, or file for worktrees/submodules.) */
function codeRepoExists(projectDir: string): boolean {
  try {
    return fs.existsSync(path.join(codeRoot(projectDir), '.git'))
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

  // ② first snapshot commit. commitMeta stages the allowlist (ignore-immune in
  // legacy layout, plain add once split). diff-empty / nothing-allowlisted are
  // acceptable here (resume after a completed ②, or a project whose meta exists
  // only in git history).
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

  // ③ code repo: drop meta from the index. rm --cached only — work-tree
  //    contents and history stay untouched. No `.gitignore` staging: the managed
  //    block was retired (PRD §v1.3 설계 결정 2), and touching the code
  //    `.gitignore` here would sweep unrelated user edits into the untrack commit.
  //
  // T-370 C2: on ANY failure past this point, roll our own staging back.
  // Everything staged here is ours (the plan refused pre-staged user changes),
  // so a scoped `git reset` restores the pre-run index. Without it a failed
  // commit leaks a half-staged untrack (mass deletions swept into the user's
  // next commit — the exact leak the module header forbids) AND
  // planMetaMigration misreads the residue as `already-split`, so a re-run
  // could never create the untrack commit.
  const unstageMigration = async (): Promise<void> => {
    try {
      await codeGit(projectDir, ['reset', '-q', '--', ...plan.allowlist])
    } catch {
      /* best-effort — the original error below still surfaces */
    }
  }

  try {
    if (plan.trackedMetaFiles.length > 0) {
      await codeGit(projectDir, [
        'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...plan.allowlist,
      ])
    }
  } catch (err) {
    await unstageMigration()
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
      await unstageMigration()
      return fail({
        error: `tracking-removal commit failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ④ verify both sides
  let codeTrackedMetaCount = -1
  let metaTrackedCount = -1
  let metaOutsideAllowlist = 0
  let metaUntrackedInWorkTree = 0
  try {
    codeTrackedMetaCount = (await codeTrackedMetaFiles(projectDir, plan.allowlist)).length
    const metaFiles = (await metaGit(projectDir, ['ls-files', '-z'])).split('\0').filter(Boolean)
    metaTrackedCount = metaFiles.length
    const inAllowlist = (f: string) =>
      plan.allowlist.some((e) => f === e || f.startsWith(e.replace(/\/+$/, '') + '/'))
    metaOutsideAllowlist = metaFiles.filter((f) => !inAllowlist(f)).length

    // T-370 C5: `meta tracks > 0` is only a valid expectation when meta files
    // actually exist in the work-tree. A mixed repo whose tracked meta was all
    // deleted on disk (meta lives only in git history) migrates with an empty
    // snapshot — the untrack still succeeded and must not be reported as a
    // mismatch. Same exclude handling as commitMeta's staging (info/exclude
    // keeps derived artifacts out of "meta present" too).
    if (metaTrackedCount === 0 && plan.allowlist.length > 0) {
      const othersArgs = ['ls-files', '-z', '--others']
      const excludeFile = path.join(metaGitDir(projectDir), 'info', 'exclude')
      if (fs.existsSync(excludeFile)) othersArgs.push('--exclude-from', excludeFile)
      metaUntrackedInWorkTree = (
        await metaGit(projectDir, [...othersArgs, '--', ...plan.allowlist])
      )
        .split('\0')
        .filter(Boolean).length
    }
  } catch (err) {
    return fail({
      snapshotSha,
      untrackCommitSha,
      untrackedCount: plan.trackedMetaFiles.length,
      error: `verification failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const verified =
    codeTrackedMetaCount === 0 &&
    metaOutsideAllowlist === 0 &&
    (metaTrackedCount > 0 || metaUntrackedInWorkTree === 0)

  // T-370 C5: message mirrors the judgment — name only the condition(s) that
  // actually failed instead of one blanket mismatch line.
  const problems: string[] = []
  if (codeTrackedMetaCount !== 0) {
    problems.push(`code still tracks ${codeTrackedMetaCount} meta file(s)`)
  }
  if (metaOutsideAllowlist > 0) {
    problems.push(`meta tracks ${metaOutsideAllowlist} file(s) outside the allowlist`)
  }
  if (metaTrackedCount === 0 && metaUntrackedInWorkTree > 0) {
    problems.push(
      `meta repo tracks nothing despite ${metaUntrackedInWorkTree} meta file(s) in the work-tree`,
    )
  }

  return {
    ok: verified,
    snapshotSha,
    untrackCommitSha,
    untrackedCount: plan.trackedMetaFiles.length,
    verified,
    codeTrackedMetaCount,
    metaTrackedCount,
    error: verified ? undefined : `verification mismatch: ${problems.join('; ')}`,
  }
}

// ── 2nd migration: physical re-layout (T-378, PRD §v1.3 §기존 분리 완료 repo 7개) ──
//
// The LOGICAL split (runMetaMigration above / v1.2) leaves code + meta on ONE
// work-tree, two git-dirs. The PHYSICAL migration moves the code repo down into
// `<projectRoot>/<code.dir>/` so `ls <projectRoot>` shows the meta area with the
// code folded into `code/`. The move is a pure relocation — the code git-dir AND
// every code work-tree entry descend together, so the code repo's tracked paths
// and history are UNCHANGED (no rename commit — PRD §v1.3 §기존 분리 완료 repo 7개
// step 2). Nothing is pushed, nothing is history-rewritten.
//
// Two `.git` shapes (PRD Risk & assumptions — "7 repo 형태가 균일하지 않을 수 있음"):
//   - `normal`: `.git` is a directory → the whole thing renames into `code/`.
//   - `linked-worktree`: `.git` is a gitfile → `<external>/worktrees/<id>/` (e.g.
//     productune → `_archive/productune-v0/.git/worktrees/…`). The gitfile renames
//     with the tree, but the external back-pointer (`<extGitDir>/gitdir`) still
//     names the OLD checkout path → we rewrite it to `code/.git`. `git worktree
//     repair` runs best-effort afterwards (also fixes any of the code repo's own
//     sub-worktrees whose gitfiles went stale).
//   - anything else (submodule gitfile, corrupt) → `unknown-git-shape`, abort.
//
// Atomicity (PRD "이동 중단 시 반쪽 상태 금지"): every filesystem step is a
// same-directory `rename` (atomic per entry). On ANY failure the moved entries are
// renamed back and the linked-worktree back-pointer restored — the tree returns to
// its pre-run state, never a half-moved layout. Idempotency: a project already
// carrying `code.dir` + a live `code/.git` re-runs as a no-op.

export type PhysicalMigrationRefusal =
  | 'no-git'
  | 'unknown-git-shape'
  | 'meta-repo-missing'
  | 'code-dir-occupied'
  | 'already-migrated'
  // A prior run's rollback was incomplete: `code/.git` is stranded at the target
  // while projectRoot has no `.git` and config records no split (T-378 QA).
  | 'stranded-suspected'

export type CodeGitShape = 'normal' | 'linked-worktree' | 'none' | 'unknown'

export interface PhysicalMigrationPlan {
  status: 'eligible' | PhysicalMigrationRefusal
  /** Target code sub-directory (default `code`). */
  codeDir: string
  gitShape: CodeGitShape
  /** projectRoot top-level entries the migration will relocate into `code/`. */
  entriesToMove: string[]
  /** Non-fatal advisories (e.g. a nested `.prdt/` inside the code tree). */
  warnings: string[]
}

export interface PhysicalMigrationResult {
  ok: boolean
  refusal?: PhysicalMigrationRefusal
  codeDir?: string
  gitShape?: CodeGitShape
  /** True when the project was already physically split (re-run no-op). */
  noop?: boolean
  movedCount: number
  verified: boolean
  warnings: string[]
  /**
   * Present ONLY when a failed run's rollback could not fully undo itself — each
   * entry that is stranded away from its original location (`<orig> → <current>`).
   * Non-empty means the tree is in a PARTIAL state needing manual recovery; the
   * `error` says so and never claims a clean "rolled back".
   */
  strandedEntries?: string[]
  error?: string
}

const MANAGED_BLOCK_START = '# >>> prdt meta (managed) >>>'
const MANAGED_BLOCK_END = '# <<< prdt meta (managed) <<<'

/** Run git in an explicit cwd (used before code.dir is recorded — codeGit above
 * resolves via config, which is not written until the move has succeeded). */
async function gitAt(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 30_000,
    env: scrubbedEnv(),
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

/** Distinct top-level path segments of the allowlist — the meta entries that
 * STAY at projectRoot (everything else at the root is code and descends). */
function metaTopLevels(allowlist: string[]): Set<string> {
  const s = new Set<string>()
  for (const e of allowlist) {
    const seg = e.replace(/^[/\\]+/, '').split(/[/\\]/)[0]
    if (seg) s.add(seg)
  }
  return s
}

/** Classify the code repo's `.git` at projectRoot (see module notes above). */
function classifyCodeGit(projectDir: string): { shape: CodeGitShape; extGitDir?: string } {
  const p = path.join(projectDir, '.git')
  let st: fs.Stats
  try {
    st = fs.lstatSync(p)
  } catch {
    return { shape: 'none' }
  }
  if (st.isDirectory()) return { shape: 'normal' }
  if (st.isFile()) {
    let content = ''
    try {
      content = fs.readFileSync(p, 'utf-8')
    } catch {
      return { shape: 'unknown' }
    }
    const m = content.match(/^gitdir:\s*(.+)$/m)
    if (!m) return { shape: 'unknown' }
    const raw = m[1].trim()
    const ext = path.isAbsolute(raw) ? raw : path.resolve(projectDir, raw)
    // A linked worktree's gitdir points into `<common>/worktrees/<id>` and that
    // dir carries a `gitdir` back-pointer file. A submodule gitfile points into
    // `<parent>/.git/modules/<name>` (no such back-pointer) → we don't handle it.
    const looksLikeWorktree = /(^|[\\/])worktrees[\\/][^\\/]+[\\/]?$/.test(ext)
    if (looksLikeWorktree && fs.existsSync(path.join(ext, 'gitdir'))) {
      return { shape: 'linked-worktree', extGitDir: ext }
    }
    return { shape: 'unknown' }
  }
  return { shape: 'unknown' }
}

/** Directory is absent or has no entries. */
function isEmptyDir(p: string): boolean {
  try {
    return fs.readdirSync(p).length === 0
  } catch {
    return true // absent
  }
}

/**
 * Inspect a logically-split project and classify it for the physical migration.
 * Read-only. `codeDir` defaults to `code` (the confirmed folder name, PRD §v1.3).
 */
export function planPhysicalMigration(
  projectDir: string,
  codeDir: string = CODE_DIR_DEFAULT,
): PhysicalMigrationPlan {
  const base: PhysicalMigrationPlan = {
    status: 'eligible',
    codeDir,
    gitShape: 'none',
    entriesToMove: [],
    warnings: [],
  }

  const { shape } = classifyCodeGit(projectDir)
  base.gitShape = shape

  // Already physically split? code.dir recorded AND a live code/.git → no-op.
  if (codeDirName(projectDir) !== null) {
    const cr = codeRoot(projectDir)
    if (fs.existsSync(path.join(cr, '.git'))) return { ...base, status: 'already-migrated' }
    // config claims a split that isn't on disk — refuse rather than guess.
    return { ...base, status: 'code-dir-occupied' }
  }

  if (shape === 'none') {
    // T-378 QA: a code/.git at the target while projectRoot has no `.git` and
    // config records no code.dir is the fingerprint of a previous run's INCOMPLETE
    // rollback (the code repo was moved down but the undo failed). Never report a
    // bare `no-git` here — that hides the stranded state and a naive retry would
    // re-classify it as a plain empty project.
    if (fs.existsSync(path.join(projectDir, codeDir, '.git'))) {
      return {
        ...base,
        status: 'stranded-suspected',
        warnings: [
          `code/.git found at '${codeDir}/' but projectRoot has no .git and config records no code.dir ` +
            `— a previous migration's rollback was incomplete. Move '${codeDir}/' contents back to the ` +
            `project root (or finish the split by recording code.dir) before retrying.`,
        ],
      }
    }
    return { ...base, status: 'no-git' }
  }
  if (shape === 'unknown') return { ...base, status: 'unknown-git-shape' }
  // Physical migration presupposes the LOGICAL split is done (meta.git present);
  // otherwise meta is still code-tracked and this would strand it. Run
  // `prdt meta split` first.
  if (!metaRepoExists(projectDir)) return { ...base, status: 'meta-repo-missing' }

  const codeDirPath = path.join(projectDir, codeDir)
  if (fs.existsSync(codeDirPath) && !isEmptyDir(codeDirPath)) {
    return { ...base, status: 'code-dir-occupied' }
  }

  const metaTop = metaTopLevels(readMetaAllowlist(projectDir))
  const entriesToMove = fs
    .readdirSync(projectDir)
    .filter((e) => e !== codeDir && !metaTop.has(e))

  return { ...base, entriesToMove }
}

/** Strip the retired `.gitignore` managed block (PRD §v1.3 설계 결정 2), leaving
 * every user-authored line untouched. Returns true when a block was removed. */
function removeManagedBlock(gitignorePath: string): boolean {
  let content: string
  try {
    content = fs.readFileSync(gitignorePath, 'utf-8')
  } catch {
    return false
  }
  const startIdx = content.indexOf(MANAGED_BLOCK_START)
  if (startIdx < 0) return false
  const endMarker = content.indexOf(MANAGED_BLOCK_END, startIdx)
  if (endMarker < 0) return false
  const eol = content.indexOf('\n', endMarker)
  const before = content.slice(0, startIdx).replace(/\n+$/, '\n')
  const after = eol < 0 ? '' : content.slice(eol + 1)
  const result = (before + after).replace(/\n{3,}/g, '\n\n')
  try {
    if (result.trim() === '') fs.rmSync(gitignorePath)
    else fs.writeFileSync(gitignorePath, result)
  } catch {
    /* best-effort */
  }
  return true
}

/** Record `code.dir` in `<stateDir>/config.json` (atomic tmp+rename,
 * field-preserving — same contract as writeMetaAllowlist). */
function recordCodeDir(projectDir: string, codeDir: string): void {
  const cfgPath = path.join(stateDir(projectDir), 'config.json')
  let cfg: Record<string, any> = {}
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') cfg = parsed
  } catch {
    /* missing / corrupt → fresh object */
  }
  cfg.code = { ...(cfg.code && typeof cfg.code === 'object' ? cfg.code : {}), dir: codeDir }
  const tmp = cfgPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n')
  fs.renameSync(tmp, cfgPath)
}

/**
 * Execute the confirmed physical migration. Refuses (touching nothing) unless
 * planPhysicalMigration says `eligible`. Atomic: on failure the moved entries and
 * the linked-worktree back-pointer are restored to pre-run state. Never pushes,
 * never rewrites history.
 */
export async function runPhysicalMigration(
  projectDir: string,
  codeDir: string = CODE_DIR_DEFAULT,
): Promise<PhysicalMigrationResult> {
  const fail = (partial: Partial<PhysicalMigrationResult>): PhysicalMigrationResult => ({
    ok: false,
    movedCount: 0,
    verified: false,
    warnings: [],
    ...partial,
  })

  const plan = planPhysicalMigration(projectDir, codeDir)
  if (plan.status === 'already-migrated') {
    return { ok: true, noop: true, codeDir, gitShape: plan.gitShape, movedCount: 0, verified: true, warnings: [] }
  }
  if (plan.status !== 'eligible') {
    return fail({ refusal: plan.status, codeDir, gitShape: plan.gitShape })
  }

  const { shape, extGitDir } = classifyCodeGit(projectDir)
  const codeDirPath = path.join(projectDir, codeDir)

  // ── ATOMIC MOVE ──────────────────────────────────────────────────────────
  const moved: string[] = []
  let backPointerRestore: { file: string; prev: string } | null = null
  try {
    fs.mkdirSync(codeDirPath, { recursive: true })
    for (const e of plan.entriesToMove) {
      fs.renameSync(path.join(projectDir, e), path.join(codeDirPath, e))
      moved.push(e)
    }

    // linked worktree: repoint the external back-pointer at the moved gitfile.
    if (shape === 'linked-worktree' && extGitDir) {
      const bp = path.join(extGitDir, 'gitdir')
      try {
        backPointerRestore = { file: bp, prev: fs.readFileSync(bp, 'utf-8') }
      } catch {
        backPointerRestore = null
      }
      fs.writeFileSync(bp, path.join(codeDirPath, '.git') + '\n')
    }

    // Repair any stale sub-worktree pointers (normal case) / re-link (worktree case).
    try {
      await gitAt(codeDirPath, ['worktree', 'repair'])
    } catch {
      /* best-effort — the sanity check below is the real gate */
    }

    // Sanity: the code repo must resolve to codeDirPath as its top-level. Compare
    // via realpath — `git rev-parse` already canonicalizes symlinks (e.g. macOS
    // `/var`→`/private/var`), so a raw string compare would spuriously fail.
    const top = (await gitAt(codeDirPath, ['rev-parse', '--show-toplevel'])).trim()
    if (fs.realpathSync(top) !== fs.realpathSync(codeDirPath)) {
      throw new Error(`code repo top-level resolved to ${top}, expected ${codeDirPath}`)
    }
  } catch (err) {
    // ── ROLLBACK ─ restore pre-run layout, and report HONESTLY if the undo
    // itself fails (T-378 QA): a swallowed rename failure would leave a real
    // half-state on disk while the caller sees a success-flavored "rolled back".
    // Track every entry we could NOT put back so the result names the stranded
    // paths and never claims a clean rollback.
    const stranded: string[] = []
    if (backPointerRestore) {
      try {
        fs.writeFileSync(backPointerRestore.file, backPointerRestore.prev)
      } catch {
        stranded.push(`<worktree back-pointer> ${backPointerRestore.file} (not restored)`)
      }
    }
    for (const e of [...moved].reverse()) {
      const orig = path.join(projectDir, e)
      const current = path.join(codeDirPath, e)
      try {
        fs.renameSync(current, orig)
      } catch {
        stranded.push(`${e}: ${orig} → ${current}`)
      }
    }
    try {
      // Only remove code/ when the rollback fully emptied it — a leftover entry
      // is itself part of the stranded state we must not paper over.
      if (isEmptyDir(codeDirPath)) fs.rmdirSync(codeDirPath)
    } catch {
      /* best-effort */
    }
    const cause = err instanceof Error ? err.message : String(err)
    if (stranded.length > 0) {
      return fail({
        codeDir,
        gitShape: shape,
        strandedEntries: stranded,
        error:
          `move failed AND rollback INCOMPLETE — PARTIAL rollback, manual recovery needed. ` +
          `${stranded.length} entry(ies) stranded (original → current): ${stranded.join('; ')}. ` +
          `Original failure: ${cause}`,
      })
    }
    return fail({
      codeDir,
      gitShape: shape,
      error: `move failed (rolled back cleanly): ${cause}`,
    })
  }

  // ── POST-MOVE (past the atomic boundary; the tree is now under code/) ───────
  // Managed block removal is a work-tree edit only — NOT committed (the physical
  // migration adds no code commit; the user commits it in their normal flow).
  removeManagedBlock(path.join(codeDirPath, '.gitignore'))

  // Record code.dir so codeRoot() resolves to codeDirPath everywhere hereafter.
  recordCodeDir(projectDir, codeDir)

  // Refresh the meta repo's info/exclude to exclude `code/` (PRD §v1.3 설계 결정 3).
  // Idempotent — meta.git already exists, so this only repropagates config +
  // info/exclude (now that code.dir is set).
  await initMetaRepo(projectDir)

  // ── VERIFY ─────────────────────────────────────────────────────────────────
  const warnings: string[] = []
  let verified = false
  let error: string | undefined
  try {
    const codeFiles = (await gitAt(codeDirPath, ['ls-files', '-z'])).split('\0').filter(Boolean)
    const configHasCodeDir = codeDirName(projectDir) === codeDir
    // meta must not see the code tree.
    const metaShowsCode = (
      await execFileAsync(
        'git',
        ['--git-dir', metaGitDir(projectDir), '--work-tree', projectDir, 'status', '--porcelain', '-z'],
        { cwd: projectDir, timeout: 30_000, env: scrubbedEnv(), maxBuffer: 16 * 1024 * 1024 },
      )
    ).stdout
      .split('\0')
      .filter(Boolean)
      .some((entry) => entry.slice(3).startsWith(codeDir + '/'))

    // T-376 QA residual (low-cost check): a nested `.prdt/` inside the code tree
    // makes projectRoot up-walk ambiguous — surface it as an advisory.
    const nested = codeFiles.filter((f) => f === '.prdt' || f.startsWith('.prdt/') || f.includes('/.prdt/'))
    if (nested.length > 0) {
      warnings.push(`nested .prdt inside code tree (${nested.length} path(s)) — up-walk may be ambiguous`)
    }

    verified = configHasCodeDir && !metaShowsCode
    if (!verified) {
      const problems: string[] = []
      if (!configHasCodeDir) problems.push('code.dir not recorded')
      if (metaShowsCode) problems.push(`meta status still shows ${codeDir}/`)
      error = `verification mismatch: ${problems.join('; ')}`
    }
  } catch (err) {
    error = `verification failed: ${err instanceof Error ? err.message : String(err)}`
  }

  return { ok: verified, codeDir, gitShape: shape, movedCount: moved.length, verified, warnings, error }
}
