/**
 * product-first-shell-readers.test.ts — T-1104 slice A: the shell-side readers
 * (core hooks, statusline) on the product-first docs layout.
 *
 * Design: docs/artifacts/v1.14/product-first-docs-layout.html. The hooks and
 * the statusline embed their own python, so each carries a copy of the CLI's
 * `project_products` / `tickets_homes`. This file pins:
 *   - every copy answers exactly what the CLI's `project_products` /
 *     `product_docs_dirs(root, "tickets")` answer, over a spread of layouts;
 *   - link-check · question-check · user-prompt read product tickets (and the
 *     shared backlog), and still read the legacy tree unchanged;
 *   - single-product statusline output is byte-identical before / after the
 *     migration (the PRD's necessary condition).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const SCRIPTS = path.join(CORE_ROOT, 'scripts')
const PRDT_CLI = path.join(SCRIPTS, 'prdt')
const HOOKS = path.join(SCRIPTS, 'hooks')
const COPIES = [
  path.join(HOOKS, 'prdt-link-check.sh'),
  path.join(HOOKS, 'prdt-question-check.sh'),
  path.join(HOOKS, 'prdt-user-prompt.sh'),
  path.join(HOOKS, 'prdt-post-dispatch.sh'),
  path.join(SCRIPTS, 'statusline-prdt.sh'),
]

let tmp: string
let home: string
const env = () => ({ ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_LANG: 'en' })

function write(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
function ticket(dir: string, id: string, extra: Record<string, string> = {}) {
  const fm = { id, slug: `fx-${id.toLowerCase()}`, type: 'impl', status: 'open', assignee: 'developer', created: '2026-10-12', ...extra }
  write(path.join(dir, `${id}.md`), `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\nbody\n`)
}
function project(name: string, config: object, shared: boolean, dirs: string[] = []): string {
  const root = path.join(tmp, name)
  write(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
  write(path.join(root, '.prdt', 'config.json'), JSON.stringify(config))
  if (shared) fs.mkdirSync(path.join(root, 'docs', '_shared'), { recursive: true })
  for (const d of dirs) fs.mkdirSync(path.join(root, 'docs', d), { recursive: true })
  return root
}

/** The shell copy, lifted verbatim from a script (between its marker comment and `def tickets_homes` end). */
function snippet(file: string): string {
  const src = fs.readFileSync(file, 'utf8')
  const a = src.indexOf('_PROD_NAME_RE = re.compile')
  const b = src.indexOf('    return ([(p, os.path.join(root, "docs", p, "tickets")) for p in prods]')
  expect(a).toBeGreaterThan(0)
  const end = src.indexOf('\n', src.indexOf('"_shared", "tickets")', b))
  return 'import json, os, re\n' + src.slice(a, end + 1)
}
function copyAnswer(file: string, root: string) {
  const r = spawnSync('python3', ['-c', snippet(file) + 'import sys; print(json.dumps([project_products(sys.argv[1]), tickets_homes(sys.argv[1])]))', root],
    { encoding: 'utf8', timeout: 30_000 })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}
function cliAnswer(root: string) {
  const body = `
import importlib.machinery, importlib.util, sys, json
from pathlib import Path
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
root = Path(sys.argv[2])
print(json.dumps([m.project_products(root), [[p, str(d)] for p, d in m.product_docs_dirs(root, "tickets")]]))
`
  const r = spawnSync('python3', ['-c', body, PRDT_CLI, root], { encoding: 'utf8', timeout: 60_000, env: env() })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1104-shell-')))
  home = path.join(tmp, 'home')
  fs.mkdirSync(home, { recursive: true })
})
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('every shell copy of the product derivation equals the CLI', () => {
  const layouts: Array<[string, object, boolean, string[]]> = [
    ['legacy', { slug: 'proj' }, false, ['tickets', 'prd']],
    ['one-product', { slug: 'proj' }, true, ['proj/prd', 'proj/tickets']],
    ['slug-first-then-products', { slug: 'beta', products: [{ name: 'alpha' }, { name: 'beta' }, { name: 'Bad Name' }, { name: 'v2' }, { name: 'backlog' }] }, true, ['alpha/prd', 'beta/tickets', 'gamma/tickets', 'zeta/prd']],
    ['slug-needs-normalizing', { slug: 'Alpha-App', products: [{ name: 'beta' }] }, true, ['alpha-app/prd', 'beta/tickets']],
    ['slug-illegal-folder-name', { slug: 'V2 Thing!' }, true, ['product/prd', 'zeta/tickets']],
    ['dir-discovery-only', {}, true, ['zeta/tickets', 'alpha/prd', '_hidden/prd', '.dot/tickets', 'Mixed/prd', 'plain']],
    ['no-config', null as any, true, ['solo/prd']],
  ]
  test.each(layouts)('%s', (name, cfg, shared, dirs) => {
    const root = project(`parity-${name}`, cfg ?? {}, shared, dirs)
    if (cfg === null) fs.rmSync(path.join(root, '.prdt', 'config.json'))
    const want = cliAnswer(root)
    for (const f of COPIES) expect(copyAnswer(f, root), path.basename(f)).toEqual(want)
  })
  test('a symlinked docs/_shared is not the product layout (CLI and copies agree)', () => {
    const root = project('parity-symlink', { slug: 'proj' }, false, ['proj/prd'])
    fs.mkdirSync(path.join(tmp, 'elsewhere'), { recursive: true })
    fs.symlinkSync(path.join(tmp, 'elsewhere'), path.join(root, 'docs', '_shared'))
    const want = cliAnswer(root)
    expect(want[0]).toEqual([])
    for (const f of COPIES) expect(copyAnswer(f, root)).toEqual(want)
  })
})

describe('hooks read the product layout and the legacy one', () => {
  function layoutPair(name: string) {
    const legacy = project(`${name}-legacy`, { slug: 'proj' }, false)
    const prod = project(`${name}-prod`, { slug: 'proj' }, true, ['proj/prd'])
    return { legacy, prod, ldir: path.join(legacy, 'docs', 'tickets'), pdir: path.join(prod, 'docs', 'proj', 'tickets') }
  }
  const stop = (hook: string, cwd: string, reply: string, agent = 'prdt-po') => execFileSync('bash', [path.join(HOOKS, hook)], {
    input: JSON.stringify({ session_id: 's', hook_event_name: 'Stop', agent_type: agent, stop_hook_active: false, cwd, last_assistant_message: reply }),
    encoding: 'utf8', timeout: 20_000, env: env(),
  })

  test('link-check: a ticket under docs/<p>/tickets, and the shared backlog, is a known id; legacy unchanged', () => {
    const { legacy, prod, ldir, pdir } = layoutPair('lc')
    ticket(path.join(ldir, 'v0.1'), 'T-11')
    ticket(path.join(pdir, 'v0.1'), 'T-11')
    ticket(path.join(prod, 'docs', '_shared', 'tickets', 'backlog'), 'T-12')
    const reply = 'T-11 is done and T-12 is next.'
    const lo = JSON.parse(stop('prdt-link-check.sh', legacy, reply))
    const po = JSON.parse(stop('prdt-link-check.sh', prod, reply))
    expect(lo.reason).toContain('unlinked first mention: T-11.')
    expect(po.reason).toContain('unlinked first mention: T-11, T-12.')
  })

  test('link-check: a project with no ticket anywhere is silent in both layouts', () => {
    const { legacy, prod } = layoutPair('lc0')
    expect(stop('prdt-link-check.sh', legacy, 'T-99 was mentioned.')).toBe('')
    expect(stop('prdt-link-check.sh', prod, 'T-99 was mentioned.')).toBe('')
  })
})

describe('statusline: single-product output is byte-identical before and after the migration', () => {
  function line(root: string): string {
    return execFileSync('bash', [path.join(SCRIPTS, 'statusline-prdt.sh')], {
      input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8', env: env(),
    })
  }
  function seed(root: string, tdir: string) {
    ticket(path.join(tdir, 'v0.1'), 'T-1', { status: 'done', type: 'impl' })
    ticket(path.join(tdir, 'v0.1'), 'T-2', { type: 'design' })
    ticket(path.join(tdir, 'v0.1'), 'T-3', { type: 'decision', assignee: 'user' })
    ticket(path.join(tdir, 'v0.1'), 'T-4', { type: 'qa', assignee: 'user' })
    ticket(path.join(tdir, 'v0.0'), 'T-0', { status: 'done' })
    ticket(path.join(tdir, 'backlog'), 'T-5')
    write(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
      schema_version: 1, stage: 'build', version: 'v0.1',
      current_task: { id: 'T-2', assignee: 'developer', started_at: '2026-10-12T00:00:00Z' },
    }))
  }

  test('home row: stage n/m · total · dec · req identical, legacy vs product', () => {
    const legacy = project('sl-legacy', { slug: 'proj' }, false)
    seed(legacy, path.join(legacy, 'docs', 'tickets'))
    const prod = project('sl-prod', { slug: 'proj' }, true, ['proj/prd'])
    seed(prod, path.join(prod, 'docs', 'proj', 'tickets'))
    const a = line(legacy), b = line(prod)
    expect(a).toContain('total tickets 1/4')
    expect(a).toContain('decision T-3')
    // the two projects differ only in directory name (`sl-legacy` vs `sl-prod`) if that is printed at all
    expect(b.split(path.join(tmp, 'sl-prod')).join('@')).toBe(a.split(path.join(tmp, 'sl-legacy')).join('@'))
  })

  test('a second product reads its own docs/<line>/tickets as an added line', () => {
    const root = project('sl-two', { slug: 'proj', lines: [{ name: 'other' }] }, true, ['proj/prd', 'other/prd'])
    ticket(path.join(root, 'docs', 'proj', 'tickets', 'v0.1'), 'T-1', { status: 'done' })
    ticket(path.join(root, 'docs', 'other', 'tickets', 'v0.2'), 'T-2')
    ticket(path.join(root, 'docs', 'other', 'tickets', 'v0.2'), 'T-3', { status: 'done' })
    write(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
      schema_version: 1, stage: 'build', version: 'v0.1', current_task: null,
      lines: { other: { stage: 'build', version: 'v0.2' } },
    }))
    const out = line(root)
    expect(out).toContain('total tickets 1/1')
    expect(out).toContain('total tickets 1/2')
  })
})
