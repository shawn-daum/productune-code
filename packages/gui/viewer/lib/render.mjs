// viewer/lib/render.mjs — builds the one-page viewer HTML.
//
// Wears the product's tokens per dispatch: imports the SAME parser the DS
// generator uses (ds/lib/parse-tokens.mjs) rather than a second one, and the
// same font-subsetting module (ds/lib/font-subset.mjs) — T-659 Outcome
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
import { marked, Renderer } from 'marked'
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
  ARTIFACT,
  PRD,
  FILE_HREF_NOTE,
  HASH_NOTICE,
  THEME_TOGGLE,
  noGroupLabel,
} from './labels.mjs'

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
hardenedRenderer.html = (token) => escapeHtml(typeof token === 'string' ? token : (token.text ?? token.raw ?? ''))

// T-666 slice 1a acceptance line 3: "section headings render as chips by one
// shared rule across every document kind." One override, on the one
// `hardenedRenderer` every document kind already flows through via `md()`
// below — h1/h2/h3 get the design system's `.pill .pill-heading-N` classes
// (docs/artifacts/v1.10/define-screen-set.html ~line 343-348, user-approved
// 2026-09-21); h4+ (real ticket bodies use `####` for their `###`-nested
// amendments, per contracts §Tickets, one level deeper than this generator's
// own h1-wrapped titles) collapses to the same weight as h3 rather than
// falling off the shared rule's end. marked 16.4.2's token-object renderer
// API (`{tokens, depth}`, not the older `(text, level)` pair) — verified
// against this repo's installed marked (16.4.2) before writing this.
hardenedRenderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens)
  const level = Math.min(depth, 3)
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
// `viewer.html`'s own directory (`code/packages/gui/viewer/`) — a file that
// does not exist there. `repoRootHref` (the path from the generated page's
// own directory back to the repo root, computed once in generate.mjs from
// OUTPUT_PATH — see `renderPage`) plus the source document's own
// repo-root-relative directory is enough to rewrite the href to the real
// file, chosen over "open inside the viewer" (also legal per the acceptance
// line) because the viewer has no per-document-kind in-page router today —
// doctrine #1, build what's needed now.
const DEFAULT_REPO_ROOT_HREF = '../../../..'

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
let linkContext = { sourceDirRel: '', repoRootHref: DEFAULT_REPO_ROOT_HREF }
// T-746: where the page being rendered will live on disk — every containment
// check below judges an href against THIS location (the installed `prdt`
// writes a project's viewer under its own `.prdt/scratch/viewer/`, not next
// to this module). Set once per `renderPage` call; same single-threaded,
// synchronous-generation reasoning as `linkContext` above.
let pageViewerAbsPath = DEFAULT_VIEWER_ABS_PATH

hardenedRenderer.link = function ({ href, title, tokens }) {
  const text = this.parser.parseInline(tokens)
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
 */
function md(text, sourceDirRel = '', repoRootHref = DEFAULT_REPO_ROOT_HREF) {
  linkContext = { sourceDirRel, repoRootHref }
  return marked.parse(text ?? '', { gfm: true, renderer: hardenedRenderer })
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
 * (ds/lib/parse-tokens.mjs) — so the light set here can never drift from
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
const STORE_ORDER = ['home', 'prd', 'ticket', 'wiki', 'feature', 'artifact']
const STORE_ICON_PATHS = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  prd: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
  ticket: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M15 8h-5"/><path d="M15 12h-5"/>',
  wiki: '<path d="M12 7c-2-2-5-3-9-3v14c4 0 7 1 9 3 2-2 5-3 9-3V4c-4 0-7 1-9 3Z"/><path d="M12 7v14"/>',
  feature: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V4"/>',
  artifact:
    '<path d="M21 8.5v7a1 1 0 0 1-.5.87l-8 4.62a1 1 0 0 1-1 0l-8-4.62A1 1 0 0 1 3 15.5v-7a1 1 0 0 1 .5-.87l8-4.62a1 1 0 0 1 1 0l8 4.62a1 1 0 0 1 .5.87Z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
}
const CLOSE_ICON_PATH = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
const MOON_ICON_PATH = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
const SUN_ICON_PATH = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'

// T-797 개정: replaces the T-746 '#<id>' key in the topstrip's top-right slot.
// The moon shows in light (press → dark), the sun in dark (press → light);
// INTERACTION_SCRIPT keeps aria-label/title in step with the live theme.
function themeToggleButton() {
  return `<button type="button" class="topstrip-theme js-theme-toggle" aria-label="${THEME_TOGGLE.toDark}" title="${THEME_TOGGLE.toDark}"><span class="theme-icon-moon">${svgIcon(MOON_ICON_PATH, 16)}</span><span class="theme-icon-sun">${svgIcon(SUN_ICON_PATH, 16)}</span></button>`
}

function svgIcon(pathMarkup, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</svg>`
}

function activityBar(activeStore) {
  const buttons = STORE_ORDER.map((key) => {
    const active = key === activeStore ? ' active' : ''
    return `<button type="button" class="activity-btn${active}" data-store="${key}" title="${STORE_LABEL[key]}" aria-label="${STORE_LABEL[key]}">${svgIcon(STORE_ICON_PATHS[key])}</button>`
  }).join('\n')
  return `<nav class="activity">\n${buttons}\n</nav>`
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
  const pillClass = cls ? `pill-role-${cls}` : 'pill-neutral'
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
      body: md(t.body, path.dirname(t.rel), repoRootHref),
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
<div class="topstrip"><span class="topstrip-crumb"><b>${escapeHtml(crumbLabel)} · <span class="js-group-label">${escapeHtml(defaultLabel)}</span></b></span>${themeToggleButton()}</div>
<div class="frame-body"><div class="main-inner">${topHtml}${panes}</div></div>
<div class="detail-panel" role="dialog" aria-label="${COMMON.detailPanel}">
<div class="detail-panel-header"><span class="detail-panel-title"></span><button type="button" class="detail-panel-close" aria-label="${COMMON.close}">${svgIcon(CLOSE_ICON_PATH, 14)}</button></div>
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
      body: md(p.body, path.dirname(p.rel), repoRootHref),
    }
  }
  return entries
}

function wikiSection(pages) {
  return storeSection('wiki', { innerHtml: wikiStoreInner(pages) })
}

function featureRowsTable(pages) {
  if (pages.length === 0) return `<p class="v-note">${FEATURE.empty}</p>`
  let html = `<div class="table-wrap"><table><thead><tr>${FEATURE.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    html += `<tr class="detail-row" data-detail-kind="feature" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(fm.feature || id)}</td>`
    html += `<td>${escapeHtml(fm.title || id)}</td>`
    html += `<td><span class="pill pill-status-${wikiFeatureStatusPillClass(fm.status)}">${escapeHtml(wikiFeatureStatusText(fm.status))}</span></td>`
    html += `<td class="num-col">${escapeHtml(fm.spec_since || '—')}</td>`
    html += '</tr>\n'
  }
  html += '</tbody></table></div>\n'
  return html
}

/** Feature store: `docs/features/` is flat (contracts §Fixed paths — "no index file, `ls` is the index") — one group, same list→detail model as every other store rather than a bespoke no-sidebar layout. */
function featureStoreInner(pages) {
  const groups = [
    {
      key: 'all',
      label: STORE_LABEL.feature,
      count: pages.length,
      bodyHtml: countBadge(FEATURE.sidebarLabel, pages.length, FEATURE.countUnit) + featureRowsTable(pages),
    },
  ]
  return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups, noGroupUnit: FEATURE.countUnit })
}

function featureDetailEntries(pages, repoRootHref) {
  const entries = {}
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    entries[id] = {
      title: fm.title || id,
      status: fm.status || '',
      spec_since: fm.spec_since || '',
      path: p.rel,
      body: md(p.body, path.dirname(p.rel), repoRootHref),
    }
  }
  return entries
}

function featuresSection(pages) {
  return storeSection('feature', { innerHtml: featureStoreInner(pages) })
}

/** PRD store: the ONE named content nuance (not a structural deviation — same activity-bar → sidebar-group → main-pane shell as every other store). The "open" group's single, currently-relevant document renders inline directly rather than as a one-row list a reader must click; "closed" behaves exactly like every other store's list→detail. Both strings below ("열린 섹션" / "닫힌 버전") are lifted verbatim from the user-approved mockup (docs/artifacts/v1.10/define-screen-set.html), not new copy. */
function prdOpenBody(prd, repoRootHref) {
  // 'docs/prd' is the fixed path (contracts §Fixed paths — PRD.md is a single
  // standing file, never per-version), not derived from `prd.current.rel` —
  // a fixture that omits `.rel` (this module's own tests do) still resolves
  // links correctly.
  return `<div class="v-body">${md(prd.current.body, 'docs/prd', repoRootHref)}</div>`
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
function prdStoreInner(prd, currentVersion, repoRootHref) {
  const closedRounds = [...prd.closed].sort((a, b) =>
    compareVersionIdsDesc(a.name.replace(/\.md$/, ''), b.name.replace(/\.md$/, '')),
  )
  const groups = [
    { key: 'open', label: `${PRD.openLabelPrefix}${currentVersion}`, count: 1, bodyHtml: prdOpenBody(prd, repoRootHref) },
    ...closedRounds.map((c) => {
      const id = c.name.replace(/\.md$/, '')
      return { key: id, label: id, bodyHtml: `<div class="v-body">${md(c.body, path.dirname(c.rel), repoRootHref)}</div>` }
    }),
  ]
  return groupedStore({ sidebarSubLabel: STORE_LABEL.prd, crumbLabel: STORE_LABEL.prd, groups })
}

function prdSection(prd, currentVersion, repoRootHref) {
  return storeSection('prd', { innerHtml: prdStoreInner(prd, currentVersion, repoRootHref) })
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
  for (const p of data.features) {
    put(p.rel, { s: 'feature', g: 'all', k: 'feature', i: p.rel.split('/').pop() })
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

// Column order and set are FIXED — always all five, whether or not today's
// data has a ticket in that column (T-675 round 2, user verbatim: "user po
// designer developer qa 순으로 배치해줘 열 순서는").
const PROGRESS_ASSIGNEE_ORDER = ['user', 'po', 'designer', 'developer', 'qa']

// T-795: row keys + labels come from `data.prd.openItems` — the OPEN PRD
// version section's own `#### <key> — <label>` headings, read at generation
// time by collect.mjs's `collectPrdOpenItems` (never a fixed list hand-typed
// here — that used to be productune's own v1.10 item keys, so a v1.11 item,
// or another project's own items, had no row at all: this ticket's defect).
//
// T-666 slice 2b: a ticket with NO matching `prd_item` (today T-677/678/679
// — measured 2026-09-26, `grep -L prd_item: docs/tickets/v1.10`) used to be
// silently omitted from the matrix (slice 2a scope, "leave room for them,
// build neither"). This slice appends one more trailing row for those —
// `PROGRESS_OUT_OF_SCOPE_LABEL` (./labels.mjs), the one row label that is
// NOT PRD-derived (no `prd_item` means no PRD heading to read at all) — so a
// ticket never disappears from the card for lacking an item address
// (acceptance line 2).

// T-766: T-755 dropped statusline-prdt.sh's own per-type "which stage is
// this ticket in" guess (the old `TYPE_TO_STAGE` dict) — a `design`-typed
// ticket read as Build work broke that guess, so the statusline now shows
// ONE version-wide done/total over every open+done ticket in the current
// version, every type included (`decision` too), and never estimates a stage
// from a ticket's `type` at all. This viewer carried its own copy of the
// retired guess (the old `TYPE_TO_STAGE` export + `homeStageLine`'s
// per-stage `n/m` cells below) until this ticket — the exact regression
// `scripts/qa/type-to-stage-parity.test.ts` catches. The home progress line
// now mirrors statusline-prdt.sh's rule exactly instead: the current po-state
// stage name, plus that same version-wide count.

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

/**
 * One line, `<stage> | <done>/<total>` — the current po-state stage name
 * (never guessed from ticket type) plus the version-wide count above.
 * @param {Array} currentTickets current-version tickets (any status)
 * @param {string} stage current po-state stage (define|build|ship|retro|idle|'?')
 */
function homeStageLine(currentTickets, stage) {
  const { done, total } = versionProgressCounts(currentTickets)
  return `<div class="stage-line mono">${escapeHtml(`${stage} | ${done}/${total}`)}</div>`
}

function progressSquare(done) {
  return `<span class="stage-sq${done ? ' sq-done' : ''}"></span>`
}

// A ticket's PARTICIPATION (not assignment) shows as a dashed-stroke square —
// the stroke itself is dashed (an SVG <rect stroke-dasharray>), never a
// dashed CSS outline drawn around a solid square (T-675 round 3, user
// verbatim: "점선이 네모를 점선이 감싸는게 아니라 stroke를 점선으로
// 표시하는걸 의미한거야" — a round-2 attempt that used `outline:dashed`
// produced a rounded-corner "scalloped flower" artifact at 10px, fixed by
// moving the dash onto the shape's own stroke path instead).
function progressDashedSquare(done) {
  return `<svg class="stage-sq-svg" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="1" class="stage-sq-dashed-rect${done ? ' sq-done' : ''}"></rect></svg>`
}

// T-708 결함 3 최종 결정 (Designer, T-709 겸임, 2026-09-27) — 택1 중 (b) "+N"
// 접기: 한 칸의 정사각형 표시 상한은 폭·칸과 무관한 상수 10개. 크기를 줄이는
// (a)안은 상한이 없어 미래 개수 증가에 못 버틴다는 이유로 기각됐다(티켓
// outcome §결함 3 참고) — 이 상수만 바뀌면 규칙 전체가 따라온다.
const PROGRESS_MATRIX_FOLD_LIMIT = 10

/** One (item, assignee) matrix cell: `–` when empty (drawn even at 0 — the fixed-column rule extends to fixed cells, never a collapsed column), else one square per ticket + a `done/total` count. Beyond PROGRESS_MATRIX_FOLD_LIMIT squares, only the first N draw — the rest fold into one `+{count-N}` text fragment on the same line (never a second row: `.stage-matrix-sq-wrap` is `flex-wrap: nowrap` — T-708 결함 3). */
function progressCell(solidTickets, dashedTickets) {
  const total = solidTickets.length + dashedTickets.length
  if (total === 0) return '<span class="stage-matrix-cell stage-matrix-cell-empty">–</span>'
  const isDone = (t) => t.frontmatter.status === 'done'
  const done = solidTickets.filter(isDone).length + dashedTickets.filter(isDone).length
  const squares = [...solidTickets.map((t) => progressSquare(isDone(t))), ...dashedTickets.map((t) => progressDashedSquare(isDone(t)))]
  const shownHtml = squares.slice(0, PROGRESS_MATRIX_FOLD_LIMIT).join('')
  const foldHtml =
    squares.length > PROGRESS_MATRIX_FOLD_LIMIT
      ? `<span class="stage-matrix-fold">+${squares.length - PROGRESS_MATRIX_FOLD_LIMIT}</span>`
      : ''
  return `<span class="stage-matrix-cell"><span class="stage-matrix-sq-wrap">${shownHtml}${foldHtml}</span><span class="stage-matrix-count mono">${done}/${total}</span></span>`
}

function progressMatrixHeadRow() {
  const cols = PROGRESS_ASSIGNEE_ORDER.map((role) => `<span class="stage-matrix-col">${escapeHtml(role)}</span>`).join('')
  return `<div class="stage-matrix-row stage-matrix-head"><span class="stage-matrix-label"></span>${cols}</div>`
}

/** `ticketsForItem` = every current-version ticket whose `prd_item:` resolves to this row's key. `label` is already resolved (the PRD heading's own label text, or `PROGRESS_OUT_OF_SCOPE_LABEL` for the trailing row) — this function has no label lookup of its own. The `qa` column is always the dashed/derived one — contracts §Dispatch: QA never gets its own ticket, so an `assignee: qa` solid square is a possibility this code still handles correctly, but never observed in this repo (T-675 round 2). T-798: `role="row"` + `aria-label={label}` gives the row its own accessible name from the FULL, untruncated label text — independent of whatever the visible `.stage-matrix-label` cell does (wrap, or a future truncation), so a screen reader never depends on the visual layout to read the whole PRD heading. */
function progressMatrixRow(label, ticketsForItem) {
  const cells = PROGRESS_ASSIGNEE_ORDER.map((role) => {
    const solid = ticketsForItem.filter((t) => t.frontmatter.assignee === role)
    const dashed = role === 'qa' ? ticketsForItem.filter((t) => t.frontmatter.assignee !== 'qa' && /^### QA/m.test(t.body || '')) : []
    return progressCell(solid, dashed)
  }).join('')
  return `<div class="stage-matrix-row" role="row" aria-label="${escapeHtml(label)}"><span class="stage-matrix-label">${escapeHtml(label)}</span>${cells}</div>`
}

/** The straight overall line above the matrix — one square per current-version ticket, once each, regardless of assignee or prd_item (T-675 round 3: "전체는... 일직선으로 쭉... assignee상관없이"). */
function progressOverall(currentTickets) {
  const done = currentTickets.filter((t) => t.frontmatter.status === 'done').length
  const squares = currentTickets.map((t) => progressSquare(t.frontmatter.status === 'done')).join('')
  return `<div class="stage-overall"><span class="stage-matrix-label">${HOME.overall}</span><span class="stage-matrix-sq-wrap stage-overall-sq-wrap">${squares}</span><span class="stage-matrix-count mono">${done}/${currentTickets.length}</span></div>`
}

const PROGRESS_LEGEND = `<div class="stage-matrix-legend"><span class="stage-matrix-legend-item">${progressSquare(true)} <span>${HOME.legendMain}</span></span><span class="stage-matrix-legend-item">${progressDashedSquare(true)} <span>${HOME.legendDerived}</span></span></div>`

/** The "진행 상황" pane: T-766's own version-wide stage line, above T-675's assignee x PRD-item matrix (a trailing "항목 밖" row included) — two different questions ("which lifecycle stage" vs "which PRD item"), not the same component, per this ticket's two separate acceptance lines. */
function homeProgressBody(data) {
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  const openItems = data.prd.openItems || []
  const byItem = new Map(openItems.map((i) => [i.key, []]))
  const outOfScope = []
  for (const t of currentTickets) {
    const key = prdItemKey(t.frontmatter.prd_item || '', data.currentVersion)
    if (key && byItem.has(key)) byItem.get(key).push(t)
    else outOfScope.push(t) // no prd_item, or one this version's §What items don't name — the trailing row
  }
  const rows =
    openItems.map((i) => progressMatrixRow(i.label, byItem.get(i.key))).join('') +
    progressMatrixRow(PROGRESS_OUT_OF_SCOPE_LABEL, outOfScope)
  return `<div class="dash-card">
<div class="dash-card-title">${svgIcon(STORE_ICON_PATHS.home, 14)} <span>${HOME.working}</span></div>
${homeStageLine(currentTickets, data.poState?.stage || '?')}
${progressOverall(currentTickets)}
<div class="stage-matrix">${progressMatrixHeadRow()}${rows}</div>
${PROGRESS_LEGEND}
</div>`
}

function homeSection(data, repoRootHref) {
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  // T-713 scope note: `e.fields.bucket` matching stays literal (never
  // `sameVersion`) — this ticket's acceptance line names ticket buckets and
  // `prd_item` prefixes only; an artifact-manifest bucket spelled
  // differently from po-state's version string is the same latent bug class
  // but out of scope here (see this dispatch's `unresolved[]`).
  const currentArtifacts = currentArtifactEntries(data.artifacts, data.currentVersion)
  const currentDecisions = currentDecisionPages(data.wiki, data.currentVersion)
  const groups = [
    { key: 'progress', label: HOME.working, bodyHtml: `<div class="dash-grid">${homeProgressBody(data)}</div>` },
    { key: 'ticket', label: STORE_LABEL.ticket, count: currentTickets.length, bodyHtml: ticketRowsTable(currentTickets) },
    { key: 'decision', label: HOME.decision, count: currentDecisions.length, bodyHtml: wikiRowsTable(currentDecisions) },
    { key: 'artifact', label: STORE_LABEL.artifact, count: currentArtifacts.length, bodyHtml: artifactRowsTable(currentArtifacts) },
    { key: 'prd', label: STORE_LABEL.prd, count: data.currentVersion, bodyHtml: prdOpenBody(data.prd, repoRootHref) },
  ]
  return storeSection('home', { active: true, innerHtml: groupedStore({ sidebarSubLabel: STORE_LABEL.home, crumbLabel: STORE_LABEL.home, groups, topHtml: HASH_NOTICE_HTML }) })
}

export const TEMPLATE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
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
.app-shell { flex: 1; min-height: 0; display: flex; }
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

.frame-main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; position: relative; }
.topstrip {
  height: 44px; flex: 0 0 44px; display: flex; align-items: center; gap: var(--space-8);
  padding: 0 var(--space-20); border-bottom: 1px solid var(--border-item); background: var(--bg-surface-base);
}
.topstrip-crumb { font-size: 12px; color: var(--text-tertiary); }
.topstrip-crumb b { color: var(--text-primary); font-weight: 600; }
.frame-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-32) var(--space-40); }
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
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--space-8);
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

/* ---------- home dashboard (T-666 slice 2a) — T-675's assignee x PRD-item
   matrix, copied class-for-class from the user-approved mockup
   (docs/artifacts/v1.10/define-screen-set.html ~line 402-465, T-675
   round 1-4) so the same visual spec that went through four user rounds of
   review lands unchanged in the real product. ---------- */
.dash-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-16); }
.dash-card { border: 1px solid var(--border-item); border-radius: var(--radius-12); background: var(--bg-surface-base); padding: var(--space-20); }
.dash-card-title { font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); margin: 0 0 var(--space-12); display: flex; align-items: center; gap: var(--space-8); }
.stage-line { font-size: 11px; color: var(--text-secondary); margin-bottom: var(--space-12); }
.stage-overall { display: flex; align-items: center; gap: var(--space-8); margin-bottom: var(--space-12); padding-bottom: var(--space-10); border-bottom: 1px solid var(--border-item); }
.stage-overall .stage-matrix-label { font-weight: 700; color: var(--text-primary); flex: 0 0 auto; }
.stage-overall .stage-matrix-count { font-weight: 700; color: var(--text-primary); }
/* T-708 결함 10 (PO 결정, 사용자 축자 "전체의 네모 크기랑 아래 배정된 네모
   크기가 달라"): '전체' 줄 네모도 행렬과 같은 크기(10x10, gap 3px) — 아래
   '.stage-matrix-sq-wrap'의 기본값을 그대로 물려받는다(더 이상 6px/2px로
   덮어쓰지 않는다). 유일하게 남는 차이는 접지 않고(결함 3의 +N 규칙은 이 줄의
   대상이 아니다) 넘치면 줄을 바꾼다는 것뿐이라 wrap 오버라이드 하나만 남긴다. */
.stage-matrix-sq-wrap.stage-overall-sq-wrap { flex-wrap: wrap; }
/* T-798: was a fixed 60px label column with the label cell itself clipped
   (white-space: nowrap; overflow: hidden) — a PRD heading longer than ~4
   Korean syllables cut off mid-word with no hover to recover it (user
   screenshot: 「"두 단계"가 시」 · 「리스크가 정하」). minmax(60px, 140px)
   lets the column grow to fit a short-to-medium heading (home's own
   .main-inner has no max-width — plenty of room beside the 5 fixed 1fr
   assignee columns); the label cell itself now wraps instead of clipping
   (see .stage-matrix-label below), so even a heading past 140px still
   reads in full, on a second/third line, never cut. */
.stage-matrix { display: grid; grid-template-columns: minmax(60px, 140px) repeat(5, 1fr); column-gap: var(--space-6); row-gap: 4px; align-items: center; margin-bottom: var(--space-8); }
.stage-matrix-row { display: contents; }
.stage-matrix-head .stage-matrix-col { font-size: 9px; text-transform: none; letter-spacing: 0.02em; color: var(--text-quaternary);
  font-weight: 600; text-align: center; padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-item); }
.stage-matrix-head .stage-matrix-label { border-bottom: 1px solid var(--border-item); padding-bottom: var(--space-6); }
/* T-798: was white-space: nowrap; overflow: hidden — a label longer than
   the column clipped mid-word with nothing to recover it (no hover, no
   tooltip). word-break: keep-all keeps a Korean word/quoted-phrase whole
   where a normal break opportunity exists (space, punctuation) rather than
   snapping mid-syllable-block; overflow-wrap: anywhere is still the
   fallback for one token literally wider than the 140px column cap above. */
.stage-matrix-label { display: flex; align-items: center; gap: 3px; color: var(--text-tertiary); font-size: 11px;
  text-transform: none; white-space: normal; overflow: visible; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.3; }
.stage-matrix-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 2px 0; }
/* T-708 결함 3: was 'flex-wrap: wrap', letting a cell with >10 tickets fold
   onto a 2nd row and grow taller than every other cell in the same row —
   nowrap + the 10-square cap/"+N" fold in progressCell() above keeps every
   row at a constant single line regardless of count. */
.stage-matrix-sq-wrap { display: flex; flex-wrap: nowrap; gap: 3px; justify-content: center; max-width: 100%; }
.stage-sq { width: 10px; height: 10px; border-radius: 2px; background: var(--bg-interaction-neutral); border: 1px solid var(--border-inline); flex: 0 0 auto; }
.stage-sq.sq-done { background: var(--accent); border-color: var(--accent); }
.stage-sq-svg { width: 10px; height: 10px; flex: 0 0 auto; display: block; overflow: visible; }
.stage-sq-dashed-rect { fill: var(--bg-interaction-neutral); stroke: var(--text-quaternary); stroke-width: 1; stroke-dasharray: 2 1.2; }
.stage-sq-dashed-rect.sq-done { fill: var(--accent); stroke: var(--text-primary); }
.stage-matrix-count { font-size: 9.5px; color: var(--text-secondary); font-family: var(--font-mono); }
/* T-708 결함 3: the "+N" fold fragment — same line as the squares it follows
   (its '.stage-matrix-sq-wrap' parent is nowrap), never its own row. */
.stage-matrix-fold { font-size: 9.5px; color: var(--text-tertiary); font-family: var(--font-mono); white-space: nowrap; flex: 0 0 auto; }
.stage-matrix-cell-empty { color: var(--text-disabled); font-size: 11px; }
.stage-matrix-legend { display: flex; flex-direction: column; gap: 2px; margin: var(--space-4) 0 var(--space-2); font-size: 10px; color: var(--text-quaternary); }
.stage-matrix-legend-item { display: flex; align-items: center; gap: 5px; }
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
.v-body pre { background: var(--bg-surface-on); padding: var(--space-12); border-radius: var(--radius-4); overflow-x: auto; }
.v-body table { border-collapse: collapse; }
.v-body table th, .v-body table td { border: 1px solid var(--border-item); padding: var(--space-4) var(--space-8); }
details.v-fold summary { cursor: pointer; color: var(--icon-tertiary); padding: var(--space-8) 0; }
details.v-fold[open] summary { color: var(--text-primary); }

/* ---------- light/dark toggle (T-797 개정 — the T-746 '#id' key's old slot) ---------- */
.topstrip-theme { margin-left: auto; width: 28px; height: 28px; border: none; background: none; padding: 0; cursor: pointer;
  color: var(--text-tertiary); border-radius: var(--radius-4); display: flex; align-items: center; justify-content: center; }
.topstrip-theme:hover { background: var(--bg-state-hover); color: var(--text-primary); }
.topstrip-theme:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
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
/* docs/design.md 8.4 Banner: severity tint + a full 1px border, no side stripe (T-756). */
.notice { display: flex; gap: 10px; align-items: flex-start; position: relative;
  background: color-mix(in srgb, var(--health-info) 10%, var(--bg-surface-onlayer));
  border: 1px solid color-mix(in srgb, var(--health-info) 35%, var(--border-section));
  border-radius: var(--radius-8); padding: 12px 14px; margin: 0 0 16px; }
.notice[hidden] { display: none; }
.notice-icon { color: var(--health-info); flex: 0 0 auto; margin-top: 1px; display: flex; }
.notice-body { font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; padding-right: 20px; }
.notice-body b { color: var(--text-primary); }
.notice-close { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; border: none; background: none; padding: 0;
  color: var(--text-tertiary); cursor: pointer; border-radius: var(--radius-4); display: flex; align-items: center; justify-content: center; }
.notice-close:hover { background: var(--bg-state-hover); color: var(--text-primary); }
.detail-row.hash-target td { background: var(--bg-state-hover); }
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
const INTERACTION_SCRIPT = `
(function () {
  var DETAIL_DATA = JSON.parse(document.getElementById('detail-data').textContent);
  var DETAIL_FIELD_LABELS = ${JSON.stringify(DETAIL_FIELD_LABELS)};
  var HASH_NOTICE = ${JSON.stringify(HASH_NOTICE)};
  var THEME_TOGGLE = ${JSON.stringify(THEME_TOGGLE)};
  var THEME_KEY = ${JSON.stringify(THEME_STORAGE_PREFIX)} + location.pathname;
  var URL_KEYS = ['view', 'group', 'kind', 'id'];

  function closeDetailPanel(section) {
    if (!section) return;
    var panel = section.querySelector('.detail-panel');
    if (panel) { panel.classList.remove('active'); panel.removeAttribute('data-open-kind'); panel.removeAttribute('data-open-id'); }
  }

  function openDetailPanel(section, kind, id) {
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
      metaRows.push('<div class="detail-field"><span class="detail-field-label">' + DETAIL_FIELD_LABELS[k] +
        '</span><span class="detail-field-value">' + String(v).replace(/</g, '&lt;') + '</span></div>');
    });
    var metaHtml = metaRows.length ? '<div class="detail-meta">' + metaRows.join('') + '</div>' : '';
    // T-666 slice 1b acceptance line 2: an artifact with no inlinable body
    // (.html/.json) says so and links the file, instead of an empty panel.
    var docHtml;
    if (fields.body) {
      docHtml = '<div class="detail-doc body-prose">' + fields.body + '</div>';
    } else if (fields.fileHref) {
      docHtml = '<div class="detail-doc detail-nobody"><p>' + ${JSON.stringify(FILE_HREF_NOTE)} + '</p><p><a href="' +
        fields.fileHref + '" target="_blank" rel="noopener">' + (fields.path || fields.fileHref).replace(/</g, '&lt;') + '</a></p></div>';
    } else {
      docHtml = '';
    }
    panel.querySelector('.detail-panel-body').innerHTML = metaHtml + docHtml;
    panel.setAttribute('data-open-kind', kind);
    panel.setAttribute('data-open-id', id);
    panel.classList.add('active');
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

  function focusItem(section, kind, id) {
    section.querySelectorAll('.view-pane.active [data-detail-kind]').forEach(function (r) {
      if (r.getAttribute('data-detail-kind') === kind && r.getAttribute('data-detail-id') === id) {
        r.classList.add('hash-target');
        if (r.scrollIntoView) r.scrollIntoView({ block: 'center' });
      }
    });
    openDetailPanel(section, kind, id);
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
    if (panel && panel.getAttribute('data-open-kind')) { st.kind = panel.getAttribute('data-open-kind'); st.id = panel.getAttribute('data-open-id'); }
    return st;
  }

  function syncUrl(replace) {
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
      if (bucket && Object.prototype.hasOwnProperty.call(bucket, id)) focusItem(section, kind, id);
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
      openDetailPanel(detailRow.closest('.store-section'), detailRow.getAttribute('data-detail-kind'), detailRow.getAttribute('data-detail-id'));
      return;
    }

    var closeBtn = ev.target.closest('.detail-panel-close');
    if (closeBtn) { ev.preventDefault(); closeDetailPanel(closeBtn.closest('.store-section')); }
  }

  document.addEventListener('click', function (ev) { onClick(ev); syncUrl(false); });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      var openPanel = document.querySelector('.detail-panel.active');
      if (openPanel) { closeDetailPanel(openPanel.closest('.store-section')); syncUrl(false); }
    }
  });

  // A '#<key>' link keeps working: it routes, then the URL is rewritten to
  // the same screen's query form so a refresh reopens it.
  window.addEventListener('hashchange', function () { routeHash(); syncUrl(true); });
  window.addEventListener('popstate', function () { if (!location.hash) routeParams(); });
  paintToggle();
  route();
  syncUrl(true);
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
  `script-src 'sha256-${THEME_HEAD_SCRIPT_SHA256_BASE64}' 'sha256-${INTERACTION_SCRIPT_SHA256_BASE64}'`,
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
 * @param {string} [args.artifactsBaseHref] path from the generated page's own directory to `docs/artifacts/` — defaults to this repo's real, current OUTPUT_PATH layout (`code/packages/gui/viewer/viewer.html` → repo root) so a fixture/test that omits it still gets a working link.
 * @param {string} [args.repoRootHref] path from the generated page's own directory back to the repo root — T-666 slice 2b: every relative link inside a rendered document body is rewritten onto this (see `resolveDocLink`), rather than being left to resolve against the page's own folder. Defaults to this repo's real, current OUTPUT_PATH layout, same as `artifactsBaseHref`'s default (`artifactsBaseHref` = `${repoRootHref}/docs/artifacts`, computed once in generate.mjs from the same OUTPUT_PATH — not a second relative-path calculation).
 */
export function renderPage({
  data,
  dark,
  light,
  fontFaceCss,
  tokensSha256,
  artifactsBaseHref = '../../../../docs/artifacts',
  repoRootHref = DEFAULT_REPO_ROOT_HREF,
  viewerAbsPath = DEFAULT_VIEWER_ABS_PATH,
}) {
  pageViewerAbsPath = viewerAbsPath
  const detailData = {
    ticket: ticketDetailEntries(data.tickets, repoRootHref),
    wiki: wikiDetailEntries(data.wiki, repoRootHref),
    feature: featureDetailEntries(data.features, repoRootHref),
    artifact: artifactDetailEntries(data.artifacts, artifactsBaseHref, repoRootHref),
    // No "prd" bucket (T-709 결정 2): a closed PRD round is no longer a
    // detail-row — its body renders directly in its own sidebar group's pane
    // (prdStoreInner) — so DETAIL_DATA never needs one.
    anchors: buildAnchors(data),
    maxTicket: maxTicketNumber(data),
  }

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">
<title>${PAGE.title}</title>
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
${prdSection(data.prd, data.currentVersion, repoRootHref)}
${ticketSection(data.tickets, data.currentVersion)}
${wikiSection(data.wiki)}
${featuresSection(data.features)}
${artifactsSection(data.artifacts, data.currentVersion)}
</div>
${detailDataScript(detailData)}
<script>${INTERACTION_SCRIPT}</script>
</body>
</html>
`
}
