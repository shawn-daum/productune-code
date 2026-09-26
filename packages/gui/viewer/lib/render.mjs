// viewer/lib/render.mjs — builds the one-page viewer HTML.
//
// Wears the product's tokens per dispatch: imports the SAME parser the DS
// generator uses (ds/lib/parse-tokens.mjs) rather than a second one, and the
// same font-subsetting module (ds/lib/font-subset.mjs) — T-659 Outcome
// §확정 DS HTML 생성 명세: "파서 · 테마 재방출 · 글꼴 부분집합은 한 모듈이고
// T-665 뷰어 생성기가 같은 모듈로 제품의 얼굴을 입는다".
//
// No <script> anywhere in the output. A read-only, one-shot document has no
// need for one, and it is the simplest way to make two of this ticket's
// acceptance lines trivially true: "no console error" (nothing runs, nothing
// can throw) and "zero network requests" (nothing can fetch). Interactivity
// (folds, filters, a nav that highlights the visible section) is T-666's
// screens-ticket scope, built on top of this generator's data — this file
// only has to prove the data-and-size-rule pipeline works.
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

function frontmatterTable(fm) {
  const order = ['id', 'slug', 'type', 'status', 'assignee', 'feature', 'prd_item', 'deps', 'created', 'closed']
  const keys = [...order.filter((k) => k in fm), ...Object.keys(fm).filter((k) => !order.includes(k))]
  let html = '<table class="v-fm"><tbody>\n'
  for (const k of keys) {
    const v = fm[k]
    const shown = Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? '(raw)' : String(v ?? '')
    html += `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(shown)}</td></tr>\n`
  }
  html += '</tbody></table>\n'
  return html
}

function ticketSection(tickets, currentVersion) {
  let html = '<section id="tickets"><h2>티켓 — <code>' + escapeHtml(currentVersion) + '</code> · backlog</h2>\n'
  html +=
    '<p class="v-note">이 두 버킷만 본문을 전체 인라인한다 — 지금 열려 있는 라운드와 아직 배정 안 된 백로그. 닫힌 라운드의 티켓은 아래 「제외된 티켓」 을 본다.</p>\n'
  for (const t of tickets.included) {
    const fm = t.frontmatter
    const title = `${escapeHtml(fm.id || '?')} — ${escapeHtml(fm.slug || t.rel)}`
    html += `<article class="v-ticket" id="ticket-${escapeHtml(fm.id || '')}">\n<h3>${title}</h3>\n`
    html += `<p class="v-path"><code>${escapeHtml(t.rel)}</code> · bucket <code>${escapeHtml(t.bucket)}</code></p>\n`
    html += frontmatterTable(fm)
    html += `<div class="v-body">${md(t.body)}</div>\n</article>\n`
  }
  if (tickets.omitted.length > 0) {
    html += '<h3>제외된 티켓 — 닫힌 라운드</h3>\n'
    html +=
      '<p class="v-note">본문을 넣지 않았다 — 닫힌 라운드는 지금 할 일을 찾는 데 필요하지 않고, 합쳐서 수 MB 라 페이지 크기를 지배한다. 원본은 아래 경로에 그대로 있다.</p>\n'
    html += '<table class="v-omitted"><thead><tr><th>bucket</th><th>tickets</th><th>bytes</th><th>path</th></tr></thead><tbody>\n'
    for (const o of tickets.omitted) {
      html += `<tr><td><code>${escapeHtml(o.bucket)}</code></td><td>${o.count}</td><td>${fmtBytes(o.bytes)}</td><td><code>docs/tickets/${escapeHtml(o.bucket)}/</code></td></tr>\n`
    }
    html += '</tbody></table>\n'
  }
  html += '</section>\n'
  return html
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
  return html
}

function featuresSection(pages) {
  let html = '<section id="features"><h2>기능 스펙</h2>\n'
  for (const p of pages) {
    html += `<article class="v-feature" id="feature-${escapeHtml(p.rel)}">\n<h3><code>${escapeHtml(p.rel)}</code></h3>\n`
    html += `<div class="v-body">${md(p.body)}</div>\n</article>\n`
  }
  html += '</section>\n'
  return html
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
  return html
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
  return html
}

function homeSection(data) {
  const ct = data.poState.current_task
  const ctText = ct ? `${escapeHtml(ct.ticket_id || '')} · ${escapeHtml(ct.assignee || '')}` : '(없음)'
  return `<section id="home"><h2>현재 상태</h2>
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
</section>`
}

const TEMPLATE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-family);
  background: var(--bg-base);
  color: var(--text-primary);
  line-height: 1.6;
}
header {
  position: sticky;
  top: 0;
  z-index: 1;
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
nav.v-nav {
  padding: var(--space-8) var(--space-24);
  background: var(--bg-surface-on);
  border-bottom: 1px solid var(--border-item);
  font-size: 0.85rem;
}
nav.v-nav a { color: var(--text-link); margin-right: var(--space-16); text-decoration: none; }
nav.v-nav a:hover { text-decoration: underline; }
main { max-width: 960px; margin: 0 auto; padding: var(--space-24); }
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
code { font-family: var(--font-mono); font-size: 0.9em; }
.v-body :is(h1,h2,h3,h4) { margin-top: var(--space-16); }
.v-body pre { background: var(--bg-surface-on); padding: var(--space-12); border-radius: var(--radius-4); overflow-x: auto; }
.v-body table { border-collapse: collapse; }
.v-body table th, .v-body table td { border: 1px solid var(--border-item); padding: var(--space-4) var(--space-8); }
details.v-fold summary { cursor: pointer; color: var(--icon-tertiary); padding: var(--space-8) 0; }
details.v-fold[open] summary { color: var(--text-primary); }
`

/**
 * @param {object} args
 * @param {ReturnType<typeof import('./collect.mjs').collectAll>} args.data
 * @param {Map<string,string>} args.dark resolved dark token map
 * @param {Map<string,string>} args.light resolved light token map
 * @param {string} args.fontFaceCss
 * @param {string} args.tokensSha256
 */
export function renderPage({ data, dark, light, fontFaceCss, tokensSha256 }) {
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
<nav class="v-nav">
<a href="#home">현재 상태</a>
<a href="#prd">PRD</a>
<a href="#tickets">티켓</a>
<a href="#wiki">위키</a>
<a href="#features">기능 스펙</a>
<a href="#artifacts">산출물</a>
</nav>
<main>
${homeSection(data)}
${prdSection(data.prd)}
${ticketSection(data.tickets, data.currentVersion)}
${wikiSection(data.wiki)}
${featuresSection(data.features)}
${artifactsSection(data.artifacts)}
</main>
</body>
</html>
`
}
