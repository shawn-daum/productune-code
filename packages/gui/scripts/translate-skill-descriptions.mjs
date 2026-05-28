#!/usr/bin/env node
/**
 * translate-skill-descriptions.mjs
 *
 * One-shot batch translation of skill descriptions → ko.json (skills.descriptions.*).
 * Strategy: Google Translate (primary) + claude --print (per-record fallback).
 *
 * Usage:
 *   node packages/gui/scripts/translate-skill-descriptions.mjs
 *
 * Output: updates packages/gui/src/locales/ko.json and en.json in-place.
 *
 * T-P4-123 — impl §4.3 (a.2 batch, run-once by developer, commit result).
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const LOCALES_DIR = resolve(__dirname, '..', 'src', 'locales')
const SKILLS_ROOT = join(homedir(), '.claude', 'skills')

// ── i18n key helper (must match SkillMatrixTab.tsx skillIdToI18nKey) ──────────
function skillIdToI18nKey(id) {
  return id.replace(/[/.\-]/g, '_')
}

// ── Collect .md files (mirrors T-P4-122 collectMdFiles logic) ─────────────────
function collectMdFiles(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      collectMdFiles(fullPath, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath)
    }
  }
  return out
}

// ── Parse YAML frontmatter (minimal — handles quoted + block scalar `>`) ───────
function parseFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0].trim() !== '---') return {}
  const fm = {}
  let i = 1
  while (i < lines.length && lines[i].trim() !== '---') {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      let val = line.slice(colonIdx + 1).trim()

      // Block scalar `>` — collect continuation lines
      if (val === '>') {
        const parts = []
        i++
        while (i < lines.length && lines[i].trim() !== '---' && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
          parts.push(lines[i].trim())
          i++
        }
        val = parts.filter(Boolean).join(' ')
      } else {
        // Strip surrounding quotes
        val = val.replace(/^["']|["']$/g, '')
      }
      fm[key] = val
    }
    i++
  }
  return fm
}

// ── Collect all skill entries ─────────────────────────────────────────────────
function collectSkills() {
  const files = collectMdFiles(SKILLS_ROOT)
  const skills = []
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    const fm = parseFrontmatter(content)
    const name = fm.name?.trim()
    const description = fm.description?.trim()
    if (!name || !description) continue  // T-P4-122 filter: skip supplementary docs
    const id = filePath.slice(SKILLS_ROOT.length + 1).replace(/\\/g, '/')
    skills.push({ id, name, description })
  }
  return skills
}

// ── Google Translate (primary) ────────────────────────────────────────────────
async function translateWithGoogle(texts, targetLang = 'ko') {
  // Uses @vitalets/google-translate-api-x (unofficial free API scrape).
  // Install: npm install @vitalets/google-translate-api-x --no-save
  try {
    const { translate } = await import('@vitalets/google-translate-api-x')
    const results = []
    for (const text of texts) {
      try {
        const res = await translate(text, { to: targetLang })
        results.push({ ok: true, text: res.text })
      } catch (e) {
        results.push({ ok: false, error: String(e) })
      }
    }
    return results
  } catch {
    // Package not installed — return all as failed
    return texts.map(() => ({ ok: false, error: '@vitalets/google-translate-api-x not installed' }))
  }
}

// ── claude --print fallback (per-record) ──────────────────────────────────────
function translateWithClaude(text, targetLang = 'ko') {
  const prompt = `Translate the following English skill description to Korean.
Keep technical terms (like TDD, PRD, OKR, JTBD, A/B test, etc.) in English.
Return ONLY the translated text — no explanation, no markdown, no quotes.

Text to translate:
${text}`

  try {
    const result = execSync(`echo ${JSON.stringify(prompt)} | claude --print`, {
      encoding: 'utf8',
      timeout: 30000,
    }).trim()
    return { ok: true, text: result }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Deep merge helper ─────────────────────────────────────────────────────────
function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Collecting skills from', SKILLS_ROOT)
  const skills = collectSkills()
  console.log(`📋 Found ${skills.length} skills with valid name + description`)

  // Load existing locale files
  const koPath = join(LOCALES_DIR, 'ko.json')
  const enPath = join(LOCALES_DIR, 'en.json')
  const koJson = JSON.parse(readFileSync(koPath, 'utf8'))
  const enJson = JSON.parse(readFileSync(enPath, 'utf8'))

  // Build en descriptions (verbatim)
  const enDescriptions = {}
  for (const skill of skills) {
    enDescriptions[skillIdToI18nKey(skill.id)] = skill.description
  }

  // Determine which ko translations are missing
  const existingKo = koJson.skills?.descriptions ?? {}
  const missing = skills.filter(s => !existingKo[skillIdToI18nKey(s.id)])
  console.log(`🌐 Translating ${missing.length} missing ko descriptions…`)

  // Try Google Translate in batches of 10
  const BATCH_SIZE = 10
  const translated = { ...existingKo }
  const failed = []

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE)
    console.log(`  ↳ Google batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)} (${batch.length} items)`)
    const results = await translateWithGoogle(batch.map(s => s.description))

    for (let j = 0; j < batch.length; j++) {
      const skill = batch[j]
      const result = results[j]
      if (result.ok && result.text) {
        translated[skillIdToI18nKey(skill.id)] = result.text
        process.stdout.write('.')
      } else {
        failed.push(skill)
        process.stdout.write('x')
      }
    }
    process.stdout.write('\n')
  }

  // claude --print fallback for failed records
  if (failed.length > 0) {
    console.log(`\n🤖 Claude fallback for ${failed.length} failed records…`)
    for (const skill of failed) {
      console.log(`  ↳ ${skill.id}`)
      const result = translateWithClaude(skill.description)
      if (result.ok && result.text) {
        translated[skillIdToI18nKey(skill.id)] = result.text
        console.log('    ✓')
      } else {
        // Last resort: use English original
        translated[skillIdToI18nKey(skill.id)] = skill.description
        console.log(`    ✗ fallback to English: ${result.error}`)
      }
    }
  }

  // Merge into locale files
  const updatedKo = deepMerge(koJson, { skills: { descriptions: translated } })
  const updatedEn = deepMerge(enJson, { skills: { descriptions: enDescriptions } })

  writeFileSync(koPath, JSON.stringify(updatedKo, null, 2) + '\n', 'utf8')
  writeFileSync(enPath, JSON.stringify(updatedEn, null, 2) + '\n', 'utf8')

  console.log('\n✅ Done!')
  console.log(`   ko.json: ${Object.keys(translated).length} skills.descriptions keys`)
  console.log(`   en.json: ${Object.keys(enDescriptions).length} skills.descriptions keys`)
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
