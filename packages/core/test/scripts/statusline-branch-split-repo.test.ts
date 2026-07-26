/**
 * statusline branch — meta/code split repo (T-426).
 *
 * Repro (confirmed on a second machine's dogfood report): the `branch:`
 * segment queried git ONLY at the project root, so a meta/code split project
 * (root has no `.git`; the code repo physically lives at `<root>/<code.dir>`,
 * PRD §v1.3) could never surface it — the segment silently vanished on every
 * such machine. This machine never caught it because productune's own root
 * happens to sit inside a parent monorepo `.git`.
 *
 * Fix mirrors the existing codeRoot resolution contract
 * (src/state/project-kind.ts codeDirName/codeRoot): root repo wins (non-split,
 * unchanged) → else the configured (or default "code") code repo → else the
 * segment stays silently absent. Drives the REAL statusline-prdt.sh end-to-end.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const STATUSLINE_SH = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const GIT = which('git')
const PYTHON3 = which('python3')

let projectDir: string

function initGitRepo(dir: string, branch: string): void {
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'u@test'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'u'], { cwd: dir })
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n')
  execFileSync('git', ['add', 'f.txt'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
}

/** Run the real statusline script with cwd = projectDir, empty stdin (no JSON piped in). */
function runStatusline(): string {
  return execFileSync('bash', [STATUSLINE_SH], {
    cwd: projectDir,
    input: '',
    encoding: 'utf-8',
  })
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-t426-'))
  fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'), JSON.stringify({ stage: 'build' }))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

describe.skipIf(!GIT || !PYTHON3)('statusline-prdt.sh — branch segment (T-426)', () => {
  test('acceptance 1: split project (root has no .git; code repo at default "code/") → branch from the code repo', () => {
    initGitRepo(path.join(projectDir, 'code'), 'feature-x')

    const out = runStatusline()

    expect(out).toContain('branch: feature-x')
  })

  test('acceptance 1b: configured code.dir (non-default name) is honored', () => {
    fs.writeFileSync(
      path.join(projectDir, '.prdt', 'config.json'),
      JSON.stringify({ code: { dir: 'implementation' } }),
    )
    initGitRepo(path.join(projectDir, 'implementation'), 'feature-y')

    const out = runStatusline()

    expect(out).toContain('branch: feature-y')
  })

  test('acceptance 2: non-split project (root itself is a git repo) → behavior unchanged, root branch wins', () => {
    initGitRepo(projectDir, 'root-branch')
    // a code/ subdir with a DIFFERENT branch must not win — root takes priority.
    initGitRepo(path.join(projectDir, 'code'), 'code-branch')

    const out = runStatusline()

    expect(out).toContain('branch: root-branch')
    expect(out).not.toContain('branch: code-branch')
  })

  test('acceptance 3: no repo at root or codeRoot → branch segment silently absent, no error', () => {
    const out = runStatusline()

    expect(out).not.toContain('branch:')
    expect(out).toContain('build') // rest of the line still renders
  })
})
