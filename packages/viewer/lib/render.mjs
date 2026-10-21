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
import { IDLE,
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
  FRAME,
  HASH_NOTICE,
  THEME_TOGGLE,
  noGroupLabel,
  OPTION_CARD,
  ENV,
  IDENTITY,
} from './labels.mjs'
import { mermaidBlock, hasMermaid, mermaidScript, MERMAID_CSS } from './mermaid.mjs'
import { buildDisciplineIndex, linkDisciplineText, linkDisciplineCode } from './discipline-links.mjs'
import { HOME_STAGES, stageSegments, buildHomeGraph, layoutHomeGraph, waitLists, compareTicketIds, NODE_W, NODE_H } from './home-graph.mjs'
import { disciplineLoadCard, DISCIPLINE_LOAD_CSS, DISCIPLINE_LOAD_SCRIPT } from './discipline-load.mjs'
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
 * @param {object|null} [docsLayout] `data.docsLayout` (lib/docs-layout.mjs `createDocsLayout`); null/legacy = as before
 * @returns {string|null}
 */
export function resolveDocLink(href, sourceDirRel, repoRootHref, viewerAbsPath = DEFAULT_VIEWER_ABS_PATH, docsLayout = null) {
  if (!href) return null
  if (/^(#|\/\/|\/)/.test(href)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  const hashIdx = href.indexOf('#')
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const hashPart = hashIdx === -1 ? '' : href.slice(hashIdx)
  if (!pathPart) return null
  let resolved = path.posix.normalize(path.posix.join(sourceDirRel, pathPart))
  // T-1104 ③: a link written against the As-Is tree (a closed PRD) opens its To-Be file —
  // product → _shared fallback, `docs/…` through the ref map (same rule as the CLI's resolve_docs_link).
  if (docsLayout && docsLayout.layout === 'product' && !resolved.startsWith('..')) resolved = docsLayout.mapJoined(resolved)
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
let linkContext = { sourceDirRel: '', repoRootHref: DEFAULT_REPO_ROOT_HREF, disc: null, docs: null, ids: null, decision: null }
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

// T-972: a path this viewer itself shows (docs/artifacts · wiki · prd · tickets ·
// features) becomes `<a href="#<path>">`, which the existing hash route opens
// (and replaces with ?view=…&kind=…&id=… — same tab, back returns). The targets
// are the page's own anchor table: a path the page does not carry stays text.
// Never inside another link's text (`link` below switches it off), never in a
// fenced block (not this renderer); an inline code span links only when the
// whole span is one such path. A `[[wikilink]]` is left as it was.
// T-1104: a To-Be path carries a `_shared/` or `<product>/` segment first.
const DOC_PATH_RE = /(?<![\w./~-])(?<!\[\[)docs\/(?:_shared\/|[a-z0-9]+(?:-[a-z0-9]+)*\/)?(?:artifacts|wiki|prd|tickets|features)\/[\w./-]*\w/g
let pageDocTargets = null
// T-1104: the layout of the project being rendered (null = legacy / single-product, as before).
let pageDocsLayout = null
// T-1165: the sidebar identity line · tool version · progress card, derived once per renderPage from `data` (see `pageIdentityOf`).
let pageIdentity = null

/** The anchor-table key a path written in a body names: itself, else (product layout) its To-Be form (③ As-Is paths in closed PRDs · tickets · wiki). */
function docTargetKey(text) {
  if (pageDocTargets.has(text)) return text
  if (pageDocsLayout && pageDocsLayout.layout === 'product') {
    const to = pageDocsLayout.resolveRef(text)
    if (to !== text && pageDocTargets.has(to)) return to
  }
  return null
}
let pageTicketIds = null

/**
 * path → the `#` key the page's anchor table routes it by. Same table as
 * `buildAnchors` (path keys of wiki · artifacts · features · PRD) plus every
 * ticket file's own path, keyed by the ticket id.
 * @param {object} data the collected project
 * @param {Record<string, object>} [anchors] `buildAnchors(data)` when the caller has it
 * @returns {Map<string, string>}
 */
export function buildDocPathTargets(data, anchors = buildAnchors(data)) {
  const targets = new Map()
  for (const key of Object.keys(anchors)) if (key.startsWith('docs/')) targets.set(key, key)
  const put = (t) => {
    const id = t.frontmatter?.id || t.rel
    if (t.rel && Object.prototype.hasOwnProperty.call(anchors, id) && !targets.has(t.rel)) targets.set(t.rel, id)
  }
  for (const set of [data.tickets, ...(data.lines || []).map((l) => l.tickets)]) {
    for (const t of set.included) put(t)
    for (const b of set.omitted) for (const t of b.tickets) put(t)
  }
  return targets
}

function docPathAnchor(rel, textHtml) {
  return `<a href="#${escapeHtml(pageDocTargets.get(docTargetKey(rel)))}">${textHtml}</a>`
}

// T-1066: a ticket id (T-NNN · T-PATCH-NNN · T-P4-NNN) in running text links to
// that ticket the same way. The known ids are the ticket-id values of the doc
// targets table (every ticket the page carries); an id it lacks stays text. Not
// in code (the codespan path checks only doc paths), not inside a path or word.
const BODY_TICKET_ID_RE = /(?<![\w./#~-])T-(?:[A-Z][A-Z0-9]*-)?\d+(?![\w-])/g

function ticketIdsOf(targets) {
  const ids = new Set()
  if (targets) for (const v of targets.values()) if (!v.startsWith('docs/')) ids.add(v)
  return ids
}

function linkTicketIdText(text, ids, plain) {
  BODY_TICKET_ID_RE.lastIndex = 0
  let out = ''
  let last = 0
  let found = false
  for (let m = BODY_TICKET_ID_RE.exec(text); m !== null; m = BODY_TICKET_ID_RE.exec(text)) {
    if (!ids.has(m[0])) continue
    found = true
    if (m.index > last) out += plain(text.slice(last, m.index))
    out += `<a href="#${escapeHtml(m[0])}">${escapeHtml(m[0])}</a>`
    last = m.index + m[0].length
  }
  if (!found) return null
  if (last < text.length) out += plain(text.slice(last))
  return out
}

function linkDocPathText(text, plain) {
  DOC_PATH_RE.lastIndex = 0
  let out = ''
  let last = 0
  let found = false
  for (let m = DOC_PATH_RE.exec(text); m !== null; m = DOC_PATH_RE.exec(text)) {
    if (docTargetKey(m[0]) === null) continue
    found = true
    if (m.index > last) out += plain(text.slice(last, m.index))
    out += docPathAnchor(m[0], escapeHtml(m[0]))
    last = m.index + m[0].length
  }
  if (!found) return null
  if (last < text.length) out += plain(text.slice(last))
  return out
}

hardenedRenderer.text = function (token) {
  const plainText = (seg) => {
    if (linkContext.disc) {
      const linked = linkDisciplineText(seg, linkContext.disc, (s2) => defaultTextRender.call(this, { type: 'text', raw: s2, text: s2, escaped: false }))
      if (linked !== null) return linked
    }
    return defaultTextRender.call(this, { type: 'text', raw: seg, text: seg, escaped: false })
  }
  if ((linkContext.disc || linkContext.docs) && !('tokens' in token && token.tokens) && !token.escaped) {
    if (linkContext.docs) {
      const ids = linkContext.ids
      const idOrPlain = (seg) => (ids && ids.size ? linkTicketIdText(seg, ids, plainText) : null) ?? plainText(seg)
      const docLinked = linkDocPathText(token.text, idOrPlain)
      if (docLinked !== null) return docLinked
      if (ids && ids.size) {
        const idLinked = linkTicketIdText(token.text, ids, plainText)
        if (idLinked !== null) return idLinked
      }
    }
    if (linkContext.disc) {
      const linked = linkDisciplineText(token.text, linkContext.disc, (seg) => defaultTextRender.call(this, { type: 'text', raw: seg, text: seg, escaped: false }))
      if (linked !== null) return linked
    }
  }
  return defaultTextRender.call(this, token)
}
// T-1049 (T-1056 = A): a ```mermaid fence becomes the same inert diagram block the guide's `flow`
// uses (lib/mermaid.mjs); every other fence keeps marked's own renderer.
const defaultCodeRender = hardenedRenderer.code
hardenedRenderer.code = function (token) {
  if (token && typeof token === 'object' && /^mermaid(\s|$)/.test(token.lang || '')) return mermaidBlock(token.text || '') + '\n'
  return defaultCodeRender.call(this, token)
}
hardenedRenderer.codespan = function ({ text }) {
  if (linkContext.docs && docTargetKey(text) !== null) return `<code>${docPathAnchor(text, escapeHtml(text))}</code>`
  const linked = linkContext.disc ? linkDisciplineCode(text, linkContext.disc) : null
  return linked ?? `<code>${escapeHtml(text)}</code>`
}

hardenedRenderer.link = function ({ href, title, tokens }) {
  const outerDisc = linkContext.disc
  const outerDocs = linkContext.docs
  const outerIds = linkContext.ids
  linkContext.disc = null
  linkContext.docs = null
  linkContext.ids = null
  const text = this.parser.parseInline(tokens)
  linkContext.disc = outerDisc
  linkContext.docs = outerDocs
  linkContext.ids = outerIds
  const rewritten = resolveDocLink(href, linkContext.sourceDirRel, linkContext.repoRootHref, pageViewerAbsPath, pageDocsLayout)
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
  const rewritten = resolveDocLink(href, linkContext.sourceDirRel, linkContext.repoRootHref, pageViewerAbsPath, pageDocsLayout)
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
function md(text, sourceDirRel = '', repoRootHref = DEFAULT_REPO_ROOT_HREF, { discipline = false, decision = false } = {}) {
  linkContext = { sourceDirRel, repoRootHref, disc: discipline ? pageDisciplineIndex : null, docs: pageDocTargets, ids: pageTicketIds, decision: decision ? { chosen: decisionChosen(text ?? '') } : null }
  try {
    return marked.parse(text ?? '', { gfm: true, renderer: hardenedRenderer, tokenizer: strictDelTokenizer })
  } finally {
    linkContext.decision = null
  }
}

// T-998 (T-999 = C): a decision ticket's `options` table renders as one card
// per option. Only a ticket body asks for it (`md(..., { decision: true })`);
// the ticket md keeps the contract's table. Columns are mapped by header name.
/**
 * The letter the user's answer picked, read from the ticket's `## outcome`
 * section: the PO's "= B" reading first, then a lone letter inside the
 * verbatim quote, then "A 안". null when there is none (an open decision).
 * @param {string} body
 * @returns {string|null}
 */
function decisionChosen(body) {
  const sec = /^## outcome[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)
  if (!sec) return null
  const t = sec[1]
  const m = OPTION_CARD.pickPatterns.reduce((hit, re) => hit || re.exec(t), null)
  return m ? m[1].toUpperCase() : null
}

const inlineMd = (text) => marked.parseInline(text, { gfm: true, renderer: hardenedRenderer, tokenizer: strictDelTokenizer })

function renderOptionCards(token, parser) {
  // unmapped columns keep their index as `extra` and render under their own header (T-1132)
  // (a second column of an already-mapped kind too)
  const cols = token.header.map((h) => OPTION_CARD.headers[h.text.replace(/\s*\(.*$/, '').trim().toLowerCase()] || 'extra')
    .map((kind, i, all) => (all.indexOf(kind) === i ? kind : 'extra'))
  if (!cols.includes('name')) return null
  // a row with every cell empty (the `tickets new` scaffold's blank rows) draws no card
  const rows = token.rows.filter((row) => row.some((c) => c.text.trim() !== ''))
  if (rows.length === 0) return ''
  const cards = rows.map((row) => {
    const cell = (kind) => { const i = cols.indexOf(kind); return i < 0 ? null : row[i] }
    const nameCell = cell('name')
    const nameText = nameCell ? nameCell.text.trim() : ''
    const lm = /^([A-Z]|\d+)\s+([\s\S]+)$/.exec(nameText)
    const letter = lm ? lm[1] : ''
    const title = lm ? inlineMd(lm[2]) : inlineMd(nameText)
    const recCell = cell('rec')
    const recText = recCell ? recCell.text.trim() : ''
    const isRec = recText !== '' && !OPTION_CARD.noRec.test(recText)
    const why = isRec ? recText.replace(OPTION_CARD.recPrefix, '') : ''
    const chosen = linkContext.decision?.chosen
    const isChosen = !!chosen && letter === chosen
    const isDim = !!chosen && !isChosen
    const marks = (isRec ? `<span class="opt-mk opt-mk-rec">${OPTION_CARD.recommended}</span>` : '') + (isChosen ? `<span class="opt-mk opt-mk-chosen">${OPTION_CARD.chosen}</span>` : '')
    let html = `<article class="opt-card${isChosen ? ' is-chosen' : ''}${isDim ? ' is-dim' : ''}"><header class="opt-h">${letter ? `<span class="opt-letter">${escapeHtml(letter)}</span>` : ''}<h4>${title}</h4><span class="opt-marks">${marks}</span></header>`
    const ex = cell('example')
    if (ex && ex.text.trim()) {
      const only = ex.tokens.length === 1 && ex.tokens[0].type === 'codespan'
      const body = only
        ? `<pre class="opt-sk">${escapeHtml(ex.tokens[0].raw.replace(/^`+|`+$/g, '').trim())}</pre>`
        : `<div class="opt-ex-text">${parser.parseInline(ex.tokens)}</div>`
      html += `<div class="opt-ex"><div class="opt-lab">${OPTION_CARD.example}</div>${body}</div>`
    }
    let facts = ''
    const factCols = cols.map((kind, i) => [kind, i]).filter(([kind]) => kind === 'extra' || kind in OPTION_CARD.facts)
    for (const [kind, i] of factCols) {
      const c = row[i]
      if (!c || !c.text.trim()) continue
      const [label, cls] = kind === 'extra' ? [parser.parseInline(token.header[i].tokens), 'x'] : OPTION_CARD.facts[kind]
      facts += `<dt${cls ? ` class="${cls}"` : ''}>${label}</dt><dd>${parser.parseInline(c.tokens)}</dd>`
    }
    if (facts) html += `<dl class="opt-facts">${facts}</dl>`
    if (why) html += `<div class="opt-why"><b>${OPTION_CARD.why}</b>${inlineMd(why)}</div>`
    return html + '</article>'
  })
  return `<div class="opt-cards">${cards.join('')}</div>\n`
}

const defaultTable = Renderer.prototype.table
hardenedRenderer.table = function (token) {
  if (linkContext.decision) {
    const cards = renderOptionCards(token, this.parser)
    if (cards !== null) return cards
  }
  return defaultTable.call(this, token)
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
// T-1047: env has no activity-bar item — it is the last current-version sidebar item (after 결정).
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

/**
 * T-1165: what the sidebar's three identity parts show, all from data the page already has — the
 * statusline's own sources: project = config slug, version · stage = po-state, stage done/total =
 * `stageSegments` (the viewer's `stageOfTicketType` rule, statusline-stage-parity), ticket done/total
 * = `versionProgressCounts`, dec · req = `waitLists`, tool version = the installed package's RELEASES.md top `##` line (`prdt --version`).
 * An idle product (stage idle, or no version) shows 「쉬는 중」 and no card.
 */
export function pageIdentityOf(data) {
  const stage = data.poState?.stage || ''
  const version = data.currentVersion || ''
  const project = data.project || IDENTITY.tool
  const toolVersion = data.toolVersion || ''
  const idle = stage === 'idle' || !version
  if (idle) return { project, version, stage, idle, toolVersion, card: null }
  const currentTickets = currentVersionTickets(data.tickets, version)
  const seg = stageSegments(currentTickets).find((x) => x.stage === stage)
  const stageDone = seg ? seg.tickets.filter((t) => t.done).length : 0
  const stageTotal = seg ? seg.tickets.length : 0
  const { done, total } = versionProgressCounts(currentTickets)
  const { dec, req } = homeWaitLists(data)
  return { project, version, stage, idle, toolVersion, card: { stage, stageDone, stageTotal, done, total, dec: dec.length, req: req.length } }
}

function sidebarIdentityHtml(id) {
  const run = id.idle
    ? `<span class="sid-sep">·</span> <span class="sid-st">${escapeHtml(IDENTITY.idle)}</span>`
    : `<span class="sid-sep">·</span> <span class="sid-v">${escapeHtml(id.version)}</span> <span class="sid-st">${escapeHtml(id.stage)}</span>`
  const idTitle = id.idle ? IDENTITY.idIdleTitle(id.project) : IDENTITY.idTitle(id.project, id.version, id.stage)
  return `<div class="sidebar-id" title="${escapeHtml(idTitle)}"><b>${escapeHtml(id.project)}</b> ${run}</div>`
}

/** T-1180: the card opens the home store's 진행 상황 tab (`key` = that group's key, line-prefixed on a multi-line page) — a button for mouse and keyboard, like the tab link above it. */
function sidebarCardHtml(c, key = 'progress') {
  if (!c) return ''
  const pct = c.total > 0 ? Math.round((c.done / c.total) * 1000) / 10 : 0
  const stageName = IDENTITY.stage[c.stage] || c.stage
  return `<div class="sp" role="button" tabindex="0" data-card-open="${escapeHtml(key)}" aria-label="${IDENTITY.cardLabel}"><div class="sp-top" title="${escapeHtml(IDENTITY.cardTopTitle(stageName, c.stage, c.stageDone, c.stageTotal))}"><span class="sp-stage">${escapeHtml(stageName)}</span><span>${c.stageDone}/${c.stageTotal}</span></div><div class="sp-count" title="${escapeHtml(IDENTITY.countTitle)}"><small>${IDENTITY.ticket}</small> <b>${c.done}</b><span class="sp-of">/${c.total}</span></div><div class="sp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.done}" aria-label="${IDENTITY.ticketBar(c.done, c.total)}"><i style="width:${pct}%"></i></div><div class="sp-wait"><span title="${escapeHtml(IDENTITY.decTitle)}">dec <b>${c.dec}</b></span><span>·</span><span title="${escapeHtml(IDENTITY.reqTitle)}">req <b>${c.req}</b></span></div></div>`
}

function toolVersionText(id) {
  return id.toolVersion ? `${IDENTITY.tool} ${id.toolVersion}` : ''
}

function activityBar(activeStore) {
  const buttons = STORE_ORDER.map((key) => {
    const active = key === activeStore ? ' active' : ''
    return `<button type="button" class="activity-btn${active}" data-store="${key}" title="${STORE_LABEL[key]}" aria-label="${STORE_LABEL[key]}">${svgIcon(STORE_ICON_PATHS[key])}</button>`
  }).join('\n')
  // T-806: the toggle sits at the rail's bottom, below every store button —
  // the rail is the one element unchanged across Home, every store tab, and
  // any item open (see the .activity-theme-toggle CSS comment).
  const tool = pageIdentity ? toolVersionText(pageIdentity) : ''
  return `<nav class="activity">\n${buttons}\n${themeToggleButton()}\n${tool ? `<span class="rail-tool">${escapeHtml(tool)}</span>` : ''}\n</nav>`
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
  return (String(id ?? '').match(/\d+/g) || []).map(Number)
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

/** T-1138: the current version's `type: decision` tickets — the 질문 rows of Home's decision group. */
function decisionTicketsOf(tickets) {
  return tickets.filter((t) => t.frontmatter.type === 'decision')
}

/** T-1138: Home's decision group body — 질문 (decision tickets, open first) then 기록 (decision pages). No decision ticket → the pages-only table, unchanged. */
function decisionRowsTable(tickets, pages) {
  if (tickets.length === 0) return wikiRowsTable(pages)
  const isOpen = (t) => t.frontmatter.status === 'open'
  const ordered = [...sortNewestFirst(tickets.filter(isOpen), (x) => x.frontmatter.created, (x) => x.frontmatter.id || x.rel), ...sortNewestFirst(tickets.filter((t) => !isOpen(t)), (x) => x.frontmatter.created, (x) => x.frontmatter.id || x.rel)]
  const K = HOME.decisionKind
  let html = `<div class="table-wrap"><table><thead><tr>${HOME.decisionHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const t of ordered) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    html += `<tr class="detail-row" data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}">`
    html += `<td><span class="pill pill-type">${escapeHtml(isOpen(t) ? K.ticketOpen : fm.status === 'dropped' ? K.ticketDropped : K.ticketDone)}</span></td>`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(fm.slug || id)}</td>`
    html += `<td><span class="pill pill-status-${statusPillClass(fm.status)}">${escapeHtml(ticketStatusText(fm.status))}</span></td>`
    html += `<td class="num-col">${escapeHtml(t.bucket || '—')}</td></tr>\n`
  }
  for (const p of pages) {
    const fm = p.frontmatter
    const id = p.rel.split('/').pop()
    html += `<tr class="detail-row" data-detail-kind="wiki" data-detail-id="${escapeHtml(id)}">`
    html += `<td><span class="pill pill-type">${escapeHtml(K.page)}</span></td>`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(fm.title || id)}</td>`
    html += `<td><span class="pill pill-status-${wikiFeatureStatusPillClass(fm.status)}">${escapeHtml(wikiFeatureStatusText(fm.status))}</span></td>`
    html += `<td class="num-col">${escapeHtml(fm.version || '—')}</td></tr>\n`
  }
  return html + '</tbody></table></div>\n'
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

// ---------- sortable list tables (T-1006) ----------
// Tickets and artifacts tables sort by column header click (static HTML, no
// server): rows are emitted already sorted by 추가일 descending (ties: ticket
// number descending), every <td> carries its raw sort value in `data-sort`
// and every <tr> its tie-break in `data-tie`; INTERACTION_SCRIPT's
// `sortTable` reorders the rows in place. `kind` 'num' compares numbers,
// 'text' compares text with numeric-aware collation (T-999 < T-1000).
/** The number inside a ticket id ("T-1006" → 1006); 0 when there is none. */
function ticketNum(id) {
  const m = /(\d+)/.exec(String(id || ''))
  return m ? Number(m[1]) : 0
}

/** Rows newest first by `created` text (ISO dates sort as text), then higher ticket number first, then the incoming order. */
function sortNewestFirst(items, createdOf, ticketOf) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ca = String(createdOf(a.item) || '')
      const cb = String(createdOf(b.item) || '')
      if (ca !== cb) return ca < cb ? 1 : -1
      const ta = ticketNum(ticketOf(a.item))
      const tb = ticketNum(ticketOf(b.item))
      return tb - ta || a.i - b.i
    })
    .map((x) => x.item)
}

/** `<thead>` whose every header is a sort button; column `activeIdx` starts descending. `kinds[i]` is 'num' | 'text'. */
function sortableThead(headers, kinds, activeIdx) {
  const ths = headers.map((h, i) =>
    `<th aria-sort="${i === activeIdx ? 'descending' : 'none'}"><button type="button" class="sort-btn" data-sort-col="${i}" data-sort-kind="${kinds[i]}">${escapeHtml(h)}<span class="sort-ind" aria-hidden="true"></span></button></th>`)
  return `<thead><tr>${ths.join('')}</tr></thead>`
}

/** A `<td>` carrying its raw sort value. */
function sortTd(value, inner, cls = '') {
  return `<td${cls ? ` class="${cls}"` : ''} data-sort="${escapeHtml(String(value ?? ''))}">${inner}</td>`
}

/** One <table> of ticket rows for one group (current version, backlog, or a frontmatter-only bucket — T-709 결정 1: same shape, `t.frontmatter` is all this needs, whether or not the row's own entry carries a `body`) — every row is a detail-row keyed for the embedded JSON blob below, so "every row resolves to a detail entry" is true by construction (same loop builds both). */
function ticketRowsTable(tickets) {
  if (tickets.length === 0) {
    return `<p class="v-note">${TICKET.empty}</p>`
  }
  let html = `<div class="table-wrap"><table class="sortable">${sortableThead(TICKET.tableHeaders, ['text', 'text', 'text', 'text', 'text', 'text'], 5)}<tbody>\n`
  for (const t of sortNewestFirst(tickets, (x) => x.frontmatter.created, (x) => x.frontmatter.id || x.rel)) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    html += `<tr class="detail-row" data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}" data-tie="${ticketNum(id)}">`
    html += sortTd(id, escapeHtml(id), 'id-col')
    html += sortTd(fm.slug || '', escapeHtml(fm.slug || ''))
    html += sortTd(fm.type || '', `<span class="pill pill-type">${escapeHtml(fm.type || '')}</span>`)
    html += sortTd(ticketStatusText(fm.status), `<span class="pill pill-status-${statusPillClass(fm.status)}">${escapeHtml(ticketStatusText(fm.status))}</span>`)
    html += sortTd(fm.assignee || '', ticketRolePill(fm.assignee))
    html += sortTd(fm.created || '', escapeHtml(fm.created || ''), 'num-col')
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
  const { groups, defaultKey } = ticketGroups(tickets, currentVersion)
  return groupedStore({
    sidebarSubLabel: TICKET.sidebarLabel,
    crumbLabel: TICKET.sidebarLabel,
    groups,
    noGroupUnit: TICKET.countUnit,
    defaultKey,
  })
}

function ticketGroups(tickets, currentVersion, idle = false) {
  // T-1108: idle changes labels only — an idle product keeps backlog + every closed bucket; its retained version is a closed bucket (no `· 현재`), backlog leads and is the default.
  const currentTickets = currentVersionTickets(tickets, currentVersion)
  const backlogTickets = tickets.included.filter((t) => t.bucket === 'backlog')
  const currentBucketKey = currentTicketBucketKey(tickets, currentVersion)

  // The current version's own row is a version bucket like any other — it
  // must be sorted INTO the same numeric-descending run as `tickets.omitted`
  // (a bucket like v1.11/v2.0 is a not-yet-current roadmap dir, still newer
  // than the current version — T-709 결정 1), never pinned to array index 0
  // structurally. Only `backlog` (not a version at all) sits outside this
  // sort, pinned last.
  const versionBuckets = [...(idle && currentTickets.length === 0 ? [] : [currentBucketKey]), ...tickets.omitted.map((o) => o.bucket)].sort(compareVersionIdsDesc)

  const backlogGroup = {
    key: 'backlog',
    label: TICKET.backlogLabel,
    count: backlogTickets.length,
    bodyHtml: countBadge(TICKET.backlogLabel, backlogTickets.length, TICKET.countUnit) + ticketRowsTable(backlogTickets),
  }
  const groups = [
    ...(idle ? [backlogGroup] : []),
    ...versionBuckets.map((bucket) => {
      if (bucket === currentBucketKey) {
        return {
          key: currentBucketKey,
          label: idle ? currentVersion : `${currentVersion} · ${TICKET.currentTag}`,
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
    ...(idle ? [] : [backlogGroup]),
  ]
  return { groups, defaultKey: idle ? 'backlog' : currentBucketKey }
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
function ticketDetailEntries(tickets, repoRootHref, lineTickets = []) {
  const entries = {}
  // T-961: added release lines' tickets follow the home line's.
  for (const set of lineTickets) Object.assign(entries, ticketDetailEntries(set, repoRootHref))
  for (const t of tickets.included) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    entries[id] = {
      title: fm.slug || id,
      type: fm.type || '',
      status: ticketStatusText(fm.status || ''),
      assignee: fm.assignee || '',
      created: fm.created || '',
      path: t.rel,
      body: md(t.body, path.dirname(t.rel), repoRootHref, { discipline: true, decision: true }),
    }
  }
  for (const bucket of tickets.omitted) {
    for (const t of bucket.tickets) {
      const fm = t.frontmatter
      const id = fm.id || t.rel
      entries[id] = {
        title: fm.slug || id,
        type: fm.type || '',
        status: ticketStatusText(fm.status || ''),
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
export function pastTicketDataFiles(tickets, { repoRootHref = DEFAULT_REPO_ROOT_HREF, viewerAbsPath = DEFAULT_VIEWER_ABS_PATH, prefix = 'viewer', discipline = [], line = null, docTargets = null, docsLayout = null } = {}) {
  pageViewerAbsPath = viewerAbsPath
  pageDocsLayout = docsLayout
  pageDisciplineIndex = buildDisciplineIndex(discipline)
  pageDocTargets = docTargets
  pageTicketIds = ticketIdsOf(pageDocTargets)
  const files = []
  for (const bucket of tickets.omitted) {
    // T-961: an added line's bucket key is `<line>--<bucket>` (no `/` in a file name).
    const key = line ? `${line}--${bucket.bucket}` : bucket.bucket
    if (!bucket.bodies || !PAST_BUCKET_RE.test(key)) continue
    const rows = {}
    const bodies = []
    for (const t of bucket.tickets) {
      const raw = Object.prototype.hasOwnProperty.call(bucket.bodies, t.rel) ? bucket.bodies[t.rel] : undefined
      if (typeof raw !== 'string') continue
      const id = t.frontmatter.id || t.rel
      const body = md(raw, path.dirname(t.rel), repoRootHref, { discipline: true, decision: true })
      rows[id] = { path: t.rel, body }
      bodies.push(body)
    }
    if (bodies.length === 0) continue
    files.push({ bucket: key, name: `${prefix}.tickets-${key}.js`, tickets: rows, bodies })
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

function ticketSection(tickets, currentVersion, views = []) {
  if (views.length > 0) {
    const groups = lineSectioned(views, (v) => ticketGroups(v.tickets, v.currentVersion, isIdleView(v)))
    return storeSection('ticket', { innerHtml: groupedStore({ sidebarSubLabel: TICKET.sidebarLabel, crumbLabel: TICKET.sidebarLabel, groups, noGroupUnit: TICKET.countUnit, defaultKey: groups.defaultKey }) })
  }
  return storeSection('ticket', { innerHtml: ticketStoreInner(tickets, currentVersion) })
}

// ---------- release lines (T-961; release-lines.md §6b) ----------
// The stores whose sidebar draws one section per release line, home line
// first, each headed `<line> <version>` + its stage. Every other store's sidebar is unchanged.
export const LINE_SECTIONED_STORES = ['home', 'prd', 'ticket', 'feature', 'artifact']

/**
 * One view per release line, home line first; [] on a single-line project —
 * every store then takes its unchanged single-line path. A view carries the
 * same field names the single-line renderers read off `data`, so a view-
 * scoped copy of `data` (`lineData`) feeds them unchanged.
 */
export function lineViews(data) {
  if (!Array.isArray(data.lines) || data.lines.length === 0) return []
  const home = { line: null, name: data.project || '', prefix: '', currentVersion: data.currentVersion, stage: data.poState?.stage || '', tickets: data.tickets, prd: data.prd, lanes: data.lanes }
  return [
    home,
    ...data.lines.map((l) => ({ line: l.name, name: l.name, prefix: `${l.name}/`, currentVersion: l.version, stage: l.stage, tickets: l.tickets, prd: l.prd, lanes: l.lanes })),
  ]
}

/** T-1108: an idle added product (no open version) — its last closed version, '' when none closed yet. */
function lastClosedId(v) {
  return [...v.prd.closed].map((c) => c.name.replace(/\.md$/, '')).sort(compareVersionIdsDesc)[0] || ''
}

/** T-1108: the version whose artifacts · decisions an idle product still lists — the retained po-state version, else its last closed one. */
function idleVersion(v) {
  return v.currentVersion || lastClosedId(v)
}

function isIdleView(v) {
  // T-1108: idle = the product's po-state stage, not a missing version (prdt keeps the version after close).
  return v.stage === 'idle' && Boolean(v.name)
}

function lineHead(v) {
  return `${v.name} ${isIdleView(v) ? lastClosedId(v) : v.currentVersion}`.trim()
}

/** `data` with tickets · PRD · version · stage scoped to one line. */
function lineData(data, v) {
  return { ...data, tickets: v.tickets, prd: v.prd, lanes: v.lanes, currentVersion: v.currentVersion, poState: { ...(data.poState || {}), stage: v.stage }, dgId: v.line ? `home-dg-${v.line}` : undefined, listPrefix: v.prefix, allLineTickets: allLineTickets(data) }
}

/** Flattens per-line `{groups, defaultKey}` into one group list: keys prefixed `<line>/` (home line bare), the first group of each line carrying the section head. `defaultKey` = the home line's default. */
function lineSectioned(views, build, { prefixKeys = true } = {}) {
  const out = []
  let defaultKey
  views.forEach((v, i) => {
    const { groups, defaultKey: dk } = build(v)
    const pre = prefixKeys ? v.prefix : ''
    groups.forEach((g, j) => {
      out.push({ ...g, key: `${pre}${g.key}`, crumb: `${lineHead(v)} · ${g.label}`, head: j === 0 ? { label: lineHead(v), stage: v.stage } : undefined })
    })
    if (i === 0) defaultKey = dk === undefined ? undefined : `${pre}${dk}`
  })
  out.defaultKey = defaultKey
  return out
}

/** Every ticket the page lists, all lines (detail entries · anchors · max id). */
function allLineTickets(data) {
  const views = lineViews(data)
  return views.length === 0 ? [data.tickets] : views.map((v) => v.tickets)
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
// T-958: `alwaysButtons` keeps a one-group sidebar clickable (env: one file is
// still a file row, never 「그룹 없음」); a group's `dim` greys its row.
function groupedStore({ sidebarSubLabel, crumbLabel, groups, noGroupUnit = '', defaultKey, topHtml = '', alwaysButtons = false }) {
  const singleGroup = groups.length === 1 && !alwaysButtons
  const defaultIndex = defaultKey === undefined ? 0 : Math.max(0, groups.findIndex((g) => g.key === defaultKey))
  const identity = pageIdentity
  let cardPlaced = false
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
          // T-961: a release line's first group opens that line's section head;
          // `crumb` names the line in the breadcrumb (LINES_SCRIPT). Both are
          // absent on a single-line page, whose markup is unchanged.
          const head = g.head ? `<div class="ls-h"><b>${escapeHtml(g.head.label)}</b><span class="ls-st">${escapeHtml(g.head.stage || '')}</span></div>\n` : ''
          const crumbAttr = g.crumb ? ` data-crumb="${escapeHtml(g.crumb)}"` : ''
          const dim = g.dim ? ' nav-dim' : ''
          // T-1165: the progress card sits right under the home store's 진행 상황 item.
          const card = g.key === 'progress' && !cardPlaced ? ((cardPlaced = true), sidebarCardHtml(identity?.card, g.key)) : ''
          return `${head}<button type="button" class="nav-item nav-item-clickable${dim}${active}" data-group-select="${escapeHtml(g.key)}"${crumbAttr}><span>${escapeHtml(g.label)}</span>${countHtml}</button>${card}`
        })
        .join('\n')
  // T-1165: a store without a 진행 상황 item (every store but home) puts the card under its title.
  const tool = identity ? toolVersionText(identity) : ''
  const sidebar = `<nav class="sidebar">
${identity ? sidebarIdentityHtml(identity) : '<div class="sidebar-title">productune</div>'}
<div class="sidebar-sub">${escapeHtml(sidebarSubLabel)}</div>
${!cardPlaced && !groups.some((g) => g.key === 'progress') ? sidebarCardHtml(identity?.card) : ''}
${sidebarButtons}
${tool ? `<div class="sidebar-foot"><span class="foot-tool" title="${escapeHtml(IDENTITY.toolTitle)}">${escapeHtml(tool)}</span></div>` : ''}
</nav>`

  const panes = groups
    .map((g, i) => `<div class="view-pane${i === defaultIndex ? ' active' : ''}" data-group="${escapeHtml(g.key)}">${g.bodyHtml}</div>`)
    .join('\n')

  const defaultLabel = groups.length > 0 ? (groups[defaultIndex].crumb ?? groups[defaultIndex].label) : ''
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

function discStoreInner(docs, load = null) {
  if (docs.length === 0) {
    const bodyHtml = `<p class="empty-note"><span>${escapeHtml(DISCIPLINE.emptyLine1)}</span><br><span>${escapeHtml(DISCIPLINE.emptyLine2)}</span></p>`
    const groups = [{ key: 'all', label: DISCIPLINE.allLabel, count: 0, bodyHtml }]
    return groupedStore({ sidebarSubLabel: DISCIPLINE.sidebarLabel, crumbLabel: DISCIPLINE.sidebarLabel, groups, noGroupUnit: DISCIPLINE.countUnit })
  }
  const pane = (list) =>
    `<div class="count-line section-meta"><span class="count-badge">${escapeHtml(DISCIPLINE.countLabel)} <b>${list.length}</b>${escapeHtml(DISCIPLINE.countUnit)}</span></div>\n${discRowsTable(list)}`
  const groups = [{ key: 'all', label: DISCIPLINE.allLabel, count: docs.length, bodyHtml: disciplineLoadCard(load) + pane(docs) }]
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

function discSection(docs, load = null) {
  return storeSection('disc', { innerHtml: discStoreInner(docs, load) })
}

// ---------- feature store (T-882: the T-808 feature screen) ----------
// Source: `data.featureTaxonomy` (collect.mjs, read from .prdt/config.json
// features.taxonomy + features.vocab — decision recorded in T-882 outcome).
// Ticket counts, statuses, versions and 근거 티켓 are computed here from the
// tickets themselves (every bucket), never copied from the taxonomy. A link
// written on one side only also shows on the other side, as a name-only
// link (T-808 outcome). No taxonomy → the pre-T-882 spec-file list (T-901 = B);
// no taxonomy and no spec file → the approved empty state.
const TICKET_ID_RE = /\bT-(?:P\d+-|PATCH-)?\d+\b/g

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

/** T-961: the taxonomy-less taxonomy — one area, one entry per distinct `feature:` value of the tickets in `data` (no kind, definition or links). T-1075: plus one per `docs/features/<key>.md` spec, so a spec no ticket carries still lists. */
function derivedFeatureTaxonomy(data) {
  const ticketKeys = allTicketRows(data.tickets).map((r) => (typeof r.fm.feature === 'string' ? r.fm.feature.trim() : ''))
  const specKeys = (data.features || []).map((p) => p.rel.split('/').pop().replace(/\.md$/, ''))
  const keys = [...new Set([...ticketKeys, ...specKeys].filter(Boolean))].sort()
  return {
    areas: [{ key: '_', name: FEATURE.allLabel, def: '' }],
    kinds: [],
    entries: keys.map((key) => ({ key, name: key, kind: '', area: '_', def: '', aliases: [], links: [] })),
  }
}

/** Everything the screen shows per feature, computed once from taxonomy + tickets + spec files. */
export function featureScreenModel(data) {
  let tax = data.featureTaxonomy
  let derived = false
  if (!tax || !tax.areas || tax.areas.length === 0) {
    // T-961: a multi-line project without `features.taxonomy` still lists features — the `feature:` values its tickets carry, one flat group per line.
    if (lineViews(data).length === 0) return null
    tax = derivedFeatureTaxonomy(data)
    derived = true
  }
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
  return { derived, areas: tax.areas, kinds: tax.kinds || [], entries: model, byKey: new Map(model.map((m) => [m.key, m])) }
}

function kindChip(model, kindKey) {
  const k = model.kinds.find((x) => x.key === kindKey)
  return k ? `<span class="kp kp-${escapeHtml(k.key)}">${escapeHtml(k.name)}</span>` : ''
}

function featureRow(model, e) {
  return `<tr class="detail-row" data-area="${escapeHtml(e.area)}" data-detail-kind="feature" data-detail-id="${escapeHtml(`${model.idPrefix || ''}${e.key}`)}" tabindex="0">` +
    `<td><span class="nm">${escapeHtml(e.name || e.key)}</span><span class="nm-key">${escapeHtml(e.key)}</span></td>` +
    (model.derived ? '' : `<td>${kindChip(model, e.kind)}</td><td class="def-col">${escapeHtml(e.def || '')}</td>`) + `<td class="num-col">${e.tickets.length}</td></tr>\n`
}

function featureAreaRows(model, area) {
  const items = model.entries.filter((e) => e.area === area.key)
  if (model.derived) return items.map((e) => featureRow(model, e)).join('')
  return `<tr class="grp-row" data-area="${escapeHtml(area.key)}"><td colspan="4"><span class="grp-name">${escapeHtml(area.name)}</span>` +
    `<span class="grp-n">${items.length}</span><span class="grp-def">${escapeHtml(area.def || '')}</span></td></tr>\n` +
    items.map((e) => featureRow(model, e)).join('')
}

function featurePane(model, areas, count) {
  if (model.derived && count === 0) return `<p class="v-note">${FEATURE.empty}</p>`
  const heads = model.derived ? [FEATURE.tableHeaders[0], FEATURE.tableHeaders[3]] : FEATURE.tableHeaders
  const head = `<tr>${heads.map((h, i) => `<th${i === heads.length - 1 ? ' class="num-col"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr>`
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

/** T-961: one line's feature groups — the home line lists every taxonomy entry, an added line the entries its own tickets carry; counts are that line's tickets. Without a taxonomy (derived model) the home line lists the entries its tickets carry plus every `docs/features/` spec (T-1075: specs are not line-scoped, so they sit on the home line). Null only when featureScreenModel is (single-line, no taxonomy → the spec list). */
function featureLineGroups(data, v) {
  const full = featureScreenModel(lineData(data, v))
  if (!full) return null
  const entries = v.line ? full.entries.filter((e) => e.tickets.length > 0)
    : full.derived ? full.entries.filter((e) => e.tickets.length > 0 || e.spec) : full.entries
  const model = { ...full, entries, idPrefix: v.prefix }
  if (full.derived) return { groups: [{ key: 'all', label: FEATURE.allLabel, count: entries.length, bodyHtml: featurePane(model, model.areas, entries.length) }], defaultKey: undefined, model }
  const groups = [
    { key: 'all', label: FEATURE.allLabel, count: entries.length, bodyHtml: featurePane(model, model.areas, entries.length) },
    ...model.areas.map((a) => {
      const n = entries.filter((e) => e.area === a.key).length
      return { key: a.key, label: a.name, count: n, bodyHtml: featurePane(model, [a], n) }
    }),
  ]
  return { groups, defaultKey: undefined, model }
}

function featureStoreInner(data) {
  const views = lineViews(data)
  if (views.length > 0 && featureScreenModel(data)) {
    const groups = lineSectioned(views, (v) => featureLineGroups(data, v))
    return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups, noGroupUnit: FEATURE.countUnit, defaultKey: groups.defaultKey })
  }
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

/** Detail order (T-808 outcome): definition and 「연관 기능」 first, then the spec body (spec file present) or 근거 티켓. */
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

/** T-964: inline `code` spans in guide text (screen strings · commands stay code-shaped). */
const guideInline = (t) => escapeHtml(t).replace(/`([^`]+)`/g, '<code>$1</code>')

/** T-964: list items under the spec's `## 지금 참인 것` section (all its ### subsections); null when the spec has no such section. */
export function specTruthCount(body) {
  let inSec = false, fence = false, found = false, n = 0
  for (const line of String(body || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const h = /^##\s+(.*?)\s*$/.exec(line)
    if (h) { inSec = h[1] === FEATURE.specTruthHeading; found = found || inSec; continue }
    if (inSec && /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) n++
  }
  return found ? n : null
}

/** T-964: the spec link under 동작 방식 — a fold, collapsed, that opens the spec body in place. */
function featureSpecFold(e, repoRootHref) {
  if (!e.spec) return ''
  const n = specTruthCount(e.spec.body)
  const label = n === null ? FEATURE.specLinkBare : FEATURE.specLink(n)
  return `<details class="fd-spec"><summary class="fd-more">${escapeHtml(label)}</summary><div class="v-body">${md(e.spec.body, path.dirname(e.spec.rel), repoRootHref)}</div></details>`
}

/**
 * T-1049 (T-1055 = A): the surface map over a numbered list. Draws only when some ux item's `at`
 * names a known surface (`viewer.prd`, or a bare `viewer`); an item whose `at` is unknown or absent
 * stays a plain numbered line. `items` = [{html, at}].
 */
function surfaceMapHtml(items) {
  const marks = new Map()  // 'surface.part' or 'surface' -> [item numbers]
  const known = new Set()
  for (const s of FEATURE.surfaces) {
    known.add(s.key)
    for (const [part] of s.parts) known.add(`${s.key}.${part}`)
  }
  items.forEach((it, i) => { if (known.has(it.at)) marks.set(it.at, [...(marks.get(it.at) || []), i + 1]) })
  if (marks.size === 0) return ''
  const badge = (ns) => ns.map((n) => `<span class="fd-bn">${n}</span>`).join('')
  const tiles = FEATURE.surfaces.map((s) => {
    const tileNs = marks.get(s.key) || []
    const anyPart = tileNs.length > 0 || s.parts.some(([part]) => marks.has(`${s.key}.${part}`))
    const parts = s.parts.map(([part, name]) => {
      const ns = marks.get(`${s.key}.${part}`) || []
      return `<div class="fd-sp${ns.length ? ' hit' : ''}">${badge(ns)}${escapeHtml(name)}</div>`
    }).join('')
    return `<div class="fd-stile${anyPart ? ' hit' : ''}"><div class="fd-st">${badge(tileNs)}${escapeHtml(s.name)}</div>${parts}</div>`
  }).join('')
  return `<div class="fd-smap">${tiles}</div>`
}

/** T-964: the guide sections (T-1049: document headings, a surface map under 화면 구성, a flow diagram under 동작 방식), or the new-feature empty notice when the guide has no text. */
function featureGuideHtml(e, anchors, specFold = '') {
  const g = e.guide
  if (!g) return `<p class="fd-empty"><b>${escapeHtml(FEATURE.guideEmptyHead)}</b> <span>${escapeHtml(FEATURE.guideEmptyDetail)}</span></p>${specFold}`
  const sec = (key, body) => `<div class="fd-sec"><h2 class="fd-h">${escapeHtml(FEATURE.guide[key])}</h2>${body}</div>`
  const ul = (items) => `<ul class="fd-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`
  const noScreen = FEATURE.noScreenKinds.includes(e.kind)
  const ux = [...(noScreen && !(g.ux[0]?.text || '').startsWith(FEATURE.noScreen) ? [{ html: escapeHtml(FEATURE.noScreen), at: '' }] : []), ...g.ux.map((u) => ({ html: guideInline(u.text), at: u.at }))]
  const uxBody = () => {
    const map = surfaceMapHtml(ux)
    return map
      ? map + `<ol class="fd-ol">${ux.map((u, i) => `<li><span class="fd-bn">${i + 1}</span><span>${u.html}</span></li>`).join('')}</ol>`
      : ul(ux.map((u) => u.html))
  }
  const flow = g.flow ? `<div class="fd-flow">${mermaidBlock(g.flow)}<details class="fd-mm"><summary>${escapeHtml(FEATURE.flowSource)}</summary><pre class="fd-mm-src">${escapeHtml(g.flow)}</pre></details></div>` : ''
  const out = []
  if (g.when.length) out.push(sec('when', ul(g.when.map(guideInline))))
  if (ux.length) out.push(sec('ux', uxBody()))
  if (g.logic.length) {
    out.push(sec('logic', flow + ul(g.logic.map((l) => guideInline(l.text) + (l.ground.length ? `<span class="cn-g">${ticketIdLinks(escapeHtml(l.ground.join(' · ')), anchors)}</span>` : ''))) + specFold))
  } else if (flow || specFold) out.push(sec('logic', flow + specFold))
  out.push(sec('limits', g.limits.length ? ul(g.limits.map(guideInline)) : `<p class="cn-empty">${escapeHtml(FEATURE.limitsNone)}</p>`))
  if (g.example) out.push(sec('example', `<p class="fd-ex">${guideInline(g.example)}</p>`))
  return out.join('')
}

function featureDetailHtml(model, e, anchors, repoRootHref, readHtml = '') {
  const area = model.areas.find((a) => a.key === e.area)
  const kind = model.kinds.find((k) => k.key === e.kind)
  const lean = model.derived  // T-961: no taxonomy — no kind, area or definition to show
  const field = (label, value) => `<div class="detail-field"><span class="detail-field-label">${escapeHtml(label)}</span><span class="detail-field-value">${value}</span></div>`
  const meta = '<div class="detail-meta">' +
    (lean ? '' : field(FEATURE.fields.kind, kindChip(model, e.kind)) +
    field(FEATURE.fields.area, `<button type="button" class="area-a" data-feature-area="${escapeHtml(e.area)}">${escapeHtml(area.name)}</button>`)) +
    field(FEATURE.fields.tickets, escapeHtml(featureTicketsLabel(e))) +
    (e.versions ? field(FEATURE.fields.version, escapeHtml(e.versions)) : '') +
    (readHtml ? field(FEATURE.fields.read, readHtml) : '') +
    '</div>'
  const kdef = kind ? `<p class="kind-def">${escapeHtml(kind.name)}: ${escapeHtml(kind.def || '')}</p>` : ''
  const items = [
    ...e.links.map((l) => featureLinkItem(model, l.to, l.text || '', l.ground || '', anchors)),
    ...e.rev.map((k) => featureLinkItem(model, k, undefined, undefined, anchors)),
  ]
  // T-1075: lean has no guide, but the spec fold still carries the `docs/features/<key>.md` body.
  const guide = lean ? featureSpecFold(e, repoRootHref) : featureGuideHtml(e, anchors, featureSpecFold(e, repoRootHref))
  const links = lean ? '' : `<h2 class="fd-h">${escapeHtml(FEATURE.linksHeading)}</h2>` +
    (items.length ? `<ul class="cn-list">${items.join('')}</ul>` : `<p class="cn-empty">${escapeHtml(FEATURE.linksEmpty)}</p>`)
  const tail = `<h2 class="fd-h">${escapeHtml(FEATURE.evidenceHeading)}</h2>${e.tickets.length === 0 ? `<p class="cn-empty">${escapeHtml(FEATURE.evidenceEmpty)}</p>` : `<p class="ev-text">${featureEvidence(e, anchors)}</p>`}`
  return `${lean ? '' : `<p class="def-lead">${escapeHtml(e.def || '')}</p>`}${meta}${kdef}<div class="detail-doc body-prose">${guide}${links}${tail}</div>`
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
  // T-961: an added line's rows open that line's own counts (`<line>/<key>`).
  for (const v of lineViews(data).slice(1)) {
    const { model: lm } = featureLineGroups(data, v)
    for (const e of lm.entries) {
      entries[`${v.prefix}${e.key}`] = { title: `${e.name || e.key} · ${e.key}`, name: e.name || e.key, html: featureDetailHtml(lm, e, anchors, repoRootHref, featureReadField(data, e)) }
    }
  }
  return entries
}

function featuresSection(data) {
  return storeSection('feature', { innerHtml: featureStoreInner(data) })
}

/** PRD store: the ONE named content nuance (not a structural deviation — same activity-bar → sidebar-group → main-pane shell as every other store). The "open" group's single, currently-relevant document renders inline directly rather than as a one-row list a reader must click; "closed" behaves exactly like every other store's list→detail. Both strings below ("열린 섹션" / "닫힌 버전") are lifted verbatim from the user-approved mockup (docs/artifacts/v1.10/define-screen-set.html), not new copy. */
function prdOpenBody(prd, repoRootHref, { tickets, currentVersion, idPrefix, line = null }) {
  // T-884: the open PRD is the reading screen (outline · folds · 「결정할 것」 box · What cards).
  // `idPrefix` keeps ids unique when the same body sits in two panes (PRD store and home).
  // T-1104: the PRD's own dir — `docs/prd`, or `docs/<product>/prd` in the product layout.
  const sourceDir = prd.current?.rel ? path.posix.dirname(prd.current.rel) : 'docs/prd'
  const inlineMd = (t) => md(t, sourceDir, repoRootHref, { discipline: true }).replace(/^<p>/, '').replace(/<\/p>\s*$/, '')
  return renderPrdReading({
    body: prd.current.body,
    currentVersion,
    decisionTickets: openDecisionTickets(tickets),
    idPrefix,
    deps: { md: (t) => md(t, sourceDir, repoRootHref, { discipline: true }), inline: inlineMd, esc: escapeHtml, sameVersion, ticketPill: ticketRolePill },
    ...(line ? { line } : {}),
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
  return groupedStore({ sidebarSubLabel: STORE_LABEL.prd, crumbLabel: STORE_LABEL.prd, groups: prdGroups(prd, currentVersion, repoRootHref, tickets) })
}

/**
 * A closed round's relative links were written while the section lived in PRD.md,
 * i.e. against its `prd/` dir (`docs/prd` · `docs/<p>/prd`) — not against
 * `prd/versions/[<line>/]` where the file sits now (T-1104 ③).
 */
function closedRoundBaseDir(rel) {
  const i = rel.indexOf('/versions/')
  return i === -1 ? path.dirname(rel) : rel.slice(0, i)
}

/** T-1108: the approved idle-product body — a head line and one detail line, no open version / PRD section to show. */
function idleNotice(head, detail) {
  // Inline style, not TEMPLATE_CSS: a single-product page stays byte-identical (the feature store's `.fd-empty` rule is scoped to it).
  return `<div class="fd-empty" style="margin:0 0 var(--space-16);font-size:12.5px;line-height:1.65;color:var(--text-secondary);background:var(--bg-surface-on);padding:var(--space-8) var(--space-12);border-radius:var(--radius-4)"><b>${escapeHtml(head)}</b> <span>${escapeHtml(detail)}</span></div>`
}

function prdGroups(prd, currentVersion, repoRootHref, tickets, line = null, name = '', idle = false) {
  const closedRounds = [...prd.closed].sort((a, b) =>
    compareVersionIdsDesc(a.name.replace(/\.md$/, ''), b.name.replace(/\.md$/, '')),
  )
  const openGroup = idle
    ? { key: 'open', label: IDLE.prdSideLabel, bodyHtml: idleNotice(IDLE.prdHead(name), IDLE.prdDetail(closedRounds[0]?.name.replace(/\.md$/, ''))) }
    : { key: 'open', label: `${PRD.openLabelPrefix}${currentVersion}`, count: 1, bodyHtml: prdOpenBody(prd, repoRootHref, { tickets, currentVersion, idPrefix: line ? `prd-${line}` : 'prd', line }) }
  const groups = [
    openGroup,
    ...closedRounds.map((c) => {
      const id = c.name.replace(/\.md$/, '')
      return { key: id, label: id, bodyHtml: `<div class="v-body">${md(c.body, closedRoundBaseDir(c.rel), repoRootHref, { discipline: true })}</div>` }
    }),
  ]
  return groups
}

function prdSection(prd, currentVersion, repoRootHref, tickets, views = []) {
  if (views.length > 0) {
    const groups = lineSectioned(views, (v) => ({ groups: prdGroups(v.prd, v.currentVersion, repoRootHref, v.tickets, v.line, v.name, isIdleView(v)) }))
    return storeSection('prd', { innerHtml: groupedStore({ sidebarSubLabel: STORE_LABEL.prd, crumbLabel: STORE_LABEL.prd, groups }) })
  }
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
  let html = `<div class="table-wrap"><table class="sortable">${sortableThead(ARTIFACT.tableHeaders, ['text', 'text', 'text', 'text', 'text', 'num', 'text'], 6)}<tbody>\n`
  for (const e of sortNewestFirst(entries, (x) => x.fields.added_at, (x) => x.fields.ticket)) {
    const f = e.fields
    const id = `${f.bucket}/${f.path}`
    html += `<tr class="detail-row" data-detail-kind="artifact" data-detail-id="${escapeHtml(id)}" data-tie="${ticketNum(f.ticket)}">`
    html += sortTd(f.path, escapeHtml(f.path), 'id-col')
    html += sortTd(f.kind || '', escapeHtml(f.kind || ''))
    html += sortTd(artifactStatusText(f.status), `<span class="pill pill-status-${artifactStatusPillClass(f.status)}">${escapeHtml(artifactStatusText(f.status))}</span>`)
    html += sortTd(f.ticket || '', escapeHtml(f.ticket || ''))
    html += sortTd(f.lang || '', escapeHtml(f.lang || ''))
    html += sortTd(e.bytes === undefined ? '' : e.bytes, e.bytes === undefined ? '' : escapeHtml(fmtBytes(e.bytes)), 'num-col')
    html += sortTd(f.added_at || '', escapeHtml(f.added_at || ''), 'num-col')
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
      // T-1010: an .html artifact whose file existed at generation time is shown in the panel (iframe).
      frame: !e.inlined && e.bytes !== undefined && !e.unreadable && /\.html?$/i.test(f.path) ? true : undefined,
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
  // T-1104: keyed by the real path (To-Be in the product layout) = the CLI's viewer_anchor.
  put(data.prd?.current?.rel || 'docs/prd/PRD.md', { s: 'home', g: 'prd' })
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
  // T-961: an added release line's items, under its `<line>/` group keys.
  for (const v of lineViews(data).slice(1)) {
    for (const t of currentVersionTickets(v.tickets, v.currentVersion)) {
      const id = t.frontmatter.id || t.rel
      put(id, { s: 'home', g: `${v.prefix}ticket`, k: 'ticket', i: id })
    }
    const key = `${v.prefix}${currentTicketBucketKey(v.tickets, v.currentVersion)}`
    for (const t of v.tickets.included) {
      const id = t.frontmatter.id || t.rel
      put(id, { s: 'ticket', g: t.bucket === 'backlog' ? `${v.prefix}backlog` : key, k: 'ticket', i: id })
    }
    for (const b of v.tickets.omitted) {
      for (const t of b.tickets) {
        const id = t.frontmatter.id || t.rel
        put(id, { s: 'ticket', g: `${v.prefix}${b.bucket}`, k: 'ticket', i: id })
      }
    }
    for (const c of v.prd.closed) put(c.rel, { s: 'prd', g: `${v.prefix}${c.name.replace(/\.md$/, '')}` })
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
  for (const set of allLineTickets(data)) {
    for (const t of set.included) see(t.frontmatter.id)
    for (const b of set.omitted) for (const t of b.tickets) see(t.frontmatter.id)
  }
  return max
}

const INFO_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'

/** docs/design.md §8.4 Banner (no side stripe, T-756) — hidden until the page is opened at an `#id` it cannot show; the script fills in the id and the text. */
const HASH_NOTICE_HTML = `<div class="notice" id="hash-notice" role="status" hidden>
<span class="notice-icon">${INFO_ICON_SVG}</span>
<span class="notice-body"><b class="js-notice-id"></b>: <span class="js-notice-text"></span></span>
<button type="button" class="notice-close" aria-label="${COMMON.close}">${svgIcon(CLOSE_ICON_PATH, 13)}</button>
</div>
`

/** T-961: the manifest entries of one line — an added line's buckets are `<line>/<version>`, the home line's every other bucket. */
function lineArtifactEntries(artifacts, v, views) {
  const added = views.filter((x) => x.line).map((x) => x.prefix)
  return artifacts.entries.filter((e) => {
    const b = String(e.fields.bucket || '')
    return v.line ? b.startsWith(v.prefix) : !added.some((p) => b.startsWith(p))
  })
}

function artifactLineGroups(artifacts, v, views) {
  const entries = lineArtifactEntries(artifacts, v, views)
  const cur = `${v.prefix}${v.currentVersion}`
  if (entries.length === 0) {
    return { groups: [{ key: cur, label: cur, count: 0, bodyHtml: countBadge(`${cur}${ARTIFACT.bucketSuffix}`, 0, ARTIFACT.countUnit) + artifactRowsTable([]) }] }
  }
  const byBucket = new Map()
  for (const e of entries) {
    if (!byBucket.has(e.fields.bucket)) byBucket.set(e.fields.bucket, [])
    byBucket.get(e.fields.bucket).push(e)
  }
  const keys = [...byBucket.keys()]
  const first = keys.includes(cur) ? cur : keys[0]
  const groups = [first, ...keys.filter((k) => k !== first)].map((key) => {
    const items = byBucket.get(key)
    return { key, label: key, count: items.length, bodyHtml: countBadge(`${key}${ARTIFACT.bucketSuffix}`, items.length, ARTIFACT.countUnit) + artifactRowsTable(items) }
  })
  return { groups }
}

function artifactsSection(artifacts, currentVersion, views = []) {
  if (views.length > 0) {
    // Bucket keys already carry the line (`<line>/<version>`), so the group
    // key stays the bucket — the anchor table's `g: bucket` still resolves.
    const groups = lineSectioned(views, (v) => artifactLineGroups(artifacts, v, views), { prefixKeys: false })
    return storeSection('artifact', { innerHtml: groupedStore({ sidebarSubLabel: STORE_LABEL.artifact, crumbLabel: STORE_LABEL.artifact, groups, noGroupUnit: ARTIFACT.countUnit }) })
  }
  return storeSection('artifact', { innerHtml: artifactStoreInner(artifacts, currentVersion) })
}

// ---------- env store (T-958, T-956 = A) ----------
// Screen set docs/artifacts/v1.13/define-screen-set.html #screen-env: sidebar
// = each line's env files (`<line> <version>` sections; none on a single-line
// project), main = key names + 설정됨 / 비어 있음. Read-only: no value, no
// length, no edit or copy control. data.env / line.env carry names and one
// boolean per key only (env-status.mjs) — there is no value here to render.
function envOfView(data, v) {
  if (!v.line) return data.env
  const l = (data.lines || []).find((x) => x.name === v.line)
  return l ? l.env : null
}

/** T-1191: what a file card's open links need besides the file — project root, line, VS Code found. */
function envWhere(data, line) {
  return data.projectRoot ? { root: data.projectRoot, line: line || null, vscode: !!(data.editors && data.editors.vscode) } : null
}

function envPill(set) {
  return `<span class="est ${set ? 'on' : 'off'}">${set ? ENV.set : ENV.unset}</span>`
}

function envSetCount(f) {
  return f.keys.filter((k) => k.set).length
}

/** T-1191: a file card's open controls. The prdt link carries the project root, the line and the
 *  file NAME only — the URL handler (packages/core/scripts/prdt_open_url.py) rebuilds the path from
 *  that project's own config, so a link can name nothing but an env file in a code folder. */
function envActions(f, where) {
  if (!where || !where.root || !where.absDir) return ''
  const q = [`root=${encodeURIComponent(where.root)}`, ...(where.line ? [`line=${encodeURIComponent(where.line)}`] : []), `file=${encodeURIComponent(f.name)}`].join('&')
  const abs = `${where.absDir}/${f.name}`
  const vscode = where.vscode ? `<a class="env-act" href="${escapeHtml(`vscode://file${abs.split('/').map(encodeURIComponent).join('/')}`)}">${ENV.openVsCode}</a>` : ''
  return `<div class="env-acts"><a class="env-act" href="${escapeHtml(`prdt://open-env?${q}`)}">${ENV.openEditor}</a>${vscode}` +
    `<button type="button" class="env-act" data-env-copy="${escapeHtml(abs)}" data-label-done="${ENV.copied}">${ENV.copyPath}</button></div>`
}

function envFileBody(f, dir, where) {
  const set = envSetCount(f)
  // A sample file counts no set / empty (every key reads empty by design): names only.
  const tags = (k) => (k.codeWins ? `<span class="tagw">${ENV.codeWins}</span>` : '') + (k.plain ? `<span class="tagw">${ENV.plainValue}</span>` : '')
  const rows = f.keys.map((k) => `<div class="erow">${tags(k) ? `<span><code>${escapeHtml(k.name)}</code>${tags(k)}</span>` : `<code>${escapeHtml(k.name)}</code>`}${f.sample ? '' : envPill(k.set)}</div>`).join('')
  const sampleWhere = f.sample ? ENV.sampleKeys(f.keys.length) : dir || ''
  const counts = f.sample ? '' : `<span class="env-c">${envPill(true)} ${set} ${envPill(false)} ${f.keys.length - set}</span>`
  // T-1191 (T-1047 eye toggle removed): key names are shown by default — the page holds no value to hide.
  return `<div class="dash-card env-card"><div class="env-h"><b>${escapeHtml(f.name)}</b><span class="env-dir">${escapeHtml(sampleWhere)}</span>` +
    `${counts}</div>` +
    `<p class="env-note">${f.sample ? ENV.sampleNote : ENV.note}</p>${envActions(f, where)}<div class="erows">${rows}</div></div>`
}

/** One current-version sidebar group per view: env = the last item (after 결정), its count = env file count (samples included). */
function envGroup(env, emptyHead, machine, where) {
  const machineHtml = machineEnvBody(machine)
  if (!env || env.files.length === 0) {
    const body = `<div class="env-nofile"><b>${escapeHtml(emptyHead)}</b><span>${escapeHtml(ENV.emptyDetail((env && env.dir) || '—'))}</span></div>`
    return { key: 'env', label: STORE_LABEL.env, count: 0, bodyHtml: body + machineHtml }
  }
  return { key: 'env', label: STORE_LABEL.env, count: env.files.length, bodyHtml: env.files.map((f) => envFileBody(f, env.dir, where && { ...where, absDir: env.absDir })).join('\n') + machineHtml }
}

/** T-1109: the machine-scope section (~/.prdt/env/.env) — names, 설정됨 / 비어 있음, 제품 코드 값이 우선; none stored → the empty card. Absent `machine` (a single-file render) → nothing. */
function machineEnvBody(machine) {
  if (!machine) return ''
  const head = `<div class="env-scope">${ENV.machineScope}</div>`
  if (machine.keys.length === 0) {
    return `${head}<div class="env-nofile"><b>${ENV.machineEmptyHead}</b><span>${escapeHtml(ENV.machineEmptyDetail)}</span></div>`
  }
  return head + envFileBody({ name: '.env', sample: false, keys: machine.keys }, machine.dir)
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
    return `<span class="sb-lab${cur ? ' sb-lab-cur' : ''}">${seg.stage}${cur ? `<span class="sb-here">${HOME.here}</span>` : ''} <span class="sb-n">${HOME.stageTickets(seg.tickets.length)}</span></span>`
  }
  const cells = segs
    .map((seg, i) => {
      const cls = `sb-seg${seg.stage === stage ? ' sb-seg-cur' : ''}${seg.tickets.length === 0 ? ' sb-seg-empty' : ''}`
      const lab = labelOf(seg)
      return `<div class="${cls}"><div class="sb-up">${i % 2 === 0 ? lab : ''}</div><div class="sb-sq">${seg.tickets.map(stageSquare).join('')}</div><div class="sb-dn">${i % 2 === 1 ? lab : ''}</div></div>`
    })
    .join('')
  return `<div class="sb"><span class="sb-tick" aria-hidden="true"></span>${cells}<span class="sb-total">${HOME.stageDone(done, total)}</span></div>`
}

function ticketButtonAttrs(id) {
  return `data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}" role="button" tabindex="0"`
}

/**
 * T-1180: a scope row's name — the heading label up to its colon (a colon between digits is a clock time, never a
 * split: 「05:20 …」), minus the trailing ticket refs `(T-…)` the PRD appends. Never shortened further; the full heading stays the tooltip.
 */
export function scopeItemName(label) {
  const plain = String(label).replace(/`/g, '')
  const m = /(?<!\d)[:：]|[:：](?!\d)/.exec(plain)
  const head = (m ? plain.slice(0, m.index) : plain).trim()
  const name = head.replace(/(?:\s*\(T-[^)]*\))+\s*$/, '').trim()
  return name || head || plain.trim()
}

/** 스코프: one row per PRD item of the open section (label up to its colon; the full heading is the tooltip), then the 「PRD 항목 밖 티켓」 block (work tickets only; T-1046). */
function homeScope(data, currentTickets) {
  const openItems = data.prd.openItems || []
  const byItem = new Map(openItems.map((i) => [i.key, []]))
  const outOfScope = []
  // T-1046: a malformed `prd_item` (no `<version>#<key>` shape) is named in the definition line; decision tickets (T-1051 = A) are only counted for the note.
  let malformed = 0
  let decisions = 0
  const fixCount = new Map()
  for (const t of currentTickets) {
    if (t.frontmatter.status !== 'open' && t.frontmatter.status !== 'done') continue
    const raw = typeof t.frontmatter.prd_item === 'string' ? t.frontmatter.prd_item : ''
    const key = prdItemKey(raw, data.currentVersion)
    if (key && byItem.has(key)) byItem.get(key).push(t)
    else if (!raw.includes('#') && byItem.has(raw)) {
      // A bare key that is exactly an open-section key: counted under that item, flagged 「형식 고치기」 (doctor keeps warning).
      byItem.get(raw).push(t)
      fixCount.set(raw, (fixCount.get(raw) || 0) + 1)
    } else {
      // Decision tickets record user choices, not scope work — never counted outside the items.
      if (t.frontmatter.type === 'decision') { decisions += 1; continue }
      outOfScope.push(t)
      if (raw !== '' && !/^[^#]+#[^#]+$/.test(raw)) malformed += 1
    }
  }
  const row = (label, title, tickets, extra = '', fix = 0) => {
    const sorted = [...tickets.filter((t) => t.frontmatter.status === 'done'), ...tickets.filter((t) => t.frontmatter.status !== 'done')]
      .sort((x, y) => (x.frontmatter.status === 'done' ? 0 : 1) - (y.frontmatter.status === 'done' ? 0 : 1) || compareTicketIds(x.frontmatter.id, y.frontmatter.id))
    const done = tickets.filter((t) => t.frontmatter.status === 'done').length
    const sq = sorted
      .map((t) => `<span class="stage-sq sc-btn${t.frontmatter.status === 'done' ? ' sq-done' : ''}" ${ticketButtonAttrs(t.frontmatter.id)} aria-label="${escapeHtml(t.frontmatter.id)}" title="${escapeHtml(t.frontmatter.id)}"></span>`)
      .join('')
    const fixTag = fix > 0 ? `<span class="sc-fix" title="${escapeHtml(HOME.scopeFixTitle)}">${escapeHtml(HOME.scopeFixTag(fix))}</span>` : ''
    return `<div class="sc-row${extra}"><span class="sc-lab" title="${escapeHtml(title)}">${escapeHtml(label)}</span><span class="sc-sq">${sq}${fixTag}</span><span class="mono sc-n">${done}/${tickets.length}</span></div>`
  }
  const items = openItems.map((i) => ({ key: i.key, tickets: byItem.get(i.key), html: row(scopeItemName(i.label), i.label.replace(/`/g, ''), byItem.get(i.key), '', fixCount.get(i.key) || 0) }))
  // T-1180: under their 합격선 lane (the one lane computation: prdt_lanes) — an item goes to the lane holding most of its tickets, ties to the earlier lane.
  // T-1184: prdt_lanes now returns the 자투리 lane too (last), so it counts like any lane; an item no lane reaches stays lane-less.
  const lanes = Array.isArray(data.lanes) ? data.lanes : []
  const groups = lanes.map((l) => ({ head: HOME.scopeLane(l.name), count: l.linked ? `${l.done}/${l.total}` : '', rows: [] }))
  const loose = []
  for (const it of items) {
    const ids = it.tickets.map((t) => t.frontmatter.id)
    let best = -1
    let bestN = 0
    lanes.forEach((l, i) => {
      const n = ids.filter((id) => l.tickets.includes(id)).length
      if (n > bestN) { best = i; bestN = n }
    })
    if (best >= 0) groups[best].rows.push(it.html)
    else loose.push(it.html)
  }
  if (loose.length > 0 && groups.length > 0) groups.push({ head: HOME.scopeNoLane, count: '', rows: loose })
  const grouped = groups.length > 0 ? groups.filter((g) => g.rows.length > 0 || g.head !== HOME.scopeNoLane) : []
  const bodyRows = grouped.length > 0
    ? grouped.map((g) => `<div class="sc-grp">${escapeHtml(g.head)}${g.count ? ` <span class="mono sc-n">${escapeHtml(g.count)}</span>` : ''}</div>${g.rows.join('')}`).join('')
    : items.map((it) => it.html).join('')
  // T-1046: its own block under a divider; the row never disappears (0 shows 「없음」).
  const listKey = `${data.listPrefix || ''}${currentTicketBucketKey(data.tickets, data.currentVersion)}`
  const link = (text, store, key) => `<button type="button" class="sc-why-link" data-open-store="${store}" data-open-group="${escapeHtml(key)}">${escapeHtml(text)}</button>`
  const outRow = outOfScope.length > 0
    ? row(PROGRESS_OUT_OF_SCOPE_LABEL, PROGRESS_OUT_OF_SCOPE_LABEL, outOfScope, ' sc-out')
    : `<div class="sc-row sc-out"><span class="sc-lab">${escapeHtml(PROGRESS_OUT_OF_SCOPE_LABEL)}</span><span class="sc-sq"><span class="cp-empty">${escapeHtml(HOME.scopeOutEmpty)}</span></span><span class="mono sc-n">0</span></div>`
  // T-1180: one line — why outside · decisions left out · links.
  const whyParts = []
  if (outOfScope.length > 0) whyParts.push(`${escapeHtml(HOME.scopeOutDef)}${malformed > 0 ? ` ${link(HOME.scopeMalformed(malformed), 'ticket', listKey)}` : ''}`)
  if (decisions > 0) whyParts.push(`${escapeHtml(HOME.scopeDecisionNote(decisions))} · ${link(HOME.scopeDecisionLink, 'home', `${data.listPrefix || ''}decision`)}`)
  const whyHtml = whyParts.length > 0 ? `<p class="sc-why">${whyParts.join(' · ')}</p>` : ''
  const ruleHtml = grouped.length > 0 ? `<p class="sc-why">${escapeHtml(HOME.scopeLaneRule)}</p>` : ''
  return `<div><div class="cp-h">${HOME.scope} <span class="cp-sub">${HOME.scopeSub(openItems.length)}</span></div><div class="sc-rows">${bodyRows}<div class="sc-sep"></div>${outRow}</div>${ruleHtml}${whyHtml}</div>`
}

/** dec · req wait lists of `data.tickets`; the sidebar card (T-1165) and Home's wait block share this one call. */
function homeWaitLists(data) {
  // T-961: a blocking dep may be an open ticket in another line's folder — blockers are read across every line.
  const all = (data.allLineTickets || allLineTickets(data)).flatMap(allTicketRows)
  return waitLists(allTicketRows(data.tickets), all)
}

function homeWaits(data) {
  const { dec, req } = homeWaitLists(data)
  const block = (label, list, empty) =>
    `<div><div class="cp-h">${label} <span class="mono cp-n">${list.length}</span></div>` +
    (list.length === 0
      ? `<p class="cp-empty">${empty}</p>`
      : `<div class="cp-wlist">${list
          .map((fm) => `<button type="button" class="cp-went" data-detail-kind="ticket" data-detail-id="${escapeHtml(fm.id)}"><span class="mono cp-wid">${escapeHtml(fm.id)}</span><span class="cp-wslug">${escapeHtml(fm.slug || '')}</span>${ticketRolePill(fm.assignee)}</button>`)
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
function dependencyDiagram(graph, layout, DG_ID = 'home-dg') {
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
  const dgId = data.dgId || DG_ID
  const graph = buildHomeGraph({ tickets: currentTickets, gatePath: data.prd.gatePathAlt ? [data.prd.gatePath, data.prd.gatePathAlt] : data.prd.gatePath || '' })
  const drawable = graph.connected && graph.spine.size > 0
  const stage = data.poState?.stage
  const sub = !graph.connected && stage === 'define' && graph.nodes.length > 0 ? ` <span class="cp-sub">${HOME.beforeBuild}</span>` : ''
  const head = `<div class="cp-h">${HOME.dependency}${sub}</div>`
  const notice = graph.connected || graph.nodes.length === 0 ? '' : `<div class="cp-spine-none">${stage === 'define' ? HOME.notConnected : HOME.notConnectedBuilt}</div>`
  if (graph.nodes.length === 0) return `<div class="cp-block">${head}${notice}<p class="cp-empty">${HOME.dependencyEmpty}</p></div>`
  void drawable
  return `<div class="cp-block">${head}${notice}${dependencyDiagram(graph, layoutHomeGraph(graph), dgId)}</div>`
}

function homeProgressBody(data) {
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  return `<div class="dash-card">
<div class="dash-card-title">${svgIcon(STORE_ICON_PATHS.home, 14)} <span>${HOME.working}</span></div>
${homeStageBar(currentTickets, data.poState?.stage || '?')}
<div class="sc sc-grid">${homeWaits(data)}${homeScope(data, currentTickets)}</div>
${homeDependency(data, currentTickets)}
</div>`
}

/** T-961: one line's Home groups — the single-line blocks scoped to that line's tickets, PRD section, artifact bucket and decision pages. */
function homeLineGroups(data, v, views, repoRootHref) {
  const ld = lineData(data, v)
  const currentTickets = currentVersionTickets(v.tickets, v.currentVersion)
  const idle = isIdleView(v)
  const cur = `${v.prefix}${idle ? idleVersion(v) : v.currentVersion}`
  const currentArtifacts = lineArtifactEntries(data.artifacts, v, views).filter((e) => e.fields.bucket === cur)
  const currentDecisions = lineDecisionPages(data.wiki, v)
  const decisionTickets = decisionTicketsOf(idle ? homeTickets_(v) : currentTickets)
  const idleHomeHtml = idle ? idleNotice(IDLE.homeHead(v.name), IDLE.homeDetail(v.tickets.included.filter((t) => t.bucket === 'backlog').length)) : ''
  // T-1108: an idle product has no open version, so its ticket pane lists every ticket it has (backlog + closed rounds).
  const homeTickets = idle ? [...v.tickets.included, ...v.tickets.omitted.flatMap((o) => o.tickets.map((t) => ({ bucket: o.bucket, ...t })))] : currentTickets
  const groups = [
    { key: 'progress', label: HOME.working, bodyHtml: idle ? idleHomeHtml : `<div class="dash-grid">${homeProgressBody(ld)}</div>` },
    { key: 'artifact', label: STORE_LABEL.artifact, count: currentArtifacts.length, bodyHtml: artifactRowsTable(currentArtifacts) },
    { key: 'prd', label: STORE_LABEL.prd, count: idle ? lastClosedId(v) : v.currentVersion, bodyHtml: idle ? idleNotice(IDLE.prdHead(v.name), IDLE.prdDetail()) : prdOpenBody(v.prd, repoRootHref, { tickets: v.tickets, currentVersion: v.currentVersion, idPrefix: v.line ? `home-prd-${v.line}` : 'home-prd', line: v.line }) },
    { key: 'ticket', label: STORE_LABEL.ticket, count: homeTickets.length, bodyHtml: ticketRowsTable(homeTickets) },
    { key: 'decision', label: HOME.decision, count: decisionTickets.length + currentDecisions.length, bodyHtml: decisionRowsTable(decisionTickets, currentDecisions) },
    envGroup(envOfView(data, v), ENV.emptyHead, v.line ? null : data.machineEnv, envWhere(data, v.line)),
  ]
  return { groups, defaultKey: 'progress' }
}

/** T-1138: an idle product's decision tickets = those of the version its decision pages use (`idleVersion`). */
function homeTickets_(v) {
  const version = idleVersion(v)
  return [...v.tickets.included, ...v.tickets.omitted.flatMap((o) => o.tickets.map((t) => ({ bucket: o.bucket, ...t })))].filter((t) => t.bucket !== 'backlog' && sameVersion(t.bucket, version))
}

/** A decision page's `version:` is `<line>/<v>` for an added line, bare for the home line (release-lines.md one-line rule). */
function lineDecisionPages(pages, v) {
  const version = isIdleView(v) ? idleVersion(v) : v.currentVersion
  return pages.filter((p) => {
    if (!p.rel.split('/').pop().startsWith('decision--') || !p.frontmatter.version) return false
    const raw = String(p.frontmatter.version)
    const slash = raw.indexOf('/')
    const line = slash === -1 ? null : raw.slice(0, slash)
    return line === v.line && sameVersion(slash === -1 ? raw : raw.slice(slash + 1), version)
  })
}

function homeSection(data, repoRootHref) {
  const views = lineViews(data)
  if (views.length > 0) {
    const groups = lineSectioned(views, (v) => homeLineGroups(data, v, views, repoRootHref))
    return storeSection('home', { active: true, innerHtml: groupedStore({ sidebarSubLabel: STORE_LABEL.home, crumbLabel: STORE_LABEL.home, groups, defaultKey: groups.defaultKey, topHtml: HASH_NOTICE_HTML }) })
  }
  const currentTickets = currentVersionTickets(data.tickets, data.currentVersion)
  // T-713 scope note: `e.fields.bucket` matching stays literal (never
  // `sameVersion`) — an artifact-manifest bucket spelled differently from
  // po-state's version string is a latent bug class out of this scope.
  const currentArtifacts = currentArtifactEntries(data.artifacts, data.currentVersion)
  const currentDecisions = currentDecisionPages(data.wiki, data.currentVersion)
  const decisionTickets = decisionTicketsOf(currentTickets)
  const groups = [
    { key: 'progress', label: HOME.working, bodyHtml: `<div class="dash-grid">${homeProgressBody(data)}</div>` },
    { key: 'artifact', label: STORE_LABEL.artifact, count: currentArtifacts.length, bodyHtml: artifactRowsTable(currentArtifacts) },
    { key: 'prd', label: STORE_LABEL.prd, count: data.currentVersion, bodyHtml: prdOpenBody(data.prd, repoRootHref, { tickets: data.tickets, currentVersion: data.currentVersion, idPrefix: 'home-prd' }) },
    { key: 'ticket', label: STORE_LABEL.ticket, count: currentTickets.length, bodyHtml: ticketRowsTable(currentTickets) },
    { key: 'decision', label: HOME.decision, count: decisionTickets.length + currentDecisions.length, bodyHtml: decisionRowsTable(decisionTickets, currentDecisions) },
    envGroup(data.env, ENV.homeNone, data.machineEnv, envWhere(data, null)),
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
/* T-1165 (mock viewer-identity-progress.html, existing tokens only): identity line top-left, progress card, tool version bottom-left. */
.sidebar { display: flex; flex-direction: column; padding-bottom: 0; }
.sidebar > * { flex-shrink: 0; }
.sidebar-id { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-6); margin: 0 0 var(--space-4); }
.sidebar-id b { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.sidebar-id .sid-sep, .sidebar-id .sid-v { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.sidebar-id .sid-st { font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--text-primary); }
.sidebar-foot { display: flex; align-items: flex-end; position: sticky; bottom: 0; margin: auto calc(-1 * var(--space-12)) 0; padding: var(--space-8) var(--space-12) var(--space-16); background: var(--bg-surface-on); border-top: 1px solid var(--border-item); }
.foot-tool { height: 28px; display: flex; align-items: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.rail-tool { display: none; }
.sp { cursor: pointer; display: grid; gap: var(--space-6); margin: var(--space-8) 0 var(--space-12); padding: var(--space-10) var(--space-12); border: 1px solid var(--border-item); border-radius: var(--radius-8); background: var(--bg-surface-base); }
.sp:hover { border-color: var(--border-hover); }
.sp:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.sp-top { display: flex; align-items: baseline; gap: var(--space-8); font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.sp-stage { font-family: var(--font-family); font-size: 10.5px; font-weight: 600; color: var(--text-info); background: var(--health-info-subtle); border: 1px solid var(--health-info); border-radius: var(--radius-4); padding: 1px 6px; }
.sp-count { display: flex; align-items: baseline; gap: var(--space-6); font-family: var(--font-mono); color: var(--text-primary); }
.sp-count small { font-family: var(--font-family); font-size: 11px; color: var(--text-secondary); }
.sp-count b { font-size: 17px; font-weight: 600; }
.sp-of { font-size: 12px; color: var(--text-tertiary); }
.sp-bar { height: 5px; border-radius: var(--radius-100); background: var(--bg-interaction-neutral); overflow: hidden; }
.sp-bar i { display: block; height: 100%; background: var(--accent); border-radius: var(--radius-100); }
.sp-wait { display: flex; gap: var(--space-6); font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.sp-wait b { font-weight: 600; color: var(--text-secondary); }
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
/* T-961: with the waits column on screen (Home 「진행」 pane), the detail panel stops short of it: width = the main column minus (frame padding + card inset ~56, waits column 280, a ~24px gap), never under 520px; below that width it overlays the waits column (the panel needs room to read) and the user closes it to see the waits. */
.store-section[data-store="home"]:has(.view-pane.active .sc-waits) .detail-panel { width: min(820px, 92%, max(520px, calc(100% - 360px))); }
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
.detail-field-open a { color: var(--accent); font-weight: 500; }
.detail-doc { font-size: 13.5px; }
.detail-doc :first-child { margin-top: 0; }
.detail-doc a, .v-body a { color: var(--accent); }
.detail-frame-view { display: block; width: 100%; height: 70vh; border: 1px solid var(--border-item); color-scheme: light; background: Canvas; }

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
.sc-grid { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: var(--space-24); }
.sc-rows { display: grid; grid-template-columns: fit-content(calc(100% - 140px)) minmax(72px, 1fr) auto; column-gap: var(--space-10); align-items: center; }
.sc-row { display: contents; }
.sc-lab { font-size: 12px; color: var(--text-secondary); padding: 3px 0; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
.sc-sq, .sc-n { padding: 3px 0; }
.sc-grp { grid-column: 1 / -1; font-size: 11px; font-weight: 600; color: var(--text-tertiary); word-break: keep-all; overflow-wrap: break-word; margin: var(--space-10) 0 1px; }
.sc-grp:first-child { margin-top: 0; }
.sc-sep { grid-column: 1 / -1; border-top: 1px dashed var(--border-item); margin: var(--space-10) 0 var(--space-4); }
.sc-out .sc-lab { color: var(--text-primary); font-weight: 600; }
.sc-sq { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; min-width: 0; }
.sc-n { font-size: 10.5px; color: var(--text-tertiary); }
.sc-btn { cursor: pointer; }
.sc-btn.is-open { outline: 2px solid var(--text-primary); outline-offset: 1px; }
.sc-waits { min-width: 0; display: flex; flex-direction: column; gap: var(--space-16); border-right: 1px solid var(--border-item); padding-right: var(--space-24); }
.cp-block { border-top: 1px solid var(--border-item); margin: var(--space-16) 0 0; padding: var(--space-16) 0 0; }
.cp-h { font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-10); display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap; }
.cp-sub { font-weight: 400; color: var(--text-tertiary); font-size: 11.5px; }
.cp-n { font-size: 10.5px; color: var(--text-quaternary); font-weight: 400; }
.sc-fix { font-size: 10.5px; color: var(--text-tertiary); border: 1px dashed var(--border-item); border-radius: 8px; padding: 0 6px; margin-left: var(--space-4); }
.sc-why { font-size: 11.5px; color: var(--text-tertiary); word-break: keep-all; overflow-wrap: break-word; margin: var(--space-8) 0 0; }
.sc-why-link { font: inherit; color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
.cp-empty { font-size: 11.5px; color: var(--text-tertiary); margin: var(--space-4) 0 0; }
.cp-wlist { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.cp-went { font: inherit; font-size: 12px; text-align: left; display: inline-flex; align-items: center; gap: 6px; background: var(--bg-surface-base); color: var(--text-primary); border: 1px solid var(--border-inline); border-radius: var(--radius-8); padding: 4px 8px; cursor: pointer; }
.cp-went { max-width: 100%; }
.cp-went .cp-wid { flex: none; white-space: nowrap; }
.cp-went .cp-wslug { min-width: 0; overflow-wrap: anywhere; }
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
.sortable th, .sortable td { padding-left: var(--space-6); padding-right: var(--space-6); }
.sortable td { overflow-wrap: anywhere; }
.sortable td.num-col { white-space: nowrap; overflow-wrap: normal; }
.sort-btn { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; }
.sort-btn:hover { color: var(--text-secondary); }
.sort-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sort-ind::after { content: '\\21C5'; opacity: 0.5; }
th[aria-sort="ascending"] .sort-ind::after { content: '\\25B2'; opacity: 1; }
th[aria-sort="descending"] .sort-ind::after { content: '\\25BC'; opacity: 1; }
th[aria-sort="ascending"], th[aria-sort="descending"] { color: var(--text-secondary); }
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
/* ---------- T-998 decision options as cards (T-999 = C; no accent stripe — the 권고 chip alone marks the recommendation) ---------- */
.opt-cards { display: flex; flex-direction: column; gap: var(--space-12); margin: var(--space-8) 0; }
.opt-card { background: var(--bg-surface-base); border: 1px solid var(--border-inline); border-radius: var(--radius-8); padding: var(--space-12) var(--space-16); }
.opt-card.is-chosen { border: 2px solid var(--status-done); background: color-mix(in srgb, var(--status-done) 6%, var(--bg-surface-base)); }
.opt-card.is-dim { background: transparent; border-style: dashed; }
.opt-card.is-dim .opt-h h4 { color: var(--text-tertiary); }
.opt-card.is-dim .opt-letter { background: transparent; color: var(--text-tertiary); border: 1px solid var(--border-inline); }
.opt-h { display: flex; align-items: center; gap: var(--space-10); margin-bottom: var(--space-10); }
.opt-h h4 { margin: 0; font-size: 14px; font-weight: 700; flex: 1; min-width: 0; }
.opt-letter { flex: 0 0 auto; width: 24px; height: 24px; border-radius: var(--radius-4); background: var(--text-primary); color: var(--bg-surface-base); font-size: 13px; font-weight: 700; line-height: 24px; text-align: center; }
.opt-marks { display: flex; gap: var(--space-6); }
.opt-mk { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: var(--radius-100); white-space: nowrap; }
.opt-mk-rec { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); border: 1px solid var(--accent); }
.opt-mk-chosen { background: color-mix(in srgb, var(--status-done) 14%, transparent); color: var(--status-done); border: 1px solid var(--status-done); }
.opt-lab { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: var(--space-4); }
pre.opt-sk { margin: 0; padding: var(--space-10) var(--space-12); background: var(--bg-base); border-radius: var(--radius-4); font-family: var(--font-mono); font-size: 12.5px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); }
.opt-ex-text { font-size: 13px; }
.opt-facts { display: grid; grid-template-columns: minmax(40px, max-content) 1fr; gap: var(--space-6) var(--space-12); margin: var(--space-12) 0 0; font-size: 13px; }
.opt-facts dt { font-weight: 700; color: var(--text-tertiary); font-size: 12px; padding-top: 1px; }
.opt-facts dt.p { color: var(--status-done); }
.opt-facts dt.c { color: var(--status-review); }
.opt-facts dt.x { max-width: 10em; overflow-wrap: anywhere; }
.opt-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.opt-why { margin-top: var(--space-10); padding-top: var(--space-8); border-top: 1px dashed var(--border-inline); font-size: 12.5px; color: var(--text-secondary); }
.opt-why b { color: var(--accent); margin-right: var(--space-6); }
:root:not([data-theme="dark"]) .opt-mk-chosen, :root:not([data-theme="dark"]) .opt-facts dt.p { color: color-mix(in srgb, var(--status-done) 80%, var(--text-primary)); }
:root:not([data-theme="dark"]) .opt-facts dt.c { color: color-mix(in srgb, var(--status-review) 80%, var(--text-primary)); }
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
.store-section[data-store="feature"] .detail-doc h2.fd-h { font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin: var(--space-24) 0 var(--space-8); padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-section); }
.store-section[data-store="feature"] .detail-doc .fd-sec { margin-top: var(--space-24); }
.store-section[data-store="feature"] .detail-doc .fd-sec > h2.fd-h { margin-top: 0; }
.store-section[data-store="feature"] .detail-doc > .fd-sec:first-child { margin-top: 0; }
.store-section[data-store="feature"] .fd-mm { margin: 0 0 var(--space-8); font-size: 11.5px; }
.store-section[data-store="feature"] .fd-mm summary { cursor: pointer; color: var(--text-tertiary); }
.store-section[data-store="feature"] .fd-mm-src { font-family: var(--font-mono); font-size: 11px; background: var(--bg-base); border: 1px solid var(--border-item); border-radius: var(--radius-8); padding: var(--space-8) var(--space-10); margin: var(--space-6) 0 0; }
.store-section[data-store="feature"] .fd-smap { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-8); margin: 0 0 var(--space-12); }
.store-section[data-store="feature"] .fd-stile { border: 1px solid var(--border-inline); border-radius: var(--radius-8); padding: var(--space-8) var(--space-10); background: var(--bg-base); min-height: 96px; }
.store-section[data-store="feature"] .fd-stile.hit { border-color: var(--accent); }
.store-section[data-store="feature"] .fd-st { display: flex; align-items: center; gap: var(--space-4); font-size: 11px; font-weight: 700; color: var(--text-tertiary); margin-bottom: var(--space-6); }
.store-section[data-store="feature"] .fd-sp { display: flex; align-items: center; gap: var(--space-6); font-size: 11.5px; color: var(--text-quaternary); padding: 2px var(--space-4); border-radius: var(--radius-4); }
.store-section[data-store="feature"] .fd-sp.hit { color: var(--text-primary); background: var(--accent-subtle); font-weight: 600; }
.store-section[data-store="feature"] .fd-bn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); font-size: 9.5px; font-weight: 700; }
.store-section[data-store="feature"] .fd-ol { list-style: none; margin: 0; padding: 0; font-size: 13.5px; line-height: 1.7; color: var(--text-secondary); }
.store-section[data-store="feature"] .fd-ol li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: var(--space-6); margin: var(--space-4) 0; align-items: baseline; }
.store-section[data-store="feature"] .fd-flow { margin: 0 0 var(--space-8); }
.store-section[data-store="feature"] .fd-ol code { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-primary); }
.store-section[data-store="feature"] .cn-list { list-style: none; margin: 0; padding: 0; }
.store-section[data-store="feature"] .cn-item { display: grid; grid-template-columns: minmax(180px, auto) 1fr; gap: 2px var(--space-16); align-items: baseline; padding: var(--space-10) 0; border-bottom: 1px solid var(--border-item); }
.store-section[data-store="feature"] .cn-item:last-child { border-bottom: none; }
.store-section[data-store="feature"] .cn-a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; background: none; border: none; padding: 0; font: inherit; font-weight: 600; text-align: left; }
.store-section[data-store="feature"] .cn-head { display: inline-flex; align-items: center; gap: var(--space-8); flex-wrap: wrap; }
.store-section[data-store="feature"] .cn-t { font-size: 13px; color: var(--text-secondary); }
.store-section[data-store="feature"] .cn-g { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-quaternary); margin-top: 2px; }
.store-section[data-store="feature"] .cn-empty { font-size: 12.5px; color: var(--text-tertiary); margin: 0; }
.store-section[data-store="feature"] .fd-list { margin: 0; padding-left: var(--space-16); font-size: 13.5px; line-height: 1.7; color: var(--text-secondary); }
.store-section[data-store="feature"] .fd-list code, .store-section[data-store="feature"] .fd-ex code { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-primary); }
.store-section[data-store="feature"] .fd-list .cn-g { display: inline; margin-left: var(--space-8); font-size: 11.5px; color: var(--text-tertiary); }
.store-section[data-store="feature"] .fd-ex { margin: 0; font-size: 13.5px; line-height: 1.7; color: var(--text-secondary); }
.store-section[data-store="feature"] .fd-spec { margin-top: var(--space-8); }
.store-section[data-store="feature"] .fd-more { cursor: pointer; font-size: 12.5px; color: var(--text-secondary); }
.store-section[data-store="feature"] .fd-spec[open] > .v-body { margin-top: var(--space-8); }
.store-section[data-store="feature"] .fd-empty { margin: 0 0 var(--space-16); font-size: 12.5px; line-height: 1.65; color: var(--text-secondary); background: var(--bg-surface-on); padding: var(--space-8) var(--space-12); border-radius: var(--radius-4); }
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
/* T-958: env screen (approved screen set docs/artifacts/v1.13/define-screen-set.html #screen-env; the Home env block left 진행 상황 in T-1191 / T-1179 C) */
.nav-item.nav-dim:not(.active) span:first-child { color: var(--text-tertiary); }
.env-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 0 0 4px; }
.env-h b { font-family: var(--font-mono); font-size: 13px; }
.env-dir { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }
.env-c { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); }
.env-note { margin: 0 0 10px; font-size: 12px; color: var(--text-tertiary); }
.erows { columns: 2 260px; column-gap: 24px; }
.erow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-item); break-inside: avoid; }
.erow code { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.est { font-family: var(--font-family); font-size: 11px; border-radius: 100px; padding: 1px 8px; white-space: nowrap; border: 1px solid var(--border-inline); }
.est.on { color: var(--status-done); border-color: color-mix(in srgb, var(--status-done) 40%, transparent); }
.est.off { color: var(--text-tertiary); border-style: dashed; }
.env-nofile { display: flex; flex-direction: column; gap: 4px; padding: 18px; border: 1px dashed var(--border-inline); border-radius: 10px; color: var(--text-tertiary); font-size: 12.5px; }
.env-nofile b { color: var(--text-primary); font-size: 13px; }
.env-scope { margin: 18px 0 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.tagw { font-family: var(--font-family); font-size: 10.5px; color: var(--text-tertiary); border: 1px solid var(--border-inline); border-radius: 100px; padding: 0 7px; margin-left: 8px; white-space: nowrap; }
.env-card + .env-card { margin-top: 12px; }
/* T-1191: a file card's open controls — link-styled, the same accent link look as .env-go had */
.env-acts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 10px; }
.env-act { color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; background: none; border: none; padding: 0; }
.env-act:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
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
${DISCIPLINE_LOAD_CSS}
/* phone width: the viewer has no phone layout today — minimum stacking so the three new parts fit (mock ① 폭 · 폰 390) */
@media (max-width: 700px) {
  .app-shell { flex-direction: column; overflow: auto; }
  .store-section.active { flex-direction: column; flex: 0 0 auto; }
  .activity { flex-direction: row; flex-wrap: wrap; width: auto; flex: 0 0 auto; padding: var(--space-6) var(--space-8); gap: var(--space-4); border-right: none; border-bottom: 1px solid var(--border-item); align-items: center; }
  .activity-theme-toggle { margin: 0; }
  .rail-tool { display: flex; align-items: center; flex: 0 0 auto; padding-left: var(--space-6); font-family: var(--font-mono); font-size: 10.5px; color: var(--text-tertiary); white-space: nowrap; }
  .sidebar { width: auto; flex: 0 0 auto; max-height: 360px; border-right: none; border-bottom: 1px solid var(--border-item); }
  .sidebar-foot { display: none; }
  .frame-main-col { flex: 0 0 auto; min-height: 420px; overflow: visible; width: 100%; }
  .main-inner { min-width: 0; }
  .table-wrap { overflow-x: auto; }
  .frame-body { padding: var(--space-16) var(--space-12); overflow: visible; }
  .dash-card { padding: var(--space-12); }
  .sc-grid { grid-template-columns: 1fr; }
  .sc-waits { border-right: none; padding-right: 0; }
  .sb { flex-wrap: wrap; row-gap: var(--space-8); }
  .sp { grid-template-columns: auto 1fr; align-items: center; column-gap: var(--space-12); margin: var(--space-6) 0 var(--space-8); }
  .sp-count, .sp-top { grid-column: 1; }
  .sp-wait, .sp-bar { grid-column: 2; }
  .sp-wait { justify-content: flex-end; }
}
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
    // T-1104: As-Is docs/tickets/<bucket>, or To-Be docs/<product or _shared>/tickets/<bucket>.
    var i = parts[1] === 'tickets' ? 2 : parts[2] === 'tickets' ? 3 : -1;
    if (parts[0] !== 'docs' || i < 0 || !own(PAST, parts[i])) return null;
    return { key: parts[i], src: PAST[parts[i]] };
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
    // T-1067: an HTML artifact's 「새 탭에서 열기」 is one item of this attribute row.
    if (!fields.body && fields.fileHref && fields.frame) {
      metaRows.push('<div class="detail-field detail-field-open"><a href="' + escAttr(fields.fileHref) +
        '" target="_blank" rel="noopener">' + ${JSON.stringify(FRAME.openInNewTab)} + '</a></div>');
    }
    var metaHtml = metaRows.length ? '<div class="detail-meta">' + metaRows.join('') + '</div>' : '';
    // T-666 slice 1b acceptance line 2: an artifact with no inlinable body
    // (.html/.json) says so and links the file, instead of an empty panel.
    // T-912 F3: fileHref embeds repoRootHref, a raw path (a repo dir may be named
    // with a quote) — escaped for the attribute AND the link text.
    function escAttr(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
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
    } else if (fields.fileHref && fields.frame) {
      docHtml = '<div class="detail-doc detail-frame"><iframe class="detail-frame-view" sandbox="allow-scripts" title="' +
        ${JSON.stringify(FRAME.frameTitle)} + '" src="' + escAttr(fields.fileHref) + '"></iframe></div>';
    } else if (fields.fileHref) {
      docHtml = '<div class="detail-doc detail-nobody"><p>' + ${JSON.stringify(FILE_HREF_NOTE)} + '</p><p><a href="' +
        escAttr(fields.fileHref) + '" target="_blank" rel="noopener">' + escAttr(fields.path || fields.fileHref) + '</a></p></div>';
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
    var group = p.get('group');
    if (view === 'env') {
      // T-1047: env is a current-version item now; an old ?view=env&group=<line>/<file> link lands on that line's env item.
      var cut = group ? group.lastIndexOf('/') : -1;
      view = 'home';
      group = (cut === -1 ? '' : group.slice(0, cut + 1)) + 'env';
    }
    var section = findByAttr('.store-section', 'data-store', view);
    if (!section) return false;
    clearHashMarks();
    selectStore(view);
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

    var sortBtn = ev.target.closest('.sort-btn[data-sort-col]');
    if (sortBtn) { ev.preventDefault(); sortTable(sortBtn); return; }

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

    // T-1180: the sidebar progress card opens the home store's 진행 상황 tab.
    var cardBtn = ev.target.closest('[data-card-open]');
    if (cardBtn) {
      ev.preventDefault();
      var homeSec = selectStore('home');
      if (homeSec) selectGroup(homeSec, cardBtn.getAttribute('data-card-open'));
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

    // T-1191: 경로 복사 — the env file's path (never a value) to the clipboard.
    var copyBtn = ev.target.closest('[data-env-copy]');
    if (copyBtn) {
      ev.preventDefault();
      var copyText = copyBtn.getAttribute('data-env-copy');
      var copyDone = function () {
        var done = copyBtn.getAttribute('data-label-done');
        copyBtn.setAttribute('title', done);
        copyBtn.setAttribute('aria-label', done);
      };
      var copyFallback = function () {
        var ta = document.createElement('textarea');
        ta.value = copyText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { if (document.execCommand('copy')) copyDone(); } catch (e) {}
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(copyText).then(copyDone, copyFallback);
      else copyFallback();
      return;
    }

    // T-883: a 「읽기」 field value opens the store it names (용어 사전 · 릴리즈 노트).
    var readBtn = ev.target.closest('[data-open-store]');
    if (readBtn) {
      ev.preventDefault();
      var openedSection = selectStore(readBtn.getAttribute('data-open-store'));
      // T-958 / T-1047: Home's 「env 보기」 names the store and the sidebar item to open.
      var openGroup = readBtn.getAttribute('data-open-group');
      if (openedSection && openGroup) selectGroup(openedSection, openGroup);
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

  // T-1006: click a sortable header → sort that table by the column; again → reverse.
  // Rows carry data-tie (ticket number, always descending as the tie-break) and each cell data-sort.
  function sortTable(btn) {
    var table = btn.closest('table');
    var th = btn.closest('th');
    var body = table && table.tBodies[0];
    if (!body) return;
    var col = Number(btn.getAttribute('data-sort-col'));
    var num = btn.getAttribute('data-sort-kind') === 'num';
    var dir = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
    table.querySelectorAll('th[aria-sort]').forEach(function (h) { h.setAttribute('aria-sort', 'none'); });
    th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
    var collator = new Intl.Collator(undefined, { numeric: true });
    function val(tr) { var c = tr.cells[col]; return c ? (c.getAttribute('data-sort') != null ? c.getAttribute('data-sort') : c.textContent) : ''; }
    var rows = Array.prototype.slice.call(body.rows).map(function (tr, i) { return { tr: tr, i: i, v: val(tr), t: Number(tr.getAttribute('data-tie')) || 0 }; });
    rows.sort(function (a, b) {
      var c;
      if (a.v === '' || b.v === '') {
        if (a.v === b.v) return b.t - a.t || a.i - b.i;
        return a.v === '' ? 1 : -1;
      }
      if (num) {
        var x = Number(a.v);
        var y = Number(b.v);
        c = x === y ? 0 : x < y ? -1 : 1;
      } else {
        c = collator.compare(a.v, b.v);
      }
      return c * dir || b.t - a.t || a.i - b.i;
    });
    rows.forEach(function (r) { body.appendChild(r.tr); });
  }

  document.addEventListener('click', function (ev) { onClick(ev); syncUrl(false); });

  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-card-open]')) { ev.preventDefault(); onClick(ev); syncUrl(false); return; }
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
${DISCIPLINE_LOAD_SCRIPT}
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
// T-961: a multi-line page resolves an added line's past ticket
// (docs/tickets/<line>/<v>/T-n.md) to its own data file key `<line>--<v>`; a
// single-line page keeps INTERACTION_SCRIPT, byte for byte.
const PAST_REF_RE = /(function pastTicketRef\(fields\) \{\n\s*var parts = [^\n]*;)/
const PAST_REF_LINE = '\n    ' + ['if', '(parts.length', '===', '5)', 'parts.splice(2,', '2,', "parts[2]", '+', "'--'", '+', 'parts[3]);'].join(' ')
const INTERACTION_SCRIPT_LINES = INTERACTION_SCRIPT.replace(PAST_REF_RE, (head) => head + PAST_REF_LINE)
if (INTERACTION_SCRIPT_LINES === INTERACTION_SCRIPT) throw new Error('T-961: pastTicketRef text drifted from PAST_REF_RE')
const INTERACTION_SCRIPT_LINES_SHA256_BASE64 = crypto.createHash('sha256').update(INTERACTION_SCRIPT_LINES, 'utf8').digest('base64')
// T-961: emitted only on a page with several release lines — a single-line
// page's CSS, scripts and CSP stay byte-identical.
const LINES_CSS = `
.ls-h { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-6); margin: var(--space-12) var(--space-6) var(--space-4); padding-top: var(--space-8); border-top: 1px solid var(--border-item); }
.sidebar-sub + .ls-h { border-top: none; padding-top: 0; margin-top: 0; }
.ls-h b { font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
.ls-st { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-tertiary); }
`
// The breadcrumb names the line: after any group switch, the active group's
// \`data-crumb\` (\`<line> <version> · <label>\`) replaces the plain label.
const LINES_SCRIPT = `(function(){function sync(){document.querySelectorAll('.store-section').forEach(function(s){var b=s.querySelector('.nav-item-clickable.active[data-crumb]');var l=s.querySelector('.js-group-label');if(b&&l)l.textContent=b.getAttribute('data-crumb');});}function later(){setTimeout(sync,0);}document.addEventListener('click',later);document.addEventListener('keydown',later);window.addEventListener('hashchange',later);later();})();`
const LINES_SCRIPT_SHA256_BASE64 = crypto.createHash('sha256').update(LINES_SCRIPT, 'utf8').digest('base64')

const CSP_CONTENT = [
  "default-src 'none'",
  // T-885 (T-876 = D): 'strict-dynamic' lets the hash-trusted interaction
  // script add a past-version data file's <script src>; a parser-inserted or
  // innerHTML-inserted script (a document body) still never runs.
  `script-src 'sha256-${THEME_HEAD_SCRIPT_SHA256_BASE64}' 'sha256-${INTERACTION_SCRIPT_SHA256_BASE64}' 'strict-dynamic'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  // T-1010: only the side panel's sandboxed artifact iframe (a contained file:// href) loads a frame.
  "frame-src file:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')
const CSP_CONTENT_LINES = CSP_CONTENT.replace(`'sha256-${INTERACTION_SCRIPT_SHA256_BASE64}'`, `'sha256-${INTERACTION_SCRIPT_LINES_SHA256_BASE64}'`).replace("'strict-dynamic'", `'sha256-${LINES_SCRIPT_SHA256_BASE64}' 'strict-dynamic'`)

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
  // T-1076: true when a past-version data file carries a diagram block — its
  // bodies never sit in this page, so the page itself cannot tell.
  pastMermaid = false,
}) {
  pageViewerAbsPath = viewerAbsPath
  const pageTitle = escapeHtml(pageTitleText(data.project))
  const discipline = data.discipline || []
  pageDisciplineIndex = buildDisciplineIndex(discipline)
  const anchors = buildAnchors(data)
  pageDocsLayout = data.docsLayout ?? null
  pageIdentity = pageIdentityOf(data)
  pageDocTargets = buildDocPathTargets(data, anchors)
  pageTicketIds = ticketIdsOf(pageDocTargets)
  const views = lineViews(data)
  const detailData = {
    ticket: ticketDetailEntries(data.tickets, repoRootHref, views.slice(1).map((v) => v.tickets)),
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

  const bodyHtml = `${activityBar('home')}
${homeSection(data, repoRootHref)}
${prdSection(data.prd, data.currentVersion, repoRootHref, data.tickets, views)}
${ticketSection(data.tickets, data.currentVersion, views)}
${wikiSection(data.wiki)}
${featuresSection(data)}
${artifactsSection(data.artifacts, data.currentVersion, views)}
${glossarySection(data.wiki)}
${releaseSection(data.releases || [])}
${discSection(discipline, data.disciplineLoad || null)}`
  const detailScript = detailDataScript(detailData)
  // T-1049 (T-1056 = A): mermaid ships only on a page that carries a diagram block.
  const mm = pastMermaid || hasMermaid(bodyHtml, detailScript) ? mermaidScript() : null
  const csp = views.length > 0 ? CSP_CONTENT_LINES : CSP_CONTENT
  const cspMeta = mm ? csp.replace("'strict-dynamic'", `'sha256-${mm.sha256}' 'strict-dynamic'`) : csp

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${cspMeta}">
<title>${pageTitle}</title>
<meta property="og:title" content="${pageTitle}">
<script>${THEME_HEAD_SCRIPT}</script>
<style>
${fontFaceCss}
${TEMPLATE_CSS}
${emitRootThemeCss(dark, light)}${views.length > 0 ? LINES_CSS : ''}${mm ? MERMAID_CSS : ''}
</style>
</head>
<body>
<!-- sha256:${escapeHtml(tokensSha256)} -->
<div class="app-shell">
${bodyHtml}
</div>
${detailScript}
<script>${views.length > 0 ? INTERACTION_SCRIPT_LINES : INTERACTION_SCRIPT}</script>${views.length > 0 ? `\n<script>${LINES_SCRIPT}</script>` : ''}${mm ? `\n<script>${mm.script}</script>` : ''}
</body>
</html>
`
}
