// viewer/generate.mjs — orchestrates the one-page repo viewer (T-665).
// Reads ONLY: tokens.css + the two static Pretendard woff2 files (via the
// SAME lib/parse-tokens + lib/font-subset modules T-689's DS generator uses — no second parser/subsetter)
// plus the repo's own canonical sources (docs/prd, docs/tickets, docs/wiki,
// docs/features, docs/artifacts/manifest.json, .prdt/po-state.json) via
// viewer/lib/collect.mjs. Never a runtime fetch — everything above is read
// at GENERATION time and embedded in the output file.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildRawThemeMaps, resolveVarChains } from './lib/parse-tokens.mjs'
import subsetFont from 'subset-font'
import { collectUsedChars, buildPretendardFontFaceCss } from './lib/font-subset.mjs'
import { collectAll } from './lib/collect.mjs'
import { renderPage, templateGuardErrors, pastTicketDataFiles, pastTicketDataContent, buildFileContent } from './lib/render.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// T-718: computed relative to THIS file's own location, never from a
// hardcoded directory-name literal — a fresh checkout can land at any path
// (a detached `git worktree add` names it whatever the caller passed), so
// nothing downstream may assume the checkout root itself is named "code" (or
// any other literal).
// T-871: the generator is its own workspace package (`@productune/viewer`) so
// `prdt` install/update can install ONLY its dependencies (marked ·
// subset-font · pretendard), never the GUI's (electron). It still reads the
// GUI's tokens.css — the one token source — from the sibling package.
export const VIEWER_ROOT = __dirname
export const GUI_ROOT = path.resolve(VIEWER_ROOT, '../gui')
// code/packages/viewer -> code -> productune (repo root, where docs/ and
// .prdt/ live — the viewer reads the WHOLE repo, not just a package).
export const REPO_ROOT = path.resolve(VIEWER_ROOT, '../../..')

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
export const GEN_COMMAND = 'pnpm --filter @productune/viewer viewer'

const PRETENDARD_STATIC_DIR = path.join(VIEWER_ROOT, 'node_modules/pretendard/dist/web/static/woff2')
const REGULAR_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-Regular.woff2')
const SEMIBOLD_WOFF2 = path.join(PRETENDARD_STATIC_DIR, 'Pretendard-SemiBold.woff2')

/**
 * Deterministic: same repo content on disk → same output bytes (T-665
 * acceptance line 4). No timestamps, no generation-time randomness — the
 * only "when" information on the page is data already on disk (ticket
 * `created`/`closed`, artifact `added_at`, etc.), never "generated at".
 * T-885: also returns `dataFiles` — one past-version ticket data file per
 * bucket, written NEXT TO `outputPath` (`name` is a bare file name).
 * @returns {Promise<{ html: string, dataFiles: Array<{ name: string, content: string }>, buildFile: { name: string, content: string } }>}
 */
export async function generate({ repoRoot = REPO_ROOT, outputPath = OUTPUT_PATH, disciplineRoot } = {}) {
  const tokensBuf = fs.readFileSync(TOKENS_PATH)
  const tokensCss = tokensBuf.toString('utf8')
  const tokensSha256 = crypto.createHash('sha256').update(tokensBuf).digest('hex')

  const { darkRaw, lightRaw } = buildRawThemeMaps(tokensCss)
  const dark = resolveVarChains(darkRaw)
  const light = resolveVarChains(lightRaw)

  // Generation-time template guards (T-665 slice 2 acceptance line 3 — same
  // shape as the GUI's ds/generate.mjs's: zero hex/rgb literals in the template CSS,
  // every var() it uses declared in tokens.css).
  const guardErrors = templateGuardErrors(dark)
  if (guardErrors.length > 0) {
    throw new Error(`viewer generate: ${guardErrors.join('; ')}`)
  }

  const data = collectAll(repoRoot, { disciplineRoot })

  // T-666 slice 2b: the path from the generated page's own directory back to
  // the repo root — every relative link inside a rendered document body
  // (render.mjs's `resolveDocLink`) is rewritten onto this, rather than
  // being left to resolve against OUTPUT_PATH's own folder. Only this module
  // knows where OUTPUT_PATH lives on disk, so it is computed once here.
  // `artifactsBaseHref` (T-666 slice 1b) is exactly `${repoRootHref}/docs/artifacts`
  // — derived from the SAME relative-path computation rather than a second
  // one (doctrine #2).
  // T-746: `outputPath` is where THIS page will be written — the installed
  // `prdt` writes each project's viewer under that project's own
  // `.prdt/scratch/viewer/` (a project with no code checkout beside it has
  // no `packages/gui/viewer/` to write into), so the relative hrefs are
  // computed from the real destination, never from this module's own folder.
  const repoRootHref = path.relative(path.dirname(outputPath), repoRoot).split(path.sep).join('/') || '.'
  const artifactsBaseHref = `${repoRootHref}/docs/artifacts`

  const viewerAbsPath = path.resolve(outputPath)
  // T-885 (T-876 = D): past-version ticket bodies go to sibling data files;
  // the page carries only the bucket → src map, generator-written.
  const prefix = path.basename(outputPath).replace(/\.html?$/i, '')
  const pastFiles = pastTicketDataFiles(data.tickets, { repoRootHref, viewerAbsPath, prefix, discipline: data.discipline })
  const pastTicketSrc = {}
  for (const f of pastFiles) pastTicketSrc[f.bucket] = encodeURIComponent(f.name)
  const draft = renderPage({ data, dark, light, fontFaceCss: '', tokensSha256, artifactsBaseHref, repoRootHref, viewerAbsPath, pastTicketSrc })
  const usedText = collectUsedChars(draft)

  const regularBuffer = fs.readFileSync(REGULAR_WOFF2)
  const semiboldBuffer = fs.readFileSync(SEMIBOLD_WOFF2)
  const fontFaceCss = await buildPretendardFontFaceCss({ regularBuffer, semiboldBuffer, usedText })

  const htmlNoBuild = renderPage({ data, dark, light, fontFaceCss, tokensSha256, artifactsBaseHref, repoRootHref, viewerAbsPath, pastTicketSrc })
  // The data-file bodies render in this page, so the font must paint them
  // too — but folding every past body's glyphs into the page's own subset
  // would grow viewer.html by ~80KB (measured). Each data file instead
  // carries the glyphs its bodies use that the page subset lacks.
  const pageChars = new Set(usedText)
  const dataFiles = []
  for (const f of pastFiles) {
    const extra = [...new Set(collectUsedChars(f.bodies.join('\n')))].filter((c) => !pageChars.has(c) && !/\s/.test(c))
    const payload = { tickets: f.tickets }
    if (extra.length > 0) payload.font = await supplementFont(extra, regularBuffer, semiboldBuffer)
    dataFiles.push({ name: f.name, content: pastTicketDataContent(f.bucket, payload) })
  }
  // T-803 (T-897 = B): the build id is a content hash of the page and its data
  // files, so it moves exactly when the viewer file's content does. The page
  // embeds it; the sibling build file (written LAST) carries the same id.
  const hash = crypto.createHash('sha256').update(htmlNoBuild)
  for (const f of dataFiles) hash.update('\0' + f.name + '\0' + f.content)
  const id = hash.digest('hex').slice(0, 16)
  const buildName = `${prefix}.build.js`
  const html = renderPage({ data, dark, light, fontFaceCss, tokensSha256, artifactsBaseHref, repoRootHref, viewerAbsPath, pastTicketSrc, build: { id, src: encodeURIComponent(buildName) } })
  return { html, dataFiles, buildFile: { name: buildName, content: buildFileContent(id) } }
}

async function supplementFont(chars, regularBuffer, semiboldBuffer) {
  const cps = chars.map((c) => c.codePointAt(0)).sort((a, b) => a - b)
  const text = cps.map((cp) => String.fromCodePoint(cp)).join('')
  const [regular, semibold] = await Promise.all([
    subsetFont(regularBuffer, text, { targetFormat: 'woff2' }),
    subsetFont(semiboldBuffer, text, { targetFormat: 'woff2' }),
  ])
  const range = cps.map((cp) => `U+${cp.toString(16).toUpperCase()}`).join(',')
  return { range, regular: regular.toString('base64'), semibold: semibold.toString('base64') }
}

/** T-885: matches only this page's own data files (`<prefix>.tickets-<bucket>.js`). */
export function isPastTicketDataFileName(outputPath, name) {
  const prefix = path.basename(outputPath).replace(/\.html?$/i, '')
  return name.startsWith(`${prefix}.tickets-`) && name.endsWith('.js')
}

/** @returns {Promise<{ upToDate: boolean, html: string }>} */
export async function checkUpToDate({ repoRoot = REPO_ROOT, outputPath = OUTPUT_PATH, disciplineRoot } = {}) {
  const { html, dataFiles, buildFile } = await generate({ repoRoot, outputPath, disciplineRoot })
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null)
  const dir = path.dirname(outputPath)
  const upToDate = read(outputPath) === html && [...dataFiles, buildFile].every((f) => read(path.join(dir, f.name)) === f.content)
  return { upToDate, html }
}
