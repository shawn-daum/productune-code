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
 * Nothing else is touched: no option is rewritten, no HOME/cwd rule lives here
 * (those are `packages/gui/tests/isolation-rules.cjs`, loaded by the entry
 * BEFORE this one in `execArgv`; this wrapper sits on top of that one and
 * forwards every call unchanged).
 *
 * WHY `execArgv --require` AND NOT A SETUP FILE
 *
 * Same reason as the isolation bootstrap: it has to be on the module object
 * before anything imports `child_process`. Wrapping the export of `spawnSync`
 * does not reach `execFileSync` (node's `execFileSync` calls its module-local
 * `spawnSync`, not the export), so all three are wrapped separately.
 *
 * The async launchers (`spawn` · `exec` · `execFile`) are not wrapped: no test
 * here passes them a `timeout`, and a wrapper for a case that does not exist
 * is exactly the owned code doctrine #2 says not to write.
 */

'use strict'

const cp = require('child_process')
const path = require('path')
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
    `[SUBPROCESS TIMEOUT] child_process.${how} killed after ${opts.timeout}ms: ${commandOf(callArgs)}\n` +
    `This is a timeout death, NOT an assertion failure — the child was still running when its budget ran out.\n` +
    `Run budget: ${timeouts.describe()}\n` +
    `Raise the budget for this run with ${timeouts.SCALE_ENV}=<factor>, or lower the load, then re-run.\n` +
    `(original: ${err.message})`
  return err
}

function wrapThrowing(name) {
  const original = cp[name]
  if (typeof original !== 'function') return
  cp[name] = function timeoutLabelled(...callArgs) {
    try {
      return original.apply(this, callArgs)
    } catch (err) {
      throw isTimeout(err) ? mark(err, `${name}()`, callArgs) : err
    }
  }
}

function wrapSpawnSync() {
  const original = cp.spawnSync
  if (typeof original !== 'function') return
  cp.spawnSync = function timeoutLabelledSpawnSync(...callArgs) {
    const result = original.apply(this, callArgs)
    if (result && isTimeout(result.error)) {
      const err = mark(result.error, 'spawnSync()', callArgs)
      err.status = result.status
      err.signal = result.signal
      err.stdout = result.stdout
      err.stderr = result.stderr
      throw err
    }
    return result
  }
}

wrapThrowing('execFileSync')
wrapThrowing('execSync')
wrapSpawnSync()

module.exports = { NAME }
