/**
 * promote.test.ts — T-323 canonical solo branch model (dev residence · dev→main
 * promote · immutable v* tag).
 *
 * Behavioral: drives real git in a tmp repo (skipped when git is absent) and
 * asserts branch/tag state after each operation. Covers both LEGACY (code repo
 * == projectRoot) and SPLIT (code under code/) anchoring for the core paths.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import {
  ensureDevBranch,
  promoteDevToMain,
  tagVersion,
  versionToTag,
} from '../../src/git-workflow/promote'

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const GIT = which('git')

function g(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

/** Init a git repo on `main` with one commit. `.prdt/` is gitignored, matching a
 * real code repo (the meta dir is never tracked by the code git). */
function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  run(['init', '-b', 'main'])
  run(['config', 'user.email', 'w@test'])
  run(['config', 'user.name', 'w'])
  run(['config', 'commit.gpgsign', 'false'])
  fs.writeFileSync(path.join(dir, 'app.js'), 'v0\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), '.prdt/\n')
  run(['add', 'app.js', '.gitignore'])
  run(['commit', '-qm', 'base'])
}

/** commit a change to app.js on whatever branch is current. */
function commit(dir: string, content: string, msg: string): void {
  fs.writeFileSync(path.join(dir, 'app.js'), content)
  execFileSync('git', ['add', 'app.js'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-qm', msg], { cwd: dir, stdio: 'ignore' })
}

/** LEGACY project: git repo IS projectRoot; seed a `.prdt` marker so codeRoot resolves there. */
function legacyProject(): string {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'promote-')), 'proj')
  initRepo(root)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'p' }))
  return root
}

/**
 * SPLIT project (PRD §v1.3): meta (`.prdt`) at projectRoot, CODE git one level
 * down under `code/`. Returns the projectRoot — every promote op takes projectDir
 * and must anchor at codeRoot, never the meta root (the T-377 defect class).
 */
function splitProject(): { root: string; codeDir: string } {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'promote-split-')), 'proj')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'p', code: { dir: 'code' } }))
  const codeDir = path.join(root, 'code')
  initRepo(codeDir) // code repo lives at codeRoot, NOT projectRoot
  return { root, codeDir }
}

function cur(dir: string): string {
  return g(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
}
function hasBranch(dir: string, b: string): boolean {
  try { g(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]); return true } catch { return false }
}

// ── versionToTag (pure) ─────────────────────────────────────────────────────────

test('versionToTag normalizes and validates', () => {
  expect(versionToTag('1.2')).toBe('v1.2')
  expect(versionToTag('v1.2')).toBe('v1.2')
  expect(versionToTag(' 1.2.3 ')).toBe('v1.2.3')
  expect(versionToTag('1')).toBe('v1')
  expect(versionToTag('1.x')).toBeNull()
  expect(versionToTag('beta')).toBeNull()
  expect(versionToTag('')).toBeNull()
})

describe.skipIf(!GIT)('ensureDevBranch', () => {
  test('creates dev from main and checks it out', async () => {
    const root = legacyProject()
    expect(hasBranch(root, 'dev')).toBe(false)

    const res = await ensureDevBranch(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('created')
    expect(cur(root)).toBe('dev')
    // dev points at main's commit
    expect(g(root, ['rev-parse', 'dev'])).toBe(g(root, ['rev-parse', 'main']))
  })

  test('already-current is a no-op', async () => {
    const root = legacyProject()
    await ensureDevBranch(root)
    const res = await ensureDevBranch(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('already-current')
  })

  test('checks out existing dev from main', async () => {
    const root = legacyProject()
    g(root, ['branch', 'dev'])
    expect(cur(root)).toBe('main')
    const res = await ensureDevBranch(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('checked-out')
    expect(cur(root)).toBe('dev')
  })

  test('creating dev while dirty carries in-progress edits onto the residence', async () => {
    const root = legacyProject()
    fs.writeFileSync(path.join(root, 'app.js'), 'work-in-progress\n')
    const res = await ensureDevBranch(root)
    // checkout -b is data-safe: dev is created and the edits come along.
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('created')
    expect(cur(root)).toBe('dev')
    expect(fs.readFileSync(path.join(root, 'app.js'), 'utf8')).toBe('work-in-progress\n')
  })
})

describe.skipIf(!GIT)('promoteDevToMain', () => {
  test('promotes dev commits into main with a merge commit, returns to dev', async () => {
    const root = legacyProject()
    await ensureDevBranch(root)
    commit(root, 'v1\n', 'feat: work on dev')
    const devSha = g(root, ['rev-parse', 'dev'])

    const res = await promoteDevToMain(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('promoted')

    // main now contains dev's work (dev is an ancestor of main)
    g(root, ['merge-base', '--is-ancestor', devSha, 'main']) // throws if not ancestor
    // residence restored
    expect(cur(root)).toBe('dev')
  })

  test('up-to-date when dev has nothing new', async () => {
    const root = legacyProject()
    await ensureDevBranch(root) // dev == main
    const res = await promoteDevToMain(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('up-to-date')
  })

  test('dev-missing when there is no dev branch', async () => {
    const root = legacyProject()
    const res = await promoteDevToMain(root)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('dev-missing')
  })

  test('refuses on a dirty tree', async () => {
    const root = legacyProject()
    await ensureDevBranch(root)
    commit(root, 'v1\n', 'feat: work')
    fs.writeFileSync(path.join(root, 'app.js'), 'uncommitted\n')
    const res = await promoteDevToMain(root)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('dirty')
  })

  test('merge conflict is reported and the repo is left clean on dev', async () => {
    const root = legacyProject()
    // diverge main and dev on the same file
    await ensureDevBranch(root)
    commit(root, 'dev-line\n', 'feat: dev change')
    g(root, ['checkout', 'main'])
    commit(root, 'main-line\n', 'fix: main change')
    g(root, ['checkout', 'dev'])

    const res = await promoteDevToMain(root)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('merge-conflict')
    // aborted → clean tree, back on dev
    expect(g(root, ['status', '--porcelain'])).toBe('')
    expect(cur(root)).toBe('dev')
  })
})

describe.skipIf(!GIT)('tagVersion', () => {
  test('creates an immutable annotated v* tag', async () => {
    const root = legacyProject()
    const res = await tagVersion(root, '1.2')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.tag).toBe('v1.2')
      // annotated tag object exists
      expect(g(root, ['cat-file', '-t', 'v1.2'])).toBe('tag')
    }
  })

  test('refuses to move an existing tag (immutable)', async () => {
    const root = legacyProject()
    await tagVersion(root, '1.2')
    commit(root, 'more\n', 'chore: more')
    const res = await tagVersion(root, 'v1.2')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('exists')
  })

  test('rejects an invalid version', async () => {
    const root = legacyProject()
    const res = await tagVersion(root, 'not-a-version')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-version')
  })
})

// ── SPLIT layout: every op must anchor at codeRoot, not the meta projectRoot ─────

describe.skipIf(!GIT)('codeRoot anchoring (v1.3 split)', () => {
  test('ensureDevBranch → promote → tag all operate on the code repo under code/', async () => {
    const { root, codeDir } = splitProject()

    // projectRoot has the meta `.prdt` but NO `.git`; anchoring there would fatal.
    expect(fs.existsSync(path.join(root, '.git'))).toBe(false)
    expect(fs.existsSync(path.join(codeDir, '.git'))).toBe(true)

    const ensured = await ensureDevBranch(root)
    expect(ensured.ok).toBe(true)
    expect(cur(codeDir)).toBe('dev') // branch created IN the code repo

    commit(codeDir, 'split-v1\n', 'feat: work on dev')
    const promoted = await promoteDevToMain(root)
    expect(promoted.ok).toBe(true)
    if (promoted.ok) expect(promoted.reason).toBe('promoted')
    // main in the code repo now contains dev's work
    g(codeDir, ['merge-base', '--is-ancestor', 'dev', 'main'])
    expect(cur(codeDir)).toBe('dev') // residence restored

    const tagged = await tagVersion(root, '1.0')
    expect(tagged.ok).toBe(true)
    expect(g(codeDir, ['cat-file', '-t', 'v1.0'])).toBe('tag')
  })
})

// ── ensureDevBranch on an UNBORN HEAD (T-386 C6) ──────────────────────────────

describe.skipIf(!GIT)('ensureDevBranch — unborn HEAD (fresh repo, zero commits)', () => {
  test('establishes dev residence without crashing on an unborn HEAD', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'promote-unborn-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'p' }))
    // NO commit → HEAD is unborn. Old code did `checkout -b dev HEAD`, which
    // fails here (HEAD resolves to nothing); the fix omits the start-point.

    const res = await ensureDevBranch(root)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.reason).toBe('created')
    // dev is now the (still-unborn) residence branch.
    expect(g(root, ['symbolic-ref', '--short', 'HEAD'])).toBe('dev')

    // and a first commit lands on dev, confirming residence is real.
    fs.writeFileSync(path.join(root, 'app.js'), 'v0\n')
    execFileSync('git', ['add', 'app.js'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'w@test'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'w'], { cwd: root })
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root })
    execFileSync('git', ['commit', '-qm', 'first'], { cwd: root })
    expect(cur(root)).toBe('dev')
  })
})
