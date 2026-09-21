/**
 * vitest-timeouts.cjs — T-649. THE ONE PLACE every test-run timeout comes from.
 *
 * WHY THIS EXISTS
 *
 * Measured 2026-09-17 (ticket T-649): 101 test files, 79 of them shelling out
 * through `execFileSync`/`spawnSync`, each with its own literal —
 * `timeout: 30000` ×32 · `20000` ×23 · `60000` ×21 · `10000` ×8. No vitest flag
 * reaches those numbers: `--testTimeout` raises the TEST budget, the subprocess
 * keeps its own. On this machine (load 8–17 during a working session, spawn
 * alone measured at 0.2–4.5 s under the sandbox) the subprocess number fires
 * first, and a busy machine reports as a red assertion. The PO was misled twice
 * in one day by that.
 *
 * WHAT THIS IS
 *
 *   • four BASE budgets, one per subprocess class (`TIERS`), plus vitest's own
 *     per-test and per-hook bases (T-536 recorded `testTimeout: 15_000`; the
 *     hook base is vitest's 10 s default, which the fixtures here exceed at
 *     load 10 — fact--cli-pty-testing);
 *   • ONE scale factor, resolved once per run: `PRDT_TEST_TIMEOUT_SCALE` when
 *     set (explicit, reproducible), else derived from the 1-minute load
 *     average (`autoScale`). Every budget is `base × scale`.
 *
 * WHO READS IT
 *
 *   • `packages/core/vitest.config.ts` (via `createRequire` — the config is
 *     bundled by esbuild and a bundled `require()` throws, see the note in
 *     packages/gui/vitest.config.ts) → `testTimeout`, `hookTimeout`,
 *     `maxWorkers`, and `pin()` so every worker inherits the SAME scale;
 *   • `packages/core/test/helpers/subprocess-timeout.ts` → what a test file
 *     passes as `timeout:` to `execFileSync`/`spawnSync`;
 *   • `scripts/vitest-subprocess-timeout-shim.cjs` → the wording of a
 *     timeout death, so the report names the budget that was exceeded;
 *   • `scripts/vitest-timeout-tally.ts` → the one-line budget banner.
 *
 * `.cjs` for the same reason `real-home-tripwire.cjs` is: loadable by a bare
 * `node --require`, by the esbuild-bundled config, and by a vitest-transformed
 * test file, with no bundler or transform in the way.
 */

'use strict'

const os = require('os')

/** Subprocess base budgets (ms), by what the child is. */
const TIERS = Object.freeze({
  /** hang guards: "did not block on stdin / did not walk up forever" — the
   *  assertion is `signal === null`; a real hang runs to the 60 s hook cap */
  quick: 5_000,
  /** one Claude Code hook script (`bash <hook>` with a JSON event on stdin) */
  hook: 10_000,
  /** one `prdt` CLI command other than doctor (init · wiki · tickets · …) */
  cli: 30_000,
  /** `prdt doctor` — walks the repo and spawns git/python3 many times */
  doctor: 60_000,
})

/** vitest per-test base — T-536: hang detection, not permission to be slow. */
const TEST_BASE_MS = 15_000
/** vitest per-hook base — vitest's default; `--testTimeout` never touches it. */
const HOOK_BASE_MS = 10_000

const SCALE_ENV = 'PRDT_TEST_TIMEOUT_SCALE'
const WORKERS_ENV = 'PRDT_TEST_MAX_WORKERS'

const SCALE_MIN = 1
const SCALE_MAX = 6

/**
 * Default worker count — MEASURED, see T-649 §Outcome for the `--maxWorkers`
 * steps (wall · pass · timeout deaths · assertion fails · load at the time).
 * vitest's own default is `cpus - 1` (13 here), which is the pool that produced
 * 0 output for 24 minutes and two OOM kills on 2026-09-17.
 */
const DEFAULT_MAX_WORKERS = 4

function cpuCount() {
  return typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length
}

/**
 * Load-derived scale. The 1-minute load average is what this machine's history
 * correlates with: the same file passes at load 4 and times out at load 10.
 *
 *   scale = 1 + load1 / (cpus / 2)      clamped to [1, 6], one decimal
 *
 * 14 cpus: load 3.5 → 1.5 · load 7 → 2.0 · load 10 → 2.4 · load 17 → 3.4.
 * The rule is a starting point calibrated against the T-649 step measurements;
 * `PRDT_TEST_TIMEOUT_SCALE` overrides it when a run needs a fixed number.
 */
function autoScale(load1 = os.loadavg()[0], cpus = cpuCount()) {
  const raw = 1 + load1 / Math.max(1, cpus / 2)
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, raw))
  return Math.round(clamped * 10) / 10
}

let resolved = null

/** The run's scale: env when set and sane, else load-derived. Resolved once. */
function scale() {
  if (resolved !== null) return resolved
  const fromEnv = Number.parseFloat(process.env[SCALE_ENV] ?? '')
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    resolved = { value: fromEnv, source: 'env', load1: os.loadavg()[0], cpus: cpuCount() }
  } else {
    const load1 = os.loadavg()[0]
    const cpus = cpuCount()
    resolved = { value: autoScale(load1, cpus), source: 'load', load1, cpus }
  }
  return resolved
}

/**
 * Fix the resolved scale into the environment so every vitest worker fork, and
 * every subprocess helper inside it, uses the SAME number as the config did —
 * a worker started five minutes into the run must not re-derive a different
 * scale from a different load reading.
 */
function pin() {
  process.env[SCALE_ENV] = String(scale().value)
  return scale()
}

function scaled(baseMs) {
  return Math.round(baseMs * scale().value)
}

/** Subprocess budget for a tier, scaled. Unknown tier → throws: a typo must not
 *  silently become "no timeout". */
function subprocessMs(tier) {
  const base = TIERS[tier]
  if (base === undefined) {
    throw new Error(`vitest-timeouts: unknown subprocess timeout tier ${JSON.stringify(tier)} — one of ${Object.keys(TIERS).join(' · ')}`)
  }
  return scaled(base)
}

function testTimeoutMs() {
  return scaled(TEST_BASE_MS)
}

function hookTimeoutMs() {
  return scaled(HOOK_BASE_MS)
}

/** Worker count: `PRDT_TEST_MAX_WORKERS` when set, else the measured default.
 *  A `--maxWorkers` CLI flag still wins over both (vitest merges CLI over config). */
function maxWorkers() {
  const fromEnv = Number.parseInt(process.env[WORKERS_ENV] ?? '', 10)
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_WORKERS
}

/** One line naming every number a run is using — printed once by the tally
 *  reporter, and repeated in each timeout death so the report is self-contained. */
function describe() {
  const s = scale()
  const tiers = Object.entries(TIERS).map(([k, v]) => `${k} ${fmt(scaled(v))}`).join(' · ')
  return (
    `scale ${s.value} (${s.source === 'env' ? `${SCALE_ENV}` : `load ${s.load1.toFixed(1)}/${s.cpus} cpus`})` +
    ` · subprocess ${tiers} · test ${fmt(testTimeoutMs())} · hook ${fmt(hookTimeoutMs())}`
  )
}

function fmt(ms) {
  return `${Math.round(ms / 100) / 10}s`
}

module.exports = {
  TIERS,
  TEST_BASE_MS,
  HOOK_BASE_MS,
  SCALE_ENV,
  WORKERS_ENV,
  DEFAULT_MAX_WORKERS,
  autoScale,
  scale,
  pin,
  subprocessMs,
  testTimeoutMs,
  hookTimeoutMs,
  maxWorkers,
  describe,
}
