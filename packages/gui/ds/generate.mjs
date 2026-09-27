// ds/generate.mjs — orchestrates the settled DS HTML build (T-659 Outcome
// §확정 DS HTML 생성 명세). Reads ONLY tokens.css + the two static Pretendard
// woff2 files + the fixed template in ds/lib/render.mjs — never docs/design.md.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildRawThemeMaps, resolveVarChains } from './lib/parse-tokens.mjs'
import { renderPage, templateCssVarNames, templateCssHasHexOrRgbLiteral } from './lib/render.mjs'
import { collectUsedChars, buildPretendardFontFaceCss } from './lib/font-subset.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GUI_ROOT = path.resolve(__dirname, '..')

export const TOKENS_PATH = path.join(GUI_ROOT, 'src/styles/tokens.css')
// repo-relative, shown in the page header — literal, not derived from cwd,
// so the header text (and therefore the file) stays byte-stable regardless
// of where the generator is invoked from.
export const TOKENS_REL_PATH = 'code/packages/gui/src/styles/tokens.css'
export const OUTPUT_PATH = path.join(__dirname, 'design-system.html')
// The command a developer types — never the literal invocation used to build
// (which could vary by shell/cwd) — so this stays constant across runs.
export const GEN_COMMAND = 'pnpm --filter @productune/gui ds'

const PRETENDARD_STATIC_DIR = path.join(GUI_ROOT, 'node_modules/pretendard/dist/web/static/woff2')
const REGULAR_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-Regular.woff2')
const SEMIBOLD_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-SemiBold.woff2')

/**
 * Build the settled DS HTML. Deterministic: no timestamps, no directory
 * listings, no randomness — same tokens.css bytes + same Pretendard woff2
 * bytes always produce the same output bytes (T-689 acceptance line 1).
 * @returns {Promise<{ html: string, tokensSha256: string }>}
 */
export async function generate() {
  const tokensBuf = fs.readFileSync(TOKENS_PATH)
  const tokensCss = tokensBuf.toString('utf8')
  const tokensSha256 = crypto.createHash('sha256').update(tokensBuf).digest('hex')

  const { darkRaw, lightRaw, legacyAliasNames } = buildRawThemeMaps(tokensCss)
  const dark = resolveVarChains(darkRaw)
  const light = resolveVarChains(lightRaw)

  // Generation-time template guards (T-659 Outcome §생성 명세 "템플릿 규칙":
  // zero hex/rgb literals in the template, every var() it uses must exist).
  if (templateCssHasHexOrRgbLiteral()) {
    throw new Error('ds generate: template CSS contains a hex or rgb()/rgba() literal — refused')
  }
  for (const name of templateCssVarNames()) {
    if (!dark.has(name)) {
      throw new Error(`ds generate: template CSS references var(--${name}), which tokens.css does not declare`)
    }
  }

  const common = {
    tokensRelPath: TOKENS_REL_PATH,
    tokensSha256,
    genCommand: GEN_COMMAND,
    darkRaw,
    dark,
    light,
    legacyAliasNames,
  }

  // Pass 1: render without embedded font bytes, to learn exactly which
  // characters the finished page paints (design.md §4.7 step 2). `<style>`
  // content (including any font-face CSS) is never visible text, so leaving
  // it empty here vs. filled in pass 2 cannot change the character set.
  const draft = renderPage({ ...common, fontFaceCss: '' })
  const usedText = collectUsedChars(draft)

  const regularBuffer = fs.readFileSync(REGULAR_WOFF2)
  const semiboldBuffer = fs.readFileSync(SEMIBOLD_WOFF2)
  const fontFaceCss = await buildPretendardFontFaceCss({ regularBuffer, semiboldBuffer, usedText })

  const html = renderPage({ ...common, fontFaceCss })
  return { html, tokensSha256 }
}

/** @returns {Promise<{ upToDate: boolean, html: string }>} */
export async function checkUpToDate() {
  const { html } = await generate()
  const committed = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null
  return { upToDate: committed === html, html }
}
