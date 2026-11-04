// T-1180 (mock docs/artifacts/v1.14/viewer-home-progress-clutter.html): the home scope rows — names never cut, grouped
// under their 합격선 lane (the one lane computation, prdt_lanes) — and the sidebar progress card opening the 진행 상황 tab.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll, collectLanes } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const page = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as never)

const VERSION = 'v9.8'
const GATE_A = 'docs/gates/a.md'
const GATE_B = 'docs/gates/b.md'

function ticket(dir: string, id: string, status: string, prdItem: string, extra = '', body = 'body') {
  fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\nassignee: developer\nprd_item: ${prdItem}\ncreated: 2026-01-01\n${extra}---\n\n${body}\n`)
}

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1180-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'demo' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: VERSION, current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'docs', 'prd', 'PRD.md'),
    `# PRD\n\n## ${VERSION} — round\n\n### 합격선\n\n| 항목 | 문언 |\n|:--|:--|\n| **합격선** | **레인 A · \`${GATE_A}\` 가 돈다** |\n| **합격선** | **레인 B · \`${GATE_B}\` 가 돈다** |\n\n### 항목\n\n` +
      `#### a1 — 첫째 항목의 아주 긴 이름도 끝까지 보인다 (T-1 · T-2)\n\n#### b1 — 05:20 데일리가 끝까지 돈다 (T-3)\n\n#### y1 — 합격선 밖 작은 일 (T-4 · T-5)\n\n#### z1 — 어느 레인에도 안 걸린 항목\n`,
  )
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  ticket(dir, 'T-1', 'done', `${VERSION}#a1`)
  ticket(dir, 'T-2', 'open', `${VERSION}#a1`, 'deps: [T-1]\n', `gate ${GATE_A}`)
  ticket(dir, 'T-3', 'open', `${VERSION}#b1`, '', `gate ${GATE_B}`)
  // T-1184: y1's tickets are in no gate lane — the 자투리 lane holds them; T-5 belongs to lane B (deps of T-3) but y1's majority is 자투리
  ticket(dir, 'T-4', 'open', `${VERSION}#y1`)
  ticket(dir, 'T-6', 'done', `${VERSION}#y1`)
  ticket(dir, 'T-5', 'open', `${VERSION}#y1`)
  fs.writeFileSync(path.join(dir, 'T-3.md'), fs.readFileSync(path.join(dir, 'T-3.md'), 'utf8').replace('prd_item:', 'deps: [T-5]\nprd_item:'))
  return root
}

describe('T-1415: scope block, one line per lane', () => {
  const root = project()
  const data = collectAll(root)
  const html = page(data)
  const scope = /<div class="sc-e">[\s\S]*?<\/div><\/div><\/div>/.exec(html)![0]
  const rows = [...scope.matchAll(/<div class="e-row"><span class="e-lab" title="([^"]*)">[^<]*<\/span><span class="e-sq">(.*?)<\/span><span class="mono e-n">(\d+\/\d+)<\/span><\/div>/g)].map((m) => ({ name: m[1], sq: [...m[2].matchAll(/data-detail-id="([^"]+)"/g)].map((x) => x[1]), n: m[3] }))

  it('collectLanes returns the prdt_lanes computation (no second copy)', () => {
    const lanes = collectLanes(root)
    expect(lanes.map((l) => [l.name, l.linked, l.tickets])).toEqual([['A', true, ['T-1', 'T-2']], ['B', true, ['T-3', 'T-5']], ['자투리', true, ['T-4', 'T-6']]])
  })

  it('one line per lane, in lane order, with the lane\'s own n/m (= prdt schedule lane numbers)', () => {
    const lanes = collectLanes(root)
    expect(rows.map((r) => r.name)).toEqual(lanes.map((l) => l.name))
    expect(rows.map((r) => r.n)).toEqual(lanes.map((l) => `${l.done}/${l.total}`))
    expect(rows.map((r) => r.n)).toEqual(['1/2', '0/2', '1/2'])
  })

  it('squares are the lane\'s tickets, done first; every square is a ticket button', () => {
    expect(rows.map((r) => r.sq)).toEqual([['T-1', 'T-2'], ['T-3', 'T-5'], ['T-6', 'T-4']])
    expect(scope).toMatch(/<span class="stage-sq sc-btn sq-done" data-detail-kind="ticket" data-detail-id="T-1" role="button" tabindex="0"/)
  })

  it('no item rows, no out-of-item row, no notes, no second number per line', () => {
    for (const gone of ['첫째 항목의 아주 긴 이름', 'PRD 항목 밖 티켓', '결정 ', '레인 숫자 =', '항목별 숫자', '레인에 묶이지 않은 항목', 'sc-grp', 'sc-why', 'sc-sep']) expect(scope).not.toContain(gone)
    expect([...scope.matchAll(/class="mono e-n"/g)]).toHaveLength(3)
  })

  it('only the lane line is loud: lane name bold primary; block title small and quiet; names never clipped', () => {
    const css = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(html)?.[1] ?? ''
    expect(css('.e-lab')).toMatch(/font-weight: 700/)
    expect(css('.e-lab')).toContain('color: var(--text-primary)')
    expect(css('.e-lab')).toContain('word-break: keep-all')
    expect(css('.e-lab')).not.toMatch(/nowrap|ellipsis|overflow: hidden/)
    expect(css('.sc-e .cp-h')).toContain('font-size: 11px')
    expect(css('.sc-e .cp-h')).toContain('var(--text-quaternary)')
  })

  it('390px: name and number on the first row, squares on a second row', () => {
    expect(html).toMatch(/@media \(max-width: 600px\) \{ \.e-row \{ grid-template-columns: minmax\(0, 1fr\) auto; \} \.e-row \.e-sq \{ grid-column: 1 \/ -1; grid-row: 2;/)
  })
})

describe('T-1180: sidebar progress card opens 진행 상황', () => {
  const html = page(collectAll(project()))
  it('the card is a keyboard-reachable button naming the progress group', () => {
    expect(html).toMatch(/<div class="sp" role="button" tabindex="0" data-card-open="progress"/)
    // the tab link it mirrors
    expect(html).toContain('data-group-select="progress"')
  })
  it('click and Enter / Space route to selectStore(home) + selectGroup', () => {
    expect(html).toContain("ev.target.closest('[data-card-open]')")
    expect(html).toContain("ev.target.matches('[data-card-open]')")
  })
})
