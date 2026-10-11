// T-964 · T-1049: the feature detail draws `taxonomy.guide` — 사용 상황 · 화면 구성 · 동작 방식 ·
// 한계 · 사례 (document headings; `ux[].at` surface map; `flow` mermaid) (approved screen set #screen-feature, T-955), each logic rule with its ground
// ticket at the line end, the new-feature notice when no cell has text, 「사용자 화면 없음」 for
// internal · component kinds (T-1026 ③ ⑤).
import { describe, it, expect } from 'vitest'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { normalizeGuide, collectTickets } from '@productune/viewer/lib/collect.mjs'
import { specTruthCount } from '@productune/viewer/lib/render.mjs'
import { FEATURE } from '@productune/viewer/lib/labels.mjs'
import { MERMAID_RUNTIME } from '@productune/viewer/lib/mermaid.mjs'

const guide = {
  when: ['prdt 를 실행했더니 새 버전 안내가 떴을 때'],
  ux: ['명령보다 먼저 한 번 — `설치됨 v1.12`', '이미 최신이면 한 줄만'],
  logic: [{ text: '하루 첫 실행에서만 확인한다', ground: ['T-393'] }, { text: '근거 없는 규칙' }, '문자열 규칙', { text: '둘 다', ground: 'T-3' }],
  limits: [],
  example: 'v1.12.1 이 나온 날 → `2` 입력',
}
const mk = (key: string, kind: string, g: unknown) => ({ key, name: key, kind, area: 'a', def: '정의.', aliases: [], links: [], guide: normalizeGuide(g) })
function data() {
  return {
    currentVersion: 'v1.13',
    prd: { current: { body: '' }, closed: [] },
    tickets: {
      included: [{ bucket: 'v1.13', rel: 'docs/tickets/v1.13/T-1.md', frontmatter: { id: 'T-1', slug: 'x', status: 'done', feature: 'spec' }, body: '' }, { bucket: 'v1.13', rel: 'docs/tickets/v1.13/T-393.md', frontmatter: { id: 'T-393', slug: 's', status: 'done', feature: 'full' }, body: '' }],
      omitted: [{ bucket: 'v0.5', count: 1, bytes: 1, tickets: [{ rel: 'docs/tickets/v0.5/T-PATCH-147.md', frontmatter: { id: 'T-PATCH-147', slug: 'p', status: 'done', feature: 'full' } }] }],
    },
    wiki: [],
    features: [{ rel: 'docs/features/spec.md', frontmatter: {}, body: '## 지금 참인 것\n### a\n- SPEC BODY LINE\n- b\n### c\n- d\n## 출처\n- x' }],
    featureTaxonomy: {
      areas: [{ key: 'a', name: '영역', def: '' }],
      kinds: [{ key: 'feature', name: '기능', def: '' }, { key: 'internal', name: '제품 외', def: '' }],
      entries: [mk('full', 'feature', guide), mk('empty', 'feature', undefined), mk('spec', 'feature', { when: ['w'], ux: ['u'], logic: ['l'], example: 'e' }), mk('vm2', 'internal', { when: ['w'], ux: ['사용자 화면 없음 — QA 가 쓴다'], logic: ['l'], example: 'e' }), mk('vm', 'internal', { when: ['QA 가 검증할 때'], ux: ['QA 가 화면 대신 쓴다'], logic: ['격리한다'], example: 'e' })],
    },
    artifacts: { entries: [] },
  }
}
const html = (key: string): string => {
  const out = renderPage({ data: data(), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  return JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(out)![1]).feature[key].html
}

describe('feature guide (T-964)', () => {
  it('five sections in order, then related and evidence', () => {
    const h = html('full')
    const order = [FEATURE.guide.when, FEATURE.guide.ux, FEATURE.guide.logic, FEATURE.guide.limits, FEATURE.guide.example, FEATURE.linksHeading, FEATURE.evidenceHeading].map((s) => h.indexOf(`>${s}<`))
    expect(order.every((x) => x >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(h).toContain('<code>설치됨 v1.12</code>')
    expect(h).toContain(FEATURE.limitsNone)
  })
  it('logic: ground ticket linked at the line end; no ground and plain strings still render', () => {
    const h = html('full')
    expect(h).toContain('<li>하루 첫 실행에서만 확인한다<span class="cn-g"><a href="#T-393"><code>T-393</code></a></span></li>')
    expect(h).toContain('<li>근거 없는 규칙</li>')
    expect(h).toContain('<li>문자열 규칙</li>')
    expect(h).toContain('<span class="cn-g"><code>T-3</code></span>')
  })
  it('no guide → the new-feature notice, not the old 「다음에 … 티켓이 채워요」 line', () => {
    const h = html('empty')
    expect(h).toContain(FEATURE.guideEmptyHead)
    expect(h).toContain(FEATURE.guideEmptyDetail)
    expect(h).not.toContain('다음에 이 기능을 건드리는')
    expect(h).not.toContain('fd-sec')
  })
  it('internal kind: 「사용자 화면 없음」 first under 화면 구성, then the guide text; a user-screen kind has no such line', () => {
    expect(html('vm')).toContain('<li>사용자 화면 없음</li><li>QA 가 화면 대신 쓴다</li>')
    expect(html('full')).not.toContain('사용자 화면 없음')
  })
  it('T-PATCH-NNN ground (past bucket) links like T-NNN', () => {
    const d = data()
    d.featureTaxonomy.entries[0].guide = normalizeGuide({ when: ['w'], ux: ['u'], logic: [{ text: 'r', ground: 'T-PATCH-147' }], example: 'e' })
    const out = renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const h = JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(out)![1]).feature.full.html
    expect(h).toContain('<a href="#T-PATCH-147"><code>T-PATCH-147</code></a>')
  })
  it('spec-backed: a collapsed fold right under 동작 방식 (before 한계), 「스펙 파일 · 지금 참인 것 N줄 ›」, then links and 근거 티켓', () => {
    const h = html('spec')
    expect(h).toContain('<details class="fd-spec"><summary class="fd-more">스펙 파일 · 지금 참인 것 3줄 ›</summary>')
    expect(h).not.toContain('<details class="fd-spec" open')
    const at = [`>${FEATURE.guide.logic}<`, 'fd-spec', `>${FEATURE.guide.limits}<`, FEATURE.linksHeading, FEATURE.evidenceHeading].map((x) => h.indexOf(x))
    expect([...at].sort((x, y) => x - y)).toEqual(at)
    expect(at.every((x) => x >= 0)).toBe(true)
    expect(h).toContain('SPEC BODY LINE')
  })
  it('specTruthCount: items under 지금 참인 것 incl. ### subsections, fences ignored, null without the section', () => {
    expect(specTruthCount('## 지금 참인 것\n### a\n- x\n  - y\n### b\n1. z\n```\n- no\n```\n## 출처\n- no')).toBe(3)
    expect(specTruthCount('## 출처\n- a')).toBeNull()
  })
  it('ticket_id: frontmatter (legacy T-PATCH) keys the ticket by that id', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't964-'))
    fs.mkdirSync(path.join(root, 'docs/tickets/v0.5'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs/tickets/v0.5/T-PATCH-147.md'), '---\nticket_id: T-PATCH-147\nversion: v0.5\nslug: p\nstatus: done\n---\nbody\n')
    const t = collectTickets(root, 'v1.13')
    expect(t.omitted[0].tickets[0].frontmatter.id).toBe('T-PATCH-147')
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('「사용자 화면 없음」 once when the first ux line already starts with it', () => {
    expect(html('vm2').split('사용자 화면 없음').length - 1).toBe(1)
  })
  it('normalizeGuide: lenient reads, drops malformed cells, null when empty', () => {
    expect(normalizeGuide({ when: 'w', ux: ['a', 3], logic: [{ text: 't', ground: 'T-1' }, 4], limits: 'l', example: 'e' })).toEqual({ when: ['w'], ux: [{ text: 'a', at: '' }], logic: [{ text: 't', ground: ['T-1'] }], limits: ['l'], example: 'e', flow: '' })
    expect(normalizeGuide({ when: [], ux: '', logic: [], example: '' })).toBeNull()
    expect(normalizeGuide(['x'])).toBeNull()
  })
  it('T-1049 headings: document headings (no pill chip), the six names in order', () => {
    const h = html('full')
    expect(FEATURE.guide).toEqual({ when: '사용 상황', ux: '화면 구성', logic: '동작 방식', limits: '한계', example: '사례' })
    expect(FEATURE.linksHeading).toBe('연관 기능')
    expect(h).toContain('<h2 class="fd-h">사용 상황</h2>')
    expect(h).not.toContain('pill-heading-2')
  })
  it('T-1049 ux `{text, at}`: the surface map numbers the tile an item points at; plain strings still list', () => {
    const d = data()
    d.featureTaxonomy.entries[0].guide = normalizeGuide({ when: ['w'], ux: [{ text: 'PRD 목차', at: 'viewer.prd' }, '표면 없는 줄', { text: '훅 줄', at: 'terminal.hook' }, { text: '모르는 표면', at: 'nowhere.x' }], logic: ['l'], example: 'e' })
    const out = renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const h = JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(out)![1]).feature.full.html
    expect(h).toContain('<div class="fd-sp hit"><span class="fd-bn">1</span>PRD</div>')
    expect(h).toContain('<div class="fd-sp hit"><span class="fd-bn">3</span>훅 안내 줄</div>')
    expect(h).toContain('<li><span class="fd-bn">2</span><span>표면 없는 줄</span></li>')
    expect(h).toContain('<li><span class="fd-bn">4</span><span>모르는 표면</span></li>')
    expect((h.match(/fd-stile hit/g) || []).length).toBe(2)
    expect(html('spec')).not.toContain('fd-smap')
    expect(html('full')).toContain('<ul class="fd-list"><li>명령보다 먼저 한 번')
  })
  it('T-1049 flow: a diagram block under 동작 방식; mermaid ships only when a page has a diagram', () => {
    const d = data()
    d.featureTaxonomy.entries[0].guide = normalizeGuide({ when: ['w'], ux: ['u'], flow: 'flowchart TD\n  A[시작] --> B{분기?}', logic: ['l'], example: 'e' })
    const out = renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const h = JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(out)![1]).feature.full.html
    expect(h).toContain('<div class="fd-flow"><pre class="mm-src" data-mermaid>flowchart TD\n  A[시작] --&gt; B{분기?}</pre><details class="fd-mm">')
    expect(h.indexOf('fd-flow')).toBeGreaterThan(h.indexOf('>동작 방식<'))
    expect(out).toContain('globalThis.mermaid')
    const m = /script-src ([^;]*)/.exec(/Content-Security-Policy" content="([^"]*)"/.exec(out)![1])![1]
    expect(m).toMatch(/'sha256-[^']+' 'sha256-[^']+' 'sha256-[^']+' 'strict-dynamic'/)
    const plain = renderPage({ data: data(), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(plain).not.toContain('globalThis.mermaid')
    expect(plain).not.toContain('mm-fig')
  })
  it('T-1049 mermaid fence in a PRD body becomes a diagram block (page ships mermaid); other fences stay code', () => {
    const d = data()
    d.prd = { current: { body: '## 흐름\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```js\nconst a = 1\n```\n' }, closed: [] }
    const out = renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(out).toContain('<pre class="mm-src" data-mermaid>flowchart LR\n  A --&gt; B</pre>')
    expect(out).toContain('const a = 1')
    expect(out).toContain('globalThis.mermaid')
  })
  it('T-1049 spacing: every guide section carries the same 24px top gap as 연관 기능; the flow has a closed source fold', () => {
    const out = renderPage({ data: data(), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    expect(out).toContain('.detail-doc .fd-sec { margin-top: var(--space-24); }')
    expect(out).toContain('.detail-doc > .fd-sec:first-child { margin-top: 0; }')
    expect(out).toContain('.detail-doc h2.fd-h { font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin: var(--space-24) 0 var(--space-8)')
    expect(out).not.toContain('h2.fd-h:first-child')
    const d = data()
    d.featureTaxonomy.entries[0].guide = normalizeGuide({ when: ['w'], ux: ['u'], flow: 'flowchart TD\n  A --> B', logic: ['l'], example: 'e' })
    const o2 = renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    const h = JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(o2)![1]).feature.full.html
    expect(h).toContain('<details class="fd-mm"><summary>흐름도 원문 (mermaid)</summary><pre class="fd-mm-src">flowchart TD\n  A --&gt; B</pre></details>')
    expect(h).not.toContain('<details class="fd-mm" open')
  })
  it('T-1049: the kind definition line joins name and definition with a colon, no em dash', () => {
    expect(html('full')).toContain('<p class="kind-def">기능: </p>')
    expect(html('full')).not.toContain('기능 — ')
  })
})

describe('T-1078 mermaid labels are SVG text, never HTML', () => {
  it('pins the root htmlLabels (the key mermaid 11 reads) and puts it beyond a diagram directive', () => {
    expect(MERMAID_RUNTIME).toContain("securityLevel:'strict',htmlLabels:false,")
    expect(MERMAID_RUNTIME).toContain("flowchart:{htmlLabels:false,")
    const secure = MERMAID_RUNTIME.match(/secure:\[([^\]]*)\]/)?.[1] ?? ''
    for (const k of ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'htmlLabels', 'flowchart']) expect(secure).toContain(`'${k}'`)
  })
})
