// viewer/lib/collect.mjs — reads the sources this viewer shows, generation
// time, from disk. Never a second copy of a fact another tool already derives
// (contracts §Return envelope / this ticket's acceptance line 5):
//   - ticket facts come from ticket frontmatter files themselves, not from
//     any index.db or cache
//   - artifact facts come from the ONE `docs/artifacts/manifest.json`
//     `prdt artifacts sync` maintains (T-661) — this module never re-derives
//     bucket/kind/status from directory scanning
//   - `current_task` / `stage` / `version` come from `.prdt/po-state.json`
//
// SIZE RULE (T-665 acceptance line 3 — "what is inlined and what is not
// follows a stated rule"; refined by T-709 결정 1 — see below):
//   - Inlined IN FULL (body included): docs/prd/PRD.md (standing head + open
//     version) + docs/prd/versions/*.md (closed rounds — 245 KB total,
//     2026-09-26) + docs/wiki/**/*.md (789 KB) + docs/features/*.md (27 KB) +
//     tickets in the CURRENT po-state version directory + docs/tickets/
//     backlog/ (the actionable "now" set) + artifact entries whose file is
//     `.md` (407 KB; plain prose, no foreign styling/script to collide with
//     the page's own).
//   - FRONTMATTER ONLY (never `body`), one lightweight row per file: tickets
//     in any OTHER `docs/tickets/` bucket directory (a closed round, or an
//     open roadmap dir shaped the same way — docs/tickets/v2.0, v1.11, both
//     still `status: open` today, contracts §Fixed paths already treats every
//     `docs/tickets/v<N>.<m>/` the same). T-665 measured the FULL-body cost of
//     this set at 6.47 MB (840 tickets then) and left it out entirely, path +
//     count/bytes only; T-709 re-measured (712 tickets, 2026-09-27: full
//     bodies 5.68 MB vs frontmatter-only 212 KB) and kept T-665's verdict on
//     the body — still not worth 5+ MB — while giving the viewer's sidebar one
//     row per bucket (`omitted[].tickets`, `{rel, frontmatter:{id,slug,type,
//     status,assignee}}` — no `body` key at all, a structural guard against
//     ever interpolating a closed-round ticket's prose here) instead of only a
//     count/bytes summary. A row's click opens the real file
//     (`render.mjs`'s `fileHref` convention, already used by a non-inlined
//     artifact — see below).
//   - NOT inlined at all, path + manifest row only: artifact entries whose
//     file is `.html`/`.json` — each `.html` artifact is ALREADY an
//     independent `file://`-openable static page (embedding a foreign page's
//     own `<html><style><script>` inside this one risks exactly the CSS/JS
//     collisions a single-file page cannot recover from) and `.json` is
//     manifest-shaped data, not prose; both get a full manifest row (path,
//     ticket, kind, status, lang, added_at) so the page still SAYS what
//     exists and where, per acceptance line 3's "says so … rather than
//     rendering half a document" — no row is ever a half-rendered artifact.
import { collectDisciplineLoad } from './discipline-load.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { collectEnv, collectMachineEnv, detectVsCode, homeEnvDir, lineEnvDir } from './env-status.mjs'
import { parseFrontmatter } from './frontmatter.mjs'
// T-1104: the product-first docs layout (JS port of the CLI seam) — where each row is read from.
import { createDocsLayout } from './docs-layout.mjs'
// T-713: reuse render.mjs's own numeric version-equality rule (contracts
// §Fixed-paths "`v1` ≡ `v1.0.0`") rather than a second string-equality copy —
// a ticket bucket directory spelled differently from po-state's own version
// string (`v1.10.0` on disk vs `v1.10` in `.prdt/po-state.json`) is still the
// same version. No cycle: render.mjs never imports collect.mjs.
import { sameVersion, decodePathSegments } from './render.mjs'

// T-912 F1: every read under the repo root passes through realpath containment
// (the RELEASES.md / discipline rule, T-883 / T-842 class): a path whose REAL
// location (every symlink resolved) is outside the REAL repo root reads as
// absent. A symlink resolving inside the same top directory (`docs/` or
// `.prdt/`) still works; one reaching another in-repo file (root `.env.local`)
// does not.
function realInsideRepo(repoRoot, abs) {
  try {
    const realRoot = fs.realpathSync(repoRoot)
    const real = fs.realpathSync(abs)
    if (!(real === realRoot || real.startsWith(realRoot + path.sep))) return null
    // Narrower than the repo: the viewer reads only under `docs/` and `.prdt/`,
    // so a link to another in-repo file (e.g. a root `.env.local`) is refused too.
    const top = path.relative(repoRoot, abs).split(path.sep)[0]
    if (top && top !== '..') {
      // Anchor at <realRoot>/<top>, not realpath(<top>): a `docs/` or `.prdt/`
      // that is itself a link must not widen the allowed region.
      const realTop = path.join(realRoot, top)
      if (!(real === realTop || real.startsWith(realTop + path.sep))) return null
    }
    return real
  } catch {
    return null
  }
}

/** The contained real path of an existing regular file, else null. */
function containedFile(repoRoot, abs) {
  const real = realInsideRepo(repoRoot, abs)
  try {
    return real && fs.statSync(real).isFile() ? real : null
  } catch {
    return null
  }
}

/** The contained real path of an existing directory, else null. */
function containedDir(repoRoot, abs) {
  const real = realInsideRepo(repoRoot, abs)
  try {
    return real && fs.statSync(real).isDirectory() ? real : null
  } catch {
    return null
  }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

// Names of the regular files (or in-repo file links) in `dir` passing `nameOk`;
// empty when `dir` is missing or resolves outside the repo.
function listContainedFiles(repoRoot, dir, nameOk) {
  if (!containedDir(repoRoot, dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && nameOk(e.name) && containedFile(repoRoot, path.join(dir, e.name)))
    .map((e) => e.name)
    .sort()
}

function listMarkdownFiles(repoRoot, dir) {
  return listContainedFiles(repoRoot, dir, (n) => n.endsWith('.md'))
}

/** @returns {{schema_version:number, stage:string, version:string, current_task:unknown}} */
export function readPoState(repoRoot) {
  const abs = path.join(repoRoot, '.prdt/po-state.json')
  // T-912: a present po-state that resolves outside the repo reads as an empty
  // state (never the outside file); a truly missing one still throws ENOENT.
  const real = containedFile(repoRoot, abs)
  if (!real) {
    if (!fs.existsSync(abs)) return readJson(abs)
    return { schema_version: 0, stage: '', version: '', current_task: null }
  }
  const state = readJson(real)
  // T-1168: `version` null / missing / non-string reads as '' (idle) — every consumer assumes a string.
  if (state && typeof state === 'object' && typeof state.version !== 'string') state.version = ''
  return state
}

// null when the file's real path leaves the repo (callers skip the entry).
function readDoc(repoRoot, absPath) {
  const real = containedFile(repoRoot, absPath)
  if (!real) return null
  const raw = fs.readFileSync(real, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  return { rel: path.relative(repoRoot, absPath).split(path.sep).join('/'), frontmatter: data, body }
}

// T-709 결정 1: a lightweight, frontmatter-only ticket entry for a non-
// current/non-backlog bucket — deliberately built with NO `body` key at all
// (never `body: undefined` either — the key is absent), so a later change to
// render.mjs cannot accidentally interpolate a closed round's ticket prose by
// reaching for `.body` on one of these: the value simply is not there to read.
// T-964: legacy tickets (docs/tickets/v0.5/T-PATCH-*) carry `ticket_id:` instead of `id:` — key them by that id.
function withTicketId(doc) {
  const fm = doc && doc.frontmatter
  if (fm && !fm.id && typeof fm.ticket_id === 'string' && fm.ticket_id.trim()) fm.id = fm.ticket_id.trim()
  return doc
}

function ticketLite(doc) {
  const fm = doc.frontmatter
  return { rel: doc.rel, frontmatter: { id: fm.id, slug: fm.slug, type: fm.type, status: fm.status, assignee: fm.assignee, feature: fm.feature, created: fm.created } }
}

/**
 * @returns {{ included: Array, omitted: Array<{bucket:string, count:number, bytes:number, tickets:Array, bodies:Record<string,string>}> }}
 */
export function collectTickets(repoRoot, currentVersion, { line = null, exclude = [], layout = createDocsLayout(repoRoot) } = {}) {
  // T-961: an added release line's tickets sit under `docs/tickets/<line>/`;
  // the home line's own read skips those line directories (`exclude`).
  // T-1104: in the product layout the roots are the product's `tickets/` and
  // the shared backlog (`docs/_shared/tickets/`, which holds only `backlog/`
  // for the home line); the same bucket name in both merges (product first).
  const roots = layout.layout === 'product'
    ? [layout.dir('tickets'), ...(line ? [] : [path.join(repoRoot, 'docs', '_shared', 'tickets')])]
    : [layout.dir('tickets')]
  // T-746: a project with no ticket yet has no docs/tickets at all — zero
  // tickets, never an ENOENT that leaves the viewer ungenerated.
  /** @type {Map<string, string[]>} bucket → bucket dirs (product first) */
  const bucketDirsByName = new Map()
  for (const r of roots) {
    // T-1108: a product layout holds an added product's tickets in `docs/<product>/tickets/` itself, no `<line>/` level.
    const ticketsRoot = path.join(r, ...(line && layout.layout !== 'product' ? [line] : []))
    if (!containedDir(repoRoot, ticketsRoot)) continue
    for (const e of fs.readdirSync(ticketsRoot, { withFileTypes: true })) {
      if (!(e.isDirectory() || e.isSymbolicLink()) || exclude.includes(e.name)) continue
      if (!containedDir(repoRoot, path.join(ticketsRoot, e.name))) continue
      if (!bucketDirsByName.has(e.name)) bucketDirsByName.set(e.name, [])
      bucketDirsByName.get(e.name).push(path.join(ticketsRoot, e.name))
    }
  }
  const bucketNames = [...bucketDirsByName.keys()].sort()

  const included = []
  const omitted = []
  for (const bucket of bucketNames) {
    const files = []
    for (const bucketDir of bucketDirsByName.get(bucket)) {
      for (const f of listContainedFiles(repoRoot, bucketDir, (n) => /^T-.+\.md$/.test(n))) files.push(path.join(bucketDir, f))
    }
    const isCurrent = sameVersion(bucket, currentVersion) || bucket === 'backlog'
    if (isCurrent) {
      for (const filePath of files) {
        const doc = withTicketId(readDoc(repoRoot, filePath))
        included.push({ bucket, ...doc })
      }
    } else if (files.length > 0) {
      // T-709 결정 1 (옵션 C): every other bucket gets its own sidebar row
      // too, so its files are now READ (frontmatter only, never `body` —
      // see `ticketLite` above) rather than only stat'd for a byte count.
      // T-885 (T-876 = D): the bodies ride BESIDE the rows, keyed by `rel`,
      // never on the row itself — render.mjs writes them only into this
      // bucket's sibling data file, never into viewer.html.
      let bytes = 0
      const tickets = []
      const bodies = {}
      for (const filePath of files) {
        const doc = withTicketId(readDoc(repoRoot, filePath))
        bytes += fs.statSync(containedFile(repoRoot, filePath)).size
        tickets.push(ticketLite(doc))
        bodies[doc.rel] = doc.body
      }
      omitted.push({ bucket, count: files.length, bytes, tickets, bodies })
    }
  }
  // Deterministic order: current version's own tickets first (id order),
  // then backlog, matching the two "included" buckets' natural read order.
  included.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === currentVersion ? -1 : 1
    return (a.frontmatter.id || '').localeCompare(b.frontmatter.id || '')
  })
  // Alphabetical here is just a stable base order for this collector's own
  // return value — the viewer's sidebar (render.mjs's ticketStoreInner)
  // re-sorts these by NUMERIC version (newest first, T-709 결정 1) for
  // display; this module has no display-order opinion of its own.
  omitted.sort((a, b) => a.bucket.localeCompare(b.bucket))
  return { included, omitted }
}

/**
 * T-1104 ② both layers read, product wins: the markdown files of one layered
 * dir (`wiki` · `features`) — the product's first, then the shared ones a
 * product file of the same name does not shadow. Legacy = the one dir.
 */
function collectLayered(repoRoot, layout, kind, skip = () => false) {
  const seen = new Set()
  const out = []
  for (const dir of layout.layerDirs(kind)) {
    for (const f of listMarkdownFiles(repoRoot, dir)) {
      if (skip(f) || seen.has(f)) continue
      seen.add(f)
      out.push(readDoc(repoRoot, path.join(dir, f)))
    }
  }
  // one dir keeps its own (sorted) order; two layers interleave by name
  return layout.layout === 'product' ? out.sort((a, b) => (a.rel.split('/').pop() < b.rel.split('/').pop() ? -1 : 1)) : out
}

export function collectWiki(repoRoot, layout = createDocsLayout(repoRoot)) {
  return collectLayered(repoRoot, layout, 'wiki', (f) => f === 'index.md')
}

export function collectFeatures(repoRoot, layout = createDocsLayout(repoRoot)) {
  return collectLayered(repoRoot, layout, 'features')
}

// T-882: the feature taxonomy the feature screen draws — `.prdt/config.json`
// `features.taxonomy` ({areas, kinds}, ordered) + each `features.vocab`
// entry's `label` and `taxonomy` ({kind, area, def, links}). The vocab block
// is the ONE list of feature keys `prdt doctor` already checks tickets'
// `feature:` values against (W4), so the screen and that check read the same
// keys. Null when the config has no `features.taxonomy.areas` (the screen's
// empty state); a malformed config is the same null — doctor names the fault.
// T-964: `taxonomy.guide` = {when, ux, logic, limits, example, flow?}. Lenient read —
// when · limits take a string or a string list, ux a list of strings or `{text, at}` (T-1049), example a string (or list,
// joined), logic a list of `{text, ground?}` or plain strings (ground = a
// ticket id string or a list of them). Anything else is dropped; `prdt doctor`
// names the malformed cell. Returns null when no cell has text.
const textList = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
// T-1049 (T-1055 = A · T-1056 = A): ux items are `{text, at?}` (a plain string is `{text}`); `at` is
// a surface key the viewer draws on its map (`viewer.prd` · bare `viewer`), kept as written —
// the renderer ignores one it does not know, doctor warns. `flow` is mermaid source (a string).
const uxItems = (v) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
    .map((it) => {
      if (typeof it === 'string') return { text: it.trim(), at: '' }
      if (it && typeof it === 'object' && typeof it.text === 'string') return { text: it.text.trim(), at: typeof it.at === 'string' ? it.at.trim() : '' }
      return null
    })
    .filter((it) => it && it.text)
export function normalizeGuide(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null
  const logic = (Array.isArray(g.logic) ? g.logic : [])
    .map((it) => {
      if (typeof it === 'string') return { text: it.trim(), ground: [] }
      if (it && typeof it === 'object' && typeof it.text === 'string') return { text: it.text.trim(), ground: textList(it.ground) }
      return null
    })
    .filter((it) => it && it.text)
  const out = { when: textList(g.when), ux: uxItems(g.ux), logic, limits: textList(g.limits), example: textList(g.example).join(' '), flow: typeof g.flow === 'string' ? g.flow.trim() : '' }
  return out.when.length || out.ux.length || out.logic.length || out.limits.length || out.example || out.flow ? out : null
}

export function collectFeatureTaxonomy(repoRoot) {
  const cfgPath = path.join(repoRoot, '.prdt/config.json')
  let cfg
  try {
    const real = containedFile(repoRoot, cfgPath)
    if (!real) return null
    cfg = readJson(real)
  } catch {
    return null
  }
  const feat = cfg && typeof cfg.features === 'object' && cfg.features ? cfg.features : {}
  const tax = feat.taxonomy && typeof feat.taxonomy === 'object' ? feat.taxonomy : null
  if (!tax || !Array.isArray(tax.areas) || tax.areas.length === 0) return null
  const pick = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((x) => x && typeof x.key === 'string')
      .map((x) => ({ key: x.key, name: typeof x.name === 'string' ? x.name : x.key, def: typeof x.def === 'string' ? x.def : '' }))
  const vocab = feat.vocab && typeof feat.vocab === 'object' ? feat.vocab : {}
  const entries = []
  for (const [key, ent] of Object.entries(vocab)) {
    const t = ent && typeof ent.taxonomy === 'object' && ent.taxonomy ? ent.taxonomy : null
    if (!t || typeof t.area !== 'string') continue
    entries.push({
      key,
      name: typeof ent.label === 'string' ? ent.label : key,
      kind: typeof t.kind === 'string' ? t.kind : '',
      area: t.area,
      def: typeof t.def === 'string' ? t.def : '',
      guide: normalizeGuide(t.guide),
      aliases: Array.isArray(ent.aliases) ? ent.aliases.filter((a) => typeof a === 'string') : [],
      links: (Array.isArray(t.links) ? t.links : [])
        .filter((l) => l && typeof l.to === 'string')
        .map((l) => ({ to: l.to, text: typeof l.text === 'string' ? l.text : '', ground: typeof l.ground === 'string' ? l.ground : '' })),
    })
  }
  return { areas: pick(tax.areas), kinds: pick(tax.kinds), entries }
}

// T-795: the home progress matrix's row set + labels read the open PRD
// version section's OWN `#### <key> — <label>` headings (contracts
// §Fixed-paths: that heading form is fixed) rather than a hand-typed roster
// kept in render.mjs/labels.mjs — the old roster was productune's own v1.10
// item keys, so a v1.11 item (or another project's own items) had no row at
// all. The section is found the same way every other "is this the current
// version" check in this codebase already does it (`sameVersion`, T-713),
// never a literal string compare against "## v1.11" — so this holds for any
// project's own version string too.
const PRD_VERSION_HEADING_RE = /^##\s+(\S+)/
const PRD_ITEM_HEADING_RE = /^####\s+(\S+)(?:\s+—\s+(.*))?\s*$/

/**
 * Ordered `{key, label}` pairs read from the OPEN `## v<N>.<m>` section's own
 * `#### <key> — <label>` headings. A heading with no ` — <label>` part
 * (malformed against the contract's own fixed form) falls back to its own
 * key as the label, rather than dropping the row.
 * @param {string} prdBody docs/prd/PRD.md's body (standing head + open
 *   version — contracts §Fixed-paths "read unit")
 * @param {string} currentVersion
 * @returns {Array<{key:string, label:string}>}
 */
export function collectPrdOpenItems(prdBody, currentVersion, line = null) {
  const items = []
  for (const line_ of openSectionLines(prdBody, currentVersion, line)) {
    const line = line_
    const m = PRD_ITEM_HEADING_RE.exec(line)
    if (m) {
      const key = m[1]
      const label = (m[2] || '').trim() || key
      items.push({ key, label })
    }
  }
  return items
}

/** The lines of the OPEN `## v<N>.<m>` section (heading excluded), found by `sameVersion` (T-713). */
function openSectionLines(prdBody, currentVersion, line = null) {
  const lines = (prdBody || '').split('\n')
  // T-961: an added line's open section is headed `## <line> v<N>.<m>`.
  const headingRe = line ? new RegExp(`^##\\s+${escapeRe(line)}\\s+(v\\S+)`) : PRD_VERSION_HEADING_RE
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i])
    if (m && sameVersion(m[1], currentVersion)) {
      start = i + 1
      break
    }
  }
  if (start === -1) return []
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end)
}

/**
 * T-881: the path the open PRD section's 합격선 row names (the first
 * backtick-quoted `docs/...` path on the line that carries `**합격선**`), or
 * `''`. Home finds the gate ticket by that path in a ticket body — the PRD
 * names no ticket id, and a ticket has no gate field.
 */
export function collectPrdGatePath(prdBody, currentVersion, line = null) {
  for (const line_ of openSectionLines(prdBody, currentVersion, line)) {
    const line = line_
    if (!line.includes('**합격선**')) continue
    const m = /`(docs\/[^`\s]+)`/.exec(line)
    if (m) return m[1]
  }
  return ''
}

export function collectPrd(repoRoot, currentVersion, { line = null, lineNames = [], layout = createDocsLayout(repoRoot) } = {}) {
  // T-746: a project whose PRD is not written yet still gets a viewer (an
  // empty open section), never an ENOENT.
  // T-1104: the PRD dir is `docs/<product>/prd` in the product layout.
  const prdRelDir = layout.relDir('prd')
  // T-1108: a product layout gives an added product its own PRD file — no `## <line> v…` sections, no `versions/<line>/`.
  if (layout.layout === 'product' && line) {
    line = null
    lineNames = []
  }
  const prdPath = path.join(repoRoot, prdRelDir, 'PRD.md')
  const doc = readDoc(repoRoot, prdPath) ?? { rel: `${prdRelDir}/PRD.md`, frontmatter: {}, body: '' }
  // T-961: with release lines declared, each line reads the shared head plus
  // ITS OWN open section only (release-lines.md §3 read unit).
  const current = lineNames.length > 0 ? { ...doc, body: prdLineBody(doc.body, line, lineNames) } : doc
  const versionsDir = path.join(repoRoot, prdRelDir, 'versions', ...(line ? [line] : []))
  const closed = listMarkdownFiles(repoRoot, versionsDir).map((f) => {
    const rel = `${prdRelDir}/versions/${line ? `${line}/` : ''}${f}`
    return { rel, name: f, body: fs.readFileSync(containedFile(repoRoot, path.join(versionsDir, f)), 'utf8') }
  })
  const gatePath = collectPrdGatePath(current.body, currentVersion, line)
  // T-1104: the PRD names the gate artifact as written (As-Is `docs/artifacts/…`);
  // a ticket may name it either way, so the To-Be form rides beside it.
  const gatePathAlt = gatePath ? layout.resolveRef(gatePath) : gatePath
  return { current, closed, openItems: collectPrdOpenItems(current.body, currentVersion, line), gatePath, ...(gatePathAlt && gatePathAlt !== gatePath ? { gatePathAlt } : {}) }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * T-961: PRD.md as one release line reads it — every `##` block that is not a
 * version section of ANY line (the shared head, `## Phase N`), plus that
 * line's own version section(s). `line` null = the home line (`## v…`); an
 * added line's section is `## <line> v…`. Fenced code is not a heading.
 */
export function prdLineBody(body, line, lineNames) {
  const alt = lineNames.map(escapeRe).join('|')
  const rx = new RegExp(`^##\\s+(?:(${alt})\\s+)?(v\\d\\S*)`)
  const out = []
  let keep = true
  let fence = false
  for (const ln of (body || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence
    if (!fence && /^##\s/.test(ln)) {
      const m = rx.exec(ln)
      keep = !m || (m[1] ?? null) === line
    }
    if (keep) out.push(ln)
  }
  return out.join('\n')
}

/**
 * The per-product entries of a config / po-state object: `products`, else the
 * pre-v1.14 `lines` (T-1108 ⑦, the CLI's `_products_key`).
 */
export function productsOf(obj) {
  if (!obj || typeof obj !== 'object') return undefined
  return 'products' in obj || !('lines' in obj) ? obj.products : obj.lines
}

/**
 * T-961 / T-1108: the added products (`.prdt/config.json` `products`), mirroring
 * the CLI's `project_lines`: entries whose `name` is a legal product name,
 * unique and not the slug, in declaration order. [] = a single-product project.
 */
const LINE_NAME_RE = /^(?!v[0-9])(?!backlog$)[a-z0-9]+(?:-[a-z0-9]+)*$/
export function collectLineNames(repoRoot) {
  let cfg
  try {
    const real = containedFile(repoRoot, path.join(repoRoot, '.prdt/config.json'))
    if (!real) return []
    cfg = readJson(real)
  } catch {
    return []
  }
  const raw = cfg ? productsOf(cfg) : null
  if (!Array.isArray(raw)) return []
  const out = []
  for (const e of raw) {
    const name = e && typeof e === 'object' ? e.name : undefined
    if (typeof name === 'string' && LINE_NAME_RE.test(name) && !out.includes(name) && name !== cfg.slug) out.push(name)
  }
  return out
}

/** T-961 / T-1108: `(stage, version)` of an added product from po-state `products.<product>` (the CLI's `line_state`); version bare, '' when absent. */
export function lineState(poState, line) {
  const all = productsOf(poState)
  const ls = all && typeof all === 'object' ? all[line] : null
  if (!ls || typeof ls !== 'object') return { stage: '', version: '' }
  const v = typeof ls.version === 'string' ? ls.version.trim() : ''
  return { stage: typeof ls.stage === 'string' ? ls.stage : '', version: v }
}

const ARTIFACTS_ROOT_REL = 'docs/artifacts'

/**
 * True when `bucket`/`relPath` (exactly as one manifest row names them)
 * resolves to a real path still INSIDE `docs/artifacts` — never a `../`
 * (in either field) walking out of it (T-711 F5: collect.mjs never checked
 * this, so a manifest row like `{bucket:"v1.10", path:"../../../etc/passwd"}`
 * would have its arbitrary target read straight into the page).
 * @param {string} repoRoot
 * @param {string} bucket
 * @param {string} relPath
 */
export function isContainedArtifactPath(repoRoot, bucket, relPath, artifactsRootRel = ARTIFACTS_ROOT_REL) {
  const artifactsRoot = path.resolve(repoRoot, artifactsRootRel)
  const resolved = path.resolve(artifactsRoot, bucket ?? '', relPath ?? '')
  if (resolved !== artifactsRoot && !resolved.startsWith(artifactsRoot + path.sep)) return false
  // T-711 slice 3 B3: the string check above is judged on the RAW bucket/path
  // — path.resolve knows nothing about %-encoding, so it sees a row like
  // {bucket:'v1', path:'%2E%2E/%2e./.%2e/%2e%2e/OUTSIDE.md'} as an opaque,
  // un-collapsible name and lets it through (QA re-pass of 936baeb: the file
  // named no path on disk, so the realpathSync check below threw ENOENT and
  // fell back to "true" on this same raw check — the fileHref this row went
  // on to build then kept the %2e%2e segments verbatim, and a REAL BROWSER
  // decodes them as a real ".." on navigation, climbing one directory above
  // docs/artifacts). Judging the DECODED, per-segment form too (same rule as
  // resolveDocLink's own B1 fix, shared via `decodePathSegments`) catches
  // this regardless of whether the target exists on disk yet.
  const decodedResolved = path.resolve(artifactsRoot, decodePathSegments(bucket ?? ''), decodePathSegments(relPath ?? ''))
  if (decodedResolved !== artifactsRoot && !decodedResolved.startsWith(artifactsRoot + path.sep)) return false
  // T-711 slice 2 B2: the string-level check above holds, but a SYMLINK
  // sitting under docs/artifacts (the bucket dir itself, or the final file)
  // can still point outside it while every path string involved still reads
  // as "under docs/artifacts" (QA repro: a symlinked file/dir under
  // docs/artifacts inlined an outside file's real body). realpathSync
  // resolves every symlink in the chain, so this catches that regardless of
  // which segment carries the link.
  let realResolved
  try {
    realResolved = fs.realpathSync(resolved)
  } catch {
    // Nothing on disk yet at this path (a manifest row for a file not yet
    // landed, or already removed) — no symlink to resolve, so the
    // string-level containment check above is the whole answer.
    return true
  }
  let realRoot
  try {
    realRoot = fs.realpathSync(artifactsRoot)
  } catch {
    return true // docs/artifacts itself does not exist on disk at all
  }
  if (!(realResolved === realRoot || realResolved.startsWith(realRoot + path.sep))) return false
  // T-912: docs/artifacts itself may be a link out of the repo — then the
  // check above compares the outside target with itself.
  return realInsideRepo(repoRoot, resolved) !== null
}

/**
 * @returns {{ entries: Array<{fields:object, inlined:boolean, body?:string}> }}
 */
export function collectArtifacts(repoRoot, layout = createDocsLayout(repoRoot)) {
  // T-1104: `docs/<product>/artifacts` in the product layout.
  const artifactsRel = layout.relDir('artifacts')
  const manifestPath = path.join(repoRoot, artifactsRel, 'manifest.json')
  // T-713: a version with no artifacts yet (ARTIFACT.empty's own second line —
  // "버전이 열리면 이 버킷에 manifest.json 이 생겨요" — states this as the
  // NORMAL pre-manifest state, not an error) has no manifest.json on disk at
  // all; treat it as zero entries rather than throwing `readJson`'s ENOENT.
  const realManifest = containedFile(repoRoot, manifestPath)
  if (!realManifest) return { entries: [], files: collectArtifactFiles(repoRoot, artifactsRel) }
  const manifest = readJson(realManifest)
  const entries = []
  for (const fields of manifest.entries || []) {
    const bucket = fields.bucket
    // T-711 F5: a row whose bucket/path resolves outside docs/artifacts is
    // refused wholesale — never inlined, never linked, never counted — rather
    // than building a fileHref that points at an arbitrary file on the
    // machine that ran `pnpm viewer`.
    if (!isContainedArtifactPath(repoRoot, bucket, fields.path, artifactsRel)) continue
    const relFsPath = path.join(repoRoot, artifactsRel, bucket, fields.path)
    const isMd = fields.path.toLowerCase().endsWith('.md')
    let body
    let bytes
    let unreadable = false
    if (fs.existsSync(relFsPath)) {
      bytes = fs.statSync(relFsPath).size
      // T-1010: a file the generating user cannot read cannot be shown in the panel either.
      try { fs.accessSync(relFsPath, fs.constants.R_OK) } catch { unreadable = true }
      if (isMd && !unreadable) body = fs.readFileSync(relFsPath, 'utf8')
    }
    entries.push({
      fields,
      diskRel: `${artifactsRel}/${bucket}/${fields.path}`,
      inlined: isMd && body !== undefined,
      bytes,
      unreadable,
      body,
    })
  }
  return { entries, files: collectArtifactFiles(repoRoot, artifactsRel) }
}

// T-1187: every regular file under the artifacts dir, repo-relative — the paths a body may name
// that the manifest does not list (an unregistered mock). Symlinks are skipped, so nothing outside
// the repo is named; the render side links such a path as a plain file href, never inlined.
function collectArtifactFiles(repoRoot, artifactsRel) {
  const files = []
  const walk = (rel) => {
    let dirents
    try {
      dirents = fs.readdirSync(path.join(repoRoot, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const d of dirents) {
      const child = `${rel}/${d.name}`
      if (d.isDirectory()) walk(child)
      else if (d.isFile()) files.push(child)
    }
  }
  walk(artifactsRel)
  return files.sort()
}

// T-883: the release notes — `code/docs/RELEASES.md`, one `## <version> —
// <title> (<date>)` section per shipped version, newest first (the format is
// written in that file's own preamble). Read path: `<repoRoot>/code/docs/RELEASES.md`
// only — the code checkout's file, never a path taken from a document.
// Containment: the file is read only when its REAL path (every symlink
// resolved) is exactly that path under the REAL repo root — a symlinked
// `code`, `docs` or `RELEASES.md` (T-842 · T-847 class: another repository's
// committed link) reads as "no release notes", never as a file outside the
// project. A missing, unreadable or non-file entry is the same empty list.
export const RELEASES_REL = 'code/docs/RELEASES.md'

/**
 * @param {string} text the whole RELEASES.md
 * @returns {Array<{version:string, title:string, date:string, body:string}>} sections in file order; text above the first version heading (the preamble) is ignored, as the file's own format says.
 */
export function parseReleases(text) {
  const sections = []
  let cur = null
  let fence = null
  for (const line of String(text).split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
    }
    const h = fence === null ? /^##\s+(v\d\S*)(?:\s+[—–-]\s+(.*?))?\s*$/.exec(line) : null
    if (h) {
      let title = h[2] || ''
      let date = ''
      const d = /\s*\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(title) || /^\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(title)
      if (d) { date = d[1]; title = title.slice(0, d.index).trim() }
      cur = { version: h[1], title, date, lines: [] }
      sections.push(cur)
    } else if (cur) {
      cur.lines.push(line)
    }
  }
  return sections.map((s) => ({ version: s.version, title: s.title, date: s.date, body: s.lines.join('\n').trim() }))
}

export function collectReleases(repoRoot) {
  try {
    const realRoot = fs.realpathSync(repoRoot)
    const abs = path.join(realRoot, RELEASES_REL)
    if (fs.realpathSync(abs) !== abs) return []
    if (!fs.statSync(abs).isFile()) return []
    return parseReleases(fs.readFileSync(abs, 'utf8'))
  } catch {
    return []
  }
}

// T-1165: the TOOL's version (sidebar bottom-left) — the installed package's own
// docs/RELEASES.md, its first `## ` line's first token: the same source `prdt --version`
// reads (installed_prdt_version). Never the project's `code/docs/RELEASES.md`, so a
// project without a code/ folder shows it too. '' when unreadable.
export const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * T-1180: the 합격선 lanes of one product — the ONE lane computation (`prdt_lanes.lanes_for`, the module
 * `prdt schedule --json` and the statusline share), never a second copy here. Read-only; any failure
 * (no python3, not a prdt project, bad PRD) is `[]`, which the scope block draws as no lanes.
 * @returns {Array<{name: string, linked: boolean, done: number, total: number, tickets: string[]}>}
 */
export function collectLanes(repoRoot, line = null, { scriptsDir = path.join(INSTALL_ROOT, 'packages/core/scripts') } = {}) {
  if (!fs.existsSync(path.join(scriptsDir, 'prdt_lanes.py'))) return []
  // -I: neither the cwd (the project root) nor PYTHONPATH reaches sys.path, so the sibling module is
  // put there in code — a project-root prdt_lanes.py / json.py is never imported (T-1195).
  const code = 'import sys,json\nsys.path.insert(0,sys.argv[3])\nimport prdt_lanes as m\nprint(json.dumps(m.lanes_for(sys.argv[1], sys.argv[2] or None), ensure_ascii=False))'
  try {
    const r = spawnSync('python3', ['-I', '-c', code, repoRoot, line || '', scriptsDir], {
      encoding: 'utf8',
      timeout: 20000,
      cwd: repoRoot,
      env: process.env,
    })
    if (r.status !== 0) return []
    const lanes = JSON.parse(r.stdout)
    if (!Array.isArray(lanes)) return []
    return lanes.map((l) => ({ name: String(l.name), linked: l.linked === true, done: Number(l.done) || 0, total: Number(l.total) || 0, tickets: Array.isArray(l.tickets) ? l.tickets.map(String) : [] }))
  } catch {
    return []
  }
}

export function collectToolVersion(installRoot = INSTALL_ROOT) {
  try {
    const line = fs.readFileSync(path.join(installRoot, 'docs', 'RELEASES.md'), 'utf8').split('\n').find((l) => l.startsWith('## '))
    return line ? line.slice(3).trim().split(/\s+/)[0] : ''
  } catch {
    return ''
  }
}

// T-886 (T-832 / T-877): the discipline documents — the copy applied on THIS
// machine (`~/.prdt/discipline`), because that is what the agents read here
// (T-877 D2). Which files count: `contracts.md`, `contracts/*.md`, and for each
// persona `habit.md` and `playbooks/*.md` — 42 today. `doctrine.md`,
// `designer/style-library`, `designer/screen-set` and `register/` are not
// documents of this list (T-877 outcome: doctrine.md is a decision for later).
// Containment: a file is read only when its REAL path is exactly its place
// under the REAL discipline root (a link pointing elsewhere reads as "not
// there"); the repository original used for the 「N줄이 달라요」 comparison is
// read the same way under the REAL repo root (T-842 · T-847 class). No
// discipline root → no documents → the page shows the empty state.
export const DISCIPLINE_SOURCE_REL = 'code/packages/core/discipline'
const DISCIPLINE_PERSONAS = ['po', 'designer', 'developer', 'qa']

export function defaultDisciplineRoot() {
  // same resolution as prdt_home(): PRDT_HOME redirects the tool home (T-911)
  const home = process.env.PRDT_HOME || path.join(os.homedir(), '.prdt')
  return path.join(home, 'discipline')
}

function readContainedText(realRoot, rel) {
  try {
    const abs = path.join(realRoot, rel)
    if (fs.realpathSync(abs) !== abs) return null
    if (!fs.statSync(abs).isFile()) return null
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

function splitLines(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * How many lines differ between two versions of a document: the larger of
 * the lines only the first has and the lines only the second has (a changed
 * line counts once).
 * @param {string[]} a
 * @param {string[]} b
 */
export function countChangedLines(a, b) {
  const n = a.length
  const m = b.length
  let lcs
  if (n * m > 4_000_000) {
    const seen = new Map()
    for (const l of b) seen.set(l, (seen.get(l) || 0) + 1)
    lcs = 0
    for (const l of a) {
      const c = seen.get(l) || 0
      if (c > 0) { lcs += 1; seen.set(l, c - 1) }
    }
  } else {
    let prev = new Array(m + 1).fill(0)
    for (let i = 1; i <= n; i += 1) {
      const cur = new Array(m + 1).fill(0)
      for (let j = 1; j <= m; j += 1) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
      prev = cur
    }
    lcs = prev[m]
  }
  return Math.max(n - lcs, m - lcs)
}

function listDisciplineRels(realRoot) {
  const mdIn = (dir) => {
    try {
      return fs.readdirSync(path.join(realRoot, dir), { withFileTypes: true })
        .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith('.md') && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
    } catch {
      return []
    }
  }
  const out = [{ rel: 'contracts.md', group: 'contracts', kind: 'contract' }]
  for (const f of mdIn('contracts')) out.push({ rel: `contracts/${f}`, group: 'contracts', kind: 'contract' })
  for (const persona of DISCIPLINE_PERSONAS) {
    out.push({ rel: `${persona}/habit.md`, group: persona, kind: 'habit' })
    for (const f of mdIn(`${persona}/playbooks`)) {
      out.push({ rel: `${persona}/playbooks/${f}`, group: persona, kind: f === '_index.md' ? 'index' : 'playbook' })
    }
  }
  return out
}

/**
 * @returns {Array<{rel:string, name:string, group:string, kind:string, lines:string[], differs:number}>}
 *   `differs` = lines that differ from the repository original (0 = same, or no original to compare with).
 */
export function collectDiscipline(repoRoot, { disciplineRoot = defaultDisciplineRoot() } = {}) {
  let realRoot
  try {
    realRoot = fs.realpathSync(disciplineRoot)
    if (!fs.statSync(realRoot).isDirectory()) return []
  } catch {
    return []
  }
  let sourceRoot = null
  try {
    const candidate = path.join(fs.realpathSync(repoRoot), DISCIPLINE_SOURCE_REL)
    if (fs.realpathSync(candidate) === candidate && fs.statSync(candidate).isDirectory()) sourceRoot = candidate
  } catch {
    sourceRoot = null
  }
  const docs = []
  for (const e of listDisciplineRels(realRoot)) {
    const text = readContainedText(realRoot, e.rel)
    if (text === null) continue
    const lines = splitLines(text)
    let differs = 0
    if (sourceRoot !== null) {
      const original = readContainedText(sourceRoot, e.rel)
      differs = original === null ? 0 : countChangedLines(lines, splitLines(original))
    }
    docs.push({ rel: e.rel, name: e.rel.split('/').pop().replace(/\.md$/, ''), group: e.group, kind: e.kind, lines, differs })
  }
  return docs
}

/** T-809: the project slug from the meta repo's `.prdt/config.json`; null when absent. */
export function collectProjectSlug(repoRoot) {
  try {
    const slug = readJson(containedFile(repoRoot, path.join(repoRoot, '.prdt/config.json'))).slug
    return typeof slug === 'string' && slug.trim() ? slug.trim() : null
  } catch {
    return null
  }
}

/** Everything the generator needs, gathered once. */
export function collectAll(repoRoot, { disciplineRoot, toolRoot } = {}) {
  const poState = readPoState(repoRoot)
  const currentVersion = poState.version
  const lineNames = collectLineNames(repoRoot)
  const cfg = readConfig(repoRoot)
  const layout = createDocsLayout(repoRoot)
  // T-961: one entry per added release line; [] = single-line, every other
  // field exactly as before.
  const homeEnv = collectEnv(repoRoot, homeEnvDir(repoRoot, cfg))
  const lines = lineNames.map((name) => {
    const { stage, version } = lineState(poState, name)
    const lineLayout = layout.layout === 'product' ? createDocsLayout(repoRoot, name) : layout
    return {
      name,
      stage,
      version,
      prd: collectPrd(repoRoot, version, { line: name, lineNames, layout: lineLayout }),
      tickets: collectTickets(repoRoot, version, { line: name, layout: lineLayout }),
      lanes: collectLanes(repoRoot, name),
      // T-958: key names + set/empty only (env-status.mjs).
      env: collectEnv(repoRoot, lineEnvDir(cfg, name)),
    }
  })
  return {
    poState,
    project: collectProjectSlug(repoRoot),
    currentVersion,
    lines,
    // T-1104: how this project's docs/ is laid out — render maps As-Is paths and links through it.
    docsLayout: layout,
    prd: collectPrd(repoRoot, currentVersion, { lineNames, layout }),
    tickets: collectTickets(repoRoot, currentVersion, { exclude: lineNames, layout }),
    lanes: collectLanes(repoRoot),
    wiki: collectWiki(repoRoot, layout),
    features: collectFeatures(repoRoot, layout),
    featureTaxonomy: collectFeatureTaxonomy(repoRoot),
    artifacts: collectArtifacts(repoRoot, layout),
    releases: collectReleases(repoRoot),
    toolVersion: collectToolVersion(toolRoot),
    discipline: collectDiscipline(repoRoot, disciplineRoot === undefined ? undefined : { disciplineRoot }),
    // T-1050: the load diagram's facts (plan · annex when · menus · hook roster).
    disciplineLoad: collectDisciplineLoad(repoRoot, { disciplineRoot: disciplineRoot === undefined ? defaultDisciplineRoot() : disciplineRoot }),
    env: homeEnv,
    // T-1109: machine scope (~/.prdt/env/.env) — names and set/empty only.
    machineEnv: collectMachineEnv(process.env.PRDT_HOME || path.join(os.homedir(), '.prdt'), homeEnv),
    // T-1191: the env cards' open links — the prdt link names the project root (realpath, what the
    // URL handler checks), never a file path; VS Code's button shows only when it is installed.
    projectRoot: realRootOrNull(repoRoot),
    editors: { vscode: detectVsCode() },
  }
}

function realRootOrNull(repoRoot) {
  try {
    return fs.realpathSync(repoRoot)
  } catch {
    return null
  }
}

/** `.prdt/config.json`, or null when absent or unreadable. */
function readConfig(repoRoot) {
  try {
    const real = containedFile(repoRoot, path.join(repoRoot, '.prdt/config.json'))
    return real ? readJson(real) : null
  } catch {
    return null
  }
}
