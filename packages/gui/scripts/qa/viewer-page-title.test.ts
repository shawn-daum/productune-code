// T-809: the viewer's tab title and og:title name the project and, with an item
// open, the item id as the URL state carries it. Generation-time half = the
// static head tags; behavior half = the page script run in a stubbed DOM.
import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const DATA = (project: unknown) => ({
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  project,
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [], openItems: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
})
const page = (project: unknown) => renderPage({ data: DATA(project), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', build: null } as any)

describe('T-809: static head title', () => {
  it('title and og:title both read [prdt] {project} with no item selected', () => {
    const html = page('productune')
    expect(html).toContain('<title>[prdt] productune</title>')
    expect(html).toContain('<meta property="og:title" content="[prdt] productune">')
  })
  it('escapes the project text in both places and keeps the CSP kind', () => {
    const html = page('a<b>"&')
    expect(html).toContain('<title>[prdt] a&lt;b&gt;&quot;&amp;</title>')
    expect(html).toContain('content="[prdt] a&lt;b&gt;&quot;&amp;">')
    expect(html).not.toContain('a<b>')
    expect(html).toMatch(/default-src 'none'; script-src 'sha256-[^;]+ 'strict-dynamic'/)
  })
  it('a missing project falls back to a plain label', () => {
    expect(page(null)).toContain('<title>[prdt] viewer</title>')
  })
})

function boot(initial: string | null, project = 'productune') {
  const html = page(project)
  const script = html.match(/<script>(\n\(function \(\) \{[\s\S]*?)<\/script>/)![1]
  const detailJson = html.match(/<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
  const open = { id: initial }
  const el = (): any => ({ classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false, textContent: '' })
  const og = { ...el(), content: '' as string }
  og.setAttribute = (k: string, v: string) => { if (k === 'content') og.content = v }
  const panel = { ...el(), getAttribute: (k: string) => (k === 'data-open-kind' ? 'ticket' : k === 'data-open-id' ? open.id : null) }
  const section = {
    ...el(),
    getAttribute: (k: string) => (k === 'data-store' ? 'ticket' : null),
    querySelector: (sel: string) => (sel === '.detail-panel.active' && open.id ? panel : null),
  }
  const listeners: Record<string, Array<() => void>> = {}
  const doc: any = {
    title: html.match(/<title>([\s\S]*?)<\/title>/)![1],
    getElementById: (id: string) => (id === 'detail-data' ? { textContent: detailJson } : el()),
    querySelector: (sel: string) => (sel === 'meta[property="og:title"]' ? og : sel === '.store-section.active' ? section : null),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({}),
    head: { appendChild() {} },
    documentElement: el(),
    visibilityState: 'visible',
  }
  const win: any = { addEventListener: (t: string, f: () => void) => { (listeners[t] ||= []).push(f) } }
  const ctx: any = {
    document: doc,
    location: { pathname: '/v.html', search: '', hash: '', reload() {} },
    history: { replaceState() {}, pushState() {} },
    window: win,
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URLSearchParams,
    setInterval: () => 1,
    Date,
    console,
  }
  win.location = ctx.location
  vm.runInNewContext(script, ctx)
  const navigate = (id: string | null) => { open.id = id; listeners.popstate.forEach((f) => f()) }
  return { doc, og, navigate }
}

describe('T-809: title follows the open item', () => {
  it('an item open at load (a reload keeps it) reads [prdt] {project} - {id}', () => {
    const { doc, og } = boot('T-809')
    expect(doc.title).toBe('[prdt] productune - T-809')
    expect(og.content).toBe('[prdt] productune - T-809')
  })
  it('no item open at load reads [prdt] {project}', () => {
    const { doc, og } = boot(null)
    expect(doc.title).toBe('[prdt] productune')
    expect(og.content).toBe('[prdt] productune')
  })
  it('selecting another item, then closing the panel, updates both without reload', () => {
    const { doc, og, navigate } = boot('T-809')
    navigate('T-797')
    expect(doc.title).toBe('[prdt] productune - T-797')
    expect(og.content).toBe('[prdt] productune - T-797')
    navigate('decision--x.md')
    expect(doc.title).toBe('[prdt] productune - decision--x.md')
    navigate(null)
    expect(doc.title).toBe('[prdt] productune')
    expect(og.content).toBe('[prdt] productune')
  })
})
