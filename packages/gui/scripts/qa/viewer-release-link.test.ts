// T-1303: a viewer link straight to the release notes (and to one version's
// section), and the release-notes view numbering its lines group-line (`2-3`),
// the same shape as a T-1302 approval body (decision T-1316 = A;
// contracts/tickets.md: group `**<g>. <heading>**`, line `<g>-<n>.`).
import { describe, it, expect } from 'vitest'
import { renderPage, buildAnchors, numberReleaseBody, RELEASES_ANCHOR } from '@productune/viewer/lib/render.mjs'
import { parseReleases, RELEASES_REL } from '@productune/viewer/lib/collect.mjs'

const RELEASES_MD = `# Releases

> preamble

## v1.16 — 뷰어 (2026-11-02)

> 노트 줄.

요약

- 첫째 줄
- 둘째 줄
  이어지는 줄

뷰어

- 뷰어 줄 하나
lazy 이어짐

## v1.11.1 — 옛 형식 (2026-09-30)

### Added
- **새 기능.**

### Fixed
- 고침.
\`\`\`
- fenced item
\`\`\`
`

function data() {
  return {
    currentVersion: 'v1.16',
    prd: { current: { body: '' }, closed: [] },
    tickets: { included: [], omitted: [] },
    wiki: [],
    features: [],
    artifacts: { entries: [] },
    releases: parseReleases(RELEASES_MD),
  }
}
const render = (d: unknown) => renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function detailData(html: string): any {
  const m = /<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(html)
  return JSON.parse(m![1])
}

describe('numberReleaseBody (T-1303 · T-1316)', () => {
  it('label groups: **g. label**, items g-n., continuation lines untouched', () => {
    const body = parseReleases(RELEASES_MD)[0].body.replace(/^>.*\n+/, '')
    expect(numberReleaseBody(body).split('\n')).toEqual([
      '**1. 요약**',
      '',
      '- 1-1. 첫째 줄',
      '- 1-2. 둘째 줄',
      '  이어지는 줄',
      '',
      '**2. 뷰어**',
      '',
      '- 2-1. 뷰어 줄 하나',
      'lazy 이어짐',
    ])
  })

  it('### groups number their heading; fenced lines stay as written', () => {
    const out = numberReleaseBody(parseReleases(RELEASES_MD)[1].body)
    expect(out).toContain('### 1. Added\n- 1-1. **새 기능.**')
    expect(out).toContain('### 2. Fixed\n- 2-1. 고침.')
    expect(out).toContain('```\n- fenced item\n```')
  })

  it('an item before any group label keeps no number', () => {
    expect(numberReleaseBody('- loose\n\n라벨\n\n- a')).toBe('- loose\n\n**1. 라벨**\n\n- 1-1. a')
  })
})

describe('release-notes view shows the numbers (T-1316)', () => {
  it('detail html carries group and line numbers', () => {
    const h: string = detailData(render(data())).release['v1.16'].html
    expect(h).toContain('<strong>1. 요약</strong>')
    expect(h).toContain('<li>1-2. 둘째 줄')
    expect(h).toContain('<li>2-1. 뷰어 줄 하나')
    expect(h).toContain('<div class="v-note">노트 줄.</div>')
    const old: string = detailData(render(data())).release['v1.11.1'].html
    expect(old).toContain('<h3 class="pill pill-heading-2">1. Added</h3>')
  })
})

describe('anchors for the release-notes view (T-1303)', () => {
  it('the RELEASES.md path opens the view; path#version opens that section', () => {
    expect(RELEASES_ANCHOR).toBe(RELEASES_REL)
    const a = buildAnchors(data())
    expect(a['code/docs/RELEASES.md']).toEqual({ s: 'release', g: 'all' })
    expect(a['code/docs/RELEASES.md#v1.16']).toEqual({ s: 'release', g: 'all', k: 'release', i: 'v1.16' })
    expect(a['code/docs/RELEASES.md#v1.11.1']).toEqual({ s: 'release', g: 'all', k: 'release', i: 'v1.11.1' })
    expect(a['code/docs/RELEASES.md#v9.9']).toBeUndefined()
  })

  it('the release store has the group the anchor names', () => {
    const html = render(data())
    const i = html.indexOf('<section class="store-section" data-store="release"')
    expect(html.slice(i, html.indexOf('</section>', i))).toContain('data-group="all"')
  })
})
