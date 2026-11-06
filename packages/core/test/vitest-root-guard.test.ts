/**
 * vitest-root-guard.test.ts — T-1417.
 *
 * vitest finds its config by searching UPWARD from the cwd. A run started from
 * `code/` or `code/packages/` used to find none and ran the package tests with
 * no HOME sandbox and no T-450 tripwire; on 2026-11-04 such a run made
 * meta-backup-trigger.test.ts delete the real ~/.prdt/prdt.env. `code/vitest.config.ts`
 * now refuses that run before any test file loads. This proves it, against a
 * throwaway HOME holding a placeholder prdt.env, and checks that file by hash.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from './helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..')
const CODE_ROOT = path.resolve(CORE_ROOT, '..', '..')
const VITEST_BIN = path.join(CORE_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

const sha = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')

let home: string
let envFile: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1417-home-'))
  fs.mkdirSync(path.join(home, '.prdt'))
  envFile = path.join(home, '.prdt', 'prdt.env')
  fs.writeFileSync(envFile, 'PRDT_REPO=/nonexistent/fake/packages/core\n', { mode: 0o600 })
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

describe('a vitest run outside a package is refused (T-1417)', () => {
  for (const rel of ['.', 'packages']) {
    test(`cwd code/${rel}: exits non-zero naming T-1417; the test file never runs; prdt.env unchanged`, () => {
      const before = sha(envFile)
      const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PRDT_META_BACKUP: '0' }
      delete env.PRDT_HOME
      delete env.VITEST
      delete env.VITEST_WORKER_ID
      delete env.VITEST_POOL_ID
      const r = spawnSync(process.execPath, [VITEST_BIN, 'run', 'core/test/scripts/meta-backup-trigger.test.ts'], {
        cwd: path.join(CODE_ROOT, rel), env, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      })
      const out = `${r.stdout}\n${r.stderr}`
      expect(r.status).not.toBe(0)
      expect(out).toContain('T-1417')
      expect(out).not.toMatch(/Tests\s+\d+ (passed|failed)/)
      expect(fs.existsSync(envFile)).toBe(true)
      expect(sha(envFile)).toBe(before)
    })
  }
})
