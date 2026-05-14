#!/usr/bin/env node
// migrate-ticket-version.mjs — sub-a: stamp version: frontmatter on ticket md files
// Usage:
//   node migrate-ticket-version.mjs [--apply] [--project-dir <dir>]
// Default: dry-run (print mapping table only)
// --apply: write version: field into each ticket md

import fs from 'fs'
import path from 'path'

const LEGACY_VERSION = 'legacy/phase3-fixes'

function parseArgs() {
  const args = process.argv.slice(2)
  let apply = false
  let projectDir = process.cwd()
  let poStatePath = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true
    if (args[i] === '--project-dir' && args[i + 1]) {
      projectDir = args[++i]
    }
    // Allow overriding po-state.json location (e.g. when running inside a git worktree)
    if (args[i] === '--po-state-path' && args[i + 1]) {
      poStatePath = args[++i]
    }
  }
  return { apply, projectDir, poStatePath }
}

function parseFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if (val === '' || val === 'null') val = null
    out[key] = val
  }
  return out
}

function insertVersionIntoFrontmatter(content, versionId) {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return content
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (closeIdx < 0) return content

  // Find index of ticket_id line to insert version: right after
  const tidIdx = lines.findIndex((l) => /^ticket_id:/.test(l))
  const insertAt = tidIdx >= 0 ? tidIdx + 1 : 1

  const newLine = `version: ${versionId}`
  const updated = [...lines.slice(0, insertAt), newLine, ...lines.slice(insertAt)]
  return updated.join('\n')
}

function closestVersion(ts, versions) {
  let best = null
  let bestDist = Infinity
  for (const v of versions) {
    if (!v.started_at) continue
    const vts = Date.parse(v.started_at)
    if (isNaN(vts)) continue
    const dist = Math.abs(ts - vts)
    if (dist < bestDist) {
      bestDist = dist
      best = v
    }
  }
  return best
}

function main() {
  const { apply, projectDir, poStatePath: poStatePathOverride } = parseArgs()

  const resolvedPoStatePath = poStatePathOverride
    ?? path.join(projectDir, '.productune', 'po-state.json')
  if (!fs.existsSync(resolvedPoStatePath)) {
    console.error(`ERROR: po-state.json not found at ${resolvedPoStatePath}`)
    console.error('  Tip: if running inside a git worktree, pass --po-state-path <main-repo>/.productune/po-state.json')
    process.exit(1)
  }
  const poState = JSON.parse(fs.readFileSync(resolvedPoStatePath, 'utf-8'))
  const versions = poState.versions ?? []
  const currentVersion = poState.current_version ?? null

  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  if (!fs.existsSync(ticketsRoot)) {
    console.error(`ERROR: docs/tickets not found at ${ticketsRoot}`)
    process.exit(1)
  }

  const versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  let stamped = 0
  let warned = 0
  let legacy = 0
  let skipped = 0

  const rows = []

  for (const versionDir of versionDirs) {
    const isLegacy = versionDir === 'phase3-fixes'
    const dirPath = path.join(ticketsRoot, versionDir)
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md') && f.startsWith('T-'))

    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const fm = parseFrontmatter(content)
      const ticketId = fm.ticket_id ?? path.basename(file, '.md')

      // Idempotent: already stamped
      if (fm.version && String(fm.version).trim() !== '') {
        rows.push({ ticketId, current: fm.version, proposed: fm.version, status: 'skip', distS: null })
        skipped++
        continue
      }

      let proposed
      let distS = null
      let status

      if (isLegacy) {
        proposed = LEGACY_VERSION
        status = 'legacy'
        legacy++
      } else {
        const tsRaw = fm.created_at ?? fm.started_at
        if (!tsRaw) {
          proposed = currentVersion ?? 'v0.4-meta-dogfood'
          status = 'warn-no-ts'
          warned++
          console.warn(`WARN: ${ticketId} — no created_at, fallback to ${proposed}`)
        } else {
          const ts = Date.parse(String(tsRaw))
          if (isNaN(ts)) {
            proposed = currentVersion ?? 'v0.4-meta-dogfood'
            status = 'warn-bad-ts'
            warned++
            console.warn(`WARN: ${ticketId} — unparseable created_at "${tsRaw}", fallback to ${proposed}`)
          } else {
            const match = closestVersion(ts, versions)
            if (!match) {
              proposed = currentVersion ?? 'v0.4-meta-dogfood'
              status = 'warn-no-versions'
              warned++
            } else {
              proposed = match.id
              distS = Math.round(Math.abs(ts - Date.parse(match.started_at)) / 1000)
              status = 'stamp'
              stamped++
            }
          }
        }
      }

      rows.push({ ticketId, filePath, current: '(none)', proposed, status, distS, content })
    }
  }

  // Print mapping table
  const colW = [12, 10, 30, 10, 12]
  const header = ['ticket_id', 'current', 'proposed', 'distance', 'action']
  console.log(header.map((h, i) => h.padEnd(colW[i])).join('  '))
  console.log('-'.repeat(colW.reduce((a, b) => a + b + 2, 0)))
  for (const r of rows) {
    const dist = r.distS != null ? `${r.distS}s` : '—'
    const action = r.status === 'skip' ? 'skip' : r.status
    console.log([
      r.ticketId.padEnd(colW[0]),
      (r.current ?? '').padEnd(colW[1]),
      (r.proposed ?? '').padEnd(colW[2]),
      dist.padEnd(colW[3]),
      action.padEnd(colW[4]),
    ].join('  '))
  }

  console.log('')
  console.log(`summary: stamped ${stamped} · warned ${warned} · legacy ${legacy} · skipped ${skipped}`)

  if (!apply) {
    console.log('\n(dry-run — pass --apply to write)')
    return
  }

  // Apply: write back
  let written = 0
  for (const r of rows) {
    if (r.status === 'skip') continue
    if (!r.filePath || !r.content) continue
    const updated = insertVersionIntoFrontmatter(r.content, r.proposed)
    fs.writeFileSync(r.filePath, updated, 'utf-8')
    written++
  }
  console.log(`\napplied: ${written} files written`)
}

main()
