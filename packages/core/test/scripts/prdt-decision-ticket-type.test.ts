/**
 * prdt-decision-ticket-type.test.ts — `type: decision` tickets, black-box over
 * the REAL `prdt` CLI (idiom: prdt-tickets-assignee.test.ts).
 *
 * Root cause (QA grill of the discipline bundle, d-decision-cli-20260923):
 * contracts §Tickets lists `type(design|impl|qa|ops|decision)`, but
 * `TICKET_TYPES` and the `tickets` table's CHECK constraint only allowed the
 * first four — a decision ticket was silently dropped from the derived index
 * (and therefore from `prdt tickets` / `--assignee user` / `prdt doctor`).
 *
 * Second half: a project whose `.prdt/index.db` was already built under the
 * old (4-value) CHECK must self-heal on its own next command — `CREATE TABLE
 * IF NOT EXISTS` never widens an existing table's CHECK, so without an
 * explicit fix the file would keep rejecting `decision` rows forever.
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

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function writeTicket(version: string, id: string, type: string, assignee: string, status = 'open') {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, `type: ${type}`,
    `status: ${status}`, `assignee: ${assignee}`, 'created: 2026-09-23', '---',
    '', '## Request', 'fixture', '', '## Acceptance', '1. fixture', '', '## Outcome', '',
  ].join('\n'))
}

/** Ticket ids present in a listing (`T-NNN [ status] …` lines). */
function listedIds(out: string): string[] {
  return out.trim().split('\n').flatMap((l) => l.match(/^(T-\d+)\b/)?.slice(1, 2) ?? [])
}

/** Downgrade an already-derived index.db's `tickets` table to the PRE-FIX CHECK
 *  constraint (`design|impl|qa|ops`, no `decision`) — reproduces a project whose
 *  index was built before this round, without needing an old `prdt` binary. Row
 *  data is preserved across the rebuild via a temp copy. */
function downgradeIndexToOldCheck(dir: string) {
  const dbPath = path.join(dir, '.prdt', 'index.db')
  execFileSync('python3', ['-c', `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.executescript("""
    ALTER TABLE tickets RENAME TO tickets_new;
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY, slug TEXT, type TEXT CHECK(type IN ('design','impl','qa','ops')),
      status TEXT CHECK(status IN ('open','done','dropped')), assignee TEXT, feature TEXT,
      deps TEXT, created TEXT, closed TEXT, version TEXT, path TEXT);
    INSERT INTO tickets SELECT * FROM tickets_new WHERE type != 'decision';
    DROP TABLE tickets_new;
""")
con.commit()
con.close()
`, dbPath], { encoding: 'utf-8' })
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-decision-type-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('type: decision tickets', () => {
  test('indexes without a violation and lists in `prdt tickets` / `--assignee user` / doctor', () => {
    const res = runInit()
    writeTicket(res.version, 'T-800', 'decision', 'user')

    const rebuildOut = runPrdt(['index', 'rebuild'])
    expect(rebuildOut).not.toMatch(/T-800.*CHECK reject/)
    expect(rebuildOut).not.toMatch(/violation/i)

    expect(listedIds(runPrdt(['tickets']))).toEqual(['T-800'])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'user']))).toEqual(['T-800'])

    const doctorOut = runPrdt(['doctor'])
    expect(doctorOut).not.toMatch(/type 'decision' not in/)
  })

  test('an existing index built under the old (pre-decision) CHECK self-heals on the next command', () => {
    const res = runInit()
    writeTicket(res.version, 'T-810', 'impl', 'developer')
    // Seed a warm index the ordinary way, then roll its `tickets` table back to
    // the old CHECK — the shape a project's index.db was already in before this
    // fix landed.
    runPrdt(['tickets'])
    downgradeIndexToOldCheck(projectDir)

    // Now add the decision ticket and run an ordinary (non-rebuild) command —
    // no `prdt index rebuild`, no manual step.
    writeTicket(res.version, 'T-811', 'decision', 'user')
    const out = runPrdt(['tickets'])

    expect(listedIds(out).sort()).toEqual(['T-810', 'T-811'])
    expect(listedIds(runPrdt(['tickets', '--assignee', 'user']))).toEqual(['T-811'])
  })
})
