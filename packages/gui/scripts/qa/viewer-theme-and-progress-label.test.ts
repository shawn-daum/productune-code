// T-797 + T-798: fast, no-browser regression coverage for the two viewer
// fixes, alongside the real-Chromium checks in
// tests/viewer-html.window.spec.ts (media-query application and rendered
// wrapping/accessible-name need a real browser; the STRING the generator
// produces does not — that half is tested here, cheaply, per file).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRawThemeMaps, resolveVarChains } from '../../ds/lib/parse-tokens.mjs'
import { renderPage, TEMPLATE_CSS } from '../../viewer/lib/render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKENS_PATH = path.resolve(__dirname, '../../src/styles/tokens.css')

function realThemeMaps() {
  const tokensCss = fs.readFileSync(TOKENS_PATH, 'utf8')
  const { darkRaw, lightRaw } = buildRawThemeMaps(tokensCss)
  return { dark: resolveVarChains(darkRaw), light: resolveVarChains(lightRaw) }
}

const BASE_FIXTURE_DATA = {
  poState: { stage: 'build', version: 'v1.10', current_task: null },
  currentVersion: 'v1.10',
  prd: { current: { body: '' }, closed: [], openItems: [] },
  tickets: { included: [], omitted: [] },
  wiki: [],
  features: [],
  artifacts: { entries: [] },
}

describe('T-797: viewer follows the OS light/dark setting', () => {
  const { dark, light } = realThemeMaps()
  const html = renderPage({ data: BASE_FIXTURE_DATA, dark, light, fontFaceCss: '', tokensSha256: '' })

  it('carries the dark set on :root as the baseline (dark-first, same as tokens.css)', () => {
    expect(html).toMatch(/:root\s*\{\s*--brand-accent: #A48AF8;/)
  })

  it('carries the light set under @media (prefers-color-scheme: light), from the SAME parsed token maps as tokens.css — never a hand copy', () => {
    expect(html).toMatch(/@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{\s*--brand-accent: #7C3AED;/)
  })

  it('never scopes either set to a class the page has no script to apply — the T-797 defect (always dark regardless of OS)', () => {
    expect(html).not.toContain('.v-dark {')
    expect(html).not.toContain('.v-light {')
    expect(html).not.toContain('class="v-dark"')
  })
})

describe('T-798: a progress row label of any length is never clipped', () => {
  it('the label cell no longer clips overflow to one line (the T-798 defect)', () => {
    const m = TEMPLATE_CSS.match(/(?<!-head |-overall )\.stage-matrix-label\s*\{[^}]*\}/)
    expect(m, '.stage-matrix-label rule not found in TEMPLATE_CSS').not.toBeNull()
    const rule = m![0]
    expect(rule).not.toContain('overflow: hidden')
    expect(rule).not.toContain('white-space: nowrap')
    expect(rule).toContain('white-space: normal')
  })

  it('the label column can widen for a longer label rather than staying a hard 60px', () => {
    expect(TEMPLATE_CSS).toContain('grid-template-columns: minmax(60px, 140px) repeat(5, 1fr)')
  })

  it('renders a long PRD heading in full, in the label span and as the row\'s aria-label — never truncated at generation time', () => {
    const longLabel = '"두 단계"가 시작 전에 확정된다'
    const data = {
      ...BASE_FIXTURE_DATA,
      prd: { current: { body: '' }, closed: [], openItems: [{ key: 'k1', label: longLabel }] },
    }
    const html = renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    // escapeHtml() escapes `"` everywhere (text content and attribute value
    // alike — it has no context-sensitivity), so the same escaped form
    // appears in both places.
    const escapedLabel = '&quot;두 단계&quot;가 시작 전에 확정된다'
    expect(html).toContain(`<span class="stage-matrix-label">${escapedLabel}</span>`)
    expect(html).toContain(`aria-label="${escapedLabel}"`)
    expect(html).toContain('role="row"')
  })
})
