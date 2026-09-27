// ds/lib/doc-surface-mirror.mjs — T-697.
//
// `md-recipes.css`'s `.md-doc.md-light` block is mostly a SEPARATE,
// self-contained "early light" palette for the MarkdownViewer document
// surface (design.md §2.10) — warm-gray, deliberately DIFFERENT from
// tokens.css's own (cool-gray) app-light values for the same token names
// (`--surface-*` / `--border-*` / most `--text-*`). That divergence is by
// design and this module does not touch it.
//
// A few names inside that same block are not part of the warm-gray palette
// though — they are shared semantic/brand tokens that `.md-doc.md-light`
// hex-COPIES straight from tokens.css's light value, because the viewer's
// light/dark toggle is independent of the app theme and a `var(--same-name)`
// there would self-reference and leak the app's own value instead (T-692,
// this ticket's "related" section). Nothing compared the two files for those
// names — so a future tokens.css light-value change (e.g. an accent swap,
// §0.2.1's SWAP POINT) could drift silently. This is the one-place mapping
// of which md-recipes.css name mirrors which tokens.css (light) name —
// ticket acceptance line 1 ("stated once, in code"):
export const MIRRORED_NAMES = ['accent', 'health-success', 'health-error']

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments, parseDeclarations, buildRawThemeMaps, resolveVarChains } from './parse-tokens.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GUI_ROOT = path.resolve(__dirname, '../..')

export const TOKENS_PATH = path.join(GUI_ROOT, 'src/styles/tokens.css')
export const MD_RECIPES_PATH = path.join(GUI_ROOT, 'src/styles/md-recipes.css')

/**
 * Extract the declaration body of the FIRST rule whose selector matches
 * `selectorRegex`, via brace-depth counting (`md-recipes.css` values never
 * contain braces, so naive depth counting is exact — same assumption
 * `parse-tokens.mjs`'s own internal extractRuleBody makes; kept local here
 * since that one isn't exported and this file needs only a single,
 * non-nested rule).
 * @returns {string | null}
 */
function extractFirstRuleBody(css, selectorRegex) {
  const m = selectorRegex.exec(css)
  if (!m) return null
  const braceOpen = css.indexOf('{', m.index + m[0].length - 1)
  if (braceOpen === -1) throw new Error(`doc-surface-mirror: no "{" found for ${selectorRegex}`)
  let depth = 0
  for (let i = braceOpen; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(braceOpen + 1, i)
    }
  }
  throw new Error(`doc-surface-mirror: unterminated rule body for ${selectorRegex}`)
}

/**
 * Parse the `.md-doc.md-light { … }` block (the one carrying the token-var
 * redeclarations — a later `.md-doc.md-light { background: … }` rule further
 * down in the file carries none of `MIRRORED_NAMES` and is irrelevant here;
 * taking only the FIRST match is deliberate, not an oversight).
 * @param {string} mdRecipesCss
 * @returns {Map<string,string>}
 */
export function parseDocLightBlock(mdRecipesCss) {
  const stripped = stripComments(mdRecipesCss)
  const body = extractFirstRuleBody(stripped, /\.md-doc\.md-light[ \t\r\n]*\{/)
  if (body === null) {
    throw new Error('doc-surface-mirror: no ".md-doc.md-light { … }" block found in md-recipes.css')
  }
  return parseDeclarations(body)
}

/** The resolved (var-chains-flattened) tokens.css LIGHT token map. */
export function resolveTokensLight(tokensCss) {
  const { lightRaw } = buildRawThemeMaps(tokensCss)
  return resolveVarChains(lightRaw)
}

/**
 * @param {{ mdRecipesCss: string, tokensCss: string }} args
 * @returns {Array<{ name: string, mdRecipes: string | undefined, tokens: string | undefined }>}
 *   Empty array = every mirrored name agrees.
 */
export function diffDocSurfaceMirror({ mdRecipesCss, tokensCss }) {
  const docLight = parseDocLightBlock(mdRecipesCss)
  const tokensLight = resolveTokensLight(tokensCss)
  const mismatches = []
  for (const name of MIRRORED_NAMES) {
    const mdValue = docLight.get(name)
    const tokenValue = tokensLight.get(name)
    if (mdValue !== tokenValue) mismatches.push({ name, mdRecipes: mdValue, tokens: tokenValue })
  }
  return mismatches
}

/**
 * Disk-reading entry point for `ds --check` (cli.mjs).
 * @returns {{ ok: boolean, mismatches: ReturnType<typeof diffDocSurfaceMirror> }}
 */
export function checkDocSurfaceMirror() {
  const mdRecipesCss = fs.readFileSync(MD_RECIPES_PATH, 'utf8')
  const tokensCss = fs.readFileSync(TOKENS_PATH, 'utf8')
  const mismatches = diffDocSurfaceMirror({ mdRecipesCss, tokensCss })
  return { ok: mismatches.length === 0, mismatches }
}
