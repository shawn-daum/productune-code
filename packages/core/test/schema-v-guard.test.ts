/**
 * schema-v-guard.test.ts — Guard: FALLBACK_LATEST_SCHEMA_V must equal the
 * actual max migration id found in packages/core/migrations/.
 *
 * Prevents the hard-coded fallback from silently lagging behind when a new
 * migration file is added. Build/test will fail until the constant is bumped.
 *
 * Run (after build): node test/schema-v-guard.mjs
 *      The companion .mjs shim imports from dist/ after build.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { test } from 'vitest'
import { FALLBACK_LATEST_SCHEMA_V } from '../src/init'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ── Derive max id from migrations directory ───────────────────────────────────

const migrationsDir = path.resolve(__dirname, '../migrations')

function deriveMaxId(): number {
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

// ── Guard checks (vitest) ─────────────────────────────────────────────────────

test('FALLBACK_LATEST_SCHEMA_V matches actual max migration id', () => {
  const actualMax = deriveMaxId()
  if (FALLBACK_LATEST_SCHEMA_V !== actualMax) {
    throw new Error(
      `FALLBACK_LATEST_SCHEMA_V=${FALLBACK_LATEST_SCHEMA_V} but migrations dir max id=${actualMax}. ` +
      `Bump FALLBACK_LATEST_SCHEMA_V in packages/core/src/init.ts to ${actualMax}.`,
    )
  }
})

test('latestSchemaV() derive returns same value as actual max migration id', async () => {
  // Dynamic import to exercise the live derive path
  const { latestSchemaV } = await import('../src/init')
  const derived = latestSchemaV()
  const actualMax = deriveMaxId()
  if (derived !== actualMax) {
    throw new Error(
      `latestSchemaV() returned ${derived} but migrations dir max id=${actualMax}`,
    )
  }
})
