// T-998 (T-999 = C) — a decision ticket's `options` table renders as one card per option;
// the ticket md is untouched, non-decision tables stay tables.
import { describe, it, expect } from 'vitest'
import { renderPage, TEMPLATE_CSS } from '@productune/viewer/lib/render.mjs'

function renderTicketBody(body: string): string {
  const data = {
    poState: { stage: 'build', version: 'v1.13', current_task: null },
    currentVersion: 'v1.13',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [{ bucket: 'v1.13', rel: 'docs/tickets/v1.13/T-999.md', frontmatter: { id: 'T-999', slug: 'fixture' }, body }],
      omitted: [],
    },
    wiki: [],
    features: [],
    artifacts: { entries: [] },
  }
  const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as any)
  const m = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  return JSON.parse(m![1]).ticket['T-999'].body as string
}

const TABLE = `## options

| 선택지 | 결과 (To-be) | 예시 | pros | cons | recommend |
|---|---|---|---|---|---|
| A 유지 | 지금처럼 | \`a/b.md\` | 가볍다 | 섞인다 | |
| B 분리 | 새 폴더 | 화면 <b>x</b> | 깨끗하다 | 비싸다 | **권고** — 이유 한 줄 |
`

describe('T-998 — decision options as cards', () => {
  it('open decision: one card per option, example before 결과 · 장점 · 단점, 권고 chip only on the recommended', () => {
    const out = renderTicketBody(TABLE + '\n## outcome\n\n')
    expect(out).not.toContain('<table')
    expect(out.match(/<article class="opt-card/g)).toHaveLength(2)
    const card = out.split('<article')[2]
    expect(card.indexOf('opt-lab')).toBeLessThan(card.indexOf('<dt>결과'))
    expect(card.indexOf('<dt>결과')).toBeLessThan(card.indexOf('<dt class="p">장점'))
    expect(card.indexOf('<dt class="p">장점')).toBeLessThan(card.indexOf('<dt class="c">단점'))
    expect(card).toContain('opt-mk-rec')
    expect(card).toContain('이유 한 줄')
    expect(out.split('<article')[1]).not.toContain('opt-mk-rec')
    expect(out).not.toContain('<b>x</b>')
    expect(out).not.toContain('is-chosen')
  })

  it('answered decision: chosen card marked, the rest dimmed', () => {
    const out = renderTicketBody(TABLE + '\n## outcome\n\n- 션님 (2026-10-07, 원문): *"996 A"* — 유지.\n')
    const [, a, b] = out.split('<article')
    expect(a).toContain('is-chosen')
    expect(a).toContain('✓ 선택됨')
    expect(b).toContain('is-dim')
    expect(b).toContain('opt-mk-rec')
  })

  it('PO reading "= B" wins; no 예시 column → card starts with 결과', () => {
    const t = '| 선택지 | 결과 (To-be) | pros | cons | trade-off | recommend |\n|---|---|---|---|---|---|\n| A x | rx | p | c | t | |\n| B y | ry | p | c | | |\n'
    const out = renderTicketBody('## options\n\n' + t + '\n## outcome\n\n- 원안 = B 로.\n')
    expect(out).not.toContain('opt-lab')
    expect(out.split('<article')[2]).toContain('is-chosen')
    expect(out.split('<article')[1]).toContain('<dt>절충')
  })

  it('the normalized `- 선택:` line wins; lowercase and numbered options work', () => {
    const o = (c: string) => renderTicketBody(TABLE + '\n## outcome\n\n- 선택: ' + c + '\n- 원문 "A"\n')
    expect(o('b').split('<article')[2]).toContain('is-chosen')
    const n = '| 선택지 | 결과 |\n|---|---|\n| 1 가 | r1 |\n| 2 나 | r2 |\n'
    const out = renderTicketBody('## options\n\n' + n + '\n## outcome\n\n- 선택: 2\n')
    expect(out.split('<article')[2]).toContain('is-chosen')
    expect(out.split('<article')[1]).toContain('is-dim')
  })

  it('a non-decision table stays a table', () => {
    const out = renderTicketBody('| 이름 | 값 |\n|---|---|\n| a | 1 |\n')
    expect(out).toContain('<table')
    expect(out).not.toContain('opt-card')
  })

  it('no left accent stripe in the card CSS', () => {
    expect(TEMPLATE_CSS).toContain('.opt-card')
    expect(/\.opt-card[^{]*\{[^}]*border-left/.test(TEMPLATE_CSS)).toBe(false)
  })
})
