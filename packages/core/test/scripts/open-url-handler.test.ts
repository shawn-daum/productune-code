/**
 * T-1191: the prdt:// URL handler (prdt_open_url.py --check) and the applet
 * build (prdt-url-scheme.sh). The handler must open only an env file in a prdt
 * project's code folder, whatever URL a web page hands it. The scheme script
 * runs under a sandbox PRDT_HOME with a stub `lsregister` first on PATH: it must
 * build the applet and never register it (the sandbox is not the login user's ~/.prdt).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'

const SCRIPTS = path.resolve(__dirname, '..', '..', 'scripts')
const HANDLER = path.join(SCRIPTS, 'prdt_open_url.py')
let base: string
let root: string
let prdtHome: string

function write(rel: string, text: string) {
  const p = path.join(base, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
function check(url: string) {
  const r = spawnSync('python3', [HANDLER, '--check', url], { env: { PATH: process.env.PATH, PRDT_HOME: prdtHome }, encoding: 'utf8' })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr }
}
const link = (q: Record<string, string>) => 'prdt://open-env?' + new URLSearchParams(q).toString()

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'open-url-')))
  root = path.join(base, 'proj')
  prdtHome = path.join(base, 'prdt')
  write('proj/.prdt/po-state.json', '{}')
  write('proj/.prdt/config.json', JSON.stringify({ lines: [{ name: 'arch', code: { dir: '../arch/code' } }] }))
  write('proj/code/.env.local', 'A=1\n')
  write('proj/code/.env.example', 'A=\n')
  write('proj/code/notes.txt', 'x\n')
  write('arch/code/.env', 'B=1\n')
  write('secret.txt', 'x\n')
  fs.symlinkSync(path.join(base, 'secret.txt'), path.join(root, 'code', '.env.link'))
  write('notproj/code/.env', 'C=1\n')
  fs.symlinkSync(root, path.join(base, 'proj-link'))
})
afterAll(() => fs.rmSync(base, { recursive: true, force: true }))

describe('prdt_open_url.py — resolves only an env file in a prdt project code folder', () => {
  test('home code folder and a line code folder that climbs out', () => {
    expect(check(link({ root, file: '.env.local' }))).toMatchObject({ code: 0, out: path.join(root, 'code', '.env.local') })
    expect(check(link({ root, file: '.env.example' })).out).toBe(path.join(root, 'code', '.env.example'))
    expect(check(link({ root, line: 'arch', file: '.env' })).out).toBe(path.join(base, 'arch', 'code', '.env'))
  })

  test.each([
    ['a path in file', { file: '../code/.env.local' }],
    ['an absolute file', { file: '/etc/hosts' }],
    ['not an env name', { file: 'notes.txt' }],
    ['a symlinked env file', { file: '.env.link' }],
    ['a missing env file', { file: '.env.prod' }],
    ['an unknown line', { line: 'nope', file: '.env' }],
    ['a traversal line name', { line: '../x', file: '.env' }],
  ])('refuses %s', (_n, q) => {
    expect(check(link({ root, ...q } as Record<string, string>)).code).toBe(1)
  })

  test('refuses a root that is not a prdt project, not canonical, or relative', () => {
    expect(check(link({ root: path.join(base, 'notproj'), file: '.env' })).code).toBe(1)
    expect(check(link({ root: path.join(base, 'proj-link'), file: '.env.local' })).code).toBe(1)
    expect(check(link({ root: root + '/../proj', file: '.env.local' })).code).toBe(1)
    expect(check(link({ root: 'proj', file: '.env.local' })).code).toBe(1)
  })

  test('refuses another scheme or host, extra or repeated keys, a fragment', () => {
    const q = new URLSearchParams({ root, file: '.env.local' }).toString()
    for (const u of [`file:///${root}/code/.env.local`, `prdt://open?${q}`, `prdt://open-env/x?${q}`, `prdt://open-env?${q}#f`,
      `prdt://open-env?${q}&cmd=x`, `prdt://open-env?${q}&file=.env.example`, 'prdt://open-env?root=%00&file=.env']) {
      expect(check(u).code, u).toBe(1)
    }
  })

  test('every refusal is logged under PRDT_HOME/run, the URL capped', () => {
    check(link({ root, file: 'x'.repeat(1000) }))
    const log = fs.readFileSync(path.join(prdtHome, 'run', 'open-url.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    const last = log[log.length - 1]
    expect(last.verdict).toBe('refused')
    expect(last.url.length).toBe(300)
  })
})

describe.skipIf(process.platform !== 'darwin')('prdt-url-scheme.sh — applet build, sandbox never registered', () => {
  let sb: string
  let stubLog: string
  let env: NodeJS.ProcessEnv
  beforeAll(() => {
    sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'url-scheme-')))
    fs.mkdirSync(path.join(sb, 'prdt', 'bin'), { recursive: true })
    fs.copyFileSync(HANDLER, path.join(sb, 'prdt', 'bin', 'prdt_open_url.py'))
    fs.mkdirSync(path.join(sb, 'stub'))
    stubLog = path.join(sb, 'lsregister.log')
    fs.writeFileSync(path.join(sb, 'stub', 'lsregister'), `#!/bin/sh\necho "$@" >> "${stubLog}"\n`, { mode: 0o755 })
    env = { PATH: `${path.join(sb, 'stub')}:/usr/bin:/bin:/usr/sbin:${path.dirname(execFileSync('which', ['python3'], { encoding: 'utf8' }).trim())}`, HOME: path.join(sb, 'home'), PRDT_HOME: path.join(sb, 'prdt') }
  })
  afterAll(() => fs.rmSync(sb, { recursive: true, force: true }))

  test('install builds prdt-open.app claiming the prdt scheme; uninstall removes it; lsregister never runs', () => {
    const out = execFileSync('bash', [path.join(SCRIPTS, 'prdt-url-scheme.sh'), 'install'], { env, encoding: 'utf8' })
    expect(out).toContain('NOT registered')
    const app = path.join(sb, 'prdt', 'apps', 'prdt-open.app')
    const plist = execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' })
    const info = JSON.parse(plist)
    expect(info.CFBundleIdentifier).toBe('dev.prdt.open')
    expect(info.CFBundleURLTypes[0].CFBundleURLSchemes).toEqual(['prdt'])
    execFileSync('codesign', ['--verify', app])
    execFileSync('bash', [path.join(SCRIPTS, 'prdt-url-scheme.sh'), 'uninstall'], { env })
    expect(fs.existsSync(app)).toBe(false)
    expect(fs.existsSync(stubLog)).toBe(false)
  }, 60_000)
})
