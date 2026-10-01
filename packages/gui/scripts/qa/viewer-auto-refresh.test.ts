// T-803: an open viewer tab re-reads the regenerated file while visible.
// Behavior is exercised by running the page's own script in a stubbed DOM.
import { describe, it, expect, vi } from 'vitest'
import vm from 'node:vm'
import { renderPage, VIEWER_AUTO_REFRESH_MS } from '@productune/viewer/lib/render.mjs'

const DATA = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [], openItems: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
}
const html = renderPage({ data: DATA, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })

function runInteractionScript(visibility: { state: string }) {
  const script = html.match(/<script>(\n\(function \(\) \{\n  setInterval[\s\S]*?)<\/script>/)![1]
  const timers: Array<{ fn: () => void; ms: number }> = []
  const reload = vi.fn()
  const el = () => ({ classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false, textContent: '' })
  const doc: any = {
    getElementById: (id: string) => (id === 'detail-data' ? { textContent: '{}' } : el()),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: el(),
    get visibilityState() { return visibility.state },
  }
  const ctx: any = {
    document: doc,
    location: { pathname: '/v.html', search: '?view=tickets', hash: '', reload },
    history: { replaceState() {}, pushState() {} },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams,
    setInterval: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return 1 },
    console,
  }
  ctx.window.location = ctx.location
  try { vm.runInNewContext(script, ctx) } catch { /* unrelated DOM stubs may fall short; the timer is registered first-class below */ }
  return { timers, reload }
}

describe('T-803: visible tab auto-refreshes', () => {
  it('states a 30s interval and uses no new script source or network', () => {
    expect(VIEWER_AUTO_REFRESH_MS).toBe(30000)
    expect(html).toContain("script-src 'sha256-")
    expect(html).not.toMatch(/http-equiv="refresh"/)
    expect(html).not.toMatch(/connect-src/)
  })
  it('reloads in place (URL kept) only when visible', () => {
    const vis = { state: 'visible' }
    const { timers, reload } = runInteractionScript(vis)
    const t = timers.find((x) => x.ms === VIEWER_AUTO_REFRESH_MS)
    expect(t).toBeTruthy()
    t!.fn()
    expect(reload).toHaveBeenCalledTimes(1)
    vis.state = 'hidden'
    t!.fn()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
