/**
 * prdt-tickets-assignee.test.ts — T-464 `prdt tickets --assignee`, black-box over
 * the REAL `prdt` CLI (mirrors prdt-tickets-link.test.ts).
 *
 * Root cause (T-464): work only the person's own hands can do (a console beyond
 * the agent's reach, a prod-secret step, a device, destructive git, another
 * team's turn) lived as chat prose, so it died with the session and nothing could
 * answer "what is waiting on whom". Such work is now an `assignee: user` ticket —
 * which is only useful if the queue is queryable, hence this filter.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

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
    timeout: 20000,
  })
}

/** Run expecting a non-zero exit; returns the combined stderr+stdout. */
function runPrdtExpectFail(args: string[]): string {
  try {
    runPrdt(args)
  } catch (e: any) {
    return `${e.stderr ?? ''}${e.stdout ?? ''}`
  }
  throw new Error(`expected non-zero exit for: prdt ${args.join(' ')}`)
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function writeTicket(version: string, id: string, assignee: string, status = 'open') {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, 'type: impl',
    `status: ${status}`, `assignee: ${assignee}`, 'created: 2026-08-18', '---',
    '', '## Request', 'fixture', '', '## Acceptance', '1. fixture', '', '## Outcome', '',
  ].join('\n'))
}

/** Ticket ids present in a listing (`T-NNN [ status] …` lines). */
function listedIds(out: string): string[] {
  return out.trim().split('\n').flatMap((l) => l.match(/^(T-\d+)\b/)?.slice(1, 2) ?? [])
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-tickets-assignee-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt tickets --assignee (T-464)', () => {
  test('--assignee user returns the person-assigned tickets and no persona ones', () => {
    const res = runInit()
    writeTicket(res.version, 'T-920', 'user')
    writeTicket(res.version, 'T-921', 'developer')
    writeTicket(res.version, 'T-922', 'qa')
    writeTicket('backlog', 'T-923', 'user')

    expect(listedIds(runPrdt(['tickets', '--assignee', 'user'])).sort()).toEqual(['T-920', 'T-923'])
    // the mixed fixture is really mixed — an unfiltered listing carries all four.
    expect(listedIds(runPrdt(['tickets'])).sort()).toEqual(['T-920', 'T-921', 'T-922', 'T-923'])
  })

  test('a persona name filters to that persona only', () => {
    const res = runInit()
    writeTicket(res.version, 'T-930', 'user')
    writeTicket(res.version, 'T-931', 'developer')

    expect(listedIds(runPrdt(['tickets', '--assignee', 'developer']))).toEqual(['T-931'])
  })

  test('composes with the other filters instead of replacing them', () => {
    const res = runInit()
    writeTicket(res.version, 'T-940', 'user', 'open')
    writeTicket(res.version, 'T-941', 'user', 'done')

    expect(listedIds(runPrdt(['tickets', '--assignee', 'user', '--status', 'open']))).toEqual(['T-940'])
  })

  test('no match says so rather than falling back to the full listing', () => {
    const res = runInit()
    writeTicket(res.version, 'T-950', 'developer')

    const out = runPrdt(['tickets', '--assignee', 'user'])
    expect(out).toContain('(no tickets)')
    expect(out).not.toContain('T-950')
  })

  // ── legacy frontmatter (T-464 rework, F2) ──────────────────────────────────
  // 480 of the 621 real tickets in this repo carry the pre-rename `pdt-developer`
  // form; indexing normalizes it so one filter value covers both spellings.
  test('legacy `pdt-` assignees normalize to the short persona name', () => {
    const res = runInit()
    writeTicket(res.version, 'T-970', 'pdt-developer')
    writeTicket(res.version, 'T-971', 'developer')
    writeTicket(res.version, 'T-972', 'pdt-designer')
    writeTicket(res.version, 'T-973', 'pdt-po')
    writeTicket(res.version, 'T-974', 'pdt-qa')

    expect(listedIds(runPrdt(['tickets', '--assignee', 'developer'])).sort()).toEqual(['T-970', 'T-971'])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'designer']))).toEqual(['T-972'])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'po']))).toEqual(['T-973'])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'qa']))).toEqual(['T-974'])
    // the listing prints the normalized name, matching what the GUI shows.
    expect(runPrdt(['tickets', '--assignee', 'developer'])).not.toContain('pdt-developer')
  })

  // Documented gap, not a fix: 6 real tickets carry `pdt-designer + pdt-developer`.
  // Anchored normalization strips only the leading prefix, so the value matches no
  // enum member and no --assignee filter reaches it. It is still listed unfiltered,
  // so the row is visible — just not queryable by assignee.
  test('a composite assignee reaches no filter but is not dropped from the index', () => {
    const res = runInit()
    writeTicket(res.version, 'T-980', 'pdt-designer + pdt-developer')

    expect(listedIds(runPrdt(['tickets', '--assignee', 'designer']))).toEqual([])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'developer']))).toEqual([])
    expect(listedIds(runPrdt(['tickets']))).toEqual(['T-980'])
    // only the leading prefix strips — the trailing one survives verbatim.
    expect(runPrdt(['tickets'])).toContain('→ designer + pdt-developer')
  })

  // ── typo rejection (T-464 rework, F3) ──────────────────────────────────────
  // A "who is waiting?" filter must never answer a typo with "nobody".
  test('an unknown assignee is rejected, not answered with an empty listing', () => {
    const res = runInit()
    writeTicket(res.version, 'T-990', 'user')

    const err = runPrdtExpectFail(['tickets', '--assignee', 'usr'])
    expect(err).toContain('--assignee')
    expect(err).toContain('user')
    expect(err).not.toContain('(no tickets)')

    // the legacy spelling is data, never a valid filter value — it normalizes away.
    expect(runPrdtExpectFail(['tickets', '--assignee', 'pdt-developer'])).toContain('--assignee')
  })

  test('--link is unaffected by the new filter path', () => {
    const res = runInit()
    writeTicket(res.version, 'T-960', 'user')

    const out = runPrdt(['tickets', '--link', 'T-960'])
    expect(out.trim()).toBe(`[T-960](file://${path.join(fs.realpathSync(projectDir), 'docs', 'tickets', res.version, 'T-960.md')})`)
  })
})
