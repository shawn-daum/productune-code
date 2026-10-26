// T-1253 (deployed-record-spec D4; approved screens docs/productune/artifacts/v1.15/define-screen-set.html
// #screen-viewer-head — differ · norec · multi): the 진행 상황 card's header shows the deployed record read from
// each product's DEPLOY.md frontmatter `deployed: {version, at, ref}`. Read only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const write = (root: string, rel: string, text: string) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const T = (id: string) => `---\nid: ${id}\nslug: s\ntype: impl\nstatus: open\nassignee: developer\nprd_item: v1.15#a\n---\nb\n`
const PRD = '# PRD\n\n## v1.15 — round\n\n#### a — Item A\n\ntext\n'
const gather = (root: string) => collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') })
const deploy = (flow: string | null) => `---\n${flow === null ? '' : `deployed: ${flow}\n`}title: deploy\n---\nbody\n`
// the progress card's own markup, so a match elsewhere on the page (e.g. the sidebar) cannot pass for it
const card = (html: string, name?: string) => {
  const heads = [...html.matchAll(/<div class="vh">.*?<\/div>(?:<p class="vh-hint">.*?<\/p>)?/gs)].map((m) => m[0])
  return name ? heads.find((h) => h.includes(`<span class="vh-n">${name}</span>`)) ?? '' : heads[0] ?? ''
}

function single(deployFlow: string | null | undefined): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-dr-')))
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'alpha' }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'define', version: 'v1.15', current_task: null }))
  write(root, 'docs/prd/PRD.md', PRD)
  write(root, 'docs/tickets/v1.15/T-1.md', T('T-1'))
  if (deployFlow !== undefined) write(root, 'docs/DEPLOY.md', deploy(deployFlow))
  return root
}

describe('viewer-head:differ — a record: deployed · dev · date · ref', () => {
  const html = render(gather(single('{version: v1.14, at: 2026-10-23, ref: v1.14}')))
  const head = card(html)
  it('names the product, 배포 v1.14, 개발 v1.15 and the small 배포 date · ref line', () => {
    expect(head).toContain('<span class="vh-n">alpha</span>')
    expect(head).toContain('<span class="vh-k">배포</span> <b class="vh-v">v1.14</b>')
    expect(head).toContain('<span class="vh-k">개발</span> <b class="vh-v">v1.15</b>')
    expect(head).toContain('<span class="vh-m">배포 2026-10-23 · ref v1.14</span>')
  })
  it('no no-record hint, no product table on a single product', () => {
    expect(head).not.toContain('vh-hint')
    expect(html).not.toContain('class="vh-table"')
  })
  it('deployed = dev still shows both (same version)', () => {
    const same = card(render(gather(single('{version: v1.15, at: 2026-11-02, ref: v1.15}'))))
    expect(same).toContain('<b class="vh-v">v1.15</b>')
    expect((same.match(/class="vh-v"/g) || []).length).toBe(2)
  })
})

describe('viewer-head:norec — no record: 기록 없음 + one hint line', () => {
  const expectNoRecord = (flow: string | null | undefined) => {
    const head = card(render(gather(single(flow))))
    expect(head).toContain('<span class="vh-k">배포</span> <span class="vh-none">기록 없음</span>')
    expect(head).toContain('<span class="vh-k">개발</span> <b class="vh-v">v1.15</b>')
    expect(head).toContain('<p class="vh-hint">배포된 버전은 이 제품의 DEPLOY.md 에 한 번 적히면 여기 보여요.</p>')
    expect(head).not.toContain('vh-m')
  }
  it('no DEPLOY.md', () => expectNoRecord(undefined))
  it('DEPLOY.md without a deployed key', () => expectNoRecord(null))
  it('a malformed record (no version) reads as no record, never throws', () => {
    expectNoRecord('{at: 2026-10-23}')
    expectNoRecord('{version: , at: 2026-10-23, ref: x}')
  })
})

describe('the record shapes the ntf-pm products already write', () => {
  it('reads `{version: v1.2.2, at: 2026-09-07, ref: 921da1d}`', () => {
    const head = card(render(gather(single('{version: v1.2.2, at: 2026-09-07, ref: 921da1d}'))))
    expect(head).toContain('<b class="vh-v">v1.2.2</b>')
    expect(head).toContain('배포 2026-09-07 · ref 921da1d')
  })
})

describe('viewer-head:multi — two products: the selected header + a 제품 줄 table with 배포 · 개발 columns', () => {
  function multi(): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-dr-m-')))
    write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] }))
    write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v2.2', current_task: null, products: { 'ntf-archive': { stage: 'idle', version: '' } } }))
    write(root, 'docs/_shared/tickets/backlog/.keep', '')
    write(root, 'docs/ntf-pm/prd/PRD.md', PRD.replace('v1.15', 'v2.2'))
    write(root, 'docs/ntf-pm/tickets/v2.2/T-1.md', T('T-1').replace('v1.15', 'v2.2'))
    write(root, 'docs/ntf-pm/DEPLOY.md', deploy('{version: v2.1, at: 2026-10-01, ref: v2.1}'))
    write(root, 'docs/ntf-archive/prd/PRD.md', '# PRD\n')
    write(root, 'docs/ntf-archive/DEPLOY.md', deploy('{version: v1.1, at: 2026-10-21, ref: 5ec4dcc}'))
    return root
  }
  const html = render(gather(multi()))
  it('the open product header reads its own DEPLOY.md', () => {
    const pm = card(html, 'ntf-pm')
    expect(pm).toContain('<b class="vh-v">v2.1</b>')
    expect(pm).toContain('<b class="vh-v">v2.2</b>')
    expect(pm).toContain('배포 2026-10-01 · ref v2.1')
    // an idle product's progress pane stays its idle notice (T-1108) — its record shows in the table
    expect(card(html, 'ntf-archive')).toBe('')
  })
  it('the table lists both products: deployed, dev, and 「열린 버전 없음」 for the product with no open version', () => {
    const rows = [...html.matchAll(/<table class="vh-table">.*?<\/table>/gs)][0][0]
    expect(rows).toContain('<th>제품</th><th>배포</th><th>개발</th><th>단계</th>')
    expect(rows).toMatch(/<tr class="sel"><td class="ln">ntf-pm<\/td><td class="ver">v2\.1<\/td><td class="ver">v2\.2<\/td>/)
    expect(rows).toMatch(/<tr class=""><td class="ln">ntf-archive<\/td><td class="ver">v1\.1<\/td><td class="ver vh-nocell">열린 버전 없음<\/td>/)
  })
})
