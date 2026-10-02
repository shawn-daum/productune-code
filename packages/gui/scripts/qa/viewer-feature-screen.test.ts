// T-882: the feature screen (approved T-808 mockup
// docs/artifacts/v1.12/feature-screen.html) — sidebar 「전체」 + areas with
// counts, a 이름 · 종류 · 정의 · 티켓 table, a detail whose order is
// definition → meta → 「함께 쓰는 기능」 → spec body or 근거 티켓, a
// one-sided link shown name-only on the other side, ticket counts and
// 근거 티켓 computed from tickets (every bucket, aliases folded) with ticket
// ids linking to the ticket detail, and the empty state with no taxonomy.
import { describe, it, expect } from 'vitest'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { FEATURE } from '@productune/viewer/lib/labels.mjs'

const taxonomy = {
  areas: [
    { key: 'start', name: '시작 · 설치', def: '설치하는 일.' },
    { key: 'see', name: '화면(UI)', def: '보는 화면.' },
  ],
  kinds: [
    { key: 'feature', name: '기능', def: '사용자가 할 수 있게 되는 일.' },
    { key: 'component', name: '컴포넌트', def: '코드의 한 부분.' },
  ],
  entries: [
    { key: 'install-cli', name: '설치', kind: 'feature', area: 'start', def: '설치할 수 있다.', aliases: ['installer'],
      links: [{ to: 'viewer', text: '설치가 뷰어를 연다', ground: '티켓 근거 · T-2' }] },
    { key: 'viewer', name: '뷰어', kind: 'feature', area: 'see', def: '읽을 수 있다.', aliases: [], links: [] },
    { key: 'gui', name: '데스크톱 앱', kind: 'component', area: 'see', def: '앱.', aliases: [], links: [] },
  ],
}

function data(withTaxonomy = true) {
  return {
    currentVersion: 'v1.12',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [
        { bucket: 'v1.12', rel: 'docs/tickets/v1.12/T-3.md', frontmatter: { id: 'T-3', slug: 'now-open', status: 'open', feature: 'install-cli' }, body: '' },
        { bucket: 'backlog', rel: 'docs/tickets/backlog/T-4.md', frontmatter: { id: 'T-4', slug: 'later', status: 'dropped', feature: 'installer' }, body: '' },
      ],
      omitted: [
        { bucket: 'v1.1', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.1/T-2.md', frontmatter: { id: 'T-2', slug: 'first', status: 'done', feature: 'install-cli' } }] },
        { bucket: 'v1.10', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v1.10/T-5.md', frontmatter: { id: 'T-5', slug: 'v', status: 'done', feature: 'viewer' } }] },
      ],
    },
    wiki: [],
    features: [{ rel: 'docs/features/viewer.md', frontmatter: {}, body: 'SPEC BODY LINE' }],
    featureTaxonomy: withTaxonomy ? taxonomy : null,
    artifacts: { entries: [] },
  }
}

const render = (d: unknown) => renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function detailData(html: string): any {
  const m = /<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(html)
  return JSON.parse(m![1])
}
function featureSection(html: string): string {
  const i = html.indexOf('<section class="store-section" data-store="feature"')
  return html.slice(i, html.indexOf('</section>', i))
}

describe('feature screen (T-882)', () => {
  it('sidebar: 「전체」 first with the total, then each area in taxonomy order with its count', () => {
    const sec = featureSection(render(data()))
    const btns = [...sec.matchAll(/data-group-select="([^"]+)"><span>([^<]+)<\/span><span class="nav-item-count">(\d+)/g)].map((m) => [m[1], m[2], m[3]])
    expect(btns).toEqual([['all', '전체', '3'], ['start', '시작 · 설치', '1'], ['see', '화면(UI)', '2']])
    expect(sec).toContain('기능 · <span class="js-group-label">전체</span>')
  })

  it('table: approved headers, area header rows, kind chip, definition, ticket count from tickets', () => {
    const sec = featureSection(render(data()))
    expect(sec).toContain('<th>이름</th><th>종류</th><th>정의</th><th class="num-col">티켓</th>')
    expect(sec).toContain('<span class="count-badge">기능 <b>3</b>개</span>')
    expect(sec).toContain('<span class="grp-name">시작 · 설치</span><span class="grp-n">1</span>')
    // install-cli: T-2 (closed round) + T-3 (current) + T-4 (alias 'installer', backlog) = 3
    expect(sec).toMatch(/data-detail-id="install-cli" tabindex="0"><td><span class="nm">설치<\/span><span class="nm-key">install-cli<\/span><\/td><td><span class="kp kp-feature">기능<\/span><\/td><td class="def-col">설치할 수 있다\.<\/td><td class="num-col">3<\/td>/)
    expect(sec).toContain('<span class="kp kp-component">컴포넌트</span>')
  })

  it('detail order: definition, meta (종류 · 영역 · 티켓 · 버전), kind definition, 「함께 쓰는 기능」, then 근거 티켓 with ticket links', () => {
    const e = detailData(render(data())).feature['install-cli']
    expect(e.title).toBe('설치 · install-cli')
    const h: string = e.html
    const order = ['def-lead', '>종류<', '>영역<', '>티켓<', '>버전<', 'kind-def', FEATURE.linksHeading, FEATURE.evidenceHeading]
    const at = order.map((s) => h.indexOf(s))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(h).toContain('3건 · 완료 1 · 열림 1 · 취소 1')
    expect(h).toContain('v1.1 · v1.12 · backlog')
    expect(h).toContain('data-feature-area="start"')
    expect(h).toContain('<a href="#T-2"><code>T-2</code></a> first')
    expect(h).toContain('<a href="#T-3"><code>T-3</code></a>(열림) now-open')
    expect(h).toContain('<span class="cn-t">설치가 뷰어를 연다</span><span class="cn-g">티켓 근거 · <a href="#T-2"><code>T-2</code></a></span>')
  })

  it('T-904 A: a feature with 0 evidence tickets says 「근거 티켓이 아직 없어요.」 as cn-empty, not a dash', () => {
    const h: string = detailData(render(data())).feature.gui.html
    expect(h).toContain(FEATURE.evidenceHeading)
    expect(h).toContain('<p class="cn-empty">근거 티켓이 아직 없어요.</p>')
    expect(h).not.toContain('<p class="ev-text">—</p>')
  })

  it('a link written on one side shows on the other side name-only; a spec file replaces 근거 티켓 with its body', () => {
    const v: string = detailData(render(data())).feature.viewer.html
    expect(v).toContain('<button type="button" class="cn-a" data-feature-go="install-cli">설치</button><span class="kp kp-feature">기능</span></span><span></span></li>')
    expect(v).toContain(FEATURE.specHeading)
    expect(v).toContain('SPEC BODY LINE')
    expect(v).not.toContain(FEATURE.evidenceHeading)
  })

  it('no link at all → the approved one-line note', () => {
    expect(detailData(render(data())).feature.gui.html).toContain(`<p class="cn-empty">${FEATURE.linksEmpty}</p>`)
  })

  it('a spec file path anchors to its taxonomy entry', () => {
    expect(detailData(render(data())).anchors['docs/features/viewer.md']).toEqual({ s: 'feature', g: 'all', k: 'feature', i: 'viewer' })
  })

  it('no taxonomy and no spec file → one empty group, the approved two-line empty note, crumb 「기능」', () => {
    const d = data(false)
    d.features = []
    const sec = featureSection(render(d))
    expect(sec).toContain('그룹 없음 · 전체 0개')
    expect(sec).toContain(`<p class="v-note">${FEATURE.empty}</p>`)
    expect(sec).toContain('<span class="topstrip-crumb"><b>기능</b></span>')
    expect(detailData(render(d)).feature).toEqual({})
  })

  it('no taxonomy, spec files present (T-901 = B) → the pre-T-882 spec-file list, not the empty screen', () => {
    const d = data(false)
    d.features = [{ rel: 'docs/features/viewer.md', frontmatter: { feature: 'viewer', title: '뷰어 스펙', status: 'live', spec_since: 'v1.2' }, body: 'SPEC BODY LINE' }]
    const html = render(d)
    const sec = featureSection(html)
    expect(sec).not.toContain(FEATURE.empty)
    expect(sec).toContain('<th>기능</th><th>제목</th><th>상태</th><th>시작 버전</th>')
    expect(sec).toContain('<span class="count-badge">기능 · <b>1</b>개</span>')
    expect(sec).toContain('data-detail-kind="feature" data-detail-id="viewer.md"')
    expect(sec).toContain('뷰어 스펙')
    expect(sec).toContain('유효')
    const e = detailData(html).feature['viewer.md']
    expect(e.title).toBe('뷰어 스펙')
    expect(e.body).toContain('SPEC BODY LINE')
  })

  it('no taxonomy: a docs/features/<x>.md link anchors to that spec (not the home redirect)', () => {
    const d = data(false)
    d.features = [{ rel: 'docs/features/viewer.md', frontmatter: {}, body: 'b' }]
    expect(detailData(render(d)).anchors['docs/features/viewer.md']).toEqual({ s: 'feature', g: 'all', k: 'feature', i: 'viewer.md' })
  })
})
