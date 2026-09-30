// T-861 — a single `~` is range notation (`Phase 1~3(v0.1~v0.4)`), never
// strikethrough; only `~~text~~` strikes. marked's GFM default accepts
// single-tilde pairs, so render.mjs narrows the `del` tokenizer.
import { describe, it, expect } from 'vitest'
import { renderPage } from '../../viewer/lib/render.mjs'

function renderTicketBody(body: string): string {
  const data = {
    poState: { stage: 'build', version: 'v1.12', current_task: null },
    currentVersion: 'v1.12',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [{ bucket: 'v1.12', rel: 'docs/tickets/v1.12/T-999.md', frontmatter: { id: 'T-999', slug: 'fixture' }, body }],
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

describe('T-861 — single tilde never strikes', () => {
  it('range text stays literal', () => {
    const out = renderTicketBody('Phase 1~3(v0.1~v0.4, x)은 · a ~b~ c')
    expect(out).not.toContain('<del')
    expect(out).toContain('Phase 1~3(v0.1~v0.4, x)')
    expect(out).toContain('a ~b~ c')
  })

  it('double tilde still strikes', () => {
    const out = renderTicketBody('a ~~gone~~ b')
    expect(out).toContain('<del>gone</del>')
  })

  it('double tilde around a range strikes the whole range, tildes inside kept', () => {
    const out = renderTicketBody('~~v0.1~v0.4~~')
    expect(out).toContain('<del>v0.1~v0.4</del>')
  })
})
