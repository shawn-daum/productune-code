import fs from 'fs'
import os from 'os'
import path from 'path'
import { defineConfig } from '@playwright/test'
import { installIsolationEnforcer } from './tests/isolation-enforcer'

// Electron app driven via tests/harness.ts `launchApp` (never `_electron.launch`
// directly — see tests/isolation.guard.spec.ts). No browser projects; the
// Electron binary comes from the local devDependency.
//
// ── T-442 F1: layer 1 of test isolation ──────────────────────────────────────
//
// Playwright evaluates this config in the runner AND independently in every
// worker process (measured: config side effects are observable from the specs
// those workers run). That makes this the one place that can make the SAFE
// thing the DEFAULT: we repoint `HOME` at a sandbox here, so an
// `electron.launch` that forgets `env` — the exact mistake that left the
// developer's real `~/.productune` broken across the T-442 repair — inherits
// the sandbox instead of the real home.
//
// This must stay side-effecting at module scope, not inside `globalSetup`:
// globalSetup runs only in the runner, and the paths below are computed
// deterministically (no mkdtemp) precisely so every worker agrees on them.
//
// HOME alone is NOT sufficient — Electron's userData ignores it. The second
// redirection (`--user-data-dir`) lives in tests/harness.ts, which is why the
// harness, not this file, is the sanctioned launch path.

const SANDBOX_ROOT = path.join(os.tmpdir(), 'productune-pw-sandbox')
const DEFAULT_SANDBOX_HOME = path.join(SANDBOX_ROOT, 'default-home')

// Capture the real home BEFORE overwriting HOME — after this, `os.homedir()`
// returns the sandbox and this env var is the only record of the real one.
// `??=` so a worker inheriting the runner's already-sandboxed env keeps the
// real value rather than recording the sandbox as "real".
process.env.PRODUCTUNE_REAL_HOME ??= os.homedir()

fs.mkdirSync(DEFAULT_SANDBOX_HOME, { recursive: true })
process.env.HOME = DEFAULT_SANDBOX_HOME

// ── T-442 F-A: layer 3, moved from a static scan to a runtime chokepoint ─────
//
// Round 2 enforced "no spec launches Electron outside the harness" by reading
// `readdirSync(tests/)` filtered to `.spec.ts`. Playwright's default testMatch
// is recursive and also matches `.test.ts`, and a spec can put the banned call
// in a plain helper module — QA walked through all three gaps and each bypass
// mutated the REAL ~/Library/Application Support/productune.
//
// A file set is the wrong unit. This config module is evaluated in the runner
// and again in every worker, before any collected file loads, and Node's module
// cache is per-process — so wrapping `_electron.launch` HERE covers every
// importer of `@playwright/test` in that worker regardless of the file's name,
// depth, or whether it imported statically, dynamically, or through a helper.
// It also covers shapes not yet invented, which is the acceptance condition.
//
// Must run AFTER the HOME repoint above, so the enforcer records the real home
// from PRODUCTUNE_REAL_HOME rather than the sandbox.
installIsolationEnforcer()

/**
 * `testDir` is read back by isolation.guard.spec.ts, which scans it recursively
 * and cross-checks its file set against Playwright's own `--list` output. Point
 * this somewhere else and the guard follows it; widen collection and the guard
 * notices. Do not inline the literal in two places.
 */
export const TEST_DIR = './tests'

export default defineConfig({
  testDir: TEST_DIR,
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
})
