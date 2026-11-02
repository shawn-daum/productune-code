/**
 * prdt-per-product-artifacts.test.ts — T-1218: in a multi-product project the
 * artifacts readers/writers, the message path rewrite and the wiki-name
 * resolution follow the product a file or command is about — never po-state
 * `current_task.product` — and doctor checks each added product's PRD layout.
 *
 * Fixture (product layout): `docs/_shared/` + first product `home` (`## v0.1`)
 * + added product `arch` (`## v0.2`).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'prdt')
const PYTHON3 = (() => { try { return execFileSync('which', ['python3'], { encoding: 'utf8' }).trim() || null } catch { return null } })()

let tmpRoot: string
let root: string
let prdtHome: string

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' }
}

const LOADER = `
import importlib.util, importlib.machinery, sys, json
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = Path(sys.argv[2])
st = json.loads((root / ".prdt" / "po-state.json").read_text())
`

function py(body: string): any {
  const r = spawnSync('python3', ['-c', LOADER + body, PRDT_CLI, root], {
    encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env(),
  })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

function cli(args: string[]) {
  return spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env(),
  })
}

function write(rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function read(rel: string) { return fs.readFileSync(path.join(root, rel), 'utf8') }

function ticket(product: string, version: string, id: string) {
  write(`docs/${product}/tickets/${version}/${id}.md`, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`,
    'type: impl', 'status: open', 'assignee: developer', 'created: 2026-10-15', '---', '', '## problem', '', 'x', ''].join('\n'))
}

function state(current?: string) {
  const st: any = { stage: 'build', version: 'v0.1', products: { arch: { stage: 'build', version: 'v0.2' } } }
  if (current) st.current_task = { product: current }
  write('.prdt/po-state.json', JSON.stringify(st))
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-perprod-art-'))
  root = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(prdtHome, { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', '_shared', 'wiki'), { recursive: true })
  write('.prdt/config.json', JSON.stringify({ slug: 'home', products: [{ name: 'arch' }] }))
  write('docs/home/prd/PRD.md', '# PRD\n\n## v0.1 — round\n\nsee [[retro--v0.0]]\n')
  write('docs/arch/prd/PRD.md', '# PRD\n\n## v0.2 — round\n\nx\n')
  write('docs/home/wiki/retro--v0.0.md', '---\ntype: retro\ntitle: r\n---\n\nbody\n')
  write('docs/home/artifacts/v0.1/h.md', '# h\n')
  write('docs/arch/artifacts/v0.2/r.md', '# r\n')
  ticket('home', 'v0.1', 'T-001')
  ticket('arch', 'v0.2', 'T-010')
  state()
})

afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

const CURS = [undefined, 'home', 'arch']

describe.skipIf(!PYTHON3)('T-1218 per-product artifacts · messages · wiki · PRD checks', () => {
  test('PRD layout message names the product it is about, whatever the current product', () => {
    write('docs/home/prd/PRD.md', '# PRD\n\n## v0.1 — round\n\nx\n\n## v0.0 — old\n\ny\n')
    for (const cur of CURS) {
      state(cur)
      const out = py('print(json.dumps([m.docs_msg(root, w) for w in m.prd_layout_warnings(root, st)]))')
      expect(out.length).toBe(1)
      expect(out[0]).toContain('docs/home/prd/versions/v0.0.md')
      expect(out[0]).not.toContain('docs/arch/')
    }
  })

  test('doctor checks the added product\'s PRD layout (closed section in PRD.md · ticket dir without version file)', () => {
    write('docs/arch/prd/PRD.md', '# PRD\n\n## v0.2 — round\n\nx\n\n## v0.1 — old\n\ny\n')
    ticket('arch', 'v0.0', 'T-005')
    let first: string[] | null = null
    for (const cur of CURS) {
      state(cur)
      const out = py('print(json.dumps([m.docs_msg(root, w) for w in m.prd_line_layout_warnings(root, st)]))')
      expect(out.some((w: string) => w.includes('`## v0.1`') && w.includes('docs/arch/prd/PRD.md')
        && w.includes('docs/arch/prd/versions/v0.1.md'))).toBe(true)
      expect(out.some((w: string) => w.includes('docs/arch/tickets/v0.0/') && w.includes('docs/arch/prd/versions/v0.0.md'))).toBe(true)
      expect(out.some((w: string) => w.includes('docs/home/'))).toBe(false)
      if (first === null) first = out
      else expect(out).toEqual(first)
    }
  })

  test('wiki names in a PRD resolve against that PRD\'s own product, whatever the current product', () => {
    write('docs/arch/prd/PRD.md', '# PRD\n\n## v0.2 — round\n\nsee [[retro--v0.0]]\n')
    for (const cur of CURS) {
      state(cur)
      const out = py('print(json.dumps(m.prd_ticket_link_warnings(root)))')
      // home PRD cites its own retro page: resolves; arch PRD cites a page arch has not: dead
      expect(out).toEqual(['docs/arch/prd/PRD.md:5: [[retro--v0.0]] does not exist (wiki)'])
    }
  })

  test('wiki page links and orphans resolve in the page\'s own product, whatever the current product', () => {
    write('docs/arch/wiki/fact--a.md', '---\ntype: fact\ntitle: a\n---\n\nsee [[fact--b]]\n')
    write('docs/arch/wiki/fact--b.md', '---\ntype: fact\ntitle: b\n---\n\nbody\n')
    write('docs/arch/wiki/fact--c.md', '---\ntype: fact\ntitle: c\n---\n\nsee [[fact--nope]]\n')
    write('docs/home/wiki/fact--h.md', '---\ntype: fact\ntitle: h\n---\n\nsee [[arch:fact--b]] and [[retro--v0.0]]\n')
    write('docs/_shared/wiki/fact--s.md', '---\ntype: fact\ntitle: s\n---\n\nsee [[home:fact--h]]\n')
    cli(['wiki', 'reindex'])   // doctor regenerates index.md itself — start every run from the same tree
    let first: string[] | null = null
    let doctorFirst: string[] | null = null
    for (const cur of CURS) {
      state(cur)
      const out: string[] = py('print(json.dumps(m.wiki_lint(root)))')
      // arch's own [[fact--b]] resolves; prefixed links resolve; fact--a/fact--b/fact--h/retro are linked
      expect(out.filter(w => w.includes('fact--b') || w.includes('fact--h') || w.includes('retro--v0.0')
        || w.includes('fact--a') || w.includes('fact--s'))).toEqual([])
      // the one truly dead link, named the same way at every current product
      expect(out.filter(w => w.includes('does not exist'))).toEqual(
        ['wiki: [[fact--nope]] referenced from arch:fact--c does not exist'])
      if (first === null) first = out
      else expect(out).toEqual(first)
      const d = cli(['doctor'])
      const dw = (d.stdout + d.stderr).split('\n').filter(l => l.includes('wiki:'))
      if (doctorFirst === null) doctorFirst = dw
      else expect(dw).toEqual(doctorFirst)
    }
  })

  test('artifacts migrate across products is all-or-nothing: a blocker in one product writes nothing anywhere', () => {
    write('docs/home/artifacts/v0.1/manifest.json', JSON.stringify({ entries: [{ path: 'h.md' }] }))
    write('docs/arch/artifacts/bogus/manifest.json', JSON.stringify({ entries: [{ path: 'x.md' }] }))
    const r = cli(['artifacts', 'migrate'])
    expect(r.status).toBe(1)
    expect(fs.existsSync(path.join(root, 'docs/home/artifacts/v0.1/manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/home/artifacts/manifest.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'docs/arch/artifacts/bogus/manifest.json'))).toBe(true)
    const outLines = r.stdout.trim().split('\n')
    expect(outLines[outLines.length - 1]).toMatch(/nothing written/)
    expect(r.stdout).not.toMatch(/removed/)
    // fixed → both products migrate in one run
    fs.rmSync(path.join(root, 'docs/arch/artifacts/bogus'), { recursive: true })
    const ok = cli(['artifacts', 'migrate'])
    expect(ok.status).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/home/artifacts/v0.1/manifest.json'))).toBe(false)
    expect(JSON.parse(read('docs/home/artifacts/manifest.json')).entries.map((e: any) => `${e.bucket}/${e.path}`))
      .toEqual(['v0.1/h.md'])
  })

  test('artifacts sync writes each product\'s own manifest; the result does not move with the current product', () => {
    let seen: { home: string, arch: string } | null = null
    for (const cur of CURS) {
      state(cur)
      for (const p of ['home', 'arch']) fs.rmSync(path.join(root, `docs/${p}/artifacts/manifest.json`), { force: true })
      const r = cli(['artifacts', 'sync'])
      expect(r.status).toBe(0)
      const home = JSON.parse(read('docs/home/artifacts/manifest.json'))
      const arch = JSON.parse(read('docs/arch/artifacts/manifest.json'))
      expect(home.entries.map((e: any) => `${e.bucket}/${e.path}`)).toEqual(['v0.1/h.md'])
      expect(arch.entries.map((e: any) => `${e.bucket}/${e.path}`)).toEqual(['v0.2/r.md'])
      const now = { home: r.stdout, arch: '' }
      if (seen === null) seen = now
      else expect(now).toEqual(seen)
    }
  })

  test('artifacts readers: default = first product, explicit product = that product; check clean for both', () => {
    cli(['artifacts', 'sync'])
    for (const cur of CURS) {
      state(cur)
      const out = py(`print(json.dumps({
        "home": sorted(f"{b}/{p}" for b, p in m.read_artifact_manifest(root)[0]),
        "arch": sorted(f"{b}/{p}" for b, p in m.read_artifact_manifest(root, "arch")[0]),
        "warns": m.all_artifact_placement_warnings(root)}))`)
      expect(out).toEqual({ home: ['v0.1/h.md'], arch: ['v0.2/r.md'], warns: [] })
    }
    fs.rmSync(path.join(root, 'docs/arch/artifacts/manifest.json'))
    state('home')
    const w = py('print(json.dumps([m.docs_msg(root, x) for x in m.all_artifact_placement_warnings(root)]))')
    expect(w.length).toBe(1)
    expect(w[0]).toContain('docs/arch/artifacts/manifest.json')
  })

  test('artifacts set writes the manifest of the product its path names', () => {
    cli(['artifacts', 'sync'])
    state('home')
    const r = cli(['artifacts', 'set', 'docs/arch/artifacts/v0.2/r.md', '--ticket', 'T-010'])
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    const arch = JSON.parse(read('docs/arch/artifacts/manifest.json'))
    expect(arch.entries[0].ticket).toBe('T-010')
    const home = JSON.parse(read('docs/home/artifacts/manifest.json'))
    expect(home.entries[0].ticket ?? null).toBe(null)
  })
})
