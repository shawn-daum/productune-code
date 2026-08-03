/**
 * vitest-home-sandbox.ts — the unit-test half of T-442's isolation fix.
 *
 * Referenced from every package's `vitest.config.ts` as the FIRST entry in
 * `setupFiles`, so it runs before any test module — and therefore before any
 * module-level constant computed from `os.homedir()` is evaluated
 * (`ipc/project.ts` RECENTS_PATH, `ipc/usageWatch.ts` USAGE_FILE,
 * `git-workflow/rules.ts` GLOBAL_DEFAULT_PATH, …).
 *
 * WHY THIS EXISTS
 *
 * T-442's QA rows were about Playwright specs, but auditing the whole repo for
 * the same defect turned up unit tests doing it too — and they had already
 * written to the developer's real home:
 *
 *   • four `packages/core/test/scripts/prdt-*.test.ts` files shell out to the
 *     real `prdt` CLI with an inherited HOME; `trust_accept_project` then
 *     rewrites the real `~/.claude.json` (leaving `~/.claude.json.bak.<ts>`
 *     litter) with a `projects[<tmpdir>]` entry per run.
 *   • `packages/core/test/git-workflow/rules.test.ts` calls `getDefault()`,
 *     which AUTO-CREATES `~/.productune/git-rules.default.json` on first run.
 *     That file is present in the developer's real home right now; a test put
 *     it there.
 *
 * Fixing those five call sites would not have been the fix. The reason the
 * repo kept re-acquiring this defect is that the unsafe thing was the DEFAULT:
 * `os.homedir()` is what you get when you pass nothing, and half these APIs
 * take an optional `homeDir` precisely so tests can opt IN to safety. Opt-in
 * safety is the bug. This file inverts it — a test now has to work at it to
 * reach the real home, and one that forgets simply lands in a temp dir.
 *
 * `os.homedir()` reads $HOME on POSIX, and Python's `Path.home()` does too, so
 * one env var covers both the Node tests and the `prdt` CLI subprocesses they
 * spawn. It does NOT cover Electron's userData (Chromium takes that from the
 * OS account, not the environment) — but GUI unit tests already stub
 * `app.getPath` and never boot Electron, and the Playwright specs handle
 * userData explicitly via `--user-data-dir` in packages/gui/tests/harness.ts.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * CLEANUP — T-442 F-C.
 *
 * The first version created `<tmp>/productune-vitest-home-<pid>-XXXXXX` and
 * relied on `process.on('exit')`. In a vitest worker pool that hook is not
 * reliable: a worker torn down by the pool, or SIGKILLed, never runs it. It
 * leaked one directory per worker per run, unbounded — measured at 351 dirs
 * (176 KB) on the developer host and 4 in the VM. The contents are harmless
 * (they are, in fact, evidence that the redirection works), but "harmless and
 * infinite" is still a defect, and it grows every single run.
 *
 * Two changes make it self-limiting instead of merely tidy:
 *   • every sandbox now lives under ONE parent directory, so the leak is a
 *     single sweepable location rather than debris scattered through $TMPDIR;
 *   • each worker sweeps siblings on startup. A sibling is removed when its
 *     owning pid is gone (`kill(pid, 0)` → ESRCH), which is exact, or when it
 *     is older than MAX_AGE_MS, which covers pid reuse and the pre-T-442
 *     layout. A live sibling from a concurrent run is never touched.
 *
 * `process.on('exit')` is kept as the fast path for the normal case; the sweep
 * is what bounds the failure case.
 */
const SANDBOX_ROOT = path.join(os.tmpdir(), 'productune-vitest-home')
const LEGACY_PREFIX = 'productune-vitest-home-' // flat $TMPDIR layout, pre-T-442 F-C
const MAX_AGE_MS = 6 * 60 * 60 * 1000

/** True when no live process owns this pid. */
function ownerGone(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0) // signal 0: existence check only, sends nothing
    return false
  } catch (e) {
    // EPERM means it exists but belongs to another user — treat as alive.
    return (e as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function sweep(dir: string, entryPrefix: string): void {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  const now = Date.now()
  for (const name of entries) {
    if (!name.startsWith(entryPrefix)) continue
    const full = path.join(dir, name)
    // `<prefix><pid>-<random>` → pid
    const pid = Number.parseInt(name.slice(entryPrefix.length).split('-')[0] ?? '', 10)
    let stale = ownerGone(pid)
    if (!stale) {
      try {
        stale = now - fs.statSync(full).mtimeMs > MAX_AGE_MS
      } catch {
        continue
      }
    }
    if (stale) {
      try { fs.rmSync(full, { recursive: true, force: true }) } catch { /* another worker won the race */ }
    }
  }
}

fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
sweep(SANDBOX_ROOT, '')
sweep(os.tmpdir(), LEGACY_PREFIX)

// One sandbox per worker process, so parallel vitest workers cannot collide on
// a shared fixture file and produce order-dependent failures. The pid is in the
// name because the sweep above reads it back.
const sandbox = fs.mkdtempSync(path.join(SANDBOX_ROOT, `${process.pid}-`))

process.env.PRODUCTUNE_REAL_HOME ??= os.homedir()
process.env.HOME = sandbox

process.on('exit', () => {
  try { fs.rmSync(sandbox, { recursive: true, force: true }) } catch { /* the sweep gets it next run */ }
})
