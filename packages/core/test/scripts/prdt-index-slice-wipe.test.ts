/**
 * prdt-index-slice-wipe.test.ts — T-480. `tickets`/`history` must not empty the
 * wiki slice of the derived index. Black-box over the REAL `prdt` CLI
 * (idiom: prdt-wiki-machine-store.test.ts).
 *
 * Root cause (T-480): `tickets` and `history` opened index.db with rebuild=True —
 * deleting the file — and then re-filled ONLY `tickets`. `wiki_pages`/`wiki_fts`
 * stayed empty, and the next `prdt wiki search` refreshed just the machine slice
 * (index_machine_wiki runs on every search), so the search still printed machine
 * hits and silently dropped every project page. Not an empty result the reader
 * would question — a **complete-looking wrong answer**.
 *
 * v1.6 turned that into a constant: PO habit calls `prdt tickets --link` on every
 * ticket mention and `--assignee user` on every queue check, so the wipe landed
 * roughly once per response.
 *
 * These tests pin the SEQUENCE (search → tickets → search), not the helpers: the
 * defect lives in which slices a command re-fills after it drops the file, and
 * a helper-level test of reindex_tickets/index_wiki_rows passes while the CLI
 * lies. The last test pins the shape structurally — `open_db` no longer offers a
 * destructive mode, so no future caller can drop the file and re-fill half of it.
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

let sandbox: string
let machineHome: string
let projectDir: string

function runPrdt(args: string[], input?: string): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir, env: { ...process.env, PRDT_HOME: machineHome },
    input, encoding: 'utf-8',
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 20000,
  })
}

function writePage(dir: string, name: string, fm: Record<string, string>, body: string) {
  fs.mkdirSync(dir, { recursive: true })
  const head = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n')
  fs.writeFileSync(path.join(dir, `${name}.md`), head + body + '\n')
}

function writeTicket(version: string, id: string) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, 'type: impl',
    'status: open', 'assignee: developer', 'created: 2026-08-18', '---',
    '', '## Request', 'fixture', '', '## Acceptance', '1. fixture', '', '## Outcome', '',
  ].join('\n'))
}

/** The exact fixture of the PO reproduction: one project page, one machine page. */
const PROJECT_PROBE = 'sandbox isolation rule that belongs to this project'
const MACHINE_PROBE = 'sandbox isolation rule that belongs to this machine'

function seedProject() {
  fs.mkdirSync(projectDir, { recursive: true })
  runPrdt(['init', '--json', '--slug', 'proj', '--yes'])
  const wiki = path.join(projectDir, 'docs', 'wiki')
  writePage(wiki, 'decision--isolation', { title: 'isolation decision', type: 'decision' }, PROJECT_PROBE)
  // `wiki refs` scores against document frequency (REFS_DF_CAP), so a two-page
  // store cannot produce a candidate at all — filler keeps that check honest.
  for (const n of ['alpha', 'beta', 'gamma', 'delta']) {
    writePage(wiki, `fact--${n}`, { title: n, type: 'fact' }, `Unrelated page about ${n} topics only.`)
  }
  writePage(wiki, 'fact--sqlite-index', { title: 'sqlite index slices', type: 'fact' },
    'The derived sqlite index keeps tickets and wiki in one file.')
  writePage(path.join(machineHome, 'wiki'), 'fact--qa-vm',
    { title: 'QA VM', type: 'fact' }, MACHINE_PROBE)
  writeTicket('v1.6', 'T-001')
  runPrdt(['wiki', 'reindex'])
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-slice-wipe-'))
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('derived index — one command never empties another command\'s slice (T-480)', () => {
  test('search → tickets → search: the project hit survives the tickets call', () => {
    seedProject()
    const before = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    expect(before).toMatch(/^decision--isolation/m)
    expect(before).toMatch(/machine:fact--qa-vm/)

    runPrdt(['tickets', '--version', 'v1.6'])

    const after = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    // the whole defect: this line used to be gone while the machine line stayed,
    // so the search read as a complete answer.
    expect(after).toMatch(/^decision--isolation/m)
    expect(after).toMatch(/machine:fact--qa-vm/)
  })

  test('search → history → search: the project hit survives the history call', () => {
    seedProject()
    expect(runPrdt(['wiki', 'search', 'isolation rule that belongs'])).toMatch(/^decision--isolation/m)

    runPrdt(['history'])

    expect(runPrdt(['wiki', 'search', 'isolation rule that belongs'])).toMatch(/^decision--isolation/m)
  })

  test('the PO ritual shape — repeated --link / --assignee calls — leaves search intact', () => {
    seedProject()
    // v1.6 habit fires these on nearly every response; the wipe was cumulative
    // only in the sense that it never healed itself between them.
    runPrdt(['tickets', '--link', 'T-001'])
    runPrdt(['tickets', '--assignee', 'developer'])
    runPrdt(['tickets', '--link', 'T-001'])

    const out = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    expect(out).toMatch(/^decision--isolation/m)
    expect(out).toMatch(/machine:fact--qa-vm/)
  })

  test('a search after tickets equals a search after a fresh reindex', () => {
    seedProject()
    runPrdt(['tickets', '--version', 'v1.6'])
    const afterTickets = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    runPrdt(['wiki', 'reindex'])
    const afterReindex = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    expect(afterTickets).toBe(afterReindex)
  })

  test('tickets still reports from a freshly derived index (a ticket added since is listed)', () => {
    seedProject()
    writeTicket('v1.6', 'T-002')
    // no reindex in between — `tickets` re-derives its own slice from md every call
    expect(runPrdt(['tickets', '--version', 'v1.6'])).toMatch(/T-002/)
  })

  test('`wiki refs` (T-448) reads the md stores directly — no index state can silence it', () => {
    // The other index consumer. It scans docs/wiki + the machine store per call
    // and never opens index.db, so the wipe could not reach it — pinned here so
    // that stays true if refs is ever moved onto the index for speed.
    seedProject()
    const query = ['wiki', 'refs', JSON.stringify({ change_meta: { files: ['src/wiki/sqlite-index.ts'] } })]
    const fresh = runPrdt(query)
    expect(fresh).toMatch(/^fact--sqlite-index/m)   // non-vacuous: there IS a candidate

    runPrdt(['tickets', '--version', 'v1.6'])
    expect(runPrdt(query)).toBe(fresh)

    fs.rmSync(path.join(projectDir, '.prdt', 'index.db'))
    expect(runPrdt(query)).toBe(fresh)
  })

  test('open_db offers no destructive mode — dropping index.db re-derives every slice', () => {
    // the shape guard: the defect was `open_db(root, rebuild=True)` followed by
    // one reindex_*. With no `rebuild` argument to pass, a caller that wants a
    // fresh file has to go through `rebuild_index`, which fills tickets + wiki +
    // machine or nothing at all.
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    expect(src).not.toMatch(/open_db\([^)]*rebuild/)
    const rebuildBody = src.slice(src.indexOf('def rebuild_index'))
      .slice(0, src.slice(src.indexOf('def rebuild_index')).indexOf('\n\n\n'))
    for (const fn of ['reindex_tickets', 'reindex_wiki', 'index_machine_wiki']) {
      expect(rebuildBody).toMatch(new RegExp(`${fn}\\(`))
    }
  })
})
