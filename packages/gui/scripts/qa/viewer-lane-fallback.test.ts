// T-1524: a failed lane read still draws one 기본 레인 row (statusline parity); the idle last-version card leaves out the 자투리 record.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as never)
function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string, status: string, extra = '') => `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\nassignee: developer\ncreated: 2026-01-01\n${extra}---\nbody ${id}\n`
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-lane-fb-')))

describe('T-1524 C1: lane read failure', () => {
  const root = tmp()
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'demo' }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v9.8', current_task: null }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\n## v9.8 — round\n\n#### a — Item A\n')
  write(root, 'docs/tickets/v9.8/T-1.md', ticket('T-1', 'done'))
  write(root, 'docs/tickets/v9.8/T-2.md', ticket('T-2', 'open'))
  write(root, 'docs/tickets/v9.8/T-3.md', ticket('T-3', 'open'))
  write(root, 'docs/tickets/v9.8/T-4.md', ticket('T-4', 'open', 'deps: [T-3]\nlane: 자투리\n'))
  const data = collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }) as Record<string, unknown>
  data.lanes = [] // what collectLanes returns when python3 / prdt_lanes fails
  const scope = /<div class="sc-e">[\s\S]*?<\/div><\/div><\/div>/.exec(render(data))![0]
  it('one 기본 레인 row over every ticket of the version, d/t without the 자투리 record', () => {
    const rows = [...scope.matchAll(/<span class="e-lab" title="([^"]*)">[\s\S]*?<span class="mono e-n">(\d+\/\d+)<\/span>/g)].map((m) => [m[1], m[2]])
    expect(rows).toEqual([['기본 레인', '1/3']])
    expect([...scope.matchAll(/data-detail-id="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(['T-1', 'T-2', 'T-3'])
  })
})

describe('T-1524 C2: idle last-version card count', () => {
  const root = tmp()
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v2.2', current_task: null, products: { 'ntf-archive': { stage: 'idle', version: 'v1.1' } } }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v2.2 — round\n\n#### a — Item A\n')
  write(root, 'docs/prd/versions/ntf-archive/v1.1.md', '## ntf-archive v1.1 — closed\n\nbody\n')
  write(root, 'docs/tickets/ntf-archive/v1.1/T-5.md', ticket('T-5', 'done'))
  write(root, 'docs/tickets/ntf-archive/v1.1/T-6.md', ticket('T-6', 'done'))
  write(root, 'docs/tickets/ntf-archive/v1.1/T-7.md', ticket('T-7', 'done', 'deps: [T-5]\nlane: 자투리\n'))
  const html = render(collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }))
  const card = html.slice(html.indexOf('data-last-version'), html.indexOf('data-last-version') + 6000)
  it('counts 2 of 2, not 3 of 3', () => {
    expect(card).toContain('2/2')
    expect(card).not.toContain('3/3')
  })
})
