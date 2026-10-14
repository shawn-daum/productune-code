// T-1108: a product with no open version / PRD section renders the approved idle copy
// (docs/artifacts/v1.14/define-screen-set.html #screen-home-products · #screen-side-products),
// on Home and in the PRD store; a product with an open version renders as before.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect, beforeAll } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string) => `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: open\nassignee: developer\n---\nbody ${id}\n`

let html = ''
beforeAll(() => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-idle-')))
  // `products` key; ntf-archive has no version in po-state (idle), one closed round, two backlog tickets.
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v2.2', current_task: null, products: { 'ntf-archive': { stage: 'idle' } } }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v2.2 — round\n\n#### a — Item A\n')
  write(root, 'docs/prd/versions/ntf-archive/v1.1.md', '## ntf-archive v1.1 — closed\n\nbody\n')
  write(root, 'docs/tickets/v2.2/T-1.md', ticket('T-1'))
  write(root, 'docs/tickets/ntf-archive/backlog/T-8.md', ticket('T-8'))
  write(root, 'docs/tickets/ntf-archive/backlog/T-9.md', ticket('T-9'))
  html = render(collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }))
})

describe('T-1108 idle product copy', () => {
  it('Home names the product, the backlog count and the next step', () => {
    expect(html).toContain('ntf-archive 는 지금 진행 중인 버전이 없어요.')
    expect(html).toContain('backlog 티켓 2건이 대기 중이에요. 새 버전을 시작하면 이 화면에 진행 상황이 보여요.')
  })
  it('the PRD store names the last closed version and the sidebar row reads 진행 중인 섹션 없음', () => {
    expect(html).toContain('ntf-archive 는 진행 중인 PRD 섹션이 없어요.')
    expect(html).toContain('완료한 v1.1 은 왼쪽 목록에서 볼 수 있어요. 새 버전을 시작하면 진행 중인 섹션이 생겨요.')
    expect(html).toContain('진행 중인 섹션 없음')
  })
  it('the product with an open version keeps the open-section label', () => {
    expect(html).toContain('열린 섹션 · v2.2')
  })
  it('old copy never shows for the idle product', () => {
    expect(html).not.toContain('열린 섹션 · </')
  })
})

// T-1108 (QA grill fail): idle = po-state stage 'idle'; prdt keeps `version` after close.
describe('T-1108 idle keyed on stage, version retained — one po-state, three surfaces', () => {
  const mk = (state: Record<string, unknown>, products: unknown[] = [{ name: 'ntf-archive' }]) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-idle2-')))
    write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', products }))
    write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, current_task: null, ...state }))
    write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v2.2 — round\n\n#### a — Item A\n')
    write(root, 'docs/prd/versions/ntf-archive/v1.1.md', '## ntf-archive v1.1 — closed\n\nbody\n')
    write(root, 'docs/tickets/ntf-archive/v1.1/T-7.md', ticket('T-7'))
    write(root, 'docs/tickets/ntf-archive/backlog/T-8.md', ticket('T-8'))
    return root
  }
  const page = (root: string) => render(collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }))
  const statusline = (root: string) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-home-'))
    try {
      return execFileSync('bash', [path.resolve(__dirname, '../../../core/scripts/statusline-prdt.sh')], {
        input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
        env: { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en' },
      })
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  }

  it('stage idle + version v1.1: Home, PRD sidebar and statusline all read idle', () => {
    const root = mk({ stage: 'build', version: 'v2.2', products: { 'ntf-archive': { stage: 'idle', version: 'v1.1' } } })
    const h = page(root)
    expect(h).toContain('ntf-archive 는 지금 진행 중인 버전이 없어요.')
    expect(h).toContain('진행 중인 섹션 없음')
    expect(h).not.toContain('열린 섹션 · v1.1')
    expect(h).not.toContain('v1.1 · 현재')
    expect(statusline(root)).toContain('ntf-archive v1.1 | stage: idle')
  })

  it('ticket store of the idle product: backlog AND the closed v1.1 bucket, no 현재 label, its past body opens', () => {
    const h = page(mk({ stage: 'build', version: 'v2.2', products: { 'ntf-archive': { stage: 'idle', version: 'v1.1' } } }))
    expect(h).not.toContain('v1.1 · 현재')
    expect(h).toContain('ntf-archive/backlog')
    expect(h).toContain('ntf-archive/v1.1')
    expect(h).toContain('"path":"docs/tickets/ntf-archive/v1.1/T-7.md","body":"\\u003cp>body')
  })

  it('the first product idle at a closed version shows idle, not 열린 섹션', () => {
    const root = mk({ stage: 'idle', version: 'v2.1', products: { 'ntf-archive': { stage: 'build', version: 'v1.2' } } })
    const h = page(root)
    expect(h).not.toContain('열린 섹션 · v2.1')
    expect(h).toContain('열린 섹션 · v1.2')
    expect(h).toContain('ntf-pm 는 지금 진행 중인 버전이 없어요.')
  })

  it('idle product Home still lists the closed version decisions', () => {
    const root = mk({ stage: 'build', version: 'v2.2', products: { 'ntf-archive': { stage: 'idle', version: 'v1.1' } } })
    write(root, 'docs/wiki/decision--keep-me.md', '---\ntype: decision\nversion: ntf-archive/v1.1\ntitle: keep me\n---\nd\n')
    expect(page(root)).toContain('decision--keep-me.md')
  })

  it('idle first product in a multi-product project keeps every past bucket and opens a past body', () => {
    const root = mk({ stage: 'idle', version: 'v2.1', products: { 'ntf-archive': { stage: 'build', version: 'v1.2' } } })
    write(root, 'docs/tickets/v2.1/T-103.md', ticket('T-103'))
    write(root, 'docs/tickets/v2.0/T-90.md', ticket('T-90'))
    write(root, 'docs/tickets/backlog/T-50.md', ticket('T-50'))
    const h = page(root)
    expect(h).not.toContain('v2.1 · 현재')
    for (const b of ['v2.1', 'v2.0', 'backlog']) expect(h).toContain(`data-group="${b}"`)
    expect(h).toContain('"path":"docs/tickets/v2.1/T-103.md","body":"\\u003cp>body')
    expect(h).toContain('data-detail-id="T-90"')
  })
})
