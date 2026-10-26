// T-1277: the viewer's chrome strings come from a per-language catalog chosen by the project's
// `user_lang` (`.prdt/config.json`); ko is the default and stays byte-identical, en is the second catalog.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { collectAll, userLangOf } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { CATALOGS, catalogKey, setViewerLang } from '@productune/viewer/lib/labels.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string) => `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: open\nassignee: developer\n---\nbody ${id}\n`
function project(userLang?: unknown) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-lang-')))
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'demo', ...(userLang === undefined ? {} : { user_lang: userLang }) }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.1', current_task: null }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v1.1 — round\n\n#### a — Item A\n')
  write(root, 'docs/tickets/v1.1/T-1.md', ticket('T-1'))
  return root
}
const build = (userLang?: unknown) => render(collectAll(project(userLang), { disciplineRoot: '/nonexistent-discipline' }))

/** the page as a reader sees it: no embedded document data, no stylesheet, no source comments */
const visible = (html: string) =>
  html
    .replace(/<script id="detail-data"[\s\S]*?<\/script>/, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** every leaf key path of a catalog, functions and regexes as leaves */
function shape(v: unknown, prefix = ''): string[] {
  // header words of a document's own tables: a per-language word list, not a fixed key set
  if (prefix === '.OPTION_CARD.headers') return [`${prefix}:map`]
  if (v && typeof v === 'object' && !(v instanceof RegExp)) {
    return Object.entries(v as object).flatMap(([k, x]) => (Array.isArray(v) ? shape(x, `${prefix}[]`) : shape(x, `${prefix}.${k}`)))
  }
  return [`${prefix}:${v instanceof RegExp ? 'regexp' : typeof v}`]
}
const uniq = (a: string[]) => [...new Set(a)].sort()

afterAll(() => setViewerLang('ko'))

describe('catalogs', () => {
  it('ko and en carry the same groups and the same value kinds', () => {
    expect(uniq(shape(CATALOGS.en))).toEqual(uniq(shape(CATALOGS.ko)))
  })
  it('a catalog key is the primary subtag; an unknown language has none', () => {
    expect(catalogKey('en-US')).toBe('en')
    expect(catalogKey('KO_kr')).toBe('ko')
    expect(catalogKey('fr')).toBeNull()
    expect(catalogKey(null)).toBeNull()
  })
  it('the ticket table header names the title cell in each language', () => {
    expect(CATALOGS.ko.TICKET.tableHeaders[1]).toBe('제목')
    expect(CATALOGS.en.TICKET.tableHeaders[1]).toBe('Title')
  })
})

describe('user_lang source', () => {
  it('reads a non-empty string from the project config only', () => {
    expect(userLangOf({ user_lang: ' en ' })).toBe('en')
    expect(userLangOf({ user_lang: '' })).toBeNull()
    expect(userLangOf({ user_lang: 3 })).toBeNull()
    expect(userLangOf(null)).toBeNull()
    expect(collectAll(project('en'), { disciplineRoot: '/nonexistent-discipline' }).userLang).toBe('en')
    expect(collectAll(project(), { disciplineRoot: '/nonexistent-discipline' }).userLang).toBeNull()
  })
})

describe('rendered page', () => {
  let ko = ''
  let en = ''
  let fr = ''
  beforeAll(() => {
    en = build('en')
    ko = build()
    fr = build('fr')
  })
  it('en: chrome is English and the page language says so', () => {
    expect(en).toContain('<html lang="en">')
    expect(en).toContain('Current version')
    expect(en).toContain('Title<span class="sort-ind"')
    expect(visible(en)).not.toContain('현재 버전')
  })
  it('en: no Hangul outside the embedded document data', () => {
    const chrome = visible(en)
    const hits = [...chrome.matchAll(/[가-힣]+/g)].map((m) => m[0])
    expect([...new Set(hits)]).toEqual([])
  })
  it('ko default: Korean chrome, header renamed', () => {
    expect(ko).toContain('<html lang="ko">')
    expect(ko).toContain('제목<span class="sort-ind"')
    expect(ko).not.toContain('제목(slug)')
  })
  it('an unknown language falls back to ko', () => {
    expect(fr).toBe(ko)
  })
  it('the CSP names the hash of the interaction script of that very page', () => {
    for (const html of [en, ko]) {
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'))
      const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)![1]
      const inline = [...csp.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1])
      for (const h of inline) expect(scripts).toContain(h)
    }
  })
})

describe('decision fold cell names (QA d-v115-t1259-qa2)', () => {
  it('the name column grows to its text (30% cap) and breaks between words, not per character', () => {
    const html = build()
    expect(html).toMatch(/\.dv-kv \{[^}]*grid-template-columns: fit-content\(30%\) minmax\(0, 1fr\);/)
    expect(html).toMatch(/\.dv-kv b \{[^}]*min-width: 44px;[^}]*word-break: keep-all;[^}]*overflow-wrap: break-word;/)
  })
})

describe('ticket title column at phone width (QA d-v115-t1277-qa1)', () => {
  it('the ticket table keeps a floor width on its title column', () => {
    const html = build()
    expect(html).toContain('<table class="sortable tk-table">')
    expect(html).toMatch(/\.tk-table td:nth-child\(2\) \{[^}]*min-width: 180px;[^}]*word-break: keep-all;/)
  })
})
