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
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.mjs'
// T-713: reuse render.mjs's own numeric version-equality rule (contracts
// §Fixed-paths "`v1` ≡ `v1.0.0`") rather than a second string-equality copy —
// a ticket bucket directory spelled differently from po-state's own version
// string (`v1.10.0` on disk vs `v1.10` in `.prdt/po-state.json`) is still the
// same version. No cycle: render.mjs never imports collect.mjs.
import { sameVersion, decodePathSegments } from './render.mjs'

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort()
}

/** @returns {{schema_version:number, stage:string, version:string, current_task:unknown}} */
export function readPoState(repoRoot) {
  return readJson(path.join(repoRoot, '.prdt/po-state.json'))
}

function readDoc(repoRoot, absPath) {
  const raw = fs.readFileSync(absPath, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  return { rel: path.relative(repoRoot, absPath).split(path.sep).join('/'), frontmatter: data, body }
}

// T-709 결정 1: a lightweight, frontmatter-only ticket entry for a non-
// current/non-backlog bucket — deliberately built with NO `body` key at all
// (never `body: undefined` either — the key is absent), so a later change to
// render.mjs cannot accidentally interpolate a closed round's ticket prose by
// reaching for `.body` on one of these: the value simply is not there to read.
function ticketLite(doc) {
  const fm = doc.frontmatter
  return { rel: doc.rel, frontmatter: { id: fm.id, slug: fm.slug, type: fm.type, status: fm.status, assignee: fm.assignee, feature: fm.feature } }
}

/**
 * @returns {{ included: Array, omitted: Array<{bucket:string, count:number, bytes:number, tickets:Array, bodies:Record<string,string>}> }}
 */
export function collectTickets(repoRoot, currentVersion) {
  const ticketsRoot = path.join(repoRoot, 'docs/tickets')
  // T-746: a project with no ticket yet has no docs/tickets at all — zero
  // tickets, never an ENOENT that leaves the viewer ungenerated.
  if (!fs.existsSync(ticketsRoot)) return { included: [], omitted: [] }
  const bucketDirs = fs
    .readdirSync(ticketsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const included = []
  const omitted = []
  for (const bucket of bucketDirs) {
    const bucketDir = path.join(ticketsRoot, bucket)
    const files = fs
      .readdirSync(bucketDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^T-.+\.md$/.test(e.name))
      .map((e) => e.name)
      .sort()
    const isCurrent = sameVersion(bucket, currentVersion) || bucket === 'backlog'
    if (isCurrent) {
      for (const f of files) {
        const doc = readDoc(repoRoot, path.join(bucketDir, f))
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
      for (const f of files) {
        const filePath = path.join(bucketDir, f)
        bytes += fs.statSync(filePath).size
        const doc = readDoc(repoRoot, filePath)
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

export function collectWiki(repoRoot) {
  const dir = path.join(repoRoot, 'docs/wiki')
  return listMarkdownFiles(dir)
    .filter((f) => f !== 'index.md')
    .map((f) => readDoc(repoRoot, path.join(dir, f)))
}

export function collectFeatures(repoRoot) {
  const dir = path.join(repoRoot, 'docs/features')
  return listMarkdownFiles(dir).map((f) => readDoc(repoRoot, path.join(dir, f)))
}

// T-882: the feature taxonomy the feature screen draws — `.prdt/config.json`
// `features.taxonomy` ({areas, kinds}, ordered) + each `features.vocab`
// entry's `label` and `taxonomy` ({kind, area, def, links}). The vocab block
// is the ONE list of feature keys `prdt doctor` already checks tickets'
// `feature:` values against (W4), so the screen and that check read the same
// keys. Null when the config has no `features.taxonomy.areas` (the screen's
// empty state); a malformed config is the same null — doctor names the fault.
export function collectFeatureTaxonomy(repoRoot) {
  const cfgPath = path.join(repoRoot, '.prdt/config.json')
  if (!fs.existsSync(cfgPath)) return null
  let cfg
  try {
    cfg = readJson(cfgPath)
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
export function collectPrdOpenItems(prdBody, currentVersion) {
  const items = []
  for (const line of openSectionLines(prdBody, currentVersion)) {
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
function openSectionLines(prdBody, currentVersion) {
  const lines = (prdBody || '').split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = PRD_VERSION_HEADING_RE.exec(lines[i])
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
export function collectPrdGatePath(prdBody, currentVersion) {
  for (const line of openSectionLines(prdBody, currentVersion)) {
    if (!line.includes('**합격선**')) continue
    const m = /`(docs\/[^`\s]+)`/.exec(line)
    if (m) return m[1]
  }
  return ''
}

export function collectPrd(repoRoot, currentVersion) {
  // T-746: a project whose PRD is not written yet still gets a viewer (an
  // empty open section), never an ENOENT.
  const prdPath = path.join(repoRoot, 'docs/prd/PRD.md')
  const current = fs.existsSync(prdPath)
    ? readDoc(repoRoot, prdPath)
    : { rel: 'docs/prd/PRD.md', frontmatter: {}, body: '' }
  const versionsDir = path.join(repoRoot, 'docs/prd/versions')
  const closed = listMarkdownFiles(versionsDir).map((f) => {
    const rel = `docs/prd/versions/${f}`
    return { rel, name: f, body: fs.readFileSync(path.join(versionsDir, f), 'utf8') }
  })
  return { current, closed, openItems: collectPrdOpenItems(current.body, currentVersion), gatePath: collectPrdGatePath(current.body, currentVersion) }
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
export function isContainedArtifactPath(repoRoot, bucket, relPath) {
  const artifactsRoot = path.resolve(repoRoot, ARTIFACTS_ROOT_REL)
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
  return realResolved === realRoot || realResolved.startsWith(realRoot + path.sep)
}

/**
 * @returns {{ entries: Array<{fields:object, inlined:boolean, body?:string}> }}
 */
export function collectArtifacts(repoRoot) {
  const manifestPath = path.join(repoRoot, ARTIFACTS_ROOT_REL, 'manifest.json')
  // T-713: a version with no artifacts yet (ARTIFACT.empty's own second line —
  // "버전이 열리면 이 버킷에 manifest.json 이 생겨요" — states this as the
  // NORMAL pre-manifest state, not an error) has no manifest.json on disk at
  // all; treat it as zero entries rather than throwing `readJson`'s ENOENT.
  if (!fs.existsSync(manifestPath)) return { entries: [] }
  const manifest = readJson(manifestPath)
  const entries = []
  for (const fields of manifest.entries || []) {
    const bucket = fields.bucket
    // T-711 F5: a row whose bucket/path resolves outside docs/artifacts is
    // refused wholesale — never inlined, never linked, never counted — rather
    // than building a fileHref that points at an arbitrary file on the
    // machine that ran `pnpm viewer`.
    if (!isContainedArtifactPath(repoRoot, bucket, fields.path)) continue
    const relFsPath = path.join(repoRoot, ARTIFACTS_ROOT_REL, bucket, fields.path)
    const isMd = fields.path.toLowerCase().endsWith('.md')
    let body
    let bytes
    if (fs.existsSync(relFsPath)) {
      bytes = fs.statSync(relFsPath).size
      if (isMd) body = fs.readFileSync(relFsPath, 'utf8')
    }
    entries.push({
      fields,
      diskRel: `${ARTIFACTS_ROOT_REL}/${bucket}/${fields.path}`,
      inlined: isMd && body !== undefined,
      bytes,
      body,
    })
  }
  return { entries }
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
  return path.join(os.homedir(), '.prdt', 'discipline')
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
      differs = original === null ? lines.length : countChangedLines(lines, splitLines(original))
    }
    docs.push({ rel: e.rel, name: e.rel.split('/').pop().replace(/\.md$/, ''), group: e.group, kind: e.kind, lines, differs })
  }
  return docs
}

/** Everything the generator needs, gathered once. */
export function collectAll(repoRoot, { disciplineRoot } = {}) {
  const poState = readPoState(repoRoot)
  const currentVersion = poState.version
  return {
    poState,
    currentVersion,
    prd: collectPrd(repoRoot, currentVersion),
    tickets: collectTickets(repoRoot, currentVersion),
    wiki: collectWiki(repoRoot),
    features: collectFeatures(repoRoot),
    featureTaxonomy: collectFeatureTaxonomy(repoRoot),
    artifacts: collectArtifacts(repoRoot),
    releases: collectReleases(repoRoot),
    discipline: collectDiscipline(repoRoot, disciplineRoot === undefined ? undefined : { disciplineRoot }),
  }
}
