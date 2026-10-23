/**
 * T-1104: `also:` key + legacy index safety. The `tickets` table keeps its 11
 * columns (an older prdt binds 11 positional values into a shared index.db), and
 * a legacy project (docs/tickets/<v>/, no docs/_shared/) still indexes.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
let home: string, legacy: string, product: string

function w(p: string, t: string) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t) }
function tk(p: string, id: string, extra = '') {
  w(p, `---\nid: ${id}\nslug: s\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-10-01\n${extra}---\n`)
}
function run(cwd: string, args: string[]) {
  return execFileSync('python3', [PRDT, ...args], {
    cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
    env: { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt') },
  })
}
function proj(name: string) {
  const r = path.join(home, name)
  w(path.join(r, '.prdt/config.json'), '{"slug":"alpha","products":[{"name":"beta"}]}')
  w(path.join(r, '.prdt/po-state.json'), '{"schema_version":1,"stage":"build","version":"v1.14","current_task":null}')
  return r
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'also-'))
  legacy = proj('legacy')
  for (const [v, id] of [['v1.14', 'T-1'], ['v1.15', 'T-2'], ['backlog', 'T-3']]) tk(path.join(legacy, 'docs/tickets', v, `${id}.md`), id)
  product = proj('product')
  w(path.join(product, 'docs/_shared/x.md'), '')
  tk(path.join(product, 'docs/alpha/tickets/v1.14/T-5.md'), 'T-5', 'also: [beta]\n')
  tk(path.join(product, 'docs/beta/tickets/v1.14/T-6.md'), 'T-6')
})

test('legacy project: every version dir and backlog still indexes', () => {
  run(legacy, ['index', 'rebuild'])
  expect(run(legacy, ['tickets', '--version', 'v1.14'])).toContain('T-1')
  expect(run(legacy, ['tickets', '--version', 'v1.15'])).toContain('T-2')
  expect(run(legacy, ['tickets', '--backlog'])).toContain('T-3')
})

test('tickets table is unchanged: an 11-value insert (older prdt) still works after a run', () => {
  const db = path.join(legacy, '.prdt/index.db')
  const out = execFileSync('python3', ['-c',
    'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("INSERT OR REPLACE INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?)",("T-9","s","impl","open","a","f","[]","c","","v1.14","p"));print(len(c.execute("PRAGMA table_info(tickets)").fetchall()))', db],
  { encoding: 'utf-8' })
  expect(out.trim()).toBe('11')
})

test('also: listing shows it and the named product lists the shared ticket', () => {
  run(product, ['index', 'rebuild'])
  expect(run(product, ['tickets', '--version', 'v1.14'])).toMatch(/T-5 .*also=beta/)
  const beta = run(product, ['tickets', '--version', 'beta/v1.14'])
  expect(beta).toContain('T-5')
  expect(beta).toContain('T-6')
})
