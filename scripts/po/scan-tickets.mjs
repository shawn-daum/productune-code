#!/usr/bin/env node
/**
 * scan-tickets.mjs — fs-scan ticket md files under <projectDir>/docs/tickets/.
 *
 * v2 doctrine sub-f: ticket md = single source of truth. PO bash + GUI
 * (`useTicketScan`) call this script (or main-process equivalent) to derive
 * the ticket list. Replaces `po-state.json.past_tickets[]`.
 *
 * Output: JSON array of ticket records on stdout. Each record:
 *   { ticket_id, version, slug, title, type, status, assignee,
 *     qa_status, qa_loops, estimated_complexity, risk_flags,
 *     started_at, completed_at, duration_min, branch, worktree_path,
 *     request_summary, path }
 *
 * Parse strategy (zero deps):
 *   - frontmatter: read between leading `---` lines, regex per scalar.
 *   - title: first `# ` H1 after the frontmatter close.
 *   - request_summary: first non-empty paragraph under `## Request`.
 *
 * Backwards compat: if frontmatter has `stage:` but no `type:`, alias to
 * `type` for the output (v1 fallback).
 *
 * Usage:
 *   node scripts/po/scan-tickets.mjs <projectDir>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { argv, exit, stdout } from 'node:process'

if (argv.length < 3) {
  console.error('usage: node scan-tickets.mjs <projectDir>')
  exit(64)
}

const projectDir = argv[2]
const ticketsRoot = join(projectDir, 'docs', 'tickets')

const out = scan(ticketsRoot)
stdout.write(JSON.stringify(out, null, 2) + '\n')

// ─────────────────────────────────────────────────────────────────────────────

function scan(root) {
  const tickets = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return tickets
  }
  // Walk one level of subdirs (version folders) + capture md files under them.
  // Also tolerate ad-hoc md files at root.
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      let inner
      try { inner = readdirSync(full, { withFileTypes: true }) } catch { continue }
      for (const f of inner) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue
        const t = parse(join(full, f.name), projectDir)
        if (t) tickets.push(t)
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const t = parse(full, projectDir)
      if (t) tickets.push(t)
    }
  }
  // sort newest first (best-effort).
  tickets.sort((a, b) =>
    (b.started_at ?? b.created_at ?? '').localeCompare(a.started_at ?? a.created_at ?? ''),
  )
  return tickets
}

function parse(file, projectDir) {
  let raw
  try { raw = readFileSync(file, 'utf-8') } catch { return null }

  const fm = parseFrontmatter(raw)
  const ticketId = fm.ticket_id ?? deriveIdFromPath(file)
  if (!ticketId) return null

  const title = parseTitle(raw)
  const requestSummary = parseRequestSummary(raw)

  // Type alias from legacy `stage:` if `type:` missing.
  const type = fm.type ?? fm.stage ?? undefined

  return {
    ticket_id: ticketId,
    version: fm.version,
    slug: fm.slug,
    title,
    type,
    status: fm.status,
    assignee: fm.assignee,
    qa_status: fm.qa_status,
    qa_loops: fm.qa_loops != null ? Number(fm.qa_loops) : undefined,
    estimated_complexity: fm.estimated_complexity,
    risk_flags: fm.risk_flags,
    branch: fm.branch,
    worktree_path: fm.worktree_path,
    success_metric: fm.success_metric,
    validation_method: fm.validation_method,
    observed_result: fm.observed_result,
    started_at: fm.started_at,
    completed_at: fm.completed_at,
    duration_min: fm.duration_min != null ? Number(fm.duration_min) : undefined,
    created_at: fm.created_at,
    request_summary: requestSummary,
    path: relative(projectDir, file),
  }
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return {}
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = raw.slice(3, end)
  const out = {}
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    // strip enclosing quotes if present
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (v === 'null' || v === '~') v = null
    out[m[1]] = v
  }
  return out
}

function parseTitle(raw) {
  // first `# ` after frontmatter close (or at top if no frontmatter).
  const lines = raw.split('\n')
  let inFm = false
  let pastFm = !raw.startsWith('---')
  for (const line of lines) {
    if (line === '---') {
      if (!inFm && !pastFm) inFm = true
      else if (inFm) { inFm = false; pastFm = true; continue }
    }
    if (!pastFm) continue
    const m = line.match(/^# (.+)$/)
    if (m) return m[1].trim()
  }
  return undefined
}

function parseRequestSummary(raw) {
  // first non-empty paragraph under `## Request`.
  const idx = raw.indexOf('\n## Request')
  if (idx < 0) return undefined
  const after = raw.slice(idx)
  // skip the heading line
  const nlIdx = after.indexOf('\n', 1)
  if (nlIdx < 0) return undefined
  const body = after.slice(nlIdx + 1)
  // first paragraph = lines until blank line, skipping initial blank lines
  let started = false
  const paragraph = []
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) break
    if (line.trim() === '') {
      if (started) break
      continue
    }
    started = true
    paragraph.push(line.trim())
  }
  if (paragraph.length === 0) return undefined
  return paragraph.join(' ').slice(0, 280)
}

function deriveIdFromPath(file) {
  const base = file.split('/').pop()
  if (!base) return undefined
  const m = base.match(/^(T-[\w-]+)\.md$/)
  return m ? m[1] : undefined
}
