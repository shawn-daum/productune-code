/**
 * prdt-tickets-frame.test.ts — `prdt tickets new` / `prdt tickets fmt` (T-685),
 * black-box over the REAL `prdt` CLI (idiom: prdt-tickets-link.test.ts).
 *
 * The ticket frame (H2 keys `problem · options · related · acceptance ·
 * evidence · outcome · log`, this order) lives once in code
 * (TICKET_FRAME_KEYS in scripts/prdt) — `new` scaffolds it, `fmt` normalizes
 * an existing ticket's headings onto it. `fmt --check` binds only tickets
 * created on/after the frame's landing date (2026-09-24) — an older ticket
 * keeps its headings as written (contracts/tickets.md annex).
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

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
  })
}

/** Like runPrdt, but never throws on a non-zero exit (fmt --check exits 1 on findings). */
function runPrdtAllowFail(args: string[]): { out: string; status: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'),
    })
    return { out, status: 0 }
  } catch (e: any) {
    return { out: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 }
  }
}

/** Like runPrdt, but with extra env vars merged over the current process env —
 *  used to pin the child's local timezone (`TZ`) for the `created:` date test. */
function runPrdtEnv(args: string[], env: Record<string, string>): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
    env: { ...process.env, ...env },
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function ticketPath(version: string, id: string): string {
  return path.join(projectDir, 'docs', 'tickets', version, `${id}.md`)
}

function writeTicket(version: string, id: string, opts: {
  type?: string; status?: string; assignee?: string; created?: string; body: string
}) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(ticketPath(version, id), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, `type: ${opts.type ?? 'impl'}`,
    `status: ${opts.status ?? 'open'}`, `assignee: ${opts.assignee ?? 'developer'}`,
    `created: ${opts.created ?? '2026-09-24'}`, '---', '', opts.body,
  ].join('\n'))
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-tickets-frame-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt tickets new', () => {
  test('scaffolds full frontmatter + frame H2 keys in order, per type', () => {
    const res = runInit()
    for (const type of ['design', 'impl', 'qa', 'ops']) {
      const out = runPrdt(['tickets', 'new', '--type', type, '--slug', `a-${type}-ticket`]).trim()
      const m = out.match(/^\[(T-\d+)\]\(file:\/\/(.+)\)$/)
      expect(m).toBeTruthy()
      const text = fs.readFileSync(m![2], 'utf-8')
      expect(text).toMatch(/^id: T-\d+$/m)
      expect(text).toMatch(new RegExp(`^type: ${type}$`, 'm'))
      expect(text).toMatch(/^status: open$/m)
      expect(text).toMatch(/^assignee: po$/m) // default when --assignee omitted
      // frame order, `options` NOT present for a non-decision type
      const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
      expect(headings).toEqual(['problem', 'related', 'acceptance', 'evidence', 'outcome', 'log'])
    }
  })

  test('type: decision forces assignee: user and includes `options`', () => {
    const res = runInit()
    const out = runPrdt(['tickets', 'new', '--type', 'decision', '--slug', 'pick-a-lane', '--assignee', 'developer']).trim()
    const m = out.match(/\(file:\/\/(.+)\)$/)
    const text = fs.readFileSync(m![1], 'utf-8')
    expect(text).toMatch(/^assignee: user$/m)
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['problem', 'options', 'related', 'acceptance', 'evidence', 'outcome', 'log'])
  })

  test('ids are a global counter across every ticket dir, never reused', () => {
    const res = runInit()
    writeTicket('backlog', 'T-950', { body: '## problem\nx\n\n## acceptance\nx\n' })
    const out = runPrdt(['tickets', 'new', '--type', 'impl', '--slug', 'next-after-950'])
    expect(out).toMatch(/^\[T-951\]/)
  })

  // T-685 fix: PO-observed scratch-project run — a fresh project's first
  // scaffold printed `T-1`, not the contracts §Tickets form ("`T-NNN` … at
  // least three digits, zero-padded: a first ticket is `T-001`").
  test('a first ticket in a fresh project is zero-padded to T-001, not T-1', () => {
    runInit()
    const out = runPrdt(['tickets', 'new', '--type', 'impl', '--slug', 'first-ever']).trim()
    expect(out).toMatch(/^\[T-001\]/)
    const text = fs.readFileSync(out.match(/\(file:\/\/(.+)\)$/)![1], 'utf-8')
    expect(text).toMatch(/^id: T-001$/m)
  })

  test('the counter keeps zero-padding to at least 3 digits as it climbs', () => {
    const res = runInit()
    writeTicket('backlog', 'T-007', { body: '## problem\nx\n\n## acceptance\nx\n' })
    const out = runPrdt(['tickets', 'new', '--type', 'impl', '--slug', 'after-007']).trim()
    expect(out).toMatch(/^\[T-008\]/)
  })

  // T-685 fix: PO-observed 2026-09-24 KST — a scaffold got `created:
  // 2026-09-23` because the code read UTC, which was still "yesterday" in the
  // evening in a timezone ahead of UTC. Pinned against Node's OWN read of the
  // same TZ (`Intl`/`toLocaleDateString`), never against a hardcoded date, so
  // the assertion holds no matter when the suite runs.
  test('created is the machine local date, not UTC', () => {
    runInit()
    const tz = 'Pacific/Kiritimati' // UTC+14 — routinely a full calendar day ahead of UTC
    const expected = new Date().toLocaleDateString('en-CA', { timeZone: tz }) // en-CA => YYYY-MM-DD
    const out = runPrdtEnv(['tickets', 'new', '--type', 'impl', '--slug', 'tz-check'], { TZ: tz }).trim()
    const text = fs.readFileSync(out.match(/\(file:\/\/(.+)\)$/)![1], 'utf-8')
    expect(text).toMatch(new RegExp(`^created: ${expected}$`, 'm'))
  })

  // T-685 fix: PO-observed — `## options` scaffolded empty on a `decision`
  // ticket, leaving the PO to recall the annex's table shape from memory.
  test('type: decision scaffolds the empty options table shape, not a bare heading', () => {
    const res = runInit()
    const out = runPrdt(['tickets', 'new', '--type', 'decision', '--slug', 'try-it']).trim()
    const m = out.match(/\(file:\/\/(.+)\)$/)!
    const text = fs.readFileSync(m[1], 'utf-8')
    const optionsSection = text.split(/^## options$/m)[1].split(/^## /m)[0]
    // rows the annex names, columns are the options (placeholders here — the
    // PO renames them to the real fork names)
    for (const row of ['pros', 'cons', 'trade-off', 'recommend']) {
      expect(optionsSection).toMatch(new RegExp(`\\| ${row} \\|`))
    }
    expect(optionsSection).toMatch(/Option A/)
    expect(optionsSection).toMatch(/Option B/)
    // the scaffold already satisfies fmt --check's decision gate (a
    // `recommend` cell present) — the PO fills content, never the shape
    const id = out.match(/^\[(T-\d+)\]/)![1]
    const { out: checkOut } = runPrdtAllowFail(['tickets', 'fmt', id, '--check'])
    expect(checkOut).not.toMatch(/options/)
  })

  test('rejects a missing/invalid type or slug', () => {
    runInit()
    expect(() => runPrdt(['tickets', 'new', '--slug', 'no-type'])).toThrow()
    expect(() => runPrdt(['tickets', 'new', '--type', 'impl', '--slug', 'Not Kebab'])).toThrow()
  })
})

describe.skipIf(!PYTHON3)('prdt tickets fmt', () => {
  test('idempotence: an already-canonical ticket is byte-identical on a second fmt', () => {
    const res = runInit()
    const body = '## problem\n- as-is\n- to-be\n\n## acceptance\n1. one\n\n## outcome\n\n## log\n- 2026-09-24 — opened\n'
    writeTicket(res.version, 'T-700', { body })
    runPrdt(['tickets', 'fmt', 'T-700'])
    const once = fs.readFileSync(ticketPath(res.version, 'T-700'), 'utf-8')
    runPrdt(['tickets', 'fmt', 'T-700'])
    const twice = fs.readFileSync(ticketPath(res.version, 'T-700'), 'utf-8')
    expect(twice).toBe(once)
  })

  test('alias mapping: legacy English + Korean headings fold onto frame keys, order fixed, prose bytes kept', () => {
    const res = runInit()
    const body = '## Request\n실측: 어떤 사실\n\n## Acceptance\n1. 합격\n\n## Outcome\n(미착수)\n'
    writeTicket(res.version, 'T-701', { body })
    runPrdt(['tickets', 'fmt', 'T-701'])
    const text = fs.readFileSync(ticketPath(res.version, 'T-701'), 'utf-8')
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['problem', 'acceptance', 'outcome'])
    expect(text).toContain('실측: 어떤 사실')
    expect(text).toContain('1. 합격')
    expect(text).toContain('(미착수)')
  })

  test('Korean frame labels fold onto the same keys', () => {
    const res = runInit()
    const body = '## 문제\nA\n\n## 대안\nB\n\n## 관련사항\nC\n\n## 합격 기준\nD\n\n## 근거\nE\n\n## 진행 기록\nF\n'
    writeTicket(res.version, 'T-702', { body })
    runPrdt(['tickets', 'fmt', 'T-702'])
    const text = fs.readFileSync(ticketPath(res.version, 'T-702'), 'utf-8')
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual(['problem', 'options', 'related', 'acceptance', 'evidence', 'log'])
    for (const b of ['A', 'B', 'C', 'D', 'E', 'F']) expect(text).toContain(b)
  })

  test('a body byte never changes — only heading lines are rewritten', () => {
    const res = runInit()
    const body = '## Request\nline one\n\nline two with **bold** and a table\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## Acceptance\n- x\n'
    writeTicket(res.version, 'T-703', { body })
    const before = fs.readFileSync(ticketPath(res.version, 'T-703'), 'utf-8')
    const proseBefore = before.split('\n').filter((l) => !l.startsWith('## '))
    runPrdt(['tickets', 'fmt', 'T-703'])
    const after = fs.readFileSync(ticketPath(res.version, 'T-703'), 'utf-8')
    const proseAfter = after.split('\n').filter((l) => !l.startsWith('## '))
    expect(proseAfter).toEqual(proseBefore)
  })

  test('--check exits non-zero and names violations without writing', () => {
    const res = runInit()
    writeTicket(res.version, 'T-704', { body: '## Request\nx\n\n## Acceptance\ny\n' })
    const before = fs.readFileSync(ticketPath(res.version, 'T-704'), 'utf-8')
    const { out, status } = runPrdtAllowFail(['tickets', 'fmt', 'T-704', '--check'])
    expect(status).not.toBe(0)
    expect(out).toMatch(/T-704:.*`Request`.*`problem`/)
    const after = fs.readFileSync(ticketPath(res.version, 'T-704'), 'utf-8')
    expect(after).toBe(before) // --check never writes
  })

  test('--dry-run prints a diff and writes nothing', () => {
    const res = runInit()
    writeTicket(res.version, 'T-705', { body: '## Request\nx\n\n## Acceptance\ny\n' })
    const before = fs.readFileSync(ticketPath(res.version, 'T-705'), 'utf-8')
    const out = runPrdt(['tickets', 'fmt', 'T-705', '--dry-run'])
    expect(out).toContain('-## Request')
    expect(out).toContain('+## problem')
    const after = fs.readFileSync(ticketPath(res.version, 'T-705'), 'utf-8')
    expect(after).toBe(before)
  })

  test('decision without options/recommend fails --check', () => {
    const res = runInit()
    writeTicket(res.version, 'T-706', {
      type: 'decision', assignee: 'user',
      body: '## problem\nfork\n\n## acceptance\nuser answers\n',
    })
    const { out, status } = runPrdtAllowFail(['tickets', 'fmt', 'T-706', '--check'])
    expect(status).not.toBe(0)
    expect(out).toMatch(/T-706:.*decision requires `options`/)

    // now with an options table that lacks a recommend row
    writeTicket(res.version, 'T-707', {
      type: 'decision', assignee: 'user',
      body: '## problem\nfork\n\n## options\n| A | B |\n|---|---|\n\n## acceptance\nuser answers\n',
    })
    const r2 = runPrdtAllowFail(['tickets', 'fmt', 'T-707', '--check'])
    expect(r2.status).not.toBe(0)
    expect(r2.out).toMatch(/T-707:.*recommend/)

    // with a recommend cell present — no such violation
    writeTicket(res.version, 'T-708', {
      type: 'decision', assignee: 'user',
      body: '## problem\nfork\n\n## options\n| | A | B |\n|---|---|---|\n| recommend | x | |\n\n## acceptance\nuser answers\n',
    })
    const r3 = runPrdtAllowFail(['tickets', 'fmt', 'T-708', '--check'])
    expect(r3.out).not.toMatch(/recommend/)
  })

  test('older tickets (created before the frame landing date) pass untouched', () => {
    const res = runInit()
    writeTicket(res.version, 'T-709', { created: '2026-09-01', body: '## Request\nold frame\n\n## Acceptance\nx\n' })
    const before = fs.readFileSync(ticketPath(res.version, 'T-709'), 'utf-8')
    const out = runPrdt(['tickets', 'fmt', 'T-709'])
    expect(out).toMatch(/skipped/)
    const after = fs.readFileSync(ticketPath(res.version, 'T-709'), 'utf-8')
    expect(after).toBe(before)
    const { status } = runPrdtAllowFail(['tickets', 'fmt', 'T-709', '--check'])
    expect(status).toBe(0)
  })
})
