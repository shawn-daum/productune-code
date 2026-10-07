/**
 * meta-backup.test.ts — T-504 automatic meta backup push.
 *
 * What this file PROVES (the ticket's acceptance, mechanism side):
 *  - scope: the automatic path reaches the meta repo's `meta.backup_remote`
 *    and nothing else — not the code repository or its remote, not a second
 *    meta remote, not tags (even with push.followTags set), never a force
 *    (a diverged remote is rejected and left intact) — and config can only
 *    NAME a registered remote: a flag- or refspec-shaped value hand-written
 *    into config.json + the meta git-dir config (QA F1) is refused before any
 *    git call, and even past that guard `--end-of-options` keeps git reading
 *    it as a remote name.
 *  - trigger: stage boundary + once daily, collapsed into one decision — a
 *    stage push consumes the day, nothing ahead means no network attempt.
 *  - failure: an unreachable remote is recorded (state file, error text), and
 *    the next attempt backs off; success clears the failure.
 *  - concurrency (T-686): two ticks against the SAME meta git-dir at once
 *    serialize on a file lock — exactly one push lands, the other defers
 *    quietly (`reason: 'concurrent'`), and neither ever reports a failure
 *    for content the remote already holds; a crashed holder's stale lock is
 *    stolen rather than wedging every future tick.
 *
 * Fixtures are LOCAL bare repos only — the real backup remote is never touched.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach, describe } from 'vitest'
import { initMetaRepo, metaGitDir, commitMeta } from '../../src/git-workflow/meta-git'
import {
  metaBackupTick,
  decideBackup,
  backupPushArgs,
  readMetaBackupState,
  metaBackupStatePath,
  metaBackupRemoteName,
  isValidRemoteName,
  acquireBackupLock,
  releaseBackupLock,
  BACKUP_RETRY_BACKOFF_MS,
  BACKUP_LOCK_FILE,
  BACKUP_LOCK_STALE_MS,
  type MetaBackupState,
} from '../../src/git-workflow/meta-backup'
import { networkAlias } from '../helpers/network-remote'

let projectDir: string
let tmpDirs: string[] = []

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}
function metaGitSync(args: string[]): string {
  return git(['--git-dir', metaGitDir(projectDir), '--work-tree', projectDir, ...args])
}
function makeBare(label: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `core-meta-bk-${label}-`))
  tmpDirs.push(d)
  git(['init', '--bare', '-q', d], d)
  return d
}
function writePoState(stage: string): void {
  fs.writeFileSync(
    path.join(projectDir, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage, version: 'v1.9', current_task: null }),
  )
}
async function metaCommit(label: string): Promise<void> {
  fs.mkdirSync(path.join(projectDir, 'docs', 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'docs', 'wiki', 'log.md'), `# log\n${label}\n`)
  const r = await commitMeta(projectDir, `docs: ${label}`)
  if (!r.committed) throw new Error(`fixture commit failed: ${r.skipReason}`)
}
function bareHead(bare: string, branch: string): string | null {
  try { return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], bare) } catch { return null }
}
function bareRefs(bare: string): string[] {
  const out = git(['for-each-ref', '--format=%(refname)'], bare)
  return out ? out.split('\n') : []
}

beforeEach(async () => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-bk-proj-'))
  tmpDirs.push(projectDir)
  // Code repo at the project root (legacy layout) with its own remote — the
  // thing the carve-out must never reach.
  git(['init', '-q', '-b', 'main'], projectDir)
  git(['config', 'user.email', 'code@test'])
  git(['config', 'user.name', 'code'])
  fs.writeFileSync(path.join(projectDir, 'app.ts'), 'export const x = 1\n')
  git(['add', 'app.ts'])
  git(['commit', '-qm', 'code init'])
  fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  writePoState('build')
  const init = await initMetaRepo(projectDir)
  if (!init.initialized) throw new Error(`initMetaRepo failed: ${init.error}`)
  await metaCommit('first')
})

afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
  tmpDirs = []
})

// ── decideBackup: the stage-boundary + daily pair as one decision ─────────────

describe('decideBackup — stage boundary + once daily, no double fire', () => {
  const day1 = '2026-09-11'
  const t0 = Date.parse('2026-09-11T01:00:00Z')

  test('nothing ahead → up-to-date, regardless of stage or date', () => {
    const st: MetaBackupState = { last_pushed_stage: 'define', last_push_date: '2020-01-01' }
    expect(decideBackup(st, { stage: 'build', todayUtc: day1, nowMs: t0, aheadCount: 0 })).toEqual({ push: false, reason: 'up-to-date' })
  })

  test('first ever run (empty state) with commits ahead → push', () => {
    const d = decideBackup({}, { stage: 'build', todayUtc: day1, nowMs: t0, aheadCount: 79 })
    expect(d.push).toBe(true)
  })

  test('stage changed since the last push → stage-boundary push, even same day', () => {
    const st: MetaBackupState = { last_pushed_stage: 'build', last_push_date: day1, last_ok: true }
    expect(decideBackup(st, { stage: 'ship', todayUtc: day1, nowMs: t0, aheadCount: 3 })).toEqual({ push: true, reason: 'stage-boundary' })
  })

  test('same stage, same UTC day → already-today (the daily beat collapses into the stage push)', () => {
    const st: MetaBackupState = { last_pushed_stage: 'ship', last_push_date: day1, last_ok: true }
    expect(decideBackup(st, { stage: 'ship', todayUtc: day1, nowMs: t0, aheadCount: 3 })).toEqual({ push: false, reason: 'already-today' })
  })

  test('same stage, new UTC day → daily push', () => {
    const st: MetaBackupState = { last_pushed_stage: 'build', last_push_date: day1, last_ok: true }
    expect(decideBackup(st, { stage: 'build', todayUtc: '2026-09-12', nowMs: t0 + 86_400_000, aheadCount: 1 })).toEqual({ push: true, reason: 'daily' })
  })

  test('failed attempt inside the backoff window → skip; past it → retry', () => {
    const failedAt = new Date(t0).toISOString()
    const st: MetaBackupState = { last_pushed_stage: 'build', last_push_date: '2026-09-10', last_ok: false, last_attempt_at: failedAt }
    expect(decideBackup(st, { stage: 'build', todayUtc: day1, nowMs: t0 + 5 * 60_000, aheadCount: 2 }).reason).toBe('backoff')
    expect(decideBackup(st, { stage: 'build', todayUtc: day1, nowMs: t0 + BACKUP_RETRY_BACKOFF_MS + 1, aheadCount: 2 }).push).toBe(true)
  })

  // T-643: the backup became current by another route (a manual `prdt meta
  // push`, another session, a direct terminal push — all land on the SAME
  // shared tracking ref this repo reads) while a past attempt is still
  // latched as failed. Nothing ahead of the remote means whatever that
  // attempt was trying to land is already there, so the latch clears.
  test('nothing ahead but the latch says failed → clears too (the thing that was failing already resolved)', () => {
    const st: MetaBackupState = { last_pushed_stage: 'build', last_push_date: '2026-09-10', last_ok: false, last_attempt_at: new Date(t0).toISOString(), last_error: 'boom' }
    expect(decideBackup(st, { stage: 'build', todayUtc: day1, nowMs: t0, aheadCount: 0 })).toEqual({ push: false, reason: 'up-to-date', clearsFailure: true })
  })

  test('nothing ahead and no failure latched → clearsFailure is absent (nothing to clear)', () => {
    expect(decideBackup({}, { stage: 'build', todayUtc: day1, nowMs: t0, aheadCount: 0 }).clearsFailure).toBeUndefined()
    const ok: MetaBackupState = { last_ok: true }
    expect(decideBackup(ok, { stage: 'build', todayUtc: day1, nowMs: t0, aheadCount: 0 }).clearsFailure).toBeUndefined()
  })
})

// ── backupPushArgs: the argv shape is the scope ───────────────────────────────

test('backupPushArgs — one remote, one same-name branch refspec, no tag following, options closed before the positionals', () => {
  const args = backupPushArgs('backup', 'main')
  expect(args).toEqual(['push', '--no-follow-tags', '--end-of-options', 'backup', 'refs/heads/main:refs/heads/main'])
  // the option list ends BEFORE remote + refspec: a flag-shaped remote name is
  // still a positional (QA F1 — without this, `--force` from config became the flag)
  expect(args.indexOf('--end-of-options')).toBeLessThan(args.indexOf('backup'))
  expect(args.slice(args.indexOf('--end-of-options') + 1)).toEqual(['backup', 'refs/heads/main:refs/heads/main'])
  const forbidden = ['--force', '-f', '--force-with-lease', '--mirror', '--all', '--tags', '--follow-tags', '--delete', '--prune']
  for (const f of forbidden) expect(args).not.toContain(f)
  expect(args.some((a) => a.startsWith('+'))).toBe(false)
  // exactly one positional remote and one refspec after the options
  const positional = args.slice(1).filter((a) => !a.startsWith('--'))
  expect(positional).toEqual(['backup', 'refs/heads/main:refs/heads/main'])
})

test('metaBackupRemoteName — config `meta.backup_remote` wins, default `backup`', () => {
  expect(metaBackupRemoteName(projectDir)).toBe('backup')
  fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj', meta: { backup_remote: 'vault' } }))
  expect(metaBackupRemoteName(projectDir)).toBe('vault')
})

// ── metaBackupTick against local fixtures ─────────────────────────────────────

test('no remote at all → remote-missing, quiet: no state written, nothing attempted (doctor\'s "no remote" line owns this case)', async () => {
  const res = await metaBackupTick(projectDir)
  expect(res).toMatchObject({ attempted: false, pushed: false, reason: 'remote-missing' })
  expect(fs.existsSync(metaBackupStatePath(projectDir))).toBe(false)
})

test('QA F2 — configured remote renamed away → remote-missing IS recorded in the latch (last_ok:false, git\'s names), nothing pushed', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  const remoteHead = bareHead(backup, metaGitSync(['symbolic-ref', '--short', 'HEAD']))

  metaGitSync(['remote', 'rename', 'backup', 'vault'])
  await metaCommit('after rename')
  writePoState('ship')
  const t = new Date('2026-09-11T03:00:00Z')
  const res = await metaBackupTick(projectDir, { now: t })
  expect(res).toMatchObject({ attempted: false, pushed: false, reason: 'remote-missing', remote: 'backup' })
  expect(res.error).toMatch(/'backup' names no remote of the meta repo \(have: vault\)/)
  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(false)
  expect(st.last_attempt_at).toBe(t.toISOString())
  expect(st.last_error).toBe(res.error)
  expect(st.remote).toBe('backup')
  expect(st.last_push_at).toBe('2026-09-11T02:00:00.000Z') // the earlier success stays on record
  expect(bareHead(backup, metaGitSync(['symbolic-ref', '--short', 'HEAD']))).toBe(remoteHead)
})

// Split from the test above so each stays inside the 15s budget under load.
test('QA F2, recovery — the remote renamed back past the backoff → pushes, latch failure cleared', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'vault', networkAlias(backup)]) // registered under the wrong name; config says `backup`
  const t = new Date('2026-09-11T03:00:00Z')
  const miss = await metaBackupTick(projectDir, { now: t })
  expect(miss).toMatchObject({ attempted: false, reason: 'remote-missing', remote: 'backup' })
  expect(readMetaBackupState(projectDir)).toMatchObject({ last_ok: false, remote: 'backup' })
  expect(bareRefs(backup)).toEqual([])

  metaGitSync(['remote', 'rename', 'vault', 'backup'])
  const ok = await metaBackupTick(projectDir, { now: new Date(t.getTime() + BACKUP_RETRY_BACKOFF_MS + 1000) })
  expect(ok.pushed).toBe(true)
  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(true)
  expect(st.last_error).toBeUndefined()
})

// ── QA F1 — config can NAME a registered remote, never smuggle a flag ─────────

/** Hand-edit the meta git-dir config the way `git remote add` refuses to. */
function forgeRemoteSection(name: string, url: string): void {
  fs.appendFileSync(path.join(metaGitDir(projectDir), 'config'), `[remote "${name}"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/x/*\n`)
}
function setBackupRemoteConfig(name: string): void {
  fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj', meta: { backup_remote: name } }))
}
/** The remote advanced independently (a second machine), then a local commit → diverged. */
async function divergeFrom(backup: string, branch: string): Promise<string> {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-bk-clone-'))
  tmpDirs.push(clone)
  git(['clone', '-q', backup, clone], clone)
  git(['config', 'user.email', 'b@test'], clone)
  git(['config', 'user.name', 'b'], clone)
  fs.writeFileSync(path.join(clone, 'remote-only.md'), 'remote side\n')
  git(['add', 'remote-only.md'], clone)
  git(['commit', '-qm', 'remote side'], clone)
  git(['push', '-q', 'origin', branch], clone)
  await metaCommit('local side')
  return bareHead(backup, branch)!
}

test('QA F1 fixture — `--force` in config + forged `[remote "--force"]` and colon-named sections: refused, diverged remote byte-identical', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
  const remoteHead = await divergeFrom(backup, branch)
  const remoteRefsBefore = git(['for-each-ref', '--format=%(refname) %(objectname)'], backup)

  // exactly QA's forgery: git lists both sections as remotes, `git remote add` never would
  forgeRemoteSection('--force', networkAlias('/nonexistent'))
  forgeRemoteSection(`refs/heads/${branch}:refs/heads/${branch}`, networkAlias(backup))
  setBackupRemoteConfig('--force')
  expect(metaGitSync(['remote'])).toContain('--force')
  writePoState('ship') // a boundary — the decision alone would say push

  const res = await metaBackupTick(projectDir, { now: new Date('2026-09-11T03:00:00Z') })
  expect(res.pushed).toBe(false)
  expect(res).toMatchObject({ attempted: false, reason: 'remote-name-invalid', remote: '--force' })
  expect(res.error).toMatch(/not a legal remote name/)
  expect(git(['for-each-ref', '--format=%(refname) %(objectname)'], backup)).toBe(remoteRefsBefore)
  expect(bareHead(backup, branch)).toBe(remoteHead)
  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(false)
  expect(st.last_error).toBe(res.error)

  // Defense in depth: even if a bad name got past the guard, the argv ends its
  // options first — run QA's exact argv shape with `--end-of-options` in place
  // and git resolves `--force` as a remote (its own dead url), fails, remote intact.
  let threw = ''
  try {
    metaGitSync(backupPushArgs('--force', branch))
  } catch (e) {
    threw = String((e as { stderr?: string }).stderr ?? e)
  }
  expect(threw).toMatch(/nonexistent|does not appear to be a git repository|Could not read from remote/i)
  expect(bareHead(backup, branch)).toBe(remoteHead)
})

test('QA F1 sibling — flag-shaped and refspec-shaped names are refused before any git call; plain names pass', async () => {
  for (const bad of ['--force', '--mirror', '--tags', '--all', '-f', '--delete', 'refs/heads/main:refs/heads/main', 'a:b', 'two words', '', 'x..y', 'bad^ref', 'name.lock']) {
    expect(await isValidRemoteName(bad), bad).toBe(false)
  }
  for (const ok of ['backup', 'vault', 'origin', 'my-backup', 'nas.home', 'team/backup']) {
    expect(await isValidRemoteName(ok), ok).toBe(true)
  }

  // through the tick: each forged name is registered in the git-dir and named
  // by config, the remote is real, the stage is a boundary — still refused, nothing lands
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
  for (const bad of ['--mirror', '--tags', '--all', `refs/heads/${branch}:refs/heads/${branch}`]) {
    forgeRemoteSection(bad, networkAlias(backup))
    setBackupRemoteConfig(bad)
    const res = await metaBackupTick(projectDir, { now: new Date('2026-09-11T03:00:00Z') })
    expect(res, bad).toMatchObject({ attempted: false, pushed: false, reason: 'remote-name-invalid', remote: bad })
    expect(bareRefs(backup), bad).toEqual([])
  }
  expect(readMetaBackupState(projectDir).last_ok).toBe(false)
})

test('scope: pushes the meta branch to the backup remote ONLY — code remote, other meta remote and tags untouched', async () => {
  const backup = makeBare('backup')
  const other = makeBare('other')
  const codeOrigin = makeBare('code-origin')
  git(['remote', 'add', 'origin', codeOrigin])
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  metaGitSync(['remote', 'add', 'other', networkAlias(other)])
  // A tag on the meta repo AND push.followTags=true in its config: the
  // automatic argv must still leave the tag home.
  metaGitSync(['tag', 'v9.9'])
  metaGitSync(['config', 'push.followTags', 'true'])
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
  const codeHeadBefore = git(['rev-parse', 'HEAD'])

  const res = await metaBackupTick(projectDir)
  expect(res).toMatchObject({ attempted: true, pushed: true, remote: 'backup', branch })
  expect(res.reason).toBe('stage-boundary') // empty state: stage null → 'build' is a boundary

  expect(bareHead(backup, branch)).toBe(metaGitSync(['rev-parse', 'HEAD']))
  expect(bareRefs(backup)).toEqual([`refs/heads/${branch}`]) // no refs/tags/v9.9
  expect(bareRefs(other)).toEqual([])
  expect(bareRefs(codeOrigin)).toEqual([])
  expect(git(['rev-parse', 'HEAD'])).toBe(codeHeadBefore)
  expect(git(['for-each-ref', 'refs/remotes'])).toBe('') // code repo learned no tracking ref

  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(true)
  expect(st.last_pushed_stage).toBe('build')
  expect(st.remote).toBe('backup')
  expect(st.last_push_date).toBe(new Date().toISOString().slice(0, 10))
  // the state file lives inside the git-dir, never in the meta work tree
  expect(metaBackupStatePath(projectDir).startsWith(metaGitDir(projectDir) + path.sep)).toBe(true)
  expect(metaGitSync(['status', '--porcelain'])).not.toContain('prdt-backup-state')
})

test('a configured non-default remote name is honored; the `backup`-named remote is then NOT pushed', async () => {
  const vault = makeBare('vault')
  const decoy = makeBare('decoy')
  metaGitSync(['remote', 'add', 'vault', networkAlias(vault)])
  metaGitSync(['remote', 'add', 'backup', networkAlias(decoy)])
  fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj', meta: { backup_remote: 'vault' } }))
  const res = await metaBackupTick(projectDir)
  expect(res).toMatchObject({ pushed: true, remote: 'vault' })
  expect(bareRefs(vault)).toHaveLength(1)
  expect(bareRefs(decoy)).toEqual([])
})

// Split in two so each stays inside the suite's 15s hang budget under full
// parallel load (each push round-trip is a real git subprocess pair).
test('trigger, same day: up-to-date skips, a new commit is already-today (no network), a stage change pushes', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  const day1 = new Date('2026-09-11T02:00:00Z')
  expect((await metaBackupTick(projectDir, { now: day1 })).pushed).toBe(true)

  // nothing ahead → up-to-date, no attempt
  expect(await metaBackupTick(projectDir, { now: day1 })).toMatchObject({ attempted: false, reason: 'up-to-date', ahead: 0 })

  // new commit, same stage, same day → already-today (no network). Prove "no
  // network" by pointing the remote at a dead url first: an attempt would fail.
  await metaCommit('second')
  metaGitSync(['remote', 'set-url', 'backup', networkAlias(path.join(os.tmpdir(), 'does-not-exist-' + process.pid))])
  const sameDay = await metaBackupTick(projectDir, { now: new Date('2026-09-11T09:00:00Z') })
  expect(sameDay).toMatchObject({ attempted: false, reason: 'already-today', ahead: 1 })
  expect(readMetaBackupState(projectDir).last_ok).toBe(true)
  metaGitSync(['remote', 'set-url', 'backup', networkAlias(backup)])

  // stage boundary the same day → pushes (the daily latch does not block it)
  writePoState('ship')
  const stagePush = await metaBackupTick(projectDir, { now: new Date('2026-09-11T10:00:00Z') })
  expect(stagePush).toMatchObject({ pushed: true, reason: 'stage-boundary' })
  expect(bareHead(backup, stagePush.branch!)).toBe(metaGitSync(['rev-parse', 'HEAD']))
})

test('trigger, next UTC day: same stage, one more commit → daily push', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  await metaCommit('third')
  const daily = await metaBackupTick(projectDir, { now: new Date('2026-09-12T00:30:00Z') })
  expect(daily).toMatchObject({ pushed: true, reason: 'daily' })
  expect(bareHead(backup, daily.branch!)).toBe(metaGitSync(['rev-parse', 'HEAD']))
  expect(readMetaBackupState(projectDir).last_push_date).toBe('2026-09-12')
})

test('failure: unreachable remote is recorded with git\'s words, backs off, and a later success clears it', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(path.join(os.tmpdir(), 'no-such-remote-' + process.pid))])
  const t = new Date('2026-09-11T02:00:00Z')
  const fail = await metaBackupTick(projectDir, { now: t })
  expect(fail).toMatchObject({ attempted: true, pushed: false })
  expect(fail.error).toBeTruthy()
  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(false)
  expect(st.last_attempt_at).toBe(t.toISOString())
  expect(st.last_error).toBe(fail.error)
  expect(st.last_push_at).toBeUndefined()

  // within the backoff window → no second attempt
  const soon = await metaBackupTick(projectDir, { now: new Date(t.getTime() + 60_000) })
  expect(soon).toMatchObject({ attempted: false, reason: 'backoff' })

  // remote fixed, past the backoff → success, failure fields gone
  metaGitSync(['remote', 'set-url', 'backup', networkAlias(backup)])
  const ok = await metaBackupTick(projectDir, { now: new Date(t.getTime() + BACKUP_RETRY_BACKOFF_MS + 1000) })
  expect(ok.pushed).toBe(true)
  const st2 = readMetaBackupState(projectDir)
  expect(st2.last_ok).toBe(true)
  expect(st2.last_error).toBeUndefined()
})

test('T-643: nothing ahead but the latch says failed → clears without a network attempt (backup became current by another route)', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-21T02:00:00Z') })).pushed).toBe(true)
  const goodState = readMetaBackupState(projectDir)

  // Latch a failure as if a prior tick had raced another push (through this
  // same git-dir: a manual `prdt meta push`, another session, a direct
  // terminal push) and lost — the ticket's own repro. The tracking ref is
  // already current (the fixture never diverged it), matching the "nothing
  // ahead" fixture the acceptance calls for.
  fs.writeFileSync(metaBackupStatePath(projectDir), JSON.stringify({
    ...goodState,
    last_attempt_at: '2026-09-21T07:30:00.000Z',
    last_ok: false,
    last_error: "remote rejected main -> main (cannot lock ref 'refs/heads/main': is at deadbeef but expected c0ffee00)",
  }))

  const tick = await metaBackupTick(projectDir, { now: new Date('2026-09-21T09:00:00Z') })
  expect(tick).toMatchObject({ attempted: false, reason: 'up-to-date', ahead: 0 })

  const st = readMetaBackupState(projectDir)
  expect(st.last_ok).toBe(true)
  expect(st.last_error).toBeUndefined()
  // Not a push this tick — the last actual push's own bookkeeping is
  // untouched, which is what still lets `last_pushed_sha` (vs the current
  // tracking ref) tell "we pushed it" apart from "it became current some
  // other way"; no separate field earns its keep for that.
  expect(st.last_push_at).toBe(goodState.last_push_at)
  expect(st.last_pushed_sha).toBe(goodState.last_pushed_sha)
})

test('never force: a diverged backup remote rejects the push and keeps its own history', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])

  // Advance the REMOTE independently (a second machine pushed), then commit locally.
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-bk-clone-'))
  tmpDirs.push(clone)
  git(['clone', '-q', backup, clone], clone)
  git(['config', 'user.email', 'b@test'], clone)
  git(['config', 'user.name', 'b'], clone)
  fs.writeFileSync(path.join(clone, 'remote-only.md'), 'remote side\n')
  git(['add', 'remote-only.md'], clone)
  git(['commit', '-qm', 'remote side'], clone)
  git(['push', '-q', 'origin', branch], clone)
  const remoteHead = bareHead(backup, branch)

  await metaCommit('local side')
  writePoState('retro') // a boundary, so the decision IS push
  const res = await metaBackupTick(projectDir, { now: new Date('2026-09-11T03:00:00Z') })
  expect(res).toMatchObject({ attempted: true, pushed: false })
  expect(res.error).toMatch(/rejected|non-fast-forward|fetch first|failed to push/i)
  expect(bareHead(backup, branch)).toBe(remoteHead) // remote history intact
  expect(readMetaBackupState(projectDir).last_ok).toBe(false)
})

// ── T-686: concurrent ticks against the SAME meta git-dir ────────────────────

describe('T-686 — two prdt processes triggering the auto-backup at once', () => {
  test('lock unit: acquire excludes a second acquire; release frees it; a stale lock is stolen, not left wedged', () => {
    const t0 = Date.parse('2026-09-26T02:10:00Z')
    const lock1 = acquireBackupLock(projectDir, t0)
    expect(lock1).not.toBeNull()
    expect(fs.existsSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE))).toBe(true)

    // Held, not stale → busy for a second holder, whatever "now" it passes,
    // as long as it is inside the stale window.
    expect(acquireBackupLock(projectDir, t0 + 5_000)).toBeNull()
    expect(acquireBackupLock(projectDir, t0 + BACKUP_LOCK_STALE_MS)).toBeNull()

    releaseBackupLock(lock1!)
    expect(fs.existsSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE))).toBe(false)

    // Freed → a new acquire succeeds again.
    const lock2 = acquireBackupLock(projectDir, t0 + BACKUP_LOCK_STALE_MS + 1)
    expect(lock2).not.toBeNull()

    // A crashed holder's lock (old enough to be past the stale window) is
    // stolen rather than left blocking every future tick forever.
    releaseBackupLock(lock2!)
    fs.writeFileSync(
      path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE),
      JSON.stringify({ pid: 999999, acquired_at: t0, token: 'dead-holder' }),
    )
    const revived = acquireBackupLock(projectDir, t0 + BACKUP_LOCK_STALE_MS + 1)
    expect(revived).not.toBeNull()
    expect(revived!.token).not.toBe('dead-holder')

    // release only ever removes a lock file that still holds ITS OWN token —
    // a handle from a holder that was since stolen from must never delete
    // the new holder's lock.
    fs.writeFileSync(
      path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE),
      JSON.stringify({ pid: 1, acquired_at: t0, token: 'someone-else' }),
    )
    releaseBackupLock(revived!)
    expect(fs.existsSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE))).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE), 'utf-8')).token).toBe('someone-else')
  })

  test('a held (non-stale) lock makes a concurrent tick defer quietly — no push attempted, nothing latched as failed', async () => {
    const backup = makeBare('backup')
    metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
    const t = new Date('2026-09-26T02:10:00Z')
    const held = acquireBackupLock(projectDir, t.getTime())
    expect(held).not.toBeNull()
    try {
      const res = await metaBackupTick(projectDir, { now: t })
      expect(res).toEqual({ attempted: false, pushed: false, reason: 'concurrent', remote: 'backup', branch: expect.any(String) })
      expect(fs.existsSync(metaBackupStatePath(projectDir))).toBe(false) // quiet — nothing written
      expect(bareRefs(backup)).toEqual([]) // no push even attempted
    } finally {
      releaseBackupLock(held!)
    }
  })

  // The ticket's own repro (2026-09-26): two `prdt` processes on this machine
  // spawn their own detached backup tick against the SAME meta git-dir at the
  // same instant. Both would, pre-fix, read "ahead > 0" off the same tracking
  // ref and race the remote's own ref-transaction lock — the loser reporting
  // a failure for content the winner had already landed. Driving two REAL
  // `metaBackupTick` calls concurrently (via `Promise.all`, real git
  // subprocesses underneath) reproduces exactly that race; the lock must
  // still leave exactly one push landed and NEITHER call reporting a failure.
  test('two concurrent metaBackupTick calls on the same meta git-dir: exactly one push lands, neither reports a failure', async () => {
    const backup = makeBare('backup')
    metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
    const t = new Date('2026-09-26T02:10:00Z')

    const [a, b] = await Promise.all([metaBackupTick(projectDir, { now: t }), metaBackupTick(projectDir, { now: t })])

    // Neither call ever surfaces an error — the ticket's false-failure symptom.
    expect(a.error).toBeUndefined()
    expect(b.error).toBeUndefined()

    // Exactly one of the two actually pushed; the other deferred (lock busy)
    // or found nothing left to do (it acquired the lock after the winner).
    const pushedCount = [a, b].filter((r) => r.pushed).length
    expect(pushedCount).toBe(1)
    const loser = a.pushed ? b : a
    expect(loser.pushed).toBe(false)
    expect(['concurrent', 'up-to-date', 'already-today']).toContain(loser.reason)

    // The remote holds exactly the local tip — the acceptance's own words.
    const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
    expect(bareHead(backup, branch)).toBe(metaGitSync(['rev-parse', 'HEAD']))
    expect(bareRefs(backup)).toEqual([`refs/heads/${branch}`]) // one push, one ref — not two divergent attempts

    // No failure latched by either process.
    const st = readMetaBackupState(projectDir)
    expect(st.last_ok).toBe(true)
    expect(st.last_error).toBeUndefined()

    // The lock itself is released — a third tick right after is not wedged.
    expect(fs.existsSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE))).toBe(false)
  })

  // A real failure (genuinely diverged, not a same-instant self-race) must
  // still report as such — the lock only removes the FALSE-failure race, it
  // never masks or force-resolves an actual divergence.
  test('a real failure under concurrency still reports: the lock serializes, it does not paper over a genuine divergence', async () => {
    const backup = makeBare('backup')
    metaGitSync(['remote', 'add', 'backup', networkAlias(backup)])
    expect((await metaBackupTick(projectDir, { now: new Date('2026-09-26T02:00:00Z') })).pushed).toBe(true)
    const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])

    // A genuinely different actor (a second machine) advances the remote
    // independently — this is real divergence, not this machine's own race.
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-bk-clone-'))
    tmpDirs.push(clone)
    git(['clone', '-q', backup, clone], clone)
    git(['config', 'user.email', 'b@test'], clone)
    git(['config', 'user.name', 'b'], clone)
    fs.writeFileSync(path.join(clone, 'remote-only.md'), 'remote side\n')
    git(['add', 'remote-only.md'], clone)
    git(['commit', '-qm', 'remote side'], clone)
    git(['push', '-q', 'origin', branch], clone)

    await metaCommit('local side, diverged')
    writePoState('retro') // a boundary → decision is push
    const res = await metaBackupTick(projectDir, { now: new Date('2026-09-26T03:00:00Z') })
    expect(res).toMatchObject({ attempted: true, pushed: false })
    expect(res.error).toMatch(/rejected|non-fast-forward|fetch first|failed to push/i)
    expect(readMetaBackupState(projectDir).last_ok).toBe(false)
    expect(fs.existsSync(path.join(metaGitDir(projectDir), BACKUP_LOCK_FILE))).toBe(false) // still released
  })
})
