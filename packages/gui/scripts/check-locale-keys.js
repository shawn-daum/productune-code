#!/usr/bin/env node
// check-locale-keys.js
// 1. Verifies that en.json and ko.json have exactly the same key set.
// 2. (T-PATCH-189) Verifies every static t('…') / i18next.t('…') key used in src
//    actually exists in the catalog — parity alone misses keys that are USED but
//    defined in neither file (e.g. a typo'd key renders as the raw key string).
// Exits 1 on any mismatch or missing-used key.

import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES = resolve(__dirname, '../src/locales')
const SRC = resolve(__dirname, '../src')

function flatKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatKeys(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

const en = JSON.parse(readFileSync(`${LOCALES}/en.json`, 'utf-8'))
const ko = JSON.parse(readFileSync(`${LOCALES}/ko.json`, 'utf-8'))

const enKeys = new Set(flatKeys(en))
const koKeys = new Set(flatKeys(ko))

const missingInKo = [...enKeys].filter(k => !koKeys.has(k))
const missingInEn = [...koKeys].filter(k => !enKeys.has(k))

let fail = false

if (missingInKo.length > 0) {
  console.error('FAIL: Keys in en.json but missing from ko.json:')
  missingInKo.forEach(k => console.error(`  - ${k}`))
  fail = true
}

if (missingInEn.length > 0) {
  console.error('FAIL: Keys in ko.json but missing from en.json:')
  missingInEn.forEach(k => console.error(`  - ${k}`))
  fail = true
}

if (fail) {
  console.error('\nERROR: Locale catalogs have mismatched key sets. Both en.json and ko.json must have identical keys.')
  process.exit(1)
}

// ── (2) used-but-missing static keys ─────────────────────────────────────────
// Walk src for t('…')/i18next.t('…') string-literal keys (backtick/${} = dynamic,
// skipped). A used key is OK if it's a leaf in the catalog OR a namespace prefix
// of one (dynamic base, e.g. t('a.b.' + x) → catches the literal 'a.b.').
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const USE_RE = /(?:\bt|i18next\.t)\(\s*(['"])([^'"]*)\1/g
const used = new Set()
for (const file of walk(SRC)) {
  const txt = readFileSync(file, 'utf-8')
  let m
  while ((m = USE_RE.exec(txt))) used.add(m[2])
}

function keyResolvable(k) {
  if (enKeys.has(k)) return true
  const prefix = k.endsWith('.') ? k : `${k}.`
  for (const ek of enKeys) if (ek.startsWith(prefix)) return true // dynamic namespace base
  return false
}

const missingUsed = [...used].filter((k) => k && !keyResolvable(k)).sort()
if (missingUsed.length > 0) {
  console.error('FAIL: t() keys used in src but missing from the catalog:')
  missingUsed.forEach((k) => console.error(`  - ${k}`))
  console.error('\nERROR: add these keys to en.json AND ko.json (or fix the typo).')
  process.exit(1)
}

console.log(`OK: en.json and ko.json have identical key sets (${enKeys.size} keys); all ${used.size} used t() keys resolve.`)
