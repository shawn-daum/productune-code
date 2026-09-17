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

export type BackupPushReason = 'stage-boundary' | 'daily'

export interface MetaBackupDecision {
  push: boolean
  reason: BackupPushReason | BackupSkipReason
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
 *  1. nothing ahead → skip, no network at all;
 *  2. the last attempt failed less than the backoff ago → skip;
 *  3. stage differs from the stage recorded at the last successful push →
 *     push (`stage-boundary`) — this also records today's date, so
 *  4. a same-day daily check finds the date already consumed → skip;
 *  5. otherwise a new UTC day → push (`daily`).
 */
export function decideBackup(state: MetaBackupState, input: BackupDecisionInput): MetaBackupDecision {
  if (input.aheadCount <= 0) return { push: false, reason: 'up-to-date' }
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
}
