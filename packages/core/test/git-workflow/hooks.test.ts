/**
 * hooks.test.ts — pre-push hook rules resolution across layouts (T-298 → T-376).
 *
 * The generated pre-push script must find the project's git-rules.json
 * regardless of the code work-tree location:
 *  - LEGACY: codeRoot == projectRoot, rules at `<root>/.prdt/git-rules.json`.
 *  - v1.3 PHYSICAL SPLIT: codeRoot == `<root>/code`, git runs the hook with
 *    cwd = codeRoot, and the rules live one level UP. A hard-coded relative
 *    `.prdt/…` would miss them and silently fall back to the default protected
 *    list (the T-298 / T-284 defect class). The script UP-WALKS from `$PWD`.
 *
 * Verified behaviorally: run the generated hook from the code work-tree cwd,
 * feed it a push ref, and assert it blocks a protected branch / allows others.
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

function writeRules(dir: string, stateDirName: string, protectedBranches: string[]): void {
  const sd = path.join(dir, stateDirName)
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, 'git-rules.json'), JSON.stringify({ protectedBranches }))
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

test('legacy .prdt: hook up-walks to .prdt/git-rules.json and blocks a protected branch', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  writeRules(root, '.prdt', ['main', 'release'])

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')
  expect(fs.existsSync(hook)).toBe(true)

  expect(runHook(hook, root, 'main')).toBe(1) // protected → blocked
  expect(runHook(hook, root, 'release')).toBe(1)
  expect(runHook(hook, root, 'feature/x')).toBe(0) // unprotected → allowed
})

test('legacy .productune: hook still honors .productune/git-rules.json', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  writeRules(root, '.productune', ['main'])

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')

  expect(runHook(hook, root, 'main')).toBe(1)
  expect(runHook(hook, root, 'dev')).toBe(0)
})

test('no rules file anywhere → default protected list (main) still enforced', async () => {
  const root = mkroot()
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })

  await installPrePushHook(root)
  const hook = path.join(root, '.git', 'hooks', 'pre-push')

  expect(runHook(hook, root, 'main')).toBe(1) // default fallback
  expect(runHook(hook, root, 'feature/x')).toBe(0)
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

test('split: hook up-walks from codeRoot cwd to the parent .prdt/git-rules.json', async () => {
  const root = mkroot()
  writeConfig(root, { slug: 'proj', code: { dir: 'code' } })
  const codeRoot = path.join(root, 'code')
  fs.mkdirSync(path.join(codeRoot, '.git'), { recursive: true })
  writeRules(root, '.prdt', ['main', 'production'])

  await installPrePushHook(root)
  const hook = path.join(codeRoot, '.git', 'hooks', 'pre-push')

  // git runs the hook with cwd = codeRoot; rules live one level up.
  expect(runHook(hook, codeRoot, 'main')).toBe(1)
  expect(runHook(hook, codeRoot, 'production')).toBe(1)
  expect(runHook(hook, codeRoot, 'feature/y')).toBe(0)
})
