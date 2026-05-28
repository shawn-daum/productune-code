#!/usr/bin/env node
/**
 * backfill-ticket-frontmatter.mjs — add v2 frontmatter fields to existing ticket md.
 *
 * v2 doctrine sub-f introduced three new frontmatter fields on ticket md:
 *   - `slug` (kebab-case, required)
 *   - `qa_status` (pending | pass | fail; defaults pending)
 *   - `qa_loops` (int; defaults 0)
 *
 * This script scans `docs/tickets/<version>/T-NNN.md` files; for any missing
 * field, it inserts a sensible default at the end of the frontmatter block.
 * Slug is derived from the H1 title (first `# ` line after frontmatter close)
 * via a kebab-case transform of the portion after `T-NNN: ` (or the whole
 * title if no `T-NNN:` prefix).
 *
 * Idempotent: re-running on already-back-filled files is a no-op (the regex
 * checks for the literal `^slug:` / `^qa_status:` / `^qa_loops:` lines first).
 *
 * Usage:
 *   node scripts/po/backfill-ticket-frontmatter.mjs <projectDir>
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit } from 'node:process'

if (argv.length < 3) {
  console.error('usage: node backfill-ticket-frontmatter.mjs <projectDir>')
  exit(64)
}

const root = join(argv[2], 'docs', 'tickets')
const files = []
walk(root, files)

let changed = 0
let skipped = 0
const skippedNoFm = []
for (const f of files) {
  const result = backfill(f)
  if (result === 'changed') changed++
  else if (result === 'skipped') skipped++
  else skippedNoFm.push(f)
}

console.log(`backfilled: ${changed}`)
console.log(`already complete: ${skipped}`)
if (skippedNoFm.length > 0) {
  console.log(`no frontmatter (skipped): ${skippedNoFm.length}`)
  for (const f of skippedNoFm) console.log(`  - ${f}`)
}

// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, out) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full)
  }
}

function backfill(file) {
  const raw = readFileSync(file, 'utf-8')
  if (!raw.startsWith('---')) return 'no-fm'

  const closeIdx = raw.indexOf('\n---', 3)
  if (closeIdx < 0) return 'no-fm'

  const fmText = raw.slice(0, closeIdx + 4)   // up through second `---`
  const body = raw.slice(closeIdx + 4)

  const hasSlug = /^slug:/m.test(fmText)
  const hasQaStatus = /^qa_status:/m.test(fmText)
  const hasQaLoops = /^qa_loops:/m.test(fmText)

  if (hasSlug && hasQaStatus && hasQaLoops) return 'skipped'

  const additions = []
  if (!hasSlug) {
    const slug = deriveSlug(file, body)
    additions.push(`slug: ${slug}`)
  }
  if (!hasQaStatus) additions.push('qa_status: pending')
  if (!hasQaLoops) additions.push('qa_loops: 0')

  // Insert before closing `---`. fmText currently ends with `\n---\n` or `\n---`;
  // we splice additions just before that closing fence.
  const closing = '\n---'
  const innerEnd = fmText.lastIndexOf(closing)
  const inner = fmText.slice(0, innerEnd)   // everything up to last \n---
  const newFm = inner + '\n' + additions.join('\n') + closing + '\n'

  // Body starts after the original `\n---` + maybe a `\n` we want to dedupe.
  const bodyClean = body.startsWith('\n') ? body.slice(1) : body
  const out = newFm + bodyClean

  writeFileSync(file, out, 'utf-8')
  return 'changed'
}

function deriveSlug(file, body) {
  // Try H1 first.
  const m = body.match(/\n# (.+)/) || body.match(/^# (.+)/)
  let title = ''
  if (m) {
    title = m[1].trim()
    // Strip leading `T-NNN: ` prefix.
    const stripped = title.replace(/^T-[\w-]+:\s*/, '').trim()
    if (stripped) title = stripped
  } else {
    // Fall back to filename.
    title = file.split('/').pop().replace(/\.md$/, '')
  }
  return kebab(title).slice(0, 60)
}

function kebab(s) {
  return s
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')   // strip non-ascii (Korean etc) — slug is en-only
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-') || 'untitled'
}
