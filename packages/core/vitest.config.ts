import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pick up .test.ts files under test/ only (NOT .mjs shims which run separately)
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Each test file runs in its own isolated Node environment
    environment: 'node',
    globals: false,
  },
})
