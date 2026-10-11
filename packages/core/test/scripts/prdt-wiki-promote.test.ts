/**
 * prdt-wiki-promote.test.ts — T-477, black-box over the real `prdt` CLI in a
 * sandbox (PRDT_HOME + HOME redirected; the real machine wiki is never touched).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'prdt')
let sandbox: string, proj: string, other: string, home: string, env: NodeJS.ProcessEnv

function run(cwd: string, args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli') })
    return { out, code: 0 }
  } catch (e: any) {
    if (typeof e.status !== 'number') throw e
    return { out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status }
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf-8')
const mach = (n: string) => path.join(home, '.prdt', 'wiki', `${n}.md`)
const pw = (n: string) => path.join(proj, 'docs', 'wiki', `${n}.md`)

const PAGE = '---\ntitle: APFS 대소문자 (APFS case)\ntype: fact\nstatus: live\nversion: v1.1\nlinks: []\n---\n\n' +
  '# APFS\n\nintro\n\n## 증상\n\nsymptom text\n\n### 세부\n\ndetail\n\n## 대응\n\nfix text\n'

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-promote-'))
  home = path.join(sandbox, 'home')
  fs.mkdirSync(path.join(home, '.prdt', 'wiki'), { recursive: true })
  env = { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt') }
  for (const n of ['proj', 'other']) {
    const d = path.join(sandbox, n)
    fs.mkdirSync(path.join(d, '.prdt'), { recursive: true })
    fs.mkdirSync(path.join(d, 'docs', 'wiki'), { recursive: true })
    fs.writeFileSync(path.join(d, '.prdt', 'config.json'), JSON.stringify({ slug: n }))
    fs.writeFileSync(path.join(d, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.1', current_task: null }))
  }
  proj = path.join(sandbox, 'proj'); other = path.join(sandbox, 'other')
  fs.writeFileSync(pw('fact--apfs'), PAGE)
})
afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }))

test('whole page moves; project keeps a pointer; both indexes correct; other project resolves it', () => {
  const r = run(proj, ['wiki', 'promote', 'fact--apfs', '--yes'])
  expect(r.code).toBe(0)
  expect(read(mach('fact--apfs'))).toBe(PAGE)                    // moved verbatim
  const ptr = read(pw('fact--apfs'))
  expect(ptr).not.toContain('symptom text')                      // pointer, not copy
  expect(ptr).toContain('[[machine:fact--apfs]]')
  expect(read(proj, 'docs', 'wiki', 'index.md')).toContain('[[fact--apfs]]')
  expect(read(home, '.prdt', 'wiki', 'index.md')).toContain('[[machine:fact--apfs]]')
  expect(run(proj, ['wiki', 'lint']).out).not.toContain('does not exist')
  const s = run(other, ['wiki', 'search', 'symptom'])            // another project finds the target
  expect(s.out).toContain('machine:fact--apfs')
})

test('named section moves; heading stays with a pointer under it', () => {
  const r = run(proj, ['wiki', 'promote', 'fact--apfs', '--section', '증상', '--as', 'fact--apfs-symptom', '--yes'])
  expect(r.code).toBe(0)
  const m = read(mach('fact--apfs-symptom'))
  expect(m).toContain('symptom text'); expect(m).toContain('### 세부'); expect(m).not.toContain('fix text')
  const p = read(pw('fact--apfs'))
  expect(p).toContain('## 증상'); expect(p).toContain('[[machine:fact--apfs-symptom]]')
  expect(p).not.toContain('symptom text'); expect(p).toContain('fix text'); expect(p).toContain('## 대응')
  expect(read(home, '.prdt', 'wiki', 'index.md')).toContain('machine:fact--apfs-symptom')
})

test('existing machine page → refuses, writes nothing', () => {
  fs.writeFileSync(mach('fact--apfs'), '---\ntitle: x\ntype: fact\n---\n\nold\n')
  const r = run(proj, ['wiki', 'promote', 'fact--apfs', '--yes'])
  expect(r.code).not.toBe(0)
  expect(r.out).toContain('refused'); expect(r.out).toContain('--as')
  expect(read(mach('fact--apfs'))).toContain('old'); expect(read(pw('fact--apfs'))).toBe(PAGE)
})

test('no confirm → plan shown, exit 2, nothing written', () => {
  const r = run(proj, ['wiki', 'promote', 'fact--apfs'])
  expect(r.code).toBe(2)
  expect(r.out).toContain('promote plan'); expect(r.out).toContain('not confirmed')
  expect(fs.existsSync(mach('fact--apfs'))).toBe(false); expect(read(pw('fact--apfs'))).toBe(PAGE)
})

test('missing section / re-promoting a pointer / batch of pages are refused', () => {
  expect(run(proj, ['wiki', 'promote', 'fact--apfs', '--section', 'nope', '--yes']).code).not.toBe(0)
  expect(run(proj, ['wiki', 'promote', 'fact--apfs', 'fact--b', '--yes']).code).not.toBe(0)
  run(proj, ['wiki', 'promote', 'fact--apfs', '--yes'])
  const again = run(proj, ['wiki', 'promote', 'fact--apfs', '--as', 'fact--copy2', '--yes'])
  expect(again.code).not.toBe(0); expect(again.out).toContain('already a pointer')
  expect(fs.existsSync(mach('fact--copy2'))).toBe(false)
})

// T-1079 — the two QA repros (d-v113-sec-1): promote never reads or writes outside docs/wiki/.
test('traversal <page> is refused before any read or write', () => {
  const victim = path.join(sandbox, 'victim')
  fs.mkdirSync(victim, { recursive: true })
  const outside = path.join(victim, 'outside.md')
  fs.writeFileSync(outside, 'secret outside text\n')
  for (const bad of ['../../../victim/outside', '../../victim/outside', 'sub/page', '.hidden']) {
    const r = run(proj, ['wiki', 'promote', bad, '--as', 'fact--stolen', '--yes'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('not a usable page name')
    expect(r.out).not.toContain('promote plan')
  }
  expect(read(outside)).toBe('secret outside text\n')
  expect(fs.existsSync(mach('fact--stolen'))).toBe(false)
})

test('symlinked project page is refused; its target is never read or overwritten', () => {
  const victim = path.join(sandbox, 'victim')
  fs.mkdirSync(victim, { recursive: true })
  const target = path.join(victim, 'target.md')
  fs.writeFileSync(target, PAGE)
  fs.symlinkSync(target, pw('fact--linked'))
  const r = run(proj, ['wiki', 'promote', 'fact--linked', '--yes'])
  expect(r.code).not.toBe(0)
  expect(r.out).toContain('symlink')
  expect(r.out).not.toContain('promote plan')
  expect(read(target)).toBe(PAGE)
  expect(fs.lstatSync(pw('fact--linked')).isSymbolicLink()).toBe(true)
  expect(fs.existsSync(mach('fact--linked'))).toBe(false)
})

test('symlinked docs/wiki directory is refused', () => {
  const victim = path.join(sandbox, 'victim')
  fs.mkdirSync(victim, { recursive: true })
  fs.writeFileSync(path.join(victim, 'fact--x.md'), PAGE)
  fs.rmSync(path.join(proj, 'docs', 'wiki'), { recursive: true })
  fs.symlinkSync(victim, path.join(proj, 'docs', 'wiki'))
  const r = run(proj, ['wiki', 'promote', 'fact--x', '--yes'])
  expect(r.code).not.toBe(0)
  expect(r.out).toContain('symlink')
  expect(read(path.join(victim, 'fact--x.md'))).toBe(PAGE)
  expect(fs.existsSync(mach('fact--x'))).toBe(false)
})
