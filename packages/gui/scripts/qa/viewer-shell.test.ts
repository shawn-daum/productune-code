// T-666 slice 1a acceptance lines 3-4:
// "section headings render as chips by one shared rule across every
// document kind" · "a test asserts that every ticket row resolves to a
// detail entry" (the shell's list → detail proof, ticket store).
import { describe, it, expect, beforeAll } from 'vitest'
import { generate, missingMetaRootReason } from '../../viewer/generate.mjs'
import { renderPage, resolveDocLink } from '../../viewer/lib/render.mjs'
import { collectPrdOpenItems } from '../../viewer/lib/collect.mjs'

// T-718: the real generated page, built HERE in-process rather than read
// back off the gitignored `viewer/viewer.html` (a fresh checkout never has
// it on disk) — see viewer-html.test.ts's header for the full rationale.
// Built once and reused by every test below.
//
// T-718 slice 2: a detached code-only checkout has no meta project beside it
// (see viewer-html.test.ts's header) — `generate()` throws ENOENT there.
// Checked once, up front, so only the one test below that needs `realHtml`
// skips (with a visible reason); every fixture-based case here still runs.
const metaMissingReason = missingMetaRootReason()
let realHtml: string
beforeAll(async () => {
  if (metaMissingReason) return
  ;({ html: realHtml } = await generate())
}, 30000)

// T-795: real `#### <key> — <label>` headings, matching a fixture ticket's
// own `prd_item: v1.10#viewer` — proves row labels come from THIS prose,
// never a hardcoded map. 'bare-key' (no ` — <label>`) proves the
// no-heading-text fallback: the key itself as the label.
const FIXTURE_PRD_BODY =
  '## v1.10 — fixture round\n\n#### north-star — North star fixture label\n\nprose.\n\n#### viewer — Viewer row fixture label\n\nprose.\n\n#### bare-key\n\nprose, no " — label" part.\n'

const fixtureData = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: {
    current: { body: FIXTURE_PRD_BODY },
    closed: [],
    // `collectPrd` derives this from `current.body` via `collectPrdOpenItems`
    // (collect.mjs) — this fixture bypasses collect.mjs entirely (it builds
    // `data` by hand), so it computes the SAME derived value here, with the
    // real function, rather than a hand-kept copy that could drift from the
    // body above.
    openItems: collectPrdOpenItems(FIXTURE_PRD_BODY, 'v1.10'),
  },
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
      // T-666 slice 2b: no `prd_item` (like the real T-677/678/679) — must
      // land in the matrix's trailing row, never disappear. `type: ops` also
      // makes this the fixture's one `ship`-stage ticket for the stage line.
      {
        bucket: 'v1.10',
        rel: 'docs/tickets/v1.10/T-903.md',
        frontmatter: { id: 'T-903', slug: 'fixture-out-of-scope', type: 'ops', status: 'open', assignee: 'user' },
        body: 'no prd_item — this ticket is out of scope for the seven PRD items.',
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
    // T-666 slice 2b: a relative link fixture — 'docs/wiki' -> '../prd/versions/v1.1.md'
    // resolves to the real repo shape 'docs/prd/versions/v1.1.md' (siblings
    // under docs/), same as an anchor-only, a protocol-relative, and a
    // scheme link left untouched.
    {
      rel: 'docs/wiki/fact--fixture-link.md',
      frontmatter: { title: 'fixture link fact', type: 'fact' },
      body: 'See [a closed PRD round](../prd/versions/v1.1.md), [an anchor](#foo), and [an external site](https://example.com/x).',
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

  it.skipIf(metaMissingReason)(
    `holds for the real generated viewer.html, not only the fixture${metaMissingReason ? ` — SKIPPED: ${metaMissingReason}` : ''}`,
    () => {
      const rowIds = [...realHtml.matchAll(/data-detail-kind="ticket" data-detail-id="([^"]+)"/g)].map((m) => m[1])
      expect(rowIds.length).toBeGreaterThan(0)
      const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(realHtml)
      expect(blobMatch).not.toBeNull()
      const detailData = JSON.parse(blobMatch[1])
      for (const id of rowIds) {
        expect(detailData.ticket[id]).toBeDefined()
      }
    },
  )
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

  // T-709 결정 2: a closed PRD round is no longer a list row that opens a
  // shared detail-panel — it is its own sidebar group whose pane renders its
  // body directly. "still lists and opens" now means: a `data-group-select`
  // button for the round exists, and its own `.view-pane` carries the stub
  // body text (never a `data-detail-kind="prd"` row / detail-data entry —
  // that mechanism is gone).
  it('a closed PRD round with no ## heading (a one-line stub) still lists and opens', () => {
    const html = renderPage({ data: fixtureDataWithPrdStub, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).toContain('data-group-select="v1.1"')
    const paneMatch = /<div class="view-pane[^"]*" data-group="v1\.1">([\s\S]*?)<\/div>\s*(?:<div class="view-pane|<\/div>\s*<div class="detail-panel)/.exec(html)
    expect(paneMatch, 'no .view-pane for the "v1.1" closed round').not.toBeNull()
    expect(paneMatch![1]).toContain('no PRD section — stub round.')
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

  it('home sidebar lists its groups in the order 진행 상황 · 아티팩트 · PRD · 티켓 · 결정, progress staying the default-open one (T-866)', () => {
    const home = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(render())![0]
    const order = [...home.matchAll(/data-group-select="([^"]+)"/g)].map((m) => m[1])
    expect(order).toEqual(['progress', 'artifact', 'prd', 'ticket', 'decision'])
    expect(/data-group-select="progress"[^>]*class="[^"]*active|class="[^"]*active[^"]*"[^>]*data-group-select="progress"/.test(home)).toBe(true)
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

  // T-766: the stage line shows the current po-state stage name plus ONE
  // version-wide done/total, never a per-type stage guess (T-755's fix to
  // statusline-prdt.sh, carried into the viewer by this ticket).
  it('the stage line shows the po-state stage and a version-wide done/total, never a per-type count', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    expect(home).toContain('class="stage-line')
    // fixtureData's poState.stage is 'build'; T-901 and T-903 are this
    // fixture's only current-version (v1.10) tickets, both `status: open` —
    // T-902 is backlog (excluded from home) and never counts here.
    expect(home).toMatch(/build \| 0\/2/)
    // never the retired per-type cells (any of the four stage words followed
    // by its own "n/m" the old TYPE_TO_STAGE line used to print)
    expect(home).not.toMatch(/define \d+\/\d+/)
    expect(home).not.toMatch(/ship \d+\/\d+/)
    expect(home).not.toMatch(/retro \d+\/\d+/)
  })

  // Non-vacuous control: a version with zero tickets must still show the
  // stage name with an explicit 0/0, never omit the count.
  it('checker fixture: a version with zero tickets still shows the stage line at 0/0', () => {
    const emptyData = { ...fixtureData, currentVersion: 'v1.11', tickets: { included: [], omitted: [] } }
    const html = renderPage({ data: emptyData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    expect(home).toMatch(/build \| 0\/0/)
  })

  // T-666 slice 2b acceptance line 2: the matrix's trailing row for a
  // ticket carrying no `prd_item` — today's real T-677/678/679, fixture T-903.
  it('the matrix gets a trailing "항목 밖" row for a ticket with no prd_item — it never disappears from the card', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    const rowMatch = /<div class="stage-matrix-row"[^>]*><span class="stage-matrix-label">항목 밖<\/span>([\s\S]*?)<\/div>/.exec(home)
    expect(rowMatch, 'no trailing "항목 밖" row found in the matrix').not.toBeNull()
    // T-903 (assignee: user, status: open) draws a real square in this row
    // — never all "–", or the ticket would still be effectively invisible.
    expect(rowMatch![1]).toContain('stage-sq')
  })

  // T-795: the defect this ticket fixes — row labels used to come from a
  // map hand-typed with productune's own v1.10 item keys, so any other
  // project/version's items had no real label at all. Now every row's label
  // is the open PRD section's own heading text (`fixtureData.prd.current`
  // above), for any key.
  it('a progress row label is the open PRD section\'s own heading text, not a hardcoded map', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const home = homeMatch![0]
    expect(home).toContain('Viewer row fixture label')
    expect(home).toContain('North star fixture label')
    // T-901 (prd_item v1.10#viewer) draws its square inside the "Viewer row
    // fixture label" row specifically, not merely somewhere in the matrix.
    const viewerRow = /<div class="stage-matrix-row"[^>]*><span class="stage-matrix-label">Viewer row fixture label<\/span>([\s\S]*?)<\/div>/.exec(home)
    expect(viewerRow, 'no row for the "viewer" PRD item').not.toBeNull()
    expect(viewerRow![1]).toContain('stage-sq')
  })

  // T-795 acceptance: "a key with no heading falls back to the key itself" —
  // here, a heading present but missing its ` — <label>` part.
  it('a PRD item heading with no " — label" part falls back to its own key as the row label', () => {
    const html = render()
    const homeMatch = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(homeMatch![0]).toContain('<span class="stage-matrix-label">bare-key</span>')
  })
})

describe('viewer/lib/collect.mjs — collectPrdOpenItems reads the open PRD section\'s own item headings (T-795)', () => {
  const body = [
    '## Why — 비전',
    '',
    '#### not-a-real-item — outside the version section, never collected',
    '',
    '## v1.11 — fixture round',
    '',
    '#### alpha — Alpha label',
    '',
    'prose.',
    '',
    '#### beta',
    '',
    'prose, no label part.',
    '',
    '## v1.12 — next round, never collected either',
    '',
    '#### gamma — never collected (wrong section)',
    '',
  ].join('\n')

  it('collects only the current version\'s own #### headings, in heading order', () => {
    expect(collectPrdOpenItems(body, 'v1.11')).toEqual([
      { key: 'alpha', label: 'Alpha label' },
      { key: 'beta', label: 'beta' },
    ])
  })

  // T-713-style numeric equality: 'v1.11.0' on disk vs 'v1.11' in po-state
  // (or vice versa) is still the same version — never a literal string match.
  it('matches the version heading by numeric equality, not literal string equality', () => {
    expect(collectPrdOpenItems(body, 'v1.11.0')).toEqual([
      { key: 'alpha', label: 'Alpha label' },
      { key: 'beta', label: 'beta' },
    ])
  })

  it('returns an empty list when no section matches the current version', () => {
    expect(collectPrdOpenItems(body, 'v2.0')).toEqual([])
  })

  it('returns an empty list for an empty/absent PRD body (a project with no PRD written yet, T-746)', () => {
    expect(collectPrdOpenItems('', 'v1.11')).toEqual([])
  })
})

// T-709 결정 1: the ticket sidebar now has one row per docs/tickets/ bucket
// directory, sorted NEWEST VERSION FIRST — never string order, which would
// wrongly place "v1.10" before "v1.9". Also proves a frontmatter-only
// (non-current/non-backlog) bucket's row opens the REAL FILE (no inline
// body — collect.mjs never gives it one) rather than a rendered body.
describe('viewer/lib/render.mjs — ticket sidebar orders buckets by NUMERIC version, newest first (T-709 결정 1)', () => {
  const versionOrderingData = {
    ...fixtureData,
    currentVersion: 'v1.10',
    tickets: {
      included: [
        { bucket: 'v1.10', rel: 'docs/tickets/v1.10/T-950.md', frontmatter: { id: 'T-950', slug: 'current', type: 'impl', status: 'open', assignee: 'developer' }, body: 'current body' },
      ],
      omitted: [
        {
          bucket: 'v1.9',
          count: 1,
          bytes: 10,
          tickets: [{ rel: 'docs/tickets/v1.9/T-800.md', frontmatter: { id: 'T-800', slug: 'closed-round', type: 'impl', status: 'done', assignee: 'developer' } }],
        },
        {
          bucket: 'v1.11',
          count: 1,
          bytes: 10,
          tickets: [{ rel: 'docs/tickets/v1.11/T-970.md', frontmatter: { id: 'T-970', slug: 'roadmap', type: 'design', status: 'open', assignee: 'designer' } }],
        },
      ],
    },
  }

  it('sorts numerically, never as strings: v1.11 before v1.10(current) before v1.9, backlog pinned last', () => {
    const html = renderPage({ data: versionOrderingData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const ticketSectionMatch = /<section[^>]*data-store="ticket"[^>]*>[\s\S]*?<\/section>/.exec(html)
    expect(ticketSectionMatch).not.toBeNull()
    const section = ticketSectionMatch![0]
    const idx = (needle: string) => section.indexOf(needle)
    expect(idx('data-group-select="v1.11"')).toBeGreaterThanOrEqual(0)
    expect(idx('data-group-select="v1.10"')).toBeGreaterThanOrEqual(0)
    expect(idx('data-group-select="v1.9"')).toBeGreaterThanOrEqual(0)
    expect(idx('data-group-select="backlog"')).toBeGreaterThanOrEqual(0)
    // Non-vacuous against a string sort: "v1.10" would sort BEFORE "v1.9"
    // lexicographically, which is exactly the bug this rule guards against.
    expect(idx('data-group-select="v1.11"')).toBeLessThan(idx('data-group-select="v1.10"'))
    expect(idx('data-group-select="v1.10"')).toBeLessThan(idx('data-group-select="v1.9"'))
    expect(idx('data-group-select="v1.9"')).toBeLessThan(idx('data-group-select="backlog"'))
  })

  it('the current version stays the default-active pane even though it is no longer array index 0', () => {
    const html = renderPage({ data: versionOrderingData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const ticketSectionMatch = /<section[^>]*data-store="ticket"[^>]*>[\s\S]*?<\/section>/.exec(html)
    const section = ticketSectionMatch![0]
    expect(section).toMatch(/<button type="button" class="nav-item nav-item-clickable active" data-group-select="v1\.10"/)
    expect(section).toMatch(/<div class="view-pane active" data-group="v1\.10">/)
  })

  it('a closed-bucket row (v1.9) has no inline body and opens the real file instead', () => {
    const html = renderPage({ data: versionOrderingData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(html).toContain('data-detail-kind="ticket" data-detail-id="T-800"')
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(blobMatch).not.toBeNull()
    const data = JSON.parse(blobMatch![1])
    expect(data.ticket['T-800'].body).toBeUndefined()
    expect(data.ticket['T-800'].fileHref).toBe('../../../../docs/tickets/v1.9/T-800.md')
  })
})

describe('viewer/lib/render.mjs — resolveDocLink (T-666 slice 2b)', () => {
  it('resolves a same-repo relative link against the source directory and repoRootHref, matching the real hrefs measured in PRD.md', () => {
    expect(resolveDocLink('./versions/v1.9.md', 'docs/prd', '../../../..')).toBe('../../../../docs/prd/versions/v1.9.md')
    expect(resolveDocLink('../artifacts/v1.9/phase4-terminal-free-gui.md', 'docs/prd', '../../../..')).toBe(
      '../../../../docs/artifacts/v1.9/phase4-terminal-free-gui.md',
    )
  })

  it('leaves an anchor, a protocol-relative link, a scheme link, and a site-absolute link untouched (returns null)', () => {
    expect(resolveDocLink('#section', 'docs/prd', '../../../..')).toBeNull()
    expect(resolveDocLink('//example.com/x', 'docs/prd', '../../../..')).toBeNull()
    expect(resolveDocLink('https://example.com/x', 'docs/prd', '../../../..')).toBeNull()
    expect(resolveDocLink('mailto:a@b.com', 'docs/prd', '../../../..')).toBeNull()
    expect(resolveDocLink('/docs/prd/PRD.md', 'docs/prd', '../../../..')).toBeNull()
  })

  // Non-vacuous control: a link that would resolve outside the repo root
  // really is caught, or "leave untouched if it escapes the repo root"
  // could be passing only because no fixture ever exercises that branch.
  it('checker fixture: a link that would escape the repo root is left untouched, never rewritten past it', () => {
    expect(resolveDocLink('../../../../../etc/passwd', 'docs/prd', '../../../..')).toBeNull()
  })
})

describe("viewer/lib/render.mjs — relative document links resolve against the source file's own location, not viewer.html's (T-666 slice 2b)", () => {
  function detailData(html) {
    const blobMatch = /<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
    expect(blobMatch).not.toBeNull()
    return JSON.parse(blobMatch[1])
  }

  it("rewrites a relative link inside a wiki body against the wiki page's own directory, using the default repoRootHref", () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const body = detailData(html).wiki['fact--fixture-link.md'].body
    expect(body).toContain('href="../../../../docs/prd/versions/v1.1.md"')
    expect(body).toContain('target="_blank"')
    expect(body).toContain('rel="noopener"')
    expect(body).toContain('href="#foo"')
    expect(body).toContain('href="https://example.com/x"')
  })

  it("honors a repoRootHref passed explicitly by the caller (generate.mjs threads the real one)", () => {
    const html = renderPage({
      data: fixtureData,
      dark: new Map(),
      light: new Map(),
      fontFaceCss: '',
      tokensSha256: '',
      repoRootHref: '../../custom',
    })
    const body = detailData(html).wiki['fact--fixture-link.md'].body
    expect(body).toContain('href="../../custom/docs/prd/versions/v1.1.md"')
  })
})

// T-708 slice 2 결함 3/11: the 10-square fold cap (a real logic branch, not
// pure markup) and the removed dash-actions buttons. Real-browser layout
// (nowrap never producing a 2nd row, the overall row's square size/gap
// matching the matrix's, the frame filling the viewport) is asserted in
// tests/viewer-html.window.spec.ts instead — vitest has no layout engine.
describe('viewer/lib/render.mjs — home progress matrix folds beyond 10 squares (T-708 결함 3)', () => {
  function fixtureWithCellCount(n) {
    const included = Array.from({ length: n }, (_, i) => ({
      bucket: 'v1.10',
      rel: `docs/tickets/v1.10/T-fold-${i}.md`,
      frontmatter: { id: `T-fold-${i}`, slug: `fold-${i}`, type: 'impl', status: 'open', assignee: 'developer', prd_item: 'v1.10#viewer' },
      body: 'x',
    }))
    return { ...fixtureData, tickets: { included, omitted: [] } }
  }

  function homeSectionHtml(n) {
    const html = renderPage({ data: fixtureWithCellCount(n), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    return /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)![0]
  }

  it('a cell with exactly 10 tickets draws 10 squares and no fold fragment (boundary — not yet over the cap)', () => {
    const home = homeSectionHtml(10)
    const cellMatch = /<span class="stage-matrix-sq-wrap">((?:<span class="stage-sq[^>]*><\/span>)+)<\/span>/.exec(home)
    expect(cellMatch).not.toBeNull()
    expect((cellMatch![1].match(/class="stage-sq/g) ?? []).length).toBe(10)
    expect(home).not.toContain('stage-matrix-fold')
  })

  it('a cell with 15 tickets draws only 10 squares plus one "+5" fold fragment, same wrap, and the done/total count still counts all 15', () => {
    const home = homeSectionHtml(15)
    const cellMatch = /<span class="stage-matrix-sq-wrap">([\s\S]*?)<\/span><span class="stage-matrix-count mono">(\d+)\/(\d+)<\/span>/.exec(home)
    expect(cellMatch).not.toBeNull()
    const [, sqWrapInner, done, total] = cellMatch!
    expect((sqWrapInner.match(/class="stage-sq/g) ?? []).length).toBe(10)
    expect(sqWrapInner).toContain('<span class="stage-matrix-fold">+5</span>')
    expect(total).toBe('15')
    expect(Number(done)).toBeLessThanOrEqual(15)
  })

  // Non-vacuous control: a cell that should NOT fold (5 tickets) really
  // produces no fold fragment, or the "not.toContain" assertion above could
  // be passing for the wrong reason (e.g. a typo in the class name checked).
  it('checker fixture: a cell with fewer than 10 tickets never gets a fold fragment', () => {
    const home = homeSectionHtml(5)
    expect(home).not.toContain('stage-matrix-fold')
  })

  it("the overall progress line never folds even with far more than 10 tickets — only the per-item matrix cells do", () => {
    const html = renderPage({ data: fixtureWithCellCount(15), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const overallMatch = /<div class="stage-overall">[\s\S]*?<\/div>/.exec(html)
    expect(overallMatch).not.toBeNull()
    expect(overallMatch![0]).not.toContain('stage-matrix-fold')
    expect((overallMatch![0].match(/class="stage-sq/g) ?? []).length).toBe(15)
  })
})

describe('viewer/lib/render.mjs — home no longer carries the redundant 티켓/PRD shortcut buttons (T-708 결함 11)', () => {
  it('the rendered home card has no dash-actions block and no btn-secondary button', () => {
    const html = renderPage({ data: fixtureData, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const home = /<section[^>]*data-store="home"[^>]*>[\s\S]*?<\/section>/.exec(html)![0]
    expect(home).not.toContain('dash-actions')
    expect(home).not.toContain('btn-secondary')
  })
})
