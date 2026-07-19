/**
 * meta-migrate.test.ts — T-366 existing-project migration (PRD §v1.2 경계 결정 4,
 * 공통 마이그레이션 절차 ①→④).
 *
 * Logic-bearing guarantees under test (doctrine #3, test-first):
 *  - a mixed repo migrates to: code `git ls-files` meta-free · meta repo
 *    tracking exactly the allowlist · the code `.gitignore` is NOT touched
 *    (the managed block was retired in PRD §v1.3 설계 결정 2);
 *  - NO history rewrite: the code repo's pre-migration commits are untouched
 *    (old commits still contain meta) and no force-push/destructive git runs;
 *  - refusals: already-split re-run · no code git · staged changes (they would
 *    be swept into the tracking-removal commit);
 *  - crash-resume: meta.git exists but code still tracks meta → still eligible.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import {
  planMetaMigration,
  runMetaMigration,
} from '../../src/git-workflow/meta-migrate'
import { metaRepoExists, metaGitDir, initMetaRepo } from '../../src/git-workflow/meta-git'

let projectDir: string

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function metaGit(args: string[], cwd = projectDir): string {
  return execFileSync(
    'git',
    ['--git-dir', metaGitDir(cwd), '--work-tree', cwd, ...args],
    { cwd, encoding: 'utf-8' },
  ).trim()
}

/** A MIXED repo: code + meta all tracked and committed in the code git (the pre-v1.2 state). */
function makeMixedProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-migrate-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 'code@test'], root)
  git(['config', 'user.name', 'code'], root)
  // code
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'packages', 'app.ts'), 'export const x = 1\n')
  fs.writeFileSync(path.join(root, 'README.md'), '# readme\n')
  // meta (allowlisted) + derived artifact
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{}')
  fs.writeFileSync(path.join(root, '.prdt', 'index.db'), 'DERIVED')
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1', 'T-1.md'), '---\nid: T-1\n---\n')
  // user's own .gitignore line must survive the managed block injection
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n')
  git(['add', '-A'], root)
  git(['commit', '-qm', 'mixed init'], root)
  return root
}

beforeEach(() => {
  projectDir = makeMixedProject()
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

// ── plan ──────────────────────────────────────────────────────────────────────

test('plan: mixed repo → eligible, listing the tracked meta files', async () => {
  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('eligible')
  expect(plan.resuming).toBe(false)
  expect(plan.trackedMetaFiles).toContain('docs/prd/PRD.md')
  expect(plan.trackedMetaFiles).toContain('.prdt/config.json')
  expect(plan.trackedMetaFiles).toContain('.prdt/index.db')
  // code files are not part of the untrack set
  expect(plan.trackedMetaFiles).not.toContain('packages/app.ts')
  expect(plan.trackedMetaFiles).not.toContain('README.md')
})

test('plan: no code git → no-git refusal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-migrate-nogit-'))
  try {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    const plan = await planMetaMigration(root)
    expect(plan.status).toBe('no-git')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('plan: staged changes → staged-changes refusal (never swept into the migration commit)', async () => {
  fs.writeFileSync(path.join(projectDir, 'packages', 'staged.ts'), 'export const s = 1\n')
  git(['add', 'packages/staged.ts'])
  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('staged-changes')
})

test('plan: unstaged/untracked-only changes do NOT block migration', async () => {
  fs.writeFileSync(path.join(projectDir, 'packages', 'app.ts'), 'export const x = 2\n') // unstaged edit
  fs.writeFileSync(path.join(projectDir, 'packages', 'loose.ts'), 'export const l = 1\n') // untracked
  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('eligible')
})

// ── run: the full ①→④ procedure ──────────────────────────────────────────────

test('run: mixed repo → code ls-files meta-free, meta repo tracks exactly the allowlist', async () => {
  const before = git(['rev-list', '--count', 'HEAD'])

  const res = await runMetaMigration(projectDir)
  expect(res.ok).toBe(true)
  expect(res.verified).toBe(true)
  expect(res.snapshotSha).toBeTruthy()
  expect(res.untrackCommitSha).toBeTruthy()

  // ④ code repo: git ls-files is meta-free
  const codeFiles = git(['ls-files']).split('\n')
  expect(codeFiles).toContain('packages/app.ts')
  expect(codeFiles).toContain('README.md')
  expect(codeFiles).toContain('.gitignore')
  expect(codeFiles.some((f) => f.startsWith('.prdt/') || f.startsWith('docs/'))).toBe(false)

  // ④ meta repo: tracks ONLY allowlisted paths, and does track the meta
  const metaFiles = metaGit(['ls-files']).split('\n')
  expect(metaFiles).toContain('docs/prd/PRD.md')
  expect(metaFiles).toContain('.prdt/config.json')
  expect(metaFiles).toContain('docs/tickets/v1/T-1.md')
  expect(metaFiles.some((f) => f.startsWith('packages/') || f === 'README.md')).toBe(false)
  // derived artifacts stay out of the meta repo (info/exclude)
  expect(metaFiles).not.toContain('.prdt/index.db')

  // ③ code `.gitignore` untouched: user line intact, NO managed block injected
  // (PRD §v1.3 설계 결정 2 — the block was retired)
  const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
  expect(gitignore).toBe('node_modules/\n')
  expect(gitignore).not.toContain('>>> prdt meta')

  // NO history rewrite: exactly one new commit on top; old commits still hold meta
  const after = git(['rev-list', '--count', 'HEAD'])
  expect(Number(after)).toBe(Number(before) + 1)
  const oldTracked = git(['ls-tree', '-r', '--name-only', 'HEAD~1'])
  expect(oldTracked).toContain('docs/prd/PRD.md')

  // work-tree files themselves are untouched (rm --cached only)
  expect(fs.existsSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'))).toBe(true)
})

test('run: working tree dirt (unstaged edits) survives and is not committed', async () => {
  fs.writeFileSync(path.join(projectDir, 'packages', 'app.ts'), 'export const x = 3\n')
  const res = await runMetaMigration(projectDir)
  expect(res.ok).toBe(true)
  // unstaged edit still present and still unstaged
  expect(git(['diff', '--name-only'])).toContain('packages/app.ts')
  const committed = git(['show', '--stat', '--name-only', 'HEAD'])
  expect(committed).not.toContain('packages/app.ts')
})

test('run: already-split re-run → refused as no-op, no new commits', async () => {
  const first = await runMetaMigration(projectDir)
  expect(first.ok).toBe(true)
  const commits = git(['rev-list', '--count', 'HEAD'])
  const metaCommits = metaGit(['rev-list', '--count', 'HEAD'])

  const second = await runMetaMigration(projectDir)
  expect(second.ok).toBe(false)
  expect(second.refusal).toBe('already-split')
  expect(git(['rev-list', '--count', 'HEAD'])).toBe(commits)
  expect(metaGit(['rev-list', '--count', 'HEAD'])).toBe(metaCommits)

  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('already-split')
})

test('run: crash-resume — meta.git already exists but code still tracks meta → completes', async () => {
  // simulate a migration that died after ① (meta repo init, nothing else)
  const init = await initMetaRepo(projectDir)
  expect(init.initialized).toBe(true)
  expect(metaRepoExists(projectDir)).toBe(true)

  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('eligible')
  expect(plan.resuming).toBe(true)

  const res = await runMetaMigration(projectDir)
  expect(res.ok).toBe(true)
  expect(res.verified).toBe(true)
  expect(git(['ls-files', '--', 'docs/prd'])).toBe('')
})

test('run: commit failure → index rolled back clean, plan stays eligible, re-run completes (T-370 C2)', async () => {
  // deterministic commit failure: a failing pre-commit hook on the CODE repo
  const hookPath = path.join(projectDir, '.git', 'hooks', 'pre-commit')
  fs.mkdirSync(path.dirname(hookPath), { recursive: true })
  fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 })

  const res = await runMetaMigration(projectDir)
  expect(res.ok).toBe(false)
  expect(res.error).toContain('tracking-removal commit failed')

  // the module's own header contract: no half-staged state leaks to a user
  // who never touches git — the index must be clean of migration residue
  expect(git(['diff', '--cached', '--name-only'])).toBe('')
  // …and the meta files are back in the code index (untrack rolled back)
  expect(git(['ls-files', '--', 'docs/prd'])).toContain('docs/prd/PRD.md')

  // re-entry: the plan must NOT misread the residue as already-split
  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('eligible')
  expect(plan.resuming).toBe(true)

  // unblock and resume to completion
  fs.rmSync(hookPath)
  const second = await runMetaMigration(projectDir)
  expect(second.ok).toBe(true)
  expect(second.verified).toBe(true)
  expect(second.untrackCommitSha).toBeTruthy()
  expect(git(['ls-files', '--', 'docs/prd'])).toBe('')
})

test('run: meta files all deleted from work-tree → successful untrack reports ok, not a mismatch (T-370 C5)', async () => {
  // meta exists only in git history/index — the work-tree copies are gone
  fs.rmSync(path.join(projectDir, '.prdt'), { recursive: true, force: true })
  fs.rmSync(path.join(projectDir, 'docs'), { recursive: true, force: true })

  const plan = await planMetaMigration(projectDir)
  expect(plan.status).toBe('eligible') // the code index still tracks meta

  const res = await runMetaMigration(projectDir)
  // nothing to snapshot (meta repo stays empty) is CONSISTENT here — the
  // untrack itself succeeded and must not be reported as a verification
  // mismatch
  expect(res.ok).toBe(true)
  expect(res.verified).toBe(true)
  expect(res.metaTrackedCount).toBe(0)
  expect(res.error).toBeUndefined()
  expect(res.untrackCommitSha).toBeTruthy()
  expect(git(['ls-files', '--', 'docs', '.prdt'])).toBe('')
})

test('run: refusals return without touching the repo', async () => {
  fs.writeFileSync(path.join(projectDir, 'packages', 'staged.ts'), 'export const s = 1\n')
  git(['add', 'packages/staged.ts'])
  const head = git(['rev-parse', 'HEAD'])

  const res = await runMetaMigration(projectDir)
  expect(res.ok).toBe(false)
  expect(res.refusal).toBe('staged-changes')
  expect(git(['rev-parse', 'HEAD'])).toBe(head)
  expect(metaRepoExists(projectDir)).toBe(false)
})
