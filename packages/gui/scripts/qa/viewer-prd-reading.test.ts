// T-884 (T-860 / T-874): the open PRD's reading screen — outline hierarchy, folds with the approved
// initial open set, the 「결정할 것」 box, What cards with 「N줄」, and the h3/h4 heading split.
import { describe, it, expect } from 'vitest'
import { PRD_READING_SCRIPT } from '@productune/viewer/lib/prd-reading.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { plainInline, parsePrdTree, parseQuestions, openDecisionTickets, renderPrdReading, PRD_READING_CSS } from '@productune/viewer/lib/prd-reading.mjs'
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
    const open = [...html.matchAll(/<details class="pr-sec ([^"]*)" id="([^"]+)" data-fold="[^"]*" data-open0="1" open>/g)].length
    expect(open).toBe(4)
    expect(html).toMatch(/data-open0="0"><summary><span class="pr-mark mono">##<\/span><span class="pr-t">Why/)
    expect(html).toMatch(/pr-card" id="prd-s\d+" data-fold="[^"]*" data-open0="0"><summary>/)
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

describe('plainInline', () => {
  it('keeps _ and * inside code spans, strips emphasis markers outside', () => {
    expect(plainInline('`version_outcome` and **bold** *it* `a*b`')).toBe('version_outcome and bold it a*b')
    expect(plainInline('[`snake_case`](x.md) tail')).toBe('snake_case tail')
  })
  it('outline entries and 「남은 질문」 lines carry the code text intact', () => {
    const body = '## v1.12 — r\n\n### Open Questions\n\n**사용자가 답할 것**\n\n1. pick `version_outcome` now\n\n#### `my_key` — T\n'
    expect(parseQuestions(body.slice(body.indexOf('**사용자가'))).main[0].text).toBe('pick version_outcome now')
    expect(render({ body })).toContain('version_outcome')
    expect(render({ body })).not.toContain('versionoutcome')
  })
})

describe('plainInline — unbackticked underscores (T-884 fix2)', () => {
  it('keeps intraword _ and still strips real emphasis', () => {
    expect(plainInline('Success metrics → version_outcome')).toBe('Success metrics → version_outcome')
    expect(plainInline('feature_name_with_underscores')).toBe('feature_name_with_underscores')
    expect(plainInline('*a* _a_ **b** __c__ x _d e_ y')).toBe('a a b c x d e y')
  })
  it('real heading reads the same in the outline; card with _ key finds its ticket pill', () => {
    const body = '## v1.12 — r\n\n### Success metrics → version_outcome\n\nx\n\n### What — items\n\n| 항목 key | 티켓 | 무엇 |\n|:--|:--|:--|\n| feature_name_with_underscores | T-808 | one |\n\n#### feature_name_with_underscores — Title\n'
    const html = render({ body })
    expect(html).toContain('Success metrics → version_outcome')
    expect(html).not.toContain('versionoutcome')
    expect(html).toMatch(/pr-key mono">feature_name_with_underscores<\/span>/)
    expect(html).toMatch(/pr-tk[^>]*>T-808/)
  })
  it('.pr-key is shrinkable and clipped inside the card (layout rule)', () => {
    expect(PRD_READING_CSS).toMatch(/\.pr-key \{[^}]*flex: 0 1 auto;[^}]*max-width: 100%;[^}]*text-overflow: ellipsis;/)
  })
})

describe('fold identity', () => {
  const foldKeys = (html: string) => [...html.matchAll(/<details [^>]*id="([^"]+)" data-fold="([^"]*)"/g)].map((m) => [m[1], m[2]])
  it('keys by heading path, not by sequence; repeats get ~n', () => {
    const base = foldKeys(render())
    const shifted = foldKeys(render({ body: PRD.replace('## Why', '## Inserted\n\nx\n\n## Why') }))
    const keyOf = (rows: string[][], k: string) => rows.find((r) => r[1] === k)
    expect(keyOf(base, '/v1.12 — round/What — 스코프 두 항목')).toBeTruthy()
    for (const [, k] of base) expect(keyOf(shifted, k)).toBeTruthy()
    expect(keyOf(base, '/Why — 비전')![0]).not.toBe(keyOf(shifted, '/Why — 비전')![0])
    const dup = foldKeys(render({ body: '## v1.12\n\n### A\n\n### A\n' })).map((r) => r[1])
    expect(dup).toEqual(['/v1.12', '/v1.12/A', '/v1.12/A~2'])
  })
})

describe('What-card title width (layout rule; measured in headless chromium by QA/dev, not launchable under the vitest isolation tripwire)', () => {
  it('.pr-t in a card summary is a wrapping flex item with a floor, so chips never crush it', () => {
    expect(PRD_READING_CSS).toMatch(/\.pr-card > summary \.pr-t \{[^}]*flex: 1 1 14em;[^}]*min-width: 10em;/)
    expect(PRD_READING_CSS).toMatch(/\.pr-card > summary \{[^}]*flex-wrap: wrap;/)
  })
  it('.pr-tk may shrink and wrap inside the card (many tickets), every id stays visible', () => {
    const rule = PRD_READING_CSS.match(/\.pr-tk \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/flex: 0 1 auto;/)
    expect(rule).toMatch(/min-width: 0;/)
    expect(rule).toMatch(/max-width: 100%;/)
    expect(rule).toMatch(/white-space: normal;/)
    expect(rule).toMatch(/overflow-wrap: anywhere;/)
    expect(rule).not.toMatch(/flex: 0 0 auto/)
  })
})

describe('fold state script', () => {
  it('saves and restores by data-fold key; unknown keys keep the section default', () => {
    expect(PRD_READING_SCRIPT).toContain("getAttribute('data-fold')")
    expect(PRD_READING_SCRIPT).toContain('hasOwnProperty.call(state, k)')
    // run the restore against a minimal DOM stand-in
    const mk = (fold: string, open: boolean) => ({ id: `prd-s-${fold}`, open, getAttribute: (a: string) => (a === 'data-fold' ? fold : null) })
    const secs = [mk('/A', true), mk('/B', false), mk('/NEW', true)]
    const wrap = { querySelectorAll: (sel: string) => (sel === 'details.pr-sec' ? secs : []) }
    const doc = { querySelectorAll: (sel: string) => (sel === '.pr-wrap' ? [wrap] : secs) }
    const fn = new Function('document', `${PRD_READING_SCRIPT}; function findByAttr(){return null}; return { prdRestoreFolds: prdRestoreFolds, prdFoldState: prdFoldState };`)
    // prdSyncDots needs links; give it none
    const api = fn(Object.assign(doc, {}))
    const saved = { '/A': false, '/B': true }
    api.prdRestoreFolds(saved)
    expect(secs.map((x) => x.open)).toEqual([false, true, true])
    expect(api.prdFoldState()).toEqual({ '/A': false, '/B': true, '/NEW': true })
  })
})
