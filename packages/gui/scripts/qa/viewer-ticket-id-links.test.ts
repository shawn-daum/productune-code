// T-1066: a ticket id written in a body becomes an in-viewer link to that ticket
// (the same `#<id>` hash route T-972's doc-path links use); an id the page does
// not carry, or one inside code, stays text.
import { describe, it, expect } from 'vitest'
import { renderPage, pastTicketDataFiles, buildDocPathTargets, buildAnchors } from '@productune/viewer/lib/render.mjs'

const BODY = [
  '## related',
  'T-950 · T-PATCH-003 · T-P4-012 · T-999',
  '',
  'prose (see T-950), path docs/tickets/v1.9/T-950.md, near-misses AT-950 T-9501 T-950x',
  '',
  'code: `T-950` and a link [about T-950](docs/artifacts/v1.10/notes.md)',
  '',
  '```',
  'T-950',
  '```',
].join('\n')

const data: any = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [] },
  tickets: {
    included: [
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-901.md', frontmatter: { id: 'T-901', slug: 's' }, body: BODY },
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-PATCH-003.md', frontmatter: { id: 'T-PATCH-003', slug: 'p' }, body: '' },
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-P4-012.md', frontmatter: { id: 'T-P4-012', slug: 'q' }, body: '' },
    ],
    omitted: [{ bucket: 'v1.9', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.9/T-950.md', frontmatter: { id: 'T-950' } }], bodies: { 'docs/tickets/v1.9/T-950.md': 'back to T-901' } }],
  },
  wiki: [],
  features: [],
  artifacts: { entries: [{ fields: { bucket: 'v1.10', path: 'notes.md' }, diskRel: 'docs/artifacts/v1.10/notes.md', inlined: true, body: '' }] },
}

const page = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const detail = JSON.parse(page.match(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s)![1])
const html: string = detail.ticket['T-901'].body

describe('ticket body ticket ids', () => {
  it('links every known id shape in the related row', () => {
    expect(html).toContain('<a href="#T-950">T-950</a> · <a href="#T-PATCH-003">T-PATCH-003</a> · <a href="#T-P4-012">T-P4-012</a> · T-999')
  })
  it('an unknown id stays text', () => {
    expect(html).not.toContain('#T-999')
  })
  it('links an id in prose; a ticket path stays one link; near-misses stay text', () => {
    expect(html).toContain('(see <a href="#T-950">T-950</a>)')
    expect(html).toContain('<a href="#T-950">docs/tickets/v1.9/T-950.md</a>')
    expect(html).toContain('AT-950 T-9501 T-950x')
  })
  it('no link inside a code span, a fenced block, or another link', () => {
    expect(html).toContain('<code>T-950</code>')
    expect(html).toMatch(/<pre><code>T-950\n<\/code><\/pre>/)
    expect(html).toMatch(/>about T-950<\/a>/)
    expect(html).not.toMatch(/<a [^>]*>[^<]*<a /)
  })
  it('a past-version body links ids too', () => {
    const files = pastTicketDataFiles(data.tickets, { docTargets: buildDocPathTargets(data, buildAnchors(data)) })
    expect(files[0].tickets['T-950'].body).toContain('back to <a href="#T-901">T-901</a>')
  })
})
