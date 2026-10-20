/**
 * vitest-real-home-attribution.test.ts — T-1134.
 *
 * The T-450 tripwire must fail a run when the SUITE writes the real home and only
 * print a notice when a process OUTSIDE the run does (another session's
 * `prdt feedback record`). The real home is frozen per process, so each case
 * drives the tripwire in child node processes against a decoy home:
 *   arm (child) -> writes (inside = a bootstrapped child of the run, outside = this
 *   test process, which is not part of the child's run) -> verify (child).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { createRequire } from 'node:module'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const cjs = createRequire(import.meta.url)
const TESTS_DIR = path.resolve(__dirname, '../../gui/tests')
const TRIPWIRE = path.join(TESTS_DIR, 'real-home-tripwire.cjs')
const { BOOTSTRAP } = cjs(path.join(TESTS_DIR, 'isolation-rules.cjs')) as { BOOTSTRAP: string }

let decoy: string
let sandbox: string

function node(code: string, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, PRODUCTUNE_REAL_HOME: decoy, HOME: sandbox, ...extraEnv }
  delete env.NODE_OPTIONS
  if (!extraEnv.PRODUCTUNE_TRIPWIRE_RUN) delete env.PRODUCTUNE_TRIPWIRE_RUN
  return spawnSync(process.execPath, ['--require', BOOTSTRAP, '-e', code], { env, encoding: 'utf-8' })
}

function arm(): string {
  const r = node(`const t=require(${JSON.stringify(TRIPWIRE)});process.stdout.write('RUN='+t.armTripwire('fixture').runId)`)
  const m = /RUN=(\S+)/.exec(r.stdout)
  expect(m, r.stdout + r.stderr).toBeTruthy()
  return m![1]
}

function verify(runId: string) {
  const r = node(
    `const t=require(${JSON.stringify(TRIPWIRE)});const v=t.verifyTripwire();process.stdout.write('JSON='+JSON.stringify({ok:v.ok,report:v.report,notice:v.notice||''}))`,
    { PRODUCTUNE_TRIPWIRE_RUN: runId },
  )
  const m = /JSON=(.*)$/s.exec(r.stdout)
  expect(m, r.stdout + r.stderr).toBeTruthy()
  return JSON.parse(m![1]) as { ok: boolean; report: string; notice: string }
}

beforeEach(() => {
  decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-attrib-decoy-'))
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-attrib-sandbox-'))
  fs.mkdirSync(path.join(decoy, '.prdt', 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(decoy, '.prdt', 'wiki', 'feedback.md'), 'seed\n')
})
afterEach(() => {
  fs.rmSync(decoy, { recursive: true, force: true })
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('real-home tripwire attribution (T-1134)', () => {
  test('a write by a process outside the run passes and is printed as a notice naming the path', () => {
    const run = arm()
    fs.appendFileSync(path.join(decoy, '.prdt', 'wiki', 'feedback.md'), 'another session wrote this, longer\n')
    const v = verify(run)
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(path.join(decoy, '.prdt', 'wiki', 'feedback.md'))
  })

  test('a write by a test process of the run still fails the run', () => {
    const run = arm()
    const target = path.join(decoy, '.prdt', 'wiki', 'feedback.md')
    const w = node(`require('fs').appendFileSync(${JSON.stringify(target)}, 'the suite wrote this\\n')`, {
      PRODUCTUNE_TRIPWIRE_RUN: run,
    })
    expect(w.status, w.stderr).toBe(0)
    const v = verify(run)
    expect(v.ok).toBe(false)
    expect(v.report).toContain(target)
  })

  test('a write by a child of a test process still fails the run', () => {
    const run = arm()
    const target = path.join(decoy, '.prdt', 'wiki', 'created-by-child.md')
    const w = node(
      `require('child_process').execSync('echo x > ' + ${JSON.stringify(JSON.stringify(target))})`,
      { PRODUCTUNE_TRIPWIRE_RUN: run },
    )
    expect(w.status, w.stderr).toBe(0)
    expect(fs.existsSync(target)).toBe(true)
    const v = verify(run)
    expect(v.ok).toBe(false)
    expect(v.report).toContain(target)
  })

  test('mixed: the suite path fails, the outside path is only noticed', () => {
    const run = arm()
    const mine = path.join(decoy, '.prdt', 'mine.txt')
    const theirs = path.join(decoy, '.prdt', 'wiki', 'feedback.md')
    node(`require('fs').writeFileSync(${JSON.stringify(mine)}, 'x')`, { PRODUCTUNE_TRIPWIRE_RUN: run })
    fs.appendFileSync(theirs, 'external, longer line\n')
    const v = verify(run)
    expect(v.ok).toBe(false)
    expect(v.report).toContain(mine)
    expect(v.notice).toContain(theirs)
    expect(v.notice).not.toContain(mine)
  })
})
