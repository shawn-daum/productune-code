// ds/lib/render.mjs — builds the settled DS HTML page from resolved token
// maps. Per T-659 Outcome §생성 명세: page content top-to-bottom is
// ① header ② colors ③ legacy aliases ④ fonts ⑤ spacing/radius/shadow
// ⑥ components (§8 Button/Pill/Banner/Modal/Empty/List row/Table/Fold, all
// referencing only shipped token names, fixed 해요체 product sentences).
//
// "템플릿 규칙: 템플릿 CSS 에 hex · rgb 리터럴 0 — var(--…) 만." applies to
// TEMPLATE_CSS below (the static, hand-authored stylesheet) — never to the
// `--name: value;` custom-property declarations under `.ds-dark`/`.ds-light`,
// which ARE the generated token data, not template.
import { contrastRatio, contrastVerdict, parseColor } from './color.mjs'
import { COLOR_GROUP_ORDER, COLOR_GROUP_LABELS, colorGroupOf, isFontToken, isRadiusToken, isSpaceToken, isShadowToken } from './groups.mjs'

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Every var() name the (static) TEMPLATE_CSS references — for the "every
 * var() it uses is declared in the token file" generation-time check. */
export function templateCssVarNames() {
  const names = new Set()
  for (const m of TEMPLATE_CSS.matchAll(/var\(\s*--([a-zA-Z0-9-]+)\s*\)/g)) names.add(m[1])
  return names
}

export function templateCssHasHexOrRgbLiteral() {
  // A literal hex color OR a literal rgb()/rgba() FUNCTION CALL (not the
  // `--name` custom-property identifiers, which legitimately start with
  // "--" and may contain hyphens — this only flags `#`-hex tokens and an
  // actual `rgb(`/`rgba(` call written directly in the template).
  return /#[0-9a-fA-F]{3,8}\b/.test(TEMPLATE_CSS) || /\brgba?\(/.test(TEMPLATE_CSS)
}

function emitThemeVarBlock(className, resolvedMap) {
  const lines = [...resolvedMap.entries()].map(([name, value]) => `  --${name}: ${value};`)
  return `.${className} {\n${lines.join('\n')}\n}`
}

function pairRow(name, value, accentRaw) {
  const fg = parseColor(value)
  const bg = accentRaw ? parseColor(accentRaw) : null
  if (!fg || !bg || fg.a < 1 || bg.a < 1) return null
  const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100
  const verdict = ratio >= 4.5 ? 'Pass' : 'Fail'
  const sample = `<span class="ds-swatch ds-pair-sample" style="background-color:var(--accent);color:var(--${name})">Aa</span>`
  return `<tr><td>${sample}</td><td><code>--${name}</code></td><td><code>${escapeHtml(value)}</code></td><td>${ratio.toFixed(2)}:1 vs --accent<br><small>글자색 — <code>--accent</code> 위에서 잰다 (surface 대비 아님)</small></td><td>${verdict}</td></tr>\n`
}

function colorRows(resolvedMap, baseOpaque, legacyAliasNames) {
  const byGroup = new Map()
  for (const [name, value] of resolvedMap) {
    if (legacyAliasNames.has(name)) continue
    if (isFontToken(name) || isRadiusToken(name) || isSpaceToken(name) || isShadowToken(name)) continue
    const group = colorGroupOf(name)
    if (!group) continue
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group).push([name, value])
  }
  let html = ''
  for (const group of COLOR_GROUP_ORDER) {
    const rows = byGroup.get(group)
    if (!rows || rows.length === 0) continue
    html += `<h3>${escapeHtml(COLOR_GROUP_LABELS[group])}</h3>\n`
    html += '<table class="ds-color-table"><thead><tr><th>Swatch</th><th>Name</th><th>Value</th><th>Contrast vs --bg-surface-base</th><th>Verdict</th></tr></thead><tbody>\n'
    for (const [name, value] of rows) {
      if (name === 'accent-contrast') {
        // text-on-accent token: measured as the pair against --accent, never against the surface.
        const pair = pairRow(name, value, resolvedMap.get('accent'))
        if (pair) { html += pair; continue }
      }
      const verdict = contrastVerdict(value, baseOpaque)
      const ratioText = verdict ? `${verdict.ratio}:1` : '—'
      const verdictText = verdict ? verdict.verdict : '(not a color)'
      html += `<tr><td><span class="ds-swatch" style="background-color:var(--${name})"></span></td><td><code>--${name}</code></td><td><code>${escapeHtml(value)}</code></td><td>${escapeHtml(ratioText)}</td><td>${escapeHtml(verdictText)}</td></tr>\n`
    }
    html += '</tbody></table>\n'
  }
  return html
}

function aliasSection(darkRaw, legacyAliasNames) {
  if (legacyAliasNames.size === 0) return ''
  let html = '<h2>Legacy aliases</h2>\n<ul class="ds-alias-list">\n'
  for (const name of legacyAliasNames) {
    const raw = darkRaw.get(name) ?? ''
    const target = (raw.match(/^var\(\s*--([a-zA-Z0-9-]+)\s*\)$/) || [])[1]
    html += `<li><code>--${name}</code> &rarr; <code>--${target ?? escapeHtml(raw)}</code></li>\n`
  }
  html += '</ul>\n'
  return html
}

function fontSection() {
  return `
<h3>Fonts</h3>
<p class="ds-font-sample" style="font-family:var(--font-family); font-weight:400;">가나다라 Aa Bb Cc 123 — <code>var(--font-family)</code> · 400</p>
<p class="ds-font-sample" style="font-family:var(--font-family); font-weight:600;">가나다라 Aa Bb Cc 123 — <code>var(--font-family)</code> · 600</p>
<p class="ds-font-sample ds-font-mono" style="font-family:var(--font-mono);">가나다라 Aa Bb Cc 123 — <code>var(--font-mono)</code></p>
`
}

function dimensionSection(resolvedMap) {
  let html = '<h3>Spacing</h3>\n'
  for (const [name, value] of resolvedMap) {
    if (!isSpaceToken(name)) continue
    html += `<div class="ds-space-row"><code>--${name}</code><div class="ds-space-bar" style="width:var(--${name})"></div><span>${escapeHtml(value)}</span></div>\n`
  }
  html += '<h3>Radius</h3>\n<div class="ds-radius-grid">\n'
  for (const [name, value] of resolvedMap) {
    if (!isRadiusToken(name)) continue
    html += `<div class="ds-radius-box" style="border-radius:var(--${name})"><span>--${name}<br>${escapeHtml(value)}</span></div>\n`
  }
  html += '</div>\n<h3>Shadow</h3>\n<div class="ds-shadow-grid">\n'
  for (const [name, value] of resolvedMap) {
    if (!isShadowToken(name)) continue
    html += `<div class="ds-shadow-box" style="box-shadow:var(--${name})"><span>--${name}</span></div>\n`
  }
  html += '</div>\n'
  return html
}

// §8 component recipes, shipped token names only. Sample copy is fixed
// 해요체 product-voice text (T-659 Outcome §생성 명세: "견본 문구는 해요체
// 제품 문장 … 을 템플릿에 고정").
function componentSection() {
  return `
<h3>Button</h3>
<button class="ds-btn ds-btn-primary" type="button">저장</button>
<button class="ds-btn ds-btn-secondary" type="button">취소</button>
<button class="ds-btn ds-btn-destructive" type="button">삭제</button>

<h3>Pill</h3>
<span class="ds-pill ds-pill-accent">진행 중</span>
<span class="ds-pill ds-pill-success">완료</span>

<h3>Banner</h3>
<div class="ds-banner">티켓 3건을 닫았어요.</div>
<div class="ds-banner ds-banner-warn">대비 기준(4.5:1) 미달 토큰이 있어요.</div>

<h3>Modal</h3>
<div class="ds-modal">
  <p>티켓 3건을 삭제할까요?</p>
  <button class="ds-btn ds-btn-secondary" type="button">취소</button>
  <button class="ds-btn ds-btn-destructive" type="button">삭제</button>
</div>

<h3>Empty state</h3>
<div class="ds-empty">아직 히스토리가 없어요.</div>

<h3>List row</h3>
<ul class="ds-list">
  <li class="ds-list-row"><span>T-689 — 확정 DS HTML 생성</span><span class="ds-meta">developer</span></li>
  <li class="ds-list-row"><span>T-665 — 뷰어</span><span class="ds-meta">designer</span></li>
</ul>

<h3>Table</h3>
<table class="ds-demo-table">
  <thead><tr><th>ticket</th><th>status</th></tr></thead>
  <tbody>
    <tr><td>T-689</td><td>in progress</td></tr>
    <tr><td>T-665</td><td>todo</td></tr>
  </tbody>
</table>

<h3>Fold</h3>
<details class="ds-fold">
  <summary>세부 정보</summary>
  <div class="ds-fold-body">티켓 3건을 닫았어요.</div>
</details>
`
}

function renderThemePanel(themeKey, label, resolvedMap, legacyAliasNames) {
  const baseRaw = resolvedMap.get('bg-surface-base')
  const baseColor = baseRaw ? parseColor(baseRaw) : null
  const baseOpaque = baseColor && baseColor.a >= 1 ? baseColor : { r: 0, g: 0, b: 0, a: 1 }
  return `
<section class="ds-panel ds-${themeKey}">
  <h2>${escapeHtml(label)}</h2>
  <div class="ds-colors">
    ${colorRows(resolvedMap, baseOpaque, legacyAliasNames)}
  </div>
  <div class="ds-fonts">
    ${fontSection()}
  </div>
  <div class="ds-dimensions">
    ${dimensionSection(resolvedMap)}
  </div>
  <div class="ds-components">
    ${componentSection()}
  </div>
</section>`
}

const TEMPLATE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-family);
  background: var(--bg-base);
  color: var(--text-primary);
  line-height: 1.5;
}
header {
  padding: var(--space-16) var(--space-24);
  border-bottom: 1px solid var(--border-section);
}
header h1 { font-size: 1.25rem; margin: 0 0 var(--space-4) 0; }
header p { margin: 0; color: var(--text-tertiary); font-size: 0.85rem; }
header code { font-family: var(--font-mono); }
main.ds-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-24);
  padding: var(--space-24);
  align-items: flex-start;
}
section.ds-panel {
  flex: 1 1 480px;
  min-width: 360px;
  background: var(--bg-surface-base);
  border: 1px solid var(--border-section);
  border-radius: var(--radius-12);
  padding: var(--space-16);
}
section.ds-panel h2 { margin-top: 0; }
section.ds-panel h3 { margin-bottom: var(--space-8); }
table.ds-color-table, table.ds-demo-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: var(--space-16);
  font-size: 0.85rem;
}
table.ds-color-table th, table.ds-color-table td,
table.ds-demo-table th, table.ds-demo-table td {
  text-align: left;
  padding: var(--space-4) var(--space-8);
  border-bottom: 1px solid var(--border-item);
}
table.ds-demo-table th {
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-section);
}
table.ds-color-table code, table.ds-demo-table code, .ds-alias-list code {
  font-family: var(--font-mono);
}
.ds-swatch {
  display: inline-block;
  width: 28px;
  height: 20px;
  border-radius: var(--radius-4);
  border: 1px solid var(--border-inline);
}
.ds-pair-sample { width: auto; min-width: 28px; padding: 0 var(--space-4); text-align: center; font-weight: 600; font-size: 0.8rem; line-height: 20px; }
.ds-alias-list { list-style: none; padding: 0; margin: 0; font-family: var(--font-mono); font-size: 0.85rem; }
.ds-alias-list li { padding: var(--space-4) 0; border-bottom: 1px solid var(--border-item); }
.ds-font-sample { padding: var(--space-8) 0; margin: 0; }
.ds-space-row, .ds-radius-row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-4) 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.ds-space-bar { height: 12px; background: var(--accent); border-radius: var(--radius-4); }
.ds-radius-grid, .ds-shadow-grid { display: flex; flex-wrap: wrap; gap: var(--space-12); margin-bottom: var(--space-16); }
.ds-radius-box {
  width: 80px;
  height: 64px;
  background: var(--bg-interaction-neutral);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.65rem;
  font-family: var(--font-mono);
}
.ds-shadow-box {
  width: 96px;
  height: 56px;
  background: var(--bg-surface-on);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-8);
  font-size: 0.7rem;
  font-family: var(--font-mono);
}
.ds-btn {
  display: inline-block;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-8);
  padding: var(--space-8) var(--space-16);
  font-family: var(--font-family);
  font-weight: 600;
  margin: 0 var(--space-8) var(--space-8) 0;
}
.ds-btn-primary { background: var(--accent); color: var(--accent-contrast); }
.ds-btn-secondary { background: var(--bg-interaction-neutral); color: var(--text-primary); border: 1px solid var(--border-inline); }
.ds-btn-destructive { background: var(--health-error); color: var(--text-static-white); }
.ds-pill {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-100);
  padding: var(--space-4) var(--space-12);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 0 var(--space-8) var(--space-8) 0;
}
.ds-pill-accent { background: var(--accent-subtle); color: var(--accent); }
.ds-pill-success { background: var(--health-success-subtle); color: var(--health-success); }
.ds-banner {
  border-bottom: 1px solid var(--border-section);
  background: var(--bg-surface-on);
  color: var(--text-secondary);
  padding: var(--space-8) var(--space-12);
  border-radius: var(--radius-4);
  margin-bottom: var(--space-8);
}
.ds-banner-warn {
  background: var(--health-warn-subtle);
  color: var(--text-primary);
  border-left: 3px solid var(--health-warn);
  border-bottom: none;
}
.ds-modal {
  background: var(--bg-layer-popup);
  box-shadow: var(--shadow-high);
  border-radius: var(--radius-8);
  padding: var(--space-16);
  max-width: 320px;
  margin-bottom: var(--space-8);
}
.ds-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: var(--space-24);
  border: 1px dashed var(--border-inline);
  border-radius: var(--radius-8);
}
.ds-list { list-style: none; margin: 0 0 var(--space-16) 0; padding: 0; border-top: 1px solid var(--border-item); }
.ds-list-row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-4);
  border-bottom: 1px solid var(--border-item);
}
.ds-list-row:hover { background: var(--bg-state-hover); }
.ds-list-row .ds-meta { color: var(--text-tertiary); font-size: 0.8rem; margin-left: auto; }
details.ds-fold summary { cursor: pointer; color: var(--icon-tertiary); padding: var(--space-8) 0; }
details.ds-fold[open] summary { color: var(--text-primary); }
details.ds-fold .ds-fold-body { padding: var(--space-8) 0; color: var(--text-secondary); }
`

/**
 * @param {object} args
 * @param {string} args.tokensRelPath repo-relative path shown in the header
 * @param {string} args.tokensSha256 hex sha256 of the token file bytes
 * @param {string} args.genCommand the literal command shown in the header
 *   ("pnpm --filter @productune/gui ds") — never the actual invocation, so
 *   this stays byte-stable across environments/dates.
 * @param {Map<string,string>} args.darkRaw
 * @param {Map<string,string>} args.dark resolved
 * @param {Map<string,string>} args.light resolved
 * @param {Set<string>} args.legacyAliasNames
 * @param {string} args.fontFaceCss two @font-face rules, or '' before the
 *   font-subsetting pass runs (used only to size the first content pass).
 */
export function renderPage({ tokensRelPath, tokensSha256, genCommand, darkRaw, dark, light, legacyAliasNames, fontFaceCss }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>productune GUI 확정 디자인 시스템</title>
<style>
${fontFaceCss}
${TEMPLATE_CSS}
${emitThemeVarBlock('ds-dark', dark)}
${emitThemeVarBlock('ds-light', light)}
</style>
</head>
<body class="ds-dark">
<header>
<h1>productune GUI — 확정 디자인 시스템</h1>
<p>token file: <code>${escapeHtml(tokensRelPath)}</code> · sha256 <code>${escapeHtml(tokensSha256)}</code></p>
<p>generate: <code>${escapeHtml(genCommand)}</code></p>
</header>
<main class="ds-grid">
${renderThemePanel('dark', 'Dark', dark, legacyAliasNames)}
${renderThemePanel('light', 'Light', light, legacyAliasNames)}
</main>
${aliasSection(darkRaw, legacyAliasNames)}
</body>
</html>
`
}
