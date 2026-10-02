// viewer/lib/render.mjs — builds the one-page viewer HTML.
//
// Wears the product's tokens per dispatch: imports the SAME parser the DS
// generator uses (lib/parse-tokens.mjs) rather than a second one, and the
// same font-subsetting module (lib/font-subset.mjs) — T-659 Outcome
// §확정 DS HTML 생성 명세: "파서 · 테마 재방출 · 글꼴 부분집합은 한 모듈이고
// T-665 뷰어 생성기가 같은 모듈로 제품의 얼굴을 입는다".
//
// T-666 slice 1a: the page now carries one inline <script> plus one embedded
// `<script type="application/json" id="detail-data">` blob — the app shell
// (activity bar → sidebar group → list → detail panel) the user approved in
// docs/artifacts/v1.10/define-screen-set.html needs real interactivity that
// a script-free page cannot provide (T-665 slice 1's "no <script> anywhere"
// rule is retired here, on purpose — see below for what still holds instead).
// "no console error" and "zero network requests" (the two acceptance lines
// that rule used to make trivially true) still hold: the script never
// fetches anything (all its data is already embedded at generation time) and
// is exercised end-to-end by tests/viewer-html.window.spec.ts's @window
// suite, which asserts exactly those two properties against the real,
// rendered-in-Chrome page — evidence, not an argument from the script being
// absent.
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { marked, Renderer, Tokenizer } from 'marked'
import {
  STORE_LABEL,
  COMMON,
  PAGE,
  HOME,
  PROGRESS_OUT_OF_SCOPE_LABEL,
  DETAIL_FIELD_LABELS,
  TICKET,
  WIKI,
  FEATURE,
  GLOSSARY,
  RELEASE,
  DISCIPLINE,
  readFieldValue,
  ARTIFACT,
  PRD,
  FILE_HREF_NOTE,
  HASH_NOTICE,
  THEME_TOGGLE,
  noGroupLabel,
} from './labels.mjs'
import { buildDisciplineIndex, linkDisciplineText, linkDisciplineCode } from './discipline-links.mjs'
import { HOME_STAGES, stageSegments, buildHomeGraph, layoutHomeGraph, waitLists, compareTicketIds, NODE_W, NODE_H } from './home-graph.mjs'
import { renderPrdReading, openDecisionTickets, PRD_READING_CSS, PRD_READING_SCRIPT } from './prd-reading.mjs'

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Generation-time template guards — same shape as ds/lib/render.mjs's
// (T-659 Outcome §생성 명세 "템플릿 규칙": template CSS is var(--…) only, zero
// hex/rgb literals, and every var() it uses must exist in tokens.css).
// T-665 slice 1 followed the rule by hand-authoring TEMPLATE_CSS to it but
// left it unenforced (see the ticket's outcome §미해결); slice 2 enforces it
// AND makes the enforcement itself testable — each function takes the CSS
// text as an optional argument (defaulting to the real TEMPLATE_CSS below)
// so a test can hand it a broken fixture directly, without needing to mutate
// this module's internals or mock the filesystem.

/** Every var() name `css` references. @param {string} [css] */
export function templateCssVarNames(css = TEMPLATE_CSS) {
  const names = new Set()
  for (const m of css.matchAll(/var\(\s*--([a-zA-Z0-9-]+)\s*\)/g)) names.add(m[1])
  return names
}

/**
 * A literal hex color OR a literal rgb()/rgba() FUNCTION CALL (not the
 * `--name` custom-property identifiers, which legitimately start with "--"
 * and may contain hyphens — this only flags `#`-hex tokens and an actual
 * `rgb(`/`rgba(` call written directly in the template).
 * @param {string} [css]
 */
export function templateCssHasHexOrRgbLiteral(css = TEMPLATE_CSS) {
  return /#[0-9a-fA-F]{3,8}\b/.test(css) || /\brgba?\(/.test(css)
}

/**
 * Runs both guards against `css` and returns every problem found (empty =
 * clean) — the one function `viewer/generate.mjs` calls to decide whether to
 * throw, and the one a test calls directly with a broken fixture to prove
 * the guard fires.
 * @param {{has(name: string): boolean}} declaredNames every --name tokens.css declares (e.g. the resolved dark map)
 * @param {string} [css]
 * @returns {string[]}
 */
export function templateGuardErrors(declaredNames, css = TEMPLATE_CSS) {
  const errors = []
  if (templateCssHasHexOrRgbLiteral(css)) {
    errors.push('template CSS contains a hex or rgb()/rgba() literal')
  }
  for (const name of templateCssVarNames(css)) {
    if (!declaredNames.has(name)) {
      errors.push(`template CSS references var(--${name}), which tokens.css does not declare`)
    }
  }
  return errors
}

// This page embeds hundreds of real documents (ticket/wiki/artifact prose)
// this generator does not author. marked passes RAW inline/block HTML through
// verbatim by default (measured 2026-09-26: a bare `<script>` or `<img
// onerror=…>` in source markdown renders live) — an actual `<script>` landing
// in the page would break the "no console error"/"zero network requests"
// acceptance lines and is a real risk over 840 ticket + 60 wiki + artifact
// files this generator does not control the wording of. The renderer escapes
// every literal HTML token instead of passing it through; a document that
// legitimately wants to SHOW a tag does so inside a backtick/fenced code span,
// which marked already escapes on its own path (verified above the fold in
// viewer/lib/render.test.mjs).
const hardenedRenderer = new Renderer()
// T-861: marked's GFM `del` accepts a single-tilde pair, so range notation
// (`Phase 1~3(v0.1~v0.4)`) rendered struck-through. Only `~~text~~` strikes:
// same rule as marked 16.4.2's own, with the delimiter fixed to two tildes.
// (Returning undefined, not false, keeps marked from falling back to its own.)
const DEL_DOUBLE_TILDE = /^~~(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))~~(?=[^~]|$)/
const strictDelTokenizer = new Tokenizer()
strictDelTokenizer.del = function (src) {
  const cap = DEL_DOUBLE_TILDE.exec(src)
  if (!cap) return undefined
  return { type: 'del', raw: cap[0], text: cap[1], tokens: this.lexer.inlineTokens(cap[1]) }
}
hardenedRenderer.html = (token) => escapeHtml(typeof token === 'string' ? token : (token.text ?? token.raw ?? ''))

// T-666 slice 1a acceptance line 3: "section headings render as chips by one
// shared rule across every document kind." One override, on the one
// `hardenedRenderer` every document kind already flows through via `md()`
// below — h1/h2/h3 get the design system's `.pill .pill-heading-N` classes
// (docs/artifacts/v1.10/define-screen-set.html ~line 343-348, user-approved
// 2026-09-21); h4+ (real ticket bodies use `####` for their `###`-nested
// amendments, per contracts §Tickets, one level deeper than this generator's
// own h1-wrapped titles) used to collapse to the same chip as h3 — T-884 (root
// cause of "h3 and h4 look the same", T-860): `Math.min(depth, 3)` below.
// h4+ now has its own, quieter style (`.pill-heading-4`). marked 16.4.2's token-object renderer
// API (`{tokens, depth}`, not the older `(text, level)` pair) — verified
// against this repo's installed marked (16.4.2) before writing this.
hardenedRenderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens)
  const level = Math.min(depth, 4)
  return `<h${depth} class="pill pill-heading-${level}">${text}</h${depth}>\n`
}

// marked 16.4.2's own paragraph tokenizer only strips a single trailing
// newline, never the CommonMark-required "remove initial and final
// whitespace" from a paragraph's raw content (verified against this repo's
// installed marked: marked.lexer('  x \n\n') keeps the leading two spaces
// and the trailing space in the paragraph token's own text). T-709 결정 2
// surfaced this: a closed PRD round with no heading renders its first
// non-empty line directly as prose (no more separately-extracted/trimmed
// title column), so a stray leading/trailing space a stub round's source
// file happens to carry must not leak into the rendered `<p>`. Trimming the
// assembled inline HTML at the paragraph boundary (never touching interior
// whitespace, so a real hard-break `<br>` from a trailing double-space
// elsewhere in the paragraph is untouched) is a general CommonMark-
// compliance fix, not PRD-specific — every document kind flows through this
// same `hardenedRenderer` via `md()`.
hardenedRenderer.paragraph = function ({ tokens }) {
  return `<p>${this.parser.parseInline(tokens).trim()}</p>\n`
}

// T-666 slice 2b acceptance line 3: "relative document links inside rendered
// bodies either open the linked document inside the viewer or point to the
// real file — none resolves against viewer.html's own folder." Every body
// this generator embeds (ticket/wiki/feature/PRD/artifact prose) is authored
// as if it still lived at its own repo path (docs/prd/PRD.md links to
// `./versions/v1.9.md`, meaning "next to me"); marked's default renderer
// passes that href straight through, which the BROWSER then resolves against
// `viewer.html`'s own directory (`code/packages/viewer/`) — a file that
// does not exist there. `repoRootHref` (the path from the generated page's
// own directory back to the repo root, computed once in generate.mjs from
// OUTPUT_PATH — see `renderPage`) plus the source document's own
// repo-root-relative directory is enough to rewrite the href to the real
// file, chosen over "open inside the viewer" (also legal per the acceptance
// line) because the viewer has no per-document-kind in-page router today —
// doctrine #1, build what's needed now.
const DEFAULT_REPO_ROOT_HREF = '../../..'

// T-711 slice 4 (T-722 결정, 사용자 verbatim "722 a"): B1 (%2e%2e), B3
// (manifest %-encoded dot segments) and B4 (a trailing `..?x`/`..#x` segment)
// were three rounds of the SAME defect class — a string reimplementation of
// what a browser's own href resolution does, each fix only closing the exact
// shape QA had reproduced so far. `isHrefContained` below replaces all of
// that special-casing with the one check that actually matters: hand the
// FINAL, already-assembled href to `new URL()` — the real WHATWG algorithm a
// browser runs (`?`/`#` splitting, %-decoding of dot segments, `..`
// collapsing, all included) — against `viewerAbsPath`'s own real `file://`
// location, then ask only "is the resulting pathname still inside the
// allowed root?". `viewerAbsPath` defaults to THIS module's own file's real,
// on-disk location one directory up (`viewer/lib/render.mjs` ->
// `viewer/viewer.html`) — computed from `import.meta.url`, never a hardcoded
// path literal (T-718: a checkout can live anywhere) — which is always deep
// enough on a real filesystem that no legitimate `repoRootHref` traversal
// clamps at the OS root and gets mistaken for "still contained".
const DEFAULT_VIEWER_ABS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer.html')

/**
 * Whether `href` — an already-assembled, `repoRootHref`-relative string, the
 * literal value about to be written into `href="…"`/`src="…"` — resolves,
 * via the browser's own `new URL(href, base)` resolution against
 * `viewerAbsPath`'s real `file://` location, to a path still inside
 * `repoRootHref`'s own resolved directory (optionally narrowed to
 * `rootSubpath` beneath it — `'docs'` for a fileHref, which only ever needs
 * to point inside `docs/`, never the whole repo). The "allowed root" is
 * derived from the SAME base + the SAME `new URL()` algorithm as the href
 * being judged, rather than a second, independent path computation that
 * could itself drift from what a real browser does.
 * @param {string} href
 * @param {object} [opts]
 * @param {string} [opts.repoRootHref]
 * @param {string} [opts.rootSubpath]
 * @param {string} [opts.viewerAbsPath]
 * @returns {boolean}
 */
export function isHrefContained(href, { repoRootHref = DEFAULT_REPO_ROOT_HREF, rootSubpath = '', viewerAbsPath = DEFAULT_VIEWER_ABS_PATH } = {}) {
  const viewerFileUrl = pathToFileURL(viewerAbsPath)
  let resolved
  let rootUrl
  try {
    resolved = new URL(href, viewerFileUrl)
    rootUrl = new URL(rootSubpath ? `${repoRootHref}/${rootSubpath}/` : `${repoRootHref}/`, viewerFileUrl)
  } catch {
    return false
  }
  if (resolved.protocol !== 'file:') return false
  return resolved.pathname === rootUrl.pathname || resolved.pathname.startsWith(rootUrl.pathname)
}

/**
 * `href` resolved against `sourceDirRel` (the source document's own
 * repo-root-relative directory) and rebased onto `repoRootHref`, or `null`
 * when `href` is not a plain repo-relative link this generator can safely
 * rewrite: an anchor (`#…`), protocol-relative (`//…`), a URL with a scheme
 * (`https:`, `mailto:`, …), a site-absolute path (`/…` — relative to some
 * assumed server root this generator does not control), or a path that
 * would resolve outside the repo root entirely (`../` walking past it) —
 * "leave untouched if it escapes the repo root", never rewritten past it.
 * `path.posix.normalize` below only builds a clean, human-inspectable
 * candidate string — the CONTAINMENT DECISION itself is `isHrefContained`'s
 * alone, judged on that final candidate the same way a real browser would
 * (T-711 slice 4).
 * @param {string} href
 * @param {string} sourceDirRel
 * @param {string} repoRootHref
 * @param {string} [viewerAbsPath]
 * @returns {string|null}
 */
export function resolveDocLink(href, sourceDirRel, repoRootHref, viewerAbsPath = DEFAULT_VIEWER_ABS_PATH) {
  if (!href) return null
  if (/^(#|\/\/|\/)/.test(href)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  const hashIdx = href.indexOf('#')
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const hashPart = hashIdx === -1 ? '' : href.slice(hashIdx)
  if (!pathPart) return null
  const resolved = path.posix.normalize(path.posix.join(sourceDirRel, pathPart))
  const candidate = safeEncodeURI(`${repoRootHref}/${resolved}${hashPart}`)
  return isHrefContained(candidate, { repoRootHref, viewerAbsPath }) ? candidate : null
}

/**
 * Decodes EACH `/`-separated segment of `p` independently — the URL
 * Standard's own "double-dot URL path segment" rule treats a %-encoded or
 * mixed dot segment (`%2e%2e`, `.%2e`, `%2e.`, any case) as a real `..` the
 * same as a literal one to a REAL BROWSER resolving an href later, even
 * though `path.resolve`/`path.posix.normalize` (which know nothing about
 * %-encoding) see `%2e%2e` as an opaque, un-collapsible segment. Used by
 * `collect.mjs`'s `isContainedArtifactPath` (T-711 slice 3 B3) — a
 * FILESYSTEM containment check (`path.resolve`, no browser or `?`/`#`
 * delimiter involved), so it stays on this decode rule rather than
 * `isHrefContained` above, which is specifically about how a browser
 * resolves an HREF (T-711 slice 4: `resolveDocLink` moved onto that instead,
 * see its own comment). A malformed escape is left as its literal segment —
 * still checked, never silently dropped.
 * @param {string} p
 */
export function decodePathSegments(p) {
  return (p ?? '')
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join('/')
}

/**
 * Builds an href segment-by-segment from `relPath`, a REAL FILESYSTEM PATH
 * (a ticket/artifact rel path collect.mjs read off disk or a manifest row —
 * never authored markdown prose), encoding EACH `/`-separated segment fresh
 * with `encodeURIComponent` rather than `safeEncodeURI`'s pass-through.
 * `safeEncodeURI` exists to respect an AUTHOR's own intentional %-escape in
 * a hand-written markdown link (T-711 C3) — wrong here, where a literal `%`
 * byte already in a real filename (a file actually named `a%20b.html`) must
 * itself be escaped to `%25` like any other special character. Passed
 * through instead, a browser decodes that `%20` back into a space on
 * navigation and opens `a b.html`, a file that does not exist (T-711 slice 3
 * acceptance line 2). `/` segment separators are preserved, never escaped to
 * `%2F`.
 * @param {string} relPath
 */
export function encodeFsPathHref(relPath) {
  return String(relPath ?? '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/**
 * `candidateHref` (a `fileHref` already built from a real, on-disk relative
 * path — `ticketDetailEntries`/`artifactDetailEntries` below, never authored
 * markdown) if `isHrefContained` finds it still inside `docs/` (T-711 slice 4
 * acceptance: "or docs/ for fileHref"), else `undefined` — the exact shape
 * both callers already treat as "no fileHref" (INTERACTION_SCRIPT's own
 * `FILE_HREF_NOTE` fallback, unchanged by this). Structurally these two
 * candidates cannot escape `docs/` today (readdir'd disk paths, or a
 * manifest row `collect.mjs` already vetted) — this is defense in depth, the
 * SAME one check the markdown-link/image path above is judged by, applied
 * here too rather than trusting the caller's own construction never to drift.
 * @param {string} candidateHref
 * @param {string} repoRootHref
 * @returns {string|undefined}
 */
function containedFileHref(candidateHref, repoRootHref) {
  return isHrefContained(candidateHref, { repoRootHref, rootSubpath: 'docs', viewerAbsPath: pageViewerAbsPath }) ? candidateHref : undefined
}

/**
 * `encodeURI`, but leaves an already-valid percent-encoded byte pair
 * (`%20`, `%C3%A9`, …) intact instead of re-escaping its leading `%` into
 * `%25` (T-711 C3/acceptance "a rewritten relative href keeps an already
 * %-encoded path intact, no %25") — `encodeURI` alone always escapes a
 * literal `%` (it is not in its unreserved set), so a SOURCE markdown link
 * that is already percent-encoded (e.g. a filename with a space written
 * `%20`) would otherwise come out double-encoded (`%2520`).
 * @param {string} str
 */
export function safeEncodeURI(str) {
  return str.replace(/%[0-9a-fA-F]{2}|[^%]+|%/g, (chunk) => (/^%[0-9a-fA-F]{2}$/.test(chunk) ? chunk : encodeURI(chunk)))
}

// ---------- link/image scheme allowlist (T-711 F1/F4) ----------
// marked's default renderer passes ANY href straight into `href="…"`/`src="…"`
// verbatim (measured: `javascript:`, `JaVaScRiPt:`, `data:`, `vbscript:`, an
// autolink `<javascript:…>`, `file://`, a protocol-relative `//host`, and a
// site-absolute `/etc/passwd` all survive unchanged into a real, clickable
// anchor — the ticket's C1/F1/F4). Only these three schemes, plus a
// same-document `#anchor`, are ever safe to keep as a REAL link exactly as
// written; a repo-relative link instead goes through `resolveDocLink` above.
// Anything else renders as plain text below — never a live anchor, never
// silently dropped.
const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/** @param {string} href */
function schemeOf(href) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(href || '')
  return m ? `${m[1].toLowerCase()}:` : null
}

/** `href` is safe to render as a real `<a href>` AS-IS (never rewritten): an allowed scheme, or a same-document `#anchor`. */
function isAllowedRawHref(href) {
  if (!href) return false
  if (href.startsWith('#')) return true
  const scheme = schemeOf(href)
  return scheme !== null && ALLOWED_LINK_SCHEMES.has(scheme)
}

// marked.parse() gives its renderer no way to receive extra per-call
// context, so `md()` stashes the current document's own directory + the
// page's repoRootHref here right before parsing — safe because generation
// is single-threaded and synchronous (no md() call is ever in flight while
// another starts).
let linkContext = { sourceDirRel: '', repoRootHref: DEFAULT_REPO_ROOT_HREF, disc: null }
// T-886: the discipline documents' name index (discipline-links.mjs), built once per
// page from the collected documents; a body links names only when its md() call asks
// (ticket · wiki · PRD bodies — the three the acceptance names).
let pageDisciplineIndex = null
// T-746: where the page being rendered will live on disk — every containment
// check below judges an href against THIS location (the installed `prdt`
// writes a project's viewer under its own `.prdt/scratch/viewer/`, not next
// to this module). Set once per `renderPage` call; same single-threaded,
// synchronous-generation reasoning as `linkContext` above.
let pageViewerAbsPath = DEFAULT_VIEWER_ABS_PATH

// T-886: discipline names in running text and in a code span that is just one name
// become links (discipline-links.mjs). Never inside another link's text (no anchor
// inside an anchor — `link` below switches it off while it renders its own text)
// and never in a fenced block, whose renderer this does not touch.
const defaultTextRender = Renderer.prototype.text
hardenedRenderer.text = function (token) {
  if (linkContext.disc && !('tokens' in token && token.tokens) && !token.escaped) {
    const linked = linkDisciplineText(token.text, linkContext.disc, (seg) => defaultTextRender.call(this, { type: 'text', raw: seg, text: seg, escaped: false }))
    if (linked !== null) return linked
  }
  return defaultTextRender.call(this, token)
}
hardenedRenderer.codespan = function ({ text }) {
  const linked = linkContext.disc ? linkDisciplineCode(text, linkContext.disc) : null
  return linked ?? `<code>${escapeHtml(text)}</code>`
}

hardenedRenderer.link = function ({ href, title, tokens }) {
  const outerDisc = linkContext.disc
  linkContext.disc = null
  const text = this.parser.parseInline(tokens)
  linkContext.disc = outerDisc
  const rewritten = resolveDocLink(href, linkContext.sourceDirRel, linkContext.repoRootHref, pageViewerAbsPath)
  if (rewritten !== null) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    return `<a href="${escapeHtml(rewritten)}" target="_blank" rel="noopener"${titleAttr}>${text}</a>`
  }
  if (isAllowedRawHref(href)) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const isAnchor = href.startsWith('#')
    return `<a href="${escapeHtml(href)}"${isAnchor ? '' : ' target="_blank" rel="noopener"'}${titleAttr}>${text}</a>`
  }
  // Disallowed scheme (javascript:/data:/vbscript:/…, an autolink included),
  // a site-absolute path, a protocol-relative //host, or a relative path
  // escaping the repo root (F1/F4) — never a live anchor; the link text
  // still renders, as plain prose.
  return text
}

// T-711 acceptance line 1: "a relative image either resolves like a
// rewritten doc link or renders as its alt text" — marked's own default
// image renderer (i) passes ANY href straight into `src="…"` (an external
// `https://…` fires a real network request on load — F2/C1 — and it does
// not even escape `alt`/`title`, so `![x" onerror=alert(1)](http://e)` broke
// out of the attribute — MEASURED against this repo's installed marked).
// Only a href `resolveDocLink` can rewrite onto a real repo-root-relative
// path is ever allowed to become a live `<img src>`; anything else (any
// remote URL, an absolute/protocol-relative path, or a relative path
// escaping the repo root) renders as its (escaped) alt text instead — never
// a request, never an unescaped attribute.
hardenedRenderer.image = function ({ href, title, text, tokens }) {
  const altSource = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text
  const alt = escapeHtml(altSource)
  const rewritten = resolveDocLink(href, linkContext.sourceDirRel, linkContext.repoRootHref, pageViewerAbsPath)
  if (rewritten === null) return alt
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<img src="${escapeHtml(rewritten)}" alt="${alt}"${titleAttr}>`
}

/**
 * @param {string} text
 * @param {string} [sourceDirRel] the source document's own repo-root-relative
 *   directory (e.g. "docs/prd" for docs/prd/PRD.md) — every relative link
 *   `text` contains is resolved against this, never against viewer.html's own.
 * @param {string} [repoRootHref] path from the generated page's own directory
 *   back to the repo root (see `renderPage`).
 * @param {{discipline?: boolean}} [opts] `discipline`: link the names of discipline documents (T-886).
 */
function md(text, sourceDirRel = '', repoRootHref = DEFAULT_REPO_ROOT_HREF, { discipline = false } = {}) {
  linkContext = { sourceDirRel, repoRootHref, disc: discipline ? pageDisciplineIndex : null }
  return marked.parse(text ?? '', { gfm: true, renderer: hardenedRenderer, tokenizer: strictDelTokenizer })
}

/**
 * T-797 개정 (사용자 축자 "라이트 기본에 마지막 설정 따르게"): the page is
 * light by default and follows the viewer's own toggle, never the OS —
 * `:root` carries the LIGHT token set, `:root[data-theme="dark"]` the dark
 * one. THEME_HEAD_SCRIPT sets `data-theme` from the remembered choice before
 * the body paints. Both maps are still `resolveVarChains(buildRawThemeMaps(…))`
 * output from tokens.css, never a hand copy.
 *
 * Former T-797 slice-1 note, kept for history: `:root` carried the dark token set as the page's baseline
 * (dark-first, same convention tokens.css itself uses — its own header:
 * "dark is the :root default"), then `@media (prefers-color-scheme: light)`
 * overrides it with the light set — the SAME two-block shape tokens.css
 * uses, not a JS-driven class toggle: this page ships no runtime theme
 * switcher (no script writes a `.v-light`/`.theme-light` class anywhere),
 * so a class-scoped var block the page never applies is dead weight that
 * always renders dark regardless of the OS setting — the exact defect this
 * ticket reports. `dark`/`light` are `resolveVarChains(buildRawThemeMaps(…))`
 * output — the same parser tokens.css's own DS generator consumes
 * (lib/parse-tokens.mjs) — so the light set here can never drift from
 * tokens.css as a hand copy.
 */
function emitRootThemeCss(dark, light) {
  const darkLines = [...dark.entries()].map(([name, value]) => `  --${name}: ${value};`)
  const lightLines = [...light.entries()].map(([name, value]) => `  --${name}: ${value};`)
  return `:root {\n${lightLines.join('\n')}\n}\n:root[data-theme="dark"] {\n${darkLines.join('\n')}\n}`
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

// ---------- app shell (T-666 slice 1a) ----------
// One activity bar, global — it never repeats per store (unlike the mockup's
// per-screen snapshots, which had to duplicate it because each screen there
// is an independent static frame). Icons copied byte-for-byte from the
// approved mockup (docs/artifacts/v1.10/define-screen-set.html ~line
// 621-627) — doctrine #2, don't re-draw what is already signed off.
// T-880 = A: 현재 버전(home) · PRD · 티켓 · 위키 · 기능 · 아티팩트 · 용어 사전 ·
// 릴리즈 노트 · 규율 — the discipline store (T-886) lands last, after 'release'.
const STORE_ORDER = ['home', 'prd', 'ticket', 'wiki', 'feature', 'artifact', 'glossary', 'release', 'disc']
const STORE_ICON_PATHS = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  prd: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
  ticket: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M15 8h-5"/><path d="M15 12h-5"/>',
  wiki: '<path d="M12 7c-2-2-5-3-9-3v14c4 0 7 1 9 3 2-2 5-3 9-3V4c-4 0-7 1-9 3Z"/><path d="M12 7v14"/>',
  feature: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V4"/>',
  // T-883: copied from the approved mockup (define-screen-set.html 「용어 사전」 · 「릴리즈 노트」 activity buttons).
  glossary: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="m8 13 4-7 4 7"/><path d="M9.1 11h5.7"/>',
  release: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  // T-886: copied from the approved screen set (define-screen-set.html 「규율」 activity button).
  disc: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  artifact:
    '<path d="M21 8.5v7a1 1 0 0 1-.5.87l-8 4.62a1 1 0 0 1-1 0l-8-4.62A1 1 0 0 1 3 15.5v-7a1 1 0 0 1 .5-.87l8-4.62a1 1 0 0 1 1 0l8 4.62a1 1 0 0 1 .5.87Z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
}
const CLOSE_ICON_PATH = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
const MOON_ICON_PATH = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
const SUN_ICON_PATH = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'

// T-806: sits at the bottom of the activity rail (T-797 first placed it in
// the topstrip's top-right slot; a detail-panel open — ticket/PRD/artifact/
// wiki item — overlays that slot, hiding it — see the .activity-theme-toggle
// CSS comment above). The moon shows in light (press → dark), the sun in
// dark (press → light); INTERACTION_SCRIPT keeps aria-label/title in step
// with the live theme.
function themeToggleButton() {
  return `<button type="button" class="activity-theme-toggle js-theme-toggle" aria-label="${THEME_TOGGLE.toDark}" title="${THEME_TOGGLE.toDark}"><span class="theme-icon-moon">${svgIcon(MOON_ICON_PATH, 16)}</span><span class="theme-icon-sun">${svgIcon(SUN_ICON_PATH, 16)}</span></button>`
}

function svgIcon(pathMarkup, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</svg>`
}

function activityBar(activeStore) {
  const buttons = STORE_ORDER.map((key) => {
    const active = key === activeStore ? ' active' : ''
    return `<button type="button" class="activity-btn${active}" data-store="${key}" title="${STORE_LABEL[key]}" aria-label="${STORE_LABEL[key]}">${svgIcon(STORE_ICON_PATHS[key])}</button>`
  }).join('\n')
  // T-806: the toggle sits at the rail's bottom, below every store button —
  // the rail is the one element unchanged across Home, every store tab, and
  // any item open (see the .activity-theme-toggle CSS comment).
  return `<nav class="activity">\n${buttons}\n${themeToggleButton()}\n</nav>`
}

/** Wraps `innerHtml` (a frame-main-col's full content, sidebar included) into one activity-bar-addressable store section. */
function storeSection(key, { active = false, innerHtml }) {
  return `<section class="store-section${active ? ' active' : ''}" data-store="${key}" id="store-${key}">\n${innerHtml}\n</section>`
}

// Numeric version-id compare, NEWEST FIRST (descending) — contracts
// §Fixed-paths "Version id" rule: fill a missing component with 0 and compare
// component-by-component; NEVER a string/localeCompare (which would sort
// "v1.10" before "v1.9"). One rule, two call sites (T-709 결정 1/2): the
// ticket sidebar's per-bucket rows and the PRD store's closed-round rows.
function versionNumericParts(id) {
  return (id.match(/\d+/g) || []).map(Number)
}
function compareVersionIdsDesc(a, b) {
  const pa = versionNumericParts(a)
  const pb = versionNumericParts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

// T-713: the SAME numeric comparison, as an equality test — contracts
// §Fixed-paths "`v1` ≡ `v1.0.0`": a ticket bucket directory (or a `prd_item`
// prefix) spelled differently from po-state's own version string (`v1.10.0`
// on disk vs `v1.10` in `.prdt/po-state.json`) is still the SAME version.
// Exported so collect.mjs's `isCurrent` bucket check reuses this one rule
// rather than a second string-equality copy of its own.
export function sameVersion(a, b) {
  return compareVersionIdsDesc(a, b) === 0
}

/** The ticket store's current-version sidebar group key — see `ticketStoreInner` (T-713). One function, so the `#id` anchor table (T-746) names the same group the sidebar draws. */
function currentTicketBucketKey(tickets, currentVersion) {
  return currentVersionTickets(tickets, currentVersion)[0]?.bucket ?? currentVersion
}

/** Every current-version ticket (any status) in `tickets.included`, matched by `sameVersion` rather than string equality (T-713) — a bucket dir spelled differently from po-state's own version string is still "current". `backlog` is excluded — it is never a version at all. */
function currentVersionTickets(tickets, currentVersion) {
  return tickets.included.filter((t) => t.bucket !== 'backlog' && sameVersion(t.bucket, currentVersion))
}

/** Home's decision group (T-792): `decision--*` wiki pages whose `version:` is the current version. One function, so the `#id` anchor table names only the rows Home draws. */
function currentDecisionPages(pages, currentVersion) {
  return pages.filter((p) => p.rel.split('/').pop().startsWith('decision--') && p.frontmatter.version && sameVersion(String(p.frontmatter.version), currentVersion))
}

/** Home's artifact group — the literal bucket match home has always used (T-713 scope note in `homeSection`); shared with the anchor table (T-792). */
function currentArtifactEntries(artifacts, currentVersion) {
  return artifacts.entries.filter((e) => e.fields.bucket === currentVersion)
}

/**
 * A ticket's `prd_item` (`"<version>#<key>"`) resolved against `currentVersion`
 * by the SAME numeric equality (T-713), rather than a literal string-prefix
 * check — a ticket written against its own bucket's directory spelling
 * (`v1.10.0#viewer`) still resolves to its PRD-item row even when that
 * spelling differs textually from po-state's version string (`v1.10`).
 * `null` when there is no `#`, or the version part is not the current
 * version — same "trailing row" fallback as before.
 * @param {string} prdItem
 * @param {string} currentVersion
 * @returns {string|null}
 */
function prdItemKey(prdItem, currentVersion) {
  const hashIdx = prdItem.indexOf('#')
  if (hashIdx === -1) return null
  const versionPart = prdItem.slice(0, hashIdx)
  if (!sameVersion(versionPart, currentVersion)) return null
  return prdItem.slice(hashIdx + 1)
}

function statusPillClass(status) {
  if (status === 'done') return 'done'
  if (status === 'dropped') return 'abandoned'
  return 'todo' // open, or anything this generator does not recognize — neutral, never invented
}

/** Raw ticket status (open/done/dropped) → its T-705 §B Korean pill text. */
function ticketStatusText(status) {
  return TICKET.statusText[status] ?? status ?? ''
}

function rolePillClass(assignee) {
  if (['po', 'designer', 'developer', 'qa'].includes(assignee)) return assignee
  return null // 'user' and anything else render as the neutral pill, same as the mockup's own "user" row
}

function ticketRolePill(assignee) {
  const cls = rolePillClass(assignee)
  const pillClass = cls ? `pill-role-${cls}` : assignee === 'user' ? 'pill-user-ink' : 'pill-neutral'
  return `<span class="pill ${pillClass}">${escapeHtml(assignee || '')}</span>`
}

/** One <table> of ticket rows for one group (current version, backlog, or a frontmatter-only bucket — T-709 결정 1: same shape, `t.frontmatter` is all this needs, whether or not the row's own entry carries a `body`) — every row is a detail-row keyed for the embedded JSON blob below, so "every row resolves to a detail entry" is true by construction (same loop builds both). */
function ticketRowsTable(tickets) {
  if (tickets.length === 0) {
    return `<p class="v-note">${TICKET.empty}</p>`
  }
  let html = `<div class="table-wrap"><table><thead><tr>${TICKET.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const t of tickets) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    html += `<tr class="detail-row" data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(fm.slug || '')}</td>`
    html += `<td><span class="pill pill-type">${escapeHtml(fm.type || '')}</span></td>`
    html += `<td><span class="pill pill-status-${statusPillClass(fm.status)}">${escapeHtml(ticketStatusText(fm.status))}</span></td>`
    html += `<td>${ticketRolePill(fm.assignee)}</td>`
    html += '</tr>\n'
  }
  html += '</tbody></table></div>\n'
  return html
}

/**
 * The ticket store: one sidebar row per `docs/tickets/` bucket directory
 * (T-709 결정 1 — today 17: current version + backlog + 15 others), routed
 * through the shared `groupedStore()` shell rather than bespoke markup (the
 * T-666 slice 1b comment's claim that every store already did this was never
 * actually true of the ticket store — closed here). Current version + backlog
 * keep their full-body rows unchanged; every other bucket (`tickets.omitted`)
 * renders the SAME `ticketRowsTable`, fed frontmatter-only rows instead —
 * shape is identical, so no second table renderer is needed. Rows sort
 * NEWEST VERSION FIRST (`compareVersionIdsDesc`, never string order — a
 * roadmap dir like v2.0/v1.11 is not "closed", just not the current round,
 * hence no status word on its label — see T-709.md 결정 1); `backlog` is not
 * a version, so it is excluded from that sort and pinned last, matching the
 * approved mockup's own placement. `defaultKey: currentBucketKey` keeps the
 * reader landing on "now" even though the current version is no longer at
 * array index 0.
 *
 * T-713: the current-version row's own KEY is the REAL bucket directory name
 * (e.g. `v1.10.0`) when any current-version ticket exists, never the literal
 * `currentVersion` po-state string — `currentVersionTickets` already matches
 * that directory by numeric equality (`sameVersion`), so a bucket spelled
 * differently from po-state's own version string still lands here rather
 * than being mistaken for a closed/roadmap bucket. Falls back to
 * `currentVersion` itself only when the current version has no tickets yet
 * (an empty bucket carries no directory name to observe). The row's own
 * LABEL still reads po-state's `currentVersion` string (`${currentVersion} ·
 * 현재`) — that is the canonical "now" wording, unchanged.
 */
function ticketStoreInner(tickets, currentVersion) {
  const currentTickets = currentVersionTickets(tickets, currentVersion)
  const backlogTickets = tickets.included.filter((t) => t.bucket === 'backlog')
  const currentBucketKey = currentTicketBucketKey(tickets, currentVersion)

  // The current version's own row is a version bucket like any other — it
  // must be sorted INTO the same numeric-descending run as `tickets.omitted`
  // (a bucket like v1.11/v2.0 is a not-yet-current roadmap dir, still newer
  // than the current version — T-709 결정 1), never pinned to array index 0
  // structurally. Only `backlog` (not a version at all) sits outside this
  // sort, pinned last.
  const versionBuckets = [currentBucketKey, ...tickets.omitted.map((o) => o.bucket)].sort(compareVersionIdsDesc)

  const groups = [
    ...versionBuckets.map((bucket) => {
      if (bucket === currentBucketKey) {
        return {
          key: currentBucketKey,
          label: `${currentVersion} · ${TICKET.currentTag}`,
          count: currentTickets.length,
          bodyHtml: countBadge(currentVersion, currentTickets.length, TICKET.countUnit) + ticketRowsTable(currentTickets),
        }
      }
      const o = tickets.omitted.find((b) => b.bucket === bucket)
      return {
        key: o.bucket,
        label: o.bucket,
        count: o.tickets.length,
        bodyHtml: countBadge(o.bucket, o.tickets.length, TICKET.countUnit) + ticketRowsTable(o.tickets),
      }
    }),
    {
      key: 'backlog',
      label: TICKET.backlogLabel,
      count: backlogTickets.length,
      bodyHtml: countBadge(TICKET.backlogLabel, backlogTickets.length, TICKET.countUnit) + ticketRowsTable(backlogTickets),
    },
  ]

  return groupedStore({
    sidebarSubLabel: TICKET.sidebarLabel,
    crumbLabel: TICKET.sidebarLabel,
    groups,
    noGroupUnit: TICKET.countUnit,
    defaultKey: currentBucketKey,
  })
}

/**
 * The detail-data JSON blob's "ticket" bucket — one entry per row every
 * `ticketRowsTable` call draws: current/backlog tickets get a real rendered
 * `body`; every other bucket's tickets (T-709 결정 1) get NO `body` (the
 * lightweight `collect.mjs` entry has none to render) and a `fileHref`
 * instead — the client script already knows this shape (no `fields.body` +
 * `fields.fileHref` present → `FILE_HREF_NOTE` + a real-file link, see
 * `INTERACTION_SCRIPT` below), so nothing there changes for this.
 */
function ticketDetailEntries(tickets, repoRootHref) {
  const entries = {}
  for (const t of tickets.included) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    entries[id] = {
      title: fm.slug || id,
      type: fm.type || '',
      status: fm.status || '',
      assignee: fm.assignee || '',
      created: fm.created || '',
      path: t.rel,
      body: md(t.body, path.dirname(t.rel), repoRootHref, { discipline: true }),
    }
  }
  for (const bucket of tickets.omitted) {
    for (const t of bucket.tickets) {
      const fm = t.frontmatter
      const id = fm.id || t.rel
      entries[id] = {
        title: fm.slug || id,
        type: fm.type || '',
        status: fm.status || '',
        assignee: fm.assignee || '',
        path: t.rel,
        fileHref: containedFileHref(`${repoRootHref}/${encodeFsPathHref(t.rel)}`, repoRootHref),
      }
    }
  }
  return entries
}

// T-885 (T-876 = D): a past-version bucket name becomes part of a sibling
// file name, so only a plain directory name qualifies; anything else keeps
// today's file-link note and gets no data file.
const PAST_BUCKET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// The one global a data file writes into, and the only thing it does.
export const PAST_TICKET_GLOBAL = '__PRDT_VIEWER_DATA__'

/**
 * T-885 (T-876 = D): one sibling `.js` data file per past-version bucket,
 * holding that bucket's rendered ticket bodies — loaded only when a reader
 * opens one of its tickets (INTERACTION_SCRIPT's `loadPastTickets`), so
 * `viewer.html` itself never carries them. Each file is
 * `(window.__PRDT_VIEWER_DATA__ = … || {})["<bucket>"] = <json>;`
 * (`pastTicketDataContent`). `src` is `<prefix>.tickets-<bucket>.js` next to
 * the page; renderPage receives the bucket → src map (`pastTicketSrc`) and the
 * loader takes a src from that map only.
 * @returns {Array<{ bucket: string, name: string, tickets: Record<string,{path:string,body:string}>, bodies: string[] }>}
 */
export function pastTicketDataFiles(tickets, { repoRootHref = DEFAULT_REPO_ROOT_HREF, viewerAbsPath = DEFAULT_VIEWER_ABS_PATH, prefix = 'viewer', discipline = [] } = {}) {
  pageViewerAbsPath = viewerAbsPath
  pageDisciplineIndex = buildDisciplineIndex(discipline)
  const files = []
  for (const bucket of tickets.omitted) {
    if (!bucket.bodies || !PAST_BUCKET_RE.test(bucket.bucket)) continue
    const rows = {}
    const bodies = []
    for (const t of bucket.tickets) {
      const raw = Object.prototype.hasOwnProperty.call(bucket.bodies, t.rel) ? bucket.bodies[t.rel] : undefined
      if (typeof raw !== 'string') continue
      const id = t.frontmatter.id || t.rel
      const body = md(raw, path.dirname(t.rel), repoRootHref, { discipline: true })
      rows[id] = { path: t.rel, body }
      bodies.push(body)
    }
    if (bodies.length === 0) continue
    files.push({ bucket: bucket.bucket, name: `${prefix}.tickets-${bucket.bucket}.js`, tickets: rows, bodies })
  }
  return files
}

/**
 * The text of one past-version data file. `payload` = `{ tickets, font? }`
 * (`font` = `{ range, regular, semibold }`: the glyphs this bucket's bodies
 * use that the page's own subset lacks). The JSON keeps the same
 * every-`<`-escaped form as `detailDataScript`, so no body can close or
 * reopen a tag around it.
 */
export function pastTicketDataContent(bucket, payload) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  return `(window.${PAST_TICKET_GLOBAL} = window.${PAST_TICKET_GLOBAL} || {})[${JSON.stringify(bucket)}] = ${json};\n`
}

function ticketSection(tickets, currentVersion) {
  return storeSection('ticket', { innerHtml: ticketStoreInner(tickets, currentVersion) })
}

// ---------- shared grouped-store shell (T-666 slice 1b/2a) ----------
// Slice 1a proved the model on the ticket store only; slice 1b rewired
// wiki/feature/artifact/PRD onto this ONE builder (replacing T-665's flat
// `plainFrame`, since removed — acceptance line 1: "a store that deviates is
// a defect"); slice 2a rewires home onto it too (see `homeSection` below),
// leaving no store on a bespoke layout. Sidebar group buttons
// (`nav-item-clickable` + `data-group-select`) → one `.view-pane` per group →
// the same shared `.detail-panel` the ticket store already uses — so the
// interaction shape literally cannot drift between stores (it is not
// re-authored per store). `groups` is `[{ key, label, count?, bodyHtml }]`
// (`count` optional — see the badge note inline below); index 0 is the
// default-active group UNLESS `defaultKey` is given (T-709 결정 1: the ticket
// store's array order is now newest-version-first, so the current version is
// not always at index 0 — `defaultKey: currentVersion` keeps the reader
// landing on "now" regardless of where it sits in that order; falls back to
// index 0 if no group's `key` matches). PRD's "open" group is the one
// intentional content nuance, not a structural one — see prdStoreInner below.
//
// T-708 결함 7: a store with exactly one group (feature, today — any other
// store lands here too the moment its own data collapses to one group) has
// nothing to switch between, so it draws no button at all — a static line
// instead, copied byte-for-byte from the approved mockup
// (docs/artifacts/v1.10/define-screen-set.html ~line 4181: `<div
// class="nav-item" style="color:var(--text-tertiary); font-style:italic;">그룹
// 없음 · 전체 3개</div>`) — no `nav-item-clickable`, no `active`, no
// `data-group-select`, so INTERACTION_SCRIPT's `[data-group-select]` handler
// simply never matches it. `noGroupUnit` is the caller's own count-unit word
// (e.g. FEATURE.countUnit) — groupedStore has no store-specific vocabulary of
// its own, so it cannot guess one.
function groupedStore({ sidebarSubLabel, crumbLabel, groups, noGroupUnit = '', defaultKey, topHtml = '' }) {
  const singleGroup = groups.length === 1
  const defaultIndex = defaultKey === undefined ? 0 : Math.max(0, groups.findIndex((g) => g.key === defaultKey))
  const sidebarButtons = singleGroup
    ? `<div class="nav-item" style="color:var(--text-tertiary); font-style:italic;">${escapeHtml(noGroupLabel(groups[0].count ?? 0, noGroupUnit))}</div>`
    : groups
        .map((g, i) => {
          const active = i === defaultIndex ? ' active' : ''
          // T-666 slice 2a: `count` is optional (home's "진행 상황" group is not a
          // list and carries no count — the mockup's own sidebar leaves that one
          // button's badge off, per docs/artifacts/v1.10/define-screen-set.html
          // ~line 628) and may be a non-numeric label (home's "PRD" row badges
          // with the version string, matching every other store's own PRD-nav
          // convention) rather than always a bare integer.
          const countHtml = g.count === undefined || g.count === null ? '' : `<span class="nav-item-count">${escapeHtml(String(g.count))}</span>`
          return `<button type="button" class="nav-item nav-item-clickable${active}" data-group-select="${escapeHtml(g.key)}"><span>${escapeHtml(g.label)}</span>${countHtml}</button>`
        })
        .join('\n')
  const sidebar = `<nav class="sidebar">
<div class="sidebar-title">productune</div>
<div class="sidebar-sub">${escapeHtml(sidebarSubLabel)}</div>
${sidebarButtons}
</nav>`

  const panes = groups
    .map((g, i) => `<div class="view-pane${i === defaultIndex ? ' active' : ''}" data-group="${escapeHtml(g.key)}">${g.bodyHtml}</div>`)
    .join('\n')

  const defaultLabel = groups.length > 0 ? groups[defaultIndex].label : ''
  const mainCol = `<div class="frame-main-col">
<div class="topstrip"><span class="topstrip-crumb"><b>${escapeHtml(crumbLabel)}${defaultLabel === '' ? '' : ` · <span class="js-group-label">${escapeHtml(defaultLabel)}</span>`}</b></span></div>
<div class="frame-body"><div class="main-inner">${topHtml}${panes}</div></div>
<div class="detail-panel" role="dialog" aria-label="${COMMON.detailPanel}">
<div class="detail-panel-header"><button type="button" class="detail-panel-close" aria-label="${COMMON.close}">${svgIcon(CLOSE_ICON_PATH, 14)}</button><span class="detail-panel-title"></span></div>
<div class="detail-panel-body"></div>
</div>
</div>`

  return sidebar + '\n' + mainCol
}

// A `status` vocabulary wiki/feature frontmatter actually uses (`live` /
// `superseded` — measured 2026-09-26 across docs/wiki + docs/features) is
// NOT the ticket enum (open/done/dropped) `statusPillClass` above covers —
// mapping it through that function would silently mislabel "live" as
// "todo". Extends the SAME pill class vocabulary (doctrine: one system, not
// a parallel one) rather than inventing new CSS.
function wikiFeatureStatusPillClass(status) {
  if (status === 'live') return 'done'
  if (status === 'superseded') return 'abandoned'
  return 'todo' // unknown/absent — neutral, never invented
}

/** Raw wiki/feature status (live/superseded/absent) → its T-705 §B/§D Korean pill text — same map for both stores. */
function wikiFeatureStatusText(status) {
  return WIKI.statusText[status || ''] ?? status ?? ''
}

// Wiki frontmatter without a `type` key (docs/wiki/log.md, docs/wiki/inbox.md
// — measured 2026-09-26) still has to land in some sidebar group. This is a
// sentinel DATA key (never rendered to the screen — T-705 §F: "내부 정렬/
// 데이터 키는 화면에 안 보이므로 그대로 둬도 된다"), distinct from its
// human-visible label (WIKI.unclassifiedLabel, below).
const WIKI_UNCLASSIFIED = 'UNCLASSIFIED'

/** raw frontmatter `type` (or the WIKI_UNCLASSIFIED sentinel) → its T-705 §F human-visible label. */
function wikiGroupLabel(key) {
  if (key === WIKI_UNCLASSIFIED) return WIKI.unclassifiedLabel
  return WIKI.groupLabels[key] || key
}

function wikiRowsTable(pages) {
  if (pages.length === 0) return `<p class="v-note">${WIKI.empty}</p>`
  let html = `<div class="table-wrap"><table><thead><tr>${WIKI.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    html += `<tr class="detail-row" data-detail-kind="wiki" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(fm.title || id)}</td>`
    html += `<td><span class="pill pill-status-${wikiFeatureStatusPillClass(fm.status)}">${escapeHtml(wikiFeatureStatusText(fm.status))}</span></td>`
    html += `<td class="num-col">${escapeHtml(fm.version || '—')}</td>`
    html += '</tr>\n'
  }
  html += '</tbody></table></div>\n'
  return html
}

/** One store's-main-pane count badge (T-705 §G: wiki/feature/artifact/PRD-closed lacked this — ticket/home already had it). */
function countBadge(label, count, unit) {
  return `<div class="section-meta"><span class="count-badge">${escapeHtml(label)} · <b>${count}</b>${escapeHtml(unit)}</span></div>\n`
}

/** Wiki store: sidebar groups by the RAW frontmatter `type` value, keyed internally by that raw value (never shown) but LABELED per T-705 §F's final Korean mapping. T-713: a wholly empty store (`docs/wiki` has zero pages once `index.md` is excluded) has no `type` key to group by at all — grouping "by data present" would then build ZERO groups, so `groupedStore` never has anything to draw and `WIKI.empty` (a table-body note) is never reached. One synthetic all-store group, same shape every other empty-but-populated group already renders (`wikiRowsTable([])`), same as `featureStoreInner`'s own single, always-present group below. */
function wikiStoreInner(pages) {
  if (pages.length === 0) {
    const groups = [{ key: 'all', label: WIKI.sidebarLabel, count: 0, bodyHtml: countBadge(WIKI.sidebarLabel, 0, WIKI.countUnit) + wikiRowsTable([]) }]
    return groupedStore({ sidebarSubLabel: WIKI.sidebarLabel, crumbLabel: WIKI.sidebarLabel, groups, noGroupUnit: WIKI.countUnit })
  }
  const byType = new Map()
  for (const p of pages) {
    const key = p.frontmatter.type || WIKI_UNCLASSIFIED
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key).push(p)
  }
  const keys = [...byType.keys()].sort((a, b) => {
    if (a === WIKI_UNCLASSIFIED) return 1
    if (b === WIKI_UNCLASSIFIED) return -1
    return a.localeCompare(b)
  })
  const groups = keys.map((key) => {
    const items = byType.get(key)
    const label = wikiGroupLabel(key)
    return { key, label, count: items.length, bodyHtml: countBadge(label, items.length, WIKI.countUnit) + wikiRowsTable(items) }
  })
  return groupedStore({ sidebarSubLabel: WIKI.sidebarLabel, crumbLabel: WIKI.sidebarLabel, groups, noGroupUnit: WIKI.countUnit })
}

/** The detail-data JSON blob's "wiki" bucket — same construction discipline as `ticketDetailEntries`: keyed by the same id `wikiRowsTable` renders, from the same input list. */
function wikiDetailEntries(pages, repoRootHref) {
  const entries = {}
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    entries[id] = {
      title: fm.title || id,
      type: fm.type || '',
      status: fm.status || '',
      version: fm.version || '',
      path: p.rel,
      body: md(p.body, path.dirname(p.rel), repoRootHref, { discipline: true }),
    }
  }
  return entries
}

function wikiSection(pages) {
  return storeSection('wiki', { innerHtml: wikiStoreInner(pages) })
}

// ---------- glossary store (T-883) ----------
// Source: the wiki's `term` documents (data.wiki, type: term) — no second
// copy; the wiki store still lists them too. Table 용어 · 분류 · 정의 (the
// 분류 chip is the first `tags` value, the 정의 is the document's h1 after
// its 「— 」), detail = h1 as lead, 분류 · 상태 fields, the body below the h1.
function termPages(wiki) {
  return (wiki || []).filter((p) => p.frontmatter.type === 'term')
}

function termParts(p) {
  const file = p.rel.split('/').pop().replace(/\.md$/, '')
  const id = file.replace(/^term--/, '')
  const title = String(p.frontmatter.title || id)
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(title)
  const name = m ? m[1] : title
  const gloss = m ? m[2] : ''
  const lines = String(p.body || '').split('\n')
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l))
  const lead = h1 === -1 ? '' : lines[h1].replace(/^#\s+/, '').trim()
  const rest = h1 === -1 ? p.body : lines.slice(h1 + 1).join('\n')
  const def = lead.includes('—') ? lead.slice(lead.indexOf('—') + 1).trim() : lead
  const tags = Array.isArray(p.frontmatter.tags) ? p.frontmatter.tags : []
  return { id, name, gloss, lead, def, rest, category: tags.length ? String(tags[0]) : '' }
}

function glossaryStoreInner(wiki) {
  const pages = termPages(wiki)
  if (pages.length === 0) {
    const groups = [{ key: 'all', label: '', count: 0, bodyHtml: `<p class="v-note">${GLOSSARY.empty}</p>` }]
    return groupedStore({ sidebarSubLabel: GLOSSARY.sidebarLabel, crumbLabel: GLOSSARY.sidebarLabel, groups, noGroupUnit: GLOSSARY.countUnit })
  }
  const rows = pages.map((p) => {
    const t = termParts(p)
    const chip = t.category ? `<span class="kp kp-component">${escapeHtml(t.category)}</span>` : '—'
    return `<tr class="detail-row" data-detail-kind="glossary" data-detail-id="${escapeHtml(t.id)}" tabindex="0">` +
      `<td><span class="nm">${escapeHtml(t.name)}</span>${t.gloss ? `<span class="nm-gloss">${escapeHtml(t.gloss)}</span>` : ''}</td>` +
      `<td>${chip}</td><td class="def-col">${escapeHtml(t.def)}</td></tr>\n`
  }).join('')
  const head = `<tr>${GLOSSARY.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const bodyHtml = `<div class="count-line section-meta"><span class="count-badge">${escapeHtml(GLOSSARY.countLabel)} <b>${pages.length}</b>${escapeHtml(GLOSSARY.countUnit)}</span></div>\n` +
    `<div class="table-wrap"><table class="t-gl"><thead>${head}</thead><tbody>\n${rows}</tbody></table></div>\n`
  const groups = [{ key: 'all', label: '', count: pages.length, bodyHtml }]
  return groupedStore({ sidebarSubLabel: GLOSSARY.sidebarLabel, crumbLabel: GLOSSARY.sidebarLabel, groups, noGroupUnit: GLOSSARY.countUnit })
}

function glossaryDetailEntries(wiki, repoRootHref) {
  const field = (label, value) => `<div class="detail-field"><span class="detail-field-label">${escapeHtml(label)}</span><span class="detail-field-value">${value}</span></div>`
  const entries = {}
  for (const p of termPages(wiki)) {
    const t = termParts(p)
    const meta = '<div class="detail-meta">' +
      (t.category ? field(GLOSSARY.fields.category, `<span class="kp kp-component">${escapeHtml(t.category)}</span>`) : '') +
      field(GLOSSARY.fields.status, escapeHtml(wikiFeatureStatusText(p.frontmatter.status))) +
      '</div>'
    entries[t.id] = {
      title: t.gloss ? `${t.name} · ${t.gloss}` : t.name,
      html: `${t.lead ? `<p class="def-lead">${escapeHtml(t.lead)}</p>` : ''}${meta}<div class="detail-doc rb">${md(t.rest, path.dirname(p.rel), repoRootHref)}</div>`,
    }
  }
  return entries
}

function glossarySection(wiki) {
  return storeSection('glossary', { innerHtml: glossaryStoreInner(wiki) })
}

// ---------- release-notes store (T-883) ----------
// Source: data.releases — the sections of code/docs/RELEASES.md (collect.mjs
// `collectReleases`: read path and symlink containment live there). Table
// 버전 · 제목 · 날짜; detail = 버전 · 날짜 fields, the section's opening note
// (a leading `>` block) as a note box, each `###` group as a heading pill.
// Links inside a section body go through the same `md()` containment as
// every other document (source dir `code/docs`).
function releaseBodyHtml(section, repoRootHref) {
  let body = section.body
  let note = ''
  const quote = /^((?:>[^\n]*(?:\n|$))+)/.exec(body)
  if (quote) {
    const inner = md(quote[1].replace(/^>[ ]?/gm, '').trim(), 'code/docs', repoRootHref)
    note = `<div class="v-note">${inner.replace(/^<p>/, '').replace(/<\/p>\s*$/, '').replace(/\n/g, '<br>')}</div>\n`
    body = body.slice(quote[1].length)
  }
  const html = md(body, 'code/docs', repoRootHref).replace(/<h3 class="pill pill-heading-3">/g, '<h3 class="pill pill-heading-2">')
  return `${note}${html}`
}

function releaseStoreInner(releases) {
  if (releases.length === 0) {
    const groups = [{ key: 'all', label: '', count: 0, bodyHtml: `<p class="v-note">${RELEASE.empty}</p>` }]
    return groupedStore({ sidebarSubLabel: RELEASE.sidebarLabel, crumbLabel: RELEASE.sidebarLabel, groups, noGroupUnit: RELEASE.countUnit })
  }
  const rows = releases.map((r) =>
    `<tr class="detail-row" data-detail-kind="release" data-detail-id="${escapeHtml(r.version)}" tabindex="0">` +
    `<td class="id-col ver">${escapeHtml(r.version)}</td><td class="def-col t-title">${escapeHtml(r.title)}</td>` +
    `<td class="num-col">${escapeHtml(r.date || '—')}</td></tr>\n`).join('')
  const head = `<tr>${RELEASE.tableHeaders.map((h, i) => `<th${i === 2 ? ' class="num-col"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr>`
  const bodyHtml = `<div class="count-line section-meta"><span class="count-badge">${escapeHtml(RELEASE.countLabel)} <b>${releases.length}</b>${escapeHtml(RELEASE.countUnit)}</span></div>\n` +
    `<div class="table-wrap"><table class="t-rel"><thead>${head}</thead><tbody>\n${rows}</tbody></table></div>\n`
  const groups = [{ key: 'all', label: '', count: releases.length, bodyHtml }]
  return groupedStore({ sidebarSubLabel: RELEASE.sidebarLabel, crumbLabel: RELEASE.sidebarLabel, groups, noGroupUnit: RELEASE.countUnit })
}

function releaseDetailEntries(releases, repoRootHref) {
  const field = (label, value, cls = '') => `<div class="detail-field"><span class="detail-field-label">${escapeHtml(label)}</span><span class="detail-field-value${cls}">${value}</span></div>`
  const entries = {}
  for (const r of releases) {
    if (Object.prototype.hasOwnProperty.call(entries, r.version)) continue
    const meta = '<div class="detail-meta">' + field(RELEASE.fields.version, escapeHtml(r.version), ' ver') +
      (r.date ? field(RELEASE.fields.date, escapeHtml(r.date)) : '') + '</div>'
    entries[r.version] = {
      title: r.title ? `${r.version} · ${r.title}` : r.version,
      html: `${meta}<div class="detail-doc rb">${releaseBodyHtml(r, repoRootHref)}</div>`,
    }
  }
  return entries
}

function releaseSection(releases) {
  return storeSection('release', { innerHtml: releaseStoreInner(releases) })
}

// ---------- discipline store (T-886: T-832 / T-877) ----------
// Source: data.discipline — the discipline documents applied on this machine
// (collect.mjs `collectDiscipline`: which files, containment, the repository-
// original comparison). Table 문서 · 구분 · 줄, sidebar groups 전체 · 계약 ·
// po · designer · developer · qa; a row opens the document as numbered source
// lines in the detail panel (built by the page script from DETAIL_DATA.disc —
// the lines travel once as data, never twice as markup). A link in a ticket /
// wiki / PRD body (discipline-links.mjs) opens the same panel at its line.
function discGroupLabel(key) {
  return key === 'contracts' ? DISCIPLINE.contractsGroup : key
}

function discKindChip(doc) {
  return `<span class="kp kp-component">${escapeHtml(DISCIPLINE.kind[doc.kind] ?? doc.kind)}</span>`
}

function discRowsTable(docs) {
  const rows = docs.map((d) =>
    `<tr class="detail-row" data-detail-kind="disc" data-detail-id="${escapeHtml(d.rel)}" tabindex="0">` +
    `<td><span class="nm">${escapeHtml(d.name)}</span><span class="nm-key">${escapeHtml(d.rel)}</span></td>` +
    `<td>${discKindChip(d)}</td><td class="num-col">${d.lines.length}</td></tr>\n`).join('')
  const head = `<tr>${DISCIPLINE.tableHeaders.map((h, i) => `<th${i === 2 ? ' class="num-col"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr>`
  return `<div class="table-wrap"><table class="t-disc"><thead>${head}</thead><tbody>\n${rows}</tbody></table></div>\n`
}

function discStoreInner(docs) {
  if (docs.length === 0) {
    const bodyHtml = `<p class="empty-note"><span>${escapeHtml(DISCIPLINE.emptyLine1)}</span><br><span>${escapeHtml(DISCIPLINE.emptyLine2)}</span></p>`
    const groups = [{ key: 'all', label: DISCIPLINE.allLabel, count: 0, bodyHtml }]
    return groupedStore({ sidebarSubLabel: DISCIPLINE.sidebarLabel, crumbLabel: DISCIPLINE.sidebarLabel, groups, noGroupUnit: DISCIPLINE.countUnit })
  }
  const pane = (list) =>
    `<div class="count-line section-meta"><span class="count-badge">${escapeHtml(DISCIPLINE.countLabel)} <b>${list.length}</b>${escapeHtml(DISCIPLINE.countUnit)}</span></div>\n${discRowsTable(list)}`
  const groups = [{ key: 'all', label: DISCIPLINE.allLabel, count: docs.length, bodyHtml: pane(docs) }]
  const keys = []
  for (const d of docs) if (!keys.includes(d.group)) keys.push(d.group)
  for (const key of keys) {
    const list = docs.filter((d) => d.group === key)
    groups.push({ key, label: discGroupLabel(key), count: list.length, bodyHtml: pane(list) })
  }
  return groupedStore({ sidebarSubLabel: DISCIPLINE.sidebarLabel, crumbLabel: DISCIPLINE.sidebarLabel, groups, noGroupUnit: DISCIPLINE.countUnit })
}

function discDetailEntries(docs) {
  const entries = {}
  for (const d of docs) {
    entries[d.rel] = {
      title: d.name + (d.kind === 'habit' || d.kind === 'index' ? ` · ${discGroupLabel(d.group)}` : ''),
      name: d.name,
      group: d.group,
      kind: DISCIPLINE.kind[d.kind] ?? d.kind,
      differs: d.differs,
      lines: d.lines,
    }
  }
  return entries
}

function discSection(docs) {
  return storeSection('disc', { innerHtml: discStoreInner(docs) })
}

// ---------- feature store (T-882: the T-808 feature screen) ----------
// Source: `data.featureTaxonomy` (collect.mjs, read from .prdt/config.json
// features.taxonomy + features.vocab — decision recorded in T-882 outcome).
// Ticket counts, statuses, versions and 근거 티켓 are computed here from the
// tickets themselves (every bucket), never copied from the taxonomy. A link
// written on one side only also shows on the other side, as a name-only
// link (T-808 outcome). No taxonomy → the pre-T-882 spec-file list (T-901 = B);
// no taxonomy and no spec file → the approved empty state.
const TICKET_ID_RE = /\bT-(?:P\d+-)?\d+\b/g

function ticketIdLinks(escapedText, anchors) {
  return escapedText.replace(TICKET_ID_RE, (id) =>
    Object.prototype.hasOwnProperty.call(anchors, id) ? `<a href="#${id}"><code>${id}</code></a>` : `<code>${id}</code>`,
  )
}

function allTicketRows(tickets) {
  const rows = tickets.included.map((t) => ({ bucket: t.bucket, fm: t.frontmatter }))
  for (const b of tickets.omitted) for (const t of b.tickets) rows.push({ bucket: b.bucket, fm: t.frontmatter })
  return rows
}

const isVersionBucket = (b) => /^v\d/.test(b)
const compareVersionIdsAsc = (a, b) => compareVersionIdsDesc(b, a)

/** Bucket list → "v1.1 · v1.4 ~ v1.11 · backlog": a run of 3+ buckets adjacent in the repo's own version order folds to "first ~ last". */
function versionsLabel(buckets, allVersions) {
  const vs = [...new Set(buckets.filter(isVersionBucket))].sort(compareVersionIdsAsc)
  const rest = [...new Set(buckets.filter((b) => !isVersionBucket(b)))].sort()
  const parts = []
  let i = 0
  while (i < vs.length) {
    let j = i
    while (j + 1 < vs.length && allVersions.indexOf(vs[j + 1]) === allVersions.indexOf(vs[j]) + 1) j++
    if (j - i >= 2) parts.push(`${vs[i]} ~ ${vs[j]}`)
    else for (let k = i; k <= j; k++) parts.push(vs[k])
    i = j + 1
  }
  return [...parts, ...rest].join(' · ')
}

function ticketNumber(id) {
  return (String(id).match(/\d+/g) || []).map(Number)
}

/** Everything the screen shows per feature, computed once from taxonomy + tickets + spec files. */
export function featureScreenModel(data) {
  const tax = data.featureTaxonomy
  if (!tax || !tax.areas || tax.areas.length === 0) return null
  const areaKeys = new Set(tax.areas.map((a) => a.key))
  const entries = tax.entries.filter((e) => areaKeys.has(e.area))
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const owner = new Map()
  for (const e of entries) {
    owner.set(e.key, e.key)
    for (const a of e.aliases || []) if (!owner.has(a)) owner.set(a, e.key)
  }
  const tickets = new Map(entries.map((e) => [e.key, []]))
  const rows = allTicketRows(data.tickets)
  for (const r of rows) {
    const v = typeof r.fm.feature === 'string' ? r.fm.feature.trim() : ''
    const k = owner.get(v)
    if (k) tickets.get(k).push(r)
  }
  const allVersions = [...new Set(rows.map((r) => r.bucket).filter(isVersionBucket))].sort(compareVersionIdsAsc)
  const rev = new Map(entries.map((e) => [e.key, []]))
  for (const e of entries) {
    for (const l of e.links) {
      const other = byKey.get(l.to)
      if (other && !other.links.some((x) => x.to === e.key) && !rev.get(l.to).includes(e.key)) rev.get(l.to).push(e.key)
    }
  }
  const specs = new Map(data.features.map((p) => [p.rel.split('/').pop().replace(/\.md$/, ''), p]))
  const model = entries.map((e) => {
    const ts = tickets.get(e.key).sort((a, b) => {
      const pa = ticketNumber(a.fm.id)
      const pb = ticketNumber(b.fm.id)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
      return 0
    })
    return {
      ...e,
      links: e.links.filter((l) => byKey.has(l.to)),
      rev: rev.get(e.key),
      tickets: ts,
      versions: versionsLabel(ts.map((t) => t.bucket), allVersions),
      spec: specs.get(e.key) || null,
    }
  })
  return { areas: tax.areas, kinds: tax.kinds || [], entries: model, byKey: new Map(model.map((m) => [m.key, m])) }
}

function kindChip(model, kindKey) {
  const k = model.kinds.find((x) => x.key === kindKey)
  return k ? `<span class="kp kp-${escapeHtml(k.key)}">${escapeHtml(k.name)}</span>` : ''
}

function featureRow(model, e) {
  return `<tr class="detail-row" data-area="${escapeHtml(e.area)}" data-detail-kind="feature" data-detail-id="${escapeHtml(e.key)}" tabindex="0">` +
    `<td><span class="nm">${escapeHtml(e.name || e.key)}</span><span class="nm-key">${escapeHtml(e.key)}</span></td>` +
    `<td>${kindChip(model, e.kind)}</td><td class="def-col">${escapeHtml(e.def || '')}</td><td class="num-col">${e.tickets.length}</td></tr>\n`
}

function featureAreaRows(model, area) {
  const items = model.entries.filter((e) => e.area === area.key)
  return `<tr class="grp-row" data-area="${escapeHtml(area.key)}"><td colspan="4"><span class="grp-name">${escapeHtml(area.name)}</span>` +
    `<span class="grp-n">${items.length}</span><span class="grp-def">${escapeHtml(area.def || '')}</span></td></tr>\n` +
    items.map((e) => featureRow(model, e)).join('')
}

function featurePane(model, areas, count) {
  const head = `<tr>${FEATURE.tableHeaders.map((h, i) => `<th${i === 3 ? ' class="num-col"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr>`
  return `<div class="count-line section-meta"><span class="count-badge">${escapeHtml(FEATURE.sidebarLabel)} <b>${count}</b>${escapeHtml(FEATURE.countUnit)}</span></div>\n` +
    `<div class="table-wrap"><table class="feature-table"><thead>${head}</thead><tbody>\n${areas.map((a) => featureAreaRows(model, a)).join('')}</tbody></table></div>\n`
}

/** T-901 = B — no taxonomy: the pre-T-882 spec-file list (`docs/features/` is flat, one group). */
function featureSpecListRows(pages) {
  let html = `<div class="table-wrap"><table><thead><tr>${FEATURE.specList.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    const text = FEATURE.specList.statusText[fm.status || ''] ?? fm.status ?? ''
    html += `<tr class="detail-row" data-detail-kind="feature" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(fm.feature || id)}</td>`
    html += `<td>${escapeHtml(fm.title || id)}</td>`
    html += `<td><span class="pill pill-status-${wikiFeatureStatusPillClass(fm.status)}">${escapeHtml(text)}</span></td>`
    html += `<td class="num-col">${escapeHtml(fm.spec_since || '—')}</td>`
    html += '</tr>\n'
  }
  return html + '</tbody></table></div>\n'
}

function featureStoreInner(data) {
  const model = featureScreenModel(data)
  if (!model && data.features.length > 0) {
    const groups = [{
      key: 'all',
      label: STORE_LABEL.feature,
      count: data.features.length,
      bodyHtml: countBadge(FEATURE.sidebarLabel, data.features.length, FEATURE.countUnit) + featureSpecListRows(data.features),
    }]
    return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups, noGroupUnit: FEATURE.countUnit })
  }
  if (!model) {
    const groups = [{ key: 'all', label: '', count: 0, bodyHtml: `<p class="v-note">${FEATURE.empty}</p>` }]
    return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups, noGroupUnit: FEATURE.countUnit })
  }
  const groups = [
    { key: 'all', label: FEATURE.allLabel, count: model.entries.length, bodyHtml: featurePane(model, model.areas, model.entries.length) },
    ...model.areas.map((a) => {
      const n = model.entries.filter((e) => e.area === a.key).length
      return { key: a.key, label: a.name, count: n, bodyHtml: featurePane(model, [a], n) }
    }),
  ]
  return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups, noGroupUnit: FEATURE.countUnit })
}

function featureTicketsLabel(e) {
  const n = e.tickets.length
  if (n === 0) return `0${FEATURE.ticketUnit}`
  const count = (s) => e.tickets.filter((t) => t.fm.status === s).length
  const parts = [`${FEATURE.ticketStatus.done} ${count('done')}`]
  for (const s of ['open', 'dropped']) if (count(s) > 0) parts.push(`${FEATURE.ticketStatus[s]} ${count(s)}`)
  return `${n}${FEATURE.ticketUnit} · ${parts.join(' · ')}`
}

function featureLinkItem(model, key, text, ground, anchors) {
  const to = model.byKey.get(key)
  const desc = text === undefined ? '<span></span>'
    : `<span><span class="cn-t">${escapeHtml(text)}</span>${ground ? `<span class="cn-g">${ticketIdLinks(escapeHtml(ground), anchors)}</span>` : ''}</span>`
  return `<li class="cn-item"><span class="cn-head"><button type="button" class="cn-a" data-feature-go="${escapeHtml(key)}">${escapeHtml(to.name || key)}</button>${kindChip(model, to.kind)}</span>${desc}</li>`
}

function featureEvidence(e, anchors) {
  return e.tickets
    .map((t) => {
      const id = String(t.fm.id || '')
      const mark = t.fm.status === 'open' || t.fm.status === 'dropped' ? `(${FEATURE.ticketStatus[t.fm.status]})` : ''
      return `${ticketIdLinks(escapeHtml(id), anchors)}${escapeHtml(mark)} ${escapeHtml(t.fm.slug || '')}`.trim()
    })
    .join(' · ')
}

/** Detail order (T-808 outcome): definition and 「함께 쓰는 기능」 first, then the spec body (spec file present) or 근거 티켓. */
// T-883: feature keys whose detail carries a 「읽기」 field, and the store each opens.
const FEATURE_READ_STORE = { glossary: 'glossary', 'release-notes': 'release' }

function featureReadField(data, e) {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_READ_STORE, e.key)) return ''
  const store = FEATURE_READ_STORE[e.key]
  const count = store === 'glossary' ? termPages(data.wiki).length : (data.releases || []).length
  const unit = store === 'glossary' ? GLOSSARY.countUnit : RELEASE.countUnit
  const text = readFieldValue(STORE_LABEL[store], count, unit)
  return `<button type="button" class="area-a read-link" data-open-store="${store}">${escapeHtml(text)}</button>`
}

function featureDetailHtml(model, e, anchors, repoRootHref, readHtml = '') {
  const area = model.areas.find((a) => a.key === e.area)
  const kind = model.kinds.find((k) => k.key === e.kind)
  const field = (label, value) => `<div class="detail-field"><span class="detail-field-label">${escapeHtml(label)}</span><span class="detail-field-value">${value}</span></div>`
  const meta = '<div class="detail-meta">' +
    field(FEATURE.fields.kind, kindChip(model, e.kind)) +
    field(FEATURE.fields.area, `<button type="button" class="area-a" data-feature-area="${escapeHtml(e.area)}">${escapeHtml(area.name)}</button>`) +
    field(FEATURE.fields.tickets, escapeHtml(featureTicketsLabel(e))) +
    (e.versions ? field(FEATURE.fields.version, escapeHtml(e.versions)) : '') +
    (readHtml ? field(FEATURE.fields.read, readHtml) : '') +
    '</div>'
  const kdef = kind ? `<p class="kind-def">${escapeHtml(kind.name)} — ${escapeHtml(kind.def || '')}</p>` : ''
  const items = [
    ...e.links.map((l) => featureLinkItem(model, l.to, l.text || '', l.ground || '', anchors)),
    ...e.rev.map((k) => featureLinkItem(model, k, undefined, undefined, anchors)),
  ]
  const links = `<h2 class="pill pill-heading-2">${escapeHtml(FEATURE.linksHeading)}</h2>` +
    (items.length ? `<ul class="cn-list">${items.join('')}</ul>` : `<p class="cn-empty">${escapeHtml(FEATURE.linksEmpty)}</p>`)
  const tail = e.spec
    ? `<h2 class="pill pill-heading-2">${escapeHtml(FEATURE.specHeading)}</h2><div class="v-body">${md(e.spec.body, path.dirname(e.spec.rel), repoRootHref)}</div>`
    : `<h2 class="pill pill-heading-2">${escapeHtml(FEATURE.evidenceHeading)}</h2>${e.tickets.length === 0 ? `<p class="cn-empty">${escapeHtml(FEATURE.evidenceEmpty)}</p>` : `<p class="ev-text">${featureEvidence(e, anchors)}</p>`}`
  return `<p class="def-lead">${escapeHtml(e.def || '')}</p>${meta}${kdef}<div class="detail-doc body-prose">${links}${tail}</div>`
}

function featureDetailEntries(data, anchors, repoRootHref) {
  const model = featureScreenModel(data)
  const entries = {}
  if (!model) {
    for (const p of data.features) {
      const fm = p.frontmatter
      const id = p.rel.split('/').pop()
      entries[id] = { title: fm.title || id, status: fm.status || '', spec_since: fm.spec_since || '', path: p.rel, body: md(p.body, path.dirname(p.rel), repoRootHref) }
    }
    return entries
  }
  for (const e of model.entries) {
    entries[e.key] = { title: `${e.name || e.key} · ${e.key}`, name: e.name || e.key, html: featureDetailHtml(model, e, anchors, repoRootHref, featureReadField(data, e)) }
  }
  return entries
}

function featuresSection(data) {
  return storeSection('feature', { innerHtml: featureStoreInner(data) })
}

/** PRD store: the ONE named content nuance (not a structural deviation — same activity-bar → sidebar-group → main-pane shell as every other store). The "open" group's single, currently-relevant document renders inline directly rather than as a one-row list a reader must click; "closed" behaves exactly like every other store's list→detail. Both strings below ("열린 섹션" / "닫힌 버전") are lifted verbatim from the user-approved mockup (docs/artifacts/v1.10/define-screen-set.html), not new copy. */
function prdOpenBody(prd, repoRootHref, { tickets, currentVersion, idPrefix }) {
  // T-884: the open PRD is the reading screen (outline · folds · 「결정할 것」 box · What cards).
  // `idPrefix` keeps ids unique when the same body sits in two panes (PRD store and home).
  const sourceDir = 'docs/prd'
  const inlineMd = (t) => md(t, sourceDir, repoRootHref, { discipline: true }).replace(/^<p>/, '').replace(/<\/p>\s*$/, '')
  return renderPrdReading({
    body: prd.current.body,
    currentVersion,
    decisionTickets: openDecisionTickets(tickets),
    idPrefix,
    deps: { md: (t) => md(t, sourceDir, repoRootHref, { discipline: true }), inline: inlineMd, esc: escapeHtml, sameVersion, ticketPill: ticketRolePill },
  })
}

/**
 * T-709 결정 2: every closed round is now its own sidebar row/group, newest
 * round first (`compareVersionIdsDesc` — same rule as the ticket sidebar),
 * rendering its own body DIRECTLY in its own pane — a document per version,
 * so "row" and "document" are the same thing here (never a list→detail
 * indirection, unlike ticket/wiki/feature/artifact, which hold many per
 * group). No count badge (every row is "1 document", a constant that would
 * carry no information) and no title extraction: the round's own first
 * heading (or, for a stub with none — docs/prd/versions/v1.1.md,
 * v1.2.1.md — its first line) already renders inline via `md()`'s own
 * heading-chip rule, so a second, separately-extracted copy of that same
 * text was never needed as a list column once the row IS the document.
 */
function prdStoreInner(prd, currentVersion, repoRootHref, tickets) {
  const closedRounds = [...prd.closed].sort((a, b) =>
    compareVersionIdsDesc(a.name.replace(/\.md$/, ''), b.name.replace(/\.md$/, '')),
  )
  const groups = [
    { key: 'open', label: `${PRD.openLabelPrefix}${currentVersion}`, count: 1, bodyHtml: prdOpenBody(prd, repoRootHref, { tickets, currentVersion, idPrefix: 'prd' }) },
    ...closedRounds.map((c) => {
      const id = c.name.replace(/\.md$/, '')
      return { key: id, label: id, bodyHtml: `<div class="v-body">${md(c.body, path.dirname(c.rel), repoRootHref, { discipline: true })}</div>` }
    }),
  ]
  return groupedStore({ sidebarSubLabel: STORE_LABEL.prd, crumbLabel: STORE_LABEL.prd, groups })
}

function prdSection(prd, currentVersion, repoRootHref, tickets) {
  return storeSection('prd', { innerHtml: prdStoreInner(prd, currentVersion, repoRootHref, tickets) })
}

/** Raw artifact status (pending/approved/archived) → its T-705 §B/§D pill class + Korean text — a third store on the shared todo/done/abandoned CSS vocabulary (§D: same class, different word per store). */
function artifactStatusPillClass(status) {
  if (status === 'approved') return 'done'
  if (status === 'archived') return 'abandoned'
  return 'todo' // 'pending', or anything unrecognized — neutral, never invented
}

function artifactStatusText(status) {
  return ARTIFACT.statusText[status] ?? status ?? ''
}

function artifactRowsTable(entries) {
  if (entries.length === 0) return `<p class="v-note">${ARTIFACT.empty}</p>`
  let html = `<div class="table-wrap"><table><thead><tr>${ARTIFACT.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const e of entries) {
    const f = e.fields
    const id = `${f.bucket}/${f.path}`
    html += `<tr class="detail-row" data-detail-kind="artifact" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(f.path)}</td>`
    html += `<td>${escapeHtml(f.kind || '')}</td>`
    html += `<td><span class="pill pill-status-${artifactStatusPillClass(f.status)}">${escapeHtml(artifactStatusText(f.status))}</span></td>`
    html += `<td>${escapeHtml(f.ticket || '')}</td>`
    html += `<td>${escapeHtml(f.lang || '')}</td>`
    html += `<td class="num-col">${e.bytes === undefined ? '' : escapeHtml(fmtBytes(e.bytes))}</td>`
    html += `<td class="num-col">${escapeHtml(f.added_at || '')}</td>`
    html += '</tr>\n'
  }
  html += '</tbody></table></div>\n'
  return html
}

/** Artifact store: one group per manifest bucket (version) — the current version's bucket (if it has any entries) opens by default, else the first bucket, so the reader lands on "now" the same way the ticket store's sidebar defaults to the current version. T-713: zero manifest entries at all (a missing `manifest.json`, collect.mjs's own zero-entries case, or a version with no artifacts yet) has no bucket to group by, so the same zero-groups gap as `wikiStoreInner`'s applies — one synthetic all-store group instead, `ARTIFACT.empty` reachable through the same `artifactRowsTable([])` every populated-but-empty bucket already renders. */
function artifactStoreInner(artifacts, currentVersion) {
  if (artifacts.entries.length === 0) {
    const groups = [{ key: 'all', label: STORE_LABEL.artifact, count: 0, bodyHtml: countBadge(STORE_LABEL.artifact, 0, ARTIFACT.countUnit) + artifactRowsTable([]) }]
    return groupedStore({ sidebarSubLabel: STORE_LABEL.artifact, crumbLabel: STORE_LABEL.artifact, groups, noGroupUnit: ARTIFACT.countUnit })
  }
  const byBucket = new Map()
  for (const e of artifacts.entries) {
    const bucket = e.fields.bucket
    if (!byBucket.has(bucket)) byBucket.set(bucket, [])
    byBucket.get(bucket).push(e)
  }
  const keys = [...byBucket.keys()]
  const defaultKey = keys.includes(currentVersion) ? currentVersion : keys[0]
  const ordered = defaultKey === undefined ? keys : [defaultKey, ...keys.filter((k) => k !== defaultKey)]
  const groups = ordered.map((key) => {
    const items = byBucket.get(key)
    const badgeLabel = `${key}${ARTIFACT.bucketSuffix}`
    return { key, label: key, count: items.length, bodyHtml: countBadge(badgeLabel, items.length, ARTIFACT.countUnit) + artifactRowsTable(items) }
  })
  return groupedStore({ sidebarSubLabel: STORE_LABEL.artifact, crumbLabel: STORE_LABEL.artifact, groups, noGroupUnit: ARTIFACT.countUnit })
}

/**
 * The detail-data JSON blob's "artifact" bucket. Two shapes, per this
 * generator's own inline/not-inline size rule (viewer/lib/collect.mjs
 * header): an inlined `.md` entry gets a real `body`; a non-inlined
 * `.html`/`.json` entry gets no body and a `fileHref` instead — a relative
 * `file://`-safe link back to the actual file on disk (acceptance line 2:
 * "say so … and link the file rather than showing an empty panel").
 * `artifactsBaseHref` is the path from the GENERATED page's own directory to
 * `docs/artifacts/` (computed once in generate.mjs, since only that module
 * knows where OUTPUT_PATH lives on disk) — defaulted here so a fixture/test
 * that does not pass one still gets the real repo's actual layout.
 */
function artifactDetailEntries(artifacts, artifactsBaseHref, repoRootHref) {
  const entries = {}
  for (const e of artifacts.entries) {
    const f = e.fields
    const id = `${f.bucket}/${f.path}`
    entries[id] = {
      title: f.path,
      kind: f.kind || '',
      status: f.status || '',
      created: f.added_at || '',
      path: e.diskRel,
      body: e.inlined ? md(e.body, path.dirname(e.diskRel), repoRootHref) : undefined,
      fileHref: e.inlined ? undefined : containedFileHref(`${artifactsBaseHref}/${encodeFsPathHref(`${f.bucket}/${f.path}`)}`, repoRootHref),
    }
  }
  return entries
}

// ---------- `#id` deep links (T-746) ----------
// `viewer.html#<id>` opens the page with that item selected — the hand-off
// links `prdt tickets --link` / `prdt viewer` print, and what the auto-open
// hook opens. The anchor table maps every addressable id to where it lives:
// `s` store · `g` sidebar group key · `k`/`i` detail kind + id (absent for a
// PRD round, whose pane IS the document). Keys, one namespace:
//   - a ticket id (`T-746`) — every ticket the page lists, a closed round's
//     frontmatter-only row included
//   - a wiki page's slug (`decision--define-screen-set`) and its repo path
//   - the repo path of every other document the page holds: `docs/prd/PRD.md`
//     (also `PRD`), `docs/prd/versions/<v>.md`, `docs/features/<f>.md`,
//     `docs/artifacts/<bucket>/<file>` (an `.md` one inlined, any other kind
//     its summary row)
// Built from the SAME inputs and the SAME group-key rules as the sidebar
// (`currentTicketBucketKey`, the wiki `type` grouping, the artifact bucket),
// so an anchor can never name a group the page does not draw.
export function buildAnchors(data) {
  const anchors = {}
  const put = (key, entry) => {
    if (key && !Object.prototype.hasOwnProperty.call(anchors, key)) anchors[key] = entry
  }
  // T-792: a current-version item opens inside Home (the group Home draws it
  // in); every other item opens in its own store, as T-746 built it. `put`
  // keeps the first entry, so the Home entries go in first.
  for (const t of currentVersionTickets(data.tickets, data.currentVersion)) {
    const id = t.frontmatter.id || t.rel
    put(id, { s: 'home', g: 'ticket', k: 'ticket', i: id })
  }
  for (const p of currentDecisionPages(data.wiki, data.currentVersion)) {
    const file = p.rel.split('/').pop()
    const entry = { s: 'home', g: 'decision', k: 'wiki', i: file }
    put(file.replace(/\.md$/, ''), entry)
    put(p.rel, entry)
  }
  put('docs/prd/PRD.md', { s: 'home', g: 'prd' })
  put('PRD', { s: 'home', g: 'prd' })
  for (const e of currentArtifactEntries(data.artifacts, data.currentVersion)) {
    const f = e.fields
    put(e.diskRel, { s: 'home', g: 'artifact', k: 'artifact', i: `${f.bucket}/${f.path}` })
  }
  const currentKey = currentTicketBucketKey(data.tickets, data.currentVersion)
  for (const t of data.tickets.included) {
    const id = t.frontmatter.id || t.rel
    put(id, { s: 'ticket', g: t.bucket === 'backlog' ? 'backlog' : currentKey, k: 'ticket', i: id })
  }
  for (const bucket of data.tickets.omitted) {
    for (const t of bucket.tickets) {
      const id = t.frontmatter.id || t.rel
      put(id, { s: 'ticket', g: bucket.bucket, k: 'ticket', i: id })
    }
  }
  for (const p of data.wiki) {
    const file = p.rel.split('/').pop()
    const entry = { s: 'wiki', g: p.frontmatter.type || WIKI_UNCLASSIFIED, k: 'wiki', i: file }
    put(file.replace(/\.md$/, ''), entry)
    put(p.rel, entry)
  }
  const featureModel = featureScreenModel(data)
  if (featureModel) {
    for (const e of featureModel.entries) if (e.spec) put(e.spec.rel, { s: 'feature', g: 'all', k: 'feature', i: e.key })
  } else {
    for (const p of data.features) put(p.rel, { s: 'feature', g: 'all', k: 'feature', i: p.rel.split('/').pop() })
  }
  for (const c of data.prd.closed) {
    put(c.rel, { s: 'prd', g: c.name.replace(/\.md$/, '') })
  }
  for (const e of data.artifacts.entries) {
    const f = e.fields
    put(e.diskRel, { s: 'artifact', g: f.bucket, k: 'artifact', i: `${f.bucket}/${f.path}` })
  }
  return anchors
}

/** Highest ticket number the page lists — an absent `#T-<n>` at or below it names a ticket that existed once (ids are one global counter, contracts §Tickets), i.e. moved or removed since generation: the `stale` notice rather than `unknown`. */
export function maxTicketNumber(data) {
  let max = 0
  const see = (id) => {
    const m = /^T-(\d+)$/.exec(id || '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const t of data.tickets.included) see(t.frontmatter.id)
  for (const b of data.tickets.omitted) for (const t of b.tickets) see(t.frontmatter.id)
  return max
}

const INFO_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'

/** docs/design.md §8.4 Banner (no side stripe, T-756) — hidden until the page is opened at an `#id` it cannot show; the script fills in the id and the text. */
const HASH_NOTICE_HTML = `<div class="notice" id="hash-notice" role="status" hidden>
<span class="notice-icon">${INFO_ICON_SVG}</span>
<span class="notice-body"><b class="js-notice-id"></b> — <span class="js-notice-text"></span></span>
<button type="button" class="notice-close" aria-label="${COMMON.close}">${svgIcon(CLOSE_ICON_PATH, 13)}</button>
</div>
`

function artifactsSection(artifacts, currentVersion) {
  return storeSection('artifact', { innerHtml: artifactStoreInner(artifacts, currentVersion) })
}

// ---------- home: the in-progress version's workspace (T-666 slice 2a) ----------
// Slice 1a/1b proved the shared sidebar-group -> list -> detail-panel model on
// five stores; home was the one deliberately left as a flat summary table
// (T-665's `plainFrame`, see its old outcome note). This slice retires that
// deviation: home now calls the SAME `groupedStore()` every other simple
// store below already shares (acceptance line 2, "no store remains a named
// deviation") rather than inventing the mockup's own `data-view-select`
// naming (docs/artifacts/v1.10/define-screen-set.html home markup) — a sixth
// attribute name driving the same click behavior INTERACTION_SCRIPT already
// has would be doctrine #2's "don't reinvent the wheel" violated a second
// time over. `INTERACTION_SCRIPT` needed no change to drive this: it was
// already generic over `data-group-select`/`data-detail-kind`, scoped to
// `.closest('.store-section')` (slice 1b).
//
// Every group here is scoped to the CURRENT version only (never backlog, a
// closed PRD round, or a non-current artifact bucket) — acceptance line 1,
// "no control inside home throws the reader into the archive". Reaching the
// archive (backlog tickets, closed PRD rounds, other artifact buckets) still
// needs the activity bar, i.e. leaving home for the ticket/PRD/artifact store
// proper — never a home control.

/**
 * Version-wide done/total over every open+done ticket (`status: dropped` or
 * any other value counts toward neither) — the SAME counting rule as
 * statusline-prdt.sh's own `vdone`/`vtotal` (packages/core/scripts/
 * statusline-prdt.sh), never a second rule invented for the viewer, and never
 * narrowed by a ticket's `type` (`decision` included, same as every other
 * type). `scripts/qa/type-to-stage-parity.test.ts` drives both the real
 * script and this function against one shared fixture and asserts their
 * counts agree.
 * @param {Array} currentTickets current-version tickets (any status)
 * @returns {{done: number, total: number}}
 */
export function versionProgressCounts(currentTickets) {
  const counted = currentTickets.filter((t) => t.frontmatter.status === 'open' || t.frontmatter.status === 'done')
  const done = counted.filter((t) => t.frontmatter.status === 'done').length
  return { done, total: counted.length }
}

// ---------- Home 「현재 버전」 (T-881; design T-796 / T-865) ----------
// Stage bar · 스코프 · wait lists · dependency diagram, drawn from the
// approved screen set (docs/artifacts/v1.12/define-screen-set.html,
// home-progress + home-cases). The graph logic is home-graph.mjs; this block
// only draws what it returns. The assignee × PRD-item matrix is gone.

function stageSquare(t) {
  return `<span class="stage-sq${t.done ? ' sq-done' : ''}" title="${escapeHtml(t.id)}"></span>`
}

function homeStageBar(currentTickets, stage) {
  const { done, total } = versionProgressCounts(currentTickets)
  const segs = stageSegments(currentTickets)
  const labelOf = (seg) => {
    const cur = seg.stage === stage
    return `<span class="sb-lab${cur ? ' sb-lab-cur' : ''}">${seg.stage}${cur ? `<span class="sb-here">${HOME.here}</span>` : ''} <span class="mono sb-n">${seg.tickets.length}</span></span>`
  }
  const cells = segs
    .map((seg, i) => {
      const cls = `sb-seg${seg.stage === stage ? ' sb-seg-cur' : ''}${seg.tickets.length === 0 ? ' sb-seg-empty' : ''}`
      const lab = labelOf(seg)
      return `<div class="${cls}"><div class="sb-up">${i % 2 === 0 ? lab : ''}</div><div class="sb-sq">${seg.tickets.map(stageSquare).join('')}</div><div class="sb-dn">${i % 2 === 1 ? lab : ''}</div></div>`
    })
    .join('')
  return `<div class="sb"><span class="sb-tick" aria-hidden="true"></span>${cells}<span class="mono sb-total">${done}/${total}</span></div>`
}

function ticketButtonAttrs(id) {
  return `data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}" role="button" tabindex="0"`
}

/** 스코프: one row per PRD item of the open section (label up to its colon; the full heading is the tooltip), then 「항목 밖」. */
function homeScope(data, currentTickets) {
  const openItems = data.prd.openItems || []
  const byItem = new Map(openItems.map((i) => [i.key, []]))
  const outOfScope = []
  for (const t of currentTickets) {
    if (t.frontmatter.status !== 'open' && t.frontmatter.status !== 'done') continue
    const key = prdItemKey(t.frontmatter.prd_item || '', data.currentVersion)
    if (key && byItem.has(key)) byItem.get(key).push(t)
    else outOfScope.push(t)
  }
  const row = (label, title, tickets, extra = '') => {
    const sorted = [...tickets.filter((t) => t.frontmatter.status === 'done'), ...tickets.filter((t) => t.frontmatter.status !== 'done')]
      .map((t) => t)
      .sort((x, y) => (x.frontmatter.status === 'done' ? 0 : 1) - (y.frontmatter.status === 'done' ? 0 : 1) || compareTicketIds(x.frontmatter.id, y.frontmatter.id))
    const done = tickets.filter((t) => t.frontmatter.status === 'done').length
    const sq = sorted
      .map((t) => `<span class="stage-sq sc-btn${t.frontmatter.status === 'done' ? ' sq-done' : ''}" ${ticketButtonAttrs(t.frontmatter.id)} aria-label="${escapeHtml(t.frontmatter.id)}" title="${escapeHtml(t.frontmatter.id)}"></span>`)
      .join('')
    return `<div class="sc-row${extra}"><span class="sc-lab" title="${escapeHtml(title)}">${escapeHtml(label)}</span><span class="sc-sq">${sq}</span><span class="mono sc-n">${done}/${tickets.length}</span></div>`
  }
  const rows = openItems.map((i) => {
    const plain = i.label.replace(/`/g, '')
    return row(plain.split(/[:：]/)[0].trim(), plain, byItem.get(i.key))
  })
  if (outOfScope.length > 0) rows.push(row(PROGRESS_OUT_OF_SCOPE_LABEL, PROGRESS_OUT_OF_SCOPE_LABEL, outOfScope, ' sc-out'))
  return `<div><div class="cp-h">${HOME.scope} <span class="cp-sub">${HOME.scopeSub(openItems.length)}</span></div>${rows.join('')}</div>`
}

function homeWaits(data) {
  const { dec, req } = waitLists(allTicketRows(data.tickets))
  const block = (label, list, empty) =>
    `<div><div class="cp-h">${label} <span class="mono cp-n">${list.length}</span></div>` +
    (list.length === 0
      ? `<p class="cp-empty">${empty}</p>`
      : `<div class="cp-wlist">${list
          .map((fm) => `<button type="button" class="cp-went" data-detail-kind="ticket" data-detail-id="${escapeHtml(fm.id)}"><span class="mono">${escapeHtml(fm.id)}</span> ${escapeHtml(fm.slug || '')} ${ticketRolePill(fm.assignee)}</button>`)
          .join('')}</div>`) +
    '</div>'
  return `<div class="sc-waits">${block(HOME.waitDec, dec, HOME.waitDecEmpty)}${block(HOME.waitReq, req, HOME.waitReqEmpty)}</div>`
}

// ---- dependency diagram ----
const DG_ID = 'home-dg'
function textWidth(str) {
  let w = 0
  for (const ch of str) w += /[\u0000-ÿ]/.test(ch) ? 5.4 : 10.5
  return w
}
function fitText(str, max) {
  if (textWidth(str) <= max) return str
  let out = ''
  for (const ch of str) {
    if (textWidth(out + ch + '…') > max) break
    out += ch
  }
  return out + '…'
}
/** How far a wrapped chip row may run past a box's right edge — the column gap is 28px. */
const CHIP_OVERHANG = 20
function chipWidth(label) {
  let w = 14
  for (const ch of label) w += ch === ' ' ? 3 : 9
  return w
}
function diagramChip(kind, label, x, y) {
  const w = chipWidth(label)
  return `<rect class="dg-chip dg-chip-${kind}" height="15" rx="7.5" width="${w}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"></rect><text class="dg-chip-t dg-chip-t-${kind}" text-anchor="middle" x="${(x + w / 2).toFixed(1)}" y="${(y + 10.5).toFixed(1)}">${escapeHtml(label)}</text>`
}
function diagramRole(role, x, y) {
  const w = Number((5.4 * role.length + 8).toFixed(1))
  const rx = x + NODE_W - 5 - w
  const cls = ['po', 'designer', 'developer', 'qa', 'user'].includes(role) ? role : 'other'
  return `<rect class="dg-role-bg dg-role-${cls}" height="13" rx="6.5" width="${w}" x="${rx.toFixed(1)}" y="${y + 4}"></rect><text class="dg-role dg-role-${cls}" text-anchor="middle" x="${(rx + w / 2).toFixed(1)}" y="${y + 13.5}">${escapeHtml(role)}</text>`
}

/** The ticket diagram's markup, and which legend entries it needs. */
function dependencyDiagram(graph, layout) {
  const nodes = layout.nodes
  const firstBy = (pred, key) => nodes.filter(pred).sort(key)[0]
  const topLeft = (a, b) => a.y - b.y || a.x - b.x
  const leftTop = (a, b) => a.x - b.x || a.y - b.y
  const spineFirst = graph.cpIsSpine || graph.spine.size > 0 ? firstBy((n) => n.sp, topLeft) : null
  const cpFirst = graph.cpIsSpine ? null : firstBy((n) => n.cp && !n.sp, leftTop)
  const uses = { gate: false, rider: false, turn: false, done: false }
  const marker = (suffix) =>
    `<marker id="${DG_ID}${suffix}" markerheight="6" markerunits="userSpaceOnUse" markerwidth="6" orient="auto" refx="9" refy="5" viewBox="0 0 10 10"><path class="dg-ah${suffix ? `-${suffix.slice(1)}` : ''}" d="M0,0 L10,5 L0,10 z"></path></marker>`
  const edgeSvg = layout.edges
    .map((e) => {
      const kind = e.sp ? 'sp' : e.cp ? 'cp' : ''
      return `<path class="dg-e${kind ? ` dg-e-${kind}` : ''}" d="${e.d}" marker-end="url(#${DG_ID}${kind ? `-${kind}` : ''})"></path>`
    })
    .join('')
  const nodeSvg = nodes
    .map((n) => {
      const cls = `dg-n${n.sp ? ' dg-n-sp' : n.cp ? ' dg-n-cp' : ''}${n.gate ? ' dg-n-gate' : ''}${n.done ? ' dg-n-done' : ''}`
      const chips = []
      // Chips sit on the row above the box. State chips (사용자를 기다림 · 합격선 · 라이더) and the
      // route label (메인 패스 / 크리티컬 패스) share it: label left, state chips right-aligned
      // when they all fit; otherwise they flow left to right from the box's left edge, 사용자를
      // 기다림 first, and what does not fit moves up one row — never over another chip.
      const state = []
      if (n.waits) { state.push(['turn', HOME.chipTurn]); uses.turn = true }
      if (n.gate) { state.push(['gate', HOME.chipGate]); uses.gate = true }
      if (n.rider) { state.push(['rider', HOME.chipRider]); uses.rider = true }
      if (n.done) uses.done = true
      let label = null
      if (spineFirst && n.id === spineFirst.id) label = ['sp', HOME.chipMain]
      else if (cpFirst && n.id === cpFirst.id) label = ['cp', HOME.chipCritical]
      const rightW = state.reduce((s, [, l]) => s + chipWidth(l) + 4, -4)
      const leftW = label ? chipWidth(label[1]) : 0
      if (!label || state.length === 0 || leftW + rightW + 4 <= NODE_W) {
        let right = n.x + NODE_W
        for (const [kind, l] of state) {
          const w = chipWidth(l)
          chips.push(diagramChip(kind, l, right - w, n.y - 15))
          right -= w + 4
        }
        if (label) chips.push(diagramChip(label[0], label[1], n.x, n.y - 15))
      } else {
        // The gap between rows fits two chip rows, never three. When wrapping inside the box's own
        // width would take a third row, the rows may run past the box's right edge (into the column
        // gap, short of the next box) so they stay at two.
        const order = [...state, label]
        const flow = (limit) => {
          const placed = []
          let x = n.x
          let row = 0
          for (const [kind, l] of order) {
            const w = chipWidth(l)
            if (x > n.x && x + w > limit) { row += 1; x = n.x }
            placed.push([kind, l, x, row])
            x += w + 4
          }
          return { placed, rows: row + 1 }
        }
        let flowed = flow(n.x + NODE_W)
        if (flowed.rows > 2) {
          const wide = flow(n.x + NODE_W + CHIP_OVERHANG)
          if (wide.rows < flowed.rows) flowed = wide
        }
        for (const [kind, l, x, row] of flowed.placed) chips.push(diagramChip(kind, l, x, n.y - 15 - row * 17))
      }
      const idText = `${n.id}${n.done ? ' ✓' : ''}`
      return (
        `<g class="dg-a dg-btn" ${ticketButtonAttrs(n.id)} aria-label="${escapeHtml(HOME.nodeOpen(n.id))}"><title>${escapeHtml(`${n.id} ${n.slug}`.trim())}</title>` +
        `<g class="${cls}"><rect class="dg-box" height="${NODE_H}" rx="8" width="${NODE_W}" x="${n.x}" y="${n.y}"></rect>` +
        `<text class="dg-id" x="${n.x + 8}" y="${n.y + 14}">${escapeHtml(idText)}</text>` +
        `<text class="dg-t" x="${n.x + 8}" y="${n.y + 31}">${escapeHtml(fitText(n.slug, NODE_W - 16))}</text>` +
        `${diagramRole(n.assignee, n.x, n.y)}</g>${chips.join('')}</g>`
      )
    })
    .join('')
  const svg = `<svg class="dg" height="${layout.height}" style="width:${layout.width}px;height:${layout.height}px;max-width:none" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}"><defs>${marker('')}${marker('-cp')}${marker('-sp')}</defs>${edgeSvg}${nodeSvg}</svg>`
  const sw = (cls) => `<i class="lg ${cls}"></i>`
  const legend = []
  if (graph.spine.size > 0 && graph.connected) {
    legend.push(graph.cpIsSpine ? `<span>${sw('lg-sp')}${HOME.legendMainCritical}</span>` : `<span>${sw('lg-sp')}${HOME.chipMain}</span><span>${sw('lg-cp')}${HOME.chipCritical}</span>`)
  } else {
    legend.push(`<span>${sw('lg-cp')}${HOME.chipCritical}</span>`)
  }
  if (uses.gate) legend.push(`<span><span class="lgc lgc-gate">${HOME.chipGate}</span></span>`)
  if (uses.done) legend.push(`<span>${sw('lg-done')}${HOME.legendDone}</span>`)
  if (uses.rider) legend.push(`<span><span class="lgc lgc-rider">${HOME.chipRider}</span> ${HOME.legendRider}</span>`)
  if (uses.turn) legend.push(`<span><span class="lgr">user</span><span class="lgc lgc-turn">${HOME.chipTurn}</span></span>`)
  return `<div class="dg-wrap">${svg}</div><div class="dg-legend">${legend.join('')}</div>`
}

function homeDependency(data, currentTickets) {
  const graph = buildHomeGraph({ tickets: currentTickets, gatePath: data.prd.gatePath || '' })
  const drawable = graph.connected && graph.spine.size > 0
  const stage = data.poState?.stage
  const sub = !graph.connected && stage === 'define' && graph.nodes.length > 0 ? ` <span class="cp-sub">${HOME.beforeBuild}</span>` : ''
  const head = `<div class="cp-h">${HOME.dependency}${sub}</div>`
  const notice = graph.connected || graph.nodes.length === 0 ? '' : `<div class="cp-spine-none">${stage === 'define' ? HOME.notConnected : HOME.notConnectedBuilt}</div>`
  if (graph.nodes.length === 0) return `<div class="cp-block">${head}${notice}<p class="cp-empty">${HOME.dependencyEmpty}</p></div>`
  void drawable
  return `<div class="cp-block">${head}${notice}${dependencyDiagram(graph, layoutHomeGraph(graph))}</div>`
}

function homeProgressBody(data) {
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  return `<div class="dash-card">
<div class="dash-card-title">${svgIcon(STORE_ICON_PATHS.home, 14)} <span>${HOME.working}</span></div>
${homeStageBar(currentTickets, data.poState?.stage || '?')}
<div class="sc sc-grid">${homeScope(data, currentTickets)}${homeWaits(data)}</div>
${homeDependency(data, currentTickets)}
</div>`
}

function homeSection(data, repoRootHref) {
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  // T-713 scope note: `e.fields.bucket` matching stays literal (never
  // `sameVersion`) — an artifact-manifest bucket spelled differently from
  // po-state's version string is a latent bug class out of this scope.
  const currentArtifacts = currentArtifactEntries(data.artifacts, data.currentVersion)
  const currentDecisions = currentDecisionPages(data.wiki, data.currentVersion)
  const groups = [
    { key: 'progress', label: HOME.working, bodyHtml: `<div class="dash-grid">${homeProgressBody(data)}</div>` },
    { key: 'artifact', label: STORE_LABEL.artifact, count: currentArtifacts.length, bodyHtml: artifactRowsTable(currentArtifacts) },
    { key: 'prd', label: STORE_LABEL.prd, count: data.currentVersion, bodyHtml: prdOpenBody(data.prd, repoRootHref, { tickets: data.tickets, currentVersion: data.currentVersion, idPrefix: 'home-prd' }) },
    { key: 'ticket', label: STORE_LABEL.ticket, count: currentTickets.length, bodyHtml: ticketRowsTable(currentTickets) },
    { key: 'decision', label: HOME.decision, count: currentDecisions.length, bodyHtml: wikiRowsTable(currentDecisions) },
  ]
  // T-796: the tab and its heading name the version (「현재 버전 · v1.12」).
  const heading = `${STORE_LABEL.home} · ${data.currentVersion}`
  return storeSection('home', { active: true, innerHtml: groupedStore({ sidebarSubLabel: heading, crumbLabel: heading, groups, topHtml: HASH_NOTICE_HTML }) })
}

export const TEMPLATE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; overflow-x: hidden; }
body {
  font-family: var(--font-family);
  background: var(--bg-base);
  color: var(--text-primary);
  line-height: 1.6;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
code { font-family: var(--font-mono); font-size: 0.9em; }

/* ---------- app shell (T-666 slice 1a) — activity bar | sidebar | main | detail panel ---------- */
.app-shell { flex: 1; min-height: 0; display: flex; overflow: clip; }
.activity {
  width: 48px; flex: 0 0 48px; background: var(--bg-base); border-right: 1px solid var(--border-item);
  display: flex; flex-direction: column; align-items: center; padding-top: 12px; gap: 4px;
}
.activity-btn {
  background: transparent; border: none; border-radius: 8px; width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  color: var(--text-quaternary); padding: 0; transition: color 120ms, background 120ms; flex-shrink: 0;
}
.activity-btn:hover { background: var(--bg-state-hover); color: var(--text-primary); }
.activity-btn.active { background: var(--bg-interaction-neutral); color: var(--accent); }

.store-section { display: none; flex: 1; min-width: 0; min-height: 0; }
.store-section.active { display: flex; }

.sidebar {
  width: 250px; flex: 0 0 250px; background: var(--bg-surface-on); border-right: 1px solid var(--border-item);
  padding: var(--space-16) var(--space-12); overflow-y: auto;
}
.sidebar-title { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-quaternary); margin: 0 0 var(--space-4); }
.sidebar-sub { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-16); }
.nav-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-8);
  padding: var(--space-6) var(--space-8); border-radius: var(--radius-8); font-size: 12.5px;
  color: var(--text-secondary); width: 100%; text-align: left; font-family: var(--font-family);
  border: none; background: none;
}
.nav-item.active { background: var(--accent); color: var(--accent-contrast); }
.nav-item.active .nav-item-count { color: var(--accent-contrast); }
.nav-item .nav-item-count { font-family: var(--font-mono); font-size: 10px; color: var(--text-quaternary); }
.nav-item-clickable { cursor: pointer; }
.nav-item-clickable:hover { background: var(--bg-state-hover); }
.nav-item-clickable.active:hover { background: var(--accent); }
.nav-item-clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.view-pane { display: none; }
.view-pane.active { display: block; }

/* T-909: overflow: clip — the closed detail panel parks at translateX(100%) inside this column; without a clip a horizontal swipe / shift-wheel scrolled the page and showed it. clip (unlike hidden) is not user- or focus-scrollable. */
.frame-main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; position: relative; overflow: clip; }
.topstrip {
  height: 44px; flex: 0 0 44px; display: flex; align-items: center; gap: var(--space-8);
  padding: 0 var(--space-20); border-bottom: 1px solid var(--border-item); background: var(--bg-surface-base);
}
.topstrip-crumb { font-size: 12px; color: var(--text-tertiary); }
.topstrip-crumb b { color: var(--text-primary); font-weight: 600; }
.frame-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: var(--space-32) var(--space-40); }
.main-inner { max-width: 1040px; margin: 0 auto; }
/* T-708 결함 1: home is the one dashboard-card screen (progress stats +
   matrix, table-shaped data with no paragraph-readability reason for a cap)
   — every other store keeps the 1040px narrative cap above. Scoped by
   data-store, not a second .main-inner variant class, since main-inner is
   shared markup across every groupedStore()/ticketStoreInner() call. */
.store-section[data-store="home"] .main-inner { max-width: none; }
.section-meta { margin-bottom: var(--space-12); }
.count-badge { font-size: 11.5px; color: var(--text-tertiary); }
.count-badge b { color: var(--text-primary); font-weight: 600; }

.detail-row { cursor: pointer; }
.detail-row:hover td { background: var(--bg-state-hover); }
.detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(820px, 92%);
  background: var(--bg-surface-base); border-left: 1px solid var(--border-hover);
  transform: translateX(100%);
  transition: transform 200ms ease; z-index: 5; display: flex; flex-direction: column;
}
.detail-panel.active { transform: translateX(0); }
.detail-panel-header {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: flex-start; gap: var(--space-8);
  padding: var(--space-16) var(--space-20); border-bottom: 1px solid var(--border-item);
}
.detail-panel-title { font-size: 15px; font-weight: 700; color: var(--text-primary); min-width: 0; overflow-wrap: break-word; }
.detail-panel-close {
  flex: 0 0 auto; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: none; background: var(--bg-interaction-neutral); border-radius: var(--radius-8); cursor: pointer; color: var(--text-secondary);
}
.detail-panel-close:hover { background: var(--border-hover); }
.detail-panel-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-20) var(--space-24) var(--space-32); }
.detail-meta { display: flex; flex-wrap: wrap; gap: var(--space-16); padding-bottom: var(--space-16); margin-bottom: var(--space-16); border-bottom: 1px solid var(--border-item); }
.detail-field { display: flex; align-items: baseline; gap: 6px; font-size: 12px; }
.detail-field-label { color: var(--text-tertiary); }
.detail-field-value { color: var(--text-primary); font-weight: 500; }
.detail-doc { font-size: 13.5px; }
.detail-doc :first-child { margin-top: 0; }
.detail-doc a, .v-body a { color: var(--accent); }

/* ---------- pills (ticket type/status/role + T-666 heading chips) ---------- */
.pill { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 8px; border-radius: var(--radius-100); line-height: 1.5; white-space: nowrap; }
.pill-neutral { background: var(--bg-interaction-neutral); color: var(--text-secondary); }
.pill-type { background: var(--bg-interaction-neutral); color: var(--text-secondary); }
.pill-error { background: color-mix(in srgb, var(--status-blocked) 14%, transparent); color: var(--status-blocked); }
.pill-status-done { background: color-mix(in srgb, var(--status-done) 14%, transparent); color: var(--status-done); }
.pill-status-progress { background: color-mix(in srgb, var(--status-in-progress) 14%, transparent); color: var(--status-in-progress); }
.pill-status-review { background: color-mix(in srgb, var(--status-review) 14%, transparent); color: var(--status-review); }
.pill-status-blocked { background: color-mix(in srgb, var(--status-blocked) 14%, transparent); color: var(--status-blocked); }
.pill-status-todo { background: var(--bg-interaction-neutral); color: var(--text-tertiary); }
.pill-status-abandoned { background: color-mix(in srgb, var(--status-abandoned) 20%, transparent); color: var(--text-tertiary); }
.pill-role-po { background: color-mix(in srgb, var(--persona-po) 14%, transparent); color: var(--persona-po); }
.pill-role-designer { background: color-mix(in srgb, var(--persona-designer) 14%, transparent); color: var(--persona-designer); }
.pill-role-developer { background: color-mix(in srgb, var(--persona-dev) 14%, transparent); color: var(--persona-dev); }
.pill-role-qa { background: color-mix(in srgb, var(--persona-qa) 14%, transparent); color: var(--persona-qa); }
/* T-666: a document's own section headings become chips — one rule, every
   renderer (hardenedRenderer.heading above is the one place that emits
   these classes). Extends the ticket/type/role pill vocabulary above rather
   than a parallel system — same tokens, same base class. */
.pill-heading-1 { text-transform: none; letter-spacing: 0; white-space: normal; font-size: 13px; font-weight: 700;
  background: var(--bg-interaction-neutral); color: var(--text-primary); padding: 5px 12px; border-radius: var(--radius-8); }
.pill-heading-2 { white-space: normal; background: var(--bg-interaction-neutral); color: var(--text-secondary);
  padding: 3px 10px; border-radius: var(--radius-8); }
.pill-heading-3 { text-transform: none; letter-spacing: 0; white-space: normal; font-size: 11px; font-weight: 600;
  background: var(--bg-interaction-neutral); color: var(--text-tertiary); padding: 2px 8px; border-radius: var(--radius-4); }
/* T-884: h4 and deeper — a plain text rule, never the h3 chip, so the hierarchy reads at a glance. */
.pill-heading-4 { text-transform: none; letter-spacing: 0; white-space: normal; font-size: 11px; font-weight: 600;
  background: none; color: var(--text-secondary); padding: 0 0 0 var(--space-8); border-radius: 0; border-left: 2px solid var(--border-hover); }

/* ---------- Home 「현재 버전」 (T-881) — ported from the approved screen set
   (docs/artifacts/v1.12/define-screen-set.html, home-progress + home-cases). ---------- */
.dash-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-16); }
.dash-card { border: 1px solid var(--border-item); border-radius: var(--radius-12); background: var(--bg-surface-base); padding: var(--space-20); }
.dash-card-title { font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); margin: 0 0 var(--space-12); display: flex; align-items: center; gap: var(--space-8); }
.sb { display: flex; align-items: center; gap: 0; margin: var(--space-4) 0 var(--space-4); flex-wrap: nowrap; min-width: 0; max-width: 100%; }
.sb-tick { width: 2px; height: 34px; background: var(--text-secondary); border-radius: 1px; margin-right: var(--space-6); flex: 0 0 auto; }
.sb-seg { display: grid; grid-template-rows: 20px auto 20px; align-content: start; padding: 0 var(--space-6) 0 0; margin-right: var(--space-6); border-right: 1px dashed var(--border-inline); flex: 0 1 auto; min-width: 56px; }
.sb-seg:last-of-type { border-right: none; }
.sb-sq { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; min-height: 14px; }
.sb-seg-cur .sb-sq { box-shadow: 0 2px 0 0 var(--accent); padding-bottom: 3px; }
.sb-up { display: flex; align-items: flex-end; }
.sb-dn { display: flex; align-items: flex-start; }
.sb-lab { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; display: inline-flex; align-items: center; gap: var(--space-4); }
.sb-lab-cur { color: var(--text-primary); font-weight: 600; }
.sb-n { color: var(--text-quaternary); font-size: 10px; font-weight: 400; }
.sb-here { font-family: var(--font-family); font-size: 10px; font-weight: 600; color: var(--accent-contrast); background: var(--accent); border-radius: var(--radius-100); padding: 0 6px; line-height: 15px; }
.sb-seg-empty .sb-sq::before { content: ""; width: 1px; height: 10px; background: var(--border-inline); }
.sb-total { font-size: 11px; color: var(--text-secondary); margin-left: var(--space-4); flex: 0 0 auto; }
.stage-sq { width: 10px; height: 10px; border-radius: 2px; background: var(--bg-interaction-neutral); border: 1px solid var(--border-inline); flex: 0 0 auto; }
.stage-sq.sq-done { background: var(--accent); border-color: var(--accent); }
.sc { border-top: 1px solid var(--border-item); margin: var(--space-16) 0 0; padding: var(--space-16) 0 0; }
.sc-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr); gap: var(--space-24); }
.sc-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; align-items: center; gap: var(--space-10); min-height: 20px; }
.sc-lab { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-out .sc-lab { color: var(--text-tertiary); }
.sc-sq { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; min-width: 0; }
.sc-n { font-size: 10.5px; color: var(--text-tertiary); }
.sc-btn { cursor: pointer; }
.sc-btn.is-open { outline: 2px solid var(--text-primary); outline-offset: 1px; }
.sc-waits { min-width: 0; display: flex; flex-direction: column; gap: var(--space-16); border-left: 1px solid var(--border-item); padding-left: var(--space-24); }
.cp-block { border-top: 1px solid var(--border-item); margin: var(--space-16) 0 0; padding: var(--space-16) 0 0; }
.cp-h { font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-10); display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap; }
.cp-sub { font-weight: 400; color: var(--text-tertiary); font-size: 11.5px; }
.cp-n { font-size: 10.5px; color: var(--text-quaternary); font-weight: 400; }
.cp-empty { font-size: 11.5px; color: var(--text-tertiary); margin: var(--space-4) 0 0; }
.cp-wlist { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.cp-went { font: inherit; font-size: 12px; text-align: left; display: inline-flex; align-items: center; gap: 6px; background: var(--bg-surface-base); color: var(--text-primary); border: 1px solid var(--border-inline); border-radius: var(--radius-8); padding: 4px 8px; cursor: pointer; }
.cp-went.is-open { border-color: var(--text-primary); box-shadow: 0 0 0 1px var(--text-primary); }
.cp-spine-none { font-size: 12px; color: var(--text-primary); background: var(--bg-interaction-subtle); border: 1px dashed var(--border-inline); border-radius: var(--radius-8); padding: var(--space-6) var(--space-10); margin: 0 0 var(--space-12); }
.dg { display: block; overflow: visible; }
.dg-wrap { overflow-x: auto; min-width: 0; max-width: 100%; }
.dg-n .dg-box { fill: var(--bg-surface-base); stroke: var(--border-inline); stroke-width: 1; }
.dg-n-sp .dg-box { fill: color-mix(in srgb, var(--accent) 22%, var(--bg-surface-base)); stroke: var(--accent); stroke-width: 2; }
.dg-n-cp .dg-box { fill: var(--bg-surface-base); stroke: var(--text-quaternary); stroke-width: 1.5; }
.dg-n-gate .dg-box { stroke: var(--status-done); stroke-width: 2; fill: color-mix(in srgb, var(--status-done) 14%, var(--bg-surface-base)); }
.dg-n-done .dg-box { fill: var(--bg-interaction-subtle); stroke: var(--text-quaternary); stroke-dasharray: 3 2; }
.dg-id { font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; fill: var(--text-secondary); }
.dg-n-sp .dg-id { fill: color-mix(in srgb, var(--accent) 50%, var(--text-primary)); }
.dg-n-sp .dg-t { font-weight: 600; }
.dg-t { font-family: var(--font-family); font-size: 10.5px; fill: var(--text-primary); }
.dg-n-done .dg-t, .dg-n-done .dg-id { fill: var(--text-tertiary); }
.dg-btn { cursor: pointer; }
.dg-btn:hover .dg-box { stroke-width: 2.5; }
.dg-btn:focus { outline: none; }
.dg-btn:focus-visible .dg-box { stroke: var(--accent); stroke-width: 2.5; }
.dg-btn.is-open .dg-box { stroke: var(--text-primary); stroke-width: 2.5; }
.dg-e { fill: none; stroke: var(--text-quaternary); stroke-width: 1; }
.dg-e-sp { stroke: var(--accent); stroke-width: 1.25; }
.dg-e-cp { stroke: var(--text-tertiary); stroke-width: 1; }
.dg-ah { fill: var(--text-quaternary); }
.dg-ah-cp { fill: var(--text-tertiary); }
.dg-ah-sp { fill: var(--accent); }
.dg-chip-t { font-family: var(--font-family); font-size: 9.5px; font-weight: 600; }
.dg-chip-sp { fill: var(--accent); }
.dg-chip-t-sp { fill: var(--accent-contrast); }
.dg-chip-cp { fill: var(--bg-surface-base); stroke: var(--text-quaternary); stroke-width: 1; }
.dg-chip-t-cp { fill: var(--text-secondary); }
.dg-chip-gate { fill: color-mix(in srgb, var(--status-done) 22%, var(--bg-surface-base)); stroke: var(--status-done); stroke-width: 1.5; }
.dg-chip-t-gate { fill: var(--text-primary); }
.dg-chip-rider { fill: var(--bg-interaction-neutral); }
.dg-chip-t-rider { fill: var(--text-primary); }
.dg-chip-turn { fill: color-mix(in srgb, var(--status-review) 18%, var(--bg-surface-base)); stroke: var(--status-review); }
.dg-chip-t-turn { fill: var(--text-primary); }
.dg-role { font-family: var(--font-mono); font-size: 9px; font-weight: 600; }
.dg-role-bg { stroke: none; }
.dg-role-designer { fill: color-mix(in srgb, var(--persona-designer) 80%, var(--text-primary)); }
.dg-role-bg.dg-role-designer { fill: color-mix(in srgb, var(--persona-designer) 14%, transparent); }
.dg-role-developer { fill: color-mix(in srgb, var(--persona-dev) 80%, var(--text-primary)); }
.dg-role-bg.dg-role-developer { fill: color-mix(in srgb, var(--persona-dev) 14%, transparent); }
.dg-role-qa { fill: color-mix(in srgb, var(--persona-qa) 80%, var(--text-primary)); }
.dg-role-bg.dg-role-qa { fill: color-mix(in srgb, var(--persona-qa) 14%, transparent); }
.dg-role-po { fill: color-mix(in srgb, var(--persona-po) 80%, var(--text-primary)); }
.dg-role-bg.dg-role-po { fill: color-mix(in srgb, var(--persona-po) 14%, transparent); }
.dg-n-sp text.dg-role-po { fill: color-mix(in srgb, var(--persona-po) 60%, var(--text-primary)); }
.dg-n-sp text.dg-role-designer { fill: color-mix(in srgb, var(--persona-designer) 60%, var(--text-primary)); }
.dg-n-sp text.dg-role-developer { fill: color-mix(in srgb, var(--persona-dev) 60%, var(--text-primary)); }
.dg-n-sp text.dg-role-qa { fill: color-mix(in srgb, var(--persona-qa) 60%, var(--text-primary)); }
.dg-role-user { fill: var(--bg-surface-base); }
.dg-role-bg.dg-role-user { fill: var(--text-primary); }
.dg-role-other { fill: var(--text-secondary); }
.dg-role-bg.dg-role-other { fill: var(--bg-interaction-neutral); }
.dg-legend { display: flex; flex-wrap: wrap; gap: var(--space-6) var(--space-16); font-size: 11px; color: var(--text-tertiary); margin: var(--space-10) 0 0; align-items: center; }
.dg-legend span { display: inline-flex; align-items: center; gap: var(--space-6); }
.lg { display: inline-block; width: 18px; height: 10px; border-radius: 3px; border: 1px solid var(--border-inline); background: var(--bg-surface-base); }
.lg.lg-sp { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 22%, var(--bg-surface-base)); }
.lg.lg-cp { border: 1.5px solid var(--text-quaternary); background: var(--bg-surface-base); }
.lg.lg-done { border: 1px dashed var(--text-quaternary); background: var(--bg-interaction-subtle); }
.lgc { font-size: 10px; font-weight: 600; border-radius: var(--radius-100); padding: 0 7px; line-height: 15px; color: var(--text-primary); }
.lgc-rider { background: var(--bg-interaction-neutral); }
.lgc-gate { border: 1.5px solid var(--status-done); background: color-mix(in srgb, var(--status-done) 22%, var(--bg-surface-base)); }
.lgc-turn { border: 1px solid var(--status-review); background: color-mix(in srgb, var(--status-review) 18%, var(--bg-surface-base)); }
.lgr { font-family: var(--font-mono); font-size: 9px; font-weight: 600; border-radius: var(--radius-100); padding: 0 6px; line-height: 13px; margin-right: 4px; color: var(--bg-surface-base); background: var(--text-primary); }
/* T-796: role pills read lowercase everywhere (the base .pill uppercases); the user pill is a solid ink chip. */
.pill-user-ink { background: var(--text-primary); color: var(--bg-surface-base); }
.pill[class*="pill-role-"], .pill-user-ink { text-transform: none; letter-spacing: 0; font-family: var(--font-mono); }
/* ---------- tables ---------- */
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-quaternary);
  font-weight: 600; padding: var(--space-8) var(--space-10); border-bottom: 1px solid var(--border-hover);
  background: var(--bg-surface-on); }
td { padding: var(--space-6) var(--space-10); border-bottom: 1px solid var(--border-item); vertical-align: top; color: var(--text-primary); }
tbody tr:hover td { background: var(--bg-state-hover); }
.id-col { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }
.table-wrap { border: 1px solid var(--border-item); border-radius: var(--radius-8); overflow: hidden; overflow-x: auto; }

/* T-708 결함 9 root cause: T-665's old flat layout ('plainFrame', since
   removed — see the "app shell" comment block above) drew its document
   listings as bare '<section>'/'<article>' elements and styled them with
   these two bare-tag rules. The ONLY '<section>' this generator emits today
   is '.store-section' itself (storeSection(), above) — a real '<article>'
   is emitted nowhere (both confirmed by grep) — so 'margin-bottom'/
   'padding-bottom'/'border-bottom' here were landing on the app shell's own
   frame, not on any document listing: PO measured (headless 2000×900)
   '.store-section' stopping 24px short of the window bottom and its
   sidebar/main columns a further ~25px short of that (the rule's own
   padding-bottom + border-bottom), leaving two stacked empty bands. Dead
   CSS with exactly one, wrong, live target — removed rather than scoped
   around, since nothing legitimate depends on it.
   the bare "section h2" rule's border-bottom/padding-bottom is dropped for
   the same reason: rendered document bodies embed real '<h2>' elements (via
   hardenedRenderer.heading → .pill-heading-2) that are themselves
   descendants of '.store-section' — that selector reached those too,
   doubling up on '.pill-heading-2''s own border/padding. */
.v-path, .v-note { color: var(--text-tertiary); font-size: 0.8rem; }
.v-note { background: var(--bg-surface-on); padding: var(--space-8) var(--space-12); border-radius: var(--radius-4); }
table.v-fm, table.v-omitted, table.v-artifacts { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: var(--space-8) 0; }
table.v-fm th, table.v-fm td, table.v-omitted th, table.v-omitted td, table.v-artifacts th, table.v-artifacts td {
  text-align: left; padding: var(--space-4) var(--space-8); border-bottom: 1px solid var(--border-item);
}
table.v-fm th { width: 160px; color: var(--text-secondary); font-weight: 600; }
table.v-omitted th, table.v-artifacts th { color: var(--text-secondary); border-bottom: 1px solid var(--border-section); }
.v-body :is(h1,h2,h3,h4) { margin-top: var(--space-16); }
.v-body pre { background: var(--bg-surface-on); padding: var(--space-12); border-radius: var(--radius-4); white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-doc pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.v-body table { border-collapse: collapse; }
.v-body table th, .v-body table td { border: 1px solid var(--border-item); padding: var(--space-4) var(--space-8); }
details.v-fold summary { cursor: pointer; color: var(--icon-tertiary); padding: var(--space-8) 0; }
details.v-fold[open] summary { color: var(--text-primary); }

/* ---------- light/dark toggle (T-806 개정 — the bottom of the activity rail;
   T-797 first placed it in the topstrip's top-right slot, where the
   .detail-panel overlay (position: absolute; top: 0 — see its rule below)
   covers it the moment a ticket/PRD/artifact/wiki item opens. The activity
   rail sits OUTSIDE .frame-main-col, so the overlay never reaches it, and
   the rail is the one element present unchanged across every view: Home,
   every store tab, and any item open. margin-top: auto (not margin-left,
   T-797's horizontal-flex value) pushes it to the rail's bottom edge in the
   rail's own column flex. ) ---------- */
.activity-theme-toggle { margin-top: auto; margin-bottom: var(--space-16); width: 28px; height: 28px; border: none; background: none; padding: 0; cursor: pointer;
  color: var(--text-tertiary); border-radius: var(--radius-4); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.activity-theme-toggle:hover { background: var(--bg-state-hover); color: var(--text-primary); }
.activity-theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.theme-icon-sun, :root[data-theme="dark"] .theme-icon-moon { display: none; }
.theme-icon-moon, :root[data-theme="dark"] .theme-icon-sun { display: flex; }
/* T-797: light scheme only — a 14% tint of the same hue under its own text
   measured below AA (4.05–4.45:1). Pulling the text 20% toward
   --text-primary keeps the hue and clears 4.5:1 on both light surfaces;
   dark keeps the plain token (it already passes). */
:root:not([data-theme="dark"]) .pill-error { color: color-mix(in srgb, var(--status-blocked) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-status-done { color: color-mix(in srgb, var(--status-done) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-status-progress { color: color-mix(in srgb, var(--status-in-progress) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-status-review { color: color-mix(in srgb, var(--status-review) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-status-blocked { color: color-mix(in srgb, var(--status-blocked) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-role-po { color: color-mix(in srgb, var(--persona-po) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-role-designer { color: color-mix(in srgb, var(--persona-designer) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-role-developer { color: color-mix(in srgb, var(--persona-dev) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .pill-role-qa { color: color-mix(in srgb, var(--persona-qa) 80%, var(--text-primary)); }
/* T-887: dark scheme only — neutral chips on --bg-interaction-neutral measured 3.1-4.4:1
   under their text; the sheet's approved step is --bg-surface-onlayer (text-secondary 7.1:1, tertiary 5.8:1). */
:root[data-theme="dark"] .pill-neutral, :root[data-theme="dark"] .pill-type, :root[data-theme="dark"] .pill-heading-1,
:root[data-theme="dark"] .pill-heading-2, :root[data-theme="dark"] .pill-heading-3, :root[data-theme="dark"] .pill-status-todo { background: var(--bg-surface-onlayer); }
/* T-887 (viewer-polish sheet): dark rider chip + legend fill = the sheet value, a token mix of 75% neutral and 25% onlayer (no literal). */
:root[data-theme="dark"] .lgc-rider { background: color-mix(in srgb, var(--bg-interaction-neutral) 75%, var(--bg-surface-onlayer)); }
:root[data-theme="dark"] .dg-chip-rider { fill: color-mix(in srgb, var(--bg-interaction-neutral) 75%, var(--bg-surface-onlayer)); }
/* docs/design.md 8.4 Banner: severity tint + a full 1px border, no side stripe (T-756). */
.notice { display: flex; gap: 10px; align-items: flex-start; position: relative;
  background: color-mix(in srgb, var(--health-info) 10%, var(--bg-surface-onlayer));
  border: 1px solid color-mix(in srgb, var(--health-info) 35%, var(--border-section));
  border-radius: var(--radius-8); padding: 12px 14px; margin: 0 0 16px; }
.notice[hidden] { display: none; }
.notice-icon { color: var(--health-info); flex: 0 0 auto; margin-top: 1px; display: flex; }
.notice-body { font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; padding-right: 20px; }
.notice-body b { color: var(--text-primary); }
.notice-close { position: absolute; right: 8px; top: 8px; width: 24px; height: 24px; border: none; background: none; padding: 0;
  color: var(--text-tertiary); cursor: pointer; border-radius: var(--radius-4); display: flex; align-items: center; justify-content: center; }
.notice-close:hover { background: var(--bg-state-hover); color: var(--text-primary); }
.detail-row.hash-target td { background: var(--bg-state-hover); }
/* T-882: feature screen (approved mockup docs/artifacts/v1.12/feature-screen.html) */
.kp { display: inline-block; font-size: 11px; font-weight: 600; line-height: 1.5; padding: 2px 9px; border-radius: var(--radius-100); white-space: nowrap; border: 1px solid transparent; }
.kp-feature { background: var(--accent-subtle); color: var(--text-primary); }
.kp-component { border-color: var(--border-hover); color: var(--text-secondary); }
.kp-cross { border-color: var(--border-hover); color: var(--text-secondary); background: var(--bg-surface-on); }
.kp-internal { border: 1px dashed var(--border-hover); color: var(--text-tertiary); }
.store-section[data-store="feature"] table.feature-table { table-layout: fixed; }
.store-section[data-store="feature"] table.feature-table th:nth-child(1) { width: 220px; }
.store-section[data-store="feature"] table.feature-table th:nth-child(2) { width: 96px; }
.store-section[data-store="feature"] table.feature-table th:nth-child(4) { width: 64px; }
.store-section[data-store="feature"] th.num-col, .store-section[data-store="feature"] td.num-col { text-align: right; }
.store-section[data-store="feature"] td.num-col { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }
.store-section[data-store="feature"] .nm { font-weight: 600; display: block; }
.store-section[data-store="feature"] .nm-key { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-tertiary); }
.store-section[data-store="feature"] td.def-col { color: var(--text-secondary); line-height: 1.5; }
.store-section[data-store="feature"] .grp-row td { background: var(--bg-surface-on); padding: var(--space-10) var(--space-10) var(--space-8); }
.store-section[data-store="feature"] tbody tr.grp-row:hover td { background: var(--bg-surface-on); }
.store-section[data-store="feature"] .grp-name { font-weight: 700; font-size: 12.5px; }
.store-section[data-store="feature"] .grp-n { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-quaternary); margin-left: var(--space-8); }
.store-section[data-store="feature"] .grp-def { display: block; font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.store-section[data-store="feature"] .detail-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.store-section[data-store="feature"] .detail-row.is-open td { background: color-mix(in srgb, var(--accent) 9%, transparent); }
.store-section[data-store="feature"] .detail-row.flash td { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.store-section[data-store="feature"] .detail-row td { transition: background 900ms ease; }
@media (prefers-reduced-motion: reduce) { .store-section[data-store="feature"] .detail-row td { transition: none; } }
.store-section[data-store="feature"] .count-line { display: flex; align-items: baseline; gap: var(--space-12); }
.store-section[data-store="feature"] .back { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; color: var(--accent); background: none; border: none; padding: 0; margin: 0 0 var(--space-12); cursor: pointer; }
.store-section[data-store="feature"] .back:hover { text-decoration: underline; }
.store-section[data-store="feature"] .back:focus-visible, .store-section[data-store="feature"] .cn-a:focus-visible, .store-section[data-store="feature"] .area-a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
.store-section[data-store="feature"] .area-a { color: var(--accent); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.store-section[data-store="feature"] .kind-def { margin: calc(-1 * var(--space-4)) 0 var(--space-16); font-size: 12px; color: var(--text-tertiary); }
.store-section[data-store="feature"] .def-lead { font-size: 14.5px; line-height: 1.65; color: var(--text-primary); margin: 0 0 var(--space-16); }
.store-section[data-store="feature"] .detail-doc h2.pill { margin: var(--space-24) 0 var(--space-8); }
.store-section[data-store="feature"] .detail-doc h2.pill:first-child { margin-top: 0; }
.store-section[data-store="feature"] .cn-list { list-style: none; margin: 0; padding: 0; }
.store-section[data-store="feature"] .cn-item { display: grid; grid-template-columns: minmax(180px, auto) 1fr; gap: 2px var(--space-16); align-items: baseline; padding: var(--space-10) 0; border-bottom: 1px solid var(--border-item); }
.store-section[data-store="feature"] .cn-item:last-child { border-bottom: none; }
.store-section[data-store="feature"] .cn-a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; background: none; border: none; padding: 0; font: inherit; font-weight: 600; text-align: left; }
.store-section[data-store="feature"] .cn-head { display: inline-flex; align-items: center; gap: var(--space-8); flex-wrap: wrap; }
.store-section[data-store="feature"] .cn-t { font-size: 13px; color: var(--text-secondary); }
.store-section[data-store="feature"] .cn-g { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-quaternary); margin-top: 2px; }
.store-section[data-store="feature"] .cn-empty { font-size: 12.5px; color: var(--text-tertiary); margin: 0; }
.store-section[data-store="feature"] .ev-text { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin: 0; }
.store-section[data-store="feature"] .ev-text code { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-primary); }
.store-section[data-store="feature"] .read-link { font-size: 12px; font-weight: 600; }
/* T-883: glossary + release-notes screens (approved mockup docs/artifacts/v1.12/define-screen-set.html) */
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) table { table-layout: fixed; }
.store-section[data-store="glossary"] table.t-gl th:nth-child(1) { width: 230px; }
.store-section[data-store="glossary"] table.t-gl th:nth-child(2) { width: 112px; }
.store-section[data-store="release"] table.t-rel th:nth-child(1) { width: 112px; }
.store-section[data-store="release"] table.t-rel th:nth-child(3) { width: 112px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) th.num-col, :is(.store-section[data-store="glossary"], .store-section[data-store="release"]) td.num-col { text-align: right; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) td.num-col { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .nm { font-weight: 600; display: block; }
.store-section[data-store="glossary"] .nm-gloss { display: block; font-size: 11.5px; color: var(--text-quaternary); margin-top: 1px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) td.def-col { color: var(--text-secondary); line-height: 1.5; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) td.t-title { color: var(--text-primary); font-size: 13px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .ver { font-family: var(--font-mono); font-weight: 600; font-size: 12.5px; color: var(--text-primary); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .detail-field-value.ver { font-size: 12.5px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .count-line { display: flex; align-items: baseline; gap: var(--space-12); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .detail-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .detail-row.is-open td { background: color-mix(in srgb, var(--accent) 9%, transparent); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .def-lead { font-size: 14.5px; line-height: 1.65; color: var(--text-primary); margin: 0 0 var(--space-16); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb p { margin: 0 0 var(--space-12); font-size: 13.5px; line-height: 1.7; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb ul { margin: 0 0 var(--space-8); padding-left: 20px; }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb li { margin: 0 0 var(--space-6); font-size: 13.5px; line-height: 1.7; color: var(--text-secondary); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb li b { color: var(--text-primary); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb code { background: var(--bg-surface-on); padding: 0 4px; border-radius: var(--radius-4); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb h3.pill { display: block; width: max-content; max-width: 100%; margin: var(--space-24) 0 var(--space-8); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb h3.pill:first-child, :is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb .v-note + h3.pill { margin-top: var(--space-16); }
:is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .rb .v-note { font-size: 12.5px; line-height: 1.65; color: var(--text-secondary); margin: 0 0 var(--space-4); }
@media (prefers-reduced-motion: reduce) { :is(.store-section[data-store="glossary"], .store-section[data-store="release"]) .detail-row td { transition: none; } }
/* T-886: discipline screens (approved screen set docs/artifacts/v1.12/define-screen-set.html 「규율」) */
a.dl { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
a.dl:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
.store-section[data-store="disc"] table { table-layout: fixed; }
.store-section[data-store="disc"] table.t-disc th:nth-child(1) { width: 220px; }
.store-section[data-store="disc"] table.t-disc th:nth-child(2) { width: 110px; }
.store-section[data-store="disc"] table.t-disc th:nth-child(3) { width: 70px; }
.store-section[data-store="disc"] th.num-col { text-align: right; }
.store-section[data-store="disc"] td.num-col { text-align: right; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }
.store-section[data-store="disc"] .nm { font-weight: 600; display: block; }
.store-section[data-store="disc"] .nm-key { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-quaternary); }
.store-section[data-store="disc"] .detail-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.store-section[data-store="disc"] .detail-row.is-open td { background: color-mix(in srgb, var(--accent) 9%, transparent); }
.store-section[data-store="disc"] .detail-row td { transition: background 900ms ease; }
@media (prefers-reduced-motion: reduce) { .store-section[data-store="disc"] .detail-row td, .store-section[data-store="disc"] .detail-panel { transition: none; } }
.store-section[data-store="disc"] .count-line { display: flex; align-items: baseline; gap: var(--space-12); }
.store-section[data-store="disc"] .back { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; color: var(--accent); background: none; border: none; padding: 0; margin: 0 0 var(--space-12); cursor: pointer; }
.store-section[data-store="disc"] .back:hover { text-decoration: underline; }
.store-section[data-store="disc"] .back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
.store-section[data-store="disc"] .path-line { font-family: var(--font-mono); font-size: 11px; color: var(--text-quaternary); margin: 0 0 var(--space-12); word-break: break-all; }
.store-section[data-store="disc"] table.src { table-layout: fixed; font-size: 12px; }
.store-section[data-store="disc"] table.src td { padding: 1px 0; border-bottom: none; vertical-align: top; }
.store-section[data-store="disc"] table.src tbody tr:hover td { background: transparent; }
.store-section[data-store="disc"] table.src td.ln { width: 46px; text-align: right; padding-right: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--text-quaternary); user-select: none; }
.store-section[data-store="disc"] table.src td.lt { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; padding-right: var(--space-8); }
.store-section[data-store="disc"] table.src tr.is-target td { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.store-section[data-store="disc"] table.src tr.is-target td.ln { color: var(--text-primary); font-weight: 700; }
.store-section[data-store="disc"] table.src tr.is-target td.lt { color: var(--text-primary); }
.store-section[data-store="disc"] .src-wrap { border: 1px solid var(--border-item); border-radius: var(--radius-8); padding: var(--space-8) var(--space-4); background: var(--bg-surface-base); }
.store-section[data-store="disc"] .empty-note { margin: var(--space-48) 0; text-align: center; color: var(--text-tertiary); font-size: 13px; }
.store-section[data-store="disc"] .empty-note span { font-size: 11px; }
.store-section[data-store="disc"] .sidebar .nav-item:not(.nav-item-clickable) { cursor: default; }
${PRD_READING_CSS}
`

/**
 * The interaction layer — activity bar picks a store, a ticket sidebar row
 * picks a group, a row picks a detail. Data-only otherwise: everything the
 * script reads (DETAIL_DATA) was rendered at GENERATION time above; the
 * script issues no fetch and mutates no remote state, so "zero network
 * requests" (tests/viewer-html.window.spec.ts) still holds.
 */
// T-797 개정: localStorage key prefix for the remembered theme — one key per viewer file (location.pathname appended at runtime).
const THEME_STORAGE_PREFIX = 'prdt-viewer-theme:'
// T-803 (T-897 = B): a visible tab checks on this interval whether the viewer
// file was regenerated, and reloads only when it was; a hidden tab never checks.
// The check loads a tiny sibling \`<prefix>.build.js\` (window[BUILD_GLOBAL] =
// "<id>") through a script the hash-trusted interaction script inserts — the
// same strict-dynamic path T-885 opened — so no fetch/connect-src exists. The
// page carries its own id in DETAIL_DATA.build; a different id = a new file.
// location.reload() keeps the URL (query state); main and detail-panel scroll
// are saved to sessionStorage just before it and restored after route().
export const VIEWER_AUTO_REFRESH_MS = 30000
export const BUILD_GLOBAL = '__PRDT_VIEWER_BUILD__'
const SCROLL_STORAGE_PREFIX = 'prdt-viewer-scroll:'
/** The sibling build-id file's content: the only thing it does is set one global. */
export function buildFileContent(id) {
  return `window.${BUILD_GLOBAL} = ${JSON.stringify(String(id))};\n`
}

const INTERACTION_SCRIPT = `
(function () {
  var DETAIL_DATA = JSON.parse(document.getElementById('detail-data').textContent);
  var DETAIL_FIELD_LABELS = ${JSON.stringify(DETAIL_FIELD_LABELS)};
  var HASH_NOTICE = ${JSON.stringify(HASH_NOTICE)};
  var THEME_TOGGLE = ${JSON.stringify(THEME_TOGGLE)};
  var THEME_KEY = ${JSON.stringify(THEME_STORAGE_PREFIX)} + location.pathname;
  var URL_KEYS = ['view', 'group', 'kind', 'id', 'line'];
  var FEATURE_BACK = ${JSON.stringify(FEATURE.back)};
  var STORE_LABEL = ${JSON.stringify(STORE_LABEL)};
  var DISC = ${JSON.stringify(DISCIPLINE)};
  var INFO_ICON = ${JSON.stringify(INFO_ICON_SVG)};

  // T-885 (T-876 = D): past-version ticket bodies live in sibling data files.
  // A src comes ONLY from the generator-written map; a bucket the map does not
  // name, or a file that fails to load, keeps the file-link note.
  var PAST = DETAIL_DATA.pastTickets || {};
  // Null-prototype: a bucket named constructor/hasOwnProperty must not read an inherited member.
  var PAST_LOADS = Object.create(null);
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function pastTicketRef(fields) {
    var parts = String(fields.path || '').split('/');
    if (parts[0] !== 'docs' || parts[1] !== 'tickets' || !own(PAST, parts[2])) return null;
    return { key: parts[2], src: PAST[parts[2]] };
  }
  function pastSettled(ref) { return PAST_LOADS[ref.key] === 'done' || PAST_LOADS[ref.key] === 'failed'; }
  // The page's embedded font subset covers the page; a data file brings the
  // glyphs only its own bodies use, limited to exactly those code points.
  function applyPastFont(f) {
    if (!f || !f.range || typeof FontFace === 'undefined' || !document.fonts) return;
    [['400', f.regular], ['600 700', f.semibold]].forEach(function (w) {
      if (!w[1]) return;
      try {
        var face = new FontFace('Pretendard', 'url(data:font/woff2;base64,' + w[1] + ')', { weight: w[0], style: 'normal', display: 'swap', unicodeRange: f.range });
        document.fonts.add(face);
        face.load().then(null, function () {});
      } catch (e) { /* the system fallback font still paints the text */ }
    });
  }
  function applyPastTickets(key) {
    var store = window[${JSON.stringify(PAST_TICKET_GLOBAL)}];
    var payload = own(store, key) ? store[key] : null;
    var rows = payload && payload.tickets;
    if (!rows) return;
    applyPastFont(payload.font);
    Object.keys(rows).forEach(function (id) {
      var r = rows[id];
      var e = own(DETAIL_DATA.ticket, id) ? DETAIL_DATA.ticket[id] : null;
      if (e && r && typeof r.body === 'string' && r.path === e.path) e.body = r.body;
    });
  }
  function loadPastTickets(ref, done) {
    if (pastSettled(ref)) { done(); return; }
    if (PAST_LOADS[ref.key]) { PAST_LOADS[ref.key].push(done); return; }
    PAST_LOADS[ref.key] = [done];
    var s = document.createElement('script');
    function finish(ok) {
      var waiting = PAST_LOADS[ref.key];
      if (ok) applyPastTickets(ref.key);
      PAST_LOADS[ref.key] = ok ? 'done' : 'failed';
      waiting.forEach(function (f) { f(); });
    }
    s.onload = function () { finish(true); };
    s.onerror = function () { finish(false); };
    s.src = ref.src;
    document.head.appendChild(s);
  }

${PRD_READING_SCRIPT}
  function closeDetailPanel(section) {
    if (!section) return;
    var panel = section.querySelector('.detail-panel');
    if (panel) { panel.classList.remove('active'); panel.removeAttribute('data-open-kind'); panel.removeAttribute('data-open-id'); panel.removeAttribute('data-open-line'); }
    section.querySelectorAll('.detail-row.is-open, [data-detail-kind].is-open').forEach(function (r) { r.classList.remove('is-open'); });
    if (section.getAttribute('data-store') === 'disc') discOrigin = null;
  }

  // T-886: the discipline document panel — numbered source lines, the linked line
  // highlighted, 「돌아가기」 to where the link was clicked, one-line notices.
  var discOrigin = null;
  function escHtml(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fillN(t, n) { return t.replace('{N}', String(n)); }
  function discField(label, value) {
    return '<div class="detail-field"><span class="detail-field-label">' + escHtml(label) + '</span><span class="detail-field-value">' + escHtml(value) + '</span></div>';
  }
  function discNotice(text) {
    return '<div class="notice"><span class="notice-icon">' + INFO_ICON + '</span><div class="notice-body">' + escHtml(text) + '</div></div>';
  }
  function discHtml(rel, d, line) {
    var over = !!line && line > d.lines.length;
    var target = line && !over ? line : null;
    var back = discOrigin ? '<button type="button" class="back" data-disc-back>' + escHtml(FEATURE_BACK + discOrigin.label) + '</button>' : '';
    var meta = '<div class="detail-meta">' + discField(DISC.fields.kind, d.kind) + discField(DISC.fields.copy, DISC.copyValue) +
      discField(DISC.fields.lines, fillN(DISC.linesValue, d.lines.length)) + '</div>';
    var pathLine = '<p class="path-line">' + escHtml(DISC.copyPathPrefix + rel) + '</p>';
    var notes = (d.differs > 0 ? discNotice(fillN(DISC.differs, d.differs)) : '') + (over ? discNotice(fillN(DISC.overLine, d.lines.length)) : '');
    var rows = d.lines.map(function (t, i) {
      return '<tr data-ln="' + (i + 1) + '"' + (target === i + 1 ? ' class="is-target"' : '') + '><td class="ln">' + (i + 1) + '</td><td class="lt">' + escHtml(t) + '</td></tr>';
    }).join('');
    return back + meta + pathLine + notes + '<div class="src-wrap"><table class="src"><tbody>' + rows + '</tbody></table></div>';
  }
  function discOriginLabel(a, from) {
    var panel = a.closest('.detail-panel');
    if (panel && panel.getAttribute('data-open-id')) return panel.getAttribute('data-open-id').replace(/[.]md$/, '');
    var active = from.querySelector('.nav-item-clickable.active span');
    var store = STORE_LABEL[from.getAttribute('data-store')] || '';
    return active && active.textContent ? store + ' · ' + active.textContent : store;
  }
  function discGo(a) {
    var rel = a.getAttribute('data-doc');
    var d = own(DETAIL_DATA.disc, rel) ? DETAIL_DATA.disc[rel] : null;
    var target = document.querySelector('.store-section[data-store="disc"]');
    var from = a.closest('.store-section');
    if (!d || !target || !from) return;
    var line = parseInt(a.getAttribute('data-line') || '', 10);
    if (!(line > 0)) line = null;
    var fromPanel = a.closest('.detail-panel');
    var fromPane = from.querySelector('.view-pane.active');
    var fromBody = from.querySelector('.frame-body');
    var origin = {
      store: from.getAttribute('data-store'),
      group: fromPane ? fromPane.getAttribute('data-group') : null,
      kind: fromPanel ? fromPanel.getAttribute('data-open-kind') : null,
      id: fromPanel ? fromPanel.getAttribute('data-open-id') : null,
      label: discOriginLabel(a, from),
      main: fromBody ? fromBody.scrollTop : 0,
      detail: fromPanel ? fromPanel.querySelector('.detail-panel-body').scrollTop : 0
    };
    selectStore('disc');
    var pane = target.querySelector('.view-pane.active');
    var group = pane ? pane.getAttribute('data-group') : 'all';
    if (group !== 'all' && group !== d.group) selectGroup(target, d.group);
    clearHashMarks();
    discOrigin = origin;
    openDetailPanel(target, 'disc', rel, false, line);
    var row = findByAttr('.view-pane.active [data-detail-kind="disc"]', 'data-detail-id', rel, target);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
  }
  function discBack() {
    var o = discOrigin;
    if (!o) return;
    closeDetailPanel(document.querySelector('.store-section[data-store="disc"]'));
    var sec = selectStore(o.store);
    if (!sec) return;
    var cur = sec.querySelector('.view-pane.active');
    if (o.group && findByAttr('.view-pane', 'data-group', o.group, sec) && (!cur || cur.getAttribute('data-group') !== o.group)) selectGroup(sec, o.group);
    if (o.kind && o.id) openDetailPanel(sec, o.kind, o.id, true);
    var body = sec.querySelector('.frame-body');
    if (body) body.scrollTop = o.main;
    var pb = sec.querySelector('.detail-panel.active .detail-panel-body');
    if (pb && o.kind) pb.scrollTop = o.detail;
  }

  // T-882: feature screen moves — follow a 「함께 쓰는 기능」 link, go back, pick the area.
  var featureTrail = [];
  var flashTimer = null;
  function flashRow(section, key) {
    section.querySelectorAll('.view-pane.active [data-detail-kind="feature"]').forEach(function (r) {
      if (r.getAttribute('data-detail-id') !== key) return;
      if (r.scrollIntoView) r.scrollIntoView({ block: 'center' });
      r.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { r.classList.remove('flash'); }, 1400);
    });
  }
  function showFeature(section, key) {
    var fields = DETAIL_DATA.feature && DETAIL_DATA.feature[key];
    if (!fields) return;
    var pane = section.querySelector('.view-pane.active');
    var group = pane ? pane.getAttribute('data-group') : 'all';
    var row = findByAttr('.view-pane.active [data-detail-kind="feature"]', 'data-detail-id', key, section);
    if (group !== 'all' && !row) {
      var trail = featureTrail;
      var target = findByAttr('.view-pane [data-detail-kind="feature"]', 'data-detail-id', key, section);
      var area = target ? target.getAttribute('data-area') : null;
      if (area) selectGroup(section, area);
      featureTrail = trail;
    }
    openDetailPanel(section, 'feature', key, true);
    flashRow(section, key);
  }
  function featureClick(ev) {
    var go = ev.target.closest('[data-feature-go]');
    var section = ev.target.closest('.store-section');
    if (go && section) { ev.preventDefault(); featureTrail.push(go.getAttribute('data-feature-go')); showFeature(section, featureTrail[featureTrail.length - 1]); return true; }
    if (ev.target.closest('[data-feature-back]') && section && featureTrail.length > 1) { ev.preventDefault(); featureTrail.pop(); showFeature(section, featureTrail[featureTrail.length - 1]); return true; }
    var areaBtn = ev.target.closest('[data-feature-area]');
    if (areaBtn && section) {
      ev.preventDefault();
      var open = featureTrail.slice();
      selectGroup(section, areaBtn.getAttribute('data-feature-area'));
      featureTrail = open;
      if (open.length) openDetailPanel(section, 'feature', open[open.length - 1], true);
      return true;
    }
    return false;
  }

  function openDetailPanel(section, kind, id, keepTrail, line) {
    if (!section) return;
    var bucket = DETAIL_DATA[kind];
    var fields = bucket && bucket[id];
    if (!fields) return;
    var panel = section.querySelector('.detail-panel');
    if (!panel) return;
    panel.querySelector('.detail-panel-title').textContent = fields.title || id;
    var metaRows = [];
    Object.keys(DETAIL_FIELD_LABELS).forEach(function (k) {
      var v = fields[k];
      if (v === undefined || v === null || v === '') return;
      var text = String(v).replace(/</g, '&lt;');
      // T-796: an assignee reads as a role pill (lowercase; user is a solid ink chip), like the ticket table.
      var shown = text;
      if (k === 'assignee') {
        shown = text === 'user' ? '<span class="pill pill-user-ink">user</span>'
          : ['po', 'designer', 'developer', 'qa'].indexOf(text) >= 0 ? '<span class="pill pill-role-' + text + '">' + text + '</span>'
          : '<span class="pill pill-neutral">' + text + '</span>';
      }
      metaRows.push('<div class="detail-field"><span class="detail-field-label">' + DETAIL_FIELD_LABELS[k] +
        '</span><span class="detail-field-value">' + shown + '</span></div>');
    });
    var metaHtml = metaRows.length ? '<div class="detail-meta">' + metaRows.join('') + '</div>' : '';
    // T-666 slice 1b acceptance line 2: an artifact with no inlinable body
    // (.html/.json) says so and links the file, instead of an empty panel.
    var docHtml;
    var past = kind === 'ticket' && !fields.body ? pastTicketRef(fields) : null;
    if (past && !pastSettled(past)) {
      docHtml = '';
      loadPastTickets(past, function () {
        var p = section.querySelector('.detail-panel');
        if (p && p.classList.contains('active') && p.getAttribute('data-open-kind') === kind && p.getAttribute('data-open-id') === id) openDetailPanel(section, kind, id);
      });
    } else if (fields.body) {
      docHtml = '<div class="detail-doc body-prose">' + fields.body + '</div>';
    } else if (fields.fileHref) {
      docHtml = '<div class="detail-doc detail-nobody"><p>' + ${JSON.stringify(FILE_HREF_NOTE)} + '</p><p><a href="' +
        fields.fileHref + '" target="_blank" rel="noopener">' + (fields.path || fields.fileHref).replace(/</g, '&lt;') + '</a></p></div>';
    } else {
      docHtml = '';
    }
    var bodyHtml = fields.html !== undefined ? fields.html : metaHtml + docHtml;
    // T-882: a feature reached through a 「함께 쓰는 기능」 link keeps the
    // trail and offers 「돌아가기 · <previous feature>」; any other open starts it over.
    if (kind === 'feature') {
      if (!keepTrail) featureTrail = [id];
      var prev = featureTrail.length > 1 ? bucket[featureTrail[featureTrail.length - 2]] : null;
      if (prev) bodyHtml = '<button type="button" class="back" data-feature-back>' + FEATURE_BACK + String(prev.name).replace(/</g, '&lt;') + '</button>' + bodyHtml;
    }
    if (kind === 'disc') bodyHtml = discHtml(id, fields, line);
    panel.querySelector('.detail-panel-body').innerHTML = bodyHtml;
    panel.querySelector('.detail-panel-body').scrollTop = 0;
    section.querySelectorAll('.detail-row.is-open, [data-detail-kind].is-open').forEach(function (r) { r.classList.remove('is-open'); });
    section.querySelectorAll('.view-pane.active [data-detail-kind]').forEach(function (r) {
      if (r.getAttribute('data-detail-kind') === kind && r.getAttribute('data-detail-id') === id) r.classList.add('is-open');
    });
    panel.setAttribute('data-open-kind', kind);
    panel.setAttribute('data-open-id', id);
    if (kind === 'disc' && line) panel.setAttribute('data-open-line', String(line)); else panel.removeAttribute('data-open-line');
    panel.classList.add('active');
    if (kind === 'disc' && line) {
      var hit = panel.querySelector('tr.is-target');
      var pbody = panel.querySelector('.detail-panel-body');
      if (hit && pbody) pbody.scrollTop = Math.max(0, hit.getBoundingClientRect().top - pbody.getBoundingClientRect().top - 140);
    }
    if (typeof applyScroll === 'function') applyScroll(false);
  }

  function selectStore(key) {
    document.querySelectorAll('.activity-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-store') === key); });
    document.querySelectorAll('.store-section').forEach(function (s) { s.classList.toggle('active', s.dataset.store === key); });
    return document.querySelector('.store-section[data-store="' + key + '"]');
  }

  function selectGroup(section, group) {
    var groupBtn = null;
    section.querySelectorAll('[data-group-select]').forEach(function (b) {
      if (b.getAttribute('data-group-select') === group) groupBtn = b;
    });
    section.querySelectorAll('.nav-item-clickable').forEach(function (b) { b.classList.toggle('active', b === groupBtn); });
    section.querySelectorAll('.view-pane').forEach(function (v) { v.classList.toggle('active', v.dataset.group === group); });
    var label = section.querySelector('.js-group-label');
    if (label && groupBtn) {
      // T-708 결함 5: breadcrumb showed the raw data-group-select key
      // (an internal id — 'progress', 'backlog', a version/bucket key),
      // never a translated label of its own. Reads the SAME text the
      // pressed button is already showing (its first <span>, the label —
      // see groupedStore()/ticketStoreInner() below, where that span is
      // always the button's label, never the count) instead of the key.
      var btnLabelSpan = groupBtn.querySelector('span');
      label.textContent = btnLabelSpan ? btnLabelSpan.textContent : group;
    }
    closeDetailPanel(section);
  }

  // T-746: viewer.html#<id> selects that item on load (and whenever the hash
  // changes). An id the page cannot show lands on home with the notice,
  // never a blank page.
  function clearHashMarks() {
    document.querySelectorAll('.detail-row.hash-target').forEach(function (r) { r.classList.remove('hash-target'); });
  }

  function showHashNotice(raw) {
    var notice = document.getElementById('hash-notice');
    if (!notice) return;
    var m = /^T-([0-9]+)$/.exec(raw);
    var stale = (m !== null && Number(m[1]) <= DETAIL_DATA.maxTicket) || raw.indexOf('docs/') === 0;
    notice.querySelector('.js-notice-id').textContent = '#' + raw;
    notice.querySelector('.js-notice-text').textContent = stale ? HASH_NOTICE.stale : HASH_NOTICE.unknown;
    notice.hidden = false;
  }

  function routeHash() {
    var rawHash = location.hash.replace(/^#/, '');
    if (!rawHash) return;
    var raw;
    try { raw = decodeURIComponent(rawHash); } catch (e) { raw = rawHash; }
    clearHashMarks();
    var notice = document.getElementById('hash-notice');
    if (notice) notice.hidden = true;
    var a = Object.prototype.hasOwnProperty.call(DETAIL_DATA.anchors, raw) ? DETAIL_DATA.anchors[raw] : null;
    var section = a ? document.querySelector('.store-section[data-store="' + a.s + '"]') : null;
    if (!section) {
      var home = selectStore('home');
      if (home) selectGroup(home, 'progress');
      showHashNotice(raw);
      return;
    }
    selectStore(a.s);
    selectGroup(section, a.g);
    if (a.k) focusItem(section, a.k, a.i);
  }

  function focusItem(section, kind, id, line) {
    section.querySelectorAll('.view-pane.active [data-detail-kind]').forEach(function (r) {
      if (r.getAttribute('data-detail-kind') === kind && r.getAttribute('data-detail-id') === id) {
        r.classList.add('hash-target');
        if (r.scrollIntoView) r.scrollIntoView({ block: 'center' });
      }
    });
    openDetailPanel(section, kind, id, false, line);
  }

  // T-797 개정: the URL carries the screen as ?view=<store>&group=<sidebar
  // group>&kind=<detail kind>&id=<item id> (design: T-797 ## outcome). Every
  // value is compared, never spliced into a selector.
  function findByAttr(selector, attr, value, root) {
    var hit = null;
    (root || document).querySelectorAll(selector).forEach(function (el) { if (!hit && el.getAttribute(attr) === value) hit = el; });
    return hit;
  }

  function readState() {
    var section = document.querySelector('.store-section.active');
    if (!section) return null;
    var st = { view: section.getAttribute('data-store') };
    var pane = section.querySelector('.view-pane.active');
    if (pane && pane.getAttribute('data-group')) st.group = pane.getAttribute('data-group');
    var panel = section.querySelector('.detail-panel.active');
    if (panel && panel.getAttribute('data-open-kind')) { st.kind = panel.getAttribute('data-open-kind'); st.id = panel.getAttribute('data-open-id'); if (panel.getAttribute('data-open-line')) st.line = panel.getAttribute('data-open-line'); }
    return st;
  }

  // T-809: the tab title names the project and, with a detail panel open, the
  // item id exactly as the URL state carries it. The static head title is the
  // no-item form; its text is the base every later title is built from.
  var BASE_TITLE = document.title;
  var ogTitle = document.querySelector('meta[property="og:title"]');
  function syncTitle() {
    var st = readState();
    var t = st && st.id ? BASE_TITLE + ' - ' + st.id : BASE_TITLE;
    document.title = t;
    if (ogTitle) ogTitle.setAttribute('content', t);
  }

  function syncUrl(replace) {
    syncTitle();
    var st = readState();
    if (!st) return;
    var p = new URLSearchParams();
    URL_KEYS.forEach(function (k) { if (st[k]) p.set(k, st[k]); });
    var target = location.pathname + '?' + p.toString();
    if (!location.hash && location.pathname + location.search === target) return;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', target); } catch (e) { /* file:// history quirks: the screen still works */ }
  }

  function routeParams() {
    var p = new URLSearchParams(location.search);
    var view = p.get('view');
    if (!view) return false;
    var section = findByAttr('.store-section', 'data-store', view);
    if (!section) return false;
    clearHashMarks();
    selectStore(view);
    var group = p.get('group');
    if (group && findByAttr('.view-pane', 'data-group', group, section)) selectGroup(section, group);
    var kind = p.get('kind');
    var id = p.get('id');
    if (kind && id) {
      var bucket = Object.prototype.hasOwnProperty.call(DETAIL_DATA, kind) ? DETAIL_DATA[kind] : null;
      var rawLine = p.get('line');
      var line = rawLine && /^[0-9]{1,7}$/.test(rawLine) ? parseInt(rawLine, 10) : null;
      if (bucket && Object.prototype.hasOwnProperty.call(bucket, id)) focusItem(section, kind, id, line);
      else showHashNotice(id);
    }
    return true;
  }

  function route() {
    if (location.hash) routeHash(); else routeParams();
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function paintToggle() {
    var label = currentTheme() === 'dark' ? THEME_TOGGLE.toLight : THEME_TOGGLE.toDark;
    document.querySelectorAll('.js-theme-toggle').forEach(function (b) { b.setAttribute('aria-label', label); b.setAttribute('title', label); });
  }

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage blocked: the toggle still applies for this visit */ }
    paintToggle();
  }

  function onClick(ev) {
    var themeBtn = ev.target.closest('.js-theme-toggle');
    if (themeBtn) { ev.preventDefault(); toggleTheme(); return; }

    var stalePanel = document.querySelector('.detail-panel.active');
    if (stalePanel && !stalePanel.contains(ev.target)) {
      closeDetailPanel(stalePanel.closest('.store-section'));
    }

    // T-886: a discipline-document link opens the 「규율」 panel; its 「돌아가기」 returns.
    var discLink = ev.target.closest('a.dl[data-doc]');
    if (discLink) { ev.preventDefault(); discGo(discLink); clearHashMarks(); return; }
    if (ev.target.closest('[data-disc-back]')) { ev.preventDefault(); discBack(); return; }

    // T-666 slice 1a defect fix: '.store-section' ALSO carries 'data-store'
    // (it's what this branch toggles), so a bare '[data-store]' closest()
    // matched the enclosing section on ANY click inside it — a ticket row, a
    // sidebar group button — and returned before the group-select / detail-row
    // branches below ever ran. Scoped to the activity-bar buttons themselves.
    var storeBtn = ev.target.closest('.activity-btn[data-store]');
    if (storeBtn) {
      ev.preventDefault();
      selectStore(storeBtn.getAttribute('data-store'));
      clearHashMarks();
      return;
    }

    var groupBtn = ev.target.closest('[data-group-select]');
    if (groupBtn) {
      ev.preventDefault();
      var section = groupBtn.closest('.store-section');
      if (!section) return;
      selectGroup(section, groupBtn.getAttribute('data-group-select'));
      clearHashMarks();
      return;
    }

    // T-883: a 「읽기」 field value opens the store it names (용어 사전 · 릴리즈 노트).
    var readBtn = ev.target.closest('[data-open-store]');
    if (readBtn) {
      ev.preventDefault();
      selectStore(readBtn.getAttribute('data-open-store'));
      clearHashMarks();
      return;
    }

    if (featureClick(ev)) return;
    if (prdClick(ev)) return;

    var noticeClose = ev.target.closest('.notice-close');
    if (noticeClose) {
      ev.preventDefault();
      var notice = noticeClose.closest('.notice');
      if (notice) notice.hidden = true;
      return;
    }

    var detailRow = ev.target.closest('[data-detail-kind]');
    if (detailRow) {
      ev.preventDefault();
      if (detailRow.getAttribute('data-detail-kind') === 'disc') discOrigin = null;
      openDetailPanel(detailRow.closest('.store-section'), detailRow.getAttribute('data-detail-kind'), detailRow.getAttribute('data-detail-id'));
      return;
    }

    var closeBtn = ev.target.closest('.detail-panel-close');
    if (closeBtn) { ev.preventDefault(); closeDetailPanel(closeBtn.closest('.store-section')); }
  }

  document.addEventListener('click', function (ev) { onClick(ev); syncUrl(false); });

  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('tr.detail-row[data-detail-kind], [role="button"][data-detail-kind]')) {
      ev.preventDefault();
      if (ev.target.getAttribute('data-detail-kind') === 'disc') discOrigin = null;
      openDetailPanel(ev.target.closest('.store-section'), ev.target.getAttribute('data-detail-kind'), ev.target.getAttribute('data-detail-id'));
      syncUrl(false);
      return;
    }
    if (ev.key === 'Escape') {
      var openPanel = document.querySelector('.detail-panel.active');
      if (openPanel) { closeDetailPanel(openPanel.closest('.store-section')); syncUrl(false); }
    }
  });

  // A '#<key>' link keeps working: it routes, then the URL is rewritten to
  // the same screen's query form so a refresh reopens it.
  window.addEventListener('hashchange', function () { routeHash(); syncUrl(true); });
  window.addEventListener('popstate', function () { if (!location.hash) routeParams(); syncTitle(); });
  paintToggle();
  route();
  syncUrl(true);
  prdInit();

  // T-803 (T-897 = B): reload only when the viewer file changed, back at the
  // same main-pane and detail-panel scroll position.
  var BUILD = DETAIL_DATA.build || null;
  var SCROLL_KEY = ${JSON.stringify(SCROLL_STORAGE_PREFIX)} + location.pathname;
  function mainScroller() { return document.querySelector('.store-section.active .frame-body'); }
  function detailScroller() { return document.querySelector('.store-section.active .detail-panel.active .detail-panel-body'); }
  // The detail scroll belongs to the item that was open ('<kind>:<id>'); it is
  // restored onto that same item only.
  function openDetailKey() {
    var p = document.querySelector('.store-section.active .detail-panel.active');
    return p ? p.getAttribute('data-open-kind') + ':' + p.getAttribute('data-open-id') : null;
  }
  function saveScroll() {
    var m = mainScroller(), d = detailScroller();
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ main: m ? m.scrollTop : 0, detail: d ? d.scrollTop : 0, detailKey: d ? openDetailKey() : null, folds: prdFoldState() })); } catch (e) { /* storage blocked: the reload still keeps the URL state */ }
  }
  var RESTORE = null;
  try {
    var raw = sessionStorage.getItem(SCROLL_KEY);
    sessionStorage.removeItem(SCROLL_KEY);
    if (raw) RESTORE = JSON.parse(raw);
  } catch (e) { RESTORE = null; }
  // The PRD folds come back as they were, so the saved scroll lands on the same text.
  if (RESTORE && RESTORE.folds) prdRestoreFolds(RESTORE.folds);
  // Main scroll is applied for the first paint and again at window load (fonts
  // and layout settle); the detail scroll once its panel body is in.
  function applyScroll(final) {
    if (!RESTORE) return;
    var m = mainScroller();
    if (m && !RESTORE.mainDone) m.scrollTop = RESTORE.main || 0;
    if (final) RESTORE.mainDone = true;
    var d = detailScroller();
    if (d && !RESTORE.detailDone) {
      if (!RESTORE.detailKey || RESTORE.detailKey !== openDetailKey()) RESTORE.detailDone = true; // another item: starts at 0
      else if (!PAST_PENDING()) { d.scrollTop = RESTORE.detail || 0; RESTORE.detailDone = true; }
    }
    if (RESTORE.mainDone && (RESTORE.detailDone || !document.querySelector('.detail-panel.active'))) RESTORE = null;
  }
  // A past-version ticket body arrives from its data file after the panel
  // opens; the detail scroll waits until that body is in.
  function PAST_PENDING() {
    var panel = document.querySelector('.store-section.active .detail-panel.active');
    if (!panel || panel.getAttribute('data-open-kind') !== 'ticket') return false;
    var fields = own(DETAIL_DATA.ticket, panel.getAttribute('data-open-id')) ? DETAIL_DATA.ticket[panel.getAttribute('data-open-id')] : null;
    var ref = fields && !fields.body ? pastTicketRef(fields) : null;
    return !!ref && !pastSettled(ref);
  }
  applyScroll(false);
  window.addEventListener('load', function () { applyScroll(true); });

  if (BUILD && BUILD.id && BUILD.src) {
    var probe = null;
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
      try { delete window[${JSON.stringify(BUILD_GLOBAL)}]; } catch (e) { window[${JSON.stringify(BUILD_GLOBAL)}] = undefined; }
      probe = document.createElement('script');
      probe.onload = function () {
        var id = window[${JSON.stringify(BUILD_GLOBAL)}];
        if (typeof id === 'string' && id !== BUILD.id && document.visibilityState === 'visible') { saveScroll(); location.reload(); }
      };
      probe.src = BUILD.src + '?' + Date.now();
      document.head.appendChild(probe);
    }, ${VIEWER_AUTO_REFRESH_MS});
  }
})();
`

// T-711 F6: a strict Content-Security-Policy meta tag. `default-src 'none'`
// closes every directive this policy does not name (connect-src included —
// there is no fetch/XHR anywhere on this page, so none should ever be
// allowed to start). The one inline `<script>` (INTERACTION_SCRIPT) is
// allowed ONLY by its exact content hash — never `'unsafe-inline'` — so an
// attacker-controlled script reaching the page some other way still could
// not execute; the hash is computed from the SAME literal string embedded
// below (`<script>${INTERACTION_SCRIPT}</script>`), so it can never drift
// from what is actually shipped. `style-src 'unsafe-inline'` covers both the
// one `<style>` block and this generator's own few inline `style="…"`
// attributes — both are generator-authored CSS (tokens + this template),
// never document prose, so this carries no injection surface a hash would
// close that `'unsafe-inline'` does not already. `img-src 'self' data:`
// covers a rewritten repo-relative image (acceptance line 1); no remote
// scheme is listed, so a remote image URL could not load even if some future
// bug let one reach `src=`. `<script id="detail-data"
// type="application/json">` is inert data (never a JavaScript MIME type), so
// CSP's script-src does not gate it at all — same pattern as, e.g., a
// Next.js `__NEXT_DATA__` block.
// T-797 개정: runs in <head>, before the body paints, so a remembered dark
// choice never flashes light first. Light unless the stored value is 'dark'.
const THEME_HEAD_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_PREFIX)}+location.pathname)}catch(e){}document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')})();`
const THEME_HEAD_SCRIPT_SHA256_BASE64 = crypto.createHash('sha256').update(THEME_HEAD_SCRIPT, 'utf8').digest('base64')
const INTERACTION_SCRIPT_SHA256_BASE64 = crypto.createHash('sha256').update(INTERACTION_SCRIPT, 'utf8').digest('base64')
const CSP_CONTENT = [
  "default-src 'none'",
  // T-885 (T-876 = D): 'strict-dynamic' lets the hash-trusted interaction
  // script add a past-version data file's <script src>; a parser-inserted or
  // innerHTML-inserted script (a document body) still never runs.
  `script-src 'sha256-${THEME_HEAD_SCRIPT_SHA256_BASE64}' 'sha256-${INTERACTION_SCRIPT_SHA256_BASE64}' 'strict-dynamic'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Embeds `obj` as a same-document JSON blob. Escapes EVERY `<` as `<`
 * — not only a literal "</script" (T-711 F3): a frontmatter value containing
 * the bytes `<!--<script` used to survive a bare "</script" replace intact,
 * pushing the HTML parser into its "script data double escaped" state (the
 * spec's own nested-`<script>`-inside-a-comment rule), where the parser stops
 * treating the NEXT real `</script>` — this element's own closing tag — as a
 * closing tag at all: the whole rest of the document (the interaction
 * `<script>` included) got swallowed as inert text, silently killing every
 * click handler on the page. No literal `<` left in the blob removes the
 * whole class of parser-state tricks, not only the one shape already caught.
 */
export function detailDataScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c')
  return `<script id="detail-data" type="application/json">${json}</script>`
}

/**
 * @param {object} args
 * @param {ReturnType<typeof import('./collect.mjs').collectAll>} args.data
 * @param {Map<string,string>} args.dark resolved dark token map
 * @param {Map<string,string>} args.light resolved light token map
 * @param {string} args.fontFaceCss
 * @param {string} args.tokensSha256
 * @param {string} [args.artifactsBaseHref] path from the generated page's own directory to `docs/artifacts/` — defaults to this repo's real, current OUTPUT_PATH layout (`code/packages/viewer/viewer.html` → repo root) so a fixture/test that omits it still gets a working link.
 * @param {string} [args.repoRootHref] path from the generated page's own directory back to the repo root — T-666 slice 2b: every relative link inside a rendered document body is rewritten onto this (see `resolveDocLink`), rather than being left to resolve against the page's own folder. Defaults to this repo's real, current OUTPUT_PATH layout, same as `artifactsBaseHref`'s default (`artifactsBaseHref` = `${repoRootHref}/docs/artifacts`, computed once in generate.mjs from the same OUTPUT_PATH — not a second relative-path calculation).
 */
/** T-809: `[prdt] {project}` — the no-item tab / share title. */
export function pageTitleText(project) {
  return `${PAGE.titlePrefix} ${project || PAGE.titleFallback}`
}

export function renderPage({
  data,
  dark,
  light,
  fontFaceCss,
  tokensSha256,
  artifactsBaseHref = '../../../docs/artifacts',
  repoRootHref = DEFAULT_REPO_ROOT_HREF,
  viewerAbsPath = DEFAULT_VIEWER_ABS_PATH,
  pastTicketSrc = {},
  build = null,
}) {
  pageViewerAbsPath = viewerAbsPath
  const pageTitle = escapeHtml(pageTitleText(data.project))
  const discipline = data.discipline || []
  pageDisciplineIndex = buildDisciplineIndex(discipline)
  const anchors = buildAnchors(data)
  const detailData = {
    ticket: ticketDetailEntries(data.tickets, repoRootHref),
    wiki: wikiDetailEntries(data.wiki, repoRootHref),
    feature: featureDetailEntries(data, anchors, repoRootHref),
    glossary: glossaryDetailEntries(data.wiki, repoRootHref),
    release: releaseDetailEntries(data.releases || [], repoRootHref),
    disc: discDetailEntries(discipline),
    artifact: artifactDetailEntries(data.artifacts, artifactsBaseHref, repoRootHref),
    // No "prd" bucket (T-709 결정 2): a closed PRD round is no longer a
    // detail-row — its body renders directly in its own sidebar group's pane
    // (prdStoreInner) — so DETAIL_DATA never needs one.
    anchors,
    maxTicket: maxTicketNumber(data),
    // T-885: bucket → sibling data-file src, written by the generator only.
    pastTickets: pastTicketSrc,
    // T-803 (T-897 = B): { id, src } — this file's build id and its sibling
    // build-id file, generator-written; null = no auto-refresh check.
    build,
  }

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">
<title>${pageTitle}</title>
<meta property="og:title" content="${pageTitle}">
<script>${THEME_HEAD_SCRIPT}</script>
<style>
${fontFaceCss}
${TEMPLATE_CSS}
${emitRootThemeCss(dark, light)}
</style>
</head>
<body>
<!-- sha256:${escapeHtml(tokensSha256)} -->
<div class="app-shell">
${activityBar('home')}
${homeSection(data, repoRootHref)}
${prdSection(data.prd, data.currentVersion, repoRootHref, data.tickets)}
${ticketSection(data.tickets, data.currentVersion)}
${wikiSection(data.wiki)}
${featuresSection(data)}
${artifactsSection(data.artifacts, data.currentVersion)}
${glossarySection(data.wiki)}
${releaseSection(data.releases || [])}
${discSection(discipline)}
</div>
${detailDataScript(detailData)}
<script>${INTERACTION_SCRIPT}</script>
</body>
</html>
`
}
