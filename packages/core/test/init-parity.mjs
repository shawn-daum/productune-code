/**
 * init-parity.mjs — T-PATCH-117 AC-4 parity test.
 *
 * Verifies that CLI `scripts/productune init` and GUI `dist/init.js initProject()`
 * produce identical project trees (file list + content) after normalizing
 * volatile fields (created_at, slug, settings.local.json absolute paths).
 *
 * Setup:
 *   - sandboxed HOME (tmp dir) — never touches real ~/.productune
 *   - two tmp project dirs: tmpA (CLI), tmpB (GUI)
 *   - both run with --skip-doctrine / skipDoctrine:true
 *   - .git/ excluded from diff (git init is CLI-only per AC-8)
 *
 * Run: node test/init-parity.mjs   (from packages/core/)
 * Exit 0 = pass, exit 1 = fail.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CORE_ROOT = path.resolve(__dirname, '..')
const SCRIPTS_PRODUCTUNE = path.join(CORE_ROOT, 'scripts', 'productune')
const INIT_PROJECT_MJS = path.join(CORE_ROOT, 'scripts', 'lib', 'init-project.mjs')

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/**
 * Recursively collect all files under `root`, relative paths, sorted.
 * Excludes `.git/` directory.
 * @param {string} root
 * @param {string} [base]
 * @returns {string[]}
 */
function collectFiles(root, base) {
  base = base ?? root
  /** @type {string[]} */
  const results = []
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return results
  }
  for (const e of entries) {
    if (e.name === '.git') continue // AC-8: exclude .git from parity scope
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      results.push(...collectFiles(full, base))
    } else {
      results.push(path.relative(base, full))
    }
  }
  return results.sort()
}

/**
 * Normalize volatile fields in file content so diffs are stable.
 *
 * Normalizations applied:
 *   1. config.json: created_at → NORMALIZED_TIMESTAMP, slug → NORMALIZED_SLUG
 *   2. settings.local.json: absolute projectDir paths → NORMALIZED_PROJECT_DIR
 *
 * @param {string} relPath  relative path within project (e.g. '.productune/config.json')
 * @param {string} content  raw UTF-8 file content
 * @returns {string}        normalized content
 */
function normalize(relPath, content) {
  if (relPath === path.join('.productune', 'config.json')) {
    try {
      const obj = JSON.parse(content)
      if (obj.created_at) obj.created_at = 'NORMALIZED_TIMESTAMP'
      if (obj.slug) obj.slug = 'NORMALIZED_SLUG'
      return JSON.stringify(obj, null, 2)
    } catch {
      return content
    }
  }
  if (relPath === path.join('.claude', 'settings.local.json')) {
    // Replace any absolute project dir paths (e.g. /tmp/parity-test-XXXXX/...)
    // with a stable placeholder. Match the leading path component segments
    // that look like absolute paths ending before /** or at end of string.
    // Pattern: sequences of /.../ up to the first /** occurrence.
    return content.replace(/\/(tmp|var|private\/var)[^\n"*]*/g, 'NORMALIZED_PROJECT_DIR')
  }
  return content
}

// ── Run CLI init (tmpA) ───────────────────────────────────────────────────────

function runCliInit(projectDir, sandboxHome) {
  // Run non-TTY, sandboxed HOME, --skip-doctrine.
  // tmpA is outside any git repo, so productune will do `git init` — that's
  // expected and excluded from the diff. We pass input='' to simulate non-TTY.
  const result = spawnSync(
    'bash',
    [SCRIPTS_PRODUCTUNE, 'init', '--skip-doctrine'],
    {
      cwd: projectDir,
      env: { ...process.env, HOME: sandboxHome, TERM: 'dumb' },
      input: '',        // non-TTY stdin
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    },
  )
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? ''
    const stdout = result.stdout?.toString() ?? ''
    throw new Error(
      `CLI init failed (exit ${result.status ?? 'null'}):\nstdout: ${stdout}\nstderr: ${stderr}`,
    )
  }
}

// ── Run GUI init (tmpB) ───────────────────────────────────────────────────────

async function runGuiInit(projectDir, sandboxHome) {
  // Import from dist/init.js (compiled from src/init.ts thin wrapper).
  // Override HOME via env so bootstrapUserGlobalDoctrine writes to sandbox.
  const origHome = process.env['HOME']
  process.env['HOME'] = sandboxHome
  try {
    const { initProject } = await import('../dist/init.js')
    initProject({
      slug: 'normalized-slug',
      projectDir,
      skipDoctrine: true,
    })
  } finally {
    if (origHome !== undefined) process.env['HOME'] = origHome
    else delete process.env['HOME']
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\ninit-parity — CLI vs GUI project init diff\n')

  const sandboxHome = tmpDir('parity-home-')
  const tmpA = tmpDir('parity-cli-')
  const tmpB = tmpDir('parity-gui-')

  try {
    // Run both inits
    process.stdout.write('  running CLI init (tmpA)... ')
    try {
      runCliInit(tmpA, sandboxHome)
      process.stdout.write('ok\n')
    } catch (e) {
      process.stdout.write('FAIL\n')
      throw e
    }

    process.stdout.write('  running GUI init (tmpB)... ')
    try {
      await runGuiInit(tmpB, sandboxHome)
      process.stdout.write('ok\n')
    } catch (e) {
      process.stdout.write('FAIL\n')
      throw e
    }

    // Collect file trees
    const filesA = collectFiles(tmpA)
    const filesB = collectFiles(tmpB)

    // ── File tree diff ────────────────────────────────────────────────────────
    const onlyA = filesA.filter(f => !filesB.includes(f))
    const onlyB = filesB.filter(f => !filesA.includes(f))
    const treeDiffLines = [
      ...onlyA.map(f => `  only-in-CLI:  ${f}`),
      ...onlyB.map(f => `  only-in-GUI:  ${f}`),
    ]

    // ── Content diff ─────────────────────────────────────────────────────────
    const common = filesA.filter(f => filesB.includes(f))
    /** @type {string[]} */
    const contentDiffLines = []
    for (const rel of common) {
      const contA = normalize(rel, fs.readFileSync(path.join(tmpA, rel), 'utf-8'))
      const contB = normalize(rel, fs.readFileSync(path.join(tmpB, rel), 'utf-8'))
      if (contA !== contB) {
        contentDiffLines.push(`  content-mismatch: ${rel}`)
        // Show first diff line for diagnosis
        const linesA = contA.split('\n')
        const linesB = contB.split('\n')
        for (let i = 0; i < Math.max(linesA.length, linesB.length); i++) {
          if (linesA[i] !== linesB[i]) {
            contentDiffLines.push(`    line ${i + 1}: CLI=${JSON.stringify(linesA[i])} GUI=${JSON.stringify(linesB[i])}`)
            break
          }
        }
      }
    }

    // ── Report ────────────────────────────────────────────────────────────────
    const allDiffs = [...treeDiffLines, ...contentDiffLines]
    if (allDiffs.length === 0) {
      console.log(`  PASS  file tree + content diff = 0 (${filesA.length} files, after normalization)`)
      console.log(`\n1 passed, 0 failed\n`)
    } else {
      console.error(`  FAIL  ${allDiffs.length} difference(s) found:`)
      for (const line of allDiffs) console.error(line)
      console.error(`\n0 passed, 1 failed\n`)
      process.exit(1)
    }
  } finally {
    // Cleanup tmp dirs
    try { fs.rmSync(tmpA, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(tmpB, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(sandboxHome, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

main().catch(e => {
  console.error(`\nFATAL: ${e?.message ?? String(e)}\n`)
  process.exit(1)
})
