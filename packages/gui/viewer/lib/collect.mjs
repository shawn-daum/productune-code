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
// follows a stated rule"):
//   - Inlined IN FULL: docs/prd/PRD.md (standing head + open version) +
//     docs/prd/versions/*.md (closed rounds — 245 KB total, 2026-09-26) +
//     docs/wiki/**/*.md (789 KB) + docs/features/*.md (27 KB) + tickets in
//     the CURRENT po-state version directory + docs/tickets/backlog/ (the
//     actionable "now" set) + artifact entries whose file is `.md` (407 KB;
//     plain prose, no foreign styling/script to collide with the page's own).
//   - NOT inlined, path + count/bytes shown instead: tickets in any OTHER
//     (closed-round) version directory — 840 tickets total on this repo,
//     6.47 MB combined; a past round's tickets are not needed to answer
//     "where do I open this NOW", and a directory of 200+ closed tickets from
//     three rounds ago was exactly what the mockup (T-665 problem statement)
//     found had to come out. Artifact entries whose file is `.html`/`.json`
//     are also not inlined — each `.html` artifact is ALREADY an independent
//     `file://`-openable static page (embedding a foreign page's own
//     `<html><style><script>` inside this one risks exactly the CSS/JS
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

/**
 * @returns {{ included: Array, omitted: Array<{bucket:string, count:number, bytes:number}> }}
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
      let bytes = 0
      for (const f of files) bytes += fs.statSync(path.join(bucketDir, f)).size
      omitted.push({ bucket, count: files.length, bytes })
    }
  }
  // Deterministic order: current version's own tickets first (id order),
  // then backlog, matching the two "included" buckets' natural read order.
  included.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === currentVersion ? -1 : 1
    return (a.frontmatter.id || '').localeCompare(b.frontmatter.id || '')
  })
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
