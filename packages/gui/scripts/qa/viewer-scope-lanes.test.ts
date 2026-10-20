// T-1180 (mock docs/artifacts/v1.14/viewer-home-progress-clutter.html): the home scope rows — names never cut, grouped
// under their 합격선 lane (the one lane computation, prdt_lanes) — and the sidebar progress card opening the 진행 상황 tab.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll, collectLanes } from '@productune/viewer/lib/collect.mjs'
import { renderPage, scopeItemName } from '@productune/viewer/lib/render.mjs'

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

describe('T-1180: scope item names', () => {
  it('strips trailing (T-…) refs, keeps a clock time whole, splits on a real colon', () => {
    expect(scopeItemName('버전 문장 문체 (T-749)')).toBe('버전 문장 문체')
    expect(scopeItemName('이름 (T-67 · T-57) (T-704)')).toBe('이름')
    expect(scopeItemName('05:20 데일리가 끝까지 돈다 (T-67)')).toBe('05:20 데일리가 끝까지 돈다')
    expect(scopeItemName('항목: 설명이 길게 이어진다')).toBe('항목')
  })
})

describe('T-1180: scope rows by lane + one-line explainer', () => {
  const root = project()
  const data = collectAll(root)
  const html = page(data)
  const scope = html.slice(html.indexOf('class="cp-h">스코프'))

  it('collectLanes returns the prdt_lanes computation (no second copy)', () => {
    const lanes = collectLanes(root)
    expect(lanes.map((l) => [l.name, l.linked, l.tickets])).toEqual([['A', true, ['T-1', 'T-2']], ['B', true, ['T-3', 'T-5']], ['자투리', true, ['T-4', 'T-6']]])
  })

  it('T-1184: 자투리 counts as a lane when placing an item (the lane holding most of its tickets)', () => {
    const iB = scope.indexOf('레인 B')
    const iJ = scope.indexOf('레인 자투리')
    const iNo = scope.indexOf('레인에 묶이지 않은 항목')
    expect(iJ).toBeGreaterThan(iB)
    expect(iNo).toBeGreaterThan(iJ)
    const iY = scope.indexOf('합격선 밖 작은 일')
    expect(iY).toBeGreaterThan(iJ)
    expect(iY).toBeLessThan(iNo)
    expect(scope.slice(iJ, iJ + 200)).toMatch(/1\/2/)
  })

  it('T-1184: the page states how lane head numbers relate to the item rows', () => {
    expect(scope).toContain('레인 숫자 = 그 레인 티켓 전체 · 항목 숫자 = 그 항목 티켓 · 항목은 티켓이 가장 많은 레인 아래')
    const flat = page({ ...data, lanes: [] })
    expect(flat).not.toContain('레인 숫자 =')
  })

  it('T-1184: Korean names wrap at word gaps only (.sc-lab word-break: keep-all)', () => {
    expect(/\.sc-lab \{[^}]*\}/.exec(html)![0]).toContain('word-break: keep-all')
  })

  it('groups each item under its lane head; unreached items under the last head', () => {
    const iA = scope.indexOf('레인 A')
    const iB = scope.indexOf('레인 B')
    const iNo = scope.indexOf('레인에 묶이지 않은 항목')
    expect(iA).toBeGreaterThan(-1)
    expect(iB).toBeGreaterThan(iA)
    expect(iNo).toBeGreaterThan(iB)
    expect(scope.indexOf('첫째 항목의 아주 긴 이름도 끝까지 보인다')).toBeGreaterThan(iA)
    expect(scope.indexOf('첫째 항목의 아주 긴 이름도 끝까지 보인다')).toBeLessThan(iB)
    expect(scope.indexOf('05:20 데일리가 끝까지 돈다')).toBeGreaterThan(iB)
    expect(scope.indexOf('어느 레인에도 안 걸린 항목')).toBeGreaterThan(iNo)
    expect(scope).not.toContain('(T-1 · T-2)</span>')
  })

  it('names are never clipped (no nowrap / ellipsis on the name cell)', () => {
    const css = /\.sc-lab \{[^}]*\}/.exec(html)![0]
    expect(css).not.toMatch(/nowrap|ellipsis|overflow: hidden/)
    expect(/\.sc-rows \{[^}]*\}/.exec(html)![0]).toContain('fit-content(calc(100% - 140px))')
  })

  it('without lanes the rows stay flat', () => {
    const flat = page({ ...data, lanes: [] })
    expect(flat).not.toContain('class="sc-grp"')
    expect(flat).toContain('첫째 항목의 아주 긴 이름도 끝까지 보인다')
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
