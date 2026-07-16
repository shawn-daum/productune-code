/**
 * meta-git.test.ts — T-364 meta-only git core module.
 *
 * Covers the two logic-bearing guarantees (test-first, doctrine #3):
 *  - allowlist scoping: the meta repo tracks ONLY the allowlist; code files
 *    never enter it; derived artifacts under an allowlisted dir are excluded;
 *    meta commits never touch the code repo's history/index.
 *  - commit lifecycle: one logical change = one commit; empty diff = skip;
 *    history/remote round-trips.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import {
  initMetaRepo,
  metaRepoExists,
  metaGitDir,
  commitMeta,
  scanMetaHistory,
  addMetaRemote,
  listMetaRemotes,
  pushMetaRemote,
  bootstrapMetaRepo,
  readMetaAllowlist,
  writeMetaAllowlist,
  DEFAULT_META_ALLOWLIST,
} from '../../src/git-workflow/meta-git'
import { runMetaMigration } from '../../src/git-workflow/meta-migrate'
import { naturalizeCommit } from '../../src/history/naturalize'
import { buildAutosaveMessage } from '../../src/git-workflow/autosave'

let projectDir: string

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function fileSha(fp: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
}

/** Set env keys for the duration of `fn`, restoring prior values after. */
async function withEnv(vars: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  try {
    await fn()
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

/** A prdt project = a code git repo with an initial code commit. */
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 'code@test'], root)
  git(['config', 'user.name', 'code'], root)
  // code file
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'packages', 'app.ts'), 'export const x = 1\n')
  // meta files (allowlisted) + a derived artifact + config.json
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, '.prdt', 'index.db'), 'DERIVED')
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  git(['add', 'packages/app.ts'], root)
  git(['commit', '-qm', 'code init'], root)
  return root
}

beforeEach(() => {
  projectDir = makeProject()
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

// ── init ──────────────────────────────────────────────────────────────────────

test('initMetaRepo creates a separate git-dir with the project root as work-tree', async () => {
  expect(metaRepoExists(projectDir)).toBe(false)
  const res = await initMetaRepo(projectDir)

  expect(res.initialized).toBe(true)
  expect(res.alreadyExisted).toBe(false)
  expect(res.gitDir).toBe(path.join(projectDir, '.prdt', 'meta.git'))
  expect(metaRepoExists(projectDir)).toBe(true)
  expect(fs.existsSync(path.join(metaGitDir(projectDir), 'HEAD'))).toBe(true)
})

test('initMetaRepo is idempotent — re-run reports alreadyExisted, no throw', async () => {
  await initMetaRepo(projectDir)
  const res = await initMetaRepo(projectDir)
  expect(res.initialized).toBe(true)
  expect(res.alreadyExisted).toBe(true)
})

// ── allowlist scoping ──────────────────────────────────────────────────────────

test('commit stages ONLY the allowlist — code files never enter the meta repo', async () => {
  await initMetaRepo(projectDir)
  const res = await commitMeta(projectDir, 'T-364 [manual: →] snapshot')
  expect(res.committed).toBe(true)

  const tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).toContain('.prdt/config.json')
  expect(tracked).toContain('docs/prd/PRD.md')
  // code file is NOT in the meta repo
  expect(tracked).not.toContain('packages/app.ts')
})

test('derived artifacts under an allowlisted dir are excluded from the meta repo', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] snapshot')

  const tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).not.toContain('.prdt/index.db')
  // the meta git-dir must not track itself
  expect(tracked.some((f) => f.startsWith('.prdt/meta.git'))).toBe(false)
})

test('meta commit never touches the code repo history or index', async () => {
  const codeLogBefore = git(['log', '--oneline']).split('\n').length
  const codeTrackedBefore = git(['ls-files'])

  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] snapshot')

  expect(git(['log', '--oneline']).split('\n').length).toBe(codeLogBefore)
  expect(git(['ls-files'])).toBe(codeTrackedBefore) // still just packages/app.ts
})

// ── commit lifecycle ────────────────────────────────────────────────────────────

test('one logical change = one commit', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] first')

  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# PRD v2\n')
  const second = await commitMeta(projectDir, 'T-365 [status-change: open→done] edit PRD')
  expect(second.committed).toBe(true)

  const count = git(['--git-dir', metaGitDir(projectDir), 'rev-list', '--count', 'HEAD'])
  expect(Number(count)).toBe(2)
})

test('empty diff = skip (diff-empty)', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] first')

  const again = await commitMeta(projectDir, 'T-364 [manual: →] no-op')
  expect(again.committed).toBe(false)
  expect(again.skipReason).toBe('diff-empty')
})

test('commit on an uninitialized meta repo skips with meta-repo-missing', async () => {
  const res = await commitMeta(projectDir, 'T-364 [manual: →] x')
  expect(res.committed).toBe(false)
  expect(res.skipReason).toBe('meta-repo-missing')
})

test('commit deletions are captured (allowlist -A)', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] first')

  fs.rmSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'))
  const res = await commitMeta(projectDir, 'T-364 [manual: →] remove PRD')
  expect(res.committed).toBe(true)

  const tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).not.toContain('docs/prd/PRD.md')
})

// ── history read ────────────────────────────────────────────────────────────────

test('scanMetaHistory returns the meta timeline, naturalize-parseable', async () => {
  await initMetaRepo(projectDir)
  const msg = buildAutosaveMessage('T-364', 'status-change', 'open', 'done', 'wire meta git')
  await commitMeta(projectDir, msg)

  const entries = await scanMetaHistory(projectDir)
  expect(entries.length).toBe(1)
  expect(entries[0].subject).toBe(msg)

  const nat = naturalizeCommit(entries[0].subject)
  expect(nat.ticketId).toBe('T-364')
  expect(nat.summary).toBe('wire meta git')
})

test('scanMetaHistory returns [] on an uninitialized repo', async () => {
  const entries = await scanMetaHistory(projectDir)
  expect(entries).toEqual([])
})

// ── remote (opt-in, no push) ─────────────────────────────────────────────────────

test('addMetaRemote records a remote without pushing; re-add updates url', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] snapshot')

  const add = await addMetaRemote(projectDir, 'backup', 'https://example.com/meta.git')
  expect(add.ok).toBe(true)

  let remotes = await listMetaRemotes(projectDir)
  expect(remotes).toContainEqual({ name: 'backup', url: 'https://example.com/meta.git' })

  // re-add with a new url → set-url (idempotent), still one remote
  const update = await addMetaRemote(projectDir, 'backup', 'https://example.com/meta2.git')
  expect(update.ok).toBe(true)
  remotes = await listMetaRemotes(projectDir)
  expect(remotes).toEqual([{ name: 'backup', url: 'https://example.com/meta2.git' }])

  // no push happened — no remote-tracking refs exist
  const refs = git(['--git-dir', metaGitDir(projectDir), 'for-each-ref', 'refs/remotes'])
  expect(refs).toBe('')
})

// ── push (explicit backup) ────────────────────────────────────────────────────

/** A bare git repo usable as a backup/origin remote. Cleaned up per-test. */
const bareRepos: string[] = []
function makeBareRemote(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-bare-'))
  execFileSync('git', ['init', '--bare', '-q', dir])
  bareRepos.push(dir)
  return dir
}
afterEach(() => {
  for (const d of bareRepos.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

test('pushMetaRemote refuses when the remote is not configured', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-374 [manual: →] snapshot')
  const res = await pushMetaRemote(projectDir, 'backup')
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/not configured/)
})

test('pushMetaRemote refuses when there are no commits yet', async () => {
  await initMetaRepo(projectDir)
  await addMetaRemote(projectDir, 'backup', makeBareRemote())
  const res = await pushMetaRemote(projectDir, 'backup')
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/no commits/)
})

test('pushMetaRemote sends the meta branch to the backup; no --force', async () => {
  const backup = makeBareRemote()
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-374 [manual: →] snapshot')
  await addMetaRemote(projectDir, 'backup', backup)

  const res = await pushMetaRemote(projectDir, 'backup')
  expect(res.ok).toBe(true)
  expect(res.branch).toBeTruthy()

  // the backup now carries the meta history
  const remoteHead = git(['--git-dir', backup, 'rev-parse', `refs/heads/${res.branch}`])
  const localHead = git(['--git-dir', metaGitDir(projectDir), 'rev-parse', 'HEAD'])
  expect(remoteHead).toBe(localHead)
})

// ── bootstrap (second machine) ──────────────────────────────────────────────────

test('two-machine cycle: A splits + pushes → B (split-pulled, meta gone) bootstraps from backup', async () => {
  const backup = makeBareRemote()
  const origin = makeBareRemote()
  const A = projectDir

  // Machine A: mixed repo — track the meta files in the CODE repo, then push.
  git(['add', '.prdt/config.json', 'docs/prd/PRD.md'], A)
  git(['commit', '-qm', 'meta tracked'], A)
  const branch = git(['symbolic-ref', '--short', 'HEAD'], A)
  git(['remote', 'add', 'origin', origin], A)
  git(['push', '-q', 'origin', branch], A)

  // A runs the split migration (meta rm --cached from code, meta.git created).
  const mig = await runMetaMigration(A)
  expect(mig.ok).toBe(true)
  git(['push', '-q', 'origin', branch], A) // publish the untrack commit

  // A backs the meta history up to the shared backup remote (explicit push).
  expect((await addMetaRemote(A, 'backup', backup)).ok).toBe(true)
  expect((await pushMetaRemote(A, 'backup')).ok).toBe(true)

  // Machine B: clone the already-split CODE repo — the meta files are untracked
  // there, so B's work-tree never receives them (exactly the pull-deletes-meta
  // end state) and B has no meta.git.
  const B = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-B-'))
  bareRepos.push(B) // reuse cleanup list
  git(['clone', '-q', origin, B])
  expect(fs.existsSync(path.join(B, 'docs', 'prd', 'PRD.md'))).toBe(false)
  expect(metaRepoExists(B)).toBe(false)

  // B bootstraps from the backup remote.
  const boot = await bootstrapMetaRepo(B, backup, 'backup')
  expect(boot.ok).toBe(true)
  expect(boot.conflicts).toEqual([])
  expect(boot.restoredCount).toBeGreaterThan(0)

  // meta files are restored into B's work-tree with the backed-up content
  expect(fs.existsSync(path.join(B, 'docs', 'prd', 'PRD.md'))).toBe(true)
  expect(fs.readFileSync(path.join(B, 'docs', 'prd', 'PRD.md'), 'utf-8')).toBe('# PRD\n')

  // B's meta.git history matches the backup, and tracks only meta
  expect(boot.headSha).toBe(git(['--git-dir', backup, 'rev-parse', `refs/heads/${boot.branch}`]))
  const bTracked = git(['--git-dir', metaGitDir(B), 'ls-files'], B).split('\n')
  expect(bTracked).toContain('docs/prd/PRD.md')
  expect(bTracked.some((f) => f.startsWith('.prdt/meta.git'))).toBe(false)

  // hardening carried over (T-364/365/366): repo-local identity + neutralized globals
  const cfg = git(['--git-dir', metaGitDir(B), 'config', '--list'])
  expect(cfg).toMatch(/user\.name=prdt/)
  expect(cfg).toMatch(/commit\.gpgsign=false/)
  expect(cfg).toMatch(/core\.worktree=/)

  fs.rmSync(B, { recursive: true, force: true })
})

test('bootstrap refuses to clobber an existing local meta.git', async () => {
  const backup = makeBareRemote()
  await initMetaRepo(projectDir)
  const res = await bootstrapMetaRepo(projectDir, backup, 'backup')
  expect(res.ok).toBe(false)
  expect(res.refusal).toBe('meta-repo-exists')
})

test('bootstrap rolls back and refuses on an unreachable backup remote', async () => {
  const bogus = path.join(os.tmpdir(), 'core-meta-nope-' + crypto.randomUUID())
  const res = await bootstrapMetaRepo(projectDir, bogus, 'backup')
  expect(res.ok).toBe(false)
  expect(res.refusal).toBe('fetch-failed')
  // the freshly-created git-dir is rolled back so a corrected re-run is clean
  expect(metaRepoExists(projectDir)).toBe(false)
})

test('bootstrap on a not-yet-pulled machine leaves a differing local file UNTOUCHED', async () => {
  // Build a backup carrying PRD.md = "# PRD\n" (from a donor project A).
  const backup = makeBareRemote()
  const A = projectDir
  await initMetaRepo(A)
  await commitMeta(A, 'T-374 [manual: →] snapshot')
  await addMetaRemote(A, 'backup', backup)
  await pushMetaRemote(A, 'backup')

  // Machine B: a separate project that has NOT pulled the split — a local meta
  // file exists on disk and DIFFERS from the backup history.
  const B = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-B2-'))
  bareRepos.push(B)
  execFileSync('git', ['init', '-q', B])
  fs.mkdirSync(path.join(B, 'docs', 'prd'), { recursive: true })
  const localBody = '# PRD — LOCAL UNPULLED EDIT\n'
  fs.writeFileSync(path.join(B, 'docs', 'prd', 'PRD.md'), localBody)
  fs.mkdirSync(path.join(B, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(B, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))

  const boot = await bootstrapMetaRepo(B, backup, 'backup')

  // meta.git IS created (non-destructive), but the differing file is a conflict
  expect(metaRepoExists(B)).toBe(true)
  expect(boot.ok).toBe(false)
  expect(boot.conflicts).toContain('docs/prd/PRD.md')
  expect(boot.error).toMatch(/differ/)
  // the local file was NOT overwritten
  expect(fs.readFileSync(path.join(B, 'docs', 'prd', 'PRD.md'), 'utf-8')).toBe(localBody)

  fs.rmSync(B, { recursive: true, force: true })
})

// ── allowlist config ──────────────────────────────────────────────────────────

test('readMetaAllowlist falls back to the default when unset', () => {
  expect(readMetaAllowlist(projectDir)).toEqual(DEFAULT_META_ALLOWLIST)
})

test('writeMetaAllowlist persists into config.json and preserves other fields', () => {
  const custom = [...DEFAULT_META_ALLOWLIST, 'docs/backlog.md']
  writeMetaAllowlist(projectDir, custom)

  expect(readMetaAllowlist(projectDir)).toEqual(custom)
  // slug (written by makeProject) is preserved
  const cfg = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'config.json'), 'utf-8'))
  expect(cfg.slug).toBe('proj')
  expect(cfg.meta.allowlist).toEqual(custom)
})

test('a custom allowlist entry is respected by commit', async () => {
  fs.writeFileSync(path.join(projectDir, 'docs', 'looseNote.md'), 'note\n')
  writeMetaAllowlist(projectDir, [...DEFAULT_META_ALLOWLIST, 'docs/looseNote.md'])

  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] snapshot')

  const tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).toContain('docs/looseNote.md')
})

// ── env isolation (QA-HIGH regression) ────────────────────────────────────────

test('leaked GIT_* env (hook context) never corrupts the code repo', async () => {
  await initMetaRepo(projectDir)
  await commitMeta(projectDir, 'T-364 [manual: →] base')

  const codeIndex = path.join(projectDir, '.git', 'index')
  const idxBefore = fileSha(codeIndex)
  const metaHeadBefore = git(['--git-dir', metaGitDir(projectDir), 'rev-parse', 'HEAD'])

  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# env-poisoned edit\n')

  // Simulate running inside a code-repo git hook / lint-staged: GIT_* point at
  // the CODE repo. metaGit must scrub these or it stages into .git/index.
  let res: any
  await withEnv(
    {
      GIT_DIR: path.join(projectDir, '.git'),
      GIT_WORK_TREE: projectDir,
      GIT_INDEX_FILE: codeIndex,
    },
    async () => {
      res = await commitMeta(projectDir, 'T-364 [status-change: →] under leaked env')
    },
  )

  expect(res.committed).toBe(true) // meta commit lands
  expect(fileSha(codeIndex)).toBe(idxBefore) // code index byte-identical
  expect(git(['diff', '--cached', '--name-only'])).toBe('') // nothing staged in code repo
  expect(git(['--git-dir', metaGitDir(projectDir), 'rev-parse', 'HEAD'])).not.toBe(metaHeadBefore)
})

// ── global gitconfig neutralization (QA-MED regression) ───────────────────────

test('global gpgsign/hooksPath neither break nor hijack meta commits', async () => {
  // A fake user "global" config with signing + a custom hooks dir.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-home-'))
  const hookDir = path.join(home, 'hooks')
  fs.mkdirSync(hookDir, { recursive: true })
  const marker = path.join(home, 'hook-ran.marker')
  fs.writeFileSync(path.join(hookDir, 'pre-commit'), `#!/bin/sh\ntouch "${marker}"\nexit 0\n`, { mode: 0o755 })
  fs.writeFileSync(
    path.join(home, '.gitconfig'),
    `[commit]\n\tgpgsign = true\n[core]\n\thooksPath = ${hookDir}\n`,
  )

  let res: any
  let markerRan = true
  // HOME (+ empty XDG) make git read only our fake global config. HOME is NOT a
  // GIT_* var, so scrubbedGitEnv preserves it — this proves the repo-local
  // overrides (written by initMetaRepo) win over global, not that global is
  // bypassed.
  await withEnv({ HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }, async () => {
    await initMetaRepo(projectDir) // writes repo-local commit.gpgsign=false + core.hooksPath
    fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# gpg\n')
    res = await commitMeta(projectDir, 'T-364 [manual: →] under global gpgsign')
    markerRan = fs.existsSync(marker)
  })

  fs.rmSync(home, { recursive: true, force: true })

  expect(res.committed).toBe(true) // gpgsign=true did not silently break the commit
  expect(markerRan).toBe(false) // user's global hook did NOT run on the meta commit
})
