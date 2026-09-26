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
import { marked, Renderer } from 'marked'

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

function md(text) {
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
const STORE_LABEL = { home: '홈', prd: 'PRD', ticket: '티켓', wiki: '위키', feature: '기능', artifact: '아티팩트' }
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

/** A store with no sidebar-group/detail-panel wiring yet (T-666 slice 1b) — still reachable from the activity bar, still says nothing false: no clickable-looking row promises a detail it cannot open. */
function plainFrame(title, bodyHtml) {
  return `<div class="frame-main-col">
<div class="topstrip"><span class="topstrip-crumb"><b>${escapeHtml(title)}</b></span></div>
<div class="frame-body"><div class="main-inner">${bodyHtml}</div></div>
</div>`
}

function statusPillClass(status) {
  if (status === 'done') return 'done'
  if (status === 'dropped') return 'abandoned'
  return 'todo' // open, or anything this generator does not recognize — neutral, never invented
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
    return '<p class="v-note">이 묶음에는 티켓이 없다.</p>'
  }
  let html =
    '<div class="table-wrap"><table><thead><tr><th>ID</th><th>slug</th><th>유형</th><th>상태</th><th>담당</th></tr></thead><tbody>\n'
  for (const t of tickets) {
    const fm = t.frontmatter
    const id = fm.id || t.rel
    html += `<tr class="detail-row" data-detail-kind="ticket" data-detail-id="${escapeHtml(id)}">`
    html += `<td class="id-col">${escapeHtml(id)}</td>`
    html += `<td>${escapeHtml(fm.slug || '')}</td>`
    html += `<td><span class="pill pill-type">${escapeHtml(fm.type || '')}</span></td>`
    html += `<td><span class="pill pill-status-${statusPillClass(fm.status)}">${escapeHtml(fm.status || '')}</span></td>`
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
<div class="sidebar-sub">티켓</div>
<button type="button" class="nav-item nav-item-clickable active" data-group-select="${escapeHtml(currentVersion)}"><span>${escapeHtml(currentVersion)}</span><span class="nav-item-count">${currentTickets.length}</span></button>
<button type="button" class="nav-item nav-item-clickable" data-group-select="backlog"><span>backlog</span><span class="nav-item-count">${backlogTickets.length}</span></button>
</nav>`

  let omittedHtml = ''
  if (tickets.omitted.length > 0) {
    omittedHtml =
      '<p class="v-note">이 두 묶음만 목록에 올린다 — 지금 열려 있는 라운드와 아직 배정 안 된 백로그. 닫힌 라운드는 목록에 없다(원본은 아래 경로에 그대로 있다):</p>\n'
    omittedHtml += '<table class="v-omitted"><thead><tr><th>bucket</th><th>tickets</th><th>bytes</th><th>path</th></tr></thead><tbody>\n'
    for (const o of tickets.omitted) {
      omittedHtml += `<tr><td><code>${escapeHtml(o.bucket)}</code></td><td>${o.count}</td><td>${fmtBytes(o.bytes)}</td><td><code>docs/tickets/${escapeHtml(o.bucket)}/</code></td></tr>\n`
    }
    omittedHtml += '</tbody></table>\n'
  }

  const body = `<div class="section-meta"><span class="count-badge">티켓 <b>${currentTickets.length + backlogTickets.length}</b>건</span></div>
<div class="view-pane active" data-group="${escapeHtml(currentVersion)}">${ticketRowsTable(currentTickets)}</div>
<div class="view-pane" data-group="backlog">${ticketRowsTable(backlogTickets)}</div>
${omittedHtml}`

  const mainCol = `<div class="frame-main-col">
<div class="topstrip"><span class="topstrip-crumb"><b>티켓 · <span class="js-group-label">${escapeHtml(currentVersion)}</span></b></span></div>
<div class="frame-body"><div class="main-inner">${body}</div></div>
<div class="detail-panel" role="dialog" aria-label="상세">
<div class="detail-panel-header"><span class="detail-panel-title"></span><button type="button" class="detail-panel-close" aria-label="닫기">${svgIcon(CLOSE_ICON_PATH, 14)}</button></div>
<div class="detail-panel-body"></div>
</div>
</div>`

  return sidebar + '\n' + mainCol
}

/** The detail-data JSON blob's "ticket" bucket — one entry per row `ticketRowsTable` drew, same loop's inputs, so no row can point at a missing entry. */
function ticketDetailEntries(tickets) {
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
      body: md(t.body),
    }
  }
  return entries
}

function ticketSection(tickets, currentVersion) {
  return storeSection('ticket', { innerHtml: ticketStoreInner(tickets, currentVersion) })
}

function wikiSection(pages) {
  let html = '<section id="wiki"><h2>위키</h2>\n'
  for (const p of pages) {
    const fm = p.frontmatter
    html += `<article class="v-wiki" id="wiki-${escapeHtml(p.rel)}">\n<h3>${escapeHtml(fm.title || p.rel)}</h3>\n`
    html += `<p class="v-path"><code>${escapeHtml(p.rel)}</code>`
    if (fm.type) html += ` · ${escapeHtml(fm.type)}`
    if (fm.status) html += ` · ${escapeHtml(fm.status)}`
    if (fm.version) html += ` · ${escapeHtml(fm.version)}`
    html += '</p>\n'
    html += `<div class="v-body">${md(p.body)}</div>\n</article>\n`
  }
  html += '</section>\n'
  return storeSection('wiki', { innerHtml: plainFrame('위키', html) })
}

function featuresSection(pages) {
  let html = '<section id="features"><h2>기능 스펙</h2>\n'
  for (const p of pages) {
    html += `<article class="v-feature" id="feature-${escapeHtml(p.rel)}">\n<h3><code>${escapeHtml(p.rel)}</code></h3>\n`
    html += `<div class="v-body">${md(p.body)}</div>\n</article>\n`
  }
  html += '</section>\n'
  return storeSection('feature', { innerHtml: plainFrame('기능', html) })
}

function prdSection(prd) {
  let html = '<section id="prd"><h2>PRD</h2>\n'
  html += `<article class="v-prd" id="prd-current">\n<div class="v-body">${md(prd.current.body)}</div>\n</article>\n`
  if (prd.closed.length > 0) {
    html += '<h3>닫힌 라운드</h3>\n'
    for (const c of prd.closed) {
      html += `<details class="v-fold"><summary><code>${escapeHtml(c.rel)}</code></summary>\n<div class="v-body">${md(c.body)}</div>\n</details>\n`
    }
  }
  html += '</section>\n'
  return storeSection('prd', { innerHtml: plainFrame('PRD', html) })
}

function artifactsSection(artifacts) {
  let html = '<section id="artifacts"><h2>산출물</h2>\n'
  html +=
    '<p class="v-note">manifest 의 모든 항목이 표에 나온다. <code>.md</code> 는 본문을 아래에 전체 인라인한다. <code>.html</code>/<code>.json</code> 은 본문을 넣지 않는다 — 그 자체로 이미 독립된 <code>file://</code> 문서이거나(html) manifest 형태의 자료라(json), 본문 없이 이 행이 「있다·어디 있다」 를 전부 말한다.</p>\n'
  html +=
    '<table class="v-artifacts"><thead><tr><th>bucket</th><th>path</th><th>ticket</th><th>kind</th><th>status</th><th>lang</th><th>added_at</th><th>inlined</th></tr></thead><tbody>\n'
  for (const e of artifacts.entries) {
    const f = e.fields
    const anchor = e.inlined ? ` <a href="#artifact-${escapeHtml(e.diskRel)}">↓</a>` : ''
    html += `<tr><td><code>${escapeHtml(f.bucket)}</code></td><td><code>${escapeHtml(f.path)}</code></td><td>${escapeHtml(f.ticket || '')}</td><td>${escapeHtml(f.kind || '')}</td><td>${escapeHtml(f.status || '')}</td><td>${escapeHtml(f.lang || '')}</td><td>${escapeHtml(f.added_at || '')}</td><td>${e.inlined ? 'yes' + anchor : 'no — ' + escapeHtml(e.diskRel)}</td></tr>\n`
  }
  html += '</tbody></table>\n'
  for (const e of artifacts.entries) {
    if (!e.inlined) continue
    html += `<article class="v-artifact" id="artifact-${escapeHtml(e.diskRel)}">\n<h3><code>${escapeHtml(e.diskRel)}</code></h3>\n`
    html += `<div class="v-body">${md(e.body)}</div>\n</article>\n`
  }
  html += '</section>\n'
  return storeSection('artifact', { innerHtml: plainFrame('산출물', html) })
}

function homeSection(data) {
  const ct = data.poState.current_task
  const ctText = ct ? `${escapeHtml(ct.ticket_id || '')} · ${escapeHtml(ct.assignee || '')}` : '(없음)'
  const html = `<section id="home"><h2>현재 상태</h2>
<table class="v-fm"><tbody>
<tr><th>stage</th><td>${escapeHtml(data.poState.stage)}</td></tr>
<tr><th>version</th><td>${escapeHtml(data.poState.version)}</td></tr>
<tr><th>current_task</th><td>${ctText}</td></tr>
<tr><th>tickets — 이번 라운드</th><td>${data.tickets.included.filter((t) => t.bucket === data.currentVersion).length}</td></tr>
<tr><th>tickets — backlog</th><td>${data.tickets.included.filter((t) => t.bucket === 'backlog').length}</td></tr>
<tr><th>tickets — 제외(닫힌 라운드)</th><td>${data.tickets.omitted.reduce((n, o) => n + o.count, 0)}</td></tr>
<tr><th>위키</th><td>${data.wiki.length}</td></tr>
<tr><th>기능 스펙</th><td>${data.features.length}</td></tr>
<tr><th>산출물</th><td>${data.artifacts.entries.length} (인라인 ${data.artifacts.entries.filter((e) => e.inlined).length})</td></tr>
</tbody></table>
<p class="v-note">홈의 작업실(사이드바 행이 가운데를 바꾸는 것 · 진행 상황 매트릭스)은 다음 슬라이스 — 지금은 이 요약표만 보인다.</p>
</section>`
  return storeSection('home', { active: true, innerHtml: plainFrame('홈', html) })
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
  var DETAIL_FIELD_LABELS = { type: '유형', status: '상태', assignee: '담당', created: '생성일' };

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
    var docHtml = fields.body ? '<div class="detail-doc body-prose">' + fields.body + '</div>' : '';
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
 */
export function renderPage({ data, dark, light, fontFaceCss, tokensSha256 }) {
  const detailData = { ticket: ticketDetailEntries(data.tickets) }

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>productune 뷰어</title>
<style>
${fontFaceCss}
${TEMPLATE_CSS}
${emitThemeVarBlock('v-dark', dark)}
${emitThemeVarBlock('v-light', light)}
</style>
</head>
<body class="v-dark">
<header>
<h1>productune — 뷰어</h1>
<p>token file sha256 <code>${escapeHtml(tokensSha256)}</code></p>
</header>
<div class="app-shell">
${activityBar('home')}
${homeSection(data)}
${prdSection(data.prd)}
${ticketSection(data.tickets, data.currentVersion)}
${wikiSection(data.wiki)}
${featuresSection(data.features)}
${artifactsSection(data.artifacts)}
</div>
${detailDataScript(detailData)}
<script>${INTERACTION_SCRIPT}</script>
</body>
</html>
`
}
