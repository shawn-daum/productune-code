/**
 * T-908 (T-848 S5): `prdt` writes the viewer's files itself (state_write), the
 * generator only emits a bundle on stdout — so a viewer folder swapped for a
 * link while the generator runs (T-850 race), or a link planted at any
 * written file, never makes a write land outside the project.
 * `PRDT_UNDER_TEST=<path>` runs the same cases against another prdt (the
 * pre-fix script, to see them fail).
 * The generator is a stub: it models the real one — `--emit` prints the bundle,
 * without it the files are written through their path strings.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

const REAL_PRDT = process.env.PRDT_UNDER_TEST ?? path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
const NODE = process.execPath

const STUB = `import fs from 'node:fs'
import path from 'node:path'
const a = process.argv
const out = a[a.indexOf('--out') + 1]
const dir = path.dirname(out)
const files = [
  { name: 'viewer.tickets-v0.1.js', content: 'data' },
  { name: path.basename(out), content: '<!doctype html>NEW' },
  { name: 'viewer.build.js', content: 'build' },
]
const at = [{ name: 'T-001.html', content: 'at-page' }]
if (process.env.STUB_SWAP) {
  const [from, to] = process.env.STUB_SWAP.split('|')
  fs.renameSync(from, from + '.moved')
  fs.symlinkSync(to, from)
}
if (a.includes('--emit')) {
  process.stdout.write(JSON.stringify({ files, at, prune: { dataPrefix: 'viewer.tickets-', dataSuffix: '.js' } }))
} else {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), f.content)
}
`

let sb: string, home: string, root: string, outside: string, viewer: string

beforeEach(() => {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't908-')))
  home = path.join(sb, 'home'); fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
  outside = path.join(sb, 'outside'); fs.mkdirSync(outside)
  const code = path.join(sb, 'code')
  const v = path.join(code, 'packages', 'viewer')
  fs.mkdirSync(path.join(code, 'packages', 'core', 'scripts'), { recursive: true })
  fs.copyFileSync(REAL_PRDT, path.join(code, 'packages', 'core', 'scripts', 'prdt'))
  fs.chmodSync(path.join(code, 'packages', 'core', 'scripts', 'prdt'), 0o755)
  fs.mkdirSync(v, { recursive: true })
  fs.writeFileSync(path.join(v, 'cli.mjs'), STUB)
  for (const pkg of ['marked', 'subset-font']) {
    fs.mkdirSync(path.join(v, 'node_modules', pkg), { recursive: true })
    fs.writeFileSync(path.join(v, 'node_modules', pkg, 'package.json'), '{}')
  }
  fs.mkdirSync(path.join(v, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2'), { recursive: true })
  fs.mkdirSync(path.join(code, 'packages', 'gui', 'src', 'styles'), { recursive: true })
  fs.writeFileSync(path.join(code, 'packages', 'gui', 'src', 'styles', 'tokens.css'), ':root{}')
  root = path.join(sb, 'proj')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  viewer = path.join(root, '.prdt', 'scratch', 'viewer')
})
afterEach(() => fs.rmSync(sb, { recursive: true, force: true }))

function run(env: Record<string, string> = {}, umask = '022') {
  const prdt = path.join(sb, 'code', 'packages', 'core', 'scripts', 'prdt')
  return spawnSync('sh', ['-c', `umask ${umask}; exec python3 "$0" viewer --no-open`, prdt], {
    cwd: root, encoding: 'utf8', timeout: 60000,
    env: { PATH: process.env.PATH ?? '', HOME: home, PRDT_HOME: path.join(home, '.prdt'), ...env },
  })
}
const mode = (p: string) => fs.statSync(p).mode & 0o777

describe('T-908 viewer output goes through state_write', () => {
  test('viewer folder swapped for a link while the generator runs → nothing lands outside', () => {
    fs.mkdirSync(viewer, { recursive: true })
    const r = run({ STUB_SWAP: `${viewer}|${outside}` })
    expect(fs.readdirSync(outside)).toEqual([])
    expect(r.status).not.toBe(0)
  })

  test.each(['viewer.html', 'viewer.build.js', 'viewer.tickets-v0.1.js'])('a link planted at %s → refused, victim byte-identical', (name) => {
    fs.mkdirSync(viewer, { recursive: true })
    const victim = path.join(outside, 'victim'); fs.writeFileSync(victim, 'VICTIM ORIGINAL')
    fs.symlinkSync(victim, path.join(viewer, name))
    const r = run()
    expect(fs.readFileSync(victim, 'utf8')).toBe('VICTIM ORIGINAL')
    expect(r.status).not.toBe(0)
    expect(fs.lstatSync(path.join(viewer, name)).isSymbolicLink()).toBe(true)
  })

  test('a dangling link at viewer.html creates nothing at its target', () => {
    fs.mkdirSync(viewer, { recursive: true })
    fs.symlinkSync(path.join(outside, 'missing'), path.join(viewer, 'viewer.html'))
    run()
    expect(fs.readdirSync(outside)).toEqual([])
  })

  test('a link at an at/ page, or at at/ itself → victim untouched, the page itself still lands', () => {
    fs.mkdirSync(path.join(viewer, 'at'), { recursive: true })
    const victim = path.join(outside, 'victim'); fs.writeFileSync(victim, 'VICTIM ORIGINAL')
    fs.symlinkSync(victim, path.join(viewer, 'at', 'T-001.html'))
    expect(run().status).toBe(0)
    expect(fs.readFileSync(victim, 'utf8')).toBe('VICTIM ORIGINAL')
    expect(fs.readFileSync(path.join(viewer, 'viewer.html'), 'utf8')).toBe('<!doctype html>NEW')
    fs.rmSync(path.join(viewer, 'at'), { recursive: true })
    fs.symlinkSync(outside, path.join(viewer, 'at'))
    expect(run().status).toBe(0)
    expect(fs.readdirSync(outside)).toEqual(['victim'])
  })

  test('existing file modes are kept; new files follow umask', () => {
    fs.mkdirSync(viewer, { recursive: true })
    fs.writeFileSync(path.join(viewer, 'viewer.html'), 'old'); fs.chmodSync(path.join(viewer, 'viewer.html'), 0o640)
    expect(run({}, '077').status).toBe(0)
    expect(mode(path.join(viewer, 'viewer.html'))).toBe(0o640)
    expect(mode(path.join(viewer, 'viewer.build.js'))).toBe(0o600)
    fs.rmSync(path.join(viewer, 'viewer.build.js'))
    expect(run({}, '022').status).toBe(0)
    expect(mode(path.join(viewer, 'viewer.build.js'))).toBe(0o644)
  })

  test('stale ticket pages and stale data files are pruned; other pages stay', () => {
    fs.mkdirSync(path.join(viewer, 'at'), { recursive: true })
    fs.writeFileSync(path.join(viewer, 'at', 'T-999.html'), 'stale')
    fs.writeFileSync(path.join(viewer, 'at', 'fact--x.html'), 'keep')
    fs.writeFileSync(path.join(viewer, 'viewer.tickets-v0.0.js'), 'stale')
    expect(run().status).toBe(0)
    expect(fs.readdirSync(path.join(viewer, 'at')).sort()).toEqual(['T-001.html', 'fact--x.html'])
    expect(fs.existsSync(path.join(viewer, 'viewer.tickets-v0.0.js'))).toBe(false)
    expect(fs.readFileSync(path.join(viewer, 'viewer.tickets-v0.1.js'), 'utf8')).toBe('data')
  })
})

describe('T-908 .prdt/config.json writers (features vocab --seed; attest prepush shares the call shape, not separately tested)', () => {
  const seed = (umask = '022') => {
    const prdt = path.join(sb, 'code', 'packages', 'core', 'scripts', 'prdt')
    return spawnSync('sh', ['-c', `umask ${umask}; exec python3 "$0" features vocab --seed`, prdt], {
      cwd: root, encoding: 'utf8', timeout: 60000,
      env: { PATH: process.env.PATH ?? '', HOME: home, PRDT_HOME: path.join(home, '.prdt') },
    })
  }
  test('config.json a link to a victim → refused, victim byte-identical', () => {
    const victim = path.join(outside, 'victim'); fs.writeFileSync(victim, '{}')
    fs.symlinkSync(victim, path.join(root, '.prdt', 'config.json'))
    expect(seed().status).not.toBe(0)
    expect(fs.readFileSync(victim, 'utf8')).toBe('{}')
  })
  test('existing config.json keeps its mode; a new one follows umask', () => {
    const cfg = path.join(root, '.prdt', 'config.json')
    fs.writeFileSync(cfg, '{}'); fs.chmodSync(cfg, 0o640)
    expect(seed('077').status).toBe(0)
    expect(mode(cfg)).toBe(0o640)
    fs.rmSync(cfg)
    expect(seed('077').status).toBe(0)
    expect(mode(cfg)).toBe(0o600)
  })
})
