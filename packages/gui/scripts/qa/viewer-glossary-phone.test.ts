// T-1391: at phone width the glossary's fixed 230 + 112 px leading columns left
// the 정의 column ~48px (measured, 390 px) — one glyph a line. Vitest cannot launch
// a browser, so this pins the phone-width rules; the measured render (390/1280,
// light/dark: 정의 width 48 -> 234 px, 8 -> 2 lines) was a scratch Playwright run.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_CSS } from '@productune/viewer/lib/render.mjs'

const css = TEMPLATE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const phone = css.slice(css.indexOf('@media (max-width: 700px) {\n  .app-shell'))

function decl(scope: string, selector: string): string {
  for (const m of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1].trim() === selector) return m[2]
  return ''
}

describe('glossary table at phone width (T-1391)', () => {
  it('keeps a table floor so the 정의 column cannot be squeezed by the term/category columns', () => {
    const min = Number(/min-width:\s*(\d+)px/.exec(decl(phone, '.gl table.t-gl'))?.[1])
    const lead = ['1', '2'].reduce((n, c) => n + Number(/width:\s*(\d+)px/.exec(decl(phone, `.gl table.t-gl th:nth-child(${c})`))?.[1]), 0)
    expect(min - lead).toBeGreaterThanOrEqual(200)
  })

  it('wraps 정의 by word (Korean by phrase), never by glyph', () => {
    const d = decl(phone, '.gl td.def-col')
    expect(d).toContain('word-break: keep-all')
    expect(d).toContain('overflow-wrap: break-word')
  })

  it('desktop rules stay as they were (fixed layout, 230 / 112 px)', () => {
    expect(decl(css, '.gl table.t-gl th:nth-child(1)')).toContain('width: 230px')
    expect(decl(css, '.gl table.t-gl th:nth-child(2)')).toContain('width: 112px')
  })
})
