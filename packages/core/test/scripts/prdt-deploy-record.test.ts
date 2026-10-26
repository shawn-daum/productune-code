/**
 * prdt-deploy-record.test.ts — T-1250: `prdt deploy record [<product>]` is the only writer of
 * `deployed: {version, at, ref}` in `docs/<product>/DEPLOY.md` frontmatter; it rewrites that
 * one line and leaves every other byte alone.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
const T = 120_000

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}
function put(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}
function cli(root: string, home: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' },
  })
  return { out: r.stdout, err: r.stderr, code: r.status }
}
function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  expect(r.status).toBe(0)
  return r.stdout.trim()
}

const BODY = '\n# Deploy\n\n- body line with deployed: inside prose\n'
const FM = (extra: string) => `---\nname: home\ntarget: github\n${extra}url: https://example.test/x\n---\n`

/** A product-layout project (docs/_shared/ + docs/home/), a git repo on `main` at the root. */
function project(opts: { deploy?: string | null; version?: string; git?: boolean } = {}) {
  const root = path.join(tmp('prdt-t1250-'), 'proj')
  put(root, '.prdt/config.json', JSON.stringify({ slug: 'home', surfaces: {} }) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: opts.version ?? 'v1.2', current_task: null }) + '\n')
  put(root, 'docs/_shared/.keep', '')
  put(root, 'docs/home/prd/PRD.md', '# PRD\n')
  if (opts.deploy !== null) put(root, 'docs/home/DEPLOY.md', opts.deploy ?? FM('') + BODY)
  let sha = ''
  if (opts.git !== false) {
    git(root, ['init', '-q', '-b', 'main'])
    put(root, 'f.txt', 'x')
    git(root, ['add', 'f.txt'])
    git(root, ['commit', '-q', '-m', 'init'])
    sha = git(root, ['rev-parse', '--short', 'HEAD'])
  }
  return { root, home: tmp('prdt-t1250-home-'), sha, file: path.join(root, 'docs/home/DEPLOY.md') }
}
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

describe('prdt deploy record', () => {
  test('no line yet: adds exactly one line before the closing fence; defaults = po-state version, today KST, main short hash', () => {
    const p = project()
    const before = fs.readFileSync(p.file, 'utf8')
    const r = cli(p.root, p.home, ['deploy', 'record'])
    expect(r.code).toBe(0)
    const line = `deployed: {version: v1.2, at: ${today()}, ref: ${p.sha}}\n`
    expect(fs.readFileSync(p.file, 'utf8')).toBe(before.replace('---\n\n# Deploy', line + '---\n\n# Deploy'))
    expect(r.out.trim()).toBe(`deployed: (없음) → v1.2 · ${today()} · ${p.sha} (docs/home/DEPLOY.md)`)
  }, T)

  test('ref defaults to the tag named like the version when it exists', () => {
    const p = project()
    git(p.root, ['tag', 'v1.2'])
    put(p.root, 'g.txt', 'y'); git(p.root, ['add', 'g.txt']); git(p.root, ['commit', '-q', '-m', 'two'])
    expect(cli(p.root, p.home, ['deploy', 'record', 'home']).code).toBe(0)
    expect(fs.readFileSync(p.file, 'utf8')).toContain(`deployed: {version: v1.2, at: ${today()}, ref: v1.2}\n`)
  }, T)

  test('replaces an existing line in place (the ntf-pm shape), every other byte unchanged', () => {
    const p = project({ deploy: FM('deployed: {version: v1.1, at: 2026-09-07, ref: 921da1d}\n') + BODY })
    const before = fs.readFileSync(p.file, 'utf8')
    const r = cli(p.root, p.home, ['deploy', 'record', '--version', 'v1.14', '--at', '2026-10-23', '--ref', 'v1.14'])
    expect(r.code).toBe(0)
    expect(fs.readFileSync(p.file, 'utf8')).toBe(
      before.replace('deployed: {version: v1.1, at: 2026-09-07, ref: 921da1d}', 'deployed: {version: v1.14, at: 2026-10-23, ref: v1.14}'))
    expect(r.out.trim()).toBe('deployed: v1.1 · 2026-09-07 · 921da1d → v1.14 · 2026-10-23 · v1.14 (docs/home/DEPLOY.md)')
  }, T)

  test('CRLF file: the written line carries the file own line ending, the rest stays', () => {
    const crlf = (FM('') + BODY).replace(/\n/g, '\r\n')
    const p = project({ deploy: crlf })
    expect(cli(p.root, p.home, ['deploy', 'record', '--ref', 'abc1234']).code).toBe(0)
    expect(fs.readFileSync(p.file, 'utf8')).toBe(
      crlf.replace('---\r\n\r\n# Deploy', `deployed: {version: v1.2, at: ${today()}, ref: abc1234}\r\n---\r\n\r\n# Deploy`))
  }, T)

  test('--version / --at / --ref override the defaults; no git repo needed when --ref is given', () => {
    const p = project({ git: false })
    expect(cli(p.root, p.home, ['deploy', 'record', '--version', 'v1.14', '--at', '2026-10-23', '--ref', 'v1.14']).code).toBe(0)
    expect(fs.readFileSync(p.file, 'utf8')).toContain('deployed: {version: v1.14, at: 2026-10-23, ref: v1.14}\n')
  }, T)

  test('refuses (≠0, file untouched) when DEPLOY.md is missing, naming the path', () => {
    const p = project({ deploy: null })
    const r = cli(p.root, p.home, ['deploy', 'record', '--ref', 'abc'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('docs/home/DEPLOY.md does not exist')
    expect(fs.existsSync(p.file)).toBe(false)
  }, T)

  test.each([
    [['--version', 'banana'], 'is not a version id'],
    [['--version', 'backlog'], 'is not a version id'],
    [['--at', '2026-13-40'], 'is not a date'],
    [['--at', '10/23/2026'], 'is not a date'],
    [['--ref', 'a, b}'], 'is not a tag or commit name'],
  ])('refuses %j, writes nothing', (flags, msg) => {
    const p = project()
    const before = fs.readFileSync(p.file, 'utf8')
    const r = cli(p.root, p.home, ['deploy', 'record', '--ref', 'abc1234', ...flags])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain(msg)
    expect(fs.readFileSync(p.file, 'utf8')).toBe(before)
  }, T)

  test('refuses an unknown product and a file without frontmatter', () => {
    const p = project({ deploy: '# no frontmatter\n' })
    expect(cli(p.root, p.home, ['deploy', 'record', 'nope', '--ref', 'abc']).code).not.toBe(0)
    const r = cli(p.root, p.home, ['deploy', 'record', '--ref', 'abc'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('no frontmatter')
    expect(fs.readFileSync(p.file, 'utf8')).toBe('# no frontmatter\n')
  }, T)

  test('an added product reads its own po-state version and its own DEPLOY.md', () => {
    const p = project()
    put(p.root, '.prdt/config.json', JSON.stringify({ slug: 'home', surfaces: {}, products: [{ name: 'arc' }] }) + '\n')
    put(p.root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.2', current_task: null,
      products: { arc: { stage: 'build', version: 'v3' } } }) + '\n')
    put(p.root, 'docs/arc/prd/PRD.md', '# PRD\n')
    put(p.root, 'docs/arc/DEPLOY.md', FM('') + BODY)
    const home0 = fs.readFileSync(p.file, 'utf8')
    const ra = cli(p.root, p.home, ['deploy', 'record', 'arc', '--ref', 'abc'])
    expect(ra.err).toBe('')
    expect(ra.code).toBe(0)
    expect(fs.readFileSync(path.join(p.root, 'docs/arc/DEPLOY.md'), 'utf8')).toContain(`deployed: {version: v3, at: ${today()}, ref: abc}\n`)
    expect(fs.readFileSync(p.file, 'utf8')).toBe(home0)
  }, T)
})
