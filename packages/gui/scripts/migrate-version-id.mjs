#!/usr/bin/env node
// migrate-version-id.mjs — T-P4-095
// Strip slug prefix from version ids in po-state.json + ticket md frontmatter.
//
// Usage:
//   node packages/gui/scripts/migrate-version-id.mjs --project-dir <path> [--apply]
//
// Default: dry-run (prints mapping table, touches nothing).
// --apply: writes changes; backs up po-state.json to .bak.<timestamp> first.
//
// Mapping rules:
//   <slug>-v<MAJOR>           → v<MAJOR>        (slug-prefix strip)
//   <slug>-v<MAJOR>.<MINOR>   → v<MAJOR>.<MINOR> (slug-prefix strip)
//   v<MAJOR>(.<MINOR>)?       → no change (already valid, idempotent)
//   legacy/...                → no change (preserved)
//   other                     → manual-needed   (stderr warn, never auto-applied)

import fs from 'fs'
import path from 'path'

// ── Regex ──────────────────────────────────────────────────────────────────────

const VERSION_ID_RE = /^v\d+(\.\d+)?$/
const LEGACY_RE = /^legacy\/.+/
// Matches "<slug>-v<N>" or "<slug>-v<N>.<M>" at the end
const SLUG_PREFIX_RE = /^[a-z0-9][a-z0-9-]*-(v\d+(?:\.\d+)?)$/

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let apply = false
  let projectDir = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true
    if (args[i] === '--project-dir' && args[i + 1]) {
      projectDir = path.resolve(args[++i])
    }
  }
  if (!projectDir) {
    console.error('ERROR: --project-dir <path> is required')
    process.exit(2)
  }
  return { apply, projectDir }
}

function classify(id) {
  if (VERSION_ID_RE.test(id)) return { action: 'skip', proposed: id }
  if (LEGACY_RE.test(id)) return { action: 'legacy', proposed: id }
  const m = SLUG_PREFIX_RE.exec(id)
  if (m) {
    const proposed = m[1]
    if (VERSION_ID_RE.test(proposed)) return { action: 'strip', proposed }
  }
  return { action: 'manual', proposed: null }
}

function parseFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const val = m[2].trim()
    out[m[1]] = val === 'null' ? null : val || null
  }
  return out
}

/** Replace `version: <old>` line in frontmatter with `version: <new>`. */
function replaceVersionInFrontmatter(content, oldId, newId) {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return content
  let replaced = false
  const updated = lines.map((line) => {
    if (!replaced && /^version:\s+/.test(line) && line.trim() === `version: ${oldId}`) {
      replaced = true
      return `version: ${newId}`
    }
    return line
  })
  return updated.join('\n')
}

/** Walk docs/tickets/**\/*.md */
function* walkTicketMds(ticketsRoot) {
  if (!fs.existsSync(ticketsRoot)) return
  for (const entry of fs.readdirSync(ticketsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dirPath = path.join(ticketsRoot, entry.name)
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.md')) continue
      yield path.join(dirPath, file)
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const { apply, projectDir } = parseArgs()

  const statePath = path.join(projectDir, '.productune', 'po-state.json')
  if (!fs.existsSync(statePath)) {
    console.error(`ERROR: po-state.json not found at ${statePath}`)
    process.exit(1)
  }

  const poState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  const versions = poState.versions ?? []
  const currentVersion = poState.current_version ?? null

  // ── Collect version-id rows from po-state.json ─────────────────────────────
  const stateRows = []

  for (const ver of versions) {
    const { action, proposed } = classify(ver.id)
    stateRows.push({ source: 'po-state.json (versions[].id)', old: ver.id, proposed, action })
  }

  if (currentVersion) {
    const { action, proposed } = classify(currentVersion)
    if (action !== 'skip') {
      stateRows.push({ source: 'po-state.json (current_version)', old: currentVersion, proposed, action })
    }
  }

  // ── Collect ticket md rows ─────────────────────────────────────────────────
  const ticketRows = []
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')

  for (const filePath of walkTicketMds(ticketsRoot)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fm = parseFrontmatter(content)
    if (fm.version == null) continue
    const id = String(fm.version)
    const { action, proposed } = classify(id)
    if (action === 'skip') continue
    const rel = path.relative(projectDir, filePath)
    ticketRows.push({ filePath, rel, old: id, proposed, action, content })
  }

  const allRows = [...stateRows, ...ticketRows]

  // ── Print mapping table ────────────────────────────────────────────────────
  const COL = [48, 22, 22, 14]
  const header = ['source / file', 'old id', 'proposed', 'action']
  const sep = '-'.repeat(COL.reduce((a, b) => a + b + 2, 0))
  console.log(header.map((h, i) => h.padEnd(COL[i])).join('  '))
  console.log(sep)

  let stripCount = 0
  let manualCount = 0
  let legacyCount = 0

  for (const r of allRows) {
    const proposed = r.proposed ?? '(manual-needed)'
    console.log([
      (r.source ?? r.rel ?? '').padEnd(COL[0]),
      r.old.padEnd(COL[1]),
      proposed.padEnd(COL[2]),
      r.action.padEnd(COL[3]),
    ].join('  '))

    if (r.action === 'strip') stripCount++
    else if (r.action === 'manual') {
      manualCount++
      process.stderr.write(`WARN: manual-needed — "${r.old}" in ${r.source ?? r.rel} — no auto-mapping rule\n`)
    }
    else if (r.action === 'legacy') legacyCount++
  }

  console.log('')
  console.log(`summary: stripped ${stripCount} · legacy ${legacyCount} · manual-needed ${manualCount}`)

  if (!apply) {
    console.log('\n(dry-run — pass --apply to write)')
    return
  }

  if (stripCount === 0) {
    console.log('\nNothing to apply.')
    return
  }

  // ── Backup po-state.json ───────────────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${statePath}.bak.${ts}`
  fs.copyFileSync(statePath, backupPath)
  console.log(`\nBackup: ${backupPath}`)

  // ── Apply po-state.json changes ────────────────────────────────────────────
  let stateChanged = false

  // Build id-mapping for any 'strip' rows (versions[].id + current_version)
  const idMap = new Map()
  for (const r of stateRows) {
    if (r.action === 'strip') idMap.set(r.old, r.proposed)
  }

  if (idMap.size > 0) {
    // versions[].id
    for (const ver of poState.versions ?? []) {
      if (idMap.has(ver.id)) {
        ver.id = idMap.get(ver.id)
        stateChanged = true
      }
    }
    // current_version
    if (poState.current_version && idMap.has(poState.current_version)) {
      poState.current_version = idMap.get(poState.current_version)
      stateChanged = true
    }
  }

  if (stateChanged) {
    fs.writeFileSync(statePath, JSON.stringify(poState, null, 2))
    console.log(`po-state.json updated`)
  }

  // ── Apply ticket md changes ────────────────────────────────────────────────
  let ticketsWritten = 0
  for (const r of ticketRows) {
    if (r.action !== 'strip') continue
    const updated = replaceVersionInFrontmatter(r.content, r.old, r.proposed)
    fs.writeFileSync(r.filePath, updated, 'utf-8')
    ticketsWritten++
  }

  if (ticketsWritten > 0) {
    console.log(`${ticketsWritten} ticket md file(s) updated`)
  }

  console.log(`\nDone. ${stripCount} id(s) stripped.`)
  if (manualCount > 0) {
    console.error(`\nACTION REQUIRED: ${manualCount} id(s) need manual migration (see WARN lines above).`)
  }
}

main()
