// lib/jump-pages.mjs — T-995: the per-ticket forwarding pages `at/T-NNN.html`.
// A ticket link the PO pastes (`file://…/at/T-NNN.html`) must open for EVERY
// ticket the viewer carries, so the generator writes the whole set itself on
// each run — never only the ones `prdt tickets --link` happened to touch — and
// prunes the pages of tickets that are gone. Bytes are identical to what the
// `prdt` CLI's `viewer_jump` writes for a ticket key (same body), so the two
// writers never fight over a page.
import fs from 'node:fs'
import path from 'node:path'

const TICKET_PAGE_RE = /^T-\d+\.html$/

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

/** Every ticket id the generated viewer carries (current + other buckets + release lines). */
export function ticketIdsOf(data) {
  const ids = new Set()
  const add = (tickets) => {
    for (const t of tickets.included) if (t.frontmatter && t.frontmatter.id) ids.add(String(t.frontmatter.id))
    for (const b of tickets.omitted) for (const t of b.tickets) if (t.frontmatter && t.frontmatter.id) ids.add(String(t.frontmatter.id))
  }
  add(data.tickets)
  for (const l of data.lines || []) add(l.tickets)
  return [...ids].filter((id) => /^T-\d+$/.test(id)).sort()
}

// T-1076: `page` = the viewer's own file name (the `--out` basename), so a
// page generated under another name is still the one an `at/` page opens.
export function jumpPageContent(key, page = 'viewer.html') {
  const frag = escapeHtml(encodeURIComponent(key))
  const href = escapeHtml(encodeURIComponent(page))
  return '<!doctype html><meta charset="utf-8">' +
    `<meta http-equiv="refresh" content="0;url=../${href}#${frag}">` +
    `<a href="../${href}#${frag}">${escapeHtml(page)}#${escapeHtml(key)}</a>\n`
}

/** T-908: the `at/` pages a run carries, as `{name, content}` (the emit bundle). */
export function ticketJumpPages(ids, page = 'viewer.html') {
  return ids.map((id) => ({ name: `${id}.html`, content: jumpPageContent(id, page) }))
}

/**
 * Write `at/<id>.html` for each id and remove `at/T-NNN.html` pages of ids not
 * in the set. A symlinked `at/` is never followed (T-842): nothing is written
 * or removed. Only ticket pages are pruned — other jump pages (wiki, docs) stay.
 * @returns {{ written: number, pruned: number }}
 */
export function writeTicketJumpPages(viewerDir, ids, writeAtomic, page = 'viewer.html') {
  const atDir = path.join(viewerDir, 'at')
  let st = null
  try { st = fs.lstatSync(atDir) } catch { /* absent → created below */ }
  if (st && !st.isDirectory()) return { written: 0, pruned: 0 } // symlink or file: refuse
  if (!st) fs.mkdirSync(atDir, { recursive: true })
  let written = 0
  for (const id of ids) {
    const target = path.join(atDir, `${id}.html`)
    const content = jumpPageContent(id, page)
    let cur = null
    try { if (fs.lstatSync(target).isFile()) cur = fs.readFileSync(target, 'utf8') } catch { /* absent */ }
    if (cur === content) continue
    writeAtomic(target, content)
    written++
  }
  const keep = new Set(ids.map((id) => `${id}.html`))
  let pruned = 0
  for (const e of fs.readdirSync(atDir, { withFileTypes: true })) {
    if (TICKET_PAGE_RE.test(e.name) && !keep.has(e.name) && (e.isFile() || e.isSymbolicLink())) {
      fs.unlinkSync(path.join(atDir, e.name))
      pruned++
    }
  }
  return { written, pruned }
}
