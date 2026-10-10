// T-972: a path the viewer itself shows, written in a document body, becomes an
// in-viewer link (the hash route T-746 opened); a path it does not carry stays text.
import { describe, it, expect } from 'vitest'
import { renderPage, buildDocPathTargets, buildAnchors } from '@productune/viewer/lib/render.mjs'

const BODY = [
  'prose: docs/artifacts/v1.10/notes.md, then docs/wiki/decision--x.md.',
  '',
  'inline: `docs/artifacts/v1.9/old.md` and ticket docs/tickets/v1.9/T-950.md and docs/prd/versions/v1.9.md',
  '',
  'unknown: docs/artifacts/v1.10/missing.html · `docs/wiki/nope.md` · see [[decision--x]]',
  '',
  'a link: [the notes](docs/artifacts/v1.10/notes.md) and a spec docs/features/viewer.md',
  '',
  '```',
  'docs/artifacts/v1.10/notes.md',
  '```',
  '',
  'not a path start: xdocs/wiki/decision--x.md and ../docs/wiki/decision--x.md',
].join('\n')

const data: any = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [{ rel: 'docs/prd/versions/v1.9.md', name: 'v1.9.md', body: '' }] },
  tickets: {
    included: [
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-901.md', frontmatter: { id: 'T-901', slug: 's' }, body: BODY },
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-PATCH-003.md', frontmatter: { id: 'T-PATCH-003', slug: 'p' }, body: '' },
    ],
    omitted: [{ bucket: 'v1.9', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.9/T-950.md', frontmatter: { id: 'T-950' } }] }],
  },
  wiki: [{ rel: 'docs/wiki/decision--x.md', frontmatter: { type: 'decision' }, body: BODY }],
  features: [{ rel: 'docs/features/viewer.md', frontmatter: {}, body: '' }],
  artifacts: {
    entries: [
      { fields: { bucket: 'v1.10', path: 'notes.md' }, diskRel: 'docs/artifacts/v1.10/notes.md', inlined: true, body: '' },
      { fields: { bucket: 'v1.9', path: 'old.md' }, diskRel: 'docs/artifacts/v1.9/old.md', inlined: true, body: '' },
    ],
  },
}

const page = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const detail = JSON.parse(page.match(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s)![1])
const bodies: Record<string, string> = { ticket: detail.ticket['T-901'].body, wiki: detail.wiki['decision--x.md'].body }

describe.each(Object.entries(bodies))('%s body', (_k, html) => {
  it('links a carried path, in prose and in an inline code span, to its anchor key', () => {
    expect(html).toContain('<a href="#docs/artifacts/v1.10/notes.md">docs/artifacts/v1.10/notes.md</a>,')
    expect(html).toContain('<a href="#docs/wiki/decision--x.md">docs/wiki/decision--x.md</a>.')
    expect(html).toContain('<code><a href="#docs/artifacts/v1.9/old.md">docs/artifacts/v1.9/old.md</a></code>')
    expect(html).toContain('<a href="#docs/prd/versions/v1.9.md">')
    expect(html).toContain('<a href="#docs/features/viewer.md">')
  })
  it('a ticket file path links by ticket id', () => {
    expect(html).toContain('<a href="#T-950">docs/tickets/v1.9/T-950.md</a>')
  })
  it('a path the page does not carry stays text; a wikilink is untouched', () => {
    expect(html).toContain('docs/artifacts/v1.10/missing.html')
    expect(html).not.toContain('#docs/artifacts/v1.10/missing.html')
    expect(html).toContain('<code>docs/wiki/nope.md</code>')
    expect(html).toContain('[[decision--x]]')
  })
  it('no link inside a fenced block, none inside another link, none off a longer path', () => {
    expect(html).toMatch(/<pre><code>docs\/artifacts\/v1\.10\/notes\.md\n<\/code><\/pre>/)
    expect(html).not.toMatch(/<a [^>]*>[^<]*<a /)
    expect(html).toContain('xdocs/wiki/decision--x.md')
    expect(html).toContain('../docs/wiki/decision--x.md')
    expect(html).not.toContain('>../docs')
  })
  it('a markdown link keeps its containment rewrite (file href, new tab)', () => {
    expect(html).toMatch(/<a href="[^"#][^"]*notes\.md" target="_blank" rel="noopener">the notes<\/a>/)
  })
})

describe('buildDocPathTargets', () => {
  it('every target key resolves in the anchor table', () => {
    const anchors = buildAnchors(data)
    const t = buildDocPathTargets(data, anchors)
    expect(t.get('docs/tickets/v1.10.0/T-PATCH-003.md')).toBe('T-PATCH-003')
    for (const key of t.values()) expect(Object.prototype.hasOwnProperty.call(anchors, key)).toBe(true)
  })
})
