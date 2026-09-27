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
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest'

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

  // ── T-703 slice 3 (QA grill commit 1683b73) ────────────────────────────────

  test('F4: a write under a gitignored path (e.g. tmp/) that did not exist at arm time is caught', () => {
    fs.writeFileSync(path.join(decoy, '.gitignore'), 'tmp/\n')
    execFileSync('git', ['add', '.gitignore'], { cwd: decoy })
    execFileSync('git', ['commit', '-q', '-m', 'seed gitignore'], { cwd: decoy })

    tripwire.armTripwire('fixture: F4 gitignored write', decoy)
    // Plain `git status --porcelain` shows NOTHING for this — the whole point
    // of F4. `tmp/` did not exist at arm time, so its appearance is exactly
    // the "new ignored root" shape `--ignored=matching` is meant to catch.
    fs.mkdirSync(path.join(decoy, 'tmp'))
    fs.writeFileSync(path.join(decoy, 'tmp', 'stray.json'), '{}\n')
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(false)
    expect(result.drift.some((l) => l.includes('tmp/'))).toBe(true)
  })

  test('F6: a new file inside a directory already untracked at arm time is caught', () => {
    // The pre-existing dirt itself: an untracked directory that already has
    // one file in it BEFORE this baseline is even taken — plain `git status
    // --porcelain` would already collapse it to one `?? already-untracked/`
    // line, and adding a second file changes nothing about that one line.
    fs.mkdirSync(path.join(decoy, 'already-untracked'))
    fs.writeFileSync(path.join(decoy, 'already-untracked', 'one.txt'), 'one\n')

    tripwire.armTripwire('fixture: F6 pre-existing untracked dir', decoy)
    fs.writeFileSync(path.join(decoy, 'already-untracked', 'two.txt'), 'two\n')
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(false)
    expect(result.drift.some((l) => l.includes('two.txt'))).toBe(true)
  })

  test('F2: the report names a concurrent editor as a possible cause and points to a scratch worktree', () => {
    tripwire.armTripwire('fixture: F2 wording', decoy)
    execFileSync('sh', ['-c', 'echo x > stray.txt'], { cwd: decoy })
    const result = tripwire.verifyTripwire()
    expect(result.ok).toBe(false)
    expect(result.report).toContain('concurrent editor')
    expect(result.report).toContain('scratch worktree')
    expect(result.report).toContain('stray.txt')
  })

  test('F8: an inherited baseline for a DIFFERENT root is not silently adopted', () => {
    const decoyB = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cwd-tripwire-f8b-'))
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: decoyB })
      execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: decoyB })
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: decoyB })

      const armA = tripwire.armTripwire('fixture: F8 parent root', decoy)
      expect(armA.armed).toBe(true)

      // Simulate a nested process that inherited PRODUCTUNE_CWD_TRIPWIRE_RUN
      // via the environment (armTripwire does not clear it itself) but must
      // arm against a DIFFERENT root — it must re-arm fresh, not adopt decoy's
      // baseline and compare decoyB's tree against it.
      const armB = tripwire.armTripwire('fixture: F8 nested, different root', decoyB)
      expect(armB.armed).toBe(true)
      expect(armB.runId).not.toBe(armA.runId)
      expect(armB.reason).not.toBe('already armed by the parent process')

      fs.writeFileSync(path.join(decoyB, 'stray.txt'), 'x\n')
      const result = tripwire.verifyTripwire()
      expect(result.ok).toBe(false)
      expect(result.drift.some((l) => l.includes('stray.txt'))).toBe(true)
    } finally {
      fs.rmSync(decoyB, { recursive: true, force: true })
    }
  })

  // ── T-703 slice 4 ────────────────────────────────────────────────────────

  test('__pycache__: a newly created __pycache__ dir is quiet, while a sibling tmp/ write is still caught', () => {
    fs.writeFileSync(path.join(decoy, '.gitignore'), 'tmp/\n__pycache__/\n')
    execFileSync('git', ['add', '.gitignore'], { cwd: decoy })
    execFileSync('git', ['commit', '-q', '-m', 'seed gitignore'], { cwd: decoy })

    tripwire.armTripwire('fixture: __pycache__ exclusion', decoy)
    // Same shape as a normal CLI run's own interpreter cache: a fresh
    // __pycache__ directory, gitignored, that did not exist at arm time —
    // exactly what F4's `--ignored=matching` would otherwise report as new
    // drift (see the module header's "EXCLUDED BY NAME" section).
    fs.mkdirSync(path.join(decoy, 'scripts', '__pycache__'), { recursive: true })
    fs.writeFileSync(path.join(decoy, 'scripts', '__pycache__', 'prdt.cpython-311.pyc'), '\x00\x00')
    const quiet = tripwire.verifyTripwire({ consume: false })
    expect(quiet.ok).toBe(true)
    expect(quiet.drift).toEqual([])

    // A sibling ignored write that is NOT named __pycache__ (F4's own case)
    // must still be caught — the exclusion is by name, not a blanket
    // relaxation of the ignored-paths guard.
    fs.mkdirSync(path.join(decoy, 'tmp'))
    fs.writeFileSync(path.join(decoy, 'tmp', 'stray.json'), '{}\n')
    const dirty = tripwire.verifyTripwire()
    expect(dirty.ok).toBe(false)
    expect(dirty.drift.some((l) => l.includes('tmp/'))).toBe(true)
    expect(dirty.drift.some((l) => l.includes('__pycache__'))).toBe(false)
  })

  describe('F1: a probe error fails closed instead of throwing (grill high)', () => {
    test('verifyTripwire() itself returns ok:false, never throws, when the baseline root has vanished', () => {
      const vanished = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cwd-tripwire-vanish-'))
      execFileSync('git', ['init', '--quiet'], { cwd: vanished })
      tripwire.armTripwire('fixture: F1 vanished root', vanished)
      fs.rmSync(vanished, { recursive: true, force: true })

      let result: { ok: boolean; report: string; drift: string[] } | undefined
      expect(() => {
        result = tripwire.verifyTripwire()
      }).not.toThrow()
      expect(result?.ok).toBe(false)
      expect(result?.report).toContain('PROBE ERRORED')
    })

    test('reproduces the grill case: cwd probe errors + $HOME mutated -> exit 1 with BOTH reports (mirrors vitest\'s reverse, no-per-item-catch teardown loop)', async () => {
      vi.resetModules()
      // The $HOME side is MOCKED, not exercised for real — this suite must
      // never write into or fingerprint the developer's real home. The point
      // here is the INTERACTION: does a real probe error on the cwd side stop
      // this (correctly failing) sibling verdict from ever running.
      vi.doMock('../../gui/tests/real-home-tripwire', () => ({
        verifyTripwire: () => ({
          ok: false,
          drift: [{ surface: '~/.productune', added: ['fake-mutated-file'], removed: [] }],
          report: '\nFAKE T-450 REPORT: real home mutated (fixture, not the real thing)\n',
        }),
      }))

      const savedExitCode = process.exitCode
      const written: string[] = []
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        written.push(String(chunk))
        return true
      })
      process.exitCode = undefined

      try {
        const cwdVerdict = (await import('../../../scripts/vitest-cwd-verdict.ts')).default
        const homeVerdict = (await import('../../../scripts/vitest-real-home-verdict.ts')).default

        // Force the CWD module's OWN probe to error for real: arm against a
        // decoy whose root then vanishes before verify runs (same shape as
        // the standalone F1 test above).
        const vanished = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cwd-tripwire-vanish2-'))
        execFileSync('git', ['init', '--quiet'], { cwd: vanished })
        tripwire.armTripwire('fixture: F1 grill repro', vanished)
        fs.rmSync(vanished, { recursive: true, force: true })

        const homeTeardown = homeVerdict()
        const cwdTeardown = cwdVerdict()

        // `vitest.config.ts`'s globalSetup array is `[real-home-verdict, cwd-verdict]`
        // — vitest 4.1.9's `_teardownGlobalSetup` runs teardowns in REVERSE
        // order with NO per-item try/catch (grill F1, observed by running it).
        // Reproduce that exact harness rather than a stand-in: no try/catch
        // around this loop, on purpose.
        for (const teardown of [homeTeardown, cwdTeardown].reverse()) {
          teardown()
        }

        expect(process.exitCode, 'both verdicts must fail the run').toBe(1)
        const output = written.join('')
        expect(output, 'the cwd probe error must be reported').toContain('PROBE ERRORED')
        expect(output, 'the $HOME verdict must still have run and reported').toContain('FAKE T-450 REPORT')
      } finally {
        stdoutSpy.mockRestore()
        process.exitCode = savedExitCode
        vi.doUnmock('../../gui/tests/real-home-tripwire')
        vi.resetModules()
      }
    })
  })
})
