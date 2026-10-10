// viewer/lib/discipline-load.mjs — T-1050: the load diagram at the top of 규율 「전체」.
//
// Generated at viewer build from the real sources, never drawn by hand:
//   - session-start parts: `prdt-session-start.sh --plan <persona>` (the same
//     numbers `prdt doctor` reads), run against a throwaway PRDT_HOME so the
//     real tool home is never touched;
//   - cold triggers: each `contracts/*.md` annex's frontmatter `when:` and each
//     persona's `playbooks/_index.md` menu rows (both from the applied copy);
//   - hooks: `scripts/hook-manifest.json` (registrations, matchers).
// A fact a source does not carry (which persona a hook acts for, what a layer
// reads) lives in labels.mjs DISCIPLINE_LOAD. Missing source → that lane says so.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './frontmatter.mjs'
import { DISCIPLINE_LOAD as L } from './labels.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '../../core')
export const DEFAULT_HOOK_MANIFEST = path.join(CORE_ROOT, 'scripts/hook-manifest.json')
export const DEFAULT_PLAN_SCRIPT = path.join(CORE_ROOT, 'scripts/hooks/prdt-session-start.sh')
const PERSONAS = L.personas.map((p) => p[0])
const PART_HOOK = /^prdt-(session-start(-p\d+)?|post-compact)\.sh$/

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function partLabel(piece) {
  const base = String(piece.label).replace(/ playbook menu$/, ' 메뉴')
  return piece.of > 1 ? `${base} ${piece.piece}/${piece.of}` : base
}

/** `--plan <persona>` JSON, or null when it cannot run. Never writes under the real PRDT_HOME. */
function runPlan(planScript, realRoot, persona) {
  if (!fs.existsSync(planScript)) return null
  let scratch = null
  try {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-viewer-plan-'))
    const doctrine = [path.join(realRoot, '..', 'doctrine.md'), path.join(CORE_ROOT, 'doctrine.md')].map(readText).find((t) => t && t.trim())
    if (doctrine) fs.writeFileSync(path.join(scratch, 'doctrine.md'), doctrine)
    const r = spawnSync('bash', [planScript, '--plan', persona], {
      input: '',
      encoding: 'utf8',
      timeout: 20000,
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: scratch, PRDT_HOME: scratch, PRDT_DISCIPLINE: realRoot },
    })
    if (r.status !== 0) return null
    const plan = JSON.parse(r.stdout)
    if (!plan || !Array.isArray(plan.parts)) return null
    return {
      limitBytes: plan.budget_bytes,
      parts: plan.parts.map((p) => ({ n: p.n, bytes: p.bytes, limit: p.limit, pieces: (p.pieces || []).map(partLabel) })),
    }
  } catch {
    return null
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
  }
}

/** Rows of a generated `playbooks/_index.md` menu table: [{name, when}]. */
function menuRows(text) {
  const rows = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue
    // a `|` inside a cell would be escaped as `\|` by the generator
    const cells = line.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
    if (cells.length < 2 || cells[0] === 'playbook' || /^-+$/.test(cells[0])) continue
    rows.push({ name: cells[0], when: cells[1] })
  }
  return rows
}

function collectAnnex(realRoot) {
  const dir = path.join(realRoot, 'contracts')
  let names = []
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort()
  } catch {
    return []
  }
  const out = []
  for (const f of names) {
    const raw = readText(path.join(dir, f))
    if (raw === null) continue
    const when = parseFrontmatter(raw).data.when
    out.push({ name: f.replace(/\.md$/, ''), path: `contracts/${f}`, when: typeof when === 'string' ? when : '' })
  }
  return out
}

// Reading order = the order a session meets them; an event not listed keeps manifest order after these.
const EVENT_ORDER = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolBatch', 'Stop', 'SubagentStart', 'SubagentStop']
const eventRank = (e) => (EVENT_ORDER.includes(e) ? EVENT_ORDER.indexOf(e) : EVENT_ORDER.length)

/** Hook roster from the manifest: lane 1 events + layers, lane 3 event rows. */
function collectHooks(manifestPath) {
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
  const regs = Array.isArray(manifest.registrations) ? manifest.registrations : []
  const sessionEvents = []
  const layers = new Map()
  const layerNames = new Set()
  for (const r of regs) {
    if (r.event !== 'SessionStart') continue
    const hooks = r.hooks || []
    if (hooks.some((h) => PART_HOOK.test(h))) sessionEvents.push(`${r.event} ${r.matcher ?? ''}`.trim())
    for (const h of hooks) if (!PART_HOOK.test(h)) layerNames.add(h)
  }
  for (const r of regs) {
    if (r.event !== 'SessionStart' && r.event !== 'SubagentStart') continue
    for (const h of r.hooks || []) {
      if (!layerNames.has(h)) continue
      const e = layers.get(h) ?? []
      e.push(`${r.event} ${r.matcher ?? ''}`.trim())
      layers.set(h, e)
    }
  }
  const subagentStart = regs.filter((r) => r.event === 'SubagentStart' && (r.hooks || []).some((h) => PART_HOOK.test(h))).map((r) => `${r.event} ${r.matcher ?? ''}`.trim())
  const events = []
  for (const r of regs) {
    if (r.event === 'SessionStart') continue
    let row = events.find((e) => e.event === r.event)
    if (!row) events.push((row = { event: r.event, hooks: [] }))
    for (const h of r.hooks || []) {
      if (PART_HOOK.test(h) || layerNames.has(h)) continue
      let hk = row.hooks.find((x) => x.name === h)
      if (!hk) row.hooks.push((hk = { name: h, matchers: [] }))
      const m = r.matcher ?? L.lane3.allMatcher
      if (!hk.matchers.includes(m)) hk.matchers.push(m)
    }
  }
  const sessionStartEvents = [...sessionEvents, ...subagentStart.filter((e) => !sessionEvents.includes(e))]
  return {
    sessionEvents: sessionStartEvents,
    layers: [...layers.entries()].map(([name, evs]) => ({ name, events: evs })),
    events: events.filter((e) => e.hooks.length > 0).sort((a, b) => eventRank(a.event) - eventRank(b.event)),
  }
}

/**
 * @param {string} repoRoot unused today (kept so the call shape matches collectDiscipline)
 * @param {{disciplineRoot: string, manifestPath?: string, planScript?: string}} opts
 * @returns {null | {plans: object, annex: object[], menus: object, hooks: null | object}}
 */
export function collectDisciplineLoad(repoRoot, { disciplineRoot, manifestPath = DEFAULT_HOOK_MANIFEST, planScript = DEFAULT_PLAN_SCRIPT } = {}) {
  let realRoot
  try {
    realRoot = fs.realpathSync(disciplineRoot)
    if (!fs.statSync(realRoot).isDirectory()) return null
  } catch {
    return null
  }
  const plans = {}
  const menus = {}
  for (const persona of PERSONAS) {
    plans[persona] = runPlan(planScript, realRoot, persona)
    menus[persona] = menuRows(readText(path.join(realRoot, persona, 'playbooks', '_index.md')))
  }
  return { plans, annex: collectAnnex(realRoot), menus, hooks: collectHooks(manifestPath) }
}

// ---------- render ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
const attr = (d) => esc(JSON.stringify(d))

function item(cls, detail, inner, extra = '') {
  return `<button type="button" class="${cls}${extra}" data-dl-item="${attr(detail)}">${inner}</button>`
}

function partHtml(plan, persona) {
  if (!plan) return `<p class="dl-note">${esc(L.planMissing)}</p>`
  const hookFile = (n) => (n === 1 ? 'prdt-session-start.sh' : `prdt-session-start-p${n}.sh`)
  const rows = plan.parts.map((p) =>
    item('dl-part', {
      t: fill(L.lane1.part, { N: p.n }) + ' · ' + p.pieces.join(' · '),
      p: `~/.prdt/hooks/${hookFile(p.n)}`,
      s: p.bytes == null ? '' : fill(L.partDetail, { L: p.limit, B: p.bytes }),
    }, `<span class="dl-pn">${esc(fill(L.lane1.part, { N: p.n }))}</span>${esc(p.pieces.join(' · '))}`)).join('')
  return `<div class="dl-g">${esc(fill(L.lane1.parts, { N: plan.parts.length }))}</div>${rows}`
}

function lane1(load) {
  const hooks = load.hooks
  const evs = hooks ? hooks.sessionEvents.map((e) => `<span class="dl-ev">${esc(e)}</span>`).join('') : ''
  const parts = PERSONAS.map((p) => `<div data-dl-persona="${p}">${partHtml(load.plans[p], p)}</div>`).join('')
  let layers = ''
  if (hooks && hooks.layers.length > 0) {
    layers = `<div class="dl-g">${esc(L.lane1.layers)}</div>` + hooks.layers.map((h) => {
      const meta = L.layers[h.name] ?? [h.name, 'all', '']
      const po = meta[1] === 'po'
      return item('dl-layer', { t: meta[0], p: h.name, e: h.events.join(' · '), r: meta[2], o: po ? L.detail.poOnly : '' },
        `<span>${esc(meta[0])}</span><span class="dl-who">${esc(po ? L.scopePo : L.scopeAll)}</span>`, po ? ' dl-po-only' : '')
    }).join('')
  } else if (!hooks) layers = `<p class="dl-note">${esc(L.manifestMissing)}</p>`
  return `<div class="dl-lane"><p class="dl-lh">${esc(L.lane1.head)}</p><p class="dl-ls">${esc(L.lane1.sub)}</p>${evs}${parts}${layers}</div>`
}

function lane2(load) {
  const annex = load.annex.map((a) => item('dl-cold', { t: a.path, p: a.path, w: a.when, n: L.annexNote },
    `<b>${esc(a.path)}</b><span class="dl-w">${esc(a.when)}</span>`)).join('')
  const pbs = PERSONAS.map((persona) => {
    const rows = load.menus[persona] ?? []
    return `<div data-dl-persona="${persona}"><div class="dl-g">${esc(fill(L.lane2.playbooks, { P: persona, N: rows.length }))}</div>` +
      rows.map((r) => item('dl-cold', { t: `${persona}/playbooks/${r.name}.md`, p: `${persona}/playbooks/${r.name}.md`, w: r.when, n: L.menuNote },
        `<b>${esc(`${persona}/playbooks/${r.name}.md`)}</b><span class="dl-w">${esc(r.when)}</span>`)).join('') + `</div>`
  }).join('')
  const ov = item('dl-cold', { t: L.lane2.override, p: L.overrideItem[0], w: L.overrideItem[1], n: L.overrideDetail },
    `<b>${esc(L.overrideItem[0])}</b><span class="dl-w">${esc(L.overrideItem[1])}</span>`)
  return `<div class="dl-lane"><p class="dl-lh">${esc(L.lane2.head)}</p><p class="dl-ls">${esc(L.lane2.sub)}</p>` +
    `<div class="dl-g">${esc(fill(L.lane2.annex, { N: load.annex.length }))}</div>${annex}${pbs}<div class="dl-g">${esc(L.lane2.override)}</div>${ov}</div>`
}

function lane3(load) {
  const hooks = load.hooks
  let body
  if (!hooks) body = `<p class="dl-note">${esc(L.manifestMissing)}</p>`
  else {
    body = hooks.events.map((e) => `<div class="dl-evrow"><div class="dl-evn">${esc(e.event)}</div>` + e.hooks.map((h) => {
      const po = L.poOnlyHooks.includes(h.name)
      const m = h.matchers.join(' · ')
      return item('dl-hk', { t: h.name, e: e.event, m, o: po ? L.detail.poOnly : '' },
        `<span class="dl-nm">${esc(h.name.replace(/^prdt-/, '').replace(/\.sh$/, ''))}</span><span class="dl-m">${esc(m)}</span>`, po ? ' dl-po-only' : '')
    }).join('') + '</div>').join('')
    body += `<p class="dl-ls dl-dimnote"><span data-dl-persona="po">${esc(L.lane3.dimNoneForPo)}</span>` +
      ['designer', 'developer', 'qa'].map((p) => `<span data-dl-persona="${p}">${esc(L.lane3.dimForOthers)}</span>`).join('') + '</p>'
  }
  return `<div class="dl-lane"><p class="dl-lh">${esc(L.lane3.head)}</p><p class="dl-ls">${esc(L.lane3.sub)}</p>${body}</div>`
}

function precedence() {
  const P = L.precedence
  const steps = P.steps.map((s, i) => `<div class="dl-pstep${i === P.steps.length - 1 ? ' dl-top' : ''}">${esc(s[0])}<small>${esc(s[1])}</small></div>`).join('<span class="dl-plt">&lt;</span>')
  return `<div class="dl-prec"><div class="dl-ph">${esc(P.head)} <span class="dl-pn2">${esc(P.hint)}</span></div><div class="dl-prow">${steps}</div><div class="dl-floor">${esc(P.floor)}</div></div>`
}

/** The card for 「전체」 — '' when there is nothing to draw from. */
export function disciplineLoadCard(load) {
  if (!load) return ''
  const chips = L.personas.map(([k, label], i) => `<button type="button" class="dl-pchip" data-dl-who="${k}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(label)}</button>`).join('')
  return `<div class="dl-card" data-dl-card data-dl-persona-now="${L.personas[0][0]}">` +
    `<div class="dl-h"><b>${esc(L.title)}</b><span class="dl-pchips">${chips}</span></div>` +
    `<p class="dl-src">${esc(L.source)} <code>hook-manifest.json</code> · <code>prdt-session-start.sh --plan</code> · <code>when:</code> · ${esc(L.sourceNote)}</p>` +
    `<div class="dl-lanes">${lane1(load)}${lane2(load)}${lane3(load)}</div>${precedence()}` +
    `<div class="dl-detail" data-dl-detail aria-live="polite">${esc(L.detailHint)}</div></div>\n`
}

// ---------- css / script (tokens only, no literals) ----------

const personaRules = PERSONAS.map((p) => `.dl-card[data-dl-persona-now="${p}"] [data-dl-persona]:not([data-dl-persona="${p}"]) { display: none; }`).join('\n')

export const DISCIPLINE_LOAD_CSS = `
/* T-1050: discipline load diagram (docs/artifacts/v1.13/observation-fixes.html 「규율 로드 그림」) */
.dl-card { border: 1px solid var(--border-item); border-radius: 10px; background: var(--bg-surface-base); padding: 14px; margin: 0 0 var(--space-16); }
.dl-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 4px; }
.dl-h b { font-size: 14px; }
.dl-src { font-size: 11px; color: var(--text-tertiary); margin: 0 0 12px; }
.dl-src code { font-family: var(--font-mono); font-size: 10.5px; }
.dl-pchips { display: inline-flex; gap: 4px; margin-left: auto; }
.dl-pchip { font: inherit; font-size: 11.5px; border: 1px solid var(--border-inline); border-radius: 100px; background: var(--bg-surface-base); color: var(--text-secondary); padding: 2px 10px; cursor: pointer; }
.dl-pchip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
.dl-pchip:focus-visible, .dl-part:focus-visible, .dl-layer:focus-visible, .dl-cold:focus-visible, .dl-hk:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dl-lanes { display: grid; grid-template-columns: 1.05fr 1.15fr 1.2fr; gap: 12px; }
@media (max-width: 900px) { .dl-lanes { grid-template-columns: 1fr; } }
.dl-lane { min-width: 0; border: 1px solid var(--border-item); border-radius: 10px; background: var(--bg-base); padding: 10px; }
.dl-lh { font-size: 12px; font-weight: 700; margin: 0 0 2px; }
.dl-ls { font-size: 11px; color: var(--text-tertiary); margin: 0 0 8px; }
.dl-note { font-size: 11px; color: var(--text-tertiary); margin: 0; }
.dl-ev { display: inline-block; font-family: var(--font-mono); font-size: 10px; border-radius: 4px; padding: 1px 6px; background: var(--bg-interaction-neutral); color: var(--text-secondary); margin: 0 4px 4px 0; }
.dl-g { font-size: 10.5px; color: var(--text-tertiary); margin: 8px 0 4px; font-weight: 600; }
.dl-part, .dl-layer, .dl-cold, .dl-hk { font: inherit; text-align: left; color: inherit; cursor: pointer; }
.dl-part { display: block; width: 100%; border: 1px solid var(--accent); border-radius: 8px; background: var(--bg-surface-base); padding: 5px 8px; margin: 0 0 5px; font-size: 11.5px; }
.dl-pn { font-family: var(--font-mono); font-size: 10px; color: var(--accent); margin-right: 6px; font-weight: 700; }
.dl-layer { display: flex; width: 100%; justify-content: space-between; gap: 6px; border: 1px dashed var(--border-inline); border-radius: 8px; padding: 4px 8px; margin: 0 0 5px; font-size: 11.5px; background: var(--bg-surface-base); }
.dl-who { font-size: 10px; color: var(--text-tertiary); text-align: right; }
.dl-cold { display: block; width: 100%; background: none; border: 0; border-left: 2px solid var(--border-inline); padding: 3px 0 3px 8px; margin: 0 0 4px; font-size: 11.5px; }
.dl-cold b { font-family: var(--font-mono); font-size: 11px; font-weight: 600; }
.dl-w { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-tertiary); font-size: 10.5px; line-height: 1.45; font-family: var(--font-mono); }
.dl-evrow { border-top: 1px solid var(--border-item); padding: 6px 0; }
.dl-evrow:first-child { border-top: 0; }
.dl-evn { font-family: var(--font-mono); font-size: 11px; font-weight: 700; margin-bottom: 3px; }
.dl-hk { max-width: 100%; flex-wrap: wrap; display: inline-flex; gap: 4px; align-items: baseline; border: 1px solid var(--border-inline); border-radius: 6px; padding: 1px 6px; margin: 0 4px 4px 0; font-size: 11px; background: var(--bg-surface-base); }
.dl-m { word-break: break-all; font-family: var(--font-mono); font-size: 9.5px; color: var(--text-tertiary); }
.dl-nm { font-family: var(--font-mono); font-size: 10.5px; }
.dl-card:not([data-dl-persona-now="po"]) .dl-po-only { opacity: .35; }
.dl-dimnote { margin: 6px 0 0; }
${personaRules}
.dl-prec { margin-top: 12px; border: 1px solid var(--border-item); border-radius: 10px; background: var(--bg-base); padding: 10px 12px; }
.dl-ph { font-size: 12px; font-weight: 700; }
.dl-pn2 { font-size: 11px; font-weight: 400; color: var(--text-tertiary); }
.dl-prow { display: flex; align-items: stretch; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.dl-pstep { border: 1px solid var(--border-inline); border-radius: 8px; padding: 5px 9px; font-size: 11.5px; background: var(--bg-surface-base); }
.dl-pstep small { display: block; font-size: 10px; color: var(--text-tertiary); }
.dl-pstep.dl-top { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.dl-plt { align-self: center; color: var(--text-quaternary); font-size: 12px; }
.dl-floor { margin-top: 8px; font-size: 11.5px; color: var(--text-secondary); border: 1px solid color-mix(in srgb, var(--status-blocked) 40%, transparent); background: color-mix(in srgb, var(--status-blocked) 6%, transparent); border-radius: 8px; padding: 5px 9px; }
.dl-detail { margin-top: 10px; font-size: 11.5px; border: 1px solid var(--border-item); border-radius: 8px; background: var(--bg-surface-base); padding: 8px 10px; min-height: 38px; color: var(--text-secondary); }
.dl-detail code { font-family: var(--font-mono); font-size: 10.5px; }
.dl-detail div { margin: 1px 0; }
.dl-detail .dl-dk { color: var(--text-tertiary); margin-right: 6px; }
`

const DETAIL_LABELS = { p: L.detail.path, e: L.detail.event, m: L.detail.matcher, w: L.detail.when, r: L.detail.reads, s: L.detail.size }

export const DISCIPLINE_LOAD_SCRIPT = `
(function () {
  var card = document.querySelector('[data-dl-card]');
  if (!card) return;
  var HINT = ${JSON.stringify(L.detailHint)};
  var LABELS = ${JSON.stringify(DETAIL_LABELS)};
  var box = card.querySelector('[data-dl-detail]');
  function show(d) {
    box.textContent = '';
    var t = document.createElement('div');
    var b = document.createElement('b');
    b.textContent = d.t;
    t.appendChild(b);
    box.appendChild(t);
    ['p', 'e', 'm', 'w', 'r', 's'].forEach(function (k) {
      if (!d[k]) return;
      var row = document.createElement('div');
      var key = document.createElement('span');
      key.className = 'dl-dk';
      key.textContent = LABELS[k];
      var val = document.createElement('code');
      val.textContent = d[k];
      row.appendChild(key);
      row.appendChild(val);
      box.appendChild(row);
    });
    var note = d.o || d.n;
    if (note) {
      var n = document.createElement('div');
      n.textContent = note;
      box.appendChild(n);
    }
  }
  card.addEventListener('click', function (ev) {
    var chip = ev.target.closest('[data-dl-who]');
    if (chip) {
      card.setAttribute('data-dl-persona-now', chip.getAttribute('data-dl-who'));
      card.querySelectorAll('[data-dl-who]').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      box.textContent = HINT;
      return;
    }
    var it = ev.target.closest('[data-dl-item]');
    if (!it) return;
    try { show(JSON.parse(it.getAttribute('data-dl-item'))); } catch (e) { box.textContent = HINT; }
  });
})();
`
