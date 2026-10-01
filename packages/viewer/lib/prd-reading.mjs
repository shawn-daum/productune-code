// viewer/lib/prd-reading.mjs — the open PRD's reading screen (T-884, design T-860 / approved T-874,
// mockup docs/artifacts/v1.12/prd-reading.html): a side outline of the ## / ### / #### hierarchy,
// foldable sections, a 「결정할 것」 box (남은 질문 + decision tickets) and What item cards.
//
// Everything here is generation-time and pure: PRD markdown in, HTML string out. The helpers that
// live in render.mjs (markdown renderer, escaping, version compare, assignee pill) are passed in as
// `deps`, so this module has no import cycle with it. Copy comes from labels.mjs (PRD_READING).
// The browser side (folds, outline jump, scroll spy) is PRD_READING_SCRIPT, spliced into the one
// hash-pinned INTERACTION_SCRIPT, so the CSP does not change.

import { PRD_READING as L } from './labels.mjs'

const HEADING_RE = /^(#{1,4})\s+(.*?)\s*#*\s*$/
const FENCE_RE = /^\s*(```|~~~)/
const NUMBERED_RE = /^\s{0,3}(\d+)\.\s+(.*)$/
const BOLD_LINE_RE = /^\*\*(.+?)\*\*\s*[:：]?\s*$/

// Outside code spans: `*` is always emphasis; `_` only when it opens/closes a whole word, so an
// intraword `_` (version_outcome) stays, as in the body heading.
const WORD = String.raw`[\p{L}\p{N}_]`
const UNDERSCORE_EM_RE = new RegExp(String.raw`(?<!${WORD})(_{1,2})(?=\S)(.+?)(?<=\S)\1(?!${WORD})`, 'gu')
function stripEmphasis(part) {
  return part.replace(/[`*]/g, '').replace(UNDERSCORE_EM_RE, '$2')
}

/** Plain text of a short inline-markdown string (outline entries, question lines). */
export function plainInline(text) {
  return String(text ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part.replace(/`/g, '') : stripEmphasis(part)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function nonBlankCount(text) {
  return text.split('\n').filter((l) => l.trim() !== '').length
}

/**
 * Split PRD markdown into a heading tree (levels 1–4; a `#`/`##` inside a code fence is not a heading).
 * The first `#` is the document title; any later `#` is treated as a `##`. `lines` counts the
 * non-blank source lines under a heading, descendants and their heading lines included, the
 * heading's own line excluded (the approved mockup's 「N줄」).
 * @returns {{ title: object|null, pre: string, sections: object[] }}
 */
export function parsePrdTree(body) {
  const src = String(body ?? '').split('\n')
  const flat = [{ level: 0, title: '', own: [] }]
  let fence = false
  let sawH1 = false
  for (const line of src) {
    if (FENCE_RE.test(line)) fence = !fence
    const m = fence ? null : HEADING_RE.exec(line)
    if (m) {
      let level = m[1].length
      if (level === 1) {
        if (sawH1) level = 2
        sawH1 = true
      }
      flat.push({ level, title: m[2], own: [] })
    } else {
      flat[flat.length - 1].own.push(line)
    }
  }
  const mk = (n) => ({ level: n.level, title: n.title, ownText: n.own.join('\n'), children: [], lines: 0 })
  const root = mk(flat[0])
  const stack = [root]
  let title = null
  for (const n of flat.slice(1)) {
    const node = mk(n)
    if (node.level === 1) {
      title = node
      root.children.push(node)
      stack.length = 1
      stack.push(node)
      continue
    }
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop()
    // a level jump (## → ####) hangs the node under the nearest shallower heading
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  const count = (n) => {
    n.lines = nonBlankCount(n.ownText) + n.children.reduce((a, c) => a + 1 + count(c), 0)
    return n.lines
  }
  count(root)
  const titleOwn = title ? title.ownText : ''
  // sections hanging off the title (the usual shape) or off the root (no `#` at all)
  const sections = title ? [...title.children, ...root.children.filter((c) => c !== title)] : root.children
  return { title, pre: title ? titleOwn : root.ownText, sections }
}

function tableRows(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) continue
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
    rows.push(cells)
  }
  return rows
}

/** What-table rows keyed by item key: `{ tickets: 'T-808 · T-858', one: '...' }` (header row skipped). */
function whatTable(text) {
  const map = new Map()
  const rows = tableRows(text)
  for (const cells of rows.slice(1)) {
    if (cells.length < 3) continue
    map.set(plainInline(cells[0]), { tickets: plainInline(cells[1]), one: plainInline(cells[2]) })
  }
  return map
}

/**
 * The numbered questions of a §Open Questions body, grouped by the bold line above each list.
 * A group whose title matches `reviewGroup` is the collapsed 「화면 승인 때 볼 것」 one.
 * Numbering follows markdown: a list starts at its first item's number, then counts up.
 * @returns {{ main: {n:number,text:string}[], review: {n:number,text:string}[] }}
 */
export function parseQuestions(text) {
  const out = { main: [], review: [] }
  let bucket = out.main
  let last = null
  let n = 0
  let inList = false
  for (const line of String(text ?? '').split('\n')) {
    const bold = BOLD_LINE_RE.exec(line.trim())
    if (bold) {
      bucket = L.reviewGroup.test(bold[1]) ? out.review : out.main
      last = null
      inList = false
      continue
    }
    const item = NUMBERED_RE.exec(line)
    if (item) {
      n = inList ? n + 1 : Number(item[1])
      inList = true
      last = { n, text: item[2] }
      bucket.push(last)
      continue
    }
    if (last && /^\s+\S/.test(line)) {
      last.text += ' ' + line.trim()
      continue
    }
    if (line.trim() === '') continue
    last = null
    inList = false
  }
  for (const q of [...out.main, ...out.review]) q.text = plainInline(q.text)
  return out
}

function ticketOrder(a, b) {
  const num = (id) => Number(/(\d+)/.exec(id)?.[1] ?? Infinity)
  return num(a.id) - num(b.id)
}

/**
 * Open decision tickets (`type: decision`, `status: open`) across every bucket the viewer holds.
 * @param {{included: object[], omitted: {tickets: object[]}[]}} tickets
 */
export function openDecisionTickets(tickets) {
  const all = [...(tickets?.included ?? []), ...(tickets?.omitted ?? []).flatMap((b) => b.tickets ?? [])]
  return all
    .filter((t) => t.frontmatter?.type === 'decision' && t.frontmatter?.status === 'open' && t.frontmatter?.id)
    .map((t) => ({ id: String(t.frontmatter.id), slug: String(t.frontmatter.slug || t.frontmatter.id), assignee: String(t.frontmatter.assignee || '') }))
    .sort(ticketOrder)
}

/** Ticket ids of a What-table cell: `T-841 · T-858` → shown as is; the outline shortens to `T-841 +1`. */
function outlineTickets(text) {
  const ids = String(text).match(/T-\d+/g) || []
  if (ids.length === 0) return ''
  return ids.length === 1 ? ids[0] : `${ids[0]} +${ids.length - 1}`
}

/**
 * @param {object} args
 * @param {string} args.body PRD.md body (standing head + the open `## v<N>.<m>`)
 * @param {string} args.currentVersion
 * @param {{id:string,slug:string,assignee:string}[]} args.decisionTickets
 * @param {string} args.idPrefix unique per rendered copy (the same PRD can sit in two panes)
 * @param {{md:(t:string)=>string, inline:(t:string)=>string, esc:(s:string)=>string, sameVersion:(a:string,b:string)=>boolean, ticketPill:(assignee:string)=>string}} args.deps
 */
export function renderPrdReading({ body, currentVersion, decisionTickets, idPrefix, deps }) {
  const { md, inline, esc, sameVersion, ticketPill } = deps
  const tree = parsePrdTree(body)
  const noHeadings = !tree.title && tree.sections.length === 0
  if (noHeadings) return `<div class="v-body">${md(body)}</div>`

  let seq = 0
  const outline = []
  let questionsSecId = ''
  let questions = { main: [], review: [] }

  const isOpenVersion = (title) => {
    const first = /^(\S+)/.exec(title)?.[1] ?? ''
    return /^v\d/.test(first) && sameVersion(first, currentVersion)
  }

  const addOqIds = (html) =>
    html.replace(/<ol(?: start="(\d+)")?>([\s\S]*?)<\/ol>/g, (m, start, inner) => {
      let n = start ? Number(start) : 1
      return `<ol${start ? ` start="${start}"` : ''}>${inner.replace(/<li>/g, () => `<li id="${idPrefix}-oq-${n++}">`)}</ol>`
    })

  const bodyHtml = (text) => (text.trim() === '' ? '' : `<div class="pr-body v-body">${text}</div>`)

  /** @returns {string} html of one foldable section; also appends its outline entry */
  const foldSeen = new Map()
  const section = (node, ctx) => {
    const id = `${idPrefix}-s${++seq}`
    // Stable fold identity: the heading path (plain titles), `~n` for the n-th repeat of the same path —
    // never the sequence number, which shifts when a `##` is inserted or removed above.
    const path = `${ctx.path ?? ''}/${plainInline(node.title)}`
    const nth = (foldSeen.get(path) ?? 0) + 1
    foldSeen.set(path, nth)
    const foldKey = nth > 1 ? `${path}~${nth}` : path
    const marks = '#'.repeat(node.level)
    const isOpenSection = node.level === 2 && isOpenVersion(node.title)
    const isQuestions = node.level === 3 && L.questionsSection.test(node.title)
    const isWhat = node.level === 3 && L.whatSection.test(node.title)
    const open0 = isOpenSection || (ctx.underOpen && node.level === 3 && L.initialOpen.test(node.title))
    const meta = `<span class="pr-meta mono">${esc(L.lineCount(node.lines))}</span>`
    const slot = { id, level: node.level, marks, text: plainInline(node.title), what: isWhat, questions: isQuestions, key: '', tk: '', badge: '' }
    outline.push(slot)

    let inner = ''
    let summary
    let cls = `pr-sec pr-l${node.level}`
    const rows = ctx.what
    const key = node.level === 4 ? plainInline(node.title).split(/\s+—\s+/)[0] : ''
    const asCard = node.level === 4 && ctx.what && / — /.test(node.title)

    if (asCard) {
      const [, ...rest] = node.title.split(/\s+—\s+/)
      const row = rows.get(key)
      slot.key = key
      slot.tk = outlineTickets(row?.tickets ?? '')
      cls = 'pr-sec pr-card'
      summary =
        `<span class="pr-mark mono">${marks}</span><span class="pr-key mono">${esc(key)}</span>` +
        `<span class="pr-t">${inline(rest.join(' — '))}</span>` +
        (row?.tickets ? `<span class="pr-tk mono">${esc(row.tickets)}</span>` : '') +
        meta +
        (row?.one ? `<span class="pr-one">${esc(row.one)}</span>` : '')
      inner = bodyHtml(md(node.ownText))
    } else {
      summary = `<span class="pr-mark mono">${marks}</span><span class="pr-t">${inline(node.title)}</span>${meta}`
      let own = node.ownText.trim() === '' ? '' : md(node.ownText)
      if (isQuestions) {
        questionsSecId = id
        questions = parseQuestions(node.ownText)
        slot.badge = String(questions.main.length + questions.review.length)
        own = addOqIds(own)
      }
      let kids = ''
      if (isWhat) {
        const table = whatTable(node.ownText)
        const cards = node.children.map((c) => section(c, { ...ctx, path, what: table })).join('')
        slot.badge = String(node.children.length)
        kids = node.children.length ? `<div class="pr-cards-h">${esc(L.cardsHeading(node.children.length))}</div><div class="pr-cards">${cards}</div>` : ''
      } else {
        const nextCtx = { ...ctx, path, underOpen: ctx.underOpen || isOpenSection }
        kids = node.children.map((c) => section(c, nextCtx)).join('')
      }
      inner = bodyHtml(own + kids)
    }
    return `<details class="${cls}" id="${id}" data-fold="${esc(foldKey)}" data-open0="${open0 ? 1 : 0}"${open0 ? ' open' : ''}><summary>${summary}</summary>${inner}</details>`
  }

  const sectionsHtml = tree.sections.map((s) => section(s, { underOpen: false, what: new Map() })).join('')

  const titleId = `${idPrefix}-top`
  const titleText = tree.title ? plainInline(tree.title.title) : ''

  // 「결정할 것」 box
  const tickets = decisionTickets ?? []
  const decideN = questions.main.length + tickets.length
  const qButton = (q) =>
    `<button type="button" class="pr-dent" data-oq="${esc(`${idPrefix}-oq-${q.n}`)}" data-oq-sec="${esc(questionsSecId)}"><span class="n">${q.n}</span><span>${esc(q.text)}</span><span class="go">${esc(L.goToPrd)}</span></button>`
  const tButton = (t) =>
    `<button type="button" class="pr-dent" data-detail-kind="ticket" data-detail-id="${esc(t.id)}"><span class="n">${esc(t.id)}</span><span>${esc(t.slug)}</span><span style="margin-left:auto">${ticketPill(t.assignee)}</span></button>`
  let box = `<div class="pr-decide-h">${esc(L.decideHeading)} <span class="ol-badge mono">${decideN}</span></div>`
  if (decideN === 0 && questions.review.length === 0) {
    box += `<p class="pr-none">${esc(L.noDecide)}</p>`
  } else {
    box +=
      `<div class="pr-dg"><div class="pr-dg-h">${esc(L.questionsHeading)}</div>` +
      (questions.main.length ? `<div class="pr-dlist">${questions.main.map(qButton).join('')}</div>` : `<p class="pr-none">${esc(L.noQuestions)}</p>`) +
      '</div>' +
      `<div class="pr-dg"><div class="pr-dg-h">${esc(L.ticketsHeading)}</div>` +
      (tickets.length ? `<div class="pr-dlist">${tickets.map(tButton).join('')}</div>` : `<p class="pr-none">${esc(L.noTickets)}</p>`) +
      '</div>'
    if (questions.review.length) {
      box += `<details class="pr-dsub"><summary>${esc(L.reviewQuestions(questions.review.length))}</summary><div class="pr-dlist">${questions.review.map(qButton).join('')}</div></details>`
    }
  }

  // outline
  const ol = (cls, go, inner, dot = true) => `<a href="#${esc(go)}" class="ol ${cls}" data-go="${esc(go)}">${inner}${dot ? '<i class="ol-dot"></i>' : ''}</a>`
  const entries = [
    `<a href="#${esc(titleId)}" class="ol ol-decide" data-go="${esc(`${idPrefix}-decide`)}"><span class="ol-t">${esc(L.decideHeading)}</span><span class="ol-badge mono">${decideN}</span></a>`,
  ]
  if (titleText) entries.push(ol('ol-l1', titleId, `<span class="ol-mark mono">#</span><span class="ol-t">${esc(titleText)}</span>`, false))
  for (const o of outline) {
    const what = o.what ? ' ol-what' : ''
    if (o.key) {
      entries.push(ol(`ol-l${o.level}`, o.id, `<span class="ol-mark mono">${o.marks}</span><span class="ol-key mono">${esc(o.key)}</span>${o.tk ? `<span class="ol-tk mono">${esc(o.tk)}</span>` : ''}`))
    } else {
      entries.push(
        ol(`ol-l${o.level}${what}`, o.id, `<span class="ol-mark mono">${o.marks}</span><span class="ol-t">${esc(o.text)}</span>${o.badge && (o.what || o.questions) ? `<span class="ol-badge mono">${esc(o.badge)}</span>` : ''}`),
      )
    }
  }
  const legend = `<div class="pr-legend"><i class="f"></i>${esc(L.openMark)} <i></i>${esc(L.closedMark)}</div>`

  return (
    `<div class="pr-wrap">` +
    `<nav class="pr-outline" aria-label="${esc(L.outlineHeading)}"><div class="pr-outline-h">${esc(L.outlineHeading)}</div>${entries.join('')}${legend}</nav>` +
    `<div class="pr-doc" id="${esc(titleId)}">` +
    `<div class="pr-decide" role="region" aria-label="${esc(L.decideHeading)}">${box}</div>` +
    `<div class="pr-tools"><button type="button" class="pr-btn" data-pr-act="all">${esc(L.expandAll)}</button><button type="button" class="pr-btn" data-pr-act="none">${esc(L.collapseAll)}</button><button type="button" class="pr-btn" data-pr-act="reset">${esc(L.resetFolds)}</button></div>` +
    (titleText ? `<h1 class="pr-title">${inline(tree.title.title)}</h1>` : '') +
    (tree.pre.trim() ? `<div class="pr-pre"><div class="v-body">${md(tree.pre)}</div></div>` : '') +
    sectionsHtml +
    `</div></div>`
  )
}

// ---------- CSS (var(--…) tokens only — TEMPLATE_CSS guard applies to this text) ----------
export const PRD_READING_CSS = `
/* ---------- PRD reading screen (T-884, approved mockup docs/artifacts/v1.12/prd-reading.html) ---------- */
.store-section[data-store="prd"] .main-inner { max-width: none; }
.store-section[data-store="prd"] .view-pane > .v-body { max-width: 1040px; margin: 0 auto; }
.pr-wrap { display: grid; grid-template-columns: 264px minmax(0, 1fr); gap: var(--space-32); align-items: start; }
.pr-outline { position: sticky; top: 0; max-height: calc(100vh - 44px - var(--space-32)); overflow-y: auto; padding: 0 var(--space-4) var(--space-16) 0; border-right: 1px solid var(--border-item); }
.pr-outline-h { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-quaternary); margin: 0 0 var(--space-8); padding-left: var(--space-8); }
.ol { display: flex; align-items: baseline; gap: var(--space-6); padding: 3px var(--space-8); border-radius: var(--radius-8); font-size: 12px; line-height: 1.4; color: var(--text-secondary); text-decoration: none; cursor: pointer; position: relative; }
.ol:hover { background: var(--bg-state-hover); }
.ol:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.ol[aria-current="true"] { background: var(--accent); color: var(--accent-contrast); }
.ol[aria-current="true"] .ol-mark, .ol[aria-current="true"] .ol-tk { color: var(--accent-contrast); opacity: .85; }
.ol-mark { font-size: 10px; color: var(--text-quaternary); flex: 0 0 auto; width: 30px; }
.ol-t { flex: 1; min-width: 0; }
.ol-l1 { font-weight: 700; color: var(--text-primary); margin-top: var(--space-4); }
.ol-l2 { font-weight: 700; color: var(--text-primary); margin-top: var(--space-8); font-size: 12.5px; }
.ol-l3 { padding-left: calc(var(--space-8) + 14px); }
.ol-l3 .ol-mark { width: 26px; }
.ol-l4 { padding-left: calc(var(--space-8) + 38px); font-size: 11.5px; }
.ol-l4 .ol-mark { width: 34px; }
.ol-key { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; color: var(--text-primary); }
.ol-l4[aria-current="true"] .ol-key { color: var(--accent-contrast); }
.ol-tk { font-size: 10px; color: var(--text-quaternary); flex: 0 0 auto; }
.ol-what { background: var(--accent-subtle); color: var(--text-primary); font-weight: 600; }
.ol-what[aria-current="true"] { background: var(--accent); color: var(--accent-contrast); }
.ol-badge { font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: var(--radius-100); background: var(--text-primary); color: var(--bg-surface-base); flex: 0 0 auto; }
.ol[aria-current="true"] .ol-badge { background: var(--accent-contrast); color: var(--accent); }
.ol-decide { font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-4); border: 1px solid var(--border-inline); }
.ol-dot { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; border: 1px solid var(--text-quaternary); align-self: center; }
.ol.is-unfolded .ol-dot { background: var(--text-quaternary); }
.ol[aria-current="true"] .ol-dot { border-color: var(--accent-contrast); }
.ol[aria-current="true"].is-unfolded .ol-dot { background: var(--accent-contrast); }
.pr-legend { font-size: 10.5px; color: var(--text-quaternary); margin: var(--space-12) 0 0 var(--space-8); display: flex; gap: var(--space-8); align-items: center; }
.pr-legend i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; border: 1px solid var(--text-quaternary); }
.pr-legend i.f { background: var(--text-quaternary); }
.pr-doc { min-width: 0; max-width: 760px; }
.pr-decide { border: 1px solid var(--border-hover); border-radius: var(--radius-12); background: var(--accent-subtle); padding: var(--space-16) var(--space-20); margin: 0 0 var(--space-20); }
.pr-decide-h { display: flex; align-items: center; gap: var(--space-8); font-size: 15px; font-weight: 700; margin: 0 0 var(--space-12); }
.pr-decide-h .ol-badge { font-size: 11px; padding: 1px 8px; }
.pr-dg { margin: 0 0 var(--space-12); }
.pr-dg-h { font-size: 11px; color: var(--text-tertiary); font-weight: 600; margin: 0 0 var(--space-6); }
.pr-dlist { display: flex; flex-direction: column; gap: 6px; }
.pr-dent { font: inherit; font-size: 12.5px; text-align: left; display: flex; gap: var(--space-8); align-items: baseline; background: var(--bg-surface-base); color: var(--text-primary); border: 1px solid var(--border-inline); border-radius: var(--radius-8); padding: 6px 10px; cursor: pointer; width: 100%; }
.pr-dent:hover { border-color: var(--text-primary); }
.pr-dent:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pr-dent .n { font-family: var(--font-mono); font-size: 11px; color: var(--text-quaternary); flex: 0 0 auto; }
.pr-dent .go { margin-left: auto; font-size: 11px; color: var(--text-tertiary); flex: 0 0 auto; }
.pr-none { font-size: 12.5px; color: var(--text-secondary); margin: 0; }
.pr-dsub { font-size: 12px; color: var(--text-secondary); }
.pr-dsub summary { cursor: pointer; padding: var(--space-4) 0; color: var(--text-secondary); }
.pr-dsub .pr-dlist { margin-top: var(--space-6); }
.pr-tools { display: flex; gap: var(--space-8); margin: 0 0 var(--space-12); align-items: center; }
.pr-btn { font: inherit; font-size: 11.5px; background: var(--bg-surface-base); color: var(--text-secondary); border: 1px solid var(--border-inline); border-radius: var(--radius-100); padding: 3px 11px; cursor: pointer; }
.pr-btn:hover { border-color: var(--text-primary); color: var(--text-primary); }
.pr-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pr-title { font-size: 20px; font-weight: 700; margin: 0 0 var(--space-8); }
.pr-pre { font-size: 12.5px; color: var(--text-secondary); margin: 0 0 var(--space-16); }
.pr-pre .v-body > :first-child { margin-top: 0; }
.pr-sec { margin: 0; }
.pr-sec > summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: var(--space-8); padding: var(--space-8) var(--space-8); border-radius: var(--radius-8); position: relative; }
.pr-sec > summary::-webkit-details-marker { display: none; }
.pr-sec > summary::before { content: ""; flex: 0 0 auto; width: 7px; height: 7px; border-right: 1.5px solid var(--text-tertiary); border-bottom: 1.5px solid var(--text-tertiary); transform: rotate(-45deg) translateY(-2px); transition: transform 120ms; margin-right: 2px; align-self: center; }
.pr-sec[open] > summary::before { transform: rotate(45deg) translate(-2px, -2px); }
.pr-sec > summary:hover { background: var(--bg-state-hover); }
.pr-sec > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.pr-mark { font-size: 11px; color: var(--text-quaternary); flex: 0 0 auto; }
.pr-t { flex: 1; min-width: 0; color: var(--text-primary); overflow-wrap: anywhere; }
.pr-meta { font-size: 10.5px; color: var(--text-quaternary); flex: 0 0 auto; }
.pr-body { padding: var(--space-4) 0 var(--space-8) var(--space-20); font-size: 13.5px; }
.pr-body > :first-child { margin-top: 0; }
.pr-body table { font-size: 12.5px; }
.pr-body li { margin: 0 0 var(--space-4); }
.pr-l2 { border-top: 1px solid var(--border-section); margin-top: var(--space-12); padding-top: var(--space-4); }
.pr-l2 > summary .pr-t { font-size: 17px; font-weight: 700; }
.pr-l2 > summary .pr-mark { font-size: 12px; width: 22px; }
.pr-l2 > .pr-body { border-left: 1px solid var(--border-inline); margin-left: var(--space-12); }
.pr-l3 > summary .pr-t { font-size: 14.5px; font-weight: 700; }
.pr-l3 > summary .pr-mark { width: 26px; }
.pr-l3 > .pr-body { border-left: 1px solid var(--border-item); margin-left: var(--space-12); }
.pr-l3 { margin-top: var(--space-4); }
.pr-l4 > summary .pr-t { font-size: 13px; font-weight: 600; }
.pr-l4 > summary .pr-mark { width: 34px; }
.pr-l4 > .pr-body { border-left: 1px solid var(--border-item); margin-left: var(--space-12); }
.pr-card > summary .pr-t { font-size: 13px; font-weight: 600; flex: 1 1 14em; min-width: 10em; }
.pr-card > summary .pr-mark { width: 34px; }
.pr-what > .pr-body > .pr-cards-h { font-size: 11px; color: var(--text-tertiary); font-weight: 600; margin: var(--space-12) 0 var(--space-8); }
.pr-cards { display: flex; flex-direction: column; gap: var(--space-8); }
.pr-card { border: 1px solid var(--border-inline); border-radius: var(--radius-12); background: var(--bg-surface-base); }
.pr-card[open] { border-color: var(--border-hover); box-shadow: var(--shadow-low); }
.pr-card > summary { flex-wrap: wrap; padding: var(--space-10) var(--space-12); }
.pr-key { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: var(--radius-100); background: var(--accent-subtle); color: var(--text-primary); flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-tk { font-size: 10.5px; color: var(--text-secondary); border: 1px solid var(--border-inline); border-radius: var(--radius-100); padding: 0 7px; flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.pr-one { flex-basis: 100%; font-size: 12px; color: var(--text-secondary); padding-left: calc(34px + var(--space-8) + 9px); line-height: 1.5; }
.pr-card > .pr-body { padding: var(--space-8) var(--space-16) var(--space-12) var(--space-16); border-top: 1px solid var(--border-item); margin-left: 0; }
.pr-card.is-target, .pr-sec.is-target > summary { background: color-mix(in srgb, var(--accent) 12%, transparent); }
li.is-target { background: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: var(--radius-4); }
.pr-doc h2, .pr-doc h3, .pr-doc h4, .pr-doc h5 { margin-top: var(--space-12); }
`

// ---------- browser side (spliced into INTERACTION_SCRIPT; ES5, no labels, no inline handlers) ----------
// Functions it defines: prdClick(ev) → bool, prdFoldState() → {foldKey: open}, prdRestoreFolds(ids), prdInit().
export const PRD_READING_SCRIPT = `
  // T-884: PRD reading screen — folds, outline jump, scroll spy. Every id is compared, never spliced into a selector.
  function prdWrap(el) { return el && el.closest ? el.closest('.pr-wrap') : null; }
  function prdSecs(wrap) { return Array.prototype.slice.call(wrap.querySelectorAll('details.pr-sec')); }
  function prdLinks(wrap) { return Array.prototype.slice.call(wrap.querySelectorAll('.ol[data-go]')); }
  function prdById(wrap, id) { return findByAttr('[id]', 'id', id, wrap); }
  function prdSyncDots(wrap) {
    prdLinks(wrap).forEach(function (a) {
      var s = prdById(wrap, a.getAttribute('data-go'));
      a.classList.toggle('is-unfolded', !!(s && s.tagName === 'DETAILS' && s.open));
    });
  }
  function prdUnfold(el) { for (var p = el; p; p = p.parentElement) { if (p.tagName === 'DETAILS') p.open = true; } }
  function prdScroller(wrap) { return wrap.closest('.frame-body'); }
  function prdScrollTo(wrap, el) {
    var sc = prdScroller(wrap);
    if (!sc) return;
    sc.scrollTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12;
  }
  var prdFlashTimer = null;
  function prdFlash(el) {
    document.querySelectorAll('.is-target').forEach(function (x) { x.classList.remove('is-target'); });
    el.classList.add('is-target');
    clearTimeout(prdFlashTimer);
    prdFlashTimer = setTimeout(function () { el.classList.remove('is-target'); }, 1800);
  }
  function prdSetCurrent(wrap, id) {
    var cur = null;
    prdLinks(wrap).forEach(function (a) {
      if (a.getAttribute('data-go') === id) { a.setAttribute('aria-current', 'true'); cur = a; } else a.removeAttribute('aria-current');
    });
    var o = wrap.querySelector('.pr-outline');
    if (cur && o) {
      var r = cur.getBoundingClientRect(), q = o.getBoundingClientRect();
      if (r.top < q.top || r.bottom > q.bottom) o.scrollTop += r.top - q.top - 60;
    }
  }
  function prdSpy(wrap) {
    var sc = prdScroller(wrap);
    if (!sc || wrap.offsetParent === null) return;
    var decide = wrap.querySelector('.ol-decide');
    var decideId = decide ? decide.getAttribute('data-go') : '';
    if (sc.scrollTop < 40) { prdSetCurrent(wrap, decideId); return; }
    var base = sc.getBoundingClientRect().top + 16;
    var cur = decideId;
    prdSecs(wrap).forEach(function (s) { if (s.offsetParent !== null && s.getBoundingClientRect().top <= base) cur = s.id; });
    prdSetCurrent(wrap, cur);
  }
  function prdGo(wrap, id) {
    var el = prdById(wrap, id);
    if (!el) return;
    if (el.tagName !== 'DETAILS') { var sc = prdScroller(wrap); if (sc) sc.scrollTop = 0; prdSetCurrent(wrap, id); return; }
    prdUnfold(el); prdSyncDots(wrap); prdScrollTo(wrap, el); prdFlash(el); prdSetCurrent(wrap, id);
  }
  function prdClick(ev) {
    var t = ev.target;
    var wrap = prdWrap(t);
    if (!wrap) return false;
    var a = t.closest('.ol[data-go]');
    if (a) {
      ev.preventDefault();
      var go = a.getAttribute('data-go');
      // the decide entry has no section of its own: it is the document top
      if (a.classList.contains('ol-decide')) { var sc = prdScroller(wrap); if (sc) sc.scrollTop = 0; prdSetCurrent(wrap, go); }
      else prdGo(wrap, go);
      return true;
    }
    var q = t.closest('[data-oq]');
    if (q) {
      var target = prdById(wrap, q.getAttribute('data-oq')) || prdById(wrap, q.getAttribute('data-oq-sec'));
      if (target) { prdUnfold(target); prdSyncDots(wrap); prdScrollTo(wrap, target); prdFlash(target); }
      return true;
    }
    var b = t.closest('[data-pr-act]');
    if (b) {
      var act = b.getAttribute('data-pr-act');
      prdSecs(wrap).forEach(function (s) { s.open = act === 'all' ? true : act === 'none' ? false : s.getAttribute('data-open0') === '1'; });
      prdSyncDots(wrap);
      return true;
    }
    return false;
  }
  // Fold state is keyed by data-fold (the heading path), so a regenerated PRD with a section added or
  // removed above restores the same sections; a section the saved state never saw keeps its default.
  function prdFoldState() {
    var state = {};
    document.querySelectorAll('.pr-wrap details.pr-sec').forEach(function (s) { state[s.getAttribute('data-fold') || s.id] = s.open; });
    return state;
  }
  function prdRestoreFolds(state) {
    if (!state || typeof state !== 'object' || typeof state.length === 'number') return;
    document.querySelectorAll('.pr-wrap').forEach(function (wrap) {
      prdSecs(wrap).forEach(function (s) {
        var k = s.getAttribute('data-fold') || s.id;
        if (Object.prototype.hasOwnProperty.call(state, k)) s.open = state[k] === true;
      });
      prdSyncDots(wrap);
    });
  }
  function prdInit() {
    document.querySelectorAll('.pr-wrap').forEach(function (wrap) {
      var sc = prdScroller(wrap);
      var timer = null;
      if (sc) sc.addEventListener('scroll', function () { clearTimeout(timer); timer = setTimeout(function () { prdSpy(wrap); }, 40); });
      prdSyncDots(wrap);
      var decide = wrap.querySelector('.ol-decide');
      if (decide) prdSetCurrent(wrap, decide.getAttribute('data-go'));
    });
    document.addEventListener('toggle', function (ev) {
      var w = prdWrap(ev.target);
      if (w) prdSyncDots(w);
    }, true);
  }
`
