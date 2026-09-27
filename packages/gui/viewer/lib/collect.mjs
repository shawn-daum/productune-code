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
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.mjs'

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
  return { rel: doc.rel, frontmatter: { id: fm.id, slug: fm.slug, type: fm.type, status: fm.status, assignee: fm.assignee } }
}

/**
 * @returns {{ included: Array, omitted: Array<{bucket:string, count:number, bytes:number, tickets:Array}> }}
 */
export function collectTickets(repoRoot, currentVersion) {
  const ticketsRoot = path.join(repoRoot, 'docs/tickets')
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
    const isCurrent = bucket === currentVersion || bucket === 'backlog'
    if (isCurrent) {
      for (const f of files) {
        const doc = readDoc(repoRoot, path.join(bucketDir, f))
        included.push({ bucket, ...doc })
      }
    } else if (files.length > 0) {
      // T-709 결정 1 (옵션 C): every other bucket gets its own sidebar row
      // too, so its files are now READ (frontmatter only, never `body` —
      // see `ticketLite` above) rather than only stat'd for a byte count.
      let bytes = 0
      const tickets = []
      for (const f of files) {
        const filePath = path.join(bucketDir, f)
        bytes += fs.statSync(filePath).size
        tickets.push(ticketLite(readDoc(repoRoot, filePath)))
      }
      omitted.push({ bucket, count: files.length, bytes, tickets })
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

export function collectPrd(repoRoot) {
  const current = readDoc(repoRoot, path.join(repoRoot, 'docs/prd/PRD.md'))
  const versionsDir = path.join(repoRoot, 'docs/prd/versions')
  const closed = listMarkdownFiles(versionsDir).map((f) => {
    const rel = `docs/prd/versions/${f}`
    return { rel, name: f, body: fs.readFileSync(path.join(versionsDir, f), 'utf8') }
  })
  return { current, closed }
}

/**
 * @returns {{ entries: Array<{fields:object, inlined:boolean, body?:string}> }}
 */
export function collectArtifacts(repoRoot) {
  const manifestPath = path.join(repoRoot, 'docs/artifacts/manifest.json')
  const manifest = readJson(manifestPath)
  const entries = (manifest.entries || []).map((fields) => {
    const bucket = fields.bucket
    const relFsPath = path.join(repoRoot, 'docs/artifacts', bucket, fields.path)
    const isMd = fields.path.toLowerCase().endsWith('.md')
    let body
    let bytes
    if (fs.existsSync(relFsPath)) {
      bytes = fs.statSync(relFsPath).size
      if (isMd) body = fs.readFileSync(relFsPath, 'utf8')
    }
    return {
      fields,
      diskRel: `docs/artifacts/${bucket}/${fields.path}`,
      inlined: isMd && body !== undefined,
      bytes,
      body,
    }
  })
  return { entries }
}

/** Everything the generator needs, gathered once. */
export function collectAll(repoRoot) {
  const poState = readPoState(repoRoot)
  const currentVersion = poState.version
  return {
    poState,
    currentVersion,
    prd: collectPrd(repoRoot),
    tickets: collectTickets(repoRoot, currentVersion),
    wiki: collectWiki(repoRoot),
    features: collectFeatures(repoRoot),
    artifacts: collectArtifacts(repoRoot),
  }
}
