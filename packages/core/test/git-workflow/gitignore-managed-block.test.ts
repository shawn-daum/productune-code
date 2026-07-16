/**
 * gitignore-managed-block.test.ts — T-365 code-repo `.gitignore` managed block
 * (PRD §v1.2 경계 결정 3).
 *
 * Logic-bearing guarantees (test-first, doctrine #3):
 *  - inject: a fresh sync writes the marker-wrapped block from the meta
 *    allowlist; user-authored lines outside the markers are byte-untouched.
 *  - idempotent: re-sync with an unchanged allowlist writes nothing;
 *    an allowlist change rewrites ONLY the inside of the markers.
 *  - safety: malformed markers (one marker missing / reversed) → no-op skip,
 *    never a destructive rewrite.
 *  - effect: the code repo actually ignores the meta allowlist, the meta
 *    git-dir, and derived artifacts (`git check-ignore`).
 *  - turn resync: commitMeta (the meta turn beat, 경계 결정 2) resyncs the
 *    block after an allowlist edit.
 *  - parity: the python CLI (`scripts/prdt`) carries byte-identical marker /
 *    allowlist / exclude literals (fresh init and TS resync must agree).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import {
  MANAGED_BLOCK_START,
  MANAGED_BLOCK_END,
  renderManagedBlock,
  syncGitignoreManagedBlock,
} from '../../src/git-workflow/gitignore-managed-block'
import {
  initMetaRepo,
  commitMeta,
  metaGitDir,
  readMetaAllowlist,
  writeMetaAllowlist,
  DEFAULT_META_ALLOWLIST,
  DEFAULT_META_EXCLUDE,
} from '../../src/git-workflow/meta-git'

let projectDir: string

function git(args: string[], cwd = projectDir): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** A prdt project = a code git repo + `.prdt/config.json`. */
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-gitignore-block-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 'code@test'], root)
  git(['config', 'user.name', 'code'], root)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  return root
}

function gitignorePath(): string {
  return path.join(projectDir, '.gitignore')
}

function sync(allowlist = readMetaAllowlist(projectDir)) {
  return syncGitignoreManagedBlock(projectDir, allowlist)
}

beforeEach(() => {
  projectDir = makeProject()
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

// ── inject ────────────────────────────────────────────────────────────────────

test('missing .gitignore → sync creates it with only the managed block', () => {
  const res = sync()
  expect(res.changed).toBe(true)

  const content = fs.readFileSync(gitignorePath(), 'utf-8')
  expect(content).toBe(renderManagedBlock(DEFAULT_META_ALLOWLIST) + '\n')
  expect(content.startsWith(MANAGED_BLOCK_START + '\n')).toBe(true)
  expect(content.trimEnd().endsWith(MANAGED_BLOCK_END)).toBe(true)
})

test('existing user lines are byte-untouched; block is appended after them', () => {
  const userContent = 'node_modules/\n# my comment\ndist/\n'
  fs.writeFileSync(gitignorePath(), userContent)

  const res = sync()
  expect(res.changed).toBe(true)

  const content = fs.readFileSync(gitignorePath(), 'utf-8')
  expect(content.startsWith(userContent)).toBe(true)
  expect(content).toBe(userContent + renderManagedBlock(DEFAULT_META_ALLOWLIST) + '\n')
})

test('user file without trailing newline still keeps its lines intact', () => {
  fs.writeFileSync(gitignorePath(), 'node_modules/')
  sync()
  const content = fs.readFileSync(gitignorePath(), 'utf-8')
  expect(content.startsWith('node_modules/\n' + MANAGED_BLOCK_START)).toBe(true)
})

test('allowlist entries are root-anchored patterns', () => {
  sync()
  const lines = fs.readFileSync(gitignorePath(), 'utf-8').split('\n')
  for (const entry of DEFAULT_META_ALLOWLIST) {
    expect(lines).toContain('/' + entry)
  }
})

// ── idempotent rewrite ─────────────────────────────────────────────────────────

test('re-sync with an unchanged allowlist is a no-op (byte-identical, changed:false)', () => {
  sync()
  const before = fs.readFileSync(gitignorePath(), 'utf-8')
  const res = sync()
  expect(res.changed).toBe(false)
  expect(fs.readFileSync(gitignorePath(), 'utf-8')).toBe(before)
})

test('allowlist change rewrites ONLY the inside of the markers', () => {
  const head = '# user head\nnode_modules/\n'
  fs.writeFileSync(gitignorePath(), head)
  sync()
  // user appends lines AFTER the block too
  fs.appendFileSync(gitignorePath(), 'tail-user-line/\n')

  writeMetaAllowlist(projectDir, [...DEFAULT_META_ALLOWLIST, 'docs/backlog.md'])
  const res = sync()
  expect(res.changed).toBe(true)

  const content = fs.readFileSync(gitignorePath(), 'utf-8')
  expect(content.startsWith(head)).toBe(true)
  expect(content.endsWith('tail-user-line/\n')).toBe(true)
  expect(content).toContain('/docs/backlog.md')
  // exactly one block
  expect(content.split(MANAGED_BLOCK_START).length).toBe(2)
  expect(content.split(MANAGED_BLOCK_END).length).toBe(2)
})

test('entries removed from the allowlist disappear from the block', () => {
  sync()
  writeMetaAllowlist(projectDir, ['.prdt', 'docs/prd'])
  sync()
  const lines = fs.readFileSync(gitignorePath(), 'utf-8').split('\n')
  expect(lines).toContain('/.prdt')
  expect(lines).toContain('/docs/prd')
  expect(lines).not.toContain('/docs/tickets')
})

// ── malformed markers → no-op ─────────────────────────────────────────────────

test('start marker without end marker → skip, file untouched', () => {
  const broken = `keep-me/\n${MANAGED_BLOCK_START}\n/half\n`
  fs.writeFileSync(gitignorePath(), broken)
  const res = sync()
  expect(res.changed).toBe(false)
  expect(res.skipped).toBe('malformed-markers')
  expect(fs.readFileSync(gitignorePath(), 'utf-8')).toBe(broken)
})

test('end marker before start marker → skip, file untouched', () => {
  const broken = `${MANAGED_BLOCK_END}\nuser/\n${MANAGED_BLOCK_START}\n`
  fs.writeFileSync(gitignorePath(), broken)
  const res = sync()
  expect(res.changed).toBe(false)
  expect(res.skipped).toBe('malformed-markers')
  expect(fs.readFileSync(gitignorePath(), 'utf-8')).toBe(broken)
})

// ── effect: code repo ignores meta + git-dir + derived ────────────────────────

test('code repo ignores allowlist paths, the meta git-dir, and derived files', async () => {
  await initMetaRepo(projectDir)
  sync()
  fs.writeFileSync(path.join(projectDir, '.prdt', 'index.db'), 'DERIVED')

  // git check-ignore exits 0 when the path IS ignored.
  const ignored = (p: string): boolean => {
    try {
      execFileSync('git', ['check-ignore', '-q', p], { cwd: projectDir })
      return true
    } catch {
      return false
    }
  }
  expect(ignored('docs/prd/PRD.md')).toBe(true)
  expect(ignored('.prdt/meta.git/HEAD')).toBe(true)
  expect(ignored('.prdt/index.db')).toBe(true)
  expect(ignored('packages/app.ts')).toBe(false) // code stays tracked-able
})

test('meta repo ignores its own git-dir and derived files (info/exclude)', async () => {
  await initMetaRepo(projectDir)
  fs.writeFileSync(path.join(projectDir, '.prdt', 'index.db'), 'DERIVED')

  const metaIgnored = (p: string): boolean => {
    try {
      execFileSync(
        'git',
        ['--git-dir', metaGitDir(projectDir), '--work-tree', projectDir, 'check-ignore', '-q', p],
        { cwd: projectDir },
      )
      return true
    } catch {
      return false
    }
  }
  expect(metaIgnored('.prdt/meta.git/HEAD')).toBe(true)
  expect(metaIgnored('.prdt/index.db')).toBe(true)
  expect(metaIgnored('.prdt/config.json')).toBe(false) // real meta stays trackable
})

// ── turn resync via commitMeta (경계 결정 2 beat) ─────────────────────────────

test('commitMeta resyncs the managed block after an allowlist edit', async () => {
  await initMetaRepo(projectDir)
  sync()

  fs.writeFileSync(path.join(projectDir, 'docs', 'backlog.md'), '# backlog\n')
  writeMetaAllowlist(projectDir, [...DEFAULT_META_ALLOWLIST, 'docs/backlog.md'])

  const res = await commitMeta(projectDir, 'T-365 [manual: →] allowlist edit')
  expect(res.committed).toBe(true)

  const content = fs.readFileSync(gitignorePath(), 'utf-8')
  expect(content).toContain('/docs/backlog.md')
})

// ── T-365 regression: meta staging must be immune to the managed block ────────
// The meta repo shares the work-tree, so once the block ignores all meta paths a
// plain `git add -- <allowlist>` refuses them wholesale ("paths are ignored by
// one of your .gitignore files"). Full add/edit/delete lifecycle under an
// active block:

test('meta add/edit/delete cycles all commit while the managed block is active', async () => {
  await initMetaRepo(projectDir)
  sync()

  // add
  const first = await commitMeta(projectDir, 'T-365 [manual: →] first snapshot')
  expect(first.committed).toBe(true)
  let tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).toContain('.prdt/config.json')
  expect(tracked).toContain('docs/prd/PRD.md')

  // edit + new file
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# PRD v2\n')
  fs.mkdirSync(path.join(projectDir, 'docs', 'tickets'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'docs', 'tickets', 'T-1.md'), '# t\n')
  const second = await commitMeta(projectDir, 'T-365 [manual: →] edit + new ticket')
  expect(second.committed).toBe(true)

  // delete
  fs.rmSync(path.join(projectDir, 'docs', 'tickets', 'T-1.md'))
  const third = await commitMeta(projectDir, 'T-365 [manual: →] delete ticket')
  expect(third.committed).toBe(true)
  tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).not.toContain('docs/tickets/T-1.md')

  // derived artifacts still never enter the meta repo (add -f honors info/exclude via ls-files)
  fs.writeFileSync(path.join(projectDir, '.prdt', 'index.db'), 'DERIVED')
  await commitMeta(projectDir, 'T-365 [manual: →] derived noise')
  tracked = git(['--git-dir', metaGitDir(projectDir), 'ls-files']).split('\n')
  expect(tracked).not.toContain('.prdt/index.db')

  // and the code repo saw none of it
  expect(git(['status', '--porcelain']).split('\n').filter((l) => l && !l.includes('.gitignore'))).toEqual([])
})

// ── python CLI parity guard ────────────────────────────────────────────────────

test('scripts/prdt carries byte-identical markers + allowlist + exclude literals', () => {
  // Execute the python CLI's own constants/renderer (not a regex scrape) and
  // pin them to the TS module — a drift on either side fails here.
  const cliPath = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
  const py = [
    `g = {"__name__": "prdt_parity_probe"}`,
    `exec(open(${JSON.stringify(cliPath)}).read(), g)`,
    `import json`,
    `print(json.dumps({`,
    `  "block": g["render_managed_block"](g["META_ALLOWLIST_DEFAULT"]),`,
    `  "allowlist": g["META_ALLOWLIST_DEFAULT"],`,
    `  "exclude": g["META_EXCLUDE_DEFAULT"],`,
    `}))`,
  ].join('\n')
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf-8' })
  const parsed = JSON.parse(out)

  expect(parsed.allowlist).toEqual(DEFAULT_META_ALLOWLIST)
  expect(parsed.exclude).toEqual(DEFAULT_META_EXCLUDE)
  expect(parsed.block).toBe(renderManagedBlock(DEFAULT_META_ALLOWLIST))
})
