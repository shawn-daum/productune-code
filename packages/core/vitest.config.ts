import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
import path from 'node:path'
import { TimeoutTallyReporter } from '../../scripts/vitest-timeout-tally'

// `createRequire`, not `import` — see the note in packages/gui/vitest.config.ts:
// vite bundles this file with esbuild and a bundled `require()` throws.
const cjs = createRequire(import.meta.url)
const { BOOTSTRAP } = cjs('../gui/tests/isolation-rules.cjs') as { BOOTSTRAP: string }
const { armTripwire } = cjs('../gui/tests/real-home-tripwire.cjs') as {
  armTripwire: (l: string) => unknown
}
// T-649: every timeout in this run comes from ONE module. `.cjs` + createRequire
// for the same bundling reason as the tripwire above.
const timeouts = cjs('../../scripts/vitest-timeouts.cjs') as {
  pin: () => unknown
  testTimeoutMs: () => number
  hookTimeoutMs: () => number
  maxWorkers: () => number
  describe: () => string
}
const TIMEOUT_SHIM = path.resolve(__dirname, '../../scripts/vitest-subprocess-timeout-shim.cjs')

// ── T-450 / S2 ────────────────────────────────────────────────────────────────
//
// `pnpm test` runs this package too, and the comment below records that tests
// HERE are the ones that already wrote the developer's real home. It had the HOME
// repoint (prevention) and neither the isolation rules nor the tripwire.
//
// The shared implementation lives under `packages/gui/tests/` and is reached by
// relative path, the same way `setupFiles` already reaches `scripts/`. One copy on
// purpose: a second copy of the containment predicate is the defect this ticket
// has now been reported for in four consecutive rounds.
armTripwire('packages/core vitest.config.ts module scope')

// T-649: resolve the run's timeout scale ONCE, here, and pin it into the
// environment — every worker fork and every `subprocessTimeout()` call inside
// one then uses the same number as this config did, however the load moves
// while the run is in flight.
timeouts.pin()

export default defineConfig({
  test: {
    // Pick up .test.ts files under test/ only (NOT .mjs shims which run separately)
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Each test file runs in its own isolated Node environment
    environment: 'node',
    globals: false,
    // T-536: the per-test timeout is a recorded DECISION, not vitest's
    // accidental 5s default. This suite's e2e files shell out to the real
    // install.sh / prdt CLI / git, and the full parallel run packs minutes of
    // real work into a ~1min wall clock — the measured flake was passing tests
    // hitting 5.1–5.6s purely from contention, a different set every run. The
    // ROOT fix is the shared per-file install fixture
    // (test/helpers/install-fixture.ts); this budget is hang detection on top
    // of it, not permission to be slow.
    // T-649: the 15 s base now lives in scripts/vitest-timeouts.cjs
    // (TEST_BASE_MS) and is scaled with everything else — one place.
    testTimeout: timeouts.testTimeoutMs(),
    // T-649: `--testTimeout` never touched this one (fact--cli-pty-testing);
    // the sandbox fixtures (mkdtemp + discipline copy + git init) exceed vitest's
    // 10 s default at load 10. Same base module, same scale.
    hookTimeout: timeouts.hookTimeoutMs(),
    // T-649: MEASURED default (ticket §Outcome, `--maxWorkers` steps). vitest's
    // own `cpus - 1` is the 13-worker pool that produced 0 output for 24 min and
    // two OOM kills on 2026-09-17. `PRDT_TEST_MAX_WORKERS` or `--maxWorkers`
    // overrides it per run.
    maxWorkers: timeouts.maxWorkers(),
    // T-450: install the isolation rules at worker STARTUP. See the note in
    // packages/gui/vitest.config.ts for why this is `execArgv` and not a setupFile.
    // T-649: the timeout shim loads AFTER the rules and wraps on top of them —
    // a subprocess killed by its budget then throws `SubprocessTimeout`, so a
    // busy machine is never reported as an assertion failure.
    execArgv: ['--require', BOOTSTRAP, '--require', TIMEOUT_SHIM],
    // T-649: the default reporter plus a one-block tally of timeout deaths vs
    // assertion failures. Not a floor — `--reporter` replaces it; the T-450
    // verdict below is the floor and does not depend on this.
    reporters: ['default', new TimeoutTallyReporter(timeouts)],
    // T-450 THE FLOOR: the run's verdict. A config field, so `--reporter` cannot
    // remove it — which is exactly how S4 removed the R1 floor.
    globalSetup: ['../../scripts/vitest-real-home-verdict.ts'],
    // T-442: repoint HOME at a per-worker temp dir before any test module
    // loads. Several tests here shell out to the real `prdt` CLI (which
    // rewrites ~/.claude.json) or call `getDefault()` (which auto-creates
    // ~/.productune/git-rules.default.json) with an inherited real HOME.
    // T-450: the same file now also carries the run's VERDICT.
    setupFiles: ['../../scripts/vitest-home-sandbox.ts'],
  },
})
