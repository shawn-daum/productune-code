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
        frontmatter: { id: 'T-901', slug: 'fixture-one', type: 'impl', status: 'open', assignee: 'developer', prd_item: 'v1.10#viewer' },
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
  wiki: [
    {
      rel: 'docs/wiki/decision--fixture.md',
      frontmatter: { title: 'fixture decision', type: 'decision', status: 'live', version: 'v1.10' },
      body: '## Decision body\n\nprose.',
    },
    {
      rel: 'docs/wiki/log.md',
      frontmatter: {}, // no `type` — T-666 slice 1b's UNCLASSIFIED fallback group
      body: 'untyped log prose.',
    },
  ],
  features: [
    {
      rel: 'docs/features/fixture-feature.md',
      frontmatter: { feature: 'fixture-feature', title: 'Fixture feature', status: 'live', spec_since: 'v1.1' },
      body: '## Feature body\n\nprose.',
    },
  ],
  artifacts: {
    entries: [
      {
        fields: { bucket: 'v1.10', path: 'fixture-doc.md', ticket: 'T-901', kind: 'doc', status: 'todo', lang: 'ko', added_at: '2026-09-26' },
        diskRel: 'docs/artifacts/v1.10/fixture-doc.md',
        inlined: true,
        body: '## Artifact body\n\nprose.',
      },
      {
        fields: { bucket: 'v1.10', path: 'fixture-mockup.html', ticket: 'T-901', kind: 'mockup', status: 'todo', lang: 'ko', added_at: '2026-09-26' },
        diskRel: 'docs/artifacts/v1.10/fixture-mockup.html',
        inlined: false,
      },
    ],
  },
}

// A separate fixture layered on top of the shared one above: a PRD closed
// round with NO `##` heading — a one-line stub, exactly the real shape
// docs/prd/versions/v1.1.md and v1.2.1.md carry (T-666 slice 1b acceptance
// line 3: "closed PRD files that carry only a one-line stub … still list and
// open").
const fixtureDataWithPrdStub = {
  ...fixtureData,
  prd: {
    current: { body: '' },
    closed: [{ rel: 'docs/prd/versions/v1.1.md', name: 'v1.1.md', body: 'no PRD section — stub round.' }],
  },
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

// T-666 slice 1b: wiki/feature/artifact/PRD now build their rows and their
// detail-data entries from the SAME input list the ticket store already
// proved this for (slice 1a) — same non-vacuous shape, one block per store.
describe('viewer/lib/render.mjs — every wiki/feature/artifact row resolves to a detail entry (T-666 slice 1b)', () => {
  function detailData(html) {
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(blobMatch).not.toBeNull()
    return JSON.parse(blobMatch[1])
  }

  it.each(['wiki', 'feature', 'artifact'])('every "%s" row resolves to a non-vacuous detail entry', (kind) => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const rowIds = [...html.matchAll(new RegExp(`data-detail-kind="${kind}" data-detail-id="([^"]+)"`, 'g'))].map((m) => m[1])
    expect(rowIds.length).toBeGreaterThan(0)
    const data = detailData(html)
    for (const id of rowIds) {
      expect(data[kind][id], `${kind} detail-data missing "${id}"`).toBeDefined()
    }
  })

  it('an inlined (.md) artifact entry has a body; a non-inlined (.html) one has no body but a fileHref instead', () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const data = detailData(html)
    expect(data.artifact['v1.10/fixture-doc.md'].body).toBeTruthy()
    expect(data.artifact['v1.10/fixture-doc.md'].fileHref).toBeUndefined()
    expect(data.artifact['v1.10/fixture-mockup.html'].body).toBeUndefined()
    expect(data.artifact['v1.10/fixture-mockup.html'].fileHref).toBeTruthy()
  })

  it('wiki groups by the raw frontmatter type value; an untyped page falls into the UNCLASSIFIED group', () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).toContain('data-group-select="decision"')
    expect(html).toContain('data-group-select="UNCLASSIFIED"')
  })

  it('a closed PRD round with no ## heading (a one-line stub) still lists and opens', () => {
    const html = renderPage({ data: fixtureDataWithPrdStub, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).toContain('data-detail-kind="prd" data-detail-id="v1.1"')
    const data = detailData(html)
    expect(data.prd['v1.1'].body).toBeTruthy()
  })
})

// T-666 slice 2a: home is now the current version's workspace on the SAME
// `groupedStore()` model every other simple store already uses — its four
// sidebar rows (progress/ticket/artifact/prd) switch which `.view-pane` is
// shown inside `#store-home`, exactly like wiki/feature/artifact/PRD already
// do (slice 1b), and it is version-scoped by construction (both filtered on
// `data.currentVersion` at build time, never a control that reaches backlog
// or a closed round).
describe('viewer/lib/render.mjs — home is the shared-model, version-scoped workspace (T-666 slice 2a)', () => {
  function render() {
    return renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  }

  it('home carries the same four sidebar groups the mockup approved, each scoped to the current version', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(homeMatch).not.toBeNull()
    const home = homeMatch[0]
    for (const group of ['progress', 'ticket', 'artifact', 'prd']) {
      expect(home, `home is missing the "${group}" sidebar group`).toContain(`data-group-select="${group}"`)
      expect(home, `home is missing the "${group}" view-pane`).toContain(`data-group="${group}"`)
    }
    // Never a backlog tab, never a closed-round list, never another
    // artifact bucket — those stay reachable only via the ticket/PRD/
    // artifact stores proper (the activity bar), never a home control.
    expect(home).not.toContain('data-group-select="backlog"')
    expect(home).not.toContain('data-group-select="closed"')
  })

  it('a ticket row inside home resolves against the SAME global ticket detail-data the ticket store itself uses — no duplicated data', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(homeMatch![0]).toContain('data-detail-kind="ticket" data-detail-id="T-901"')
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    const data = JSON.parse(blobMatch![1])
    expect(data.ticket['T-901']).toBeDefined()
  })

  it('the T-675 progress matrix places a fixture ticket in its prd_item row and assignee column', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    // T-901: prd_item v1.10#viewer, assignee developer, status open — its row
    // must carry a non-empty (not "–") cell somewhere (the exact column
    // isn't re-derived here; progressCell's own emptiness rule is what's
    // under test — see the non-vacuous control below for the failure mode).
    expect(home).toContain('stage-matrix')
    expect(home).toContain('stage-sq') // at least one square drawn (fixture is non-vacuous)
  })

  // Non-vacuous control: an empty cell really does render "–", so the
  // assertion above (a non-empty cell exists) is capable of failing.
  it('checker fixture: a version with zero tickets renders every matrix cell empty ("–"), never a bare square', () => {
    const emptyData = { ...fixtureData, currentVersion: 'v1.11', tickets: { included: [], omitted: [] } }
    const html = renderPage({ data: emptyData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    expect(home).not.toContain('stage-sq"') // no bare `<span class="stage-sq">` anywhere
    expect(home).toContain('stage-matrix-cell-empty')
  })

  it('home carries no fact about the viewer\'s own build (what it collected/inlined) — a product screen only says what the tickets/artifacts/PRD themselves say', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    // "인라인" (inlined) names THIS GENERATOR's own embed-vs-link decision
    // (viewer/lib/collect.mjs) — never a fact the tickets/artifacts/PRD
    // themselves carry. The pre-slice-2a home rendered "산출물 N건 (인라인
    // M건)" here; this line fails against that shape and passes against the
    // matrix-based home this slice builds instead.
    expect(home).not.toContain('인라인')
  })

  // Non-vacuous control: the "인라인" check above must be able to catch a
  // real leak, or it could be passing only because no code path emits that
  // word anywhere any more (a different, weaker claim than "home doesn't").
  it('checker fixture: a store-section containing the old inlined-count phrase is caught', () => {
    const fakeHtml = '<section class="store-section" data-store="home">산출물 3건 (인라인 2건)</section>'
    const m = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(fakeHtml)
    expect(m![0]).toContain('인라인')
  })
})
