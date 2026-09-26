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
import { marked, Renderer } from 'marked'
import {
  STORE_LABEL,
  COMMON,
  PAGE,
  HOME,
  PROGRESS_ITEM_LABEL,
  DETAIL_FIELD_LABELS,
  TICKET,
  WIKI,
  FEATURE,
  ARTIFACT,
  PRD,
  FILE_HREF_NOTE,
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

/**
 * `href` resolved against `sourceDirRel` (the source document's own
 * repo-root-relative directory) and rebased onto `repoRootHref`, or `null`
 * when `href` is not a plain repo-relative link this generator can safely
 * rewrite: an anchor (`#…`), protocol-relative (`//…`), a URL with a scheme
 * (`https:`, `mailto:`, …), a site-absolute path (`/…` — relative to some
 * assumed server root this generator does not control), or a path that
 * would resolve outside the repo root entirely (`../` walking past it) —
 * "leave untouched if it escapes the repo root", never rewritten past it.
 * @param {string} href
 * @param {string} sourceDirRel
 * @param {string} repoRootHref
 * @returns {string|null}
 */
export function resolveDocLink(href, sourceDirRel, repoRootHref) {
  if (!href) return null
  if (/^(#|\/\/|\/)/.test(href)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  const hashIdx = href.indexOf('#')
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const hashPart = hashIdx === -1 ? '' : href.slice(hashIdx)
  if (!pathPart) return null
  const resolved = path.posix.normalize(path.posix.join(sourceDirRel, pathPart))
  if (resolved === '..' || resolved.startsWith('../')) return null
  return encodeURI(`${repoRootHref}/${resolved}${hashPart}`)
}

// marked.parse() gives its renderer no way to receive extra per-call
// context, so `md()` stashes the current document's own directory + the
// page's repoRootHref here right before parsing — safe because generation
// is single-threaded and synchronous (no md() call is ever in flight while
// another starts).
let linkContext = { sourceDirRel: '', repoRootHref: DEFAULT_REPO_ROOT_HREF }

// Captured BEFORE hardenedRenderer.link is overridden below, so every link
// this override chooses not to rewrite (anchor/scheme/absolute/escaping)
// still gets marked's own real default rendering — never a second,
// hand-rolled copy of it.
const defaultLinkRenderer = new Renderer().link

hardenedRenderer.link = function ({ href, title, tokens }) {
  const rewritten = resolveDocLink(href, linkContext.sourceDirRel, linkContext.repoRootHref)
  if (rewritten === null) return defaultLinkRenderer.call(this, { href, title, tokens })
  const text = this.parser.parseInline(tokens)
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(rewritten)}" target="_blank" rel="noopener"${titleAttr}>${text}</a>`
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

function emitThemeVarBlock(className, resolvedMap) {
  const lines = [...resolvedMap.entries()].map(([name, value]) => `  --${name}: ${value};`)
  return `.${className} {\n${lines.join('\n')}\n}`
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

/** One <table> of ticket rows for one group (current version, or backlog) — every row is a detail-row keyed for the embedded JSON blob below, so "every row resolves to a detail entry" is true by construction (same loop builds both). */
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

/** The ticket store: sidebar group (current version / backlog) → list → detail panel. Slice 1a's proof case (acceptance line 1). */
function ticketStoreInner(tickets, currentVersion) {
  const currentTickets = tickets.included.filter((t) => t.bucket === currentVersion)
  const backlogTickets = tickets.included.filter((t) => t.bucket === 'backlog')

  const sidebar = `<nav class="sidebar">
<div class="sidebar-title">productune · ${escapeHtml(currentVersion)}</div>
<div class="sidebar-sub">${TICKET.sidebarLabel}</div>
<button type="button" class="nav-item nav-item-clickable active" data-group-select="${escapeHtml(currentVersion)}"><span>${escapeHtml(currentVersion)}</span><span class="nav-item-count">${currentTickets.length}</span></button>
<button type="button" class="nav-item nav-item-clickable" data-group-select="backlog"><span>${escapeHtml(TICKET.backlogLabel)}</span><span class="nav-item-count">${backlogTickets.length}</span></button>
</nav>`

  let omittedHtml = ''
  if (tickets.omitted.length > 0) {
    omittedHtml = `<p class="v-note">${escapeHtml(TICKET.omittedNote)}</p>\n`
    omittedHtml += `<table class="v-omitted"><thead><tr>${TICKET.omittedTableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
    for (const o of tickets.omitted) {
      omittedHtml += `<tr><td><code>${escapeHtml(o.bucket)}</code></td><td>${o.count}</td><td>${fmtBytes(o.bytes)}</td><td><code>docs/tickets/${escapeHtml(o.bucket)}/</code></td></tr>\n`
    }
    omittedHtml += '</tbody></table>\n'
  }

  const body = `<div class="section-meta"><span class="count-badge">${TICKET.sidebarLabel} <b>${currentTickets.length + backlogTickets.length}</b>${TICKET.countUnit}</span></div>
<div class="view-pane active" data-group="${escapeHtml(currentVersion)}">${ticketRowsTable(currentTickets)}</div>
<div class="view-pane" data-group="backlog">${ticketRowsTable(backlogTickets)}</div>
${omittedHtml}`

  const mainCol = `<div class="frame-main-col">
<div class="topstrip"><span class="topstrip-crumb"><b>${TICKET.sidebarLabel} · <span class="js-group-label">${escapeHtml(currentVersion)}</span></b></span></div>
<div class="frame-body"><div class="main-inner">${body}</div></div>
<div class="detail-panel" role="dialog" aria-label="${COMMON.detailPanel}">
<div class="detail-panel-header"><span class="detail-panel-title"></span><button type="button" class="detail-panel-close" aria-label="${COMMON.close}">${svgIcon(CLOSE_ICON_PATH, 14)}</button></div>
<div class="detail-panel-body"></div>
</div>
</div>`

  return sidebar + '\n' + mainCol
}

/** The detail-data JSON blob's "ticket" bucket — one entry per row `ticketRowsTable` drew, same loop's inputs, so no row can point at a missing entry. */
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
// default-active group (mirrors ticketStoreInner's current-version-first
// convention). PRD's "open" group is the one intentional content nuance,
// not a structural one — see prdStoreInner below.
function groupedStore({ sidebarSubLabel, crumbLabel, groups }) {
  const sidebarButtons = groups
    .map((g, i) => {
      const active = i === 0 ? ' active' : ''
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
    .map((g, i) => `<div class="view-pane${i === 0 ? ' active' : ''}" data-group="${escapeHtml(g.key)}">${g.bodyHtml}</div>`)
    .join('\n')

  const defaultLabel = groups.length > 0 ? groups[0].label : ''
  const mainCol = `<div class="frame-main-col">
<div class="topstrip"><span class="topstrip-crumb"><b>${escapeHtml(crumbLabel)} · <span class="js-group-label">${escapeHtml(defaultLabel)}</span></b></span></div>
<div class="frame-body"><div class="main-inner">${panes}</div></div>
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

/** Wiki store: sidebar groups by the RAW frontmatter `type` value, keyed internally by that raw value (never shown) but LABELED per T-705 §F's final Korean mapping. */
function wikiStoreInner(pages) {
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
  return groupedStore({ sidebarSubLabel: WIKI.sidebarLabel, crumbLabel: WIKI.sidebarLabel, groups })
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
  return groupedStore({ sidebarSubLabel: STORE_LABEL.feature, crumbLabel: STORE_LABEL.feature, groups })
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
 * T-705 §G: the closed-round table's 2nd column used to show the raw file
 * path; the mockup's own column is the round's actual TITLE instead. Reads
 * the document's own first `#`/`##`/… heading (its text, `#` markers
 * stripped); a stub file with no heading (docs/prd/versions/v1.1.md,
 * v1.2.1.md — measured 2026-09-26) falls back to its first non-empty line,
 * per acceptance line 3 ("falling back to its first line").
 * @param {string} body
 */
export function extractTitle(body) {
  const headingMatch = /^#{1,6}\s+(.+)$/m.exec(body || '')
  if (headingMatch) return headingMatch[1].trim()
  const firstLine = (body || '').split('\n').find((l) => l.trim() !== '')
  return firstLine ? firstLine.trim() : ''
}

function prdClosedRowsTable(closed) {
  if (closed.length === 0) return `<p class="v-note">${PRD.empty}</p>`
  let html = `<div class="table-wrap"><table><thead><tr>${PRD.tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>\n`
  for (const c of closed) {
    const id = c.name.replace(/\.md$/, '')
    html += `<tr class="detail-row" data-detail-kind="prd" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(extractTitle(c.body))}</td>`
    html += '</tr>\n'
  }
  html += '</tbody></table></div>\n'
  return html
}

function prdStoreInner(prd, currentVersion, repoRootHref) {
  const groups = [
    { key: 'open', label: `${PRD.openLabelPrefix}${currentVersion}`, count: 1, bodyHtml: prdOpenBody(prd, repoRootHref) },
    {
      key: 'closed',
      label: PRD.closedLabel,
      count: prd.closed.length,
      bodyHtml: countBadge(PRD.closedLabel, prd.closed.length, PRD.countUnit) + prdClosedRowsTable(prd.closed),
    },
  ]
  return groupedStore({ sidebarSubLabel: STORE_LABEL.prd, crumbLabel: STORE_LABEL.prd, groups })
}

/** Closed-round entries only — the open section is not a detail-row (see prdStoreInner); a closed round's id is its filename minus `.md` (e.g. "v1.1", "v1.2.1"). A stub file with no `##` heading (docs/prd/versions/v1.1.md, v1.2.1.md — measured 2026-09-26) still produces a non-empty `md()` body (a plain paragraph), so it still lists and opens (acceptance line 3). */
function prdDetailEntries(prd, repoRootHref) {
  const entries = {}
  for (const c of prd.closed) {
    const id = c.name.replace(/\.md$/, '')
    entries[id] = { title: id, path: c.rel, body: md(c.body, path.dirname(c.rel), repoRootHref) }
  }
  return entries
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

/** Artifact store: one group per manifest bucket (version) — the current version's bucket (if it has any entries) opens by default, else the first bucket, so the reader lands on "now" the same way the ticket store's sidebar defaults to the current version. */
function artifactStoreInner(artifacts, currentVersion) {
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
  return groupedStore({ sidebarSubLabel: STORE_LABEL.artifact, crumbLabel: STORE_LABEL.artifact, groups })
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
      fileHref: e.inlined ? undefined : encodeURI(`${artifactsBaseHref}/${f.bucket}/${f.path}`),
    }
  }
  return entries
}

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

// Row keys = the `## v1.10` PRD §What section's own H4 order (docs/prd/PRD.md
// ~line 105-149, `#### <key> — <label>`), NOT parsed from that file at
// generation time — this fixed list only changes when the version's own
// §What items change, at which point this generator's next edit changes too
// (T-675 round 2: a ticket's `prd_item:` string is never printed to the
// screen verbatim; the label is this generator's own short Korean gloss,
// trimmed from the PRD's own H4 label text — Designer sign-off on the exact
// wording is still open, same as the wiki/feature UNCLASSIFIED-group and
// no-body-link copy flagged in slice 1a/1b's own 미해결).
//
// T-666 slice 2b: a ticket with NO matching `prd_item` (today T-677/678/679
// — measured 2026-09-26, `grep -L prd_item: docs/tickets/v1.10`) used to be
// silently omitted from the matrix (slice 2a scope, "leave room for them,
// build neither"). This slice appends `PROGRESS_OUT_OF_SCOPE_KEY` as one more
// row — labelled from this SAME label layer (`PROGRESS_ITEM_LABEL`), never a
// second vocabulary — so a ticket never disappears from the card for lacking
// an item address (acceptance line 2).
const PROGRESS_ITEM_ORDER = ['north-star', 'prd-form', 'linkage', 'gui-deferral-marker', 'inherited-defects', 'viewer', 'ticket-frame']
const PROGRESS_OUT_OF_SCOPE_KEY = 'out-of-scope'
// PROGRESS_ITEM_LABEL now imported from ./labels.mjs (T-706: one label
// layer) — T-705 §B moved `linkage` from '연결' to '간선' there; every other
// key here (including PROGRESS_OUT_OF_SCOPE_KEY's '항목 밖', this repo's own
// existing PRD.md vocabulary reused verbatim) is §A keep.

// T-666 slice 2b acceptance line 1: "Stage progress is counted by
// statusline-prdt.sh's own TYPE_TO_STAGE mapping, not a second rule — a test
// fails if the two diverge." Values copied VERBATIM from
// code/packages/core/scripts/statusline-prdt.sh lines 116-125 (its own
// `TYPE_TO_STAGE` dict) — `scripts/qa/type-to-stage-parity.test.ts` parses
// that file's dict literal and deep-equals it against this export, so a hand
// edit to either side without the other fails CI rather than silently
// drifting.
export const TYPE_TO_STAGE = {
  // canonical enum
  design: 'define', impl: 'build', qa: 'build', ops: 'ship',
  // tolerated aliases
  docs: 'define', prd: 'define', spec: 'define', feature: 'define',
  build: 'build', refactor: 'build', bug: 'build', fix: 'build',
  chore: 'build', test: 'build',
  deploy: 'ship', release: 'ship',
  retro: 'retro', close: 'retro',
}

// The four ticket-mapped stages, always rendered in this order (acceptance
// line 1: "all four lifecycle stages always render") — statusline-prdt.sh's
// own STAGES tuple also carries "idle", but idle is a po-state-only stage no
// ticket ever maps to (TYPE_TO_STAGE has no "idle" value), so it is not a
// fifth column here.
const STAGE_ORDER = ['define', 'build', 'ship', 'retro']

/**
 * One line, `define n/m · build n/m · ship n/m · retro n/m`, always all
 * four. Mirrors statusline-prdt.sh's own counting rule exactly (lines
 * 147-158): a ticket counts toward a stage's n/m only when
 * `TYPE_TO_STAGE[type] === stage`; `status: dropped` counts toward neither
 * (open/done only) — never a second rule invented for the viewer.
 * @param {Array} currentTickets current-version tickets (any status)
 */
function homeStageLine(currentTickets) {
  const counted = currentTickets.filter((t) => t.frontmatter.status === 'open' || t.frontmatter.status === 'done')
  const cells = STAGE_ORDER.map((stage) => {
    const inStage = counted.filter((t) => TYPE_TO_STAGE[t.frontmatter.type] === stage)
    const done = inStage.filter((t) => t.frontmatter.status === 'done').length
    return `${stage} ${done}/${inStage.length}`
  })
  return `<div class="stage-line mono">${escapeHtml(cells.join(' · '))}</div>`
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

/** One (item, assignee) matrix cell: `–` when empty (drawn even at 0 — the fixed-column rule extends to fixed cells, never a collapsed column), else one square per ticket + a `done/total` count. */
function progressCell(solidTickets, dashedTickets) {
  const total = solidTickets.length + dashedTickets.length
  if (total === 0) return '<span class="stage-matrix-cell stage-matrix-cell-empty">–</span>'
  const isDone = (t) => t.frontmatter.status === 'done'
  const done = solidTickets.filter(isDone).length + dashedTickets.filter(isDone).length
  const sqHtml = solidTickets.map((t) => progressSquare(isDone(t))).join('') + dashedTickets.map((t) => progressDashedSquare(isDone(t))).join('')
  return `<span class="stage-matrix-cell"><span class="stage-matrix-sq-wrap">${sqHtml}</span><span class="stage-matrix-count mono">${done}/${total}</span></span>`
}

function progressMatrixHeadRow() {
  const cols = PROGRESS_ASSIGNEE_ORDER.map((role) => `<span class="stage-matrix-col">${escapeHtml(role)}</span>`).join('')
  return `<div class="stage-matrix-row stage-matrix-head"><span class="stage-matrix-label"></span>${cols}</div>`
}

/** `ticketsForItem` = every current-version ticket whose `prd_item:` resolves to this row's key. The `qa` column is always the dashed/derived one — contracts §Dispatch: QA never gets its own ticket, so an `assignee: qa` solid square is a possibility this code still handles correctly, but never observed in this repo (T-675 round 2). */
function progressMatrixRow(key, ticketsForItem) {
  const cells = PROGRESS_ASSIGNEE_ORDER.map((role) => {
    const solid = ticketsForItem.filter((t) => t.frontmatter.assignee === role)
    const dashed = role === 'qa' ? ticketsForItem.filter((t) => t.frontmatter.assignee !== 'qa' && /^### QA/m.test(t.body || '')) : []
    return progressCell(solid, dashed)
  }).join('')
  return `<div class="stage-matrix-row"><span class="stage-matrix-label">${escapeHtml(PROGRESS_ITEM_LABEL[key] || key)}</span>${cells}</div>`
}

/** The straight overall line above the matrix — one square per current-version ticket, once each, regardless of assignee or prd_item (T-675 round 3: "전체는... 일직선으로 쭉... assignee상관없이"). */
function progressOverall(currentTickets) {
  const done = currentTickets.filter((t) => t.frontmatter.status === 'done').length
  const squares = currentTickets.map((t) => progressSquare(t.frontmatter.status === 'done')).join('')
  return `<div class="stage-overall"><span class="stage-matrix-label">${HOME.overall}</span><span class="stage-matrix-sq-wrap stage-overall-sq-wrap">${squares}</span><span class="stage-matrix-count mono">${done}/${currentTickets.length}</span></div>`
}

const PROGRESS_LEGEND = `<div class="stage-matrix-legend"><span class="stage-matrix-legend-item">${progressSquare(true)} <span>${HOME.legendMain}</span></span><span class="stage-matrix-legend-item">${progressDashedSquare(true)} <span>${HOME.legendDerived}</span></span></div>`

/** The "진행 상황" pane: T-666 slice 2b's own TYPE_TO_STAGE stage line, above T-675's assignee x PRD-item matrix (a trailing "항목 밖" row included) — two different questions ("which lifecycle stage" vs "which PRD item"), not the same component, per this ticket's two separate acceptance lines. */
function homeProgressBody(data) {
  const currentTickets = data.tickets.included.filter((t) => t.bucket === data.currentVersion)
  const byItem = new Map(PROGRESS_ITEM_ORDER.map((k) => [k, []]))
  const outOfScope = []
  for (const t of currentTickets) {
    const prdItem = t.frontmatter.prd_item || ''
    const prefix = `${data.currentVersion}#`
    const key = prdItem.startsWith(prefix) ? prdItem.slice(prefix.length) : null
    if (key && byItem.has(key)) byItem.get(key).push(t)
    else outOfScope.push(t) // no prd_item, or one this version's §What items don't name — the trailing row
  }
  const rows = PROGRESS_ITEM_ORDER.map((key) => progressMatrixRow(key, byItem.get(key))).join('') + progressMatrixRow(PROGRESS_OUT_OF_SCOPE_KEY, outOfScope)
  return `<div class="dash-card">
<div class="dash-card-title">${svgIcon(STORE_ICON_PATHS.home, 14)} <span>${HOME.working}</span></div>
${homeStageLine(currentTickets)}
${progressOverall(currentTickets)}
<div class="stage-matrix">${progressMatrixHeadRow()}${rows}</div>
${PROGRESS_LEGEND}
<div class="dash-actions">
<button type="button" class="btn-secondary" data-group-select="ticket">${svgIcon(STORE_ICON_PATHS.ticket, 13)} <span>${HOME.gotoTickets}</span></button>
<button type="button" class="btn-secondary" data-group-select="prd">${svgIcon(STORE_ICON_PATHS.prd, 13)} <span>${HOME.openPrd}</span></button>
</div>
</div>`
}

function homeSection(data, repoRootHref) {
  const currentTickets = data.tickets.included.filter((t) => t.bucket === data.currentVersion)
  const currentArtifacts = data.artifacts.entries.filter((e) => e.fields.bucket === data.currentVersion)
  const groups = [
    { key: 'progress', label: HOME.working, bodyHtml: `<div class="dash-grid">${homeProgressBody(data)}</div>` },
    { key: 'ticket', label: STORE_LABEL.ticket, count: currentTickets.length, bodyHtml: ticketRowsTable(currentTickets) },
    { key: 'artifact', label: STORE_LABEL.artifact, count: currentArtifacts.length, bodyHtml: artifactRowsTable(currentArtifacts) },
    { key: 'prd', label: STORE_LABEL.prd, count: data.currentVersion, bodyHtml: prdOpenBody(data.prd, repoRootHref) },
  ]
  return storeSection('home', { active: true, innerHtml: groupedStore({ sidebarSubLabel: STORE_LABEL.home, crumbLabel: STORE_LABEL.home, groups }) })
}

const TEMPLATE_CSS = `
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
header {
  flex: 0 0 auto;
  padding: var(--space-16) var(--space-24);
  background: var(--bg-surface-base);
  border-bottom: 1px solid var(--border-section);
  display: flex;
  align-items: baseline;
  gap: var(--space-16);
  flex-wrap: wrap;
}
header h1 { font-size: 1.1rem; margin: 0; }
header p { margin: 0; color: var(--text-tertiary); font-size: 0.8rem; }
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
  width: 220px; flex: 0 0 220px; background: var(--bg-surface-on); border-right: 1px solid var(--border-item);
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
.frame-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-24) var(--space-32); }
.main-inner { max-width: 1040px; margin: 0 auto; }
.section-meta { margin-bottom: var(--space-12); }
.count-badge { display: inline-block; font-size: 11.5px; background: var(--bg-interaction-neutral); color: var(--text-secondary); padding: 3px 10px; border-radius: var(--radius-100); }

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
.pill-status-done { background: var(--bg-interaction-neutral); color: var(--status-done); }
.pill-status-todo { background: var(--bg-interaction-neutral); color: var(--text-tertiary); }
.pill-status-abandoned { background: var(--bg-interaction-neutral); color: var(--status-abandoned); }
.pill-role-po { background: var(--bg-interaction-neutral); color: var(--persona-po); }
.pill-role-designer { background: var(--bg-interaction-neutral); color: var(--persona-designer); }
.pill-role-developer { background: var(--bg-interaction-neutral); color: var(--persona-dev); }
.pill-role-qa { background: var(--bg-interaction-neutral); color: var(--persona-qa); }
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
.stage-overall .stage-matrix-count { font-weight: 700; color: var(--text-primary); margin-left: auto; }
.stage-matrix-sq-wrap.stage-overall-sq-wrap { flex-wrap: nowrap; gap: 2px; }
.stage-overall-sq-wrap .stage-sq { width: 6px; height: 6px; }
.stage-overall-sq-wrap .stage-sq-svg { width: 6px; height: 6px; }
@media (max-width: 900px) {
  .stage-matrix-sq-wrap.stage-overall-sq-wrap { flex-wrap: wrap; }
}
.stage-matrix { display: grid; grid-template-columns: 60px repeat(5, 1fr); column-gap: var(--space-6); row-gap: 4px; align-items: center; margin-bottom: var(--space-8); }
.stage-matrix-row { display: contents; }
.stage-matrix-head .stage-matrix-col { font-size: 9px; text-transform: none; letter-spacing: 0.02em; color: var(--text-quaternary);
  font-weight: 600; text-align: center; padding-bottom: var(--space-6); border-bottom: 1px solid var(--border-item); }
.stage-matrix-head .stage-matrix-label { border-bottom: 1px solid var(--border-item); padding-bottom: var(--space-6); }
.stage-matrix-label { display: flex; align-items: center; gap: 3px; color: var(--text-tertiary); font-size: 11px;
  text-transform: none; white-space: nowrap; overflow: hidden; }
.stage-matrix-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 2px 0; }
.stage-matrix-sq-wrap { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; max-width: 100%; }
.stage-sq { width: 10px; height: 10px; border-radius: 2px; background: var(--bg-interaction-neutral); border: 1px solid var(--border-inline); flex: 0 0 auto; }
.stage-sq.sq-done { background: var(--accent); border-color: var(--accent); }
.stage-sq-svg { width: 10px; height: 10px; flex: 0 0 auto; display: block; overflow: visible; }
.stage-sq-dashed-rect { fill: var(--bg-interaction-neutral); stroke: var(--text-quaternary); stroke-width: 1; stroke-dasharray: 2 1.2; }
.stage-sq-dashed-rect.sq-done { fill: var(--accent); stroke: var(--text-primary); }
.stage-matrix-count { font-size: 9.5px; color: var(--text-secondary); font-family: var(--font-mono); }
.stage-matrix-cell-empty { color: var(--text-disabled); font-size: 11px; }
.stage-matrix-legend { display: flex; flex-direction: column; gap: 2px; margin: var(--space-4) 0 var(--space-2); font-size: 10px; color: var(--text-quaternary); }
.stage-matrix-legend-item { display: flex; align-items: center; gap: 5px; }
.dash-actions { display: flex; gap: var(--space-8); margin-top: var(--space-10); flex-wrap: wrap; }
.btn-secondary { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-family); cursor: pointer;
  border-radius: var(--radius-8); font-size: 12px; text-decoration: none; white-space: nowrap;
  background: var(--bg-interaction-neutral); color: var(--text-primary); border: none; padding: var(--space-6) var(--space-12); }
.btn-secondary:hover { background: var(--border-hover); }

/* ---------- tables ---------- */
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-quaternary);
  font-weight: 600; padding: var(--space-8) var(--space-10); border-bottom: 1px solid var(--border-hover);
  background: var(--bg-surface-on); }
td { padding: var(--space-6) var(--space-10); border-bottom: 1px solid var(--border-item); vertical-align: top; color: var(--text-primary); }
tbody tr:hover td { background: var(--bg-state-hover); }
.id-col { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }
.table-wrap { border: 1px solid var(--border-item); border-radius: var(--radius-8); overflow: hidden; overflow-x: auto; }

section { margin-bottom: var(--space-24); padding-bottom: var(--space-24); border-bottom: 1px solid var(--border-section); }
section h2 { border-bottom: 1px solid var(--border-item); padding-bottom: var(--space-8); }
article { margin-bottom: var(--space-24); padding: var(--space-16); background: var(--bg-surface-base); border: 1px solid var(--border-item); border-radius: var(--radius-8); }
article h3 { margin-top: 0; }
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
`

/**
 * The interaction layer — activity bar picks a store, a ticket sidebar row
 * picks a group, a row picks a detail. Data-only otherwise: everything the
 * script reads (DETAIL_DATA) was rendered at GENERATION time above; the
 * script issues no fetch and mutates no remote state, so "zero network
 * requests" (tests/viewer-html.window.spec.ts) still holds.
 */
const INTERACTION_SCRIPT = `
(function () {
  var DETAIL_DATA = JSON.parse(document.getElementById('detail-data').textContent);
  var DETAIL_FIELD_LABELS = ${JSON.stringify(DETAIL_FIELD_LABELS)};

  function closeDetailPanel(section) {
    if (!section) return;
    var panel = section.querySelector('.detail-panel');
    if (panel) panel.classList.remove('active');
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
    panel.classList.add('active');
  }

  document.addEventListener('click', function (ev) {
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
      var key = storeBtn.getAttribute('data-store');
      document.querySelectorAll('.activity-btn').forEach(function (b) { b.classList.toggle('active', b === storeBtn); });
      document.querySelectorAll('.store-section').forEach(function (s) { s.classList.toggle('active', s.dataset.store === key); });
      return;
    }

    var groupBtn = ev.target.closest('[data-group-select]');
    if (groupBtn) {
      ev.preventDefault();
      var section = groupBtn.closest('.store-section');
      if (!section) return;
      var group = groupBtn.getAttribute('data-group-select');
      section.querySelectorAll('.nav-item-clickable').forEach(function (b) { b.classList.toggle('active', b === groupBtn); });
      section.querySelectorAll('.view-pane').forEach(function (v) { v.classList.toggle('active', v.dataset.group === group); });
      var label = section.querySelector('.js-group-label');
      if (label) label.textContent = group;
      closeDetailPanel(section);
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
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      var openPanel = document.querySelector('.detail-panel.active');
      if (openPanel) closeDetailPanel(openPanel.closest('.store-section'));
    }
  });
})();
`

/** Embeds `obj` as a same-document JSON blob — defends against a body string that happens to contain the literal bytes "</script" (none of `md()`'s own output can produce it, since it escapes raw HTML tokens, but a foreign document's escaped text is not this generator's to fully predict). */
function detailDataScript(obj) {
  const json = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script')
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
}) {
  const detailData = {
    ticket: ticketDetailEntries(data.tickets, repoRootHref),
    wiki: wikiDetailEntries(data.wiki, repoRootHref),
    feature: featureDetailEntries(data.features, repoRootHref),
    artifact: artifactDetailEntries(data.artifacts, artifactsBaseHref, repoRootHref),
    prd: prdDetailEntries(data.prd, repoRootHref),
  }

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${PAGE.title}</title>
<style>
${fontFaceCss}
${TEMPLATE_CSS}
${emitThemeVarBlock('v-dark', dark)}
${emitThemeVarBlock('v-light', light)}
</style>
</head>
<body class="v-dark">
<header>
<h1>${PAGE.h1}</h1>
<p>${COMMON.tokenHashCaption} <code>${escapeHtml(tokensSha256)}</code></p>
</header>
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
