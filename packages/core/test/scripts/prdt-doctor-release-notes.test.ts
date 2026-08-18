/**
 * prdt-doctor-release-notes.test.ts — T-465 release-notes gap signal, black-box
 * over the REAL `prdt` CLI (mirrors prdt-doctor-build-entry.test.ts).
 *
 * Observed violation (T-465, 2026-08-11): `v1.5.1` was tagged locally and left
 * with NO `## v1.5.1` section in RELEASES.md, no log line and no push — and the
 * user believed it had shipped. contracts §Git and the PO lifecycle both already
 * required the section in the SAME change that cuts the tag; nothing checked it.
 * `prdt doctor` is prdt's one signal point, so the miss surfaces here —
 * warning-only, never a gate.
 *
 * Two invariants the check must hold:
 *  - tags are read from the CODE repo, alongside `<codeRoot>/docs/RELEASES.md`,
 *    in BOTH layouts (`prdt init` writes `code.dir: "code"` by default; the
 *    meta/code confusion is exactly what T-465 documents);
 *  - only version-shaped tags count — a `v`-prefixed non-release tag is not a
 *    release cut and must not raise a false miss.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(): string {
  try {
    return runPrdt(['doctor'])
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

/** Drop `code.dir` from config — the legacy layout where codeRoot == projectRoot. */
function makeLegacyLayout() {
  const p = path.join(projectDir, '.prdt', 'config.json')
  const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'))
  delete cfg.code
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2))
}

/** A repo with one commit, so tags have something to point at. */
function gitRepoWithCommit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  git('init', '-q')
  git('commit', '-q', '--allow-empty', '-m', 'seed')
  return git
}

function writeReleases(root: string, body: string) {
  const p = path.join(root, 'docs', 'RELEASES.md')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

const GAP = /release-notes: tag\(s\) .* cut with no matching/
const gapLine = (out: string) => out.split('\n').find((l) => GAP.test(l)) as string

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-releases-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — release-notes gap on a cut tag (T-465)', () => {
  // ── split layout (`prdt init` default: code.dir = "code") ───────────────────

  test('fires: tag cut, no matching section (the observed v1.5.1 shape)', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    gitRepoWithCommit(codeRoot)('tag', 'v1.5.1')
    const out = doctor()
    expect(out).toMatch(GAP)
    expect(out).toMatch(/v1\.5\.1/)
    expect(out).toMatch(/code\/docs\/RELEASES\.md/)
  })

  test('clean: tag cut AND the matching section present', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    gitRepoWithCommit(codeRoot)('tag', 'v1.5.1')
    writeReleases(codeRoot, '# Releases\n\n## v1.5.1 — hotfix (2026-08-11)\n\n### Fixed\n- thing\n')
    expect(doctor()).not.toMatch(GAP)
  })

  test('fires: only the missing tags are named, covered ones stay out', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    const git = gitRepoWithCommit(codeRoot)
    git('tag', 'v1.4')
    git('tag', 'v1.5')
    git('tag', 'v1.5.1')
    writeReleases(codeRoot, '# Releases\n\n## v1.5 — x\n\n## v1.4 — y\n')
    const out = doctor()
    expect(out).toMatch(GAP)
    const line = gapLine(out)
    expect(line).toMatch(/v1\.5\.1/)
    expect(line).not.toMatch(/v1\.4/)
    // `v1.5.1` contains `v1.5`; assert the covered tag is not listed on its own.
    expect(line.split(/\s+/)).not.toContain('v1.5')
  })

  test('silent: a v-prefixed non-release tag is not a release cut', () => {
    runInit()
    gitRepoWithCommit(path.join(projectDir, 'code'))('tag', 'vendor-sync')
    expect(doctor()).not.toMatch(GAP)
  })

  test('silent: no tags at all', () => {
    runInit()
    gitRepoWithCommit(path.join(projectDir, 'code'))
    expect(doctor()).not.toMatch(GAP)
  })

  test('silent: code repo absent / not a git repo (degrade-never-raise)', () => {
    runInit()
    expect(doctor()).not.toMatch(GAP)
  })

  test('a root-level RELEASES.md does NOT satisfy a code-side tag', () => {
    runInit()
    const codeRoot = path.join(projectDir, 'code')
    gitRepoWithCommit(codeRoot)('tag', 'v2.0')
    // The meta side is the wrong repo — reading it is the T-465 confusion.
    writeReleases(projectDir, '# Releases\n\n## v2.0 — wrong side\n')
    expect(doctor()).toMatch(GAP)

    writeReleases(codeRoot, '# Releases\n\n## v2.0 — right side\n')
    expect(doctor()).not.toMatch(GAP)
  })

  // ── legacy layout (codeRoot == projectRoot) ────────────────────────────────

  test('legacy: fires on a gap and clears once the section lands', () => {
    runInit()
    makeLegacyLayout()
    gitRepoWithCommit(projectDir)('tag', 'v1.5.1')
    const out = doctor()
    expect(out).toMatch(GAP)
    expect(gapLine(out)).toMatch(/(?<!code\/)docs\/RELEASES\.md/)

    writeReleases(projectDir, '# Releases\n\n## v1.5.1 — hotfix\n')
    expect(doctor()).not.toMatch(GAP)
  })
})
