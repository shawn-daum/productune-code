// T-1256: an idle product's Home shows the last closed version's progress as at close — headed by its id and a
// "no next version is open" line; the backlog count line stays; no closed version keeps the old idle text;
// a product with an open version renders as before.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string, extra = '', status = 'done') => `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: ${status}\nassignee: developer\n${extra}---\nbody ${id}\n`

function mk(opts: { closed: boolean; stage?: string }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-idle-last-')))
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v2.2', current_task: null, products: { 'ntf-archive': { stage: opts.stage ?? 'idle', version: 'v1.1' } } }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v2.2 — round\n\n#### a — Item A\n')
  if (opts.closed) write(root, 'docs/prd/versions/ntf-archive/v1.1.md', '## ntf-archive v1.1 — closed\n\nbody\n')
  write(root, 'docs/tickets/ntf-archive/v1.1/T-5.md', ticket('T-5'))
  write(root, 'docs/tickets/ntf-archive/v1.1/T-7.md', ticket('T-7', 'deps: [T-5]\nlane: A\n'))
  write(root, 'docs/tickets/ntf-archive/v1.1/T-6.md', ticket('T-6', '', 'open'))
  write(root, 'docs/tickets/ntf-archive/backlog/T-8.md', ticket('T-8', '', 'open'))
  write(root, 'docs/tickets/ntf-archive/backlog/T-9.md', ticket('T-9', '', 'open'))
  return render(collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }))
}
const progress = (html: string) => {
  const i = html.indexOf('data-last-version')
  return i < 0 ? '' : html.slice(i, i + 6000)
}

describe('T-1256 idle Home shows the last closed version', () => {
  const html = mk({ closed: true })
  it('heads the block with the closed version id and says no next version is open', () => {
    expect(progress(html)).toContain('v1.1')
    expect(html).toContain('ntf-archive 는 지금 진행 중인 버전이 없어요.')
  })
  it('shows ticket counts as at close', () => {
    expect(progress(html)).toContain('티켓 완료 2/3')
  })
  it('shows each lane with its gate result', () => {
    const p = progress(html)
    expect(p).toContain('레인 A')
    expect(p).toContain('2/2')
    expect(p).toContain('게이트 통과')
  })
  it('keeps the backlog count line', () => {
    expect(html).toContain('backlog 티켓 2건이 대기 중이에요.')
  })
})

describe('T-1256 unchanged cases', () => {
  it('no closed version keeps today\'s idle text and no last-version block', () => {
    const html = mk({ closed: false })
    expect(html).toContain('ntf-archive 는 지금 진행 중인 버전이 없어요.')
    expect(html).toContain('backlog 티켓 2건이 대기 중이에요. 새 버전을 시작하면 이 화면에 진행 상황이 보여요.')
    expect(html).not.toContain('data-last-version')
  })
  it('a product with an open version has no last-version block', () => {
    const html = mk({ closed: true, stage: 'build' })
    expect(html).not.toContain('data-last-version')
  })
})
