// T-883: the 용어 사전 and 릴리즈 노트 screens (approved mockup
// docs/artifacts/v1.12/define-screen-set.html) and the 「읽기」 field on a
// feature's detail that opens them. Release notes come from
// `code/docs/RELEASES.md` (collect.mjs `collectReleases`).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { collectReleases, parseReleases } from '@productune/viewer/lib/collect.mjs'

const RELEASES_MD = `# Releases

> **Format** — preamble, ignored.

## v1.11.1 — 결정 티켓 · 링크 (2026-09-30)

> 패치 릴리스입니다. T-810 을 반영합니다.
> 적용: \`prdt update\`

### Added
- **새 기능입니다.** (T-838)

### Fixed
- 고쳤습니다. [밖](../../../etc/passwd) [안](docs/x.md)

## v1.0 — prdt core (2026-07-03)

### Added
- 처음.
\`\`\`
## not a heading
\`\`\`

## v0.5
text
`

const taxonomy = {
  areas: [{ key: 'plan', name: '기획 · 기록', def: '문서.' }],
  kinds: [{ key: 'feature', name: '기능', def: '할 수 있는 일.' }],
  entries: [
    { key: 'glossary', name: '용어 사전', kind: 'feature', area: 'plan', def: '용어를 찾는다.', aliases: [], links: [] },
    { key: 'release-notes', name: '릴리즈 노트', kind: 'feature', area: 'plan', def: '변경을 읽는다.', aliases: [], links: [] },
    { key: 'wiki', name: '위키', kind: 'feature', area: 'plan', def: '쌓는다.', aliases: [], links: [] },
  ],
}

const term = (name: string, gloss: string, tag: string, def: string) => ({
  rel: `docs/wiki/term--${name}.md`,
  frontmatter: { title: `${name} (${gloss})`, type: 'term', status: 'live', tags: [tag] },
  body: `# ${name} — ${def}\n\n분류: **${tag}**.\n\n- 항목 [[term--other]] 과 \`code\`\n`,
})

function data(opts: { terms?: boolean; releases?: boolean } = {}) {
  const { terms = true, releases = true } = opts
  return {
    currentVersion: 'v1.12',
    prd: { current: { body: '' }, closed: [] },
    tickets: { included: [], omitted: [] },
    wiki: [
      ...(terms ? [term('dispatch', 'PO → 작업 위임', 'concept', '위임'), term('persona', '에이전트 역할', 'entity', '역할')] : []),
      { rel: 'docs/wiki/fact--x.md', frontmatter: { title: 'x', type: 'fact', status: 'live' }, body: 'x' },
    ],
    features: [],
    featureTaxonomy: taxonomy,
    artifacts: { entries: [] },
    releases: releases ? parseReleases(RELEASES_MD) : [],
  }
}

const render = (d: unknown) => renderPage({ data: d, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function detailData(html: string): any {
  const m = /<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(html)
  return JSON.parse(m![1])
}
function section(html: string, store: string): string {
  const i = html.indexOf(`<section class="store-section" data-store="${store}"`)
  return html.slice(i, html.indexOf('</section>', i))
}

describe('activity bar (T-880 = A)', () => {
  it('lists the stores in the decided order with 용어 사전 and 릴리즈 노트 after 아티팩트 and 규율 last', () => {
    const html = render(data())
    const nav = html.slice(html.indexOf('<nav class="activity">'), html.indexOf('</nav>'))
    const keys = [...nav.matchAll(/data-store="([^"]+)" title="([^"]+)"/g)].map((m) => m[1])
    expect(keys).toEqual(['home', 'prd', 'ticket', 'wiki', 'feature', 'artifact', 'glossary', 'release', 'disc'])
    expect(nav).toContain('title="용어 사전" aria-label="용어 사전"')
    expect(nav).toContain('title="릴리즈 노트" aria-label="릴리즈 노트"')
  })
})

describe('용어 사전 (T-883)', () => {
  it('sidebar 「그룹 없음 · 전체 N개」, count badge 「용어 N개」, table 용어 · 분류 · 정의', () => {
    const sec = section(render(data()), 'glossary')
    expect(sec).toContain('그룹 없음 · 전체 2개')
    expect(sec).toContain('<span class="count-badge">용어 <b>2</b>개</span>')
    expect(sec).toContain('<th>용어</th><th>분류</th><th>정의</th>')
    expect(sec).toContain('<td><span class="nm">dispatch</span><span class="nm-gloss">PO → 작업 위임</span></td><td><span class="kp kp-component">concept</span></td><td class="def-col">위임</td>')
    expect(sec).toContain('<span class="topstrip-crumb"><b>용어 사전</b></span>')
    expect(sec).not.toContain('fact--x')
  })

  it('detail: title 용어 · 설명, lead, 분류 · 상태 fields, body without its h1', () => {
    const e = detailData(render(data())).glossary.dispatch
    expect(e.title).toBe('dispatch · PO → 작업 위임')
    expect(e.html).toContain('<p class="def-lead">dispatch — 위임</p>')
    expect(e.html).toContain('>분류<')
    expect(e.html).toContain('>상태<')
    expect(e.html).toContain('유효')
    expect(e.html).toContain('<code>code</code>')
    expect(e.html).not.toContain('<h1')
  })

  it('no term document → the approved two-line empty note', () => {
    const sec = section(render(data({ terms: false })), 'glossary')
    expect(sec).toContain('그룹 없음 · 전체 0개')
    expect(sec).toContain('<span style="font-size:11px;">위키에 용어(term) 문서가 생기면 여기 나타나요.</span>')
    expect(sec).toContain('용어 문서가 없어요.')
    expect(detailData(render(data({ terms: false }))).glossary).toEqual({})
  })
})

describe('릴리즈 노트 (T-883)', () => {
  it('table 버전 · 제목 · 날짜 with one row per version section, newest first as written', () => {
    const sec = section(render(data()), 'release')
    expect(sec).toContain('그룹 없음 · 전체 3개')
    expect(sec).toContain('<span class="count-badge">릴리즈 노트 <b>3</b>개</span>')
    expect(sec).toContain('<th>버전</th><th>제목</th><th class="num-col">날짜</th>')
    expect(sec).toContain('<td class="id-col ver">v1.11.1</td><td class="def-col t-title">결정 티켓 · 링크</td><td class="num-col">2026-09-30</td>')
    expect([...sec.matchAll(/data-detail-id="([^"]+)"/g)].map((m) => m[1])).toEqual(['v1.11.1', 'v1.0', 'v0.5'])
    expect(sec).toContain('<td class="num-col">—</td>')
  })

  it('detail: 버전 · 날짜, the opening note as a note box, ### groups as heading pills', () => {
    const e = detailData(render(data())).release['v1.11.1']
    expect(e.title).toBe('v1.11.1 · 결정 티켓 · 링크')
    expect(e.html).toContain('<span class="detail-field-value ver">v1.11.1</span>')
    expect(e.html).toContain('>날짜<')
    expect(e.html).toContain('<div class="v-note">패치 릴리스입니다. T-810 을 반영합니다.<br>적용: <code>prdt update</code></div>')
    expect(e.html).toContain('<h3 class="pill pill-heading-2">Added</h3>')
    expect(e.html).toContain('<strong>새 기능입니다.</strong>')
  })

  it('a fenced "## " line is not a section; a version with no title or date still lists', () => {
    const r = parseReleases(RELEASES_MD)
    expect(r.map((x) => x.version)).toEqual(['v1.11.1', 'v1.0', 'v0.5'])
    expect(r[1].body).toContain('## not a heading')
    expect(r[2]).toMatchObject({ title: '', date: '', body: 'text' })
  })

  it('a link leaving the repo stays plain text, one inside stays a link', () => {
    const h: string = detailData(render(data())).release['v1.11.1'].html
    expect(h).not.toContain('etc/passwd"')
    expect(h).toContain('code/docs/docs/x.md')
    expect(h).toContain('고쳤습니다. 밖 <a')
  })

  it('no release section → the approved two-line empty note', () => {
    const sec = section(render(data({ releases: false })), 'release')
    expect(sec).toContain('그룹 없음 · 전체 0개')
    expect(sec).toContain('릴리즈 노트가 없어요.')
    expect(sec).toContain('릴리즈 노트 파일에 버전 절이 생기면 여기 나타나요.')
  })

  it('a page built without a releases list at all renders the empty state', () => {
    const d: any = data()
    delete d.releases
    expect(section(render(d), 'release')).toContain('릴리즈 노트가 없어요.')
  })
})

describe('기능 상세 「읽기」 칸 (T-883)', () => {
  it('on 용어 사전 and 릴리즈 노트 only, after 버전, with the approved values and the store to open', () => {
    const f = detailData(render(data())).feature
    expect(f.glossary.html).toContain('<span class="detail-field-label">읽기</span><span class="detail-field-value"><button type="button" class="area-a read-link" data-open-store="glossary">용어 사전 · 2개</button>')
    expect(f['release-notes'].html).toContain('data-open-store="release">릴리즈 노트 · 3개</button>')
    expect(f.wiki.html).not.toContain('읽기')
  })

  it('the interaction script opens the named store on click', () => {
    const html = render(data())
    expect(html).toContain("ev.target.closest('[data-open-store]')")
  })
})

describe('collectReleases — read path and containment (T-883)', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rel-'))
  it('reads code/docs/RELEASES.md under the repo root', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'code/docs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'code/docs/RELEASES.md'), RELEASES_MD)
    expect(collectReleases(root).map((r) => r.version)).toEqual(['v1.11.1', 'v1.0', 'v0.5'])
  })
  it('missing file → empty list', () => {
    expect(collectReleases(tmp())).toEqual([])
  })
  it('a symlinked RELEASES.md or code/docs directory reads as no release notes', () => {
    const outside = tmp()
    fs.writeFileSync(path.join(outside, 'RELEASES.md'), RELEASES_MD)
    const a = tmp()
    fs.mkdirSync(path.join(a, 'code/docs'), { recursive: true })
    fs.symlinkSync(path.join(outside, 'RELEASES.md'), path.join(a, 'code/docs/RELEASES.md'))
    expect(collectReleases(a)).toEqual([])
    const b = tmp()
    fs.mkdirSync(path.join(b, 'code'), { recursive: true })
    fs.symlinkSync(outside, path.join(b, 'code/docs'))
    expect(collectReleases(b)).toEqual([])
  })
  it('the real RELEASES.md parses to its 18 version sections', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const file = path.resolve(here, '../../../../docs/RELEASES.md')
    const r = parseReleases(fs.readFileSync(file, 'utf8'))
    expect(r.length).toBe(18)
    expect(r[0].version).toMatch(/^v\d/)
    expect(r.every((x) => x.date !== '')).toBe(true)
  })
})
