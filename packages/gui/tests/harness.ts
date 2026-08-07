/**
 * harness.ts — the ONLY sanctioned way to boot the app from a Playwright spec.
 *
 * T-442 F1/F3/F5. The 2026-07-30 runaway was caused by the app; what kept the
 * developer's real home BROKEN afterwards was the verification itself. Specs
 * called `electron.launch({ args: [main] })` with no `env`, so the packaged-layout
 * app booted against the REAL `$HOME` and rewrote `~/.productune/toolchain`
 * on every run — including the regression run that was supposed to prove the
 * repair. A test that damages the thing it verifies cannot verify anything.
 *
 * Containment is TWO independent redirections, because on macOS they are
 * genuinely separate mechanisms (measured, not assumed — 2026-08-03):
 *
 *   1. `env.HOME`  →  moves everything Node resolves through `os.homedir()`:
 *      ~/.productune (toolchain shims, recents, settings, usage-state),
 *      ~/.prdt, ~/.claude, ~/productune (projects base).
 *
 *   2. `--user-data-dir`  →  moves Electron's userData. `HOME` does NOT do
 *      this: Chromium takes `app.getPath('appData')` from the OS account, not
 *      from the environment, so a HOME-only sandbox still writes
 *      `~/Library/Application Support/productune` (Cache, Local Storage,
 *      DevToolsActivePort) and — F5 — still grabs the single-instance lock,
 *      which is filesystem-scoped to userData. That is how a verification run
 *      could kill or steal focus from the user's real running app.
 *
 * Verified for this Electron (36.9.5):
 *   HOME=<sandbox> electron main.js            → userData = REAL ~/Library/…  ✗
 *   HOME=<sandbox> electron main.js --user-data-dir=<sandbox>/…  → sandboxed  ✓
 *   same --user-data-dir  → second instance gets requestSingleInstanceLock()=false
 *   different --user-data-dir → both get true (no cross-talk with the real app)
 *
 * Defence in depth — three layers, so the next spec cannot repeat this:
 *   L1 `playwright.config.ts` repoints `process.env.HOME` at a sandbox for the
 *      runner AND every worker, so even a launch that forgets `env` is safe by
 *      default.
 *   L2 this harness, the sanctioned launcher: it applies both redirections and
 *      refuses any HOME under the real home.
 *   L3 `tests/isolation-enforcer.ts`, installed from `playwright.config.ts` in
 *      every worker: it wraps `_electron.launch` (and app-shaped
 *      `child_process` launches) and REJECTS any call whose HOME or
 *      `--user-data-dir` is missing or inside the real home. This is the hard
 *      gate. Round 2 tried to do L3 as a static scan over `readdirSync(tests/)`
 *      filtered to `.spec.ts`; QA bypassed it three ways (subdirectory,
 *      `.test.ts`, a non-spec helper) and each bypass rewrote the real userData.
 *      A file set was the wrong unit — the function is the chokepoint.
 *   L4 `tests/isolation-scan.ts` + `isolation.guard.spec.ts`: the recursive
 *      static scan, kept as the readable early failure and as a real-home
 *      fingerprint tripwire for shapes L3 cannot see.
 *
 * The harness gets no exemption from L3. It is safe because it satisfies the
 * checks, not because it is named anywhere.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { insideRealHome, protectedRealPaths, realHome } from './isolation-enforcer'

export const GUI_ROOT = path.resolve(__dirname, '..')
export const MAIN = path.join(GUI_ROOT, 'dist-electron', 'main.js')

/**
 * The developer's REAL home. Captured by playwright.config.ts BEFORE it
 * repoints `process.env.HOME`, so `os.homedir()` here would already be the
 * sandbox — the env var is the only surviving record of the real one.
 */
export const REAL_HOME = realHome()

/**
 * Sandbox root. Deliberately under the OS temp dir and NOT under the repo:
 * the repo itself lives inside the real home, and `assertOutsideRealHome`
 * rejects every path under the real home without exception.
 */
export const SANDBOX_ROOT = path.join(os.tmpdir(), 'productune-pw-sandbox')

/** The default HOME every spec inherits (see playwright.config.ts). */
export const DEFAULT_SANDBOX_HOME = path.join(SANDBOX_ROOT, 'default-home')

/**
 * Real-home paths a spec must never be able to touch. Defined once, in
 * `isolation-enforcer.ts`, so the advisory check here and the hard runtime
 * check there can never disagree about what "the real home" means.
 */
export const PROTECTED_REAL_PATHS = protectedRealPaths()

/**
 * Throw unless `p` is outside the developer's real home, full stop.
 *
 * `p` goes to `insideRealHome()` RAW. QA R3 found this call site pre-folding it
 * with `path.resolve()` first — which collapses `..` lexically, so
 * `<real home>/link/..` became a path outside the home before the predicate ever
 * saw it, reviving in one place the laundering the identity design exists to
 * remove. `insideRealHome()` already resolves relative paths itself, against the
 * kernel rather than against the string.
 */
export function assertOutsideRealHome(p: string, label: string): void {
  if (insideRealHome(p)) {
    throw new Error(
      `${label} resolves inside the REAL home (${p}). A test may never write there — ` +
        `use sandboxHome() from tests/harness.ts. (T-442 F1)`,
    )
  }
}

/**
 * A fresh, empty HOME for one spec. `tag` only makes the directory readable in
 * a listing. Nothing is seeded: a spec that needs onboarding markers writes
 * them itself, so what the app sees is always stated in the spec, never
 * inherited from the machine it happens to run on.
 */
export function sandboxHome(tag: string): string {
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  const home = fs.mkdtempSync(path.join(SANDBOX_ROOT, `${tag}-`))
  assertOutsideRealHome(home, `sandboxHome(${tag})`)
  return home
}

export interface LaunchOpts {
  /** HOME for the app. Defaults to the shared sandbox home. */
  home?: string
  /** Extra env on top of the sandboxed base. */
  env?: Record<string, string>
  /** Extra argv after the main script + --user-data-dir. */
  args?: string[]
}

/**
 * Boot the real packaged-layout app, fully contained.
 *
 * Both redirections are applied unconditionally — there is no opt-out, because
 * every opt-out in this file's history became the next incident.
 */
export async function launchApp(opts: LaunchOpts = {}): Promise<ElectronApplication> {
  const home = opts.home ?? DEFAULT_SANDBOX_HOME
  assertOutsideRealHome(home, 'launchApp home')

  // userData lives INSIDE the sandbox home, so cleaning the home cleans it too.
  const userDataDir = path.join(home, 'Library', 'Application Support', 'productune')
  assertOutsideRealHome(userDataDir, 'launchApp userDataDir')
  fs.mkdirSync(userDataDir, { recursive: true })

  return electron.launch({
    args: [MAIN, `--user-data-dir=${userDataDir}`, ...(opts.args ?? [])],
    cwd: GUI_ROOT,
    env: {
      ...process.env,
      HOME: home,
      ...(opts.env ?? {}),
    } as Record<string, string>,
  })
}

/** Remove a sandbox home. Refuses anything under the real home. */
export function cleanupHome(home: string): void {
  assertOutsideRealHome(home, 'cleanupHome')
  fs.rmSync(home, { recursive: true, force: true })
}
