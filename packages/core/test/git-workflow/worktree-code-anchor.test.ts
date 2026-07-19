/**
 * worktree-code-anchor.test.ts — T-377 QA regression (anchor miss B).
 *
 * createWorktree / isBaseDirty / resolveBranchConflict / `git worktree add` all
 * run against the CODE repo, so they must anchor at codeRoot. Before the fix they
 * used cwd:projectDir (the meta projectRoot) — in a PHYSICALLY SPLIT project the
 * code `.git` lives under `<projectRoot>/<code.dir>`, so every git op hit
 * `fatal: not a git repository` and worktree creation was impossible (isBaseDirty
 * swallowed it as a false `false`). This drives the real CLI over a split fixture
 * (`.prdt/config.json` code.dir=code + a `code/` git repo) and confirms the legacy
 * layout (git at projectRoot) is unchanged.
 *
 * NB: the worktree LOCATION (`<stateDir>/worktrees`, meta area) is deliberately
 * unchanged here — its split-aware relocation is T-378. This pins the git-op
 * ANCHOR only.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { createWorktree } from '../../src/git-workflow/worktree'

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const GIT = which('git')

/**
 * Init a git repo with one commit on `main` at `dir`. Ignores `.prdt/` so the
 * base is CLEAN — a legacy project (code repo == projectRoot) physically contains
 * the meta scaffold, and after PRD §v1.3 설계 결정 2 (managed block retired) the
 * user's own `.gitignore` is what keeps `.prdt/` out of the code repo's status.
 * For a split fixture the code repo is `code/`, so `.prdt/` (at the parent) is
 * outside its work-tree and this line is simply a harmless no-op.
 */
function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  run(['init', '-b', 'main'])
  run(['config', 'user.email', 'w@test'])
  run(['config', 'user.name', 'w'])
  run(['config', 'commit.gpgsign', 'false'])
  fs.writeFileSync(path.join(dir, 'app.js'), 'x\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), '.prdt/\n')
  run(['add', 'app.js', '.gitignore'])
  run(['commit', '-qm', 'base'])
}

/** Seed the meta scaffold (`.prdt/`) at projectRoot with an optional code.dir. */
function seedMeta(root: string, codeDir: string | null): void {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  const cfg = codeDir ? { slug: 'p', code: { dir: codeDir } } : { slug: 'p' }
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1 }))
}

describe.skipIf(!GIT)('createWorktree — code-repo anchor (T-377)', () => {
  test('SPLIT: code.dir set, code `.git` under code/ → worktree created (anchored at codeRoot)', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-split-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    seedMeta(root, 'code')
    initRepo(path.join(root, 'code')) // code repo lives at codeRoot, NOT projectRoot

    try {
      const res = await createWorktree({ projectDir: root, ticketId: 'T-900', slug: 'demo', type: 'feature' })
      // Before the fix: git ran at projectRoot (no `.git`) → 'git-error' / impossible.
      expect(res.ok).toBe(true)
      if (res.ok) {
        // LOCATION unchanged (meta area) — T-378 scope.
        expect(res.worktreePath).toBe(path.join(root, '.prdt', 'worktrees', 'T-900'))
        // The worktree is a REAL worktree of the code repo (its .git pointer exists).
        expect(fs.existsSync(path.join(res.worktreePath, '.git'))).toBe(true)
        // The code repo knows about the new branch.
        const branches = execFileSync('git', ['-C', path.join(root, 'code'), 'branch', '--list'], { encoding: 'utf8' })
        expect(branches).toContain(res.branchName)
      }
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true })
    }
  })

  test('SPLIT: dirty code repo → base-dirty (isBaseDirty reads codeRoot status)', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-dirty-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    seedMeta(root, 'code')
    initRepo(path.join(root, 'code'))
    // Dirty a tracked file INSIDE the code repo — projectRoot stays clean.
    fs.writeFileSync(path.join(root, 'code', 'app.js'), 'changed\n')

    try {
      const res = await createWorktree({ projectDir: root, ticketId: 'T-901', slug: 'demo', type: 'feature' })
      // Before the fix: status ran at projectRoot (no `.git`) → caught → false → NOT
      // reported dirty. Now it correctly reads the code repo and blocks.
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.reason).toBe('base-dirty')
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true })
    }
  })

  test('LEGACY: no code.dir, git at projectRoot → worktree created (unchanged)', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-legacy-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    seedMeta(root, null)
    initRepo(root) // legacy: code repo IS projectRoot

    try {
      const res = await createWorktree({ projectDir: root, ticketId: 'T-902', slug: 'demo', type: 'feature' })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.worktreePath).toBe(path.join(root, '.prdt', 'worktrees', 'T-902'))
        expect(fs.existsSync(path.join(res.worktreePath, '.git'))).toBe(true)
      }
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true })
    }
  })
})
