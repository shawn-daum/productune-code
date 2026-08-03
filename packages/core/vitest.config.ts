import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pick up .test.ts files under test/ only (NOT .mjs shims which run separately)
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Each test file runs in its own isolated Node environment
    environment: 'node',
    globals: false,
    // T-442: repoint HOME at a per-worker temp dir before any test module
    // loads. Several tests here shell out to the real `prdt` CLI (which
    // rewrites ~/.claude.json) or call `getDefault()` (which auto-creates
    // ~/.productune/git-rules.default.json) with an inherited real HOME.
    setupFiles: ['../../scripts/vitest-home-sandbox.ts'],
  },
})
