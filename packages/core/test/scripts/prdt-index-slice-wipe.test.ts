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
 *
 * T-488 (second describe) is the same complete-looking wrong answer reached from
 * the other side: index.db is meta-excluded, so a freshly cloned project has NO
 * index. Every command used to create it empty and fill only its own slice, so a
 * clone answered `wiki search` with machine hits alone. The fix derives a MISSING
 * index whole, once — an EXISTING index is never re-derived by a query, which is
 * what keeps the T-480 tests above honest: a wiped slice stays wiped until a
 * `reindex`, so a re-introduced wipe still turns them red rather than healing
 * itself between two commands. That distinction is asserted directly against
 * index.db (`projectRows`), not only through search output, so it survives any
 * future change to how search reads.
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

function runPrdtAt(cwd: string, args: string[], input?: string): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd, env: { ...process.env, PRDT_HOME: machineHome },
    input, encoding: 'utf-8',
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 20000,
  })
}

function runPrdt(args: string[], input?: string): string {
  return runPrdtAt(projectDir, args, input)
}

/** Rows of ONE store's slice, read straight out of the derived index. The defect
 *  both tickets describe is an emptied slice, so the slice — not the rendered
 *  search output — is the honest place to assert. */
function projectRows(dir: string, table: 'wiki_pages' | 'wiki_fts'): number {
  const out = execFileSync('python3', ['-c',
    'import sqlite3,sys\n' +
    `print(sqlite3.connect(sys.argv[1]).execute("SELECT COUNT(*) FROM ${table} ` +
    `WHERE name NOT LIKE \'machine:%\'").fetchone()[0])`,
    path.join(dir, '.prdt', 'index.db')], { encoding: 'utf-8' })
  return Number(out.trim())
}

function metaGit(args: string[], cwd = projectDir): string {
  return execFileSync('git', ['--git-dir', path.join(projectDir, '.prdt', 'meta.git'),
    '--work-tree', projectDir, ...args], { cwd, encoding: 'utf-8' })
}

/** A REAL clone of the meta repo `prdt init` created — same `info/exclude`, so
 *  index.db is left behind exactly the way a teammate's `git clone` leaves it.
 *  Simulating "empty index" by deleting the file would not prove the delivery
 *  path is what drops it. */
function cloneProject(): string {
  metaGit(['add', '-A', '--', '.prdt', 'docs'])
  metaGit(['commit', '-q', '-m', 'meta snapshot'])
  const dest = path.join(sandbox, 'clone')
  execFileSync('git', ['clone', '--quiet', path.join(projectDir, '.prdt', 'meta.git'), dest],
    { cwd: sandbox, encoding: 'utf-8' })
  return dest
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

  test('after tickets, the project slice is still populated IN THE INDEX', () => {
    // Was "a search after tickets equals a search after a fresh reindex" (T-480).
    // Rewritten in T-488 to assert against index.db directly: the equality of two
    // search outputs is only evidence while search does not re-derive the project
    // slice itself. The day someone makes search self-heal — the naive fix for
    // T-488 — the wipe would be repaired in between and the comparison would go
    // green over an index that had in fact been emptied. The row count cannot be
    // fooled that way: it is read after `tickets` and before anything queries.
    seedProject()
    const seeded = projectRows(projectDir, 'wiki_pages')
    expect(seeded).toBeGreaterThan(0)

    runPrdt(['tickets', '--version', 'v1.6'])

    expect(projectRows(projectDir, 'wiki_pages')).toBe(seeded)
    expect(projectRows(projectDir, 'wiki_fts')).toBe(seeded)

    // behavioural corollary, kept: what the user sees is the same either way
    const afterTickets = runPrdt(['wiki', 'search', 'isolation rule that belongs'])
    runPrdt(['wiki', 'reindex'])
    expect(afterTickets).toBe(runPrdt(['wiki', 'search', 'isolation rule that belongs']))
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

describe.skipIf(!PYTHON3)('a freshly cloned project searches its own wiki (T-488)', () => {
  const PROBE = 'isolation rule that belongs'

  test('index.db does not travel with the clone — the precondition, stated', () => {
    seedProject()
    const clone = cloneProject()
    // `.prdt/index.db` sits in the meta repo's info/exclude (META_EXCLUDE_DEFAULT),
    // so what a teammate gets is the md and no index at all.
    expect(fs.existsSync(path.join(clone, '.prdt', 'index.db'))).toBe(false)
    expect(fs.existsSync(path.join(clone, 'docs', 'wiki', 'decision--isolation.md'))).toBe(true)
  })

  test('the first search in a clone answers with project pages, not machine hits alone', () => {
    seedProject()
    const clone = cloneProject()

    const out = runPrdtAt(clone, ['wiki', 'search', PROBE])
    // THE defect: this line was absent while the machine line below printed, so
    // the clone's search read as a complete answer over an empty project slice.
    expect(out).toMatch(/^decision--isolation/m)
    expect(out).toMatch(/machine:fact--qa-vm/)
    expect(projectRows(clone, 'wiki_pages')).toBeGreaterThan(0)
  })

  test('a clone whose first command is `tickets` still searches whole', () => {
    // The realistic order: PO habit fires `prdt tickets --link` long before any
    // search, so `tickets` is usually what creates index.db in a fresh clone. A
    // cold start that filled only the calling command's slice would put the clone
    // straight back into the T-480 state.
    seedProject()
    const clone = cloneProject()

    runPrdtAt(clone, ['tickets', '--version', 'v1.6'])

    expect(runPrdtAt(clone, ['wiki', 'search', PROBE])).toMatch(/^decision--isolation/m)
  })

  test('the read-only search writes nothing into docs/ — no standing meta diff', () => {
    // The naive fix (reindex on every search) was rejected in T-480 for exactly
    // this: docs/wiki/index.md is meta-tracked, so a query that regenerates it
    // leaves every clone permanently dirty.
    seedProject()
    const clone = cloneProject()
    const idx = path.join(clone, 'docs', 'wiki', 'index.md')
    const before = fs.readFileSync(idx, 'utf-8')

    runPrdtAt(clone, ['wiki', 'search', PROBE])

    expect(fs.readFileSync(idx, 'utf-8')).toBe(before)
    expect(execFileSync('git', ['status', '--porcelain', '--', 'docs'],
      { cwd: clone, encoding: 'utf-8' }).trim()).toBe('')
  })

  test('the derive is paid once — a warm index is not re-derived by a query', () => {
    // The other half of the acceptance, and the guard that keeps the T-480 tests
    // above meaningful: only a MISSING index is derived. Editing a page after the
    // index exists must NOT show up, because an implementation that re-scanned
    // docs/wiki on every search would also silently repair a wiped slice.
    seedProject()
    const clone = cloneProject()
    runPrdtAt(clone, ['wiki', 'search', PROBE])

    writePage(path.join(clone, 'docs', 'wiki'), 'decision--isolation',
      { title: 'isolation decision', type: 'decision' }, 'REWRITTENSINCEINDEXING body')

    expect(runPrdtAt(clone, ['wiki', 'search', PROBE])).toMatch(/^decision--isolation/m)
    expect(runPrdtAt(clone, ['wiki', 'search', 'REWRITTENSINCEINDEXING'])).toMatch(/no hits/)
    // and the documented way to pick it up
    runPrdtAt(clone, ['wiki', 'reindex'])
    expect(runPrdtAt(clone, ['wiki', 'search', 'REWRITTENSINCEINDEXING']))
      .toMatch(/^decision--isolation/m)
  })
})
