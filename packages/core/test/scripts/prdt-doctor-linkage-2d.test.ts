/**
 * prdt-doctor-linkage-2d.test.ts — T-674 slice 2d, black-box over the real
 * `prdt` CLI (mirrors prdt-doctor-meta-drift.test.ts for the two-git-repo
 * fixture technique, prdt-doctor-linkage-edges.test.ts for the edge-value
 * check style).
 *
 * Design SoT: docs/artifacts/v1.10/linkage-design.md §2.2 A(a) / §2.7 (W7) ·
 * §2.3 (vocab `label` field).
 *
 *   W7 — a ticket's close TIME = the meta repo's own `[status-change: …→done]`
 *   commit naming it (fallback: `closed:` date at midnight); a code-git commit
 *   SUBJECT trailer `(T-NNN…)` naming that ticket strictly after that time
 *   produces one report-only line, never a violation.
 *
 *   label — `features.vocab[*].label` is an optional string; shape validation
 *   is silent on it and warns only when it is present and not a string.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string
let binDir: string

/** Same fixture technique as prdt-doctor-meta-drift.test.ts: doctor's own
 *  "resident machine resources" check shells out to the REAL `uptime` —
 *  stubbing it keeps every run in this file deterministic. */
function fakeUptimeBinDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-linkage-2d-bin-'))
  fs.writeFileSync(path.join(dir, 'uptime'),
    '#!/bin/sh\necho "12:00  up 1 day, 2 users, load averages: 1.00 1.00 1.00"\n')
  fs.chmodSync(path.join(dir, 'uptime'), 0o755)
  return dir
}

function runPrdt(cli: string, args: string[]): string {
  return execFileSync('python3', [cli, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    timeout: subprocessTimeout('cli'),
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(PRDT_CLI, ['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(): string {
  try {
    return runPrdt(PRDT_CLI, ['doctor'])
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

function metaGit(args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', [
    '--git-dir', path.join(projectDir, '.prdt', 'meta.git'),
    '--work-tree', projectDir, ...args,
  ], { cwd: projectDir, encoding: 'utf-8', env: { ...process.env, ...env } }).trim()
}

function codeGit(args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, {
    cwd: path.join(projectDir, 'code'), encoding: 'utf-8', env: { ...process.env, ...env },
  }).trim()
}

/** One `[status-change: open→done]` meta commit for `id`, dated `iso`. */
function metaCloseCommit(id: string, iso: string): void {
  metaGit(['commit', '-q', '--allow-empty', '--date', iso,
    '-m', `${id} [status-change: open→done] ${id}`],
    { GIT_COMMITTER_DATE: iso })
}

/** One code-git commit whose subject ends in a `(T-NNN, …)` trailer, dated `iso`. */
function codeTrailerCommit(subject: string, iso: string): string {
  codeGit(['commit', '-q', '--allow-empty', '--date', iso, '-m', subject],
    { GIT_COMMITTER_DATE: iso })
  return codeGit(['rev-parse', 'HEAD']).slice(0, 7)
}

function ticket(id: string, version: string, extra: Record<string, string> = {}, status = 'open'): void {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const extraLines = Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\n` +
    `assignee: developer\ncreated: 2026-01-01\n${extraLines}${extraLines ? '\n' : ''}---\n\nbody\n`)
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-2d-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  binDir = fakeUptimeBinDir()
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
  fs.rmSync(binDir, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — W7 ticket close drift (T-674 slice 2d)', () => {
  test('fires: a code-git commit trailer names a done ticket after its meta close time', () => {
    runInit()
    ticket('T-26', 'v1.10', { closed: '2026-09-09' }, 'done')
    metaCloseCommit('T-26', '2026-09-09T15:14:05+09:00')
    const sha1 = codeTrailerCommit('feat: carry over item 2 (T-26)', '2026-09-09T16:06:08+09:00')
    const sha2 = codeTrailerCommit('feat: carry over item 3 (T-26)', '2026-09-09T16:06:37+09:00')
    const out = doctor()
    expect(out).toContain(`T-26: 2 commit(s) after close (${sha1}, ${sha2}) — ` +
      'reopen it or split the work into a ticket with deps: [T-26]')
  })

  test('silent: the only commit naming the ticket is BEFORE its meta close time', () => {
    runInit()
    ticket('T-27', 'v1.10', { closed: '2026-09-09' }, 'done')
    metaCloseCommit('T-27', '2026-09-09T15:14:05+09:00')
    codeTrailerCommit('feat: work in progress (T-27)', '2026-09-09T10:00:00+09:00')
    expect(doctor()).not.toContain('T-27: ')
  })

  test('silent: a done ticket with no code commit naming it at all', () => {
    runInit()
    ticket('T-28', 'v1.10', { closed: '2026-09-09' }, 'done')
    metaCloseCommit('T-28', '2026-09-09T15:14:05+09:00')
    codeTrailerCommit('feat: unrelated change (T-999)', '2026-09-10T00:00:00+09:00')
    expect(doctor()).not.toContain('T-28: ')
  })

  test('silent: an OPEN ticket never fires even with a later same-id commit', () => {
    runInit()
    ticket('T-29', 'v1.10', {}, 'open')
    codeTrailerCommit('feat: still working (T-29)', '2026-09-09T16:06:37+09:00')
    expect(doctor()).not.toContain('T-29: ')
  })

  test('fallback: no meta status-change commit → closed: date at local midnight is the close time', () => {
    runInit()
    ticket('T-30', 'v1.10', { closed: '2026-09-01' }, 'done')
    // no metaCloseCommit at all — this ticket was never named by a meta beat
    codeTrailerCommit('fix: late patch (T-30)', '2026-09-02T00:00:01+00:00')
    expect(doctor()).toMatch(/T-30: 1 commit\(s\) after close \([0-9a-f]{7}\)/)
  })

  test('a body mention (no subject trailer) never counts — strict subject-trailer form only', () => {
    runInit()
    ticket('T-31', 'v1.10', { closed: '2026-09-01' }, 'done')
    metaCloseCommit('T-31', '2026-09-01T00:00:00+00:00')
    // T-NNN appears in the subject but NOT as a trailing parenthetical group
    codeTrailerCommit('fix: relates to T-31 in prose', '2026-09-02T00:00:00+00:00')
    expect(doctor()).not.toContain('T-31: ')
  })

  test('report-only: firing W7 never moves the discipline↔execution violations count', () => {
    runInit()
    ticket('T-32', 'v1.10', { closed: '2026-09-01' }, 'done')
    metaCloseCommit('T-32', '2026-09-01T00:00:00+00:00')
    const before = doctor()
    const beforeLine = before.split('\n').find((l) => l.includes('doctor: discipline↔execution'))!
    const beforeViolations = Number(beforeLine.match(/violations=(\d+)/)![1])

    codeTrailerCommit('fix: late patch (T-32)', '2026-09-02T00:00:00+00:00')
    const after = doctor()
    expect(after).toContain('T-32: 1 commit(s) after close')
    const afterLine = after.split('\n').find((l) => l.includes('doctor: discipline↔execution'))!
    const afterViolations = Number(afterLine.match(/violations=(\d+)/)![1])
    expect(afterViolations).toBe(beforeViolations)
  })
})

describe.skipIf(!PYTHON3)('prdt doctor / features vocab — label field (T-674 slice 2d)', () => {
  function writeVocabConfig(vocab: Record<string, unknown>): void {
    const cfgPath = path.join(projectDir, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    cfg.features = { vocab }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
  }

  test('a string label is accepted — no shape warning', () => {
    runInit()
    writeVocabConfig({ gui: { kind: 'feature', aliases: [], parent: null, since: null, label: 'GUI 어댑터' } })
    ticket('T-1', 'v1.10', { feature: 'gui' })
    expect(doctor()).not.toContain("'gui' label")
  })

  test('a non-string label warns, and does not silently pass as if absent', () => {
    runInit()
    writeVocabConfig({ gui: { kind: 'feature', aliases: [], parent: null, since: null, label: 42 } })
    ticket('T-1', 'v1.10', { feature: 'gui' })
    expect(doctor()).toContain("feature: config features.vocab 'gui' label is not a string")
  })

  test('an absent label is silent (optional field, not required)', () => {
    runInit()
    writeVocabConfig({ gui: { kind: 'feature', aliases: [], parent: null, since: null } })
    ticket('T-1', 'v1.10', { feature: 'gui' })
    expect(doctor()).not.toContain("label")
  })

  test('`prdt features vocab --seed` leaves label unset', () => {
    runInit()
    ticket('T-1', 'v1.10', { feature: 'gui' })
    runPrdt(PRDT_CLI, ['features', 'vocab', '--seed'])
    const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.features.vocab.gui).not.toHaveProperty('label')
  })
})
