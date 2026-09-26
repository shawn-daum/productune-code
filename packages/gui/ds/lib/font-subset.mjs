// ds/lib/font-subset.mjs — the Pretendard subsetting procedure from
// docs/design.md §4.7, run inside the generator (T-659 Outcome §생성 명세
// "글꼴": "docs/design.md §4.7 절차를 생성기 안에서"). Shared with T-665's
// viewer generator (same module — no second parser/subsetter).
//
// Uses `subset-font` (pure JS/WASM harfbuzz binding) rather than shelling out
// to `uvx pyftsubset`: same "same input → same bytes" determinism the spec
// requires, with no dependency on a Python/uv toolchain being present in
// every dev machine or CI runner (doctrine #2 — don't reinvent, and pnpm
// already owns this package's toolchain).
import subsetFont from 'subset-font'

/**
 * Approximate "every glyph this page can paint" by stripping tags/scripts/
 * styles and decoding the handful of entities the template itself emits.
 * Over-inclusion (e.g. a stray attribute character leaking through) only
 * makes the subset a few bytes larger — never wrong — so this does not need
 * to be a full HTML parser.
 * @param {string} html
 * @returns {string} the deduplicated character set, as a string
 */
export function collectUsedChars(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '')
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, ' ')
  const decoded = withoutTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  const seen = new Set()
  for (const ch of decoded) seen.add(ch)
  return [...seen].join('')
}

/**
 * Subset the two static Pretendard weights (Regular 400, SemiBold 600) down
 * to the characters actually used, base64-encode them, and return the two
 * `@font-face` CSS blocks — family name `'Pretendard'` (matches §4.7 step 4;
 * the app's own `'Pretendard Variable'` face is never embedded here since
 * `file://` cannot fetch a sibling font and the fallback chain lands on this
 * one instead, per acceptance: `document.fonts.check('12px Pretendard')`).
 *
 * @param {{ regularBuffer: Buffer, semiboldBuffer: Buffer, usedText: string }} args
 * @returns {Promise<string>} CSS text, two `@font-face` rules
 */
export async function buildPretendardFontFaceCss({ regularBuffer, semiboldBuffer, usedText }) {
  const [regularSubset, semiboldSubset] = await Promise.all([
    subsetFont(regularBuffer, usedText, { targetFormat: 'woff2' }),
    subsetFont(semiboldBuffer, usedText, { targetFormat: 'woff2' }),
  ])
  const regularB64 = regularSubset.toString('base64')
  const semiboldB64 = semiboldSubset.toString('base64')
  return [
    '@font-face {',
    "  font-family: 'Pretendard';",
    '  font-weight: 400;',
    '  font-style: normal;',
    '  font-display: swap;',
    `  src: url(data:font/woff2;base64,${regularB64}) format('woff2');`,
    '}',
    '@font-face {',
    "  font-family: 'Pretendard';",
    '  font-weight: 600 700;',
    '  font-style: normal;',
    '  font-display: swap;',
    `  src: url(data:font/woff2;base64,${semiboldB64}) format('woff2');`,
    '}',
  ].join('\n')
}
