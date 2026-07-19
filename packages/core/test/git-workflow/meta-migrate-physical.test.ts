/**
 * meta-migrate-physical.test.ts — T-378 2nd migration: PHYSICAL re-layout
 * (PRD §v1.3 §기존 분리 완료 repo 7개 · Acceptance #1 #2).
 *
 * Logic-bearing guarantees (doctrine #3, test-first):
 *  - a logically-split repo relocates its code (files + `.git`) into `code/` with
 *    tracked paths + history UNCHANGED (no rename commit, same rev-list count);
 *  - BOTH `.git` shapes: a normal `.git` dir renames wholesale; a linked-worktree
 *    gitfile relocates AND its external back-pointer is repaired so the code repo
 *    still resolves (productune's real shape);
 *  - an unknown `.git` shape (submodule gitfile) aborts cleanly, touching nothing;
 *  - an interrupted move rolls back to the exact pre-run layout (no half-state);
 *  - a re-run on a migrated repo is a no-op;
 *  - the managed `.gitignore` block is stripped (user lines survive), meta
 *    `info/exclude` gains `code/`, and `code.dir` is recorded.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach, vi } from 'vitest'
import {
  planPhysicalMigration,
  runPhysicalMigration,
} from '../../src/git-workflow/meta-migrate'
import { initMetaRepo, commitMeta, metaGitDir } from '../../src/git-workflow/meta-git'

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const GIT = which('git')

const MANAGED_START = '# >>> prdt meta (managed) >>>'
const MANAGED_END = '# <<< prdt meta (managed) <<<'
const CODE_GITIGNORE = `node_modules/\n${MANAGED_START}\n.prdt/\ndocs/\nbriefs/\n${MANAGED_END}\n`

const tmpRoots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const r of tmpRoots.splice(0)) fs.rmSync(r, { recursive: true, force: true })
})

function mkTmp(prefix: string): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tmpRoots.push(r)
  return r
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** Seed the meta scaffold at projectRoot (files + a snapshotted meta.git). */
async function seedMeta(root: string): Promise<void> {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(path.join(root, 'briefs'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1 }))
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  fs.writeFileSync(path.join(root, 'briefs', '.keep'), '')
  await initMetaRepo(root)
  await commitMeta(root, 'initial meta snapshot')
}

/** Write + commit the code files into whatever repo already lives at `dir`. */
function seedCodeFiles(dir: string): void {
  fs.mkdirSync(path.join(dir, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'packages', 'app.ts'), 'export const x = 1\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# readme\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), CODE_GITIGNORE)
  git(['add', 'packages/app.ts', 'README.md', '.gitignore'], dir)
  git(['commit', '-qm', 'code'], dir)
}

/** NORMAL: `.git` is a directory at projectRoot; meta lives beside it. */
async function makeNormalSplit(): Promise<string> {
  const root = path.join(mkTmp('phys-normal-'), 'proj')
  fs.mkdirSync(root, { recursive: true })
  git(['init', '-q', '-b', 'main'], root)
  git(['config', 'user.email', 'c@t'], root)
  git(['config', 'user.name', 'c'], root)
  git(['config', 'commit.gpgsign', 'false'], root)
  seedCodeFiles(root)
  await seedMeta(root)
  return root
}

/** LINKED WORKTREE: projectRoot is a linked worktree of a sibling `common` repo
 * (productune's real shape: `.git` is a gitfile → `<common>/.git/worktrees/<id>`). */
async function makeLinkedWorktreeSplit(): Promise<{ root: string; common: string }> {
  const base = mkTmp('phys-linked-')
  const common = path.join(base, 'common')
  fs.mkdirSync(common, { recursive: true })
  git(['init', '-q', '-b', 'main'], common)
  git(['config', 'user.email', 'c@t'], common)
  git(['config', 'user.name', 'c'], common)
  git(['config', 'commit.gpgsign', 'false'], common)
  seedCodeFiles(common)
  const root = path.join(base, 'proj')
  git(['worktree', 'add', '-q', '-b', 'projbranch', root], common)
  // `.git` at root is now a gitfile
  expect(fs.lstatSync(path.join(root, '.git')).isFile()).toBe(true)
  await seedMeta(root)
  return { root, common }
}

describe.skipIf(!GIT)('physical migration — plan', () => {
  test('logically-split normal repo → eligible, moving only code entries', async () => {
    const root = await makeNormalSplit()
    const plan = planPhysicalMigration(root)
    expect(plan.status).toBe('eligible')
    expect(plan.gitShape).toBe('normal')
    expect(plan.codeDir).toBe('code')
    expect(plan.entriesToMove).toEqual(
      expect.arrayContaining(['packages', 'README.md', '.gitignore', '.git']),
    )
    // meta top-levels stay at root
    for (const meta of ['.prdt', 'docs', 'briefs']) {
      expect(plan.entriesToMove).not.toContain(meta)
    }
  })

  test('no meta.git (logical split not done) → meta-repo-missing', async () => {
    const root = path.join(mkTmp('phys-nometa-'), 'proj')
    fs.mkdirSync(root, { recursive: true })
    git(['init', '-q'], root)
    git(['config', 'user.email', 'c@t'], root)
    git(['config', 'user.name', 'c'], root)
    seedCodeFiles(root)
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    expect(planPhysicalMigration(root).status).toBe('meta-repo-missing')
  })

  test('no .git → no-git', () => {
    const root = mkTmp('phys-nogit-')
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    expect(planPhysicalMigration(root).status).toBe('no-git')
  })

  test('unknown .git shape (submodule-like gitfile) → unknown-git-shape', async () => {
    const root = await makeNormalSplit()
    fs.rmSync(path.join(root, '.git'), { recursive: true, force: true })
    // a gitfile pointing at a non-worktree gitdir = submodule/other → not handled
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/.git/modules/x\n')
    expect(planPhysicalMigration(root).status).toBe('unknown-git-shape')
  })
})

describe.skipIf(!GIT)('physical migration — run (normal .git)', () => {
  test('relocates code into code/ with history + tracked paths unchanged (no rename commit)', async () => {
    const root = await makeNormalSplit()
    const codeAtRoot = path.join(root, 'code')

    const filesBefore = git(['ls-files'], root).split('\n').sort()
    const countBefore = git(['rev-list', '--count', 'HEAD'], root)
    const metaFilesBefore = git(['--git-dir', metaGitDir(root), '--work-tree', root, 'ls-files'], root)
    const metaHeadBefore = git(['--git-dir', metaGitDir(root), '--work-tree', root, 'rev-parse', 'HEAD'], root)

    const res = await runPhysicalMigration(root)
    expect(res.ok).toBe(true)
    expect(res.verified).toBe(true)
    expect(res.gitShape).toBe('normal')

    // code physically under code/
    expect(fs.existsSync(path.join(codeAtRoot, '.git'))).toBe(true)
    expect(fs.existsSync(path.join(codeAtRoot, 'packages', 'app.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'packages'))).toBe(false)
    // meta stayed at root
    expect(fs.existsSync(path.join(root, '.prdt'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs', 'prd', 'PRD.md'))).toBe(true)

    // git POV unchanged: same tracked paths, same history depth, no rename commit
    expect(git(['ls-files'], codeAtRoot).split('\n').sort()).toEqual(filesBefore)
    expect(git(['rev-list', '--count', 'HEAD'], codeAtRoot)).toBe(countBefore)
    expect(git(['rev-parse', '--show-toplevel'], codeAtRoot)).toBe(fs.realpathSync(codeAtRoot))

    // meta untouched (tracked set + HEAD), continuous log
    expect(git(['--git-dir', metaGitDir(root), '--work-tree', root, 'ls-files'], root)).toBe(metaFilesBefore)
    expect(git(['--git-dir', metaGitDir(root), '--work-tree', root, 'rev-parse', 'HEAD'], root)).toBe(metaHeadBefore)

    // managed block stripped, user line survives
    const gi = fs.readFileSync(path.join(codeAtRoot, '.gitignore'), 'utf-8')
    expect(gi).toContain('node_modules/')
    expect(gi).not.toContain(MANAGED_START)
    expect(gi).not.toContain(MANAGED_END)

    // code.dir recorded
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.code.dir).toBe('code')

    // meta info/exclude gained code/
    const exclude = fs.readFileSync(path.join(metaGitDir(root), 'info', 'exclude'), 'utf-8')
    expect(exclude).toContain('code/')

    // meta status must not show the code tree
    const metaStatus = git(
      ['--git-dir', metaGitDir(root), '--work-tree', root, 'status', '--porcelain'], root,
    )
    expect(metaStatus).not.toMatch(/(^|\n)..\s*code\//)
  })

  test('re-run on a migrated repo is a no-op', async () => {
    const root = await makeNormalSplit()
    expect((await runPhysicalMigration(root)).ok).toBe(true)
    const second = await runPhysicalMigration(root)
    expect(second.ok).toBe(true)
    expect(second.noop).toBe(true)
    expect(second.movedCount).toBe(0)
    // plan agrees
    expect(planPhysicalMigration(root).status).toBe('already-migrated')
  })

  test('interrupted move rolls back to the pre-run layout (no half-state)', async () => {
    const root = await makeNormalSplit()
    const before = fs.readdirSync(root).sort()

    // Fail the SECOND rename (after one entry has already moved) — exercises the
    // mid-move rollback, not just a pre-move guard.
    const real = fs.renameSync.bind(fs)
    let n = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
      n += 1
      if (n === 2) throw new Error('injected mid-move failure')
      return real(from, to)
    })

    const res = await runPhysicalMigration(root)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/rolled back/)

    // every original entry is back, and code/ is gone → no half-state
    expect(fs.readdirSync(root).sort()).toEqual(before)
    expect(fs.existsSync(path.join(root, 'code'))).toBe(false)
    // the code repo still works at root (nothing stranded)
    expect(git(['rev-parse', '--show-toplevel'], root)).toBe(fs.realpathSync(root))
  })
})

describe.skipIf(!GIT)('physical migration — rollback honesty (T-378 QA regression)', () => {
  test('complex failure (forward fails AND rollback undo fails) → PARTIAL, never a false "rolled back"', async () => {
    const root = await makeNormalSplit()

    // Mirror the QA probe: call 2 = forward move of the 2nd entry FAILS (mid-move),
    // call 3 = the rollback's undo of the 1st entry ALSO FAILS. One entry is then
    // stranded under code/ with no honest signal — the bug under test.
    const real = fs.renameSync.bind(fs)
    let n = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
      n += 1
      if (n === 2) throw new Error('INJECTED forward failure (mid-move)')
      if (n === 3) throw new Error('INJECTED rollback failure (undo also fails)')
      return real(from, to)
    })

    const res = await runPhysicalMigration(root)
    expect(res.ok).toBe(false)
    // Honesty: it must NOT claim a clean rollback when the undo failed.
    expect(res.error).toMatch(/PARTIAL/i)
    expect(res.error).toMatch(/manual recovery/i)
    expect(res.error).not.toMatch(/rolled back/i)
    // It names the stranded entries (original → current).
    expect(res.strandedEntries && res.strandedEntries.length).toBeGreaterThan(0)
    expect(res.strandedEntries!.join(' ')).toMatch(/→/)

    // The half-state is REAL and acknowledged: code/ still holds the stranded entry
    // (we never falsely removed it).
    vi.restoreAllMocks()
    expect(fs.existsSync(path.join(root, 'code'))).toBe(true)
    expect(fs.readdirSync(path.join(root, 'code')).length).toBeGreaterThan(0)
  })

  test('plan detects a stranded half-migration (code/.git present, root none) → stranded-suspected, not no-git', async () => {
    const root = await makeNormalSplit()
    // Simulate the exact residue a failed+incomplete rollback leaves behind:
    // code/.git present, projectRoot has no .git, config records no code.dir.
    const codeDirPath = path.join(root, 'code')
    fs.mkdirSync(codeDirPath, { recursive: true })
    fs.renameSync(path.join(root, '.git'), path.join(codeDirPath, '.git'))
    expect(fs.existsSync(path.join(root, '.git'))).toBe(false)
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.prdt', 'config.json'), 'utf-8'))
    expect(cfg.code).toBeUndefined() // no code.dir recorded

    const plan = planPhysicalMigration(root)
    expect(plan.status).toBe('stranded-suspected')
    expect(plan.warnings.join(' ')).toMatch(/rollback was incomplete/i)
  })
})

describe.skipIf(!GIT)('physical migration — run (linked worktree)', () => {
  test('relocates the linked worktree + repairs the back-pointer so the code repo resolves', async () => {
    const { root, common } = await makeLinkedWorktreeSplit()
    const codeAtRoot = path.join(root, 'code')
    const filesBefore = git(['ls-files'], root).split('\n').sort()
    const countBefore = git(['rev-list', '--count', 'HEAD'], root)

    const res = await runPhysicalMigration(root)
    expect(res.ok).toBe(true)
    expect(res.gitShape).toBe('linked-worktree')

    // gitfile moved with the tree
    expect(fs.lstatSync(path.join(codeAtRoot, '.git')).isFile()).toBe(true)
    expect(fs.existsSync(path.join(codeAtRoot, 'packages', 'app.ts'))).toBe(true)

    // the code repo resolves to code/ and history is intact (no rename commit)
    expect(git(['rev-parse', '--show-toplevel'], codeAtRoot)).toBe(fs.realpathSync(codeAtRoot))
    expect(git(['ls-files'], codeAtRoot).split('\n').sort()).toEqual(filesBefore)
    expect(git(['rev-list', '--count', 'HEAD'], codeAtRoot)).toBe(countBefore)

    // the common repo's worktree registration now points at code/
    const list = git(['worktree', 'list'], common)
    expect(list).toContain(fs.realpathSync(codeAtRoot))
  })
})
