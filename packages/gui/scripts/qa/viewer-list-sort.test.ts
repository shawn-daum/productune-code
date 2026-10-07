// T-1006 — tickets and artifacts tables: newest first by default, click a header to sort.
// Row order is checked on the generated HTML; the click behaviour by running the page's own
// `sortTable` against a stubbed table.
import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const ticket = (id: string, created: string, slug = 's') => ({
  bucket: 'v1.13',
  rel: `docs/tickets/v1.13/${id}.md`,
  frontmatter: { id, slug, type: 'impl', status: 'open', assignee: 'developer', created },
  body: '',
})
const art = (p: string, added_at: string, ticket: string, bytes: number) => ({
  fields: { bucket: 'v1.13', path: p, kind: 'md', status: 'pending', ticket, lang: 'ko', added_at },
  bytes,
  diskRel: `docs/artifacts/v1.13/${p}`,
  inlined: false,
})
const data = {
  poState: { stage: 'build', version: 'v1.13', current_task: null },
  currentVersion: 'v1.13',
  prd: { current: { body: '' }, closed: [] },
  tickets: { included: [ticket('T-999', '2026-10-01'), ticket('T-1000', '2026-10-01'), ticket('T-5', '2026-10-07'), ticket('T-1001', '2026-09-30')], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [art('a.md', '2026-10-02', 'T-9', 100), art('b.md', '2026-10-05', 'T-10', 20), art('c.md', '2026-10-05', 'T-11', 3000)] },
}
const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as any)
const rowIds = (kind: string) => [...html.matchAll(new RegExp(`<tr class="detail-row" data-detail-kind="${kind}" data-detail-id="([^"]+)"`, 'g'))].map((m) => m[1])

describe('T-1006 default order', () => {
  it('tickets: 추가일 descending, ties by ticket number descending (T-1000 before T-999)', () => {
    const ids = rowIds('ticket')
    expect(ids.slice(0, 4)).toEqual(['T-5', 'T-1000', 'T-999', 'T-1001'])
  })
  it('artifacts: 추가일 descending, ties by ticket number descending', () => {
    expect(rowIds('artifact').slice(0, 3)).toEqual(['v1.13/c.md', 'v1.13/b.md', 'v1.13/a.md'])
  })
  it('tickets table has an 추가일 header marked descending; every header is a sort button', () => {
    expect(html).toMatch(/aria-sort="descending"><button[^>]*data-sort-col="5"[^>]*>추가일/)
    expect(html).toMatch(/aria-sort="descending"><button[^>]*data-sort-col="6"[^>]*>추가일/)
    expect((html.match(/class="sort-btn"/g) || []).length).toBeGreaterThanOrEqual(13)
  })
})

describe('T-1006 click sort', () => {
  const script = html.match(/<script>(\n\(function \(\) \{[\s\S]*?)<\/script>/)![1]
  const src = /function sortTable\(btn\) \{[\s\S]*?\n  \}\n/.exec(script)![0]
  const sortTable = vm.runInNewContext(`(${src.replace('function sortTable', 'function')})`, { Intl, Number, Array })

  function table(rows: Array<{ vals: string[]; tie: number }>, kind: string, col: number, sorted = 'none') {
    const body: any = { rows: rows.map((r) => ({ cells: r.vals.map((v) => ({ getAttribute: (k: string) => (k === 'data-sort' ? v : null), textContent: v })), getAttribute: (k: string) => (k === 'data-tie' ? String(r.tie) : null) })) }
    body.appendChild = (tr: any) => { body.rows.splice(body.rows.indexOf(tr), 1); body.rows.push(tr) }
    const th: any = { attr: sorted, getAttribute() { return this.attr }, setAttribute(_: string, v: string) { this.attr = v } }
    const table: any = { tBodies: [body], querySelectorAll: () => [th] }
    const btn: any = { closest: (s: string) => (s === 'table' ? table : th), getAttribute: (k: string) => (k === 'data-sort-col' ? String(col) : kind) }
    return { body, th, btn, order: () => body.rows.map((r: any) => r.cells[0].textContent) }
  }
  const R = [{ vals: ['T-999'], tie: 999 }, { vals: ['T-1000'], tie: 1000 }, { vals: ['T-5'], tie: 5 }]

  it('text column: ascending on first click with numeric-aware order, reversed on the second', () => {
    const t = table(R, 'text', 0)
    sortTable(t.btn)
    expect(t.order()).toEqual(['T-5', 'T-999', 'T-1000'])
    expect(t.th.attr).toBe('ascending')
    sortTable(t.btn)
    expect(t.order()).toEqual(['T-1000', 'T-999', 'T-5'])
    expect(t.th.attr).toBe('descending')
  })
  it('num column compares numbers, not text; ties fall to ticket number descending', () => {
    const t = table([{ vals: ['x', '100'], tie: 1 }, { vals: ['y', '20'], tie: 2 }, { vals: ['z', '20'], tie: 3 }], 'num', 1)
    sortTable(t.btn)
    expect(t.order()).toEqual(['z', 'y', 'x'])
  })
})
