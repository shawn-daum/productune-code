/**
 * meta-autosave.test.ts — T-367 meta autosave beat wiring.
 *
 * Logic under test (doctrine #3, test-first):
 *  - batch transition detection: baseline-not-transition, once-per-beat
 *    consumption via persist(), same signals as detectChange.
 *  - metaAutosaveTick lifecycle: silent no-op without meta.git (snapshot
 *    untouched), transition-labeled commit, fallback subject on a
 *    no-transition meta write, diff-empty skip on a quiet beat.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { detectTicketTransitionsBatch } from '../../src/git-workflow/autosave'
import {
  metaAutosaveTick,
  buildTickMessage,
  META_BEAT_FALLBACK_SUBJECT,
} from '../../src/git-workflow/meta-autosave'
import { initMetaRepo, metaGitDir, scanMetaHistory } from '../../src/git-workflow/meta-git'
import { naturalizeCommit } from '../../src/history/naturalize'

let projectDir: string
let fakeHome: string
const savedHome = process.env.HOME

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function writeTicket(id: string, status: string, version = 'v1.2'): string {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, `${id}.md`)
  fs.writeFileSync(fp, `---\nid: ${id}\nstatus: ${status}\n---\n\n## Request\n\nbody\n`)
  return fp
}

/** A prdt project = a code git repo + .prdt state dir + a ticket. */
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-as-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 'code@test'], root)
  git(['config', 'user.name', 'code'], root)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, 'code.ts'), 'export const x = 1\n')
  git(['add', 'code.ts'], root)
  git(['commit', '-qm', 'code init'], root)
  return root
}

beforeEach(() => {
  // Hermetic snapshot store — autosave snapshots live under $HOME/.productune.
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-home-'))
  process.env.HOME = fakeHome
  projectDir = makeProject()
})

afterEach(() => {
  process.env.HOME = savedHome
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

// ── detectTicketTransitionsBatch ──────────────────────────────────────────────

test('first sight is a baseline, not a transition; change after persist is reported once', () => {
  writeTicket('T-900', 'open')

  const read = () => [{ ticketId: 'T-900', content: fs.readFileSync(path.join(projectDir, 'docs', 'tickets', 'v1.2', 'T-900.md'), 'utf-8') }]

  const first = detectTicketTransitionsBatch(projectDir, read())
  expect(first.transitions).toEqual([])
  first.persist()

  writeTicket('T-900', 'done')
  const second = detectTicketTransitionsBatch(projectDir, read())
  expect(second.transitions).toHaveLength(1)
  expect(second.transitions[0]).toMatchObject({
    ticketId: 'T-900',
    changeReason: 'status-change',
    before: 'open',
    after: 'done',
  })
  second.persist()

  // consumed — a third scan with unchanged content reports nothing
  const third = detectTicketTransitionsBatch(projectDir, read())
  expect(third.transitions).toEqual([])
})

test('without persist() a transition is re-detected on the next scan (commit-failure safety)', () => {
  writeTicket('T-901', 'open')
  const read = () => [{ ticketId: 'T-901', content: fs.readFileSync(path.join(projectDir, 'docs', 'tickets', 'v1.2', 'T-901.md'), 'utf-8') }]

  detectTicketTransitionsBatch(projectDir, read()).persist()
  writeTicket('T-901', 'done')

  const scan1 = detectTicketTransitionsBatch(projectDir, read())
  expect(scan1.transitions).toHaveLength(1)
  // no persist — simulate a failed commit

  const scan2 = detectTicketTransitionsBatch(projectDir, read())
  expect(scan2.transitions).toHaveLength(1)
  expect(scan2.transitions[0].after).toBe('done')
})

// ── buildTickMessage ──────────────────────────────────────────────────────────

test('tick message uses the autosave format and appends the extra-transition count', () => {
  const t = (id: string) => ({
    ticketId: id, changeReason: 'status-change' as const, before: 'open', after: 'done', summary: id,
  })
  expect(buildTickMessage([])).toBe(META_BEAT_FALLBACK_SUBJECT)
  expect(buildTickMessage([t('T-1')])).toBe('T-1 [status-change: open→done] T-1')
  expect(buildTickMessage([t('T-1'), t('T-2')])).toBe('T-1 [status-change: open→done] T-1 (+1)')
  // naturalize round-trip — history UI shows the summary, not the metadata
  expect(naturalizeCommit(buildTickMessage([t('T-1')])).ticketId).toBe('T-1')
})

// ── metaAutosaveTick ──────────────────────────────────────────────────────────

test('meta repo missing → silent no-op that does NOT consume the snapshot', async () => {
  writeTicket('T-902', 'open')

  const res = await metaAutosaveTick(projectDir)
  expect(res.committed).toBe(false)
  expect(res.skipReason).toBe('meta-repo-missing')

  // snapshot untouched — after the repo appears, the SAME beat content still
  // yields the baseline→transition sequence from scratch
  const snapDir = path.join(fakeHome, '.productune', 'state', 'autosave-snapshots')
  const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir) : []
  expect(snaps).toEqual([])
})

test('a ticket status transition lands as ONE labeled meta commit', async () => {
  writeTicket('T-903', 'open')
  await initMetaRepo(projectDir)

  // beat 1: baseline + initial snapshot commit (meta files exist → diff)
  const first = await metaAutosaveTick(projectDir)
  expect(first.committed).toBe(true)
  expect(first.message).toBe(META_BEAT_FALLBACK_SUBJECT)

  // beat 2: status transition
  writeTicket('T-903', 'done')
  const second = await metaAutosaveTick(projectDir)
  expect(second.committed).toBe(true)
  expect(second.transitions).toHaveLength(1)
  expect(second.message).toBe('T-903 [status-change: open→done] T-903')

  const history = await scanMetaHistory(projectDir)
  expect(history[0].subject).toBe('T-903 [status-change: open→done] T-903')

  // the meta commit never touched the code repo
  expect(git(['log', '--oneline']).split('\n')).toHaveLength(1)
})

test('quiet beat (no diff) skips with diff-empty; no empty commits pile up', async () => {
  writeTicket('T-904', 'open')
  await initMetaRepo(projectDir)
  await metaAutosaveTick(projectDir)

  const quiet = await metaAutosaveTick(projectDir)
  expect(quiet.committed).toBe(false)
  expect(quiet.skipReason).toBe('diff-empty')

  const count = git(['--git-dir', metaGitDir(projectDir), 'rev-list', '--count', 'HEAD'])
  expect(count).toBe('1')
})

test('meta write without a ticket transition commits under the fallback subject', async () => {
  writeTicket('T-905', 'open')
  await initMetaRepo(projectDir)
  await metaAutosaveTick(projectDir)

  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# PRD v2\n')

  const res = await metaAutosaveTick(projectDir)
  expect(res.committed).toBe(true)
  expect(res.transitions).toEqual([])
  expect(res.message).toBe(META_BEAT_FALLBACK_SUBJECT)
})
