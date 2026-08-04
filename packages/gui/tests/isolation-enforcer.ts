/**
 * isolation-enforcer.ts — T-442 F-A / T-450. Typed surface over the rules.
 *
 * The rules themselves moved to `isolation-rules.cjs`. This file is a thin typed
 * re-export; there is deliberately no second copy of the logic.
 *
 * WHY THE MOVE (T-450)
 *
 * T-442's comment here asserted: "Node's module cache is per-process, so
 * `@playwright/test` resolved from a spec, from a helper, … is the SAME object."
 * The premise is wrong. A module cache is **per-realm**, and a realm is not a
 * process. QA R3 demonstrated the difference by booting the real app from inside
 * a `worker_threads` worker — a fresh realm with a fresh module cache, where none
 * of the patches existed — which wrote `SingletonLock`, `SingletonSocket` and
 * `SingletonCookie` into the real userData while Playwright reported PASSED.
 *
 * Two consequences, and they point in different directions:
 *
 *  1. Prevention had to become realm-aware. Rules that can be carried into a new
 *     realm must be loadable by a bare `node --require`, i.e. plain CJS on disk —
 *     hence `isolation-rules.cjs`, carried into new realms by
 *     `isolation-realm-bootstrap.cjs`.
 *
 *  2. Prevention stopped being the floor. Three rounds of adding chokepoints
 *     produced three rounds of new escapes, because "every way to reach the
 *     launcher" is not an enumerable set. The floor is now DETECTION:
 *     `real-home-tripwire.ts`, registered as a Playwright REPORTER so it
 *     fingerprints the real home around every test in the run. If the real home
 *     changes during a run, the run goes red — whatever shape did it, in whatever
 *     realm, through an API nobody has thought of yet. Everything in
 *     `isolation-rules.cjs` is a layer on top of that, valuable because it fails
 *     early and names the rule, not because it is complete.
 *
 * ── the two boundary claims T-442 got wrong, corrected ──────────────────────
 *
 * ① "A test file loaded as TRUE ESM would get Node's own frozen
 *    `node:child_process` namespace, which cannot be monkey-patched" — and
 *    therefore the `package.json` `type` pin protects rule 3 from an ESM flip.
 *
 *    Both halves are false, measured. Node builds a builtin's ESM namespace from
 *    that builtin's CJS exports at FIRST IMPORT, so a `.mjs` importing
 *    `node:child_process` AFTER the patch sees the PATCHED functions — QA
 *    measured BLOCKED in a genuine `.spec.mjs`. The pin was guarding a risk that
 *    does not exist.
 *
 *    What the pin actually protects is this package's own CJS assumptions:
 *    `__dirname` across `tests/`, `require()` in the guard spec, and
 *    `require('./isolation-rules.cjs')` here. Flipping to ESM breaks those
 *    loudly, not silently, which is why the assertion is worth keeping — for a
 *    different reason than the one that was written down.
 *
 *    The REAL ESM risk is ORDERING, and the old assertion could not see it: a
 *    module that imports `node:child_process` BEFORE `installIsolationEnforcer()`
 *    runs snapshots the namespace from the then-unpatched exports, and later
 *    patching the CJS object does not update that frozen namespace. So the
 *    invariant to hold is "the enforcer installs before anything captures a
 *    child_process binding", not "the package is CJS".
 *    `isolation.guard.spec.ts` now proves both halves as executable subprocess
 *    experiments instead of asserting a belief.
 *
 *    T-450 R2 / S14 — the same capture-before-install ordering defeats the rules
 *    in EVERY NEW REALM, not only in ESM. A `worker_threads` worker, a `fork()`,
 *    a spawned node child and `vm.createContext` each get a fresh module cache,
 *    so each one re-runs the ordering question from scratch: whatever it imports
 *    before the bootstrap `--require` completes is captured unpatched. That is
 *    why every realm-entry path here injects the bootstrap through `execArgv` or
 *    `NODE_OPTIONS` — both of which run BEFORE the realm's entry module — rather
 *    than by calling `installIsolationEnforcer()` from inside the new realm,
 *    which would always be too late for anything the entry module imported. The
 *    same reasoning is why `vitest.config.ts` uses `execArgv` and not a
 *    `setupFiles` entry: a setup file runs after vitest's own runtime has already
 *    imported `node:child_process`.
 *
 * ② "A spec that spawns a renamed copy of the app binary … is not recognised by
 *    rule 3. Rules 1+2 at the `_electron` level still apply."
 *
 *    False on the `child_process` path. `looksLikeAppLaunch` gating meant that
 *    when the shape was not recognised, `assertContained` was never CALLED — so
 *    rule 1 (HOME) was skipped too, not just rule 2. Nothing at the `_electron`
 *    level applies to a call that never touches `_electron`.
 *
 *    Corrected by separating the two: the HOME rules are refused for EVERY child,
 *    app-shaped or not, while the userData rule stays shape-gated because it only
 *    means anything for an actual Electron launch.
 *
 *    T-450 R2 corrected this correction TWICE more, because the first pass fixed
 *    half of each half:
 *
 *      • only ONE of the two HOME rules had been hoisted out of the shape gate.
 *        The "explicit env with no HOME" rule stayed behind it, so `env: {}` was
 *        handed to an unrecognised child, which then resolved `os.homedir()` from
 *        the OS ACCOUNT and got the real home (S7). Both halves are now in
 *        `assertHomeSafe`, ahead of every gate.
 *      • the shape gate itself was name-based, so a RENAMED COPY of the app binary
 *        skipped rule 2 AND the window rule (S5) — the 2026-07-30 ancestor
 *        incident's exact shape, and the hole under the argument that per-test
 *        `@window` precision could be left to the runtime rule. The gate now also
 *        fires on the mere PRESENCE of `--user-data-dir` and on file identity
 *        (realpath match, byte-size match) against the known Electron binaries, so
 *        the binary's NAME is no longer what decides.
 *
 *    Residual, still honest: a renamed copy that is neither size-identical to a
 *    known Electron binary nor passed `--user-data-dir` is not recognised. Its
 *    userData writes are what the tripwire fingerprints.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

export interface IsolationRules {
  ISOLATION_TAG: string
  WINDOW_TAG: string
  IsolationViolation: new (what: string, detail: string) => Error
  WindowRuleViolation: new (how: string) => Error
  realHome(): string
  protectedRealPaths(): string[]
  insideRealHome(p: string | undefined | null): boolean
  resolveRealPath(p: string): string
  containmentKey(p: string, followLinks?: boolean): string
  pathContains(ancestor: string, p: string | undefined | null): boolean
  assertNotForbiddenHome(candidate: string | undefined, forbidden: string | undefined, label: string): void
  FS_CASE_INSENSITIVE: boolean
  looksLikeAppLaunch(file: string, args: readonly unknown[]): boolean
  looksLikeNodeChild(file: string): boolean
  readUserDataDirs(args: readonly unknown[]): string[]
  windowsAllowed(): boolean
  installIsolationEnforcer(): void
  __enterLaunchScopeForTest<T>(fn: () => T): T
  BOOTSTRAP: string
}

const rules = require('./isolation-rules.cjs') as IsolationRules

export const ISOLATION_TAG = rules.ISOLATION_TAG
export const WINDOW_TAG = rules.WINDOW_TAG
export const BOOTSTRAP = rules.BOOTSTRAP
export const IsolationViolation = rules.IsolationViolation
export const WindowRuleViolation = rules.WindowRuleViolation
export const FS_CASE_INSENSITIVE = rules.FS_CASE_INSENSITIVE

export const realHome = (): string => rules.realHome()
export const protectedRealPaths = (): string[] => rules.protectedRealPaths()
export const insideRealHome = (p: string | undefined | null): boolean => rules.insideRealHome(p)
export const resolveRealPath = (p: string): string => rules.resolveRealPath(p)
/** THE containment normalisation helper. Every layer uses this one — see below. */
export const containmentKey = (p: string, followLinks?: boolean): string =>
  rules.containmentKey(p, followLinks)
export const pathContains = (ancestor: string, p: string | undefined | null): boolean =>
  rules.pathContains(ancestor, p)
/**
 * The refusal guard for fixtures that deliberately mutate "the real home".
 *
 * Exported here for the guard spec's own assertions; the FIXTURES require the
 * `.cjs` directly, because they run in realms with no TypeScript transform.
 */
export const assertNotForbiddenHome = (
  candidate: string | undefined,
  forbidden: string | undefined,
  label: string,
): void => rules.assertNotForbiddenHome(candidate, forbidden, label)
export const looksLikeAppLaunch = (file: string, args: readonly unknown[]): boolean =>
  rules.looksLikeAppLaunch(file, args)
export const looksLikeNodeChild = (file: string): boolean => rules.looksLikeNodeChild(file)
export const readUserDataDirs = (args: readonly unknown[]): string[] => rules.readUserDataDirs(args)
export const windowsAllowed = (): boolean => rules.windowsAllowed()
export const installIsolationEnforcer = (): void => rules.installIsolationEnforcer()
export const __enterLaunchScopeForTest = <T,>(fn: () => T): T => rules.__enterLaunchScopeForTest(fn)
