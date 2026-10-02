// T-909: three layout fixes found reviewing the v1.12 viewer. Vitest cannot
// launch a browser, so this pins the CSS rules; the measured render (scroll
// offsets after horizontal swipe / shift-wheel at 1024-1920, toggle gap, Home
// column widths) was done in a scratch Playwright script on real viewer.html.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_CSS } from '@productune/viewer/lib/render.mjs'

/** Declarations of the first rule whose selector list contains `selector` exactly. */
function decls(selector: string): string {
  const css = TEMPLATE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) return m[2]
  }
  throw new Error(`no rule for ${selector}`)
}

describe('viewer shell overflow and home layout (T-909)', () => {
  it('the column holding the off-canvas detail panel clips it, so no horizontal scroll can reveal it', () => {
    expect(decls('.frame-main-col')).toMatch(/overflow:\s*clip/)
    expect(decls('.app-shell')).toMatch(/overflow:\s*clip/)
    expect(decls('html')).toMatch(/overflow-x:\s*hidden/)
    expect(decls('.frame-body')).toMatch(/overflow-x:\s*hidden/)
  })

  it('the detail panel still slides via transform and the dependency graph keeps its own scroll', () => {
    expect(decls('.detail-panel')).toContain('translateX(100%)')
    expect(decls('.detail-panel.active')).toContain('translateX(0)')
    expect(decls('.dg-wrap')).toMatch(/overflow-x:\s*auto/)
  })

  it('the theme toggle stays at the rail bottom with a bottom margin', () => {
    const d = decls('.activity-theme-toggle')
    expect(d).toContain('margin-top: auto')
    expect(d).toMatch(/margin-bottom:\s*var\(--space-16\)/)
  })

  it('Home scope column is the narrower one and the waits column has a wide floor', () => {
    const m = decls('.sc-grid').match(/grid-template-columns:\s*minmax\(0,\s*(\d+)fr\)\s*minmax\((\d+)px,\s*(\d+)fr\)/)
    expect(m, 'sc-grid columns: scope fr, waits minmax(px, fr)').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(Number(m![3]))
    expect(Number(m![2])).toBeGreaterThanOrEqual(300)
  })
})
