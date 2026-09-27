/**
 * meta-backup.ts — the ONE automatic push in prdt (T-504).
 *
 * contracts §Git names a single carve-out of the push gate: tooling pushes the
 * META repo's own branch, fast-forward only, to the one remote registered as
 * that project's meta backup — at a stage boundary and once a day. This module
 * IS that carve-out's mechanism, and its scope is fixed structurally, not by
 * configuration:
 *   - every git call goes through `metaGit` (git-dir = `<stateDir>/meta.git`),
 *     so the CODE repository (`.git`) is unreachable from here by construction;
 *   - the remote is the meta repo's own remote named `meta.backup_remote`
 *     (config.json; default `backup`) — config PICKS one of the remotes already
 *     registered on the meta repo and can add none: a name that is not a legal
 *     remote name (`git check-ref-format --allow-onelevel`: no leading `-`, no
 *     `:`, no whitespace …) is refused before any git call, so a flag-shaped or
 *     refspec-shaped value hand-written into config can never reach `git push`
 *     as anything but a NAME (QA F1, T-504: a forged `[remote "--force"]` +
 *     `[remote "refs/heads/main:refs/heads/main"]` pair in the git-dir config
 *     turned the argv into a forced current-branch push);
 *   - the refspec is `refs/heads/<branch>:refs/heads/<branch>` for the meta
 *     repo's checked-out branch, with `--no-follow-tags` and `--end-of-options`
 *     closing the option list BEFORE the two positionals — so whatever the
 *     remote name looks like, git reads it as a remote name, never as a flag:
 *     no `+`, no `--force`, no `--tags`, no `--all`, no `--mirror`, no
 *     `--delete` — a non-ff push is rejected by the remote and reported here,
 *     never overwritten (`backupPushArgs` is exported so a test can pin this).
 *
 * Trigger (approved 2026-08-20, ticket T-504): stage boundary + once daily,
 * collapsed into one decision (`decideBackup`) over one state file so the two
 * never double-fire — a stage-boundary push counts as that day's push. The
 * callers are NON-per-turn paths only: the `prdt` CLI's main (every subcommand
 * but `prdt meta`, the explicit path it must not race; detached) and the PO
 * SessionStart hook (every SessionStart — startup, resume, compact; detached;
 * the latch, not the call count, decides). Never the persona-turn beat
 * (`metaAutosaveTick`) — that path stays network-free.
 *
 * Failure path: the push runs detached with no terminal, so it reports itself
 * through the state file (`<metaGitDir>/prdt-backup-state.json`, inside the
 * git-dir so it is never part of the meta tree it backs up): `prdt` prints the
 * last failure on its next run and `prdt doctor` warns on it. A failed attempt
 * backs off `BACKUP_RETRY_BACKOFF_MS` before the next network attempt. A
 * configured remote the meta repo no longer has (renamed, removed while others
 * remain) or an illegal remote name is a failure too and lands in the latch the
 * same way (QA F2: a silent `remote-missing` return left doctor clean).
 *
 * Concurrency (T-686): two `prdt` processes on this machine — a parallel
 * worker and the PO, or two workers — can each spawn their own detached
 * `backup` tick against the SAME meta git-dir at the same moment. Both read
 * "ahead > 0" off the same on-disk tracking ref, both decide to push, and race
 * the remote's own ref-transaction lock; the loser sees a lock-contention
 * error (`cannot lock ref … is at X but expected Y`) even though X is exactly
 * what it wanted there — the winner already landed the same local HEAD. A
 * file lock scoped to this git-dir (`prdt-backup.lock`, alongside the state
 * file — never in the meta tree) serializes every tick from the ahead-count
 * read through the push and its state write; a tick that cannot acquire it
 * skips quietly (`reason: 'concurrent'`, nothing latched) rather than racing.
 * The lock is stale-safe (`BACKUP_LOCK_STALE_MS`, past the push's own network
 * ceiling) so a crashed holder never wedges every future tick.
 */

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { stateDir } from '../state/project-kind'
import {
  metaGit,
  metaGitDir,
  metaRepoExists,
  listMetaRemotes,
  scrubbedGitEnv,
} from './meta-git'

const execFileAsync = promisify(execFile)

export const DEFAULT_META_BACKUP_REMOTE = 'backup'
export const BACKUP_STATE_FILE = 'prdt-backup-state.json'
/** After a failed attempt, no new network attempt for this long. */
export const BACKUP_RETRY_BACKOFF_MS = 60 * 60 * 1000
/** Network ceiling for the one push (matches meta-git's NETWORK_TIMEOUT_MS). */
const PUSH_TIMEOUT_MS = 120_000
/** T-686: the tick's own mutual-exclusion lock, alongside the state file. */
export const BACKUP_LOCK_FILE = 'prdt-backup.lock'
/** A held lock older than this is a crashed holder's leftover, not a live tick — steal it. */
export const BACKUP_LOCK_STALE_MS = PUSH_TIMEOUT_MS + 30_000

export interface MetaBackupState {
  /** ISO time of the last SUCCESSFUL push. */
  last_push_at?: string
  /** UTC calendar date (YYYY-MM-DD) of the last successful push — the daily latch. */
  last_push_date?: string
  /** po-state.stage at the last successful push — the stage-boundary latch. */
  last_pushed_stage?: string | null
  last_pushed_sha?: string
  remote?: string
  branch?: string
  /** ISO time of the last attempt (success or failure). */
  last_attempt_at?: string
  last_ok?: boolean
  /** First lines of git's error on the last failed attempt. */
  last_error?: string
}

export type BackupSkipReason =
  | 'meta-repo-missing'
  | 'remote-missing'
  | 'remote-name-invalid'
  | 'no-commits'
  | 'detached-head'
  | 'up-to-date'
  | 'backoff'
  | 'already-today'
  | 'concurrent'

export type BackupPushReason = 'stage-boundary' | 'daily'

export interface MetaBackupDecision {
  push: boolean
  reason: BackupPushReason | BackupSkipReason
  /**
   * True when this skip should also CLEAR a standing `last_ok: false` without
   * a network attempt (T-643): `aheadCount <= 0` means every commit reachable
   * from local HEAD is already reachable from the remote-tracking ref — the
   * thing a past failed push was trying to land is already there, landed by
   * some other route (a manual `prdt meta push`, another session, a direct
   * terminal push — all of which write the SAME shared tracking ref this repo
   * reads). A remote that is still genuinely behind never reaches this branch:
   * unreflected local commits keep `aheadCount` > 0, so that case keeps
   * retrying and failing (or succeeding) on its own merits via the normal push
   * path below — this flag never fires for it. Only meaningful when `push` is
   * `false` and `reason` is `'up-to-date'`.
   */
  clearsFailure?: boolean
}

export interface MetaBackupTickResult {
  /** True when a push was attempted. */
  attempted: boolean
  /** True when a push was attempted and succeeded. */
  pushed: boolean
  reason: BackupPushReason | BackupSkipReason
  remote?: string
  branch?: string
  /** Commits that were ahead of the remote-tracking ref before this run. */
  ahead?: number
  error?: string
}

// ── State file (inside the meta git-dir — never in the backed-up tree) ────────

export function metaBackupStatePath(projectDir: string): string {
  return path.join(metaGitDir(projectDir), BACKUP_STATE_FILE)
}

export function readMetaBackupState(projectDir: string): MetaBackupState {
  try {
    const parsed = JSON.parse(fs.readFileSync(metaBackupStatePath(projectDir), 'utf-8'))
    if (parsed && typeof parsed === 'object') return parsed as MetaBackupState
  } catch {
    // missing / corrupt → empty
  }
  return {}
}

function writeMetaBackupState(projectDir: string, state: MetaBackupState): void {
  const fp = metaBackupStatePath(projectDir)
  const tmp = `${fp}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  fs.renameSync(tmp, fp)
}

// ── The tick's own lock (T-686) — inside the git-dir, never the meta tree ─────

export interface BackupLockHandle {
  path: string
  /** Random per-acquire value — `release` only unlinks a file that still holds it, so a
   * holder that timed out and was stolen from never deletes the NEW holder's lock. */
  token: string
}

function backupLockPath(projectDir: string): string {
  return path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE)
}

/** Exclusive-create write: fails EEXIST when another live (or not-yet-stale) holder has it. */
function writeLockFile(fp: string, pid: number, acquiredAtMs: number, token: string): void {
  const fd = fs.openSync(fp, 'wx')
  try {
    fs.writeSync(fd, JSON.stringify({ pid, acquired_at: acquiredAtMs, token }))
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Try to take the tick's lock for this meta git-dir. `nowMs` is the caller's
 * own clock (so tests can pin it, same as the rest of this module). Returns
 * `null` when another tick genuinely holds it — never throws, since a busy
 * lock is an ordinary outcome (`reason: 'concurrent'`), not an error.
 *
 * A held-but-stale lock (older than `BACKUP_LOCK_STALE_MS` — a crashed or
 * killed holder, never a live push: that outlives the push's own
 * `PUSH_TIMEOUT_MS`) is unlinked and retaken. The unlink+recreate is not one
 * atomic step, but the FINAL `wx` open still is: if another process steals it
 * in the same instant, this one's `wx` fails EEXIST and it correctly reports
 * busy rather than believing it holds a lock it does not.
 */
export function acquireBackupLock(projectDir: string, nowMs: number): BackupLockHandle | null {
  const fp = backupLockPath(projectDir)
  const token = `${process.pid}-${nowMs}-${Math.random().toString(36).slice(2)}`
  try {
    writeLockFile(fp, process.pid, nowMs, token)
    return { path: fp, token }
  } catch (e: any) {
    if (e?.code !== 'EEXIST') throw e
  }
  let acquiredAt = 0
  try {
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    if (typeof existing?.acquired_at === 'number') acquiredAt = existing.acquired_at
  } catch {
    // corrupt lock file → treat as age 0, i.e. definitely stale below
  }
  if (nowMs - acquiredAt <= BACKUP_LOCK_STALE_MS) return null // held, not stale → busy
  try {
    try {
      fs.unlinkSync(fp)
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e // already gone (raced away) is fine; anything else is real
    }
    writeLockFile(fp, process.pid, nowMs, token)
    return { path: fp, token }
  } catch {
    return null // lost the steal race to another process — busy
  }
}

/** Release only a lock this exact acquire still owns — a stolen-from lock is never this holder's to remove. */
export function releaseBackupLock(handle: BackupLockHandle): void {
  try {
    const cur = JSON.parse(fs.readFileSync(handle.path, 'utf-8'))
    if (cur?.token === handle.token) fs.unlinkSync(handle.path)
  } catch {
    // already gone, or held by someone else now — nothing this holder should touch
  }
}

// ── Pure pieces (unit-tested) ────────────────────────────────────────────────

/**
 * The exact argv of the automatic push. Pure so a test can pin its shape: one
 * remote, one same-name branch refspec, no tag following, nothing that could
 * force, delete, mirror or widen. `--end-of-options` ends option parsing, so
 * the remote name is a positional whatever it looks like — a `--force`-shaped
 * name resolves (or fails) as a remote, never as the flag (QA F1).
 */
export function backupPushArgs(remote: string, branch: string): string[] {
  return ['push', '--no-follow-tags', '--end-of-options', remote, `refs/heads/${branch}:refs/heads/${branch}`]
}

/**
 * Is `name` a legal git remote NAME? Cheap structural refusals first (a leading
 * `-` is flag-shaped, `:` is refspec-shaped, whitespace is two argv words),
 * then git's own rule — `git check-ref-format --allow-onelevel`, the same
 * check `git remote add` applies — run with NO repository, so a bad value from
 * config never reaches a git call on the meta repo. Pure over its input; the
 * only I/O is that one plumbing call.
 */
export async function isValidRemoteName(name: string): Promise<boolean> {
  if (!name || name.startsWith('-') || /[:\s]/.test(name)) return false
  try {
    await execFileAsync('git', ['check-ref-format', '--allow-onelevel', name], {
      timeout: 5_000,
      env: scrubbedGitEnv(),
    })
    return true
  } catch {
    return false
  }
}

export interface BackupDecisionInput {
  /** Current po-state.stage (null when unreadable). */
  stage: string | null
  /** UTC calendar date of "now", YYYY-MM-DD. */
  todayUtc: string
  /** Epoch ms of "now" (backoff arithmetic). */
  nowMs: number
  /** Commits ahead of the remote-tracking ref (0 = nothing to push). */
  aheadCount: number
}

/**
 * Stage boundary + once daily, as ONE decision so the pair cannot double-fire:
 *  1. nothing ahead → skip, no network at all — and if a past attempt is
 *     latched as failed, that failure clears here too (T-643): nothing ahead
 *     of the remote proves nothing of ours is missing from it, whatever route
 *     got it there;
 *  2. the last attempt failed less than the backoff ago → skip;
 *  3. stage differs from the stage recorded at the last successful push →
 *     push (`stage-boundary`) — this also records today's date, so
 *  4. a same-day daily check finds the date already consumed → skip;
 *  5. otherwise a new UTC day → push (`daily`).
 */
export function decideBackup(state: MetaBackupState, input: BackupDecisionInput): MetaBackupDecision {
  if (input.aheadCount <= 0) {
    return state.last_ok === false
      ? { push: false, reason: 'up-to-date', clearsFailure: true }
      : { push: false, reason: 'up-to-date' }
  }
  if (state.last_ok === false && state.last_attempt_at) {
    const t = Date.parse(state.last_attempt_at)
    if (Number.isFinite(t) && input.nowMs - t < BACKUP_RETRY_BACKOFF_MS) {
      return { push: false, reason: 'backoff' }
    }
  }
  if ((state.last_pushed_stage ?? null) !== input.stage) return { push: true, reason: 'stage-boundary' }
  if (state.last_push_date !== input.todayUtc) return { push: true, reason: 'daily' }
  return { push: false, reason: 'already-today' }
}

// ── Project reads ─────────────────────────────────────────────────────────────

/** `meta.backup_remote` from <stateDir>/config.json, default `backup`. */
export function metaBackupRemoteName(projectDir: string): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(stateDir(projectDir), 'config.json'), 'utf-8'))
    const v = cfg?.meta?.backup_remote
    if (typeof v === 'string' && v.trim()) return v.trim()
  } catch {
    // missing / corrupt → default
  }
  return DEFAULT_META_BACKUP_REMOTE
}

function readStage(projectDir: string): string | null {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(stateDir(projectDir), 'po-state.json'), 'utf-8'))
    return typeof st?.stage === 'string' ? st.stage : null
  } catch {
    return null
  }
}

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function trimError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // execFile's message starts with "Command failed: git …" — keep git's own words.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const gitLines = lines.filter((l) => !l.startsWith('Command failed:'))
  return (gitLines.length ? gitLines : lines).slice(0, 3).join(' | ').slice(0, 300)
}

/** Failure record: keeps the last SUCCESS fields, overwrites the attempt fields. */
function recordFailure(
  projectDir: string,
  f: { remote: string; branch?: string; attemptAt: string; error: string },
): void {
  const prev = readMetaBackupState(projectDir)
  writeMetaBackupState(projectDir, {
    ...prev,
    remote: f.remote,
    ...(f.branch ? { branch: f.branch } : {}),
    last_attempt_at: f.attemptAt,
    last_ok: false,
    last_error: f.error,
  })
}

// ── The tick ──────────────────────────────────────────────────────────────────

/**
 * One automatic-backup decision + (at most) one push. Never throws; every
 * outcome is a result, and every ATTEMPT is recorded in the state file.
 */
export async function metaBackupTick(
  projectDir: string,
  opts: { now?: Date } = {},
): Promise<MetaBackupTickResult> {
  const now = opts.now ?? new Date()
  if (!metaRepoExists(projectDir)) return { attempted: false, pushed: false, reason: 'meta-repo-missing' }

  const remote = metaBackupRemoteName(projectDir)
  // Refused BEFORE any git call on the meta repo: config may pick a registered
  // remote by name, never smuggle a flag or a refspec into the push argv.
  if (!(await isValidRemoteName(remote))) {
    const error = `meta.backup_remote ${JSON.stringify(remote)} is not a legal remote name — refused`
    recordFailure(projectDir, { remote, attemptAt: now.toISOString(), error })
    return { attempted: false, pushed: false, reason: 'remote-name-invalid', remote, error }
  }
  const remotes = await listMetaRemotes(projectDir)
  if (!remotes.some((r) => r.name === remote)) {
    // No remote at all = not configured (doctor already says so, T-427) — quiet.
    // Remotes exist but not THIS one = renamed/removed backup (QA F2) — a
    // failure the latch must carry so `prdt` and `prdt doctor` say it.
    if (remotes.length === 0) return { attempted: false, pushed: false, reason: 'remote-missing', remote }
    // T-699: the CLI's own failure hint (scripts/prdt `_meta_backup_fail_hint`)
    // keys off this exact phrase ("names no remote of the meta repo (have:")
    // to tell this config-shaped failure apart from a transient one — keep
    // that substring if this message ever changes.
    const error = `meta.backup_remote '${remote}' names no remote of the meta repo (have: ${remotes.map((r) => r.name).join(', ')})`
    recordFailure(projectDir, { remote, attemptAt: now.toISOString(), error })
    return { attempted: false, pushed: false, reason: 'remote-missing', remote, error }
  }

  try {
    await metaGit(projectDir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  } catch {
    return { attempted: false, pushed: false, reason: 'no-commits', remote }
  }
  let branch = ''
  try {
    branch = (await metaGit(projectDir, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim()
  } catch {
    /* detached */
  }
  if (!branch) return { attempted: false, pushed: false, reason: 'detached-head', remote }

  // T-686: from here on (the ahead-count read, the decision, and any push +
  // its state write) this tick must not interleave with another tick reading
  // or writing the SAME meta git-dir — that interleaving is exactly what let
  // two `prdt` processes both decide `push: true` off the same on-disk
  // tracking ref and race the remote. A tick that loses this race for the
  // lock defers entirely rather than attempting a push it can no longer
  // safely reason about.
  const lock = acquireBackupLock(projectDir, now.getTime())
  if (!lock) return { attempted: false, pushed: false, reason: 'concurrent', remote, branch }

  try {
    // Ahead count off the LOCAL remote-tracking ref — no fetch, no network here.
    const trackingRef = `refs/remotes/${remote}/${branch}`
    let ahead: number
    try {
      await metaGit(projectDir, ['rev-parse', '--verify', '--quiet', trackingRef])
      const out = (await metaGit(projectDir, ['rev-list', '--count', `${trackingRef}..HEAD`])).stdout.trim()
      ahead = Number.parseInt(out, 10)
      if (!Number.isFinite(ahead)) ahead = 1
    } catch {
      // never pushed → everything is ahead
      const out = (await metaGit(projectDir, ['rev-list', '--count', 'HEAD'])).stdout.trim()
      ahead = Number.parseInt(out, 10) || 1
    }

    const state = readMetaBackupState(projectDir)
    const stage = readStage(projectDir)
    const decision = decideBackup(state, {
      stage,
      todayUtc: utcDate(now),
      nowMs: now.getTime(),
      aheadCount: ahead,
    })
    if (!decision.push) {
      if (decision.clearsFailure) {
        // T-643: nothing ahead of the remote-tracking ref, but the latch still
        // says the last attempt failed — that attempt's target is already on
        // the remote (pushed by another route through this same git-dir, so
        // the tracking ref already reflects it), so the failure it recorded no
        // longer describes reality. Only `last_ok`/`last_error` move; NOT a
        // push, so `last_push_at` / `last_push_date` / `last_pushed_stage` /
        // `last_pushed_sha` (this tool's own record of the last push it made)
        // stay untouched — that is what still tells "we pushed it" apart from
        // "it became current some other way" (last_pushed_sha vs the current
        // tracking ref), so no extra field is needed for that distinction.
        const cleared: MetaBackupState = { ...state, last_ok: true }
        delete cleared.last_error
        writeMetaBackupState(projectDir, cleared)
      }
      return { attempted: false, pushed: false, reason: decision.reason, remote, branch, ahead }
    }

    const attemptAt = now.toISOString()
    try {
      await metaGit(projectDir, backupPushArgs(remote, branch), {
        timeout: PUSH_TIMEOUT_MS,
        // Detached, no terminal: a credential prompt must fail fast, not hang.
        env: { GIT_TERMINAL_PROMPT: '0' },
      })
      const sha = (await metaGit(projectDir, ['rev-parse', 'HEAD'])).stdout.trim()
      writeMetaBackupState(projectDir, {
        last_push_at: attemptAt,
        last_push_date: utcDate(now),
        last_pushed_stage: stage,
        last_pushed_sha: sha,
        remote,
        branch,
        last_attempt_at: attemptAt,
        last_ok: true,
      })
      return { attempted: true, pushed: true, reason: decision.reason, remote, branch, ahead }
    } catch (err) {
      const error = trimError(err)
      recordFailure(projectDir, { remote, branch, attemptAt, error })
      return { attempted: true, pushed: false, reason: decision.reason, remote, branch, ahead, error }
    }
  } finally {
    releaseBackupLock(lock)
  }
}
