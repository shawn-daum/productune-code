/**
 * ArtifactJsonTab.codeTokens.test.tsx (T-410)
 *
 * T-410 item 2: JSON syntax-highlight palette migrated off dark-only raw hex
 * literals onto the new `--code-*` semantic tokens (docs/design.md §2.11).
 *
 * Per docs/wiki/learning--v1.5-process.md, a `:root`-only assertion is NOT
 * sufficient regression coverage for a token migration (it missed a real
 * shadowing bug in T-417 #1) — a real consumer can still resolve to the wrong
 * value even when `:root` "looks" declared correctly. So this file checks two
 * independent things:
 *
 *  1. The REAL rendered tree-node output (JsonNode/ValueLeaf, same functions
 *     ArtifactJsonTab uses in production — rendered via renderToStaticMarkup,
 *     same idiom as MessageBubble.attachments.test.tsx) carries `var(--code-*)`
 *     in the actual painted `style` attribute — not the old raw hex, and not
 *     just an unused module-level constant.
 *  2. tokens.css's actual, block-scoped declarations (dark default / light
 *     media / .theme-light / .theme-dark) hold the exact hex values §2.11
 *     specifies, dark stays byte-for-byte the pre-T-410 literal, and light
 *     genuinely differs from dark per token (guards against a copy-paste that
 *     would pass a naive "var is declared somewhere" check).
 *
 * No jsdom/getComputedStyle in this package's unit-test environment (node —
 * see vitest.config.ts), so full browser-cascade computed-style isn't
 * available; these two checks are the closest real-artifact equivalent.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { JsonNode, ValueLeaf } from './ArtifactJsonTab'

describe('T-410: ArtifactJsonTab renders real --code-* token refs (not raw hex)', () => {
  test('object keys at depth 1/2/3 carry var(--code-key-N); depth 0 is unchanged', () => {
    const value = { a: { b: { c: 'leaf' } } }
    const html = renderToStaticMarkup(
      createElement(JsonNode, { value, depth: 0, path: [], expandOverride: {} })
    )
    expect(html).toContain('var(--code-key-1)') // key "a", depth 1
    expect(html).toContain('var(--code-key-2)') // key "b", depth 2
    expect(html).toContain('var(--code-key-3)') // key "c", depth 3
    // out-of-scope pin (§2.11): depth-0 root has no label, so no key span at
    // all — text-tertiary is only exercised once nesting starts. Confirm no
    // raw hex literal leaked back in regardless of depth.
    expect(html).not.toMatch(/#[0-9A-Fa-f]{6}/)
  })

  test('string/number/boolean leaves carry var(--code-string/number/keyword), not raw hex', () => {
    const strHtml = renderToStaticMarkup(createElement(ValueLeaf, { value: 'hello' }))
    const numHtml = renderToStaticMarkup(createElement(ValueLeaf, { value: 42 }))
    const boolHtml = renderToStaticMarkup(createElement(ValueLeaf, { value: true }))
    const nullHtml = renderToStaticMarkup(createElement(ValueLeaf, { value: null }))

    expect(strHtml).toContain('var(--code-string)')
    expect(numHtml).toContain('var(--code-number)')
    expect(boolHtml).toContain('var(--code-keyword)')
    expect(nullHtml).toContain('var(--code-keyword)')

    for (const html of [strHtml, numHtml, boolHtml, nullHtml]) {
      expect(html).not.toMatch(/#[0-9A-Fa-f]{6}/)
    }
  })
})

// ── tokens.css block-scoped value check ─────────────────────────────────────

const TOKENS_CSS_PATH = path.resolve(__dirname, '../../../../styles/tokens.css')
const css = readFileSync(TOKENS_CSS_PATH, 'utf8')

// Real block boundaries, located by the actual selector text present in the
// file (not duplicated hardcoded assumptions) — mirrors the file's own
// documented 3(+.theme-dark)-block pattern (§0.7 / §2.11 impl memo).
//
// `from` threads the search cursor forward through the file sequentially, so
// each marker resolves to its REAL rule (e.g. the `@media` selector at its
// actual CSS position), not an earlier mention of the same text inside the
// file's own header prose comment (which references all these selectors by
// name before any of them actually appear as code).
let cursor = 0
function sliceBlock(startMarker: string, endMarker: string): string {
  const start = css.indexOf(startMarker, cursor)
  expect(start, `marker not found from cursor: ${startMarker}`).toBeGreaterThan(-1)
  const end = endMarker ? css.indexOf(endMarker, start) : css.length
  if (endMarker) expect(end, `end marker not found after start: ${endMarker}`).toBeGreaterThan(start)
  cursor = end === -1 ? css.length : end
  return end === -1 ? css.slice(start) : css.slice(start, end)
}

const blockDarkDefault = sliceBlock(':root {', '@media (prefers-color-scheme: light)')
const blockLightMedia = sliceBlock('@media (prefers-color-scheme: light)', ':root.theme-light {')
const blockThemeLight = sliceBlock(':root.theme-light {', '/* Explicit dark toggle')
const blockThemeDark = sliceBlock(':root.theme-dark {', '')

function codeVar(block: string, name: string): string {
  const m = block.match(new RegExp(`--code-${name}:\\s*(#[0-9A-Fa-f]{6})`))
  expect(m, `--code-${name} not found in block`).toBeTruthy()
  return m![1]!.toUpperCase()
}

// docs/design.md §2.11 — dark values are the pre-T-410 literals (unchanged).
const DARK_SPEC: Record<string, string> = {
  'key-1': '#7EA8CF',
  'key-2': '#CF9E9E',
  'key-3': '#8FBFB4',
  string: '#7FB07F',
  number: '#C9A26D',
  keyword: '#8B7EC8',
}

// docs/design.md §2.11 — new light values (AA, ~4.8:1 vs #FFFFFF).
const LIGHT_SPEC: Record<string, string> = {
  'key-1': '#3F76A9',
  'key-2': '#B85151',
  'key-3': '#467B6F',
  string: '#4D7D4D',
  number: '#926B36',
  keyword: '#7562CB',
}

describe('T-410: tokens.css --code-* values match docs/design.md §2.11, per real block', () => {
  for (const name of Object.keys(DARK_SPEC)) {
    test(`--code-${name}: dark blocks (:root default + .theme-dark) match spec and each other`, () => {
      const rootVal = codeVar(blockDarkDefault, name)
      const themeDarkVal = codeVar(blockThemeDark, name)
      expect(rootVal).toBe(DARK_SPEC[name])
      expect(themeDarkVal).toBe(DARK_SPEC[name])
    })

    test(`--code-${name}: light blocks (@media + .theme-light) match spec and each other`, () => {
      const mediaVal = codeVar(blockLightMedia, name)
      const themeLightVal = codeVar(blockThemeLight, name)
      expect(mediaVal).toBe(LIGHT_SPEC[name])
      expect(themeLightVal).toBe(LIGHT_SPEC[name])
    })

    test(`--code-${name}: light genuinely differs from dark (not a copy-paste)`, () => {
      expect(LIGHT_SPEC[name]).not.toBe(DARK_SPEC[name])
    })
  }
})
