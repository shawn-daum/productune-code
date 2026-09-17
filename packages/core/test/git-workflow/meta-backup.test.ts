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
  BACKUP_RETRY_BACKOFF_MS,
  type MetaBackupState,
} from '../../src/git-workflow/meta-backup'

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
  metaGitSync(['remote', 'add', 'backup', backup])
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
  metaGitSync(['remote', 'add', 'vault', backup]) // registered under the wrong name; config says `backup`
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
  metaGitSync(['remote', 'add', 'backup', backup])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
  const remoteHead = await divergeFrom(backup, branch)
  const remoteRefsBefore = git(['for-each-ref', '--format=%(refname) %(objectname)'], backup)

  // exactly QA's forgery: git lists both sections as remotes, `git remote add` never would
  forgeRemoteSection('--force', '/nonexistent')
  forgeRemoteSection(`refs/heads/${branch}:refs/heads/${branch}`, backup)
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
  metaGitSync(['remote', 'add', 'backup', backup])
  const branch = metaGitSync(['symbolic-ref', '--short', 'HEAD'])
  for (const bad of ['--mirror', '--tags', '--all', `refs/heads/${branch}:refs/heads/${branch}`]) {
    forgeRemoteSection(bad, backup)
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
  metaGitSync(['remote', 'add', 'backup', backup])
  metaGitSync(['remote', 'add', 'other', other])
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
  metaGitSync(['remote', 'add', 'vault', vault])
  metaGitSync(['remote', 'add', 'backup', decoy])
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
  metaGitSync(['remote', 'add', 'backup', backup])
  const day1 = new Date('2026-09-11T02:00:00Z')
  expect((await metaBackupTick(projectDir, { now: day1 })).pushed).toBe(true)

  // nothing ahead → up-to-date, no attempt
  expect(await metaBackupTick(projectDir, { now: day1 })).toMatchObject({ attempted: false, reason: 'up-to-date', ahead: 0 })

  // new commit, same stage, same day → already-today (no network). Prove "no
  // network" by pointing the remote at a dead url first: an attempt would fail.
  await metaCommit('second')
  metaGitSync(['remote', 'set-url', 'backup', path.join(os.tmpdir(), 'does-not-exist-' + process.pid)])
  const sameDay = await metaBackupTick(projectDir, { now: new Date('2026-09-11T09:00:00Z') })
  expect(sameDay).toMatchObject({ attempted: false, reason: 'already-today', ahead: 1 })
  expect(readMetaBackupState(projectDir).last_ok).toBe(true)
  metaGitSync(['remote', 'set-url', 'backup', backup])

  // stage boundary the same day → pushes (the daily latch does not block it)
  writePoState('ship')
  const stagePush = await metaBackupTick(projectDir, { now: new Date('2026-09-11T10:00:00Z') })
  expect(stagePush).toMatchObject({ pushed: true, reason: 'stage-boundary' })
  expect(bareHead(backup, stagePush.branch!)).toBe(metaGitSync(['rev-parse', 'HEAD']))
})

test('trigger, next UTC day: same stage, one more commit → daily push', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', backup])
  expect((await metaBackupTick(projectDir, { now: new Date('2026-09-11T02:00:00Z') })).pushed).toBe(true)
  await metaCommit('third')
  const daily = await metaBackupTick(projectDir, { now: new Date('2026-09-12T00:30:00Z') })
  expect(daily).toMatchObject({ pushed: true, reason: 'daily' })
  expect(bareHead(backup, daily.branch!)).toBe(metaGitSync(['rev-parse', 'HEAD']))
  expect(readMetaBackupState(projectDir).last_push_date).toBe('2026-09-12')
})

test('failure: unreachable remote is recorded with git\'s words, backs off, and a later success clears it', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', path.join(os.tmpdir(), 'no-such-remote-' + process.pid)])
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
  metaGitSync(['remote', 'set-url', 'backup', backup])
  const ok = await metaBackupTick(projectDir, { now: new Date(t.getTime() + BACKUP_RETRY_BACKOFF_MS + 1000) })
  expect(ok.pushed).toBe(true)
  const st2 = readMetaBackupState(projectDir)
  expect(st2.last_ok).toBe(true)
  expect(st2.last_error).toBeUndefined()
})

test('never force: a diverged backup remote rejects the push and keeps its own history', async () => {
  const backup = makeBare('backup')
  metaGitSync(['remote', 'add', 'backup', backup])
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
