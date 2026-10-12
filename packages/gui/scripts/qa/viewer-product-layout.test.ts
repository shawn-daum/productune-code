// T-1104 part 2: the static viewer reads the product-first docs layout
// (`docs/_shared/` + `docs/<product>/`), with the same anchors as the CLI's
// viewer_anchor, closed-PRD links resolved product → _shared, and a
// single-product project rendering as it did in the legacy layout.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, it, expect, beforeAll } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage, buildAnchors, buildDocPathTargets, resolveDocLink } from '@productune/viewer/lib/render.mjs'

const PRDT = path.resolve(__dirname, '../../../core/scripts/prdt')
const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })

function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string, status = 'open', extra = '') => `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: ${status}\nassignee: developer\n---\nbody of ${id} ${extra}\n`
const PRD = `# PRD\n\nhead\n\n## v1.1 — round\n\n#### a — Item A\n\nsee docs/tickets/v1.1/T-1.md and \`docs/wiki/decision--a.md\` and docs/artifacts/v1.1/a.md\n`
const CLOSED = `## v1.0 — closed\n\nlinks [design](../../design.md) · [wiki](../../wiki/decision--a.md) · [own](./x.md)\n\nand docs/tickets/v1.0/T-0.md\n`
const WIKI = `---\ntype: decision\nversion: v1.1\ntitle: d\n---\nbody\n`
const MANIFEST = JSON.stringify({ entries: [{ bucket: 'v1.1', path: 'a.md', ticket: 'T-1', kind: 'doc', status: 'draft', lang: 'ko', added_at: '2026-01-01' }] })

// the same project in both layouts: [As-Is path, To-Be path]
const FILES: Array<[string, string, string]> = [
  ['docs/prd/PRD.md', 'docs/alpha/prd/PRD.md', PRD],
  ['docs/prd/versions/v1.0.md', 'docs/alpha/prd/versions/v1.0.md', CLOSED],
  ['docs/tickets/v1.1/T-1.md', 'docs/alpha/tickets/v1.1/T-1.md', ticket('T-1')],
  ['docs/tickets/v1.0/T-0.md', 'docs/alpha/tickets/v1.0/T-0.md', ticket('T-0', 'done')],
  ['docs/tickets/backlog/T-9.md', 'docs/_shared/tickets/backlog/T-9.md', ticket('T-9')],
  ['docs/wiki/decision--a.md', 'docs/_shared/wiki/decision--a.md', WIKI],
  ['docs/features/f.md', 'docs/_shared/features/f.md', '---\ntitle: F\nstatus: done\n---\nspec\n'],
  ['docs/design.md', 'docs/_shared/design.md', '# design\n'],
  ['docs/artifacts/manifest.json', 'docs/alpha/artifacts/manifest.json', MANIFEST],
  ['docs/artifacts/v1.1/a.md', 'docs/alpha/artifacts/v1.1/a.md', '# artifact a\n'],
]

function project(layout: 'legacy' | 'product'): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `viewer-pl-${layout}-`)))
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'alpha' }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.1', current_task: null }))
  for (const [asIs, toBe, text] of FILES) write(root, layout === 'legacy' ? asIs : toBe, text)
  return root
}
const gather = (root: string) => collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') })

let proot: string
let lroot: string
let pdata: any
let ldata: any
let phtml: string
let lhtml: string
beforeAll(() => {
  proot = project('product')
  lroot = project('legacy')
  pdata = gather(proot)
  ldata = gather(lroot)
  phtml = render(pdata)
  lhtml = render(ldata)
})

const detail = (html: string) => JSON.parse(html.match(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s)![1])

describe('collect reads the product layout', () => {
  it('PRD, tickets (incl. the shared backlog), wiki, features, artifacts come from the To-Be dirs', () => {
    expect(pdata.docsLayout.layout).toBe('product')
    expect(pdata.prd.current.rel).toBe('docs/alpha/prd/PRD.md')
    expect(pdata.prd.closed.map((c: any) => c.rel)).toEqual(['docs/alpha/prd/versions/v1.0.md'])
    expect(pdata.tickets.included.map((t: any) => t.rel).sort()).toEqual(['docs/_shared/tickets/backlog/T-9.md', 'docs/alpha/tickets/v1.1/T-1.md'])
    expect(pdata.tickets.omitted.map((b: any) => b.bucket)).toEqual(['v1.0'])
    expect(pdata.wiki.map((p: any) => p.rel)).toEqual(['docs/_shared/wiki/decision--a.md'])
    expect(pdata.features.map((p: any) => p.rel)).toEqual(['docs/_shared/features/f.md'])
    expect(pdata.artifacts.entries.map((e: any) => e.diskRel)).toEqual(['docs/alpha/artifacts/v1.1/a.md'])
    expect(pdata.artifacts.entries[0].inlined).toBe(true)
  })

  it('a product wiki page shadows the shared one of the same name; the others of both layers list', () => {
    write(proot, 'docs/alpha/wiki/decision--a.md', '---\ntype: decision\nversion: v1.1\ntitle: product\n---\nproduct body\n')
    write(proot, 'docs/_shared/wiki/other.md', '---\ntype: note\n---\no\n')
    const d = gather(proot)
    expect(d.wiki.map((p: any) => p.rel)).toEqual(['docs/alpha/wiki/decision--a.md', 'docs/_shared/wiki/other.md'])
    fs.rmSync(path.join(proot, 'docs/alpha/wiki'), { recursive: true })
    fs.rmSync(path.join(proot, 'docs/_shared/wiki/other.md'))
  })

  it('legacy layout reads exactly the old paths', () => {
    expect(ldata.docsLayout.layout).toBe('legacy')
    expect(ldata.prd.current.rel).toBe('docs/prd/PRD.md')
    expect(ldata.wiki.map((p: any) => p.rel)).toEqual(['docs/wiki/decision--a.md'])
    expect(ldata.artifacts.entries[0].diskRel).toBe('docs/artifacts/v1.1/a.md')
  })
})

describe('anchors and body links on To-Be paths', () => {
  it('anchor keys are the real To-Be paths', () => {
    const a = buildAnchors(pdata)
    for (const k of ['docs/alpha/prd/PRD.md', 'docs/alpha/prd/versions/v1.0.md', 'docs/_shared/wiki/decision--a.md', 'docs/_shared/features/f.md', 'docs/alpha/artifacts/v1.1/a.md', 'T-1', 'T-0', 'T-9']) expect(a, k).toHaveProperty([k])
    expect(a).not.toHaveProperty(['docs/prd/PRD.md'])
  })

  it('every key the CLI viewer_anchor gives exists in the page anchor table (and the CLI agrees on what has none)', () => {
    const py = spawnSync('python3', ['--version'])
    if (py.status !== 0) return
    const targets = [
      'docs/alpha/prd/PRD.md', 'docs/alpha/prd/versions/v1.0.md', 'docs/alpha/tickets/v1.1/T-1.md', 'docs/alpha/tickets/v1.0/T-0.md',
      'docs/_shared/tickets/backlog/T-9.md', 'docs/_shared/wiki/decision--a.md', 'docs/_shared/features/f.md', 'docs/alpha/artifacts/v1.1/a.md',
      'docs/_shared/design.md', 'docs/alpha/artifacts/v1.1/notes.html',
    ].map((t) => path.join(proot, t))
    const script = `import sys, json, importlib.machinery, importlib.util
from pathlib import Path
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
print(json.dumps([m.viewer_anchor(Path(sys.argv[2]), t) for t in json.loads(sys.argv[3])]))`
    const r = spawnSync('python3', ['-I', '-c', script, PRDT, proot, JSON.stringify(targets)], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    const keys: Array<string | null> = JSON.parse(r.stdout)
    const anchors = buildAnchors(pdata)
    keys.forEach((k, i) => {
      if (k === null) return
      expect(anchors, `${path.relative(proot, targets[i])} -> ${k}`).toHaveProperty([k])
    })
    expect(keys.filter((k) => k !== null).length).toBeGreaterThanOrEqual(8)
  })

  it('As-Is paths in a PRD body link to their To-Be anchors; To-Be paths link as themselves', () => {
    const t = buildDocPathTargets(pdata)
    expect(t.get('docs/alpha/tickets/v1.1/T-1.md')).toBe('T-1')
    const prdPane = phtml
    expect(prdPane).toContain('<a href="#T-1">docs/tickets/v1.1/T-1.md</a>')
    expect(prdPane).toContain('<a href="#docs/_shared/wiki/decision--a.md">docs/wiki/decision--a.md</a>')
    expect(prdPane).toContain('<a href="#docs/alpha/artifacts/v1.1/a.md">docs/artifacts/v1.1/a.md</a>')
  })

  it('a closed PRD relative link opens the product file, else the _shared one (③)', () => {
    const closedHtml = detail(phtml)
    const html = JSON.stringify(closedHtml) + phtml
    expect(html).toContain('docs/_shared/design.md')
    expect(html).toContain('docs/_shared/wiki/decision--a.md')
    expect(html).toContain('docs/alpha/prd/versions/x.md')
    expect(html).not.toContain('docs/alpha/design.md')
  })

  it('resolveDocLink with no layout (legacy) is unchanged', () => {
    expect(resolveDocLink('../design.md', 'docs/prd', '../..')).toBe('../../docs/design.md')
    expect(resolveDocLink('../design.md', 'docs/alpha/prd', '../..', undefined, pdata.docsLayout)).toBe('../../docs/_shared/design.md')
  })
})

describe('single-product output is unchanged in substance', () => {
  const norm = (h: string) =>
    h.replace(/docs\/(?:alpha|_shared)\//g, 'docs/').replace(/docs\/(?:alpha|_shared)\//g, 'docs/')
      .replace(/\.\.\/\.\.\/(?:_shared|alpha)\//g, '../../')

  it('the same project in both layouts renders the same page once To-Be segments are dropped', () => {
    // the sidebar rows and detail panes are the same documents, in the same order
    const strip = (h: string) => norm(h).replace(/viewer-pl-(?:legacy|product)-[A-Za-z0-9]+/g, 'ROOT')
    expect(detail(strip(phtml))).toEqual(detail(strip(lhtml)))
  })
})
