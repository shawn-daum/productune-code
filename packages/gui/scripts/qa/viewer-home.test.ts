// T-881: Home 「현재 버전」 — the graph logic (home-graph.mjs), the screen
// the approved screen set draws (docs/artifacts/v1.12/define-screen-set.html,
// home-progress + home-cases), and the T-796 acceptance lines that live in
// the generated page.
import { describe, it, expect } from 'vitest'
import { renderPage, TEMPLATE_CSS, buildAnchors } from '@productune/viewer/lib/render.mjs'
import { collectPrdGatePath } from '@productune/viewer/lib/collect.mjs'
import { buildHomeGraph, layoutHomeGraph, waitLists, stageSegments, stageOfTicketType, NODE_W } from '@productune/viewer/lib/home-graph.mjs'

type T = { id: string; type?: string; status?: string; assignee?: string; deps?: string[]; prd_item?: string; body?: string }
const tk = (o: T) => ({
  bucket: 'v1.12',
  rel: `docs/tickets/v1.12/${o.id}.md`,
  frontmatter: { id: o.id, slug: `slug-${o.id}`, type: o.type ?? 'impl', status: o.status ?? 'open', assignee: o.assignee ?? 'developer', deps: o.deps ?? [], prd_item: o.prd_item ?? '' },
  body: o.body ?? '',
})
const GATE = 'docs/artifacts/v1.12/obs.md'
const gate = (deps: string[]) => tk({ id: 'T-90', type: 'ops', assignee: 'po', deps, body: `acceptance: \`${GATE}\` exists` })
const ids = (s: Set<string>) => [...s].sort()

describe('home graph — which route is drawn (T-796 / T-865)', () => {
  it('before Build (no gate ticket, or a gate with no deps) the main path is not connected and only the critical path draws', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] }), tk({ id: 'T-3' })], gatePath: GATE })
    expect(g.connected).toBe(false)
    expect(g.nodes.map((n) => n.id)).toEqual(['T-1', 'T-2'])
    expect(g.nodes.every((n) => !n.sp)).toBe(true)
    const noDeps = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), gate([])], gatePath: GATE })
    expect(noDeps.connected).toBe(false)
  })

  it('case 1/2: a main path at least as long as the longest chain is one route — main path and critical path together', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] }), tk({ id: 'T-3', deps: ['T-2'] }), gate(['T-3']), tk({ id: 'T-7' })], gatePath: GATE })
    expect(g.connected).toBe(true)
    expect(ids(g.spine)).toEqual(['T-1', 'T-2', 'T-3', 'T-90'])
    expect(g.cpIsSpine).toBe(true)
    expect(g.nodes.find((n) => n.id === 'T-90')!.gate).toBe(true)
  })

  it('case 3: a rider chain longer than the main path draws as its own critical path, never a main path longer than it', () => {
    const g = buildHomeGraph({
      tickets: [tk({ id: 'T-1' }), gate(['T-1']), ...['T-11', 'T-12', 'T-13', 'T-14'].map((id, i, a) => tk({ id, deps: i ? [a[i - 1]] : [], prd_item: 'v1.12#riders' }))],
      gatePath: GATE,
    })
    expect(g.cpIsSpine).toBe(false)
    expect(ids(g.cp)).toEqual(['T-11', 'T-12', 'T-13', 'T-14'])
    expect(g.nodes.find((n) => n.id === 'T-11')!.rider).toBe(true)
    // the spine's longest chain (2) is shorter than the critical path (4)
    expect(g.spine.size).toBe(2)
  })

  it('cases 4-8: fork, join, diamond and uneven lanes keep the longest chain as the critical path', () => {
    const fork = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] }), tk({ id: 'T-3', deps: ['T-1'] }), tk({ id: 'T-4', deps: ['T-3'] })], gatePath: '' })
    expect(ids(fork.cp)).toEqual(['T-1', 'T-3', 'T-4'])
    const join = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2' }), tk({ id: 'T-3', deps: ['T-1', 'T-2'] }), tk({ id: 'T-0' }), tk({ id: 'T-5', deps: ['T-0'] }), tk({ id: 'T-6', deps: ['T-5'] }), tk({ id: 'T-7', deps: ['T-6'] })], gatePath: '' })
    expect(ids(join.cp)).toEqual(['T-0', 'T-5', 'T-6', 'T-7'])
    const lanes = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] }), tk({ id: 'T-3', deps: ['T-2'] }), tk({ id: 'T-4' })], gatePath: '' })
    expect(ids(lanes.cp)).toEqual(['T-1', 'T-2', 'T-3'])
  })

  it('a dependency on a closed or other-version ticket is no edge; a closed dependency of a rider shows as a done node', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), gate(['T-1']), tk({ id: 'T-5', status: 'done' }), tk({ id: 'T-6', deps: ['T-5', 'T-999'] })], gatePath: GATE })
    expect(g.nodes.find((n) => n.id === 'T-5')!.done).toBe(true)
    expect(g.edges).toContainEqual({ from: 'T-5', to: 'T-6' })
    expect(g.edges.some((e) => e.from === 'T-999')).toBe(false)
  })

  it('case 9: a drawn open decision or assignee-user ticket carries the waits mark', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1', type: 'decision', assignee: 'user' }), tk({ id: 'T-2', deps: ['T-1'] })], gatePath: '' })
    expect(g.nodes.find((n) => n.id === 'T-1')!.waits).toBe(true)
    expect(g.nodes.find((n) => n.id === 'T-2')!.waits).toBe(false)
  })

  it('a cycle in deps does not hang the layout', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1', deps: ['T-2'] }), tk({ id: 'T-2', deps: ['T-1'] })], gatePath: '' })
    expect(() => layoutHomeGraph(g)).not.toThrow()
  })

  it('a plain chain stays one straight lane', () => {
    const g = buildHomeGraph({ tickets: [tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] }), tk({ id: 'T-3', deps: ['T-2'] })], gatePath: '' })
    const l = layoutHomeGraph(g)
    expect(new Set(l.nodes.map((n) => n.y)).size).toBe(1)
    expect(l.edges.every((e) => !e.d.includes('Q'))).toBe(true)
  })
})

describe('home wait lists — the T-849 rule the statusline dec / req uses', () => {
  const row = (bucket: string, o: T) => ({ bucket, fm: tk(o).frontmatter })
  it('dec = open decisions, req = open assignee-user non-decisions, across every version directory', () => {
    const r = waitLists([
      row('v1.12', { id: 'T-5', type: 'decision', assignee: 'user' }),
      row('v1.11', { id: 'T-3', type: 'decision', assignee: 'user' }),
      row('v1.11', { id: 'T-4', type: 'ops', assignee: 'user' }),
      row('v1.12', { id: 'T-6', type: 'decision', assignee: 'user', status: 'done' }),
      row('v1.12', { id: 'T-7', type: 'impl', assignee: 'developer' }),
      row('backlog', { id: 'T-8', type: 'ops', assignee: 'user' }),
    ])
    expect(r.dec.map((f) => f.id)).toEqual(['T-3', 'T-5'])
    expect(r.req.map((f) => f.id)).toEqual(['T-4'])
  })
})

describe('home stage bar and PRD gate path', () => {
  it('reads design and decision as define, qa and ops as ship, everything else as build; retro stays empty', () => {
    expect(['design', 'decision', 'impl', 'qa', 'ops', 'x'].map(stageOfTicketType)).toEqual(['define', 'define', 'build', 'ship', 'ship', 'build'])
    const segs = stageSegments([tk({ id: 'T-2', type: 'design' }), tk({ id: 'T-1', type: 'design', status: 'done' }), tk({ id: 'T-3', status: 'dropped' })])
    expect(segs.map((s) => s.stage)).toEqual(['define', 'build', 'ship', 'retro'])
    expect(segs[0].tickets).toEqual([{ id: 'T-1', done: true }, { id: 'T-2', done: false }])
    expect(segs[3].tickets).toEqual([])
  })
  it('names the gate artifact path from the open PRD section 합격선 row', () => {
    const prd = '## v1.12 — x\n\n| **합격선** | **`docs/artifacts/v1.12/obs.md` 가 존재하고** |\n\n## v1.13\n| **합격선** | `docs/other.md` |'
    expect(collectPrdGatePath(prd, 'v1.12')).toBe('docs/artifacts/v1.12/obs.md')
    expect(collectPrdGatePath('## v1.12\nnothing', 'v1.12')).toBe('')
  })
})

function page(tickets: ReturnType<typeof tk>[], opts: { gatePath?: string; stage?: string } = {}) {
  const data = {
    poState: { stage: opts.stage ?? 'build', version: 'v1.12', current_task: null },
    currentVersion: 'v1.12',
    prd: { current: { body: '', rel: 'docs/prd/PRD.md', frontmatter: {} }, closed: [], openItems: [{ key: 'a', label: '기능 화면: 영역 사이드바' }], gatePath: opts.gatePath ?? '' },
    tickets: { included: tickets, omitted: [{ bucket: 'v1.11', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.11/T-3.md', frontmatter: { id: 'T-3', slug: 'old-decision', type: 'decision', status: 'open', assignee: 'user' } }], bodies: {} }] },
    wiki: [],
    features: [],
    featureTaxonomy: null,
    artifacts: { entries: [] },
  }
  const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  const home = /<section class="store-section active" data-store="home"[\s\S]*?<\/section>/.exec(html)![0]
  return { html, home }
}

describe('home screen — T-796 acceptance in the generated page', () => {
  const tickets = [tk({ id: 'T-1', prd_item: 'v1.12#a' }), tk({ id: 'T-2', deps: ['T-1'], assignee: 'user', type: 'ops' }), gate(['T-2'])]
  const connected = page(tickets, { gatePath: GATE })
  const before = page([tk({ id: 'T-1' }), tk({ id: 'T-2', deps: ['T-1'] })], { stage: 'define' })

  it('names the tab 「현재 버전」 and the heading 「현재 버전 · v1.12」; the matrix is gone', () => {
    expect(connected.html).toContain('aria-label="현재 버전"')
    expect(connected.home).toContain('현재 버전 · v1.12')
    expect(connected.home).not.toContain('stage-matrix')
    expect(connected.home).not.toContain('>홈<')
  })
  it('draws the stage bar, 스코프, both wait lists and the dependency block (named 「dependency」)', () => {
    expect(connected.home).toContain('class="sb"')
    expect(connected.home).toContain('스코프')
    expect(connected.home).toContain('내 결정 대기')
    expect(connected.home).toContain('사용자 작업 대기')
    expect(connected.home).toContain('dependency')
    expect(connected.home).toContain('메인 패스 · 크리티컬 패스')
  })
  it('before Build: the not-connected notice and 「크리티컬 패스」 only', () => {
    expect(before.home).toContain('메인 패스가 아직 이어지지 않았어요')
    expect(before.home).toContain('Build 진입 전')
    expect(before.home).not.toContain('dg-chip-sp')
    expect(connected.home).not.toContain('메인 패스가 아직 이어지지 않았어요')
  })
  it('chips: 「메인 패스」 above the spine, 「합격선」 on the gate; no explanatory tail in the legend', () => {
    expect(connected.home).toContain('>메인 패스</text>')
    expect(connected.home).toContain('>합격선</text>')
    expect(connected.home).toContain('<span class="lgc lgc-gate">합격선</span></span>')
  })
  it('every node shows its worker as a lowercase pill and opens its ticket in place', () => {
    for (const id of ['T-1', 'T-2', 'T-90']) expect(connected.home).toMatch(new RegExp(`class="dg-a dg-btn" data-detail-kind="ticket" data-detail-id="${id}"`))
    expect(connected.home).toContain('class="dg-role dg-role-developer"')
    expect(connected.home).toContain('>developer</text>')
    expect(connected.home).toContain('>user</text>')
    expect(connected.home).toContain('dg-role-user')
  })
  it('the wait lists list a previous-version decision and each entry opens its detail in place', () => {
    expect(connected.home).toContain('class="cp-went" data-detail-kind="ticket" data-detail-id="T-3"')
    expect(connected.html).toContain('"T-3"') // its detail entry exists in the page data
  })
  it('a ticket anchor opens inside Home', () => {
    const anchors = buildAnchors({ currentVersion: 'v1.12', tickets: { included: tickets, omitted: [] }, wiki: [], features: [], featureTaxonomy: null, prd: { current: { body: '' }, closed: [], openItems: [] }, artifacts: { entries: [] } } as never)
    expect(anchors['T-2'].s).toBe('home')
  })
  it('role pills render lowercase and `user` is a solid ink chip, everywhere', () => {
    expect(TEMPLATE_CSS).toMatch(/\.pill\[class\*="pill-role-"\], \.pill-user-ink \{ text-transform: none;/)
    expect(TEMPLATE_CSS).toMatch(/\.pill-user-ink \{ background: var\(--text-primary\); color: var\(--bg-surface-base\); \}/)
    expect(connected.html).toContain("'<span class=\"pill pill-user-ink\">user</span>'") // detail panel assignee
  })
  it('thinner arrows and the detail panel keeps its shipped width; × sits left of the title', () => {
    expect(TEMPLATE_CSS).toMatch(/\.dg-e \{[^}]*stroke-width: 1;/)
    expect(TEMPLATE_CSS).toMatch(/\.dg-e-sp \{[^}]*stroke-width: 1\.25;/)
    expect(TEMPLATE_CSS).toContain('width: min(820px, 92%)')
    expect(connected.html).toMatch(/<div class="detail-panel-header"><button type="button" class="detail-panel-close"[\s\S]*?<\/button><span class="detail-panel-title">/)
  })
  it('keeps the strict CSP (no inline-script relaxation) for the new home markup', () => {
    expect(connected.html).toMatch(/Content-Security-Policy" content="default-src 'none'; script-src 'sha256-/)
    expect(/script-src [^;]*'unsafe-inline'/.test(connected.html)).toBe(false)
  })
})

describe('home fix round 1 (T-881 grill) — what a DOM-free test can pin; widths are browser-only', () => {
  it('(1) the stage bar and the scope rows wrap inside the card instead of forcing a fixed width (measured in Chromium, not here)', () => {
    expect(TEMPLATE_CSS).toMatch(/\.sb \{[^}]*max-width: 100%/)
    expect(TEMPLATE_CSS).toMatch(/\.sb-seg \{[^}]*flex: 0 1 auto; min-width: 56px/)
    expect(TEMPLATE_CSS).toMatch(/\.sb-sq \{[^}]*flex-wrap: wrap/)
    expect(TEMPLATE_CSS).toMatch(/\.sb-total \{[^}]*flex: 0 0 auto/)
    expect(TEMPLATE_CSS).toMatch(/\.sc-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(200px, 220px\)/)
    expect(TEMPLATE_CSS).toMatch(/\.sc-sq \{[^}]*flex-wrap: wrap/)
    expect(TEMPLATE_CSS).toMatch(/\.sc-waits \{ min-width: 0;/)
  })

  it('(2) six edges into one node get six separate vertical channels, all in the gap before the target column', () => {
    const srcs = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6']
    const g = buildHomeGraph({ tickets: [...srcs.map((id) => tk({ id })), tk({ id: 'T-7', deps: srcs }), gate(['T-7'])], gatePath: GATE })
    const lay = layoutHomeGraph(g)
    const target = lay.nodes.find((n) => n.id === 'T-7')!
    const xs: number[] = []
    for (const e of lay.edges) {
      const a = lay.nodes.find((n) => n.id === e.from)!
      const q = /Q([\d.]+),/.exec(e.d)
      if (!q) continue
      const vert = [Number(q[1])]
      expect(vert[0]).toBeGreaterThan(a.x + NODE_W + 5)
      expect(vert[0]).toBeLessThan(target.x - 5)
      xs.push(vert[0])
    }
    expect(xs.length).toBeGreaterThanOrEqual(5)
    const sorted = [...xs].sort((p, q) => p - q)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(6)
  })

  it('(3) opening a ticket clears the outline from every clickable [data-detail-kind] that is not a table row, on open and on close', () => {
    const { html } = page([tk({ id: 'T-1' })])
    const clears = html.match(/querySelectorAll\('\.detail-row\.is-open, \[data-detail-kind\]\.is-open'\)/g) || []
    expect(clears.length).toBe(2)
  })

  it('(4) a first main-path node that also waits on the user keeps 사용자를 기다림 top-left and no two chips overlap', () => {
    const { home } = page([tk({ id: 'T-1', type: 'decision', assignee: 'user' }), tk({ id: 'T-2', deps: ['T-1'] }), gate(['T-2'])], { gatePath: GATE })
    const chips = [...home.matchAll(/<rect class="dg-chip dg-chip-(\w+)" height="15" rx="7.5" width="([\d.]+)" x="([\d.-]+)" y="([\d.-]+)">/g)].map((m) => ({ kind: m[1], w: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }))
    const turn = chips.find((c) => c.kind === 'turn')!
    const box = /<rect class="dg-box" height="40" rx="8" width="112" x="([\d.-]+)" y="([\d.-]+)"/.exec(home)!
    expect(turn.x).toBe(Number(box[1]))
    expect(chips.some((c) => c.kind === 'sp')).toBe(true)
    for (const a of chips) for (const b of chips) {
      if (a === b) continue
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + 15 && b.y < a.y + 15
      expect(overlap).toBe(false)
    }
  })

  it('(5) a rider that waits on the user and carries the critical-path label draws 3 chips in two rows, none over the box above or another chip', () => {
    // Main path T-1 → gate (short); rider chain T-5 → T-8 is longer, so it draws as the critical path.
    // T-5 is the first rider, assigned to the user (3 chips), and sits under the main-path box T-1 in its column.
    const home = page(
      [
        tk({ id: 'T-1' }), gate(['T-1']),
        tk({ id: 'T-5', prd_item: 'docs/prd/PRD.md#riders', assignee: 'user' }),
        tk({ id: 'T-6', deps: ['T-5'], prd_item: 'docs/prd/PRD.md#riders' }),
        tk({ id: 'T-7', deps: ['T-6'], prd_item: 'docs/prd/PRD.md#riders' }),
        tk({ id: 'T-8', deps: ['T-7'], prd_item: 'docs/prd/PRD.md#riders' }),
      ],
      { gatePath: GATE },
    ).home
    const chips = [...home.matchAll(/<rect class="dg-chip dg-chip-(\w+)" height="15" rx="7.5" width="([\d.]+)" x="([\d.-]+)" y="([\d.-]+)">/g)].map((m) => ({ kind: m[1], x: Number(m[3]), y: Number(m[4]), w: Number(m[2]), h: 15 }))
    const boxes = [...home.matchAll(/<rect class="dg-box" height="40" rx="8" width="112" x="([\d.-]+)" y="([\d.-]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: 112, h: 40 }))
    const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    expect(chips.map((c) => c.kind).sort()).toEqual(expect.arrayContaining(['turn', 'rider', 'cp']))
    const threeChip = chips.filter((c) => ['turn', 'rider', 'cp'].includes(c.kind))
    expect(new Set(threeChip.map((c) => c.y)).size).toBeLessThanOrEqual(2)
    for (const c of chips) for (const b of boxes) expect(hit(c, b)).toBe(false)
    for (const a of chips) for (const b of chips) if (a !== b) expect(hit(a, b)).toBe(false)
  })
})
