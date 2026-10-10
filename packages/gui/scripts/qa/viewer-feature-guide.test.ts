// T-964: the feature detail draws `taxonomy.guide` — 언제 쓰나 · 어떻게 보이나 · 어떻게 동작하나 ·
// 한계 · 예시 (approved screen set #screen-feature, T-955), each logic rule with its ground
// ticket at the line end, the new-feature notice when no cell has text, 「사용자 화면 없음」 for
// internal · component kinds (T-1026 ③ ⑤).
import { describe, it, expect } from 'vitest'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { normalizeGuide } from '@productune/viewer/lib/collect.mjs'
import { FEATURE } from '@productune/viewer/lib/labels.mjs'

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
      included: [{ bucket: 'v1.13', rel: 'docs/tickets/v1.13/T-393.md', frontmatter: { id: 'T-393', slug: 's', status: 'done', feature: 'full' }, body: '' }],
      omitted: [],
    },
    wiki: [],
    features: [],
    featureTaxonomy: {
      areas: [{ key: 'a', name: '영역', def: '' }],
      kinds: [{ key: 'feature', name: '기능', def: '' }, { key: 'internal', name: '제품 외', def: '' }],
      entries: [mk('full', 'feature', guide), mk('empty', 'feature', undefined), mk('vm', 'internal', { when: ['QA 가 검증할 때'], ux: ['QA 가 화면 대신 쓴다'], logic: ['격리한다'], example: 'e' })],
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
  it('internal kind: 「사용자 화면 없음」 first under 어떻게 보이나, then the guide text; a user-screen kind has no such line', () => {
    expect(html('vm')).toContain('<li>사용자 화면 없음</li><li>QA 가 화면 대신 쓴다</li>')
    expect(html('full')).not.toContain('사용자 화면 없음')
  })
  it('normalizeGuide: lenient reads, drops malformed cells, null when empty', () => {
    expect(normalizeGuide({ when: 'w', ux: ['a', 3], logic: [{ text: 't', ground: 'T-1' }, 4], limits: 'l', example: 'e' })).toEqual({ when: ['w'], ux: ['a'], logic: [{ text: 't', ground: ['T-1'] }], limits: ['l'], example: 'e' })
    expect(normalizeGuide({ when: [], ux: '', logic: [], example: '' })).toBeNull()
    expect(normalizeGuide(['x'])).toBeNull()
  })
})
