#!/usr/bin/env node
// check-locale-keys.js
// Verifies that en.json and ko.json have exactly the same key set.
// Exits 1 if there are missing or extra keys in either catalog.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES = resolve(__dirname, '../src/locales')

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
} else {
  console.log(`OK: en.json and ko.json have identical key sets (${enKeys.size} keys).`)
}
