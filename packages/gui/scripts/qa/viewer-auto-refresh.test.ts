// T-803 (T-897 = B): an open viewer tab reloads only when the viewer file
// changed, and the reader returns to the same scroll position. Behavior is
// exercised by running the page's own script in a stubbed DOM.
import { describe, it, expect, vi } from 'vitest'
import vm from 'node:vm'
import { renderPage, buildFileContent, BUILD_GLOBAL, VIEWER_AUTO_REFRESH_MS } from '@productune/viewer/lib/render.mjs'

const DATA = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [], openItems: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
}
const BUILD = { id: 'aaaa1111', src: 'viewer.build.js' }
const page = (build: unknown) => renderPage({ data: DATA, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '', build } as any)
const html = page(BUILD)

type Opts = { state?: string; saved?: unknown; detailOpen?: boolean }
function boot(opts: Opts = {}, source = html) {
  const script = source.match(/<script>(\n\(function \(\) \{[\s\S]*?)<\/script>/)![1]
  const detailJson = source.match(/<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
  const timers: Array<{ fn: () => void; ms: number }> = []
  const probes: any[] = []
  const reload = vi.fn()
  const store = new Map<string, string>()
  if (opts.saved) store.set('prdt-viewer-scroll:/v.html', JSON.stringify(opts.saved))
  const mainEl: any = { scrollTop: 0 }
  const detailEl: any = { scrollTop: 0 }
  const loads: Array<() => void> = []
  const el = (): any => ({ classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false, textContent: '' })
  const vis = { state: opts.state ?? 'visible' }
  const panel = { ...el(), getAttribute: (k: string) => (k === 'data-open-kind' ? 'ticket' : k === 'data-open-id' ? 'T-1' : null) }
  const doc: any = {
    getElementById: (id: string) => (id === 'detail-data' ? { textContent: detailJson } : el()),
    querySelector: (sel: string) => {
      if (sel === '.store-section.active .frame-body') return mainEl
      if (sel === '.store-section.active .detail-panel.active .detail-panel-body') return opts.detailOpen ? detailEl : null
      if (sel === '.detail-panel.active' || sel === '.store-section.active .detail-panel.active') return opts.detailOpen ? panel : null
      return null
    },
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ parentNode: null as any, set src(v: string) { this._src = v }, get src() { return this._src } }),
    head: { appendChild(n: any) { n.parentNode = { removeChild() {} }; probes.push(n); return n } },
    documentElement: el(),
    get visibilityState() { return vis.state },
  }
  const win: any = { addEventListener: (t: string, f: () => void) => { if (t === 'load') loads.push(f) } }
  const ctx: any = {
    document: doc,
    location: { pathname: '/v.html', search: '?view=tickets', hash: '', reload },
    history: { replaceState() {}, pushState() {} },
    window: win,
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    URLSearchParams,
    setInterval: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return 1 },
    Date,
    console,
  }
  win.location = ctx.location
  ctx.window = win
  // the page script reads/writes the global on `window`; mirror it onto the context global
  Object.defineProperty(ctx, BUILD_GLOBAL, { get: () => win[BUILD_GLOBAL], set: (v) => { win[BUILD_GLOBAL] = v }, configurable: true })
  vm.runInNewContext(script, ctx)
  const tick = () => timers.find((x) => x.ms === VIEWER_AUTO_REFRESH_MS)
  /** Run one poll; the probe script then "loads" reporting `id` (undefined = file missing). */
  const poll = (id?: string) => {
    tick()!.fn()
    const probe = probes[probes.length - 1]
    if (id !== undefined) win[BUILD_GLOBAL] = id
    if (probe && probe.onload && id !== undefined) probe.onload()
    return probe
  }
  return { timers, probes, reload, store, mainEl, detailEl, vis, loads, poll, tick }
}

describe('T-803: reload only when the viewer file changed', () => {
  it('states a 30s interval; no new script source, no network surface, no meta refresh', () => {
    expect(VIEWER_AUTO_REFRESH_MS).toBe(30000)
    expect(html).toContain("script-src 'sha256-")
    expect(html).toContain("'strict-dynamic'")
    expect(html).not.toMatch(/http-equiv="refresh"/)
    expect(html).not.toMatch(/connect-src/)
    expect(html).not.toContain('location.reload(); }, 30000')
  })
  it('the build-id file only sets one global', () => {
    expect(buildFileContent('ab12')).toBe(`window.${BUILD_GLOBAL} = "ab12";\n`)
  })
  it('an unchanged file causes no reload', () => {
    const { poll, reload } = boot()
    const probe = poll(BUILD.id)
    expect(probe.src).toMatch(/^viewer\.build\.js\?\d+$/)
    expect(reload).not.toHaveBeenCalled()
  })
  it('a changed file reloads once the probe reports a new id', () => {
    const { poll, reload } = boot()
    poll('bbbb2222')
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('a missing or failed probe does not reload', () => {
    const { poll, reload } = boot()
    poll(undefined)
    expect(reload).not.toHaveBeenCalled()
  })
  it('a hidden tab never probes or reloads', () => {
    const { poll, tick, reload, probes, vis } = boot({ state: 'hidden' })
    tick()!.fn()
    expect(probes).toHaveLength(0)
    vis.state = 'visible'
    const probe = poll('bbbb2222') // becomes visible: probes
    expect(probe).toBeTruthy()
    vis.state = 'hidden'
    probe.onload() // a probe that lands while hidden defers to the next visible tick
    expect(reload).toHaveBeenCalledTimes(1) // only the visible poll above
  })
  it('a page without a build id (no generator) never schedules a check', () => {
    const { tick } = boot({}, page(null))
    expect(tick()).toBeUndefined()
  })
})

describe('T-803: scroll position survives the reload', () => {
  it('saves main and detail scroll just before reloading', () => {
    const b = boot({ detailOpen: true })
    b.mainEl.scrollTop = 420
    b.detailEl.scrollTop = 135
    b.poll('bbbb2222')
    expect(JSON.parse(b.store.get('prdt-viewer-scroll:/v.html')!)).toEqual({ main: 420, detail: 135, detailKey: 'ticket:T-1', folds: [] })
  })
  it('saves nothing when nothing changed', () => {
    const b = boot()
    b.mainEl.scrollTop = 420
    b.poll(BUILD.id)
    expect(b.store.size).toBe(0)
  })
  it('restores main and detail scroll after load, and consumes the saved value', () => {
    const b = boot({ saved: { main: 420, detail: 135, detailKey: 'ticket:T-1' }, detailOpen: true })
    expect(b.mainEl.scrollTop).toBe(420)
    expect(b.detailEl.scrollTop).toBe(135)
    expect(b.store.size).toBe(0)
  })
  it('re-applies main scroll at window load (layout settled), once', () => {
    const b = boot({ saved: { main: 420, detail: 0 } })
    b.mainEl.scrollTop = 0 // layout reset it
    b.loads.forEach((f) => f())
    expect(b.mainEl.scrollTop).toBe(420)
    b.mainEl.scrollTop = 77 // reader scrolls on
    b.loads.forEach((f) => f())
    expect(b.mainEl.scrollTop).toBe(77)
  })
  it('does not restore the detail scroll onto a different ticket', () => {
    const b = boot({ saved: { main: 420, detail: 600, detailKey: 'ticket:T-901' }, detailOpen: true })
    expect(b.mainEl.scrollTop).toBe(420)
    expect(b.detailEl.scrollTop).toBe(0)
    b.loads.forEach((f) => f())
    expect(b.detailEl.scrollTop).toBe(0)
  })
  it('a saved value without a ticket key restores no detail scroll', () => {
    const b = boot({ saved: { main: 0, detail: 600 }, detailOpen: true })
    expect(b.detailEl.scrollTop).toBe(0)
  })
  it('a plain visit with nothing saved leaves scroll alone', () => {
    const b = boot()
    expect(b.mainEl.scrollTop).toBe(0)
  })
})
