// T-886 (T-832 / T-877): the 「규율」 entry — applied copy of the discipline
// documents, the five link notations, 「이름 N행」 → line, link safety.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderPage, pastTicketDataFiles } from '@productune/viewer/lib/render.mjs'
import { collectDiscipline, countChangedLines, defaultDisciplineRoot } from '@productune/viewer/lib/collect.mjs'
import { buildDisciplineIndex, linkDisciplineText } from '@productune/viewer/lib/discipline-links.mjs'

const FILES: Record<string, string> = {
  'contracts.md': '# Contracts\n\nbinds.\n',
  'contracts/tickets.md': 'a\nb\nc\n',
  'po/habit.md': 'po habit\n',
  'po/playbooks/_index.md': 'idx\n',
  'po/playbooks/patch-cycle.md': Array.from({ length: 40 }, (_, i) => `line ${i + 1} <b>`).join('\n') + '\n',
  'po/playbooks/retro.md': 'r1\nr2\n',
  'designer/habit.md': 'd habit\n',
  'designer/playbooks/_index.md': 'didx\n',
  'designer/playbooks/inject-edit.md': 'ie\n',
  'designer/playbooks/ds-conformance.md': 'dc\n',
  'qa/habit.md': 'q habit\n',
  'qa/playbooks/ds-conformance.md': 'dc2\n',
  'qa/playbooks/smoke.md': 's\n',
}

function fixture(files = FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-disc-'))
  const applied = path.join(root, 'applied')
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(applied, rel)), { recursive: true })
    fs.writeFileSync(path.join(applied, rel), text)
  }
  fs.mkdirSync(path.join(applied, 'designer/style-library'), { recursive: true })
  fs.writeFileSync(path.join(applied, 'designer/style-library/x.md'), 'not a document')
  fs.writeFileSync(path.join(applied, 'doctrine.md'), 'not in the list')
  return { root, applied, repo: path.join(root, 'repo') }
}

const docs = (extra: Record<string, string> = {}) => {
  const f = fixture({ ...FILES, ...extra })
  return collectDiscipline(f.repo, { disciplineRoot: f.applied }) as any[]
}
const link = (text: string, d = docs()) => linkDisciplineText(text, buildDisciplineIndex(d), (s: string) => s)

describe('collectDiscipline', () => {
  it('lists contracts, then each persona habit + playbooks; leaves out doctrine and style-library', () => {
    const d = docs()
    expect(d.map((x) => x.rel)).toEqual([
      'contracts.md', 'contracts/tickets.md', 'po/habit.md', 'po/playbooks/_index.md', 'po/playbooks/patch-cycle.md', 'po/playbooks/retro.md',
      'designer/habit.md', 'designer/playbooks/_index.md', 'designer/playbooks/ds-conformance.md', 'designer/playbooks/inject-edit.md', 'qa/habit.md', 'qa/playbooks/ds-conformance.md', 'qa/playbooks/smoke.md',
    ])
    expect(d.find((x) => x.rel === 'po/playbooks/patch-cycle.md').lines).toHaveLength(40)
    expect(d.find((x) => x.rel === 'po/playbooks/_index.md').kind).toBe('index')
  })

  it('T-911: the default discipline root honors PRDT_HOME', () => {
    const f = fixture()
    const home = path.join(f.root, 'prdt-home')
    fs.mkdirSync(home)
    fs.renameSync(f.applied, path.join(home, 'discipline'))
    const prev = process.env.PRDT_HOME
    process.env.PRDT_HOME = home
    try {
      const d = collectDiscipline(f.repo) as any[]
      expect(d.map((x) => x.rel)).toContain('po/habit.md')
      expect(defaultDisciplineRoot()).toBe(path.join(home, 'discipline'))
    } finally {
      if (prev === undefined) delete process.env.PRDT_HOME
      else process.env.PRDT_HOME = prev
    }
  })

  it('no discipline root → no documents', () => {
    expect(collectDiscipline('/nonexistent', { disciplineRoot: '/nonexistent/x' })).toEqual([])
  })

  it('a link inside the root pointing outside it is not read', () => {
    const f = fixture()
    const outside = path.join(f.root, 'outside.md')
    fs.writeFileSync(outside, 'secret')
    fs.rmSync(path.join(f.applied, 'po/playbooks/retro.md'))
    fs.symlinkSync(outside, path.join(f.applied, 'po/playbooks/retro.md'))
    const d = collectDiscipline(f.repo, { disciplineRoot: f.applied }) as any[]
    expect(d.find((x) => x.rel === 'po/playbooks/retro.md')).toBeUndefined()
  })

  it('differs = lines that differ from the repository original; 0 when they are the same', () => {
    const f = fixture()
    const src = path.join(f.repo, 'code/packages/core/discipline')
    for (const [rel, text] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true })
      fs.writeFileSync(path.join(src, rel), rel === 'po/playbooks/retro.md' ? 'r1\nCHANGED\nextra\n' : text)
    }
    const d = collectDiscipline(f.repo, { disciplineRoot: f.applied }) as any[]
    expect(d.find((x) => x.rel === 'po/playbooks/retro.md').differs).toBe(2)
    expect(d.find((x) => x.rel === 'contracts.md').differs).toBe(0)
    expect(countChangedLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1)
  })

  it('T-904 D: a document with no repository original gets differs = 0 while the original root exists', () => {
    const f = fixture()
    const src = path.join(f.repo, 'code/packages/core/discipline')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'contracts.md'), FILES['contracts.md'])
    const d = collectDiscipline(f.repo, { disciplineRoot: f.applied }) as any[]
    expect(d.find((x) => x.rel === 'po/playbooks/retro.md').differs).toBe(0)
    expect(d.find((x) => x.rel === 'contracts.md').differs).toBe(0)
  })
})

describe('the five notations (T-877 D3)', () => {
  it('1 path: repo-style, applied-copy-style, short; a path under another directory stays text', () => {
    expect(link('see po/playbooks/retro.md now')).toContain('<a class="dl" href="#" data-doc="po/playbooks/retro.md">po/playbooks/retro.md</a>')
    expect(link('code/packages/core/discipline/po/playbooks/patch-cycle.md.')).toContain('data-doc="po/playbooks/patch-cycle.md">code/packages/core/discipline/po/playbooks/patch-cycle.md</a>.')
    expect(link('contracts/tickets.md')).toContain('data-doc="contracts/tickets.md"')
    expect(link('overrides/playbooks/retro.md')).toBeNull()
    expect(link('docs/x/po/playbooks/retro.md')).toBeNull()
  })

  it('2 unique file name; shared names (habit.md, _index.md) stay text', () => {
    expect(link('tickets.md 와 contracts.md')).toContain('data-doc="contracts/tickets.md">tickets.md</a>')
    expect(link('habit.md · _index.md · ds-conformance.md')).toBeNull()
    expect(link('user-tickets.md')).toBeNull()
  })

  it('3 「이름 playbook」 / 「이름 플레이북」: the name is the link', () => {
    expect(link('smoke playbook')).toBe('<a class="dl" href="#" data-doc="qa/playbooks/smoke.md">smoke</a> playbook')
    expect(link('retro 플레이북을')).toContain('data-doc="po/playbooks/retro.md">retro</a> 플레이북을')
    expect(link('ds-conformance playbook')).toBeNull()
  })

  it('4 hyphenated name; a slug containing it stays text', () => {
    expect(link('(patch-cycle)대로')).toContain('(<a class="dl" href="#" data-doc="po/playbooks/patch-cycle.md">patch-cycle</a>)대로')
    expect(link('apply-t816-patch-cycle-land-wording')).toBeNull()
    expect(link('ds-conformance')).toBeNull()
  })

  it('5 「이름 N행」 is one link with the line; 「이름 N단계」 links the name only; a bare word stays text', () => {
    expect(link('patch-cycle 32행 이다')).toBe('<a class="dl" href="#" data-doc="po/playbooks/patch-cycle.md" data-line="32">patch-cycle 32행</a> 이다')
    expect(link('retro 5단계 · 8단계')).toBe('<a class="dl" href="#" data-doc="po/playbooks/retro.md">retro</a> 5단계 · 8단계')
    expect(link('retro Override align 5·8단계')).toBeNull()
    expect(link('retro 와 smoke 와 git')).toBeNull()
  })
})

const ticket = (id: string, body: string) => ({ bucket: 'v1.12', rel: `docs/tickets/v1.12/${id}.md`, frontmatter: { id, slug: 's', type: 'impl', status: 'open', assignee: 'developer' }, body })
function data(d: any[], body = '「patch-cycle 32행」 · `inject-edit` · `po/playbooks/retro.md` · [patch-cycle](https://example.com) · <b>raw</b>\n\n```\npatch-cycle 32행\n```\n') {
  return {
    currentVersion: 'v1.12',
    prd: { current: { body: '' }, closed: [{ name: 'v1.11.md', rel: 'docs/prd/versions/v1.11.md', body: 'inject-edit 플레이북 과 po/playbooks/define-entry.md' }] },
    tickets: { included: [ticket('T-1', body)], omitted: [] },
    wiki: [{ rel: 'docs/wiki/fact--x.md', frontmatter: { title: 'x', type: 'fact', status: 'live' }, body: 'contracts/tickets.md' }],
    features: [], featureTaxonomy: null, artifacts: { entries: [] }, releases: [], discipline: d,
  }
}
const render = (x: unknown) => renderPage({ data: x as any, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const detail = (html: string): any => JSON.parse(/<script id="detail-data" type="application\/json">(.*?)<\/script>/s.exec(html)![1])
const section = (html: string, store: string) => { const i = html.indexOf(`<section class="store-section" data-store="${store}"`); return html.slice(i, html.indexOf('</section>', i)) }

describe('links in bodies', () => {
  it('ticket, wiki and PRD bodies link; code spans link inside; fenced blocks and link text do not', () => {
    const html = render(data(docs()))
    const body = detail(html).ticket['T-1'].body as string
    expect(body).toContain('<a class="dl" href="#" data-doc="po/playbooks/patch-cycle.md" data-line="32">patch-cycle 32행</a>')
    expect(body).toContain('<code><a class="dl" href="#" data-doc="designer/playbooks/inject-edit.md">inject-edit</a></code>')
    expect(body).toContain('<code><a class="dl" href="#" data-doc="po/playbooks/retro.md">po/playbooks/retro.md</a></code>')
    expect(body).toContain('<a href="https://example.com" target="_blank" rel="noopener">patch-cycle</a>')
    expect(body).toContain('<pre><code>patch-cycle 32행')
    expect(body).toContain('&lt;b&gt;raw&lt;/b&gt;')
    expect(detail(html).wiki['fact--x.md'].body).toContain('data-doc="contracts/tickets.md"')
    expect(section(html, 'prd')).toContain('data-doc="designer/playbooks/inject-edit.md">inject-edit</a> 플레이북')
  })

  it('no documents → plain text, no link', () => {
    const body = detail(render(data([]))).ticket['T-1'].body as string
    expect(body).not.toContain('class="dl"')
    expect(body).toContain('patch-cycle 32행')
  })

  it('every link is a bare "#" plus a document key — no file path, no scheme — and the key exists', () => {
    const html = render(data(docs()))
    const keys = new Set(Object.keys(detail(html).disc))
    const d = detail(html)
    const text = [d.ticket['T-1'].body, d.wiki['fact--x.md'].body, section(html, 'prd')].join('\n')
    const hits = [...text.matchAll(/<a class="dl" href="([^"]*)" data-doc="([^"]*)"/g)]
    expect(hits.length).toBeGreaterThan(3)
    for (const h of hits) { expect(h[1]).toBe('#'); expect(keys.has(h[2])).toBe(true) }
  })

  it('past-version ticket data files link too', () => {
    const tickets = { included: [], omitted: [{ bucket: 'v1.11.1', tickets: [{ rel: 'docs/tickets/v1.11.1/T-828.md', frontmatter: { id: 'T-828' } }], bodies: { 'docs/tickets/v1.11.1/T-828.md': 'patch-cycle 32행' } }] }
    const f = (pastTicketDataFiles as any)(tickets, { discipline: docs() })
    expect(f[0].tickets['T-828'].body).toContain('data-doc="po/playbooks/patch-cycle.md" data-line="32"')
  })
})

describe('the 「규율」 entry', () => {
  it('is the last activity button, and the screen has sidebar groups, count, table', () => {
    const html = render(data(docs()))
    const nav = html.slice(html.indexOf('<nav class="activity">'), html.indexOf('</nav>'))
    const keys = [...nav.matchAll(/data-store="([^"]+)" title="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`)
    expect(keys[keys.length - 1]).toBe('disc:규율')
    const sec = section(html, 'disc')
    expect(sec).toContain('<span>전체</span><span class="nav-item-count">13</span>')
    expect(sec).toContain('<span>계약 (contracts)</span><span class="nav-item-count">2</span>')
    expect(sec).toContain('<span class="count-badge">규율 문서 <b>13</b>개</span>')
    expect(sec).toContain('<th>문서</th><th>구분</th><th class="num-col">줄</th>')
    expect(sec).toContain('<td><span class="nm">patch-cycle</span><span class="nm-key">po/playbooks/patch-cycle.md</span></td><td><span class="kp kp-component">playbook</span></td><td class="num-col">40</td>')
    expect(sec).toContain('<span class="kp kp-component">계약</span>')
    expect(sec).toContain('<span class="kp kp-component">목차</span>')
  })

  it('detail data carries the lines once; the title adds the group for habit and 목차', () => {
    const e = detail(render(data(docs()))).disc
    expect(e['po/playbooks/patch-cycle.md'].lines).toHaveLength(40)
    expect(e['po/habit.md'].title).toBe('habit · po')
    expect(e['po/playbooks/_index.md'].title).toBe('_index · po')
    expect(e['po/playbooks/retro.md'].title).toBe('retro')
  })

  it('empty state: two lines, 「그룹 없음 · 전체 0개」, no table', () => {
    const sec = section(render(data([])), 'disc')
    expect(sec).toContain('<span>규율 문서가 없어요.</span><br><span>prdt 규율이 적용된 기기에서 뷰어를 만들면 나타나요.</span>')
    expect(sec).toContain('그룹 없음 · 전체 0개')
    expect(sec).not.toContain('t-disc')
  })

  it('page script: states link to line, back, notices; CSP unchanged in shape', () => {
    const html = render(data(docs()))
    for (const s of ['data-disc-back', '저장소 원본과 {N}줄이 달라요', '이 문서는 {N}행까지예요. 처음부터 보여 줘요.', '이 기기에 적용된 사본', 'is-target']) expect(html).toContain(s)
    expect(/script-src 'sha256-[^']+' 'sha256-[^']+' 'strict-dynamic';/.test(html)).toBe(true)
  })
})
