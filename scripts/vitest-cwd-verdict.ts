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
    const result = verifyTripwire()
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
