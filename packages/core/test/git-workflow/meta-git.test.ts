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
  readMetaAllowlist,
  writeMetaAllowlist,
  DEFAULT_META_ALLOWLIST,
} from '../../src/git-workflow/meta-git'
import { naturalizeCommit } from '../../src/history/naturalize'
import { buildAutosaveMessage } from '../../src/git-workflow/autosave'

let projectDir: string

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
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
