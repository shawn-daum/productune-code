/**
 * meta-exclude-symlink.test.ts — T-847: the meta autosave tick never writes
 * `info/exclude` through a symlink.
 *
 * A repository can commit `.prdt/meta.git/info/exclude` (or any directory above
 * it) as a symlink pointing at a file of the user's. `ensureMetaExclude` runs on
 * every tick (prdt-post-dispatch.sh → meta-cli tick → commitMeta), so following
 * the link would overwrite that file. Each case plants a link, runs the tick and
 * asserts the victim keeps its bytes and mtime and the tick does not throw.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { initMetaRepo, metaGitDir } from '../../src/git-workflow/meta-git'
import { metaAutosaveTick } from '../../src/git-workflow/meta-autosave'

let projectDir: string
let outside: string

const VICTIM_BYTES = 'precious\n'
const PAST = new Date('2020-01-02T03:04:05Z')

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-excl-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 'code@test'], root)
  git(['config', 'user.name', 'code'], root)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  fs.writeFileSync(path.join(root, 'app.ts'), 'export const x = 1\n')
  git(['add', 'app.ts'], root)
  git(['commit', '-qm', 'code init'], root)
  return root
}

function makeVictim(fp: string): void {
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  fs.writeFileSync(fp, VICTIM_BYTES)
  fs.utimesSync(fp, PAST, PAST)
}

function expectVictimUntouched(fp: string): void {
  expect(fs.readFileSync(fp, 'utf-8')).toBe(VICTIM_BYTES)
  expect(fs.statSync(fp).mtimeMs).toBe(PAST.getTime())
}

beforeEach(async () => {
  projectDir = makeProject()
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'core-meta-victim-'))
  await initMetaRepo(projectDir)
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

const excludePath = () => path.join(metaGitDir(projectDir), 'info', 'exclude')

test('T-847 QA repro: exclude symlinked to a victim → the tick leaves the victim unchanged', async () => {
  const victim = path.join(outside, 'my-file')
  makeVictim(victim)
  fs.rmSync(excludePath())
  fs.symlinkSync(victim, excludePath())

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()

  expectVictimUntouched(victim)
  expect(fs.lstatSync(excludePath()).isSymbolicLink()).toBe(true)
})

test('T-847: a chain of symlinks at exclude is refused too', async () => {
  const victim = path.join(outside, 'my-file')
  makeVictim(victim)
  const hop = path.join(outside, 'hop')
  fs.symlinkSync(victim, hop)
  fs.rmSync(excludePath())
  fs.symlinkSync(hop, excludePath())

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expectVictimUntouched(victim)
})

test('T-847: a dangling exclude symlink creates nothing at its target', async () => {
  const target = path.join(outside, 'not-yet')
  fs.rmSync(excludePath())
  fs.symlinkSync(target, excludePath())

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expect(fs.existsSync(target)).toBe(false)
  expect(fs.lstatSync(excludePath()).isSymbolicLink()).toBe(true)
})

test('T-847: a symlinked info/ dir is refused', async () => {
  const victim = path.join(outside, 'exclude')
  makeVictim(victim)
  const info = path.join(metaGitDir(projectDir), 'info')
  fs.rmSync(info, { recursive: true, force: true })
  fs.symlinkSync(outside, info)

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expectVictimUntouched(victim)
  expect(fs.readdirSync(outside)).toEqual(['exclude'])
})

test('T-847: a symlinked meta.git dir is refused', async () => {
  // Move the real repo outside and link it back: the git-dir still works, but
  // its info/exclude lies outside the project.
  const real = path.join(outside, 'meta.git')
  fs.renameSync(metaGitDir(projectDir), real)
  fs.symlinkSync(real, metaGitDir(projectDir))
  const victim = path.join(real, 'info', 'exclude')
  makeVictim(victim)

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expectVictimUntouched(victim)
})

test('T-847: a symlinked .prdt dir is refused', async () => {
  const real = path.join(outside, 'state')
  fs.renameSync(path.join(projectDir, '.prdt'), real)
  fs.symlinkSync(real, path.join(projectDir, '.prdt'))
  const victim = path.join(real, 'meta.git', 'info', 'exclude')
  makeVictim(victim)

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expectVictimUntouched(victim)
})

test('T-847: a hard-linked exclude (st_nlink > 1) is refused', async () => {
  const victim = path.join(outside, 'my-file')
  makeVictim(victim)
  fs.rmSync(excludePath())
  try {
    fs.linkSync(victim, excludePath())
  } catch {
    return // cross-device tmp dirs — a hard link cannot be planted here
  }
  fs.utimesSync(victim, PAST, PAST)

  await expect(metaAutosaveTick(projectDir)).resolves.toBeDefined()
  expectVictimUntouched(victim)
})

test('T-847: a normal stale exclude file is still rewritten as a regular file', async () => {
  fs.writeFileSync(excludePath(), 'stale\n')

  await metaAutosaveTick(projectDir)

  const st = fs.lstatSync(excludePath())
  expect(st.isFile()).toBe(true)
  expect(st.nlink).toBe(1)
  const lines = fs.readFileSync(excludePath(), 'utf-8').split('\n')
  expect(lines).toContain('.prdt/worktrees/')
  expect(lines).not.toContain('stale')
  // no temp file left beside it
  expect(fs.readdirSync(path.dirname(excludePath()))).toEqual(['exclude'])
})

test('T-847: a missing info/ dir is recreated and exclude written', async () => {
  fs.rmSync(path.join(metaGitDir(projectDir), 'info'), { recursive: true, force: true })

  await metaAutosaveTick(projectDir)

  expect(fs.lstatSync(excludePath()).isFile()).toBe(true)
  expect(fs.readFileSync(excludePath(), 'utf-8').split('\n')).toContain('.prdt/worktrees/')
})
