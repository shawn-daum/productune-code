#!/usr/bin/env node
// check-ticket-version.mjs — T-P4-095
// Lint ticket md frontmatter `version:` fields against ^v\d+(\.\d+)?$
//
// Usage:
//   node packages/gui/scripts/check-ticket-version.mjs [--project-dir <path>]
//
// Default project-dir = repo root (docs/tickets/**/*.md in this repo).
// Returns exit 0 on clean, exit 1 on violations, exit 2 on bad args.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Repo root = 3 levels up from packages/gui/scripts/
const REPO_ROOT = path.resolve(__dirname, '../../..')

const VERSION_ID_RE = /^v\d+(\.\d+)?$/
const LEGACY_RE = /^legacy\/.+/

function parseArgs() {
  const args = process.argv.slice(2)
  let projectDir = REPO_ROOT
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir' && args[i + 1]) {
      projectDir = path.resolve(args[++i])
    }
  }
  return { projectDir }
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

function main() {
  const { projectDir } = parseArgs()
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')

  if (!fs.existsSync(ticketsRoot)) {
    console.log(`check-ticket-version: no docs/tickets/ at ${ticketsRoot} — skip`)
    process.exit(0)
  }

  let violations = 0
  let checked = 0
  let skipped = 0

  for (const filePath of walkTicketMds(ticketsRoot)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fm = parseFrontmatter(content)
    const rel = path.relative(projectDir, filePath)

    // No version field — skip (migrate-ticket-version.mjs handles stamping)
    if (fm.version == null) {
      skipped++
      continue
    }

    checked++
    const v = String(fm.version)

    // Legacy artificial ids are explicitly allowed
    if (LEGACY_RE.test(v)) continue

    // Valid ids pass
    if (VERSION_ID_RE.test(v)) continue

    // Violation
    console.error(`FAIL: invalid version id "${v}" in ${rel}`)
    console.error(`  Expected: ^v\\d+(\\.[0-9]+)?$ (e.g. v1, v0.1)`)
    violations++
  }

  if (skipped > 0) {
    console.log(`check-ticket-version: ${skipped} file(s) without version: field (skipped — use migrate-ticket-version.mjs to stamp)`)
  }

  if (violations > 0) {
    console.error(`\ncheck-ticket-version: ${violations} violation(s) found in ${checked} checked file(s).`)
    console.error('Run: node packages/gui/scripts/migrate-version-id.mjs --project-dir <path> [--apply]')
    process.exit(1)
  }

  console.log(`check-ticket-version: OK — ${checked} file(s) checked, 0 violations`)
  process.exit(0)
}

main()
