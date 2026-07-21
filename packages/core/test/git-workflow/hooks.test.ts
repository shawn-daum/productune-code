/**
 * hooks.test.ts — pre-push hook behavior across layouts (T-298 → T-376 → T-386 C5).
 *
 * T-381 hard rule: `main` is the ONLY protected branch (`dev` is the pushable
 * residence). T-386 C5 removed the old up-walk + `sed`-parse of git-rules.json
 * `protectedBranches` — the parser only matched single-line JSON but the product
 * always PRETTY-PRINTS git-rules.json, so it never matched a real file and always
 * fell through to a hard-coded `main`. The hook now bakes `main` in directly.
 *
 * These tests therefore assert behavior against the REAL (pretty-printed) file
 * format the product writes, and pin the two invariants that matter:
 *  - `main` is blocked, `dev` / feature branches are allowed, in BOTH layouts;
 *  - a stale `["main","dev"]` file (a pre-T-381 artifact) does NOT resurrect the
 *    dev-push-block landmine — dev stays pushable regardless of file contents.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'
import { installPrePushHook } from '../../src/git-workflow/hooks'

function mkroot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'core-hooks-'))
}

/** Write git-rules.json in the SAME pretty-printed format the product uses
 * (rules.ts saveRules → JSON.stringify(rules, null, 2)). */
function writeRules(dir: string, stateDirName: string, protectedBranches: string[]): void {
  const sd = path.join(dir, stateDirName)
  fs.mkdirSync(sd, { recursive: true })
  const rules = {
    useDevBranch: true,
    useStagingEnv: false,
    featureBranchPrefix: 'feature',
    fixBranchPrefix: 'fix',
    protectedBranches,
    autosaveTriggers: { onStatusChange: true, onQaStatusChange: true, onQaLoopsChange: true, onManual: true },
  }
  fs.writeFileSync(path.join(sd, 'git-rules.json'), JSON.stringify(rules, null, 2))
}

function writeConfig(root: string, cfg: unknown): void {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg))
}

/**
 * Run the installed pre-push hook from `cwd`, pushing `branch`.
 * Returns the exit code (1 = blocked as protected, 0 = allowed).
 */
function runHook(hookScript: string, cwd: string, branch: string): number {
  try {
    execFileSync('sh', [hookScript], {
      cwd,
      input: `refs/heads/${branch} aaaa refs/heads/${branch} bbbb\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return 0
  } catch (e: any) {
    return typeof e.status === 'number' ? e.status : -1
  }
}

// ── legacy layout (codeRoot == projectRoot) ───────────────────────────────────

test('legacy: main blocked, dev and feature branches allowed', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  writeRules(root, '.prdt', ['main'])

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')
  expect(fs.existsSync(hook)).toBe(true)

  expect(runHook(hook, root, 'main')).toBe(1) // protected → blocked
  expect(runHook(hook, root, 'dev')).toBe(0) // residence → allowed
  expect(runHook(hook, root, 'feature/x')).toBe(0) // unprotected → allowed
})

test('main is blocked even with NO rules file (baked-in, not parsed)', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')

  expect(runHook(hook, root, 'main')).toBe(1)
  expect(runHook(hook, root, 'feature/x')).toBe(0)
})

test('landmine guard: a stale ["main","dev"] file does NOT block dev', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  // A pre-T-381 artifact — the old parser would have added `dev` to the blocked
  // set. The hook no longer reads the file, so dev stays pushable.
  writeRules(root, '.prdt', ['main', 'dev'])

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')

  expect(runHook(hook, root, 'main')).toBe(1)
  expect(runHook(hook, root, 'dev')).toBe(0) // NOT blocked despite the stale file
})

// ── v1.3 physical split (codeRoot == <root>/code) ─────────────────────────────

test('split: hook installs into codeRoot/.git/hooks, not the project root', async () => {
  const root = mkroot()
  writeConfig(root, { slug: 'proj', code: { dir: 'code' } })
  fs.mkdirSync(path.join(root, 'code', '.git'), { recursive: true })
  writeRules(root, '.prdt', ['main'])

  await installPrePushHook(root)

  expect(fs.existsSync(path.join(root, 'code', '.git', 'hooks', 'pre-push'))).toBe(true)
  expect(fs.existsSync(path.join(root, '.git', 'hooks', 'pre-push'))).toBe(false)
})

test('split: main blocked / dev allowed when run from the code work-tree cwd', async () => {
  const root = mkroot()
  writeConfig(root, { slug: 'proj', code: { dir: 'code' } })
  const codeRoot = path.join(root, 'code')
  fs.mkdirSync(path.join(codeRoot, '.git'), { recursive: true })
  writeRules(root, '.prdt', ['main'])

  await installPrePushHook(root)
  const hook = path.join(codeRoot, '.git', 'hooks', 'pre-push')

  // git runs the hook with cwd = codeRoot; behavior is layout-independent now.
  expect(runHook(hook, codeRoot, 'main')).toBe(1)
  expect(runHook(hook, codeRoot, 'dev')).toBe(0)
  expect(runHook(hook, codeRoot, 'feature/y')).toBe(0)
})
