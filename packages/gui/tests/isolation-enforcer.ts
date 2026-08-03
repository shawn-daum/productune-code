/**
 * isolation-enforcer.ts — T-442 F-A. The isolation rule as a RUNTIME chokepoint.
 *
 * WHY THIS FILE EXISTS
 *
 * The first attempt at "a spec added next month cannot make this mistake again"
 * was a static scan in `isolation.guard.spec.ts`. It enumerated
 * `readdirSync(tests/)` filtered to `.spec.ts`. Playwright's default
 * `testMatch` is `**​/*.@(spec|test).?(c|m)[jt]s?(x)` — RECURSIVE, and it also
 * matches `.test.ts`. So the scan covered a strict subset of what Playwright
 * actually runs, and QA walked straight through the gap with three bypasses,
 * each of which booted the app against the REAL userData and mutated 28 files
 * under `~/Library/Application Support/productune`:
 *
 *   tests/sub/evil-subdir.spec.ts   — subdirectory  (scan was not recursive)
 *   tests/evil-suffix.test.ts       — `.test.ts`    (scan matched one suffix)
 *   tests/evil-viahelper.spec.ts    — the spec is clean; the banned call lives
 *                                     in tests/evil-helper.ts, a non-spec file
 *                                     the scan never opened at all.
 *
 * The lesson is not "widen the glob". A scan is a text search over a file set
 * someone has to keep correct, and the third bypass shows the file set is not
 * even the right unit — indirection defeats it by construction. Fixing only the
 * glob would leave dynamic `require('@playwright/test')`, a helper imported from
 * `src/`, and `child_process.spawn(electronBinary)` all still open.
 *
 * So the enforcement moved to the one place every shape has to pass through:
 * the function itself.
 *
 * `playwright.config.ts` is evaluated in the runner AND independently in every
 * worker process, before any spec module loads. Node's module cache is
 * per-process, so `@playwright/test` resolved from a spec, from a helper, from
 * a `.test.ts`, from three directories down, or from a dynamic `require()` at
 * call time is the SAME object. Wrapping `_electron.launch` there covers all of
 * them at once, and covers shapes nobody has thought of yet — which is the
 * actual acceptance condition.
 *
 * WHAT IS ENFORCED (value-based, no exemptions — not even for the harness)
 *
 *   1. The effective `HOME` for the child must be outside the real home.
 *      Moves ~/.productune, ~/.prdt, ~/.claude, ~/productune.
 *   2. `--user-data-dir=` must be present and outside the real home.
 *      HOME does NOT move Electron's userData: Chromium reads
 *      `app.getPath('appData')` from the OS account, not the environment. This
 *      is the surface QA mutated, and it carries the self-destructive edge —
 *      the single-instance lock is filesystem-scoped to userData, so an
 *      unsandboxed test launch can kill or steal focus from the user's own
 *      running Productune.
 *   3. The same two rules for `child_process` launches of the app binary, which
 *      never touch `_electron` at all.
 *
 * There is deliberately no allowlist and no "trusted caller" stack check. The
 * property that matters is the VALUE of the two redirections, not who supplied
 * them; a stack check would only add a way to be wrong. `tests/harness.ts` is
 * still the sanctioned launcher — but it is sanctioned because it passes these
 * checks, not because it is named here. Its calls go through this wrapper like
 * everyone else's, so if the harness ever regresses, the suite goes red too.
 *
 * KNOWN BOUNDARY — stated rather than hidden (see isolation.guard.spec.ts,
 * which pins it as an executable test):
 *   • A test file loaded as TRUE ESM would get Node's own frozen
 *     `node:child_process` namespace, which cannot be monkey-patched. Playwright
 *     transpiles this package to CJS (`package.json` has no `"type": "module"`,
 *     and `__dirname` is in use across tests/), so every collected file shares
 *     the patched module object today. Flipping the package to ESM would
 *     silently drop rule 3 — the guard spec asserts the CJS assumption so that
 *     flip cannot happen quietly.
 *   • A spec that spawns a *renamed copy* of the app binary from a path with no
 *     Electron/Productune marker is not recognised by rule 3. Rules 1+2 at the
 *     `_electron` level and the product-side launch guard (`app.exit(97)`) still
 *     apply; the fingerprint check in the guard spec is the net for the rest.
 */

import os from 'os'
import path from 'path'

/** Marker so a failure is unmistakably this rule and not a product error. */
export const ISOLATION_TAG = 'T-442 ISOLATION VIOLATION'

const INSTALLED = Symbol.for('productune.t442.isolationEnforcer')
const USER_DATA_FLAG = '--user-data-dir='

/**
 * The developer's REAL home. `playwright.config.ts` records it in the
 * environment before it repoints `HOME`, so `os.homedir()` is only the fallback
 * for the (unused) case where this module loads first.
 */
export function realHome(): string {
  return process.env.PRODUCTUNE_REAL_HOME || os.homedir()
}

/** Real-home paths that must never be written by a test, in any layer. */
export function protectedRealPaths(): string[] {
  const h = realHome()
  return [
    path.join(h, '.productune'),
    path.join(h, '.prdt'),
    path.join(h, '.claude'),
    path.join(h, 'productune'),
    path.join(h, 'Library', 'Application Support', 'productune'),
  ]
}

/** True when `p` is the real home or anything under it. */
export function insideRealHome(p: string | undefined | null): boolean {
  if (!p) return false
  const r = path.resolve(p)
  const h = realHome()
  return r === h || r.startsWith(h + path.sep)
}

export class IsolationViolation extends Error {
  constructor(what: string, detail: string) {
    super(
      `${ISOLATION_TAG}: ${what}\n` +
        `${detail}\n` +
        `Real home: ${realHome()}\n` +
        `Boot the app with launchApp() from tests/harness.ts, which applies BOTH\n` +
        `redirections (HOME and --user-data-dir) with no opt-out. HOME alone is not\n` +
        `enough — Electron's userData ignores it, and an unsandboxed userData also\n` +
        `takes the single-instance lock away from the user's real running app.`,
    )
    this.name = 'IsolationViolation'
  }
}

type Envish = Record<string, string | number | boolean | undefined>

/** The env the child will actually see: an explicit `env` REPLACES process.env. */
function effectiveEnv(optEnv: Envish | undefined): Envish {
  return optEnv ?? (process.env as Envish)
}

function readUserDataDir(args: readonly unknown[]): string | undefined {
  for (const a of args) {
    const s = String(a)
    if (s.startsWith(USER_DATA_FLAG)) return s.slice(USER_DATA_FLAG.length)
  }
  return undefined
}

/** Rule 1 + rule 2, shared by the `_electron` and `child_process` paths. */
function assertContained(opts: {
  how: string
  env: Envish
  args: readonly unknown[]
  /** Skip the userData rule: an `ELECTRON_RUN_AS_NODE` child has no userData. */
  nodeMode?: boolean
}): void {
  const home = opts.env.HOME === undefined ? undefined : String(opts.env.HOME)
  if (!home) {
    throw new IsolationViolation(
      `${opts.how} with no HOME in its environment.`,
      `A child with no HOME resolves os.homedir() from the OS account — the real home.`,
    )
  }
  if (insideRealHome(home)) {
    throw new IsolationViolation(
      `${opts.how} with HOME inside the real home.`,
      `HOME=${home}\nThis rewrites ~/.productune/toolchain, ~/.prdt and ~/.claude for real.`,
    )
  }

  if (opts.nodeMode) return

  const udd = readUserDataDir(opts.args)
  if (udd === undefined) {
    throw new IsolationViolation(
      `${opts.how} without --user-data-dir.`,
      `HOME was sandboxed (${home}) but Electron's userData does NOT follow HOME:\n` +
        `Chromium takes app.getPath('appData') from the OS account. This launch would\n` +
        `write the REAL ${path.join(realHome(), 'Library', 'Application Support', 'productune')}\n` +
        `(Local Storage/leveldb, Session Storage, DevToolsActivePort, DIPS, blob_storage)\n` +
        `and contend for the real app's single-instance lock.`,
    )
  }
  if (!udd || insideRealHome(udd)) {
    throw new IsolationViolation(
      `${opts.how} with --user-data-dir inside the real home.`,
      `--user-data-dir=${udd || '<empty>'}`,
    )
  }
}

// ── rule 3 target detection ─────────────────────────────────────────────────
//
// Narrow on purpose: tests spawn plenty of innocent processes (git, node,
// prdt), and a guard that fires on those would be turned off within a week.

const APP_SHAPES: RegExp[] = [
  /dist-electron[/\\]main\.js/i, // this app's main entry, dev layout
  /[/\\]Electron\.app[/\\]Contents[/\\]MacOS[/\\]/i, // the devDependency binary
  /[/\\]Productune\.app[/\\]Contents[/\\]MacOS[/\\]/i, // a packaged build
  /[/\\]dist-electron[/\\]/i,
]

function looksLikeAppLaunch(file: string, args: readonly unknown[]): boolean {
  const base = path.basename(file)
  if (/^electron(\.exe)?$/i.test(base) || base === 'Productune') return true
  const joined = [file, ...args.map(String)].join(' ')
  return APP_SHAPES.some((re) => re.test(joined))
}

/**
 * Re-entrancy depth. `_electron.launch` spawns the Electron binary through
 * child_process itself; that spawn was already validated at the launch level,
 * so re-checking it would only risk a false positive on Playwright's internals.
 */
let launchDepth = 0

export function installIsolationEnforcer(): void {
  const g = globalThis as Record<symbol, unknown>
  if (g[INSTALLED]) return
  g[INSTALLED] = true

  // ── _electron.launch ──────────────────────────────────────────────────────
  // Patched as an OWN property on the exported singleton, so every importer —
  // static, dynamic, from any directory, under any filename — gets the wrapper.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pw = require('@playwright/test') as { _electron: { launch: (o?: unknown) => Promise<unknown> } }
  const originalLaunch = pw._electron.launch.bind(pw._electron)

  pw._electron.launch = function guardedLaunch(options?: unknown): Promise<unknown> {
    const o = (options ?? {}) as { args?: unknown[]; env?: Envish }
    const args = Array.isArray(o.args) ? o.args : []
    assertContained({
      how: '_electron.launch()',
      env: effectiveEnv(o.env),
      args,
    })
    launchDepth += 1
    return Promise.resolve(originalLaunch(options)).finally(() => {
      launchDepth -= 1
    })
  }

  // ── child_process ─────────────────────────────────────────────────────────
  // `_electron` is not the only way to boot the app. The T-440 live-proof driver
  // spawns the app binary directly, and so could any future spec.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cp = require('child_process') as Record<string, (...a: unknown[]) => unknown>

  const wrapFileApi = (name: string): void => {
    const original = cp[name]
    if (typeof original !== 'function') return
    cp[name] = function guarded(this: unknown, ...callArgs: unknown[]): unknown {
      if (launchDepth === 0) {
        const file = String(callArgs[0] ?? '')
        const args = Array.isArray(callArgs[1]) ? (callArgs[1] as unknown[]) : []
        const opts = (Array.isArray(callArgs[1]) ? callArgs[2] : callArgs[1]) as
          | { env?: Envish }
          | undefined
        if (looksLikeAppLaunch(file, args)) {
          const env = effectiveEnv(opts?.env)
          assertContained({
            how: `child_process.${name}() of the app binary`,
            env,
            args,
            nodeMode: String(env.ELECTRON_RUN_AS_NODE ?? '') === '1',
          })
        }
      }
      return original.apply(this, callArgs)
    }
  }

  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) wrapFileApi(name)

  const wrapShellApi = (name: string): void => {
    const original = cp[name]
    if (typeof original !== 'function') return
    cp[name] = function guarded(this: unknown, ...callArgs: unknown[]): unknown {
      if (launchDepth === 0) {
        const command = String(callArgs[0] ?? '')
        if (looksLikeAppLaunch(command, [])) {
          // A shell string has no argv array; scan the whole command for the flag.
          const env = effectiveEnv((callArgs[1] as { env?: Envish } | undefined)?.env)
          assertContained({
            how: `child_process.${name}() of the app binary`,
            env,
            args: command.split(/\s+/),
            nodeMode: String(env.ELECTRON_RUN_AS_NODE ?? '') === '1',
          })
        }
      }
      return original.apply(this, callArgs)
    }
  }

  for (const name of ['exec', 'execSync']) wrapShellApi(name)
}
