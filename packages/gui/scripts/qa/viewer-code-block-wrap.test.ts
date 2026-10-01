// T-830: a fenced code block wraps a line longer than the panel instead of
// clipping / scrolling — in the PRD/wiki cards (`.v-body`) AND in the ticket
// detail side panel (`.detail-doc`, where the T-828 screenshot case lives).
// Vitest cannot launch a browser (isolation rule 6), so this file renders the
// real page from a ticket fixture and checks the panel container the page
// actually emits; the measured render (420/1400 px, light/dark, real T-828)
// is `tests/viewer-code-block-wrap.window.spec.ts` (@window, VM).
import { describe, it, expect } from 'vitest'
import { TEMPLATE_CSS, renderPage } from '@productune/viewer/lib/render.mjs'

const LONG = 'x'.repeat(500)
const fixture = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [] },
  tickets: {
    included: [
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-901.md', frontmatter: { id: 'T-901' }, body: '## Evidence\n\n```\n' + LONG + '\n```\n' },
    ],
    omitted: [],
  },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
}

/** Selectors of every CSS rule whose declarations contain `decl`. */
function selectorsWith(css: string, decl: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[2].includes(decl)) out.push(...m[1].split(',').map((s) => s.trim()))
  return out
}

describe('viewer code block wrap (T-830)', () => {
  const html = renderPage({ data: fixture, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  const wrapped = selectorsWith(TEMPLATE_CSS, 'white-space: pre-wrap').filter((s) => s.endsWith(' pre'))

  it('the PRD/wiki card container wraps its code blocks', () => {
    expect(wrapped).toContain('.v-body pre')
    expect(selectorsWith(TEMPLATE_CSS, 'overflow-wrap: anywhere')).toContain('.v-body pre')
  })

  it('the ticket detail panel container (the one the page script fills) wraps its code blocks', () => {
    // the container class comes from the generated page, not from this test
    const m = html.match(/'<div class="(detail-doc)[^"]*">' \+ fields\.body/)
    expect(m, 'panel script still wraps fields.body in .detail-doc').not.toBeNull()
    expect(wrapped).toContain(`.${m![1]} pre`)
    expect(selectorsWith(TEMPLATE_CSS, 'overflow-wrap: anywhere')).toContain(`.${m![1]} pre`)
  })

  it('the ticket body reaches the panel data as a <pre> block holding the whole long line', () => {
    const json = html.match(/<script[^>]*id="detail-data"[^>]*>([\s\S]*?)<\/script>/)![1]
    const body = (JSON.parse(json).ticket['T-901'] as { body: string }).body
    expect(body).toContain('<pre')
    expect(body).toContain(LONG)
  })

  it('never introduces horizontal scroll on code blocks', () => {
    for (const l of TEMPLATE_CSS.split('\n')) if (/(^|\s)(\.v-body|\.detail-doc) pre[ ,{]/.test(l)) expect(l).not.toContain('overflow-x')
  })
})
