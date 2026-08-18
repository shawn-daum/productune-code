import fs from 'fs'
import os from 'os'
import path from 'path'
import { defineConfig } from '@playwright/test'
import { installIsolationEnforcer } from './tests/isolation-enforcer'
import { armTripwire } from './tests/real-home-tripwire'

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

// ── T-442 F-A / T-450: prevention, one layer among several ───────────────────
//
// Round 2 enforced "no spec launches Electron outside the harness" by reading
// `readdirSync(tests/)` filtered to `.spec.ts`. Playwright's default testMatch
// is recursive and also matches `.test.ts`, and a spec can put the banned call
// in a plain helper module — QA walked through all three gaps and each bypass
// mutated the REAL ~/Library/Application Support/productune.
//
// A file set is the wrong unit, so enforcement moved to the functions
// themselves. But T-442's justification for that — "Node's module cache is
// per-process" — is WRONG, and QA R3 proved it: a module cache is per-REALM. A
// `worker_threads` worker got none of these patches, booted the real app, wrote
// SingletonLock/SingletonSocket/SingletonCookie into the real userData, and
// Playwright reported PASSED.
//
// T-450 draws the consequence in two places. Here, the rules became realm-aware
// (see tests/isolation-realm-bootstrap.cjs, carried into new realms via
// `--require`). Below, DETECTION became the floor: the tripwire reporter is what
// actually makes the guarantee, because "every way to reach a launcher" is not an
// enumerable set and three rounds of trying to enumerate it produced three
// escapes.
//
// Must run AFTER the HOME repoint above, so the enforcer records the real home
// from PRODUCTUNE_REAL_HOME rather than the sandbox.
installIsolationEnforcer()

// ── T-450 R2: THE FLOOR IS ARMED HERE, AT MODULE SCOPE ───────────────────────
//
// Not in `globalSetup`, and not in the reporter's `onBegin`. QA broke both of
// those in R1:
//
//   S3  `onBegin` fires AFTER `globalSetup`, so a globalSetup that deleted the
//       real home was completely invisible — exit 0, "real home unchanged", home
//       actually gone. Config module scope is the earliest executable point in
//       the process, so a globalSetup mutation is now INSIDE the observed window.
//   S4  `--reporter=line` replaces this config's reporter array, which silently
//       removed the entire floor. The verdict therefore moved to `globalTeardown`
//       below — a config field with no CLI override.
//
// This runs in the runner AND in every worker (Playwright evaluates the config in
// both); `armTripwire` is idempotent across processes via the run id it exports
// into the environment, so only the first caller takes a baseline.
armTripwire('playwright.config.ts module scope')

/**
 * `testDir` is read back by isolation.guard.spec.ts, which scans it recursively
 * and cross-checks its file set against Playwright's own `--list` output. Point
 * this somewhere else and the guard follows it; widen collection and the guard
 * notices. Do not inline the literal in two places.
 */
export const TEST_DIR = './tests'

/**
 * T-450: this machine's run rule, as configuration rather than convention.
 *
 * `docs/wiki/fact--qa-cua-vm.md` — if it opens a window it runs in the lume VM
 * `cua`, packaged or dev-layout alike. The host may only run what creates no
 * window. Tests that boot the app carry `@window` in their title and are
 * grep-inverted out of a host run; the VM sets PRODUCTUNE_ALLOW_WINDOWS=1 to get
 * them back.
 *
 * The tag is not the enforcement — a new test that forgets the tag would still
 * open a window. `tests/isolation-rules.cjs` refuses `_electron.launch` outright
 * unless PRODUCTUNE_ALLOW_WINDOWS=1, so an untagged window test fails with an
 * instruction instead of stealing the developer's focus. The tag only keeps the
 * host run green instead of red-by-design.
 */
export const ALLOW_WINDOWS = process.env.PRODUCTUNE_ALLOW_WINDOWS === '1'

/** Title marker for "this test boots the app and therefore opens a window". */
export const WINDOW_TAG_PATTERN = /@window/

/**
 * Collection-only mode, for `isolation.guard.spec.ts`'s coverage cross-check.
 *
 * That check asks the runner what it collects and compares it against what the
 * scan reads. Under `grepInvert` the listing omits every file whose tests are all
 * `@window` — which is precisely the set most likely to launch something, so the
 * cross-check would go quietly vacuous exactly where it matters most.
 *
 * It cannot instead set PRODUCTUNE_ALLOW_WINDOWS for the child: the guard in
 * `tests/isolation-rules.cjs` deliberately refuses to let a child grant itself
 * window permission the parent does not have. So collection completeness gets its
 * own switch, which grants nothing — `--list` never executes a test, and if this
 * variable were ever set for a real run the launcher would still refuse every
 * launch, so the failure mode is red tests, never an unexpected window.
 */
const COLLECT_ALL = process.env.PRODUCTUNE_ISOLATION_LIST === '1'

export default defineConfig({
  testDir: TEST_DIR,
  timeout: 60_000,
  workers: 1,
  ...(ALLOW_WINDOWS || COLLECT_ALL ? {} : { grepInvert: WINDOW_TAG_PATTERN }),
  // T-450 R2 THE FLOOR. Compares against the module-scope baseline above and
  // throws if the real home moved, which exits 1 even when every test passed
  // (measured). A config field on purpose: `--reporter` cannot remove it, which
  // is precisely how S4 removed the R1 floor.
  globalTeardown: './tests/real-home-tripwire-teardown.ts',
  reporter: [
    ['list'],
    // ATTRIBUTION ONLY, and no longer the guarantee. It names the individual test
    // a drift can be blamed on; if a `--reporter` flag drops it, the run still
    // fails via globalTeardown, just with a less specific message.
    ['./tests/real-home-tripwire-reporter.ts'],
  ],
})
