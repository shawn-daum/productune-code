/**
 * vitest-subprocess-timeout-shim.cjs — T-649. A subprocess killed by its
 * `timeout:` reports as a TIMEOUT DEATH, never as an assertion failure.
 *
 * THE SHAPE THIS REMOVES
 *
 * `execFileSync(…, { timeout })` throws `Error: spawnSync python3 ETIMEDOUT` —
 * readable, but it prints as an ordinary red test. `spawnSync` is worse: it
 * RETURNS `{ status: null, signal: 'SIGTERM', error: ETIMEDOUT }`, the test then
 * asserts `status === 0` and the report says `expected null to be 0` — a busy
 * machine dressed as a regression. That exact line misled the PO on 2026-09-17.
 *
 * WHAT IT DOES
 *
 * Wraps the three synchronous launchers on the `child_process` module object:
 *   • `execFileSync` / `execSync`: an ETIMEDOUT throw is re-labelled
 *     `SubprocessTimeout` (same object — status/stdout/stderr/code stay);
 *   • `spawnSync`: an ETIMEDOUT result THROWS `SubprocessTimeout` instead of
 *     returning, so the failure lands on the launch line, not on a later
 *     `expect`. No test in this package asserts a timeout kill (every `.signal`
 *     assertion is `toBeNull()`); a future one would say so and opt out.
 * Every message carries the budget that fired and the run's whole budget line
 * (`vitest-timeouts.cjs describe()`), so the report is self-explaining.
 *
 * Nothing else is touched: no option but `timeout` is added (T-1478, below —
 * on a copy, never the caller's object), no HOME/cwd rule lives here
 * (those are `packages/gui/tests/isolation-rules.cjs`, loaded by the entry
 * BEFORE this one in `execArgv`; this wrapper sits on top of that one and
 * forwards every call).
 *
 * WHY `execArgv --require` AND NOT A SETUP FILE
 *
 * Same reason as the isolation bootstrap: it has to be on the module object
 * before anything imports `child_process`. Wrapping the export of `spawnSync`
 * does not reach `execFileSync` (node's `execFileSync` calls its module-local
 * `spawnSync`, not the export), so all three are wrapped separately.
 *
 * T-1478 — EVERY LAUNCH CARRIES A KILL TIMEOUT
 *
 * On 2026-11-09 a `prdt track merge` test run hung 1h40m: a hook's python sat
 * on a stdin read (0% CPU) inside a `spawnSync` with no `timeout:`. A
 * synchronous launch blocks the worker's event loop, so vitest's own per-test
 * timer can not fire until the child exits — which it never did. 207 of 257
 * `spawnSync` calls in this package carried no `timeout:` (grep, 2026-11-09).
 *
 * So this shim no longer only relabels a timeout that fired; it makes sure one
 * exists. Every launcher — the three sync ones above plus `spawn` · `exec` ·
 * `execFile` · `fork` — gets, when the caller passed no `timeout`, the budget
 * of whatever is running it (`defaultTimeoutMs`):
 *   • inside a test: that test's own vitest timeout (`task.timeout` — the
 *     config's scaled `testTimeout`, or the per-test override). A sync child
 *     running past it fails the test anyway (vitest checks the elapsed time
 *     once the body returns), so killing it there changes no verdict — it only
 *     turns "never returns" into "fails at the budget";
 *   • anywhere else (module scope, beforeAll/afterAll — hook timeouts are not
 *     visible from the worker): the largest subprocess tier, `doctor`, scaled.
 * An explicit opt-out (`timeout: 0`, a negative, `Infinity`, a non-number)
 * THROWS `UntimedSubprocess` before anything is launched: a test that wants a
 * long child names a budget from test/helpers/subprocess-timeout.ts.
 *
 * One place, not 207 call sites: a new untimed call is covered the day it is
 * written, and test/subprocess-default-timeout.test.ts fails if the core config
 * stops loading this file.
 *
 * Only the direct child is killed (node's `timeout` semantics). A grandchild
 * holding the pipes does not keep a sync call from returning (measured,
 * node 22: returns at the budget), but it is left running.
 */

'use strict'

const cp = require('child_process')
const path = require('path')
const util = require('util')
const timeouts = require(path.join(__dirname, 'vitest-timeouts.cjs'))

const NAME = 'SubprocessTimeout'

function optionsOf(callArgs) {
  for (let i = callArgs.length - 1; i >= 1; i--) {
    const a = callArgs[i]
    if (a && typeof a === 'object' && !Array.isArray(a)) return a
  }
  return {}
}

function commandOf(callArgs) {
  const file = String(callArgs[0] ?? '')
  const args = Array.isArray(callArgs[1]) ? callArgs[1] : []
  const shown = [file, ...args.map(String)].map((s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s))
  return shown.join(' ')
}

function isTimeout(err) {
  return Boolean(err) && err.code === 'ETIMEDOUT'
}

/** Relabel IN PLACE: the error keeps its identity, status, stdout, stderr. */
function mark(err, how, callArgs) {
  const opts = optionsOf(callArgs)
  err.name = NAME
  err.subprocessTimeout = true
  err.message =
    `[SUBPROCESS TIMEOUT] child_process.${how} killed after ${opts.timeout}ms` +
    (defaulted.has(opts) ? ` (no timeout given — default: ${defaulted.get(opts)})` : '') +
    `: ${commandOf(callArgs)}\n` +
    `This is a timeout death, NOT an assertion failure — the child was still running when its budget ran out.\n` +
    `Run budget: ${timeouts.describe()}\n` +
    `Raise the budget for this run with ${timeouts.SCALE_ENV}=<factor>, or lower the load, then re-run.\n` +
    `(original: ${err.message})`
  return err
}

const UNTIMED = 'UntimedSubprocess'

/** The vitest task running right now: a test while its body (and its
 *  beforeEach/afterEach) runs, a suite or file otherwise. vitest-internal
 *  worker state (`__vitest_worker__.current`, vitest 4); absent outside vitest. */
function currentTask() {
  const state = globalThis.__vitest_worker__
  return state && state.current ? state.current : undefined
}

/** Kill budget for a launch that named none — see the header. */
function defaultTimeoutMs() {
  const task = currentTask()
  if (task && task.type === 'test' && Number.isFinite(task.timeout) && task.timeout > 0) {
    return { ms: task.timeout, from: `this test's own timeout` }
  }
  return { ms: timeouts.subprocessMs('doctor'), from: `the largest subprocess tier (doctor), outside a test body` }
}

/** Launchers whose second argument may be an args array. */
const TAKES_ARGS = new Set(['spawnSync', 'execFileSync', 'spawn', 'execFile', 'fork'])

function isOptions(a) {
  return Boolean(a) && typeof a === 'object' && !Array.isArray(a)
}

/**
 * Return a NEW argument list whose options object carries a valid `timeout`.
 * The caller's options object is never mutated (tests reuse them).
 */
function withTimeout(name, callArgs) {
  const args = callArgs.slice()
  const at = TAKES_ARGS.has(name) && (Array.isArray(args[1]) || (args[1] == null && args.length > 2)) ? 2 : 1
  let opts = args[at]
  if (opts == null) {
    opts = {}
    args[at] = opts
  } else if (!isOptions(opts)) {
    // a callback (exec · execFile) where the options would go
    opts = {}
    args.splice(at, 0, opts)
  }
  const t = opts.timeout
  if (t === undefined || t === null) {
    const d = defaultTimeoutMs()
    args[at] = Object.assign({}, opts, { timeout: d.ms })
    defaulted.set(args[at], d.from)
    return args
  }
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) {
    const err = new Error(
      `[UNTIMED SUBPROCESS] child_process.${name}() with timeout ${String(t)}: ${commandOf(args)}\n` +
        `Every subprocess a test launches has a kill timeout (T-1478) — a hung child otherwise hangs the whole run.\n` +
        `Omit \`timeout\` to get this test's own budget, or pass subprocessTimeout('<tier>') from test/helpers/subprocess-timeout.ts.`,
    )
    err.name = UNTIMED
    throw err
  }
  return args
}

/** Options objects this shim filled in → where the number came from. */
const defaulted = new WeakMap()

function wrapThrowing(name) {
  const original = cp[name]
  if (typeof original !== 'function') return
  cp[name] = function timeoutLabelled(...callArgs) {
    const args = withTimeout(name, callArgs)
    try {
      return original.apply(this, args)
    } catch (err) {
      throw isTimeout(err) ? mark(err, `${name}()`, args) : err
    }
  }
}

function wrapSpawnSync() {
  const original = cp.spawnSync
  if (typeof original !== 'function') return
  cp.spawnSync = function timeoutLabelledSpawnSync(...callArgs) {
    const args = withTimeout('spawnSync', callArgs)
    const result = original.apply(this, args)
    if (result && isTimeout(result.error)) {
      const err = mark(result.error, 'spawnSync()', args)
      err.status = result.status
      err.signal = result.signal
      err.stdout = result.stdout
      err.stderr = result.stderr
      throw err
    }
    return result
  }
}

/** Async launchers: only the default timeout. A timed-out async child exits by
 *  its kill signal and the test sees that the way it sees any exit. */
function wrapAsync(name) {
  const original = cp[name]
  if (typeof original !== 'function') return
  const wrapped = function timeoutDefaulted(...callArgs) {
    return original.apply(this, withTimeout(name, callArgs))
  }
  // `exec` / `execFile` carry a custom promisified form that resolves
  // `{ stdout, stderr }`; without it `util.promisify(execFile)` resolves the
  // bare stdout string and every `const { stdout } = await …` caller breaks.
  const custom = original[util.promisify.custom]
  if (typeof custom === 'function') {
    wrapped[util.promisify.custom] = function timeoutDefaultedPromise(...callArgs) {
      return custom.apply(this, withTimeout(name, callArgs))
    }
  }
  cp[name] = wrapped
}

wrapThrowing('execFileSync')
wrapThrowing('execSync')
wrapSpawnSync()
for (const name of ['spawn', 'exec', 'execFile', 'fork']) wrapAsync(name)

module.exports = { NAME, UNTIMED, defaultTimeoutMs, withTimeout }
