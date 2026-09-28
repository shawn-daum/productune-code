// T-746: `viewer.html#<id>` opens the viewer with that item selected; an id
// it cannot show lands on home with the §8.4 notice. The click-through
// behavior itself was observed in headless Chromium (dispatch outcome); this
// file pins the generation-time half — the anchor table the page script
// routes by, the hidden notice markup, and generation for a project that has
// no code checkout of its own (a bare project root, output written outside
// this package).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { generate } from '../../viewer/generate.mjs'
import { buildAnchors, maxTicketNumber } from '../../viewer/lib/render.mjs'

const fixture = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { rel: 'docs/prd/PRD.md', body: '' }, closed: [{ rel: 'docs/prd/versions/v1.9.md', name: 'v1.9.md', body: '' }] },
  tickets: {
    included: [
      { bucket: 'v1.10.0', rel: 'docs/tickets/v1.10.0/T-901.md', frontmatter: { id: 'T-901' }, body: '' },
      { bucket: 'backlog', rel: 'docs/tickets/backlog/T-902.md', frontmatter: { id: 'T-902' }, body: '' },
    ],
    omitted: [{ bucket: 'v1.9', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.9/T-950.md', frontmatter: { id: 'T-950' } }] }],
  },
  wiki: [
    { rel: 'docs/wiki/decision--x.md', frontmatter: { type: 'decision' }, body: '' },
    { rel: 'docs/wiki/log.md', frontmatter: {}, body: '' },
  ],
  features: [{ rel: 'docs/features/viewer.md', frontmatter: {}, body: '' }],
  artifacts: { entries: [{ fields: { bucket: 'v1.10', path: 'notes.md' }, diskRel: 'docs/artifacts/v1.10/notes.md', inlined: true, body: '' }] },
}

describe('anchor table', () => {
  const a = buildAnchors(fixture)

  it('routes a ticket id to its own sidebar group — current bucket by its on-disk name, backlog, a closed round', () => {
    expect(a['T-901']).toEqual({ s: 'ticket', g: 'v1.10.0', k: 'ticket', i: 'T-901' })
    expect(a['T-902']).toEqual({ s: 'ticket', g: 'backlog', k: 'ticket', i: 'T-902' })
    expect(a['T-950']).toEqual({ s: 'ticket', g: 'v1.9', k: 'ticket', i: 'T-950' })
  })

  it('routes a wiki page by slug and by path, grouped by its type (untyped → UNCLASSIFIED)', () => {
    expect(a['decision--x']).toEqual({ s: 'wiki', g: 'decision', k: 'wiki', i: 'decision--x.md' })
    expect(a['docs/wiki/decision--x.md']).toEqual(a['decision--x'])
    expect(a['log'].g).toBe('UNCLASSIFIED')
  })

  it('routes PRD, a closed PRD round, a feature spec and an artifact .md by repo path', () => {
    expect(a['docs/prd/PRD.md']).toEqual({ s: 'prd', g: 'open' })
    expect(a['docs/prd/versions/v1.9.md']).toEqual({ s: 'prd', g: 'v1.9' })
    expect(a['docs/features/viewer.md']).toEqual({ s: 'feature', g: 'all', k: 'feature', i: 'viewer.md' })
    expect(a['docs/artifacts/v1.10/notes.md']).toEqual({ s: 'artifact', g: 'v1.10', k: 'artifact', i: 'v1.10/notes.md' })
  })

  it('max ticket number counts every listed ticket (the stale-vs-unknown line)', () => {
    expect(maxTicketNumber(fixture)).toBe(950)
  })
})

describe('generation for a project with no code checkout', () => {
  it('builds from a bare project root (no tickets dir, no PRD) into an output path outside the package', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-hash-proj-'))
    fs.mkdirSync(path.join(root, '.prdt'))
    fs.writeFileSync(path.join(root, '.prdt/po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
    fs.mkdirSync(path.join(root, 'docs/wiki'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs/wiki/fact--y.md'), '---\ntitle: y\ntype: fact\n---\nsee [PRD](../prd/PRD.md)\n')
    const outputPath = path.join(root, '.prdt/scratch/viewer/viewer.html')
    const { html } = await generate({ repoRoot: root, outputPath })
    const data = JSON.parse(html.match(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s)![1])
    expect(data.anchors['fact--y']).toEqual({ s: 'wiki', g: 'fact', k: 'wiki', i: 'fact--y.md' })
    // links are relative to where the page is WRITTEN, three levels under the root
    expect(data.wiki['fact--y.md'].body).toContain('href="../../../docs/prd/PRD.md"')
    // the §8.4 notice ships hidden, with no side stripe
    expect(html).toMatch(/<div class="notice" id="hash-notice" role="status" hidden>/)
    expect(html).not.toMatch(/\.notice\s*\{[^}]*border-left/)
  }, 30000)
})
