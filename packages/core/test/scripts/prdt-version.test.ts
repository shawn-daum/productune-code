/**
 * prdt --version (T-941) — prints the installed release version, from the repo
 * script AND from an installed copy that has no repo beside it (the copy at
 * ~/.prdt/bin finds the repo through `PRDT_REPO` in prdt.env).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}

let sandbox: string
let expected: string

function run(cli: string, env: Record<string, string>) {
  return spawnSync('python3', [cli, '--version'], {
    cwd: sandbox, encoding: 'utf-8', timeout: subprocessTimeout('cli'),
    env: { ...process.env, ...env },
  })
}

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-version-'))
  const first = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'RELEASES.md'), 'utf8')
    .split('\n').find((l) => l.startsWith('## '))!
  expected = first.slice(3).split(/\s+/)[0]
})
afterAll(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!which('python3'))('prdt --version', () => {
  test('repo script prints the newest RELEASES.md version', () => {
    const r = run(PRDT_CLI, { PRDT_HOME: path.join(sandbox, 'empty-home') })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(`prdt ${expected}`)
  })

  test('installed copy, prdt.env in the real install.sh form (PRDT_REPO=<clone>/packages/core)', () => {
    const home = path.join(sandbox, 'home-core')
    fs.mkdirSync(path.join(home, 'bin'), { recursive: true })
    const copy = path.join(home, 'bin', 'prdt')
    fs.copyFileSync(PRDT_CLI, copy)
    fs.writeFileSync(path.join(home, 'prdt.env'), `PRDT_REPO=${CORE_ROOT}\n`)
    const r = run(copy, { PRDT_HOME: home })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(`prdt ${expected}`)
  })

  test('an installed copy with PRDT_REPO at the clone root also resolves', () => {
    const home = path.join(sandbox, 'home')
    fs.mkdirSync(path.join(home, 'bin'), { recursive: true })
    const copy = path.join(home, 'bin', 'prdt')
    fs.copyFileSync(PRDT_CLI, copy)
    fs.writeFileSync(path.join(home, 'prdt.env'), `PRDT_REPO=${REPO_ROOT}\n`)
    const r = run(copy, { PRDT_HOME: home })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe(`prdt ${expected}`)
  })

  test('no readable RELEASES.md anywhere fails loud, never prints a guessed version', () => {
    const home = path.join(sandbox, 'bare')
    fs.mkdirSync(path.join(home, 'bin'), { recursive: true })
    const copy = path.join(home, 'bin', 'prdt')
    fs.copyFileSync(PRDT_CLI, copy)
    const r = run(copy, { PRDT_HOME: home })
    expect(r.status).not.toBe(0)
    expect(r.stdout.trim()).toBe('')
  })
})
