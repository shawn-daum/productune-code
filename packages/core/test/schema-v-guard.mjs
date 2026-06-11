/**
 * schema-v-guard.mjs — Guard runner (plain ESM, no ts-node dependency).
 * Imports from the compiled dist/ so tsc must run first.
 *
 * AC-2 guard: FALLBACK_LATEST_SCHEMA_V in dist/init.js must equal the actual
 * max numeric prefix found in packages/core/migrations/*.md.
 * Fail with exit 1 when they diverge — catches "new migration added, constant
 * not bumped" before it reaches CI.
 *
 * Run: node test/schema-v-guard.mjs   (from packages/core/)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ── Import from compiled dist ─────────────────────────────────────────────────

const { FALLBACK_LATEST_SCHEMA_V, latestSchemaV } = await import('../dist/init.js')

// ── Derive max id from migrations directory ───────────────────────────────────

const migrationsDir = path.resolve(__dirname, '../migrations')

function deriveMaxId() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`migrations dir not found: ${migrationsDir}`)
  }
  let max = 0
  let found = false
  for (const name of fs.readdirSync(migrationsDir)) {
    if (!name.endsWith('.md')) continue
    const m = /^(\d{4})/.exec(name)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
      found = true
    }
  }
  if (!found) throw new Error('No migration *.md files found — check migrations dir path')
  return max
}

// ── Guard checks ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e) {
    console.error(`  FAIL  ${name}: ${e.message}`)
    failed++
  }
}

console.log('\nschema-v-guard — FALLBACK_LATEST_SCHEMA_V guard\n')

test('FALLBACK_LATEST_SCHEMA_V matches actual max migration id', () => {
  const actualMax = deriveMaxId()
  if (FALLBACK_LATEST_SCHEMA_V !== actualMax) {
    throw new Error(
      `FALLBACK_LATEST_SCHEMA_V=${FALLBACK_LATEST_SCHEMA_V} but migrations dir max id=${actualMax}. ` +
      `Bump FALLBACK_LATEST_SCHEMA_V in packages/core/src/init.ts to ${actualMax}.`,
    )
  }
})

test('latestSchemaV() derives same value as migrations dir', () => {
  const actualMax = deriveMaxId()
  const derived = latestSchemaV()
  if (derived !== actualMax) {
    throw new Error(
      `latestSchemaV() returned ${derived} but migrations dir max id=${actualMax}`,
    )
  }
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
