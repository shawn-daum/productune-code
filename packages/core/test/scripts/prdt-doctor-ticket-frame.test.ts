/**
 * prdt-doctor-ticket-frame.test.ts — `prdt doctor` reads the SAME `fmt_ticket_body`
 * transform `tickets fmt`/`fmt --check` read (T-685 acceptance), so a frame slip
 * is visible without a worker remembering to run `tickets fmt --check` by hand.
 *
 * Two things are pinned:
 *   - a violation on a ticket created ON/AFTER the frame's landing date
 *     (2026-09-24) prints on the `ticket frame:` channel, naming the id and the
 *     violation `fmt --check` would itself name for that file;
 *   - it is ADVISORY (T-572 ②) — counted in the FAMILY_PROJECT `ran`, never in
 *     `violations`, so a repo with nothing else wrong still reads `verdict=clean
 *     violations=0` with the ⚠ line still printed. A ticket created BEFORE the
 *     landing date is silent — no line at all, exactly like `fmt`/`fmt --check`
 *     skip it (contracts/tickets.md annex: "an older ticket keeps its headings
 *     as written").
 *
 * Fixture idiom + the fake-uptime silencer: prdt-doctor-duplicate-ticket-id.test.ts
 * (same doctor, same non-deterministic "resident machine resources" check to
 * neutralize).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version'])

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

function fakeUptimeBinDir(dir: string): string {
  const binDir = path.join(dir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, 'uptime'),
    '#!/bin/sh\necho "12:00  up 1 day, 2 users, load averages: 1.00 1.00 1.00"\n')
  fs.chmodSync(path.join(binDir, 'uptime'), 0o755)
  return binDir
}

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-ticketframe-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  const binDir = fakeUptimeBinDir(sandbox)
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
    PATH: `${binDir}:${process.env.PATH}`,
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.10', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

function ticket(version: string, id: string, opts: {
  type?: string; status?: string; assignee?: string; created?: string; body: string
}): string {
  const dir = path.join(projectRoot, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, `type: ${opts.type ?? 'impl'}`,
    `status: ${opts.status ?? 'open'}`, `assignee: ${opts.assignee ?? 'developer'}`,
    `created: ${opts.created ?? '2026-09-24'}`, '---', '', opts.body,
  ].join('\n'))
  return `docs/tickets/${version}/${id}.md`
}

function prdRecord(version: string): void {
  const dir = path.join(projectRoot, 'docs', 'prd', 'versions')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${version}.md`), `no PRD section — docs/wiki/decision--tickets-only.md\n`)
}

function doctorOut(): string {
  return execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: subprocessTimeout('doctor') })
}

function frameWarnings(): string[] {
  const out = doctorOut()
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n')
    .filter(l => l.startsWith('⚠ ticket frame: '))
    .map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('doctor: ticket frame (advisory)', () => {
  test('a stray legacy heading on a post-landing ticket is reported by id, naming the fix fmt would apply', () => {
    ticket('v1.10', 'T-800', { created: '2026-09-24', body: '## Request\nx\n\n## Acceptance\ny\n' })
    const w = frameWarnings()
    // two violations in this fixture: `Request` -> `problem` AND `Acceptance`
    // (wrong case) -> `acceptance` — both on the one ticket, both named.
    expect(w.every(l => l.includes('T-800') && l.includes('docs/tickets/v1.10/T-800.md'))).toBe(true)
    expect(w.some(l => /`Request`.*`problem`/.test(l))).toBe(true)
  })

  test('a decision ticket missing the recommend cell is reported', () => {
    ticket('v1.10', 'T-801', {
      type: 'decision', assignee: 'user', created: '2026-09-24',
      body: '## problem\nfork\n\n## options\n| A | B |\n|---|---|\n\n## acceptance\nuser answers\n',
    })
    const w = frameWarnings()
    expect(w.some(l => l.includes('T-801') && l.includes('recommend'))).toBe(true)
  })

  test('a fresh `tickets new` decision scaffold is frame-clean out of the box (T-685 fix)', () => {
    execFileSync('python3', [PRDT_CLI, 'tickets', 'new', '--type', 'decision', '--slug', 'fresh-fork'],
      { cwd: projectRoot, env, encoding: 'utf-8' })
    expect(frameWarnings()).toEqual([])
  })

  test('older tickets (created before the landing date) are silent — no line at all, not even skipped', () => {
    ticket('v1.10', 'T-802', { created: '2026-09-01', body: '## Request\nold\n\n## Acceptance\nx\n' })
    expect(frameWarnings()).toEqual([])
  })

  test('a well-formed post-landing ticket is silent too', () => {
    ticket('v1.10', 'T-803', {
      created: '2026-09-24',
      body: '## problem\n- as-is\n- to-be\n\n## acceptance\n1. one\n\n## outcome\n\n## log\n- 2026-09-24 — opened\n',
    })
    expect(frameWarnings()).toEqual([])
  })

  test('advisory: the ⚠ line prints, but the one verdict counter in the tool never moves for it', () => {
    // `doctor`'s only bracketed mismatch counter is the discipline↔execution
    // verdict line (`doctor: discipline↔execution — … [verdict=… violations=N …]`).
    // A ticket-frame finding is FAMILY_PROJECT data, not a discipline↔execution
    // mismatch, and is wrapped `Advisory` regardless (T-572 ②) so it can never
    // be miscounted there if a project-family counter is ever added later.
    // What's checkable today: the ⚠ line is printed (it is not swallowed),
    // and the DE verdict — the one number this repo's "clean" claim rests on
    // — stays `violations=0` with nothing else wrong.
    ticket('v1.10', 'T-804', { created: '2026-09-24', body: '## Request\nx\n\n## Acceptance\ny\n' })
    prdRecord('v1.10')
    const out = doctorOut()
    expect(out).toContain('⚠ ticket frame: T-804')
    const deLine = out.split('\n').find(l => l.startsWith('doctor: discipline↔execution —'))
    expect(deLine).toBeTruthy()
    expect(deLine).toMatch(/violations=0/)
  })
})
