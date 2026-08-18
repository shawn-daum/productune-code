import { defineConfig } from 'vitest/config'
import path from 'path'
import { createRequire } from 'node:module'

// `createRequire`, not `import` — MEASURED. Vite bundles this config with esbuild
// before evaluating it, and a `require()` inside a bundled dependency becomes a
// dynamic require that throws (`Dynamic require of "fs" is not supported`). These
// two modules are plain CJS precisely so they can be reached from here, which is
// the only point early enough to arm the baseline (see below).
const cjs = createRequire(import.meta.url)
const { BOOTSTRAP } = cjs('./tests/isolation-rules.cjs') as { BOOTSTRAP: string }
const { armTripwire } = cjs('./tests/real-home-tripwire.cjs') as { armTripwire: (l: string) => unknown }

// ── T-450 / S2: `pnpm test` runs THIS, and it had no floor ────────────────────
//
// The acceptance is scoped to the command a developer actually types. `pnpm test`
// is `turbo run test`, which runs `vitest run` in both packages — Playwright is
// `pnpm smoke`. QA measured the consequence: a vitest test that deleted the real
// home reported "2 passed", exit 0, with `spawn` unpatched, `process.binding`
// unrefused and `_electron` unpatched.
//
// Armed at MODULE SCOPE, which for vitest is the main process before globalSetup
// and before the worker pool forks — so a `globalSetup` mutation is inside the
// observed window (S3), and `PRODUCTUNE_REAL_HOME` is exported into the
// environment every worker inherits. The VERDICT is
// scripts/vitest-real-home-verdict.ts (globalSetup below).
armTripwire('packages/gui vitest.config.ts module scope')

export default defineConfig({
  test: {
    // PREVENTION for this runner. `--require` at worker STARTUP, not a setupFile:
    // a setup file runs after vitest's own runtime has imported
    // `node:child_process`, and a named ESM binding captured before the patch
    // stays unpatched (measured — boundary ① in tests/isolation-enforcer.ts).
    execArgv: ['--require', BOOTSTRAP],
    // T-450 THE FLOOR: the run's verdict. A config field, so `--reporter` cannot
    // remove it — which is exactly how S4 removed the R1 floor.
    globalSetup: ['../../scripts/vitest-real-home-verdict.ts'],
    // Unit tests only — Playwright smoke lives in tests/ and is excluded here.
    // electron/, src/ and shared/ are the locations with .test.ts files;
    // scripts/qa/ holds standalone QA harness utilities (e.g. frontmostGate)
    // with their own tests. (shared/ = T-434 F8: dependency-free modules both
    // the main and renderer sides import, so neither owns the other's copy.)
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'electron/**/*.test.ts',
      'shared/**/*.test.ts',
      'scripts/qa/**/*.test.ts',
    ],
    // Explicitly exclude Playwright specs so they are never picked up by vitest.
    exclude: ['tests/**', 'node_modules/**'],
    environment: 'node',
    globals: false,
    // Setup files, in order:
    //   1. T-442 HOME sandbox — must run FIRST, before any test module (and so
    //      before module-level constants like ipc/project.ts RECENTS_PATH and
    //      ipc/usageWatch.ts USAGE_FILE) resolves os.homedir().
    //   2. module mocks.
    setupFiles: ['../../scripts/vitest-home-sandbox.ts', './vitest.setup.ts'],
    // Resolve aliases matching vite.config (needed if test files use @ aliases).
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
