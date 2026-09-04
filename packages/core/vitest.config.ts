import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'

// `createRequire`, not `import` — see the note in packages/gui/vitest.config.ts:
// vite bundles this file with esbuild and a bundled `require()` throws.
const cjs = createRequire(import.meta.url)
const { BOOTSTRAP } = cjs('../gui/tests/isolation-rules.cjs') as { BOOTSTRAP: string }
const { armTripwire } = cjs('../gui/tests/real-home-tripwire.cjs') as {
  armTripwire: (l: string) => unknown
}

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
    testTimeout: 15_000,
    // T-450: install the isolation rules at worker STARTUP. See the note in
    // packages/gui/vitest.config.ts for why this is `execArgv` and not a setupFile.
    execArgv: ['--require', BOOTSTRAP],
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
