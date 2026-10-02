// viewer/lib/discipline-links.mjs — T-886 (T-832 / T-877): which text in a
// ticket, wiki or PRD body is the name of a discipline document, and where it
// links. Pure functions over the collected document list (collect.mjs
// `collectDiscipline`); no file access here.
//
// The five notations T-877 D3 approved (everything else stays plain text):
//   1. a path        po/playbooks/retro.md · contracts/tickets.md ·
//                    <...>/discipline/po/playbooks/patch-cycle.md · a unique
//                    tail like playbooks/retro.md standing alone
//   2. a unique file name   define-entry.md · tickets.md
//   3. "<name> playbook" / "<name> 플레이북"   (the name is the link)
//   4. a hyphenated document name   patch-cycle · inject-edit · prd-clarity
//   5. "<name> N행" (one link, opens that line) · "<name> N단계" (the name is
//      the link, no line — a step number is not a line)
// A name shared by several documents (habit · _index · ds-conformance) and a
// bare common word (retro · git · dispatch) are never linked on their own.
//
// A link is `<a class="dl" href="#" data-doc="<rel>" [data-line="N"]>`: no
// file path and no scheme, so it never reaches the link-safety check's file
// branch (render.mjs `isHrefContained`); the click is handled in-page.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const byLengthDesc = (a, b) => b.length - a.length || (a < b ? -1 : 1)

/**
 * @param {Array<{rel:string}>} docs discipline documents (rel = path under the discipline root, e.g. `po/playbooks/retro.md`)
 * @returns {null | { regex: RegExp, resolve: (m: RegExpExecArray) => { rel: string, text: string, line: number | null } }} null when there is nothing to link to
 */
export function buildDisciplineIndex(docs) {
  if (!docs || docs.length === 0) return null
  const rels = docs.map((d) => d.rel)
  const relSet = new Set(rels)

  const nameOwners = new Map()
  const suffixOwners = new Map()
  for (const rel of rels) {
    const name = rel.split('/').pop().replace(/\.md$/, '')
    if (!nameOwners.has(name)) nameOwners.set(name, [])
    nameOwners.get(name).push(rel)
    const parts = rel.split('/')
    for (let i = 1; i < parts.length - 1; i += 1) {
      const suffix = parts.slice(i).join('/')
      if (!suffixOwners.has(suffix)) suffixOwners.set(suffix, new Set())
      suffixOwners.get(suffix).add(rel)
    }
  }
  const uniqueName = new Map()
  for (const [name, owners] of nameOwners) if (owners.length === 1) uniqueName.set(name, owners[0])
  const pathKey = new Map()
  for (const rel of rels) pathKey.set(rel, rel)
  for (const [suffix, owners] of suffixOwners) if (owners.size === 1 && !relSet.has(suffix)) pathKey.set(suffix, [...owners][0])

  const names = [...uniqueName.keys()].sort(byLengthDesc)
  const playbookNames = names.filter((n) => uniqueName.get(n).includes('/playbooks/'))
  const hyphenNames = names.filter((n) => n.includes('-'))
  const files = names.map((n) => `${n}.md`)
  const alt = (list) => list.map(reEscape).join('|')

  const L = '(?<![\\w./~-])' // left edge: not inside a longer path, word or slug
  const parts = [
    `${L}(?:(?:[\\w.~-]+/)*discipline/)?(?<p>${alt([...pathKey.keys()].sort(byLengthDesc))})(?![\\w-])`,
    names.length ? `${L}(?<f>${alt(files)})(?![\\w-])` : null,
    names.length ? `${L}(?<ln>${alt(names)}) (?<n>\\d+)행` : null,
    names.length ? `${L}(?<st>${alt(names)})(?= \\d+단계)` : null,
    playbookNames.length ? `${L}(?<pb>${alt(playbookNames)})(?= (?:playbook(?![\\w-])|플레이북))` : null,
    hyphenNames.length ? `${L}(?<hy>${alt(hyphenNames)})(?![\\w-])` : null,
  ].filter(Boolean)
  const regex = new RegExp(parts.join('|'), 'g')

  function resolve(m) {
    const g = m.groups
    if (g.p !== undefined) return { rel: pathKey.get(g.p), text: m[0], line: null }
    if (g.f !== undefined) return { rel: uniqueName.get(g.f.replace(/\.md$/, '')), text: m[0], line: null }
    if (g.ln !== undefined) {
      const n = Number.parseInt(g.n, 10)
      return { rel: uniqueName.get(g.ln), text: m[0], line: n > 0 ? n : null }
    }
    const name = g.st ?? g.pb ?? g.hy
    return { rel: uniqueName.get(name), text: m[0], line: null }
  }
  return { regex, resolve }
}

function anchor(rel, line, textHtml) {
  return `<a class="dl" href="#" data-doc="${escapeHtml(rel)}"${line ? ` data-line="${line}"` : ''}>${textHtml}</a>`
}

/**
 * Plain text → HTML with a link at every discipline name in it, or null when
 * there is none (the caller then renders the text its usual way).
 * @param {string} text unescaped text of one inline text token
 * @param {ReturnType<typeof buildDisciplineIndex>} index
 * @param {(segment: string) => string} plain renders a stretch of ordinary text
 */
export function linkDisciplineText(text, index, plain) {
  if (!index || !text) return null
  index.regex.lastIndex = 0
  let out = ''
  let last = 0
  let found = false
  for (let m = index.regex.exec(text); m !== null; m = index.regex.exec(text)) {
    if (m[0] === '') { index.regex.lastIndex += 1; continue }
    const hit = index.resolve(m)
    if (!hit.rel) continue
    found = true
    if (m.index > last) out += plain(text.slice(last, m.index))
    out += anchor(hit.rel, hit.line, escapeHtml(hit.text))
    last = m.index + m[0].length
  }
  if (!found) return null
  if (last < text.length) out += plain(text.slice(last))
  return out
}

/**
 * An inline code span whose whole content is one discipline name → the code
 * span with the link inside it (`<code><a …>inject-edit</a></code>`), else null.
 * @param {string} text the code span's content
 */
export function linkDisciplineCode(text, index) {
  if (!index || !text) return null
  index.regex.lastIndex = 0
  const m = index.regex.exec(text)
  if (!m || m.index !== 0 || m[0].length !== text.length) return null
  const hit = index.resolve(m)
  if (!hit.rel) return null
  return `<code>${anchor(hit.rel, hit.line, escapeHtml(text))}</code>`
}
