// viewer/generate.mjs — orchestrates the one-page repo viewer (T-665).
// Reads ONLY: tokens.css + the two static Pretendard woff2 files (via the
// SAME ds/lib modules T-689's DS generator uses — no second parser/subsetter)
// plus the repo's own canonical sources (docs/prd, docs/tickets, docs/wiki,
// docs/features, docs/artifacts/manifest.json, .prdt/po-state.json) via
// viewer/lib/collect.mjs. Never a runtime fetch — everything above is read
// at GENERATION time and embedded in the output file.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildRawThemeMaps, resolveVarChains } from '../ds/lib/parse-tokens.mjs'
import { collectUsedChars, buildPretendardFontFaceCss } from '../ds/lib/font-subset.mjs'
import { collectAll } from './lib/collect.mjs'
import { renderPage, templateGuardErrors } from './lib/render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// T-718: computed relative to THIS file's own location, never from a
// hardcoded directory-name literal — a fresh checkout can land at any path
// (a detached `git worktree add` names it whatever the caller passed), so
// nothing downstream may assume the checkout root itself is named "code" (or
// any other literal).
export const GUI_ROOT = path.resolve(__dirname, '..')
// code/packages/gui -> code -> productune (repo root, where docs/ and
// .prdt/ live — the viewer reads the WHOLE repo, not just the gui package).
export const REPO_ROOT = path.resolve(GUI_ROOT, '../../..')

/**
 * T-718 slice 2: whether `repoRoot` looks like a real meta project (the one
 * `docs/` + `.prdt/` sit beside a shared checkout's `code/` — see this
 * module's header) rather than a detached code-only checkout with no meta
 * project beside it (`git worktree add --detach`, in particular — the
 * checkout has no `docs/`/`.prdt/` one level up at all). `generate()` /
 * `collectAll()` throw ENOENT reading `.prdt/po-state.json` when that's the
 * case; a caller that wants to degrade gracefully instead (the three
 * real-corpus viewer test files skipping their `generate()`-dependent case)
 * checks this FIRST rather than catching that throw.
 * @param {string} [repoRoot]
 * @returns {string | null} null when a meta project is present, else a
 *   human-readable reason naming the missing path — fit to show as a skipped
 *   test's own visible reason.
 */
export function missingMetaRootReason(repoRoot = REPO_ROOT) {
  const poStatePath = path.join(repoRoot, '.prdt/po-state.json')
  if (!fs.existsSync(poStatePath)) {
    return `no meta project beside this checkout — ${poStatePath} not found (repoRoot resolved to ${repoRoot})`
  }
  return null
}

const TOKENS_PATH = path.join(GUI_ROOT, 'src/styles/tokens.css')
export const OUTPUT_PATH = path.join(__dirname, 'viewer.html')
export const GEN_COMMAND = 'pnpm --filter @productune/gui viewer'

const PRETENDARD_STATIC_DIR = path.join(GUI_ROOT, 'node_modules/pretendard/dist/web/static/woff2')
const REGULAR_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-Regular.woff2')
const SEMIBOLD_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-SemiBold.woff2')

/**
 * Deterministic: same repo content on disk → same output bytes (T-665
 * acceptance line 4). No timestamps, no generation-time randomness — the
 * only "when" information on the page is data already on disk (ticket
 * `created`/`closed`, artifact `added_at`, etc.), never "generated at".
 * @returns {Promise<{ html: string }>}
 */
export async function generate({ repoRoot = REPO_ROOT } = {}) {
  const tokensBuf = fs.readFileSync(TOKENS_PATH)
  const tokensCss = tokensBuf.toString('utf8')
  const tokensSha256 = crypto.createHash('sha256').update(tokensBuf).digest('hex')

  const { darkRaw, lightRaw } = buildRawThemeMaps(tokensCss)
  const dark = resolveVarChains(darkRaw)
  const light = resolveVarChains(lightRaw)

  // Generation-time template guards (T-665 slice 2 acceptance line 3 — same
  // shape as ds/generate.mjs's: zero hex/rgb literals in the template CSS,
  // every var() it uses declared in tokens.css).
  const guardErrors = templateGuardErrors(dark)
  if (guardErrors.length > 0) {
    throw new Error(`viewer generate: ${guardErrors.join('; ')}`)
  }

  const data = collectAll(repoRoot)

  // T-666 slice 2b: the path from the generated page's own directory back to
  // the repo root — every relative link inside a rendered document body
  // (render.mjs's `resolveDocLink`) is rewritten onto this, rather than
  // being left to resolve against OUTPUT_PATH's own folder. Only this module
  // knows where OUTPUT_PATH lives on disk, so it is computed once here.
  // `artifactsBaseHref` (T-666 slice 1b) is exactly `${repoRootHref}/docs/artifacts`
  // — derived from the SAME relative-path computation rather than a second
  // one (doctrine #2).
  const repoRootHref = path.relative(path.dirname(OUTPUT_PATH), repoRoot).split(path.sep).join('/') || '.'
  const artifactsBaseHref = `${repoRootHref}/docs/artifacts`

  const draft = renderPage({ data, dark, light, fontFaceCss: '', tokensSha256, artifactsBaseHref, repoRootHref })
  const usedText = collectUsedChars(draft)

  const regularBuffer = fs.readFileSync(REGULAR_WOFF2)
  const semiboldBuffer = fs.readFileSync(SEMIBOLD_WOFF2)
  const fontFaceCss = await buildPretendardFontFaceCss({ regularBuffer, semiboldBuffer, usedText })

  const html = renderPage({ data, dark, light, fontFaceCss, tokensSha256, artifactsBaseHref, repoRootHref })
  return { html }
}

/** @returns {Promise<{ upToDate: boolean, html: string }>} */
export async function checkUpToDate({ repoRoot = REPO_ROOT } = {}) {
  const { html } = await generate({ repoRoot })
  const committed = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null
  return { upToDate: committed === html, html }
}
