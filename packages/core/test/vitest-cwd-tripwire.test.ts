/**
 * vitest-cwd-tripwire.test.ts — T-703 slice 2.
 *
 * Proves the guard actually fires, the way the ticket's acceptance requires:
 * "A fixture test proves it fires." `scripts/vitest-cwd-tripwire.cjs` has no
 * dedicated unit test of its own precedent to follow (neither does the home
 * tripwire it mirrors — its guard spec is a Playwright fixture in
 * packages/gui/tests/isolation.guard.spec.ts, a different runner entirely), so
 * this drives the module directly against a throwaway decoy git repo rather
 * than the real one — `armTripwire`/`verifyTripwire` both accept (or record)
 * an explicit root for exactly this reason.
 *
 * `PRODUCTUNE_CWD_TRIPWIRE_RUN` is cleared per test so each run/verify pair
 * arms its own baseline instead of finding one another test file left behind
 * (module-scope arm is meant to be idempotent ACROSS a single vitest process,
 * which is exactly the state this resets between cases here).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { createRequire } from 'node:module'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const cjs = createRequire(import.meta.url)
const tripwire = cjs('../../../scripts/vitest-cwd-tripwire.cjs') as {
  armTripwire: (label: string, rootOverride?: string) => { armed: boolean; reason: string; runId?: string }
  verifyTripwire: (options?: { consume?: boolean }) => { ok: boolean; report: string; drift: string[] }
}

let decoy: string

beforeEach(() => {
  decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cwd-tripwire-decoy-'))
  execFileSync('git', ['init', '--quiet'], { cwd: decoy })
  // Config identity only — no commit needed; an empty repo's `git status
  // --porcelain` is already the empty string, i.e. already a clean baseline.
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: decoy })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: decoy })
  delete process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN
})

afterEach(() => {
  delete process.env.PRODUCTUNE_CWD_TRIPWIRE_RUN
  fs.rmSync(decoy, { recursive: true, force: true })
})

describe('cwd tripwire (T-703) — armed against a decoy repo, never the real one', () => {
  test('clean run: nothing written between arm and verify → ok', () => {
    const arm = tripwire.armTripwire('fixture: clean', decoy)
    expect(arm.armed).toBe(true)
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(true)
    expect(result.drift).toEqual([])
  })

  test('fires: a subprocess writing into the decoy repo (no cwd — the T-703 shape) is caught', () => {
    tripwire.armTripwire('fixture: dirty', decoy)
    // The T-703 shape exactly: a call with no `cwd:` option inherits the
    // CALLING process's cwd. Simulated here by literally cd-ing a child into
    // the decoy and letting it write relative to ITS OWN inherited cwd, same
    // as `prdt init` (no --cwd flag; always os.getcwd()) would.
    execFileSync('sh', ['-c', 'mkdir -p .prdt && echo \'{"slug":"proj"}\' > .prdt/config.json'], { cwd: decoy })
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(false)
    expect(result.drift.some((l) => l.includes('.prdt/'))).toBe(true)
    expect(result.report).toContain('T-703')
  })

  test('a change to an already-tracked file is caught too, not just new untracked paths', () => {
    fs.writeFileSync(path.join(decoy, 'tracked.txt'), 'v1\n')
    execFileSync('git', ['add', 'tracked.txt'], { cwd: decoy })
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: decoy })

    tripwire.armTripwire('fixture: tracked mutation', decoy)
    fs.writeFileSync(path.join(decoy, 'tracked.txt'), 'v2\n')
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(false)
    expect(result.drift.some((l) => l.includes('tracked.txt'))).toBe(true)
  })

  test('pre-existing dirt at arm time is the baseline, not drift — only NEW dirt fails', () => {
    fs.writeFileSync(path.join(decoy, 'already-dirty.txt'), 'pre-existing\n')
    tripwire.armTripwire('fixture: pre-existing dirt', decoy)
    // no further writes
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(true)
  })

  test('verifying twice (consume defaults true) reports "never armed" the second time', () => {
    tripwire.armTripwire('fixture: consume', decoy)
    const first = tripwire.verifyTripwire()
    expect(first.ok).toBe(true)
    const second = tripwire.verifyTripwire()
    expect(second.ok).toBe(false)
    expect(second.report).toContain('NEVER ARMED')
  })
})
