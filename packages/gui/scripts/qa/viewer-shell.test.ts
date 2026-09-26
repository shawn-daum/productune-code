// T-666 slice 1a acceptance lines 3-4:
// "section headings render as chips by one shared rule across every
// document kind" · "a test asserts that every ticket row resolves to a
// detail entry" (the shell's list → detail proof, ticket store).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { OUTPUT_PATH } from '../../viewer/generate.mjs'
import { renderPage } from '../../viewer/lib/render.mjs'

const fixtureData = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [] },
  tickets: {
    included: [
      {
        bucket: 'v1.10',
        rel: 'docs/tickets/v1.10/T-901.md',
        frontmatter: { id: 'T-901', slug: 'fixture-one', type: 'impl', status: 'open', assignee: 'developer' },
        body: '# Title one\n\n## Section two\n\n### Sub three\n\n#### Deep four\n\nprose.',
      },
      {
        bucket: 'backlog',
        rel: 'docs/tickets/backlog/T-902.md',
        frontmatter: { id: 'T-902', slug: 'fixture-two', type: 'design', status: 'done', assignee: 'designer' },
        body: '## Only heading\n\nmore prose.',
      },
    ],
    omitted: [],
  },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
}

function render() {
  return renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
}

function detailBody(html, id) {
  const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  expect(blobMatch).not.toBeNull()
  return JSON.parse(blobMatch[1]).ticket[id].body
}

describe('viewer/lib/render.mjs — heading chip rule (T-666)', () => {
  it('h1/h2/h3 get pill-heading-1/2/3, and h4 collapses to pill-heading-3 — same renderer for every document kind', () => {
    const body = detailBody(render(), 'T-901')
    expect(body).toContain('<h1 class="pill pill-heading-1">Title one</h1>')
    expect(body).toContain('<h2 class="pill pill-heading-2">Section two</h2>')
    expect(body).toContain('<h3 class="pill pill-heading-3">Sub three</h3>')
    expect(body).toContain('<h4 class="pill pill-heading-3">Deep four</h4>')
  })

  it('applies to a second, independently-rendered ticket body too — one shared rule, not a per-document special case', () => {
    const body = detailBody(render(), 'T-902')
    expect(body).toContain('<h2 class="pill pill-heading-2">Only heading</h2>')
  })
})

describe('viewer/lib/render.mjs — every ticket row resolves to a detail entry (T-666)', () => {
  it('every data-detail-id the ticket table renders has a matching entry in the embedded detail-data JSON', () => {
    const html = render()
    const rowIds = [...html.matchAll(/data-detail-kind="ticket" data-detail-id="([^"]+)"/g)].map((m) => m[1])
    expect(rowIds.length).toBeGreaterThan(0) // non-vacuous — the fixture has rows
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(blobMatch).not.toBeNull()
    const detailData = JSON.parse(blobMatch[1])
    for (const id of rowIds) {
      expect(detailData.ticket[id], `detail-data.ticket is missing an entry for row "${id}"`).toBeDefined()
      expect(detailData.ticket[id].body, `detail-data.ticket["${id}"] has no body — the reader would still have to open the file`).toBeTruthy()
    }
  })

  // Non-vacuous control: a row pointing at a kind/id the blob does not carry
  // must actually be catchable by the assertion shape above, or the loop
  // could be passing for the wrong reason (e.g. iterating zero rows).
  it('checker fixture: a row id absent from the blob is caught', () => {
    const rowIds = ['T-DOES-NOT-EXIST']
    const detailData = { ticket: {} }
    expect(() => {
      for (const id of rowIds) {
        if (!detailData.ticket[id]) throw new Error(`missing detail entry for "${id}"`)
      }
    }).toThrow()
  })

  it('holds for the real generated viewer.html, not only the fixture', () => {
    expect(fs.existsSync(OUTPUT_PATH), `${OUTPUT_PATH} does not exist — run \`pnpm --filter @productune/gui viewer\` first`).toBe(true)
    const html = fs.readFileSync(OUTPUT_PATH, 'utf8')
    const rowIds = [...html.matchAll(/data-detail-kind="ticket" data-detail-id="([^"]+)"/g)].map((m) => m[1])
    expect(rowIds.length).toBeGreaterThan(0)
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(blobMatch).not.toBeNull()
    const detailData = JSON.parse(blobMatch[1])
    for (const id of rowIds) {
      expect(detailData.ticket[id]).toBeDefined()
    }
  })
})
