// T-912 F1/F3 — a cloned repo's symlinked docs paths must not make the viewer
// embed files outside the repo; the detail-panel file link is attribute-escaped.
// Fixtures are built in a temp dir with a FAKE .env.local (never a real secret).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generate } from '@productune/viewer/generate.mjs'
import { collectAll, collectPrd, collectWiki, collectFeatures, collectTickets, readPoState } from '@productune/viewer/lib/collect.mjs'

const SECRET = 'FAKE_SECRET_ENV_LOCAL_VALUE'
let tmp: string
let outside: string

function write(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function ticket(id: string, marker: string) {
  return `---\nid: ${id}\nslug: s-${id}\ntype: feature\nstatus: open\nassignee: po\n---\n${marker}\n`
}

function makeRepo(name: string) {
  const root = path.join(tmp, name)
  write(path.join(root, '.prdt/po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  return root
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't912-'))
  outside = path.join(tmp, 'outside')
  write(path.join(outside, '.env.local'), `SECRET=${SECRET}\n`)
  for (const d of ['wiki', 'tickets', 'versions', 'features']) {
    write(path.join(outside, d, 'x.md'), `MARKER_OUT_${d}\n`)
  }
  write(path.join(outside, 'tickets/v1.0/T-900.md'), ticket('T-900', 'MARKER_OUT_ticket'))
  write(path.join(outside, 'tickets/backlog/T-901.md'), ticket('T-901', 'MARKER_OUT_backlog'))
  write(path.join(outside, 'tickets/v0.9/T-902.md'), ticket('T-902', 'MARKER_OUT_past'))
  write(path.join(outside, 'po-state.json'), JSON.stringify({ version: 'v9.9', stage: 'MARKER_OUT_state' }))
  write(path.join(outside, 'config.json'), JSON.stringify({ slug: 'MARKER_OUT_slug' }))
})
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('collect: links resolving outside the repo are skipped', () => {
  let evilN = 0
  function evil() {
    const root = makeRepo('evil' + evilN++)
    fs.mkdirSync(path.join(root, 'docs/prd'), { recursive: true })
    fs.symlinkSync(path.join(outside, '.env.local'), path.join(root, 'docs/prd/PRD.md'))
    fs.symlinkSync(path.join(outside, 'wiki'), path.join(root, 'docs/wiki'))
    fs.symlinkSync(path.join(outside, 'tickets'), path.join(root, 'docs/tickets'))
    fs.symlinkSync(path.join(outside, 'versions'), path.join(root, 'docs/prd/versions'))
    fs.symlinkSync(path.join(outside, 'features'), path.join(root, 'docs/features'))
    return root
  }

  it('PRD.md file link', () => {
    const prd = collectPrd(evil(), 'v1.0')
    expect(prd.current.body).toBe('')
    expect(prd.closed).toEqual([])
  })
  it('wiki / features / tickets directory links', () => {
    const root = evil()
    expect(collectWiki(root)).toEqual([])
    expect(collectFeatures(root)).toEqual([])
    expect(collectTickets(root, 'v1.0')).toEqual({ included: [], omitted: [] })
  })
  it('a ticket bucket dir and a single ticket file linked outside are omitted', () => {
    const root = makeRepo('buckets')
    write(path.join(root, 'docs/tickets/v1.0/T-001.md'), ticket('T-001', 'IN_REPO'))
    fs.symlinkSync(path.join(outside, 'tickets/v1.0/T-900.md'), path.join(root, 'docs/tickets/v1.0/T-900.md'))
    fs.symlinkSync(path.join(outside, 'tickets/v0.9'), path.join(root, 'docs/tickets/v0.9'))
    const t = collectTickets(root, 'v1.0')
    expect(t.included.map((x: any) => x.frontmatter.id)).toEqual(['T-001'])
    expect(t.omitted).toEqual([])
  })
  it('po-state.json and config.json links', () => {
    const root = makeRepo('state')
    fs.rmSync(path.join(root, '.prdt/po-state.json'))
    fs.symlinkSync(path.join(outside, 'po-state.json'), path.join(root, '.prdt/po-state.json'))
    fs.symlinkSync(path.join(outside, 'config.json'), path.join(root, '.prdt/config.json'))
    expect(readPoState(root).version).toBe('')
    expect(collectAll(root, { disciplineRoot: path.join(tmp, 'nodisc') }).project).toBeNull()
  })
  it('a link resolving INSIDE the repo still works', () => {
    const root = makeRepo('inside')
    write(path.join(root, 'real-wiki/a.md'), '---\ntitle: A\n---\nINSIDE_WIKI\n')
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(path.join(root, 'real-wiki'), path.join(root, 'docs/wiki'))
    write(path.join(root, 'docs/features/f.md'), 'F\n')
    fs.symlinkSync(path.join(root, 'docs/features/f.md'), path.join(root, 'docs/features/g.md'))
    expect(collectWiki(root).map((d: any) => d.body.trim())).toEqual(['INSIDE_WIKI'])
    expect(collectFeatures(root).map((d: any) => d.rel)).toEqual(['docs/features/f.md', 'docs/features/g.md'])
  })
})

describe('generate: no outside value reaches viewer.html or any data file', () => {
  it('QA repro fixture', async () => {
    const root = makeRepo('repro')
    write(path.join(root, '.env.local'), `${SECRET}\n`)
    fs.mkdirSync(path.join(root, 'docs/prd'), { recursive: true })
    fs.symlinkSync(path.join(outside, '.env.local'), path.join(root, 'docs/prd/PRD.md'))
    for (const [link, target] of [['docs/wiki', 'wiki'], ['docs/tickets', 'tickets'], ['docs/prd/versions', 'versions'], ['docs/features', 'features']]) {
      fs.symlinkSync(path.join(outside, target), path.join(root, link))
    }
    const outputPath = path.join(tmp, 'out-repro/viewer.html')
    const { html, dataFiles, buildFile } = await generate({ repoRoot: root, outputPath, disciplineRoot: path.join(tmp, 'nodisc') })
    const all = [html, buildFile.content, ...dataFiles.map((f: any) => f.content)].join('\n')
    expect(all).not.toContain(SECRET)
    expect(all).not.toMatch(/MARKER_OUT_/)
  })

  it('F3: a repo dir named with a quote injects no element via the detail-panel file link', async () => {
    const root = path.join(tmp, 'q"><img src=x onerror=alert(1)>')
    write(path.join(root, '.prdt/po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
    write(path.join(root, 'docs/artifacts/manifest.json'), JSON.stringify({ entries: [{ bucket: 'v1.0', path: 'a.html', ticket: 'T-1', kind: 'mockup', status: 'draft', lang: 'ko', added_at: '2026-01-01' }] }))
    write(path.join(root, 'docs/artifacts/v1.0/a.html'), '<p>x</p>')
    const { html } = await generate({ repoRoot: root, outputPath: path.join(tmp, 'out-q/viewer.html'), disciplineRoot: path.join(tmp, 'nodisc') })
    // the client template must escape fileHref before it enters an attribute
    expect(html).toContain("escAttr(fields.fileHref)")
    expect(html).toContain("replace(/\"/g, '&quot;')")
    expect(html).not.toContain('<a href="\' +\n        fields.fileHref')
  })
})
