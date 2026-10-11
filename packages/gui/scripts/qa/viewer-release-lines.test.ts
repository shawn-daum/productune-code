// T-961: the viewer per release line (docs/artifacts/v1.13/release-lines.md
// §6b; screen set docs/artifacts/v1.13/define-screen-set.html
// #screen-home-lines). A project declaring `.prdt/config.json` `lines` gets one
// sidebar section per line in 진행 · PRD · 티켓 · 기능 · 산출물, each line's
// Home scoped to its own tickets; a single-line project renders as before.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { collectAll, collectLineNames, lineState, prdLineBody } from '@productune/viewer/lib/collect.mjs'
import { renderPage, buildAnchors, lineViews, LINE_SECTIONED_STORES, pastTicketDataFiles } from '@productune/viewer/lib/render.mjs'
import { META_ROOT, META_SKIP_REASON } from './meta-root'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })

function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string, o: { status?: string; type?: string; assignee?: string; prd_item?: string; feature?: string } = {}) =>
  `---\nid: ${id}\nslug: slug-${id}\ntype: ${o.type ?? 'impl'}\nstatus: ${o.status ?? 'open'}\nassignee: ${o.assignee ?? 'developer'}\n` +
  `${o.prd_item ? `prd_item: ${o.prd_item}\n` : ''}${o.feature ? `feature: ${o.feature}\n` : ''}---\nbody of ${id}\n`

const PRD = `# PRD — ntf-pm

shared head

## v2.2 — home round

#### home-a — Home item A

## ntf-archive v1.2 — archive round

#### arch-a — Archive item A: detail

#### arch-b — Archive item B
`

let root: string
let data: ReturnType<typeof collectAll>
let html: string
let disciplineRoot: string

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-lines-'))
  disciplineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-lines-disc-'))
  write(root, '.prdt/config.json', JSON.stringify({
    slug: 'ntf-pm',
    lines: [{ name: 'ntf-archive' }, { name: 'ntf-pm' }, { name: 'Bad_Name' }, { name: 'ntf-archive' }],
    features: {
      taxonomy: { areas: [{ key: 'ui', name: '화면' }], kinds: [] },
      vocab: {
        search: { label: '검색', taxonomy: { area: 'ui', kind: '' } },
        login: { label: '로그인', taxonomy: { area: 'ui', kind: '' } },
      },
    },
  }))
  write(root, '.prdt/po-state.json', JSON.stringify({
    schema_version: 1, stage: 'define', version: 'v2.2', current_task: null,
    lines: { 'ntf-archive': { stage: 'build', version: 'v1.2' } },
  }))
  write(root, 'docs/prd/PRD.md', PRD)
  write(root, 'docs/prd/versions/v2.1.md', '## v2.1 — closed home\n')
  write(root, 'docs/prd/versions/ntf-archive/v1.1.md', '## ntf-archive v1.1 — closed archive\n')
  write(root, 'docs/tickets/v2.2/T-101.md', ticket('T-101', { prd_item: 'v2.2#home-a', status: 'done', feature: 'login' }))
  write(root, 'docs/tickets/v2.2/T-102.md', ticket('T-102', { prd_item: 'v2.2#home-a' }))
  write(root, 'docs/tickets/backlog/T-103.md', ticket('T-103'))
  write(root, 'docs/tickets/v2.1/T-104.md', ticket('T-104', { status: 'done' }))
  write(root, 'docs/tickets/ntf-archive/v1.2/T-201.md', ticket('T-201', { prd_item: 'ntf-archive/v1.2#arch-a', status: 'done', feature: 'search' }))
  write(root, 'docs/tickets/ntf-archive/v1.2/T-202.md', ticket('T-202', { prd_item: 'ntf-archive/v1.2#arch-b', feature: 'search' }))
  write(root, 'docs/tickets/ntf-archive/v1.2/T-203.md', ticket('T-203', { type: 'decision', assignee: 'user' }))
  write(root, 'docs/tickets/ntf-archive/backlog/T-204.md', ticket('T-204'))
  write(root, 'docs/tickets/ntf-archive/v1.1/T-205.md', ticket('T-205', { status: 'done' }))
  write(root, 'docs/wiki/decision--arch-sort.md', '---\ntype: decision\nversion: ntf-archive/v1.2\n---\nsort\n')
  write(root, 'docs/wiki/decision--home-x.md', '---\ntype: decision\nversion: v2.2\n---\nx\n')
  write(root, 'docs/artifacts/manifest.json', JSON.stringify({ entries: [
    { bucket: 'v2.2', path: 'home.md', kind: 'doc', status: 'pending' },
    { bucket: 'ntf-archive/v1.2', path: 'arch.md', kind: 'doc', status: 'pending' },
  ] }))
  write(root, 'docs/artifacts/v2.2/home.md', '# home art\n')
  write(root, 'docs/artifacts/ntf-archive/v1.2/arch.md', '# arch art\n')
  data = collectAll(root, { disciplineRoot })
  html = render(data)
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(disciplineRoot, { recursive: true, force: true })
})

/** The sidebar markup of one store section. */
function sidebar(store: string) {
  const sec = html.split(`id="store-${store}"`)[1].split('</section>')[0]
  return sec.split('<nav class="sidebar">')[1].split('</nav>')[0]
}
/** One view pane's markup in one store. */
function pane(store: string, group: string) {
  const sec = html.split(`id="store-${store}"`)[1].split('</section>')[0]
  const start = sec.indexOf(`data-group="${group}"`)
  expect(start).toBeGreaterThan(-1)
  return sec.slice(start).split('<div class="view-pane')[0]
}

describe('past-ticket data files — added line (T-961)', () => {
  it('a line past version gets its own data file named with the line; home buckets keep their bare names', () => {
    const home = pastTicketDataFiles(data.tickets, { prefix: 'viewer' })
    expect(home.map((f: { name: string }) => f.name)).toEqual(['viewer.tickets-v2.1.js'])
    const line = pastTicketDataFiles(data.lines[0].tickets, { prefix: 'viewer', line: 'ntf-archive' })
    expect(line.map((f: { name: string; bucket: string }) => [f.bucket, f.name])).toEqual([['ntf-archive--v1.1', 'viewer.tickets-ntf-archive--v1.1.js']])
    expect(Object.keys(line[0].tickets)).toEqual(['T-205'])
    expect(line[0].tickets['T-205'].path).toBe('docs/tickets/ntf-archive/v1.1/T-205.md')
  })

  it('the page script resolves docs/tickets/<line>/<v>/T-n.md to the <line>--<v> key', () => {
    const withSrc = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', pastTicketSrc: { 'ntf-archive--v1.1': 'x.js', 'v2.1': 'y.js' } })
    expect(withSrc).toContain("parts.splice(2, 2, parts[2] + '--' + parts[3])")
    const single = renderPage({ data: { ...data, lines: [] }, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(single).not.toContain("'--'")
    // the CSP hash names the script actually shipped
    const sha = (t: string) => require('node:crypto').createHash('sha256').update(t, 'utf8').digest('base64')
    const inline = withSrc.split('<script>').map((x: string) => x.split('</script>')[0])
    const csp = /script-src ([^;]*)/.exec(withSrc)![1]
    for (const body of inline.slice(1)) if (body.length > 200) expect(csp).toContain(`'sha256-${sha(body)}'`)
  })
})

describe('collect — release lines (mirrors prdt project_lines / line_state)', () => {
  it('reads config `lines` (legal, unique, not the slug) and po-state `lines.<line>`', () => {
    expect(collectLineNames(root)).toEqual(['ntf-archive'])
    expect(lineState({ lines: { 'ntf-archive': { stage: 'build', version: ' v1.2 ' } } }, 'ntf-archive')).toEqual({ stage: 'build', version: 'v1.2' })
    expect(lineState({}, 'ntf-archive')).toEqual({ stage: '', version: '' })
    expect(data.lines.map((l: { name: string; stage: string; version: string }) => [l.name, l.stage, l.version])).toEqual([['ntf-archive', 'build', 'v1.2']])
  })

  it('the home line no longer reads `docs/tickets/<line>/` as one flat bucket; the line reads its own buckets', () => {
    const buckets = (t: { included: { bucket: string }[]; omitted: { bucket: string }[] }) => [...new Set([...t.included.map((x) => x.bucket), ...t.omitted.map((x) => x.bucket)])].sort()
    expect(buckets(data.tickets)).toEqual(['backlog', 'v2.1', 'v2.2'])
    const arch = data.lines[0].tickets
    expect(buckets(arch)).toEqual(['backlog', 'v1.1', 'v1.2'])
    expect(arch.included.map((t: { rel: string }) => t.rel)).toContain('docs/tickets/ntf-archive/v1.2/T-201.md')
  })

  it('each line reads the shared head + its own `## [<line> ]v…` section; closed rounds from its own versions dir', () => {
    expect(data.prd.openItems.map((i: { key: string }) => i.key)).toEqual(['home-a'])
    expect(data.prd.current.body).toContain('shared head')
    expect(data.prd.current.body).not.toContain('ntf-archive v1.2')
    expect(data.prd.closed.map((c: { rel: string }) => c.rel)).toEqual(['docs/prd/versions/v2.1.md'])
    const arch = data.lines[0].prd
    expect(arch.openItems.map((i: { key: string }) => i.key)).toEqual(['arch-a', 'arch-b'])
    expect(arch.current.body).toContain('shared head')
    expect(arch.current.body).not.toContain('## v2.2')
    expect(arch.closed.map((c: { rel: string }) => c.rel)).toEqual(['docs/prd/versions/ntf-archive/v1.1.md'])
  })

  it('prdLineBody leaves a fenced `## v…` line alone', () => {
    const body = '# t\n## v2.2 — a\n```\n## ntf-archive v9 x\n```\n## ntf-archive v1.2 — b\nB'
    expect(prdLineBody(body, null, ['ntf-archive'])).toBe('# t\n## v2.2 — a\n```\n## ntf-archive v9 x\n```')
  })
})

describe('render — one sidebar section per line', () => {
  it('the activity bar is unchanged', () => {
    const one = render({ ...data, lines: [] })
    const bar = (h: string) => h.split('<nav class="activity">')[1].split('</nav>')[0]
    expect(bar(html)).toBe(bar(one))
  })

  it('진행 · PRD · 티켓 · 기능 · 산출물 sidebars head a section per line, home line first, with its stage', () => {
    expect(LINE_SECTIONED_STORES).toEqual(['home', 'prd', 'ticket', 'feature', 'artifact'])
    for (const store of LINE_SECTIONED_STORES) {
      const heads = [...sidebar(store).matchAll(/<div class="ls-h"><b>([^<]*)<\/b><span class="ls-st">([^<]*)<\/span><\/div>/g)].map((m) => `${m[1]}|${m[2]}`)
      expect(heads, store).toEqual(['ntf-pm v2.2|define', 'ntf-archive v1.2|build'])
    }
  })

  it('용어 · 규율 · 위키 · 릴리스 노트 sidebars carry no line section', () => {
    for (const store of ['wiki', 'glossary', 'release', 'disc']) expect(sidebar(store), store).not.toContain('ls-h')
  })

  it("each line's 진행 상황 is the Home blocks scoped to that line's tickets", () => {
    const home = pane('home', 'progress')
    expect(home).toContain('title="T-101"')
    expect(home).not.toContain('title="T-201"')
    expect(home).toContain('티켓 완료 1/2')
    const arch = pane('home', 'ntf-archive/progress')
    expect(arch).toContain('title="T-201"')
    expect(arch).toContain('title="T-202"')
    expect(arch).not.toContain('title="T-101"')
    expect(arch).toContain('티켓 완료 1/3')
    // scope rows from that line's own PRD section
    expect(arch).toContain('Archive item A')
    expect(arch).not.toContain('Home item A')
    // waits: the line's own user decision
    expect(arch).toContain('data-detail-id="T-203"')
    expect(home).not.toContain('data-detail-id="T-203"')
    // the stage bar marks that line's stage
    expect(arch).toMatch(/sb-lab-cur">build/)
    expect(home).toMatch(/sb-lab-cur">define/)
  })

  it("each line's Home groups list that line's artifacts, PRD section, tickets and decisions", () => {
    expect(pane('home', 'ntf-archive/artifact')).toContain('arch.md')
    expect(pane('home', 'artifact')).toContain('home.md')
    expect(pane('home', 'artifact')).not.toContain('arch.md')
    expect(pane('home', 'ntf-archive/ticket')).toContain('T-202')
    expect(pane('home', 'ntf-archive/decision')).toContain('decision--arch-sort')
    expect(pane('home', 'decision')).not.toContain('decision--arch-sort')
    expect(pane('home', 'ntf-archive/prd')).toContain('archive round')
  })

  it('ticket · PRD · artifact stores group by line, keys prefixed `<line>/` (artifact buckets already are)', () => {
    expect(pane('ticket', 'ntf-archive/v1.2')).toContain('T-201')
    expect(pane('ticket', 'ntf-archive/backlog')).toContain('T-204')
    expect(pane('ticket', 'ntf-archive/v1.1')).toContain('T-205')
    expect(pane('ticket', 'v2.2')).not.toContain('T-201')
    expect(pane('prd', 'ntf-archive/v1.1')).toContain('closed archive')
    expect(pane('prd', 'ntf-archive/open')).toContain('archive round')
    expect(pane('artifact', 'ntf-archive/v1.2')).toContain('arch.md')
  })

  it("an added line's 기능 section lists the features its own tickets carry, counted on that line", () => {
    const arch = pane('feature', 'ntf-archive/all')
    expect(arch).toContain('data-detail-id="ntf-archive/search"')
    expect(arch).not.toContain('ntf-archive/login')
    expect(pane('feature', 'all')).toContain('data-detail-id="login"')
  })

  it('deep links and breadcrumbs name the line', () => {
    const anchors = buildAnchors(data)
    expect(anchors['T-202']).toEqual({ s: 'home', g: 'ntf-archive/ticket', k: 'ticket', i: 'T-202' })
    expect(anchors['T-204']).toEqual({ s: 'ticket', g: 'ntf-archive/backlog', k: 'ticket', i: 'T-204' })
    expect(anchors['T-205']).toEqual({ s: 'ticket', g: 'ntf-archive/v1.1', k: 'ticket', i: 'T-205' })
    expect(anchors['docs/prd/versions/ntf-archive/v1.1.md']).toEqual({ s: 'prd', g: 'ntf-archive/v1.1' })
    expect(html).toContain('data-crumb="ntf-archive v1.2 · 진행 상황"')
    // every DOM id stays unique (two dependency diagrams, two PRD readings)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    expect(ids.length).toBe(new Set(ids).size)
  })

  it("added lines' tickets open in the detail panel", () => {
    const blob = JSON.parse(html.split('<script id="detail-data" type="application/json">')[1].split('</script>')[0])
    expect(Object.keys(blob.ticket)).toEqual(expect.arrayContaining(['T-101', 'T-201', 'T-204', 'T-205']))
    expect(blob.ticket['T-201'].path).toBe('docs/tickets/ntf-archive/v1.2/T-201.md')
    expect(blob.feature['ntf-archive/search']).toBeTruthy()
    expect(blob.maxTicket).toBe(205)
  })
})

describe('multi-line project without features.taxonomy (T-961)', () => {
  let h: string
  const sec = (store: string) => h.split(`id="store-${store}"`)[1].split('</section>')[0]
  const paneOf = (store: string, group: string) => { const x = sec(store); return x.slice(x.indexOf(`data-group="${group}"`)).split('<div class="view-pane')[0] }
  beforeAll(() => {
    h = render({ ...data, featureTaxonomy: null })
  })
  it('기능 keeps one section per line, headed `<line> <version>`, each listing the features its own tickets carry', () => {
    const heads = [...sec('feature').matchAll(/<div class="ls-h"><b>([^<]*)<\/b>/g)].map((m) => m[1])
    expect(heads).toEqual(['ntf-pm v2.2', 'ntf-archive v1.2'])
    expect(paneOf('feature', 'all')).toContain('data-detail-id="login"')
    expect(paneOf('feature', 'all')).not.toContain('search')
    expect(paneOf('feature', 'ntf-archive/all')).toContain('data-detail-id="ntf-archive/search"')
    expect(paneOf('feature', 'ntf-archive/all')).not.toContain('login')
    const blob = JSON.parse(h.split('<script id="detail-data" type="application/json">')[1].split('</script>')[0])
    expect(blob.feature['ntf-archive/search'].html).toContain('T-202')
  })
  it('Home waits read blockers across lines; the detail panel stops short of the waits column', () => {
    const t = (x: typeof data.tickets) => x
    const extra = { ...data, featureTaxonomy: null, tickets: t({ ...data.tickets, included: [...data.tickets.included, { rel: 'docs/tickets/v2.2/T-720.md', bucket: 'v2.2', frontmatter: { id: 'T-720', slug: 's', type: 'ops', status: 'open', assignee: 'user', deps: ['T-202'] }, body: '' }, { rel: 'docs/tickets/v2.2/T-721.md', bucket: 'v2.2', frontmatter: { id: 'T-721', slug: 's', type: 'ops', status: 'open', assignee: 'user', deps: [] }, body: '' }] }) }
    const out = render(extra)
    const home = out.split('id="store-home"')[1].split('</section>')[0]
    const homeProgress = home.slice(home.indexOf('data-group="progress"')).split('<div class="view-pane')[0]
    const waits = homeProgress.split('class="sc-waits"')[1].split('class="cp-h">스코프')[0]
    expect(waits).toContain('data-detail-id="T-721"')
    expect(waits).not.toContain('data-detail-id="T-720"')
    expect(out).toContain('.store-section[data-store="home"]:has(.view-pane.active .sc-waits) .detail-panel { width: min(820px, 92%, max(520px, calc(100% - 360px))); }')
  })
})

describe('multi-line project without features.taxonomy — docs/features specs (T-1075)', () => {
  let h: string
  const sec = (store: string) => h.split(`id="store-${store}"`)[1].split('</section>')[0]
  const paneOf = (store: string, group: string) => { const x = sec(store); return x.slice(x.indexOf(`data-group="${group}"`)).split('<div class="view-pane')[0] }
  const spec = (key: string, body: string) => ({ rel: `docs/features/${key}.md`, frontmatter: { feature: key, title: `${key} spec`, status: 'live' }, body })
  beforeAll(() => {
    h = render({ ...data, featureTaxonomy: null, features: [spec('login', '## 지금 참인 것\n\n- LOGIN-SPEC-BODY\n'), spec('export', 'EXPORT-SPEC-BODY\n')] })
  })
  it('the home line lists every spec, a spec no ticket carries included; an added line lists only its own tickets\' features', () => {
    expect(paneOf('feature', 'all')).toContain('data-detail-id="login"')
    expect(paneOf('feature', 'all')).toContain('data-detail-id="export"')
    expect(paneOf('feature', 'ntf-archive/all')).not.toContain('export')
  })
  it('each spec body renders in its feature detail', () => {
    const blob = JSON.parse(h.split('<script id="detail-data" type="application/json">')[1].split('</script>')[0])
    expect(blob.feature.login.html).toContain('LOGIN-SPEC-BODY')
    expect(blob.feature.export.html).toContain('EXPORT-SPEC-BODY')
    expect(blob.feature['ntf-archive/search'].html).not.toContain('SPEC-BODY')
  })
})

describe('single-line project — no section heads, unchanged output', () => {
  it('lineViews is empty and no line markup, CSS or script appears', () => {
    const one = { ...data, lines: [] }
    expect(lineViews(one)).toEqual([])
    const h = render(one)
    expect(h).not.toContain('class="ls-h"')
    expect(h).not.toContain('data-crumb=')
    expect(h).not.toContain('.ls-h {')
  })

  it.skipIf(!META_ROOT)(`real productune corpus: no lines, and the lines path is inert (${META_SKIP_REASON ?? 'meta root found'})`, () => {
    const real = collectAll(META_ROOT!)
    expect(real.lines).toEqual([])
    const a = render(real)
    const { lines: _drop, ...noKey } = real
    expect(a).toBe(render(noKey))
    expect(a).not.toContain('class="ls-h"')
  })
})
