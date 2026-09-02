/**
 * prdt-doctor-malformed-frontmatter.test.ts — one bad ticket must not switch the
 * instrument off (T-550).
 *
 * The crash being pinned: `rebuild_index → reindex_tickets` binds raw frontmatter
 * values into index.db, and sqlite3 raises ProgrammingError — NOT IntegrityError,
 * the only family the INSERT used to catch — on a shape it cannot bind. That write
 * is the FIRST thing `prdt doctor` does, before a single check runs, so a ticket
 * carrying `feature: [gui]` exited 1 with a traceback and every other check
 * silenced. v1.8's gated goal is a machine-measured zero; a zero read off an
 * instrument one hand-written file can turn off is not evidence.
 *
 * Why the assertions are shaped the way they are:
 *
 * 1. CLASS, NOT INSTANCE. A fix that special-cases `list` is explicitly rejected by
 *    the ticket, so the list cases below (all the hand-rolled frontmatter parser can
 *    actually produce today) are the SMALLER half of this file. The class is pinned
 *    at the write path itself, in `class pin — every non-string shape`, by driving
 *    reindex_tickets with mapping/int/float/bool/date/nested values a future parser
 *    could yield. Delete the class pin and a `isinstance(v, list)` patch passes.
 *
 * 2. NOT SILENTLY SWALLOWED. Surviving by quietly coercing would trade a loud crash
 *    for a quiet lie — the exact failure class v1.8 exists to remove. So every case
 *    asserts BOTH halves: the run completes AND the file is named.
 *
 * 3. THE REST OF THE RUN IS THERE. "exit 0" alone would also be satisfied by a
 *    doctor that returned early. Each survival case therefore asserts other checks'
 *    output in the same run — a dangling dep (ticket check) and an orphan spec
 *    (feature seam), both of which live downstream of the write that used to crash.
 *
 * The two sides are independent by construction: expectations are fixtures this file
 * writes, never something read back from scan_tickets, index.db, or a doctor run.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version'])

/** Every frontmatter key reindex_tickets binds straight into index.db. The list is
 *  restated here on purpose: if the script's TICKET_INDEX_FIELDS grows a key, this
 *  file must be updated deliberately rather than agree with itself automatically.
 *  `assignee` joined it in T-556 — see the invariant pin at the bottom of this file
 *  for the half of the property a field list cannot state. */
const TICKET_FIELDS = ['id', 'slug', 'type', 'status', 'assignee', 'feature', 'created', 'closed']
const WIKI_FIELDS = ['title', 'type', 'status', 'version']

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-badfm-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.8', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  for (const d of ['docs/prd', 'docs/tickets/v1.8', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
  // Downstream checks, planted so a surviving run has something else to say. Both
  // sit AFTER the index write in cmd_doctor, so their output is the proof that the
  // run reached the end rather than bailing out quietly.
  fs.writeFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.8', 'T-003.md'),
    '---\nid: T-003\nslug: dangling-dep\ntype: impl\nstatus: open\nassignee: developer\n' +
    'feature: gui\ndeps: ["T-999"]\ncreated: 2026-01-01\n---\n\nbody\n')
  fs.writeFileSync(path.join(projectRoot, 'docs', 'features', 'renamed-away.md'), '# renamed-away\n')
}
const DEP_CHECK = 'ticket: T-003 deps on missing T-999'
const SEAM_CHECK = "feature: docs/features/renamed-away.md is named by no ticket's feature: value"

/** Write a ticket whose frontmatter carries `extra` verbatim. */
function ticket(id: string, extra: string): void {
  fs.writeFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.8', `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: open\n` +
    `assignee: developer\nfeature: gui\ncreated: 2026-01-01\n${extra}\n---\n\nbody\n`)
}

interface Run { out: string; code: number; err: string }
function doctor(): Run {
  try {
    const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
      { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { out, code: 0, err: '' }
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string }
    return { out: x.stdout ?? '', code: x.status ?? -1, err: x.stderr ?? '' }
  }
}

/** doctor completed AND the rest of the run is present. Both halves, every time:
 *  exit 0 on its own is also what an early return looks like. */
function expectSurvived(r: Run): string[] {
  expect(r.err).not.toContain('Traceback')
  expect(r.err).not.toContain('ProgrammingError')
  expect(r.code).toBe(0)
  expect(r.out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  expect(r.out).toContain(DEP_CHECK)      // a check downstream of the index write
  expect(r.out).toContain(SEAM_CHECK)     // and a second one, further downstream
  return r.out.split('\n').filter(l => l.startsWith('⚠ ')).map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)("QA's reproduction — feature: [gui]", () => {
  test('doctor completes at exit 0 instead of dying on the index write', () => {
    ticket('T-002', 'feature: [gui]')
    expectSurvived(doctor())
  })

  test('the malformed file is NAMED, at the one non-blocking severity', () => {
    ticket('T-002', 'feature: [gui]')
    const r = doctor()
    const w = expectSurvived(r)
    const named = w.filter(l => l.includes('docs/tickets/v1.8/T-002.md') && l.includes('feature:'))
    expect(named).toHaveLength(1)
    expect(named[0]).toContain('list')          // says WHICH shape was unusable
    expect(named[0]).toMatch(/^ticket: /)       // routed through the ticket channel
    // one severity only: every finding is a `⚠` line, and this must not grow an
    // escalated tier just because the input was malformed rather than merely wrong
    expect(r.out).not.toMatch(/^(ERROR|FAIL|✖)/m)
    for (const l of r.out.split('\n').filter(Boolean)) {
      expect(l.startsWith('⚠ ') || l.startsWith('doctor: ')).toBe(true)
    }
  })

  test('the unusable value is dropped, never coerced into a plausible string', () => {
    ticket('T-002', 'feature: [gui]')
    expectSurvived(doctor())
    const cell = execFileSync('python3', ['-c',
      'import sqlite3,sys;r=sqlite3.connect(sys.argv[1]).execute(' +
      '"SELECT feature FROM tickets WHERE id=\'T-002\'").fetchone();print(repr(r and r[0]))',
      path.join(projectRoot, '.prdt', 'index.db')], { encoding: 'utf8' }).trim()
    // NULL is honest; "['gui']" or "gui" would be a quiet lie the seam then groups by
    expect(cell).toBe('None')
  })

  test('a list in ANY of the eight bound fields survives, one warning each', () => {
    // scan_tickets keys the row by the filename when `id` is unusable, so each
    // ticket still lands as a row — that is the point: the run survives all seven.
    TICKET_FIELDS.forEach((f, i) => ticket(`T-1${10 + i}`, `${f}: [x, y]`))
    const w = expectSurvived(doctor())
    for (const [i, f] of TICKET_FIELDS.entries()) {
      const line = w.find(l => l.includes(`T-1${10 + i}.md`) && l.startsWith(`ticket: `) &&
        l.includes(`: ${f}: list value is not a string`))
      expect(line, `no shape warning for ${f}`).toBeTruthy()
    }
  })

  test('a malformed WIKI page cannot kill the run either — the other index write', () => {
    for (const f of WIKI_FIELDS) {
      fs.writeFileSync(path.join(projectRoot, 'docs', 'wiki', `fact--bad-${f}.md`),
        `---\ntitle: t\ntype: fact\nstatus: live\n${f}: [a, b]\n---\n\nbody\n`)
    }
    const w = expectSurvived(doctor())
    for (const f of WIKI_FIELDS) {
      expect(w.some(l => l.startsWith('wiki: docs/wiki/fact--bad-' + f + '.md:') &&
        l.includes(`${f}: list value is not a string`)), `no shape warning for wiki ${f}`).toBe(true)
    }
  })
})

describe.skipIf(!CAN_RUN)('the negative set — well-formed tickets are untouched', () => {
  test('plain-string frontmatter produces no shape warning and indexes verbatim', () => {
    ticket('T-002', 'closed: 2026-02-02')
    const w = expectSurvived(doctor())
    expect(w.filter(l => l.includes('is not a string'))).toEqual([])
    const cells = execFileSync('python3', ['-c',
      'import sqlite3,sys;print(list(sqlite3.connect(sys.argv[1]).execute(' +
      '"SELECT id,slug,type,status,assignee,feature,created,closed FROM tickets WHERE id=\'T-002\'"))[0])',
      path.join(projectRoot, '.prdt', 'index.db')], { encoding: 'utf8' }).trim()
    expect(cells).toBe(
      "('T-002', 's-t-002', 'impl', 'open', 'developer', 'gui', '2026-01-01', '2026-02-02')")
  })

  test('the legacy `pdt-` assignee spelling still normalizes through the guard', () => {
    // routing assignee through index_scalar must not cost it the one transform it
    // owes the filter: a str passes the guard byte-identical, then loses the prefix
    ticket('T-002', 'assignee: pdt-developer')
    const w = expectSurvived(doctor())
    expect(w.filter(l => l.includes('is not a string'))).toEqual([])
    const cell = execFileSync('python3', ['-c',
      'import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute(' +
      '"SELECT assignee FROM tickets WHERE id=\'T-002\'").fetchone()[0])',
      path.join(projectRoot, '.prdt', 'index.db')], { encoding: 'utf8' }).trim()
    expect(cell).toBe('developer')
  })

  test('an ABSENT field stays NULL — missing is not malformed, and says nothing', () => {
    ticket('T-002', 'slug: has-no-closed')   // `closed:` simply not written
    const w = expectSurvived(doctor())
    expect(w.filter(l => l.includes('T-002') && l.includes('is not a string'))).toEqual([])
  })
})

/**
 * The class pin. The frontmatter parser in `scripts/prdt` yields only str and
 * list[str] today, so a CLI fixture cannot exercise a mapping, a number, a bool or
 * a date — yet each of those binds no better than a list, and the ticket's whole
 * point is that stopping at the shape QA happened to hit leaves the next one fatal.
 * So this drives the real reindex_tickets with a stubbed parser and asserts the
 * write path answers EVERY non-string shape the same way: no exception, NULL cell,
 * one named violation.
 */
const HARNESS = String.raw`
import datetime, json, pathlib, sqlite3, sys
from importlib.machinery import SourceFileLoader
import importlib.util

CLI, ROOT = sys.argv[1], sys.argv[2]
loader = SourceFileLoader('prdt_uut', CLI)
spec = importlib.util.spec_from_loader('prdt_uut', loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)

FIELDS = ['id', 'slug', 'type', 'status', 'assignee', 'feature', 'created', 'closed']
SHAPES = {
    'list':    ['gui'],
    'mapping': {'gui': 'yes'},
    'int':     7,
    'float':   1.5,
    'bool':    True,
    'date':    datetime.date(2026, 1, 1),
    'nested':  [['a'], {'b': 'c'}],
    'bytes':   b'gui',
}
GOOD = {'id': 'T-002', 'slug': 's', 'type': 'impl', 'status': 'open',
        'assignee': 'developer', 'feature': 'gui', 'created': '2026-01-01'}
real = mod.parse_frontmatter
out = []
for shape, value in SHAPES.items():
    for field in FIELDS:
        fm = dict(GOOD); fm[field] = value
        mod.parse_frontmatter = lambda p, fm=fm: (fm, 'body')
        con = sqlite3.connect(':memory:'); con.executescript(mod.SCHEMA)
        rec = {'shape': shape, 'field': field}
        try:
            viol = mod.reindex_tickets(pathlib.Path(ROOT), con)
            rec['raised'] = None
            rec['violations'] = viol
            rec['cell'] = con.execute('SELECT %s FROM tickets' % field).fetchone()[0]
        except BaseException as e:
            rec['raised'] = type(e).__name__ + ': ' + str(e)
        out.append(rec)
mod.parse_frontmatter = real
print(json.dumps(out))
`

interface Rec { shape: string; field: string; raised: string | null; violations?: string[]; cell?: unknown }

describe.skipIf(!CAN_RUN)('class pin — every non-string shape, not just the list', () => {
  test('no shape raises, every unusable cell is NULL, every one is reported by name', () => {
    ticket('T-002', 'slug: real-file-on-disk')   // scan_tickets still walks the fs
    const hp = path.join(sandbox, 'harness.py')
    fs.writeFileSync(hp, HARNESS)
    const recs: Rec[] = JSON.parse(
      execFileSync('python3', [hp, PRDT_CLI, projectRoot], { encoding: 'utf8', timeout: 60000 }))
    // 8 shapes x 8 bound fields, all present — a fix that narrowed the guard to one
    // shape or one field shows up here as a `raised` value, never as a skipped case
    expect(recs).toHaveLength(64)
    for (const r of recs) {
      const at = `${r.shape} in ${r.field}`
      expect(r.raised, `raised on ${at}`).toBeNull()
      // `id` keys the row and falls back to the filename; the other six go NULL
      if (r.field === 'id') expect(r.cell, at).toBe('T-002')
      else expect(r.cell, at).toBeNull()
      const named = (r.violations ?? []).filter(v =>
        v.includes('T-002.md') && v.includes(`${r.field}: `) && v.includes('is not a string'))
      expect(named.length, `not named for ${at}: ${JSON.stringify(r.violations)}`).toBe(1)
      expect(named[0]).toContain(r.shape === 'nested' ? 'list' : r.shape === 'mapping' ? 'dict' : r.shape)
    }
  })

  test('str and None are the pass-through set — the guard adds nothing to a good row', () => {
    const passthrough = String.raw`
import json, pathlib, sqlite3, sys
from importlib.machinery import SourceFileLoader
import importlib.util
CLI, ROOT = sys.argv[1], sys.argv[2]
loader = SourceFileLoader('prdt_uut', CLI)
spec = importlib.util.spec_from_loader('prdt_uut', loader)
mod = importlib.util.module_from_spec(spec); loader.exec_module(mod)
print(json.dumps([[mod.index_scalar(v)[0], mod.index_scalar(v)[1]]
                  for v in ['gui', '', '  spaced  ', None]]))
`
    const pp = path.join(sandbox, 'passthrough.py')
    fs.writeFileSync(pp, passthrough)
    const got = JSON.parse(execFileSync('python3', [pp, PRDT_CLI, projectRoot], { encoding: 'utf8' }))
    // byte-identical, not stripped, not defaulted — the good path is unchanged
    expect(got).toEqual([['gui', null], ['', null], ['  spaced  ', null], [null, null]])
  })
})

/**
 * The invariant pin (T-556). The class pin above proves the guard answers every
 * SHAPE — but it asks the question one enumerated field at a time, and that is
 * exactly how `assignee` got missed: it was argued safe because norm_assignee's
 * `str()` prevented the crash, then wrote the cell "['developer']" with no warning
 * while `prdt tickets --assignee developer` silently missed the row. A field list
 * cannot catch the next such field; the property has to be stated over the write.
 *
 *   No cell bound into an index write may contain the stringification of a
 *   non-string.
 *
 * So this READS BACK the columns of every table the two index writes touch from
 * PRAGMA table_info, never from a list this file keeps, and asserts the property
 * over all of them.
 *
 * WHAT THAT DOES AND DOES NOT BUY (corrected on T-551 after T-550's delta QA
 * measured the earlier wording as an overclaim — it said a new column fed by a
 * `str()`-backed normalizer was swept "the day it is added, with nobody
 * remembering to extend a fixture", and reproduced 0/8 against that on a scratch
 * copy while the `assignee` regression this pin exists for was caught 8/8):
 *
 *   · Column DISCOVERY is genuinely dynamic. A new column is inspected the day it
 *     is added, and a coerced cell in it fails this test — PROVIDED the value that
 *     reaches it came from an injected key.
 *   · Value INJECTION is not. The harness plants its shapes under KEYS below, so
 *     the sweep can only catch a column downstream of one of those keys. A brand-new
 *     frontmatter-sourced column fed by a key that is NOT in KEYS, carrying its own
 *     coercion bug, is NOT caught: it is inspected, holds no injected value, and
 *     passes.
 *   · KEYS is derived from the script's own TICKET_INDEX_FIELDS / WIKI_INDEX_FIELDS
 *     rather than restated, so a new key added to those constants IS injected
 *     automatically. The residual gap is the key that bypasses them — read straight
 *     off `fm` by a new write path — which is precisely the shape `assignee` had
 *     before T-556, and which no in-test list can close. Closing it needs the guard
 *     to be the only door into a cell, which is what the invariant above states and
 *     what a reviewer, not this file, enforces.
 *
 * Out of scope by construction, and deliberately not injected below: `deps` and
 * `links`, the declared json-encoder channel (unreachable with today's parser,
 * recorded on T-554). Filesystem-derived cells (`version`, `path`, `name`) and the
 * `id` filename fallback are inspected like everything else — they simply never
 * carry the injected value, which is the point of checking rather than exempting
 * them.
 */
const INVARIANT_HARNESS = String.raw`
import datetime, json, pathlib, sqlite3, sys
from importlib.machinery import SourceFileLoader
import importlib.util

CLI, ROOT = sys.argv[1], sys.argv[2]
loader = SourceFileLoader('prdt_uut', CLI)
spec = importlib.util.spec_from_loader('prdt_uut', loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)

SHAPES = {
    'list':    ['developer'],
    'mapping': {'developer': 'yes'},
    'int':     987654321,
    'float':   1.5,
    'bool':    True,
    'date':    datetime.date(2026, 3, 4),
    'nested':  [['a'], {'b': 'c'}],
    'bytes':   b'developer',
}
# Every frontmatter key the two write paths route through index_scalar, read off
# the script's own constants (T-551) so a key added there is injected without
# anyone remembering this file. deps/links are absent from those tuples by design
# — the T-554 json channel. See the doc comment for what this does NOT reach: a
# key that bypasses the constants entirely.
KEYS = list(dict.fromkeys(list(mod.TICKET_INDEX_FIELDS) + list(mod.WIKI_INDEX_FIELDS)))
TABLES = ['tickets', 'wiki_pages', 'wiki_fts']

real = mod.parse_frontmatter
out = []
for shape, value in SHAPES.items():
    text = str(value)
    fm = dict((k, value) for k in KEYS)
    mod.parse_frontmatter = lambda p, fm=fm: (dict(fm), 'body')
    con = sqlite3.connect(':memory:')
    con.executescript(mod.SCHEMA)
    con.execute('CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(name, title, body)')
    mod.reindex_tickets(pathlib.Path(ROOT), con)
    mod.index_project_wiki(pathlib.Path(ROOT), con)
    for table in TABLES:
        cols = [r[1] for r in con.execute('PRAGMA table_info(' + table + ')')]
        for row in con.execute('SELECT * FROM ' + table):
            for col, cell in zip(cols, row):
                out.append({'shape': shape, 'table': table, 'col': col,
                            'cell': None if cell is None else repr(cell),
                            'coerced': isinstance(cell, str) and text in cell})
mod.parse_frontmatter = real
print(json.dumps(out))
`

interface Cell { shape: string; table: string; col: string; cell: string | null; coerced: boolean }

describe.skipIf(!CAN_RUN)('invariant pin — no bound cell holds a stringified non-string', () => {
  test('every column of every index write, swept from the schema itself', () => {
    ticket('T-002', 'slug: real-file-on-disk')
    // the other write path needs a page on disk; no digits in the name, so a cell
    // falling back to the filename cannot accidentally contain a numeric shape
    fs.writeFileSync(path.join(projectRoot, 'docs', 'wiki', 'fact--bad-shapes.md'),
      '---\ntitle: t\ntype: fact\nstatus: live\n---\n\nbody\n')
    const hp = path.join(sandbox, 'invariant.py')
    fs.writeFileSync(hp, INVARIANT_HARNESS)
    const cells: Cell[] = JSON.parse(
      execFileSync('python3', [hp, PRDT_CLI, projectRoot], { encoding: 'utf8', timeout: 60000 }))

    const bad = cells.filter(c => c.coerced)
    expect(bad, `coerced cells: ${JSON.stringify(bad)}`).toEqual([])

    // the sweep actually reached all three writes, and reached the column that was
    // missed — otherwise "no coerced cells" is satisfied by having looked nowhere
    const seen = new Set(cells.map(c => `${c.table}.${c.col}`))
    for (const t of ['tickets', 'wiki_pages', 'wiki_fts']) {
      expect([...seen].some(k => k.startsWith(`${t}.`)), `no columns swept for ${t}`).toBe(true)
    }
    expect(seen.has('tickets.assignee')).toBe(true)
    expect(new Set(cells.map(c => c.shape)).size).toBe(8)
  })

  test('the derived KEYS actually cover the guarded fields — the derive is not a hole', () => {
    // deriving the injection list buys nothing if the constants it reads can shrink
    // unnoticed, so the set is pinned here ONCE, deliberately, instead of being
    // restated inside the harness where it would silently do the injecting too
    const kp = path.join(sandbox, 'keys.py')
    fs.writeFileSync(kp, String.raw`
import json, sys
from importlib.machinery import SourceFileLoader
import importlib.util
loader = SourceFileLoader('prdt_uut', sys.argv[1])
spec = importlib.util.spec_from_loader('prdt_uut', loader)
mod = importlib.util.module_from_spec(spec); loader.exec_module(mod)
print(json.dumps(list(dict.fromkeys(list(mod.TICKET_INDEX_FIELDS) + list(mod.WIKI_INDEX_FIELDS)))))
`)
    const keys: string[] = JSON.parse(
      execFileSync('python3', [kp, PRDT_CLI], { encoding: 'utf8' }))
    expect(keys).toEqual(['id', 'slug', 'type', 'status', 'assignee', 'feature',
      'created', 'closed', 'title', 'version'])
  })

  test('the assignee column specifically: NULL for every non-string shape', () => {
    // the regression itself, at the column rather than at the CLI — "['developer']"
    // is what this cell held before T-556, and a warning is what replaced it
    ticket('T-002', 'slug: real-file-on-disk')
    fs.writeFileSync(path.join(projectRoot, 'docs', 'wiki', 'fact--bad-shapes.md'),
      '---\ntitle: t\ntype: fact\nstatus: live\n---\n\nbody\n')
    const hp = path.join(sandbox, 'invariant.py')
    fs.writeFileSync(hp, INVARIANT_HARNESS)
    const cells: Cell[] = JSON.parse(
      execFileSync('python3', [hp, PRDT_CLI, projectRoot], { encoding: 'utf8', timeout: 60000 }))
    const assignee = cells.filter(c => c.table === 'tickets' && c.col === 'assignee')
    expect(assignee.length).toBeGreaterThan(0)
    for (const c of assignee) expect(c.cell, `assignee cell for ${c.shape}`).toBeNull()
  })
})
