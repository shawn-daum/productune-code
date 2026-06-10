import { defineConfig } from '@playwright/test'

// Smoke-only config — Electron app driven via _electron.launch (tests/smoke.spec.ts).
// No browser projects; the Electron binary comes from the local devDependency.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
})
