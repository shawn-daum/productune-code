/**
 * vitest-cwd-verdict.ts — T-703 slice 2. THE VERDICT for the cwd tripwire,
 * mirroring `vitest-real-home-verdict.ts` exactly (same reasoning applies: a
 * custom reporter can be replaced wholesale by `--reporter`, `process.on('exit')`
 * cannot set the exit code from a worker, and throwing from a teardown prints
 * "error during close" but still exits 0 — only `process.exitCode = 1` from a
 * `globalSetup` teardown is both durable and reflected in the exit code).
 *
 * `globalSetup` takes an array — this runs alongside the home verdict, each
 * module owning its own single surface.
 *
 * Plain `require()`, not an ESM import of the `.cjs` — same choice
 * `real-home-tripwire.ts` makes for the same module, and for the same reason:
 * no second copy of the logic behind a typed re-export this narrow needs.
 *
 * F1 (T-703 slice 3, grill high): `verifyTripwire()` is hardened (see
 * vitest-cwd-tripwire.cjs) to fail closed rather than throw on a probe error.
 * The `try/catch` below is defense in depth on top of that, for the one
 * property this teardown must hold regardless of what the `.cjs` does: it must
 * never let an exception escape. vitest 4.1.9's `_teardownGlobalSetup` runs
 * every globalSetup's teardown in REVERSE array order with NO per-item
 * try/catch (observed by the grill) — this module is currently LAST in
 * `vitest.config.ts`'s `globalSetup` array, so its teardown runs FIRST; an
 * uncaught throw here would abort the loop before the T-450 $HOME verdict
 * (first in the array, so last in teardown order) ever runs, and — separately
 * — a throw from a globalSetup teardown prints "error during close" but still
 * exits 0 (measured, see the home verdict's own header), so the failure would
 * have been invisible on both counts at once.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
type VerifyResult = { ok: boolean; report: string; drift: string[] }
const { verifyTripwire } = require('./vitest-cwd-tripwire.cjs') as {
  verifyTripwire: (options?: { consume?: boolean }) => VerifyResult
}

export default function setup(): () => void {
  // Nothing to do on the way in: the baseline is already armed at config module
  // scope, deliberately earlier than this function runs.
  return function teardown(): void {
    let result: VerifyResult
    try {
      result = verifyTripwire()
    } catch (err) {
      // F1 — see the header. This must never happen given the hardening in
      // vitest-cwd-tripwire.cjs, but this teardown's own no-throw guarantee
      // does not get to depend on that module never regressing.
      process.stdout.write(
        `\nT-703 CWD TRIPWIRE TEARDOWN THREW: ${err instanceof Error ? err.message : String(err)}\n` +
          'Failing the run rather than letting this propagate — an uncaught throw here\n' +
          "would abort vitest's reverse globalSetup teardown loop and skip the $HOME\n" +
          'verdict (F1).\n',
      )
      process.exitCode = 1
      return
    }
    if (result.ok) return
    process.stdout.write(result.report)
    process.stdout.write(
      'T-703: the repo working tree was written to during this vitest run. The run is\n' +
        'a FAILURE even though the tests passed — a test that leaves stray files in the\n' +
        'repo has not verified anything about isolation. (verdict at vitest globalSetup teardown)\n',
    )
    process.exitCode = 1
  }
}
