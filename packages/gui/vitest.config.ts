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
    // Setup file: install module mocks before each test file is loaded.
    setupFiles: ['./vitest.setup.ts'],
    // Resolve aliases matching vite.config (needed if test files use @ aliases).
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
