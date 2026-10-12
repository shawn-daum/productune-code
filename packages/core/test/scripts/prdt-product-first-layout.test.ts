/**
 * prdt-product-first-layout.test.ts — T-1104: the docs-layout seam.
 *
 * Design: docs/artifacts/v1.14/product-first-docs-layout.html (fixed-path
 * table · layer table · ② ③ ⑤ ⑧ = A). Two fixtures, built once per file:
 *   legacy  — an unmigrated single-product project (⑤ A: read and written as before)
 *   product — the same project after the move: docs/_shared/ + docs/proj/
 * Black-box over the REAL CLI, plus the seam functions loaded from the script.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let tmp: string
let home: string
let legacy: string
let product: string

function env(): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt') }
}

function run(cwd: string, args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: env(),
    timeout: subprocessTimeout('cli'),
  })
}

const LOADER = `
import importlib.util, importlib.machinery, sys, json
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = Path(sys.argv[2])
`

function py(root: string, body: string): any {
  const r = spawnSync('python3', ['-c', LOADER + body, PRDT_CLI, root], {
    encoding: 'utf8', timeout: 60_000, env: env(),
  })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

function write(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function ticket(dir: string, id: string) {
  write(path.join(dir, `${id}.md`), [
    '---', `id: ${id}`, `slug: fx-${id.toLowerCase()}`, 'type: impl', 'status: open',
    'assignee: developer', 'created: 2026-10-12', '---', '', '## problem', '', 'x', '',
  ].join('\n'))
}

/** Seed both fixtures with the same content; `d` maps an As-Is docs path to its home. */
function seed(root: string, d: (rel: string) => string) {
  write(path.join(root, d('prd/PRD.md')), '# PRD\n\n## v0.1\n\n#### item-a\n')
  // A closed section, written against docs/prd/ — its bytes never change.
  write(path.join(root, d('prd/versions/v0.0.md')),
    '## v0.0\n\nsee [spec](../features/viewer.md) · [mock](../artifacts/v0.1/mock.html)\n')
  write(path.join(root, d('features/viewer.md')), '# viewer\n')
  write(path.join(root, d('artifacts/v0.1/mock.html')), '<html><title>mock</title></html>\n')
  write(path.join(root, d('design.md')), '# design\n')
  write(path.join(root, d('wiki/fact--alpha.md')),
    '---\ntitle: alpha page\ntype: fact\nstatus: live\n---\n\nalpha body\n')
  write(path.join(root, d('wiki/retro--v0.0.md')),
    '---\ntitle: retro zero\ntype: retro\nstatus: live\n---\n\nretro body\n')
  ticket(path.join(root, d('tickets/v0.1')), 'T-001')
  ticket(path.join(root, d('tickets/backlog')), 'T-004')
}

const PRODUCT_ROWS = ['prd', 'tickets', 'artifacts', 'DEPLOY.md']
function toBe(rel: string): string {
  const head = rel.split('/')[0]
  if (PRODUCT_ROWS.includes(head) || rel.startsWith('wiki/retro--')) return `docs/proj/${rel}`
  return `docs/_shared/${rel}`
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1104-'))
  home = path.join(tmp, 'home')
  fs.mkdirSync(home)
  legacy = path.join(tmp, 'legacy')
  fs.mkdirSync(legacy)
  run(legacy, ['init', '--json', '--slug', 'proj', '--yes'])
  product = path.join(tmp, 'product')
  fs.cpSync(legacy, product, { recursive: true })
  // The product fixture: init's As-Is dirs moved under docs/proj + docs/_shared.
  for (const k of ['prd', 'tickets', 'artifacts']) {
    fs.mkdirSync(path.join(product, 'docs', 'proj'), { recursive: true })
    fs.renameSync(path.join(product, 'docs', k), path.join(product, 'docs', 'proj', k))
  }
  fs.mkdirSync(path.join(product, 'docs', '_shared'))
  fs.renameSync(path.join(product, 'docs', 'wiki'), path.join(product, 'docs', '_shared', 'wiki'))
  seed(legacy, (r) => `docs/${r}`)
  seed(product, toBe)
  // The shared backlog (① A) holds the highest number — allocation must see it.
  ticket(path.join(product, 'docs', '_shared', 'tickets', 'backlog'), 'T-007')
  ticket(path.join(legacy, 'docs', 'tickets', 'backlog'), 'T-007')
}, 120_000)

afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('seam', () => {
  test('layout detection, products, and fixed-path homes', () => {
    const body = `print(json.dumps({"layout": m.docs_layout(root), "products": m.project_products(root),
      "prd": m.docs_rel(root, m.docs_path(root, "prd")), "wiki": m.docs_rel(root, m.docs_path(root, "wiki")),
      "design": m.docs_rel(root, m.docs_path(root, "design.md"))}))`
    expect(py(legacy, body)).toEqual({ layout: 'legacy', products: [], prd: 'docs/prd', wiki: 'docs/wiki', design: 'docs/design.md' })
    expect(py(product, body)).toEqual({
      layout: 'product', products: ['proj'], prd: 'docs/proj/prd',
      wiki: 'docs/_shared/wiki', design: 'docs/_shared/design.md',
    })
  })

  test('② layer chain: both read, product first', () => {
    write(path.join(product, 'docs', 'proj', 'design.md'), '# proj-only\n')
    try {
      const out = py(product, `print(json.dumps([m.docs_rel(root, p) for p in m.docs_layer_chain(root, "design.md")]))`)
      expect(out).toEqual(['docs/proj/design.md', 'docs/_shared/design.md'])
      expect(py(legacy, `print(json.dumps([m.docs_rel(root, p) for p in m.docs_layer_chain(root, "design.md")]))`))
        .toEqual(['docs/design.md'])
    } finally {
      fs.rmSync(path.join(product, 'docs', 'proj', 'design.md'))
    }
  })

  test('③ closed PRD links resolve via product → _shared; closed file stays byte-identical', () => {
    const closed = path.join(product, 'docs', 'proj', 'prd', 'versions', 'v0.0.md')
    const before = fs.readFileSync(closed)
    const out = py(product, `base = root / "docs/proj/prd"
print(json.dumps([m.resolve_docs_link(root, base, h) for h in
  ("../features/viewer.md", "../artifacts/v0.1/mock.html", "./versions/v0.0.md", "../../../../etc/passwd")]))`)
    expect(out).toEqual([
      'docs/_shared/features/viewer.md', 'docs/proj/artifacts/v0.1/mock.html',
      'docs/proj/prd/versions/v0.0.md', null,
    ])
    for (const p of out.slice(0, 3)) expect(fs.existsSync(path.join(product, p))).toBe(true)
    // backticked As-Is paths (DOC_PATH_RE shape) map through the same rule
    const refs = py(product, `print(json.dumps([m.resolve_docs_ref(root, r) for r in
  ("docs/tickets/v0.1/T-001.md", "docs/wiki/fact--alpha.md", "docs/wiki/retro--v0.0.md", "docs/design.md", "docs/proj/prd/PRD.md")]))`)
    expect(refs).toEqual([
      'docs/proj/tickets/v0.1/T-001.md', 'docs/_shared/wiki/fact--alpha.md',
      'docs/proj/wiki/retro--v0.0.md', 'docs/_shared/design.md', 'docs/proj/prd/PRD.md',
    ])
    // legacy: unchanged
    expect(py(legacy, `print(json.dumps(m.resolve_docs_link(root, root / "docs/prd", "../features/viewer.md")))`))
      .toBe('docs/features/viewer.md')
    expect(fs.readFileSync(closed).equals(before)).toBe(true)
  })

  test('current product: prd_path hint → po-state current_task.product → first', () => {
    expect(py(product, `print(json.dumps(m.current_product(root, "docs/proj/prd/PRD.md#v0.1")))`)).toBe('proj')
    expect(py(product, `print(json.dumps(m.current_product(root)))`)).toBe('proj')
    expect(py(legacy, `print(json.dumps(m.current_product(root)))`)).toBe(null)
  })
})

describe('CLI readers on both layouts', () => {
  test('tickets new writes the layout-local dir and numbers across the shared backlog', () => {
    run(legacy, ['tickets', 'new', '--type', 'impl', '--slug', 'next-one'])
    run(product, ['tickets', 'new', '--type', 'impl', '--slug', 'next-one'])
    expect(fs.existsSync(path.join(legacy, 'docs', 'tickets', 'v0.1', 'T-008.md'))).toBe(true)
    expect(fs.existsSync(path.join(product, 'docs', 'proj', 'tickets', 'v0.1', 'T-008.md'))).toBe(true)
    const ids = (s: string) => [...s.matchAll(/^(T-\d+)/gm)].map((x) => x[1]).sort()
    expect(ids(run(product, ['tickets']))).toEqual(ids(run(legacy, ['tickets'])))
    expect(ids(run(product, ['tickets']))).toEqual(['T-001', 'T-004', 'T-007', 'T-008'])
  })

  test('artifacts sync writes the product manifest', () => {
    run(legacy, ['artifacts', 'sync'])
    run(product, ['artifacts', 'sync'])
    const a = JSON.parse(fs.readFileSync(path.join(legacy, 'docs', 'artifacts', 'manifest.json'), 'utf8'))
    const b = JSON.parse(fs.readFileSync(path.join(product, 'docs', 'proj', 'artifacts', 'manifest.json'), 'utf8'))
    const strip = (m: any) => m.entries.map((e: any) => [e.bucket, e.path])
    expect(strip(b)).toEqual(strip(a))
    expect(strip(b)).toEqual([['v0.1', 'mock.html']])
  })

  test('wiki search reads _shared and the product wiki', () => {
    run(product, ['wiki', 'reindex'])
    expect(run(product, ['wiki', 'search', 'alpha'])).toContain('fact--alpha')
    expect(run(product, ['wiki', 'search', 'retro'])).toContain('retro--v0.0')
    expect(fs.existsSync(path.join(product, 'docs', '_shared', 'wiki', 'index.md'))).toBe(true)
  })

  test('doctor: the product layout raises no warning the legacy layout does not', () => {
    const norm = (s: string, name: string) => s.split('\n')
      .filter((l) => /^⚠ /.test(l) && !/machine:|discipline:/.test(l))
      .map((l) => l.split(name).join('X').replace(/docs\/(proj|_shared)\//g, 'docs/'))
      .sort()
    const doc = (cwd: string) => {
      const r = spawnSync('python3', [PRDT_CLI, 'doctor'], { cwd, encoding: 'utf8', env: env(), timeout: subprocessTimeout('cli') })
      return `${r.stdout}${r.stderr}`
    }
    expect(norm(doc(product), 'product')).toEqual(norm(doc(legacy), 'legacy'))
  }, 120_000)
})
