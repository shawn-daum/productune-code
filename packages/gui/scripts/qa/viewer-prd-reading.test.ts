// T-884 (T-860 / T-874): the open PRD's reading screen — outline hierarchy, folds with the approved
// initial open set, the 「결정할 것」 box, What cards with 「N줄」, and the h3/h4 heading split.
import { describe, it, expect } from 'vitest'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { parsePrdTree, parseQuestions, openDecisionTickets, renderPrdReading, PRD_READING_CSS } from '@productune/viewer/lib/prd-reading.mjs'
import { PRD_READING } from '@productune/viewer/lib/labels.mjs'

const PRD = `# PRD: demo

preface line

## Why — 비전

one

## v1.12 — round

round intro

### 이 버전 직전

as-is

### 합격선

- a
- b

### What — 스코프 두 항목

| 항목 key | 티켓 | 무엇이 바뀌나 |
|:--|:--|:--|
| \`alpha\` | T-1 · T-2 | alpha one-liner |
| \`beta\` | T-3 | beta one-liner |

#### alpha — Alpha title

alpha body

\`\`\`
## not a heading
\`\`\`

#### beta — Beta \`code\` title

beta body

### Non-goals

none

### Open Questions

**사용자가 답할 것**

1. first question with \`code\`
2. second question

**설계가 답하고, 화면 승인 때 볼 것**

3. third
4. fourth

**답이 난 것**: done.
`

const deps = {
  md: (t: string) => `<p>${t.trim().replace(/\n+/g, ' ')}</p>`,
  inline: (t: string) => t,
  esc: (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  sameVersion: (a: string, b: string) => a.replace(/^v/, '').split('.').slice(0, 2).join('.') === b.replace(/^v/, '').split('.').slice(0, 2).join('.'),
  ticketPill: (a: string) => `<span class="pill">${a}</span>`,
}
const render = (over: Record<string, unknown> = {}) =>
  renderPrdReading({ body: PRD, currentVersion: 'v1.12', decisionTickets: [], idPrefix: 'prd', deps, ...over }) as string

describe('parsePrdTree', () => {
  it('builds ## / ### / #### levels, ignores headings in code fences, counts non-blank lines incl. descendant headings', () => {
    const t = parsePrdTree(PRD)
    expect(t.title.title).toBe('PRD: demo')
    expect(t.sections.map((s: any) => s.title)).toEqual(['Why — 비전', 'v1.12 — round'])
    const round = t.sections[1]
    expect(round.children.map((c: any) => [c.level, c.title])).toEqual([
      [3, '이 버전 직전'],
      [3, '합격선'],
      [3, 'What — 스코프 두 항목'],
      [3, 'Non-goals'],
      [3, 'Open Questions'],
    ])
    const what = round.children[2]
    expect(what.children.map((c: any) => [c.level, c.title])).toEqual([
      [4, 'alpha — Alpha title'],
      [4, 'beta — Beta `code` title'],
    ])
    expect(what.children[0].ownText).toContain('## not a heading')
    // table 4 rows + 0 text, plus two #### headings, plus their bodies (alpha: 4 incl. fence lines, beta: 1)
    expect(what.lines).toBe(4 + (1 + 4) + (1 + 1))
  })
  it('a level jump hangs the node under the nearest shallower heading', () => {
    const t = parsePrdTree('## v1\n\n#### k — x\n\nbody\n')
    expect(t.sections[0].children[0].level).toBe(4)
  })
})

describe('parseQuestions', () => {
  it('groups by the bold line and numbers like markdown', () => {
    const q = parseQuestions(PRD.slice(PRD.indexOf('**사용자가')))
    expect(q.main.map((x: any) => [x.n, x.text])).toEqual([[1, 'first question with code'], [2, 'second question']])
    expect(q.review.map((x: any) => x.n)).toEqual([3, 4])
  })
})

describe('openDecisionTickets', () => {
  const t = (id: string, type: string, status: string) => ({ frontmatter: { id, slug: `s-${id}`, type, status, assignee: 'user' } })
  it('takes type decision + status open from every bucket, in id order', () => {
    const out = openDecisionTickets({
      included: [t('T-20', 'decision', 'open'), t('T-5', 'impl', 'open'), t('T-7', 'decision', 'done')],
      omitted: [{ tickets: [t('T-3', 'decision', 'open')] }],
    })
    expect(out.map((x: any) => x.id)).toEqual(['T-3', 'T-20'])
  })
})

describe('renderPrdReading', () => {
  it('opens exactly the approved set: open version, 합격선, What, Open Questions', () => {
    const html = render()
    const open = [...html.matchAll(/<details class="pr-sec ([^"]*)" id="([^"]+)" data-open0="1" open>/g)].length
    expect(open).toBe(4)
    expect(html).toMatch(/data-open0="0"><summary><span class="pr-mark mono">##<\/span><span class="pr-t">Why/)
    expect(html).toMatch(/pr-card" id="prd-s\d+" data-open0="0"><summary>/)
  })
  it('outline carries ##, ###, #### marks with hierarchy classes, What badge and card keys', () => {
    const html = render()
    for (const c of ['ol-l2', 'ol-l3', 'ol-l4']) expect(html).toContain(`class="ol ${c}`)
    expect(html).toMatch(/ol-l3 ol-what[^>]*>.*?ol-badge mono">2</)
    expect(html).toContain('<span class="ol-key mono">alpha</span><span class="ol-tk mono">T-1 +1</span>')
  })
  it('What cards show key, title, tickets, one-liner and 「N줄」', () => {
    const html = render()
    expect(html).toContain('<span class="pr-key mono">alpha</span>')
    expect(html).toContain('<span class="pr-tk mono">T-1 · T-2</span>')
    expect(html).toContain('<span class="pr-one">alpha one-liner</span>')
    expect(html).toContain(`<span class="pr-meta mono">${PRD_READING.lineCount(4)}</span>`)
    expect(html).toContain(PRD_READING.cardsHeading(2))
  })
  it('decide box: 남은 질문 first, review questions folded, empty tickets line; count = questions + tickets', () => {
    const html = render()
    expect(html).toContain(`${PRD_READING.decideHeading} <span class="ol-badge mono">2</span>`)
    expect(html).toContain(PRD_READING.noTickets)
    expect(html).toContain(PRD_READING.reviewQuestions(2))
    expect(html).toContain('data-oq="prd-oq-1"')
    const withTicket = render({ decisionTickets: [{ id: 'T-9', slug: 'pick-one', assignee: 'user' }] })
    expect(withTicket).toContain('data-detail-kind="ticket" data-detail-id="T-9"')
    expect(withTicket).toContain(`${PRD_READING.decideHeading} <span class="ol-badge mono">3</span>`)
  })
  it('nothing to decide → the single 지금 정할 것이 없어요 line', () => {
    const html = render({ body: '## v1.12 — r\n\n### Open Questions\n\n**답이 난 것**: all.\n' })
    expect(html).toContain(PRD_READING.noDecide)
    expect(html).not.toContain(PRD_READING.noQuestions)
  })
  it('two copies of the same PRD never share an id', () => {
    const ids = (h: string) => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    const a = ids(render({ idPrefix: 'prd' }))
    const b = ids(render({ idPrefix: 'home-prd' }))
    expect(new Set(a).size).toBe(a.length)
    expect(a.filter((x) => b.includes(x))).toEqual([])
  })
  it('CSS is token-only', () => {
    expect(PRD_READING_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/)
  })
})

describe('generated page', () => {
  const data = {
    poState: { stage: 'build', version: 'v1.12', current_task: null },
    currentVersion: 'v1.12',
    prd: { current: { body: PRD }, closed: [{ name: 'v1.11.md', rel: 'docs/prd/versions/v1.11.md', body: '## v1.11\n\n### Sub\n\n#### Deep\n\nx' }], openItems: [] },
    tickets: {
      included: [{ bucket: 'v1.12', rel: 'docs/tickets/v1.12/T-9.md', frontmatter: { id: 'T-9', slug: 'pick-one', type: 'decision', status: 'open', assignee: 'user' }, body: 'b' }],
      omitted: [],
    },
    wiki: [],
    features: [],
    featureTaxonomy: { areas: [], kinds: [], entries: [] },
    artifacts: { entries: [] },
  }
  it('renders the reading screen in the PRD pane and keeps the script hash-pinned; closed versions stay plain', () => {
    const html = renderPage({ data: data as any, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: 'x' }) as string
    expect(html).toContain('class="pr-wrap"')
    expect(html).toContain('<li id="prd-oq-3">') // numbered like the markdown list (starts at 3)
    expect(html).toContain('<ol start="3">')
    expect(html).toContain('data-detail-kind="ticket" data-detail-id="T-9"')
    expect(html).toContain('function prdClick')
    expect(html).toContain('prdRestoreFolds(RESTORE.folds)')
    expect(html).toContain('<h4 class="pill pill-heading-4">Deep</h4>')
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]
    expect(csp).toContain("default-src 'none'")
    expect(/script-src[^;]*/.exec(csp)![0]).not.toContain('unsafe-inline')
  })
})
