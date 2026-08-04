/**
 * vitest-real-home-verdict.ts — T-450 / S2. THE VERDICT, for the vitest runner.
 *
 * `pnpm test` is `turbo run test`, which runs `vitest run` in both packages —
 * Playwright is `pnpm smoke`. The acceptance is scoped to the command a developer
 * actually types, and QA measured what that scope contained: vitest had neither
 * the isolation rules nor the tripwire, and a vitest test that DELETED the real
 * home reported "2 passed", exit 0. On the runner whose history of writing this
 * developer's real home is documented in `vitest-home-sandbox.ts`.
 *
 * WHERE A VITEST RUN CAN BE FAILED FROM — all four candidates measured, because
 * three of them fail SILENTLY and that is the one outcome this ticket cannot
 * accept:
 *
 *   ✗ a custom reporter          `--reporter=dot` REPLACES the array. That is S4
 *                               verbatim, the defect being fixed here.
 *   ✗ `process.on('exit')`       cannot influence the exit code from a worker, and
 *                               is not reliably reached at all (see the CLEANUP
 *                               note in vitest-home-sandbox.ts).
 *   ✗ THROWING from this teardown
 *                               prints "error during close" and still exits 0.
 *                               Green while mutating, with extra steps.
 *   ✓ `process.exitCode = 1` from this teardown
 *                               MEASURED: `Test Files 1 passed`, `Tests 1 passed`,
 *                               exit 1, under `--reporter=dot`. Tests pass, run
 *                               fails — exactly the shape of this defect.
 *
 * WHY NOT AN `afterAll` FROM `setupFiles`
 *
 * That also works (a failing hook fails the test FILE and so the run), and it was
 * the first implementation. It was replaced on cost, measured: the fingerprint is
 * ~210ms, `setupFiles` hooks run once per test FILE, and there are 87 of them
 * across the two packages running in parallel workers — 8 concurrent walks
 * measured 12s of wall time through I/O contention, and vitest's 10s default hook
 * timeout started firing. A run-level guarantee only needs ONE final fingerprint,
 * so it takes one.
 *
 * `globalSetup` is a config field with no CLI override (`vitest --help` exposes
 * `--reporter`, not `--globalSetup`), so it has the same durability property as
 * Playwright's `globalTeardown`. The BASELINE is armed even earlier, at each
 * package's `vitest.config.ts` module scope — which is what puts a `globalSetup`
 * mutation inside the observed window (S3).
 */

import { verifyTripwire } from '../packages/gui/tests/real-home-tripwire'

export default function setup(): () => void {
  // Nothing to do on the way in: the baseline is already armed at config module
  // scope, which is deliberately EARLIER than this function runs.
  return function teardown(): void {
    const result = verifyTripwire()
    if (result.ok) return
    process.stdout.write(result.report)
    process.stdout.write(
      'T-450: the real home was mutated during this vitest run. The run is a FAILURE\n' +
        'even though the tests passed — a test that damages the machine it runs on has\n' +
        'not verified anything. (verdict at vitest globalSetup teardown)\n',
    )
    process.exitCode = 1
  }
}
