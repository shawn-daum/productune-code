import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Unit tests only — Playwright smoke lives in tests/ and is excluded here.
    // electron/ and src/ are the two locations with .test.ts files; scripts/qa/
    // holds standalone QA harness utilities (e.g. frontmostGate) with their own tests.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'electron/**/*.test.ts',
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
