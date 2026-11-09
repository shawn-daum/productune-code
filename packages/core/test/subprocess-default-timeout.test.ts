/**
 * subprocess-default-timeout.test.ts — T-1478.
 *
 * A launch with no `timeout:` used to run forever: on 2026-11-09 a hook's python
 * sat on a stdin read inside a `spawnSync` and the whole run hung 1h40m.
 * scripts/vitest-subprocess-timeout-shim.cjs now gives every launch a kill
 * timeout. This proves the shim's rules in a bare node process, that this
 * package's run loads it, and — through a nested vitest run on the real config —
 * that a hook which never exits fails only its own test, at its budget.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { subprocessTimeout } from './helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..')
const SHIM = path.resolve(CORE_ROOT, '../../scripts/vitest-subprocess-timeout-shim.cjs')
const VITEST_BIN = path.join(CORE_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

let scratch: string
beforeAll(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1478-')) })
afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }) })

/** Run `body` in a bare node process with the shim preloaded; `out` is printed
 *  as JSON when the process exits (so async children are waited for). */
function underShim(body: string, env: NodeJS.ProcessEnv = {}): Record<string, unknown> {
  const script = `
    const cp = require('child_process')
    const out = {}
    const t0 = Date.now()
    process.on('exit', () => { if (out.ms === undefined) out.ms = Date.now() - t0; process.stdout.write(JSON.stringify(out)) })
    try { ${body} } catch (e) { out.name = e.name; out.message = e.message; out.ms = Date.now() - t0 }
  `
  const r = spawnSync(process.execPath, ['--require', SHIM, '-e', script], {
    cwd: scratch,
    env: { ...process.env, PRDT_TEST_TIMEOUT_SCALE: '0.02', ...env },
    encoding: 'utf8',
    timeout: subprocessTimeout('cli'),
  })
  expect(r.stderr).toBe('')
  return JSON.parse(r.stdout)
}

describe('the shim gives every launch a kill timeout (T-1478)', () => {
  test('this package run loads the shim into every worker', () => {
    expect(process.execArgv).toContain(SHIM)
  })

  test('untimed spawnSync outside a test → killed at the doctor tier, reported as SubprocessTimeout', () => {
    // scale 0.02 → doctor 60 s × 0.02 = 1.2 s
    const out = underShim(`cp.spawnSync('sleep', ['30'])`)
    expect(out.name).toBe('SubprocessTimeout')
    expect(out.message).toContain('no timeout given — default: the largest subprocess tier (doctor)')
    expect(out.ms).toBeGreaterThanOrEqual(1100)
    expect(out.ms).toBeLessThan(10_000)
  })

  test("untimed execFileSync / execSync inside a test → killed at that test's own timeout", () => {
    const fake = `globalThis.__vitest_worker__ = { current: { type: 'test', timeout: 700 } };`
    for (const call of [`cp.execFileSync('sleep', ['30'])`, `cp.execSync('sleep 30')`]) {
      const out = underShim(`${fake} ${call}`)
      expect(out.name).toBe('SubprocessTimeout')
      expect(out.message).toContain("killed after 700ms (no timeout given — default: this test's own timeout)")
      expect(out.ms).toBeLessThan(10_000)
    }
  })

  test('untimed async spawn / exec / execFile → killed by the default timeout', () => {
    const fake = `globalThis.__vitest_worker__ = { current: { type: 'test', timeout: 500 } };`
    const out = underShim(`${fake}
      cp.spawn('sleep', ['30']).on('exit', (_c, s) => { out.spawn = s })
      cp.exec('sleep 30', (e) => { out.exec = e && e.signal })
      cp.execFile('sleep', ['30'], (e) => { out.execFile = e && e.signal })`)
    expect(out).toMatchObject({ spawn: 'SIGTERM', exec: 'SIGTERM', execFile: 'SIGTERM' })
    expect(out.ms as number).toBeLessThan(10_000)
  })

  test('promisified exec / execFile still resolve { stdout, stderr }, with the default timeout', () => {
    const fake = `globalThis.__vitest_worker__ = { current: { type: 'test', timeout: 500 } };`
    const out = underShim(`${fake}
      const util = require('util')
      util.promisify(cp.execFile)('echo', ['hi']).then((r) => { out.execFile = r.stdout })
      util.promisify(cp.exec)('echo hi').then((r) => { out.exec = r.stdout })
      util.promisify(cp.execFile)('sleep', ['30']).catch((e) => { out.killed = e.signal })`)
    expect(out).toMatchObject({ execFile: 'hi\n', exec: 'hi\n', killed: 'SIGTERM' })
  })

  test('an explicit opt-out throws UntimedSubprocess and launches nothing', () => {
    const marker = path.join(scratch, 'launched')
    for (const t of ['0', 'Infinity', '-1', "'30s'"]) {
      const out = underShim(`cp.spawnSync('touch', [${JSON.stringify(marker)}], { timeout: ${t} })`)
      expect(out.name).toBe('UntimedSubprocess')
      expect(out.message).toContain('subprocessTimeout(')
      expect(fs.existsSync(marker)).toBe(false)
    }
  })

  test("an explicit timeout is kept, and the caller's options object is never changed", () => {
    const out = underShim(`
      const opts = { encoding: 'utf8' }
      const r = cp.spawnSync('echo', ['hi'], opts)
      out.opts = opts; out.stdout = r.stdout
      try { cp.spawnSync('sleep', ['30'], { timeout: 300 }) } catch (e) { out.kept = e.message }`)
    expect(out.opts).toEqual({ encoding: 'utf8' })
    expect(out.stdout).toBe('hi\n')
    expect(out.kept).toContain('killed after 300ms:')
  })
})

describe('a hook that never exits fails only its own test (T-1478)', () => {
  test('nested run on the real config: that test fails at its budget as a subprocess timeout, the next one passes', () => {
    const budget = 2_000
    const env: NodeJS.ProcessEnv = { ...process.env, T1478_TEST_BUDGET_MS: String(budget), PRDT_TEST_TIMEOUT_SCALE: '1' }
    delete env.VITEST
    delete env.VITEST_WORKER_ID
    delete env.VITEST_POOL_ID
    delete env.PRODUCTUNE_TRIPWIRE_RUN // the nested run arms its own baselines
    delete env.PRODUCTUNE_CWD_TRIPWIRE_RUN
    const t0 = Date.now()
    const r = spawnSync(process.execPath, [VITEST_BIN, 'run', '--config', 'test/fixtures/subprocess-hang/vitest.config.ts'], {
      cwd: CORE_ROOT, env, encoding: 'utf8', timeout: subprocessTimeout('doctor'),
    })
    const wall = Date.now() - t0
    const out = `${r.stdout}\n${r.stderr}`
    expect(r.signal, out).toBeNull()
    expect(r.status, out).toBe(1)
    expect(out).toMatch(/Tests\s+1 failed \| 1 passed/)
    expect(out).toContain(`[SUBPROCESS TIMEOUT] child_process.spawnSync() killed after ${budget}ms (no timeout given — default: this test's own timeout)`)
    expect(out).toMatch(/timeout deaths 1 \(subprocess 1 · test 0 · hook 0\) · assertion failures 0/)
    expect(wall).toBeLessThan(subprocessTimeout('doctor'))
  }, subprocessTimeout('doctor') + 5_000)
})
