/**
 * isolation-rules.cjs — T-450. The isolation rules, as plain CommonJS.
 *
 * WHY THIS IS `.cjs` AND NOT `.ts`
 *
 * T-442 put the rules in `isolation-enforcer.ts` and relied on Playwright's TS
 * transform to load them. That confined the rules to realms Playwright creates.
 * QA R3 walked out of exactly that confinement: a `worker_threads` worker is a
 * NEW REALM with its own module cache, so the patch installed in the worker's
 * parent was simply not there — the worker booted the real app against the real
 * userData and Playwright reported PASSED.
 *
 * The fix needs the rules to be installable in a realm that has no TypeScript
 * transform at all: a bare `node --require`. That is only possible if the rules
 * are plain CJS on disk. So this file is the single implementation, and
 * `isolation-enforcer.ts` is a typed re-export of it. There is no second copy of
 * the logic to drift.
 *
 * Loaded four ways:
 *   • `playwright.config.ts` → `installIsolationEnforcer()` (runner + every worker)
 *   • `vitest.config.ts` (both packages) → `execArgv: ['--require', BOOTSTRAP]`, so
 *     the rules are installed at worker STARTUP, before vitest's own runtime and
 *     therefore before any test module can capture an unpatched binding. T-450 /
 *     S2: `pnpm test` runs vitest, and vitest had neither these rules nor the
 *     tripwire — on the runner with the documented history of writing the real home.
 *   • `isolation-realm-bootstrap.cjs` via `Worker({execArgv:['--require',…]})`
 *   • the same bootstrap via `NODE_OPTIONS=--require…`, now injected into EVERY
 *     child rather than name-recognised node children (S8), which Node propagates
 *     to grandchildren for free (measured).
 *
 * WHAT IS ENFORCED (value-based, no exemptions — not even for the harness)
 *
 *   1. The effective `HOME` for the child must be outside the real home.
 *      Moves ~/.productune, ~/.prdt, ~/.claude, ~/productune. Checked for EVERY
 *      child at EVERY API, ahead of any shape gate.
 *   2. `--user-data-dir=` must be present, and EVERY occurrence of it must be
 *      outside the real home (S6: the checker read the first, Chromium uses the
 *      last). HOME does NOT move Electron's userData: Chromium reads
 *      `app.getPath('appData')` from the OS account, not the environment. This is
 *      the surface QA mutated, and it carries the self-destructive edge — the
 *      single-instance lock is filesystem-scoped to userData, so an unsandboxed
 *      test launch can kill or steal focus from the user's running Productune.
 *   3. Rule 2 also applies to `child_process` launches of the app binary — where
 *      "the app binary" is now decided by FIVE signals including file identity,
 *      not by the spelling of argv (S5: a renamed copy skipped rule 2 and the
 *      window rule, which is the 2026-07-30 ancestor incident's exact shape).
 *   4. An explicit `env` with NO `HOME` never reaches a child (S7): the child
 *      would resolve `os.homedir()` from the OS ACCOUNT and get the real home. An
 *      app launch is REFUSED (the harness contract is to pass both redirections
 *      explicitly); any other child has this realm's own sandboxed HOME filled in,
 *      which is stronger than refusing. See `assertHomeSafe`.
 *   5. Spawn primitives that sit under `child_process` — the
 *      `process.binding('spawn_sync' | 'process_wrap')` bindings — are refused
 *      outright. They have no legitimate use in a test and they bypass rule 3.
 *   6. `detached: true` is refused (S13): a child that outlives the run lands its
 *      writes after the last fingerprint, where nothing can see them.
 *
 * PREVENTION IS NOT THE FLOOR. Four rounds established that no chokepoint set
 * closes this alone; the floor is DETECTION — the fingerprint in
 * `real-home-tripwire.ts`, armed at CONFIG MODULE SCOPE and adjudicated where no
 * `--reporter` flag can remove it. Everything here is a layer on top of that.
 *
 * ONE NORMALISATION HELPER. Every containment question — here, in the harness, in
 * the tripwire, and in the test-only fixtures — goes through `pathContains()`.
 * See the CONTAINMENT section for why that is a rule and not a preference.
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { AsyncLocalStorage } = require('async_hooks')

/** Marker so a failure is unmistakably this rule and not a product error. */
const ISOLATION_TAG = 'T-442 ISOLATION VIOLATION'

/** Marker for the separate "this machine: a window means the VM" rule. */
const WINDOW_TAG = 'T-450 WINDOW RULE'

const INSTALLED = Symbol.for('productune.t442.isolationEnforcer')
const ELECTRON_PATCHED = Symbol.for('productune.t450.electronPatched')
const USER_DATA_FLAG = '--user-data-dir='

const BOOTSTRAP = path.join(__dirname, 'isolation-realm-bootstrap.cjs')

// ── the real home, frozen ───────────────────────────────────────────────────
//
// T-450 / new escape N1. T-442 read `process.env.PRODUCTUNE_REAL_HOME` on EVERY
// call, with `os.homedir()` as the fallback. `os.homedir()` follows `HOME` on
// POSIX (measured), and `playwright.config.ts` repoints `HOME` at the sandbox.
// So a single line in any spec —
//
//     delete process.env.PRODUCTUNE_REAL_HOME
//
// made `realHome()` return the SANDBOX, at which point `insideRealHome()` is
// false for every real path and the whole enforcer becomes a no-op. A launch
// with `--user-data-dir=~/Library/Application Support/productune` then sails
// through. Reading mutable state on every call was the defect; the value is
// captured once here, at first load of this module in this realm, and nothing
// can reach it afterwards.
//
// The fail-closed check below lists EVERY sandbox root this repo creates. It used
// to list only the Playwright one, which meant that in a vitest realm — whose
// sandbox root is `productune-vitest-home`, see scripts/vitest-home-sandbox.ts —
// a missing PRODUCTUNE_REAL_HOME silently recorded the SANDBOX as the real home
// and every containment check passed. Same defect class as S1: a predicate that
// knew about one shape of the same thing and not the others.
const SANDBOX_ROOTS = ['productune-pw-sandbox', 'productune-vitest-home'].map((n) =>
  path.join(os.tmpdir(), n),
)

const REAL_HOME = (() => {
  const fromEnv = process.env.PRODUCTUNE_REAL_HOME
  if (fromEnv) return path.resolve(fromEnv)
  // Fail CLOSED. If HOME has already been repointed at the sandbox and no
  // record of the real home survived, we cannot tell real from sandbox — and
  // guessing means guessing in the permissive direction.
  const h = os.homedir()
  if (SANDBOX_ROOTS.some((root) => h === root || h.startsWith(root + path.sep))) {
    throw new Error(
      `${ISOLATION_TAG}: cannot determine the real home.\n` +
        `HOME is already the test sandbox (${h}) and PRODUCTUNE_REAL_HOME is unset, so ` +
        `every containment check would compare against the sandbox and pass. ` +
        `Whoever created this realm must propagate PRODUCTUNE_REAL_HOME.`,
    )
  }
  return h
})()

function realHome() {
  // Self-healing: a spec that deleted the variable does not get to strip it from
  // children either. The frozen constant above is the authority; this keeps the
  // environment agreeing with it so spawned realms inherit the right value.
  if (process.env.PRODUCTUNE_REAL_HOME !== REAL_HOME) process.env.PRODUCTUNE_REAL_HOME = REAL_HOME
  return REAL_HOME
}

/** Real-home paths that must never be written by a test, in any layer. */
function protectedRealPaths() {
  const h = realHome()
  return [
    path.join(h, '.productune'),
    path.join(h, '.prdt'),
    path.join(h, '.claude'),
    path.join(h, 'productune'),
    path.join(h, 'Library', 'Application Support', 'productune'),
  ]
}

// ── CONTAINMENT: ONE NORMALISATION HELPER, USED BY EVERY LAYER ──────────────
//
// This section is the answer to the meta-defect QA has now reported in four
// consecutive rounds: **the containment predicate gets fixed for ONE shape of
// non-canonical path and the rest are left alone.**
//
//   R3  the predicate was purely lexical (`path.resolve`). A SYMLINK to the real
//       userData compared clean and the real userData was written.
//   R4  the symlink hole was closed with `fs.realpathSync` — and nothing else.
//       QA then walked through with CASE: macOS is case-insensitive, but
//       `realpath` does NOT canonicalise case, so `/users/<u>` survives every
//       resolution step unchanged while `stat().ino`/`st.dev` prove it is the
//       very same directory (re-measured here: ino and dev identical). Rules 1,
//       2 and 4 all fell to it — i.e. the exact mechanism of the 2026-07-30
//       incident passed through a guard written in the same diff that was meant
//       to stop it.
//
// So the shape of the fix has to change, not just its coverage. There is now ONE
// function that turns a path into a comparison key, and EVERY layer routes
// through it — the runtime rules here, the harness's advisory check, the
// tripwire, and the test-only `T450_FORBIDDEN_HOME` refusal in the nested
// fixtures (which QA found had reproduced the very same lexical defect, S9). A
// new non-canonical form is fixed in one place or in none.
//
// The key composes the three ways a path can name a file without matching it
// byte-for-byte:
//   • ALIASING     symlinks           → fs.realpathSync (longest existing ancestor)
//   • CASE         macOS/APFS default → case-fold, gated on a measurement
//   • UNICODE      NFC vs NFD         → normalize('NFC'), because HFS+/APFS
//                                       lookup is normalisation-insensitive and a
//                                       decomposed Hangul/accented path would
//                                       otherwise compare as a different string
//
// `fs.realpathSync` throws ENOENT on a path that does not exist yet, and a
// `--user-data-dir` normally does NOT exist yet, so it cannot be called
// directly. Resolve the longest existing ancestor and re-attach the remainder.
function resolveRealPath(p) {
  const abs = path.resolve(p)
  let head = abs
  const tail = []
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail)
    } catch {
      const parent = path.dirname(head)
      if (parent === head) return abs // reached the root without an existing ancestor
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

const flipCase = (s) =>
  s.replace(/\p{L}/gu, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))

/**
 * Does the filesystem holding the real home compare names case-insensitively?
 *
 * MEASURED, with the same evidence QA used to demonstrate S1: flip the case of
 * the real home's own last segment and compare `(dev, ino)`. Identical inode on
 * the same device is proof that the two spellings name one directory. This is
 * not `process.platform === 'darwin'` — a case-SENSITIVE APFS volume exists and
 * an assumption there would be a silent wrong answer in either direction.
 *
 * Undeterminable → treat as case-insensitive. That direction is fail-CLOSED:
 * folding case on a case-sensitive volume can only make containment say "inside"
 * for a path that is genuinely elsewhere, and every consumer of this predicate
 * reacts to "inside" by REFUSING. A false refusal costs a launch; a false
 * acceptance cost this developer their settings file.
 */
const FS_CASE_INSENSITIVE = (() => {
  const flipped = path.join(path.dirname(REAL_HOME), flipCase(path.basename(REAL_HOME)))
  if (flipped === REAL_HOME) return true // no letters to flip: no evidence, fail closed
  try {
    const a = fs.statSync(REAL_HOME)
    const b = fs.statSync(flipped)
    return a.ino === b.ino && a.dev === b.dev
  } catch {
    return true // ENOENT means case-sensitive, but so does a permission error — fail closed
  }
})()

/**
 * A path reduced to the form in which two names that mean the same file are the
 * same string. THE single normalisation point — see the section header.
 *
 * `followLinks: false` yields the key of the path AS WRITTEN, which is used as a
 * second, conservative candidate: a path whose lexical form is inside the real
 * home is treated as inside even if a symlink points it out again.
 */
function containmentKey(p, followLinks = true) {
  let k = followLinks ? resolveRealPath(p) : path.resolve(p)
  k = k.normalize('NFC')
  if (FS_CASE_INSENSITIVE) k = k.toLowerCase()
  return k
}

/**
 * True when `p` is `ancestor` or anything under it, comparing the way the
 * FILESYSTEM does rather than the way string equality does.
 *
 * Exported so that no layer has to re-derive it — including the test-only
 * fixtures, whose hand-rolled `startsWith` was S9.
 */
function pathContains(ancestor, p) {
  if (!p || !ancestor) return false
  const a = containmentKey(ancestor)
  for (const candidate of [containmentKey(p, false), containmentKey(p, true)]) {
    if (candidate === a || candidate.startsWith(a + path.sep)) return true
  }
  return false
}

/**
 * True when `p` is the real home or anything under it — after following
 * symlinks, folding case and normalising Unicode on BOTH sides.
 */
function insideRealHome(p) {
  if (!p) return false
  return pathContains(realHome(), p)
}

class IsolationViolation extends Error {
  constructor(what, detail) {
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

/** The env the child will actually see: an explicit `env` REPLACES process.env. */
function effectiveEnv(optEnv) {
  return optEnv ?? process.env
}

/**
 * EVERY `--user-data-dir=` in argv, in order.
 *
 * T-450 / S6. The old version returned the FIRST match. Chromium uses the LAST
 * one (QA proved it with a real launch in the VM), so
 *
 *     --user-data-dir=/tmp/ok --user-data-dir=<real userData>
 *
 * was validated against `/tmp/ok` and executed against the real userData. Rather
 * than mirror Chromium's precedence — which would make this predicate depend on
 * an implementation detail of a dependency — every occurrence is returned and
 * ALL of them must be outside the real home. That is strictly stronger than
 * matching Chromium, and it stays correct if Chromium ever changes its mind.
 */
function readUserDataDirs(args) {
  const out = []
  for (const a of args) {
    const s = String(a)
    if (s.startsWith(USER_DATA_FLAG)) out.push(s.slice(USER_DATA_FLAG.length))
  }
  return out
}

/** Back-compat single-value read: the one Chromium would actually honour. */
function readUserDataDir(args) {
  const all = readUserDataDirs(args)
  return all.length === 0 ? undefined : all[all.length - 1]
}

const describePath = (p) => {
  const r = resolveRealPath(p)
  return r === path.resolve(p) ? `${p}` : `${p} (resolves to ${r})`
}

/**
 * RULE 1 + RULE 4, for EVERY child — app-shaped or not, at every API.
 *
 * T-450 / S7 + boundary ③, second correction. Both HOME checks used to live
 * inside `assertContained`, which is only reached when `looksLikeAppLaunch` is
 * true. That is what QA walked through with `env: {}`:
 *
 *   • the "no HOME in its environment" check existed and was CORRECT — it was
 *     simply unreachable for anything the shape gate did not recognise, so a
 *     child given an explicit empty env resolved `os.homedir()` from the OS
 *     account and got the real home;
 *   • R4 had already hoisted the "explicit HOME inside the real home" half out
 *     of the gate, so the file now had one HOME rule on each side of it. Having
 *     fixed half of a check and left the other half behind the gate is the same
 *     partial-fix defect as S1.
 *
 * Both halves are now here, ahead of every gate. The "no HOME" rule fires only
 * when the caller supplied its own `env` object: a call with no `env` inherits
 * `process.env`, whose HOME the config already sandboxed, and refusing those
 * would refuse every innocent spawn in the suite.
 */
function assertHomeSafe(how, opts, appShaped) {
  const suppliedEnv = opts && opts.env
  const explicitHome = suppliedEnv && suppliedEnv.HOME !== undefined ? String(suppliedEnv.HOME) : undefined

  if (suppliedEnv && explicitHome === undefined) {
    // An explicit env with no HOME: the child resolves `os.homedir()` from the OS
    // ACCOUNT, not from this process, and gets the REAL home. That is S7.
    //
    // REFUSING is the right answer for an app launch and the WRONG answer for
    // anything else, and the difference is whether a safe value can be supplied
    // on the caller's behalf:
    //
    //   • an app launch has a contract — `launchApp()` passes BOTH redirections
    //     explicitly, and quietly filling one in would hide a caller that only
    //     half-understands the contract. Refuse.
    //   • any other child just needs A safe home. `withBootstrap()` already
    //     rewrites its env to carry the realm bootstrap, so the parent's own
    //     sandboxed HOME is filled in there. Injecting is STRICTLY stronger than
    //     refusing: refusing stops this one call, injecting makes the child safe
    //     even along a path nobody predicted. It is also the same inversion the
    //     rest of this suite is built on — make the safe thing the default rather
    //     than something a caller has to opt into.
    //
    // A minimal env is a legitimate thing for a test to want (there is one in
    // `electron/prewarm.test.ts`, pinning behaviour under a bare PATH), and a rule
    // that breaks legitimate tests is a rule someone deletes.
    if (appShaped) {
      throw new IsolationViolation(
        `${how} with no HOME in its environment.`,
        `env was supplied but carries no HOME, so the child resolves os.homedir()\n` +
          `from the OS ACCOUNT — the real home — not from this process. An app launch\n` +
          `must pass BOTH redirections explicitly; use launchApp() from tests/harness.ts.`,
      )
    }
    // The value about to be filled in must itself be safe, or filling it is worse
    // than useless.
    const inherited = process.env.HOME
    if (inherited === undefined || insideRealHome(String(inherited))) {
      throw new IsolationViolation(
        `${how} with no HOME in its environment, and no safe HOME to supply.`,
        `env was supplied without a HOME, so the child would resolve os.homedir()\n` +
          `from the OS account. This realm's own HOME is ${inherited ?? '<unset>'}, which is\n` +
          `not outside the real home, so there is nothing safe to fill in. Whoever\n` +
          `created this realm must sandbox HOME first.`,
      )
    }
    return
  }

  const effective = effectiveEnv(suppliedEnv).HOME
  if (effective !== undefined && insideRealHome(String(effective))) {
    throw new IsolationViolation(
      `${how} with HOME inside the real home.`,
      `HOME=${describePath(String(effective))}\n` +
        `A test hands a child the real home only to write it. This rewrites\n` +
        `~/.productune/toolchain, ~/.prdt and ~/.claude for real. If this child\n` +
        `genuinely needs real-home DATA, copy what it needs into the sandbox.`,
    )
  }
}

/**
 * RULE 2 — Electron's userData, which HOME cannot move.
 *
 * Shape-gated on purpose (see `isAppLaunch`): `--user-data-dir` only means
 * something for a Chromium launch. Rules 1 and 4 are NOT gated — they run in
 * `assertHomeSafe` above, ahead of every gate.
 */
function assertContained(opts) {
  assertHomeSafe(opts.how, { env: opts.suppliedEnv }, true)
  if (opts.nodeMode) return

  const all = readUserDataDirs(opts.args)
  if (all.length === 0) {
    throw new IsolationViolation(
      `${opts.how} without --user-data-dir.`,
      `HOME was sandboxed (${effectiveEnv(opts.suppliedEnv).HOME}) but Electron's userData does NOT follow HOME:\n` +
        `Chromium takes app.getPath('appData') from the OS account. This launch would\n` +
        `write the REAL ${path.join(realHome(), 'Library', 'Application Support', 'productune')}\n` +
        `(Local Storage/leveldb, Session Storage, DevToolsActivePort, DIPS, blob_storage)\n` +
        `and contend for the real app's single-instance lock.`,
    )
  }
  for (const udd of all) {
    if (!udd || insideRealHome(udd)) {
      throw new IsolationViolation(
        `${opts.how} with --user-data-dir inside the real home.`,
        `--user-data-dir=${udd ? describePath(udd) : '<empty>'}` +
          (all.length > 1
            ? `\nThe launch passed ${all.length} --user-data-dir flags (${all.join(', ')}). ` +
              `Chromium honours the LAST; every one of them must be outside the real home.`
            : ''),
      )
    }
  }
}

// ── rule 2 target detection: IS THIS A CHROMIUM/ELECTRON LAUNCH? ────────────
//
// Narrow on purpose: tests spawn plenty of innocent processes (git, node, prdt),
// and a guard that fires on those would be turned off within a week. But T-450 /
// S5 showed how narrow it had become. A RENAMED COPY of the app binary — the
// exact shape of the 2026-07-30 ancestor incident — matched no name and no path
// pattern, so it skipped rule 2 AND the window rule: an unsandboxed real-userData
// boot that also opens a window on the host.
//
// The gate is therefore no longer purely about the SPELLING of argv. Five
// independent signals, cheapest first; any one is enough:
//
//   1. `--user-data-dir` is present at all. Only Chromium reads that flag, so
//      whatever the binary is called, this is a Chromium launch. This alone
//      closes "renamed copy aimed at the real userData".
//   2. the basename is `electron` / `Productune`         (unchanged)
//   3. an app-shaped path appears anywhere in argv        (unchanged)
//   4. the file RESOLVES to a known Electron binary — catches a symlink or a
//      hardlink under any name, because the name is not what is compared.
//   5. the file is byte-size-identical to a known Electron binary — catches a
//      `cp` of it under any name, at any path. The Electron binary is ~100MB and
//      an unrelated tool matching its size exactly is not a realistic collision.
//
// 4 and 5 are one `statSync` on a path we were about to execute anyway.
const APP_SHAPES = [
  /dist-electron[/\\]main\.js/i, // this app's main entry, dev layout
  /[/\\]Electron\.app[/\\]Contents[/\\]MacOS[/\\]/i, // the devDependency binary
  /[/\\]Productune\.app[/\\]Contents[/\\]MacOS[/\\]/i, // a packaged build
  /[/\\]dist-electron[/\\]/i,
]

/** GUI package root — this file lives in `<gui>/tests`. */
const GUI_ROOT = path.resolve(__dirname, '..')

/**
 * Electron binaries on this machine, as `{key, size}` identities. Computed once:
 * a `statSync` per spawn is fine, re-scanning the candidates is not.
 */
const KNOWN_ELECTRON_BINARIES = (() => {
  const candidates = [
    path.join(GUI_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    path.join(GUI_ROOT, 'dist', 'mac-arm64', 'Productune.app', 'Contents', 'MacOS', 'Productune'),
    path.join(GUI_ROOT, 'dist', 'mac', 'Productune.app', 'Contents', 'MacOS', 'Productune'),
    '/Applications/Productune.app/Contents/MacOS/Productune',
  ]
  const out = []
  for (const c of candidates) {
    try {
      const st = fs.statSync(c)
      if (st.isFile()) out.push({ key: containmentKey(c), size: st.size })
    } catch {
      /* not installed in this checkout */
    }
  }
  return out
})()

/** Signals 4 and 5: this file IS an Electron binary, whatever it is called. */
function isElectronBinaryByIdentity(file) {
  if (KNOWN_ELECTRON_BINARIES.length === 0) return false
  let key
  try {
    key = containmentKey(file)
  } catch {
    return false
  }
  if (KNOWN_ELECTRON_BINARIES.some((b) => b.key === key)) return true
  try {
    const st = fs.statSync(file)
    return st.isFile() && KNOWN_ELECTRON_BINARIES.some((b) => b.size === st.size)
  } catch {
    return false // does not exist: the spawn will ENOENT, nothing to contain
  }
}

function looksLikeAppLaunch(file, args) {
  const argv = args.map(String)
  if (argv.some((a) => a.startsWith(USER_DATA_FLAG))) return true
  const base = path.basename(String(file))
  if (/^electron(\.exe)?$/i.test(base) || base === 'Productune') return true
  const joined = [file, ...argv].join(' ')
  if (APP_SHAPES.some((re) => re.test(joined))) return true
  return isElectronBinaryByIdentity(file)
}

// ── bootstrap target detection ──────────────────────────────────────────────
//
// T-450 / S8. The old predicate was `basename === 'node'` (plus an exact
// `process.execPath` string compare), and QA listed four spellings that walk past
// it: `env node`, `sh -c node`, `execSync`, and a symlink named `nodejs`.
//
// Widening the name list would have been the S1 mistake again — enumerate one
// more spelling, leave the next one open. The root fix is in the INJECTION
// (see `bootstrapEnv` and its call sites): `NODE_OPTIONS` is now handed to EVERY
// child rather than to children whose name we recognise, because a non-node
// child ignores it harmlessly and a SHELL propagates it to whatever node it
// launches. This predicate survives only to answer "is this realm one we could
// bootstrap through execArgv instead", and it is no longer the thing that decides
// whether a realm gets the rules at all.
function looksLikeNodeChild(file) {
  const f = String(file)
  if (f === process.execPath) return true
  if (/^node(js)?[\d.]*(\.exe)?$/i.test(path.basename(f))) return true
  // A symlink or copy under any name: compare what it resolves to, not its name.
  try {
    return containmentKey(f) === containmentKey(process.execPath)
  } catch {
    return false
  }
}

// ── the launch scope ────────────────────────────────────────────────────────
//
// T-450 / QA escape 3. `_electron.launch` spawns the Electron binary through
// child_process itself, and that spawn was already validated at the launch
// level, so re-checking it risks a false positive on Playwright's internals.
// T-442 suppressed it with a PROCESS-WIDE counter (`launchDepth`), which meant
// rule 3 was globally disabled for as long as ANY launch was in flight. QA
// isolated it precisely: D0=BLOCKED → D1=NOT-BLOCKED → D2=BLOCKED.
//
// An AsyncLocalStorage scope suppresses the check only on the async causal chain
// of the launch that owns it. A spawn from an unrelated async context is still
// checked, even while a launch is in flight.
const launchScope = new AsyncLocalStorage()
const inLaunchScope = () => launchScope.getStore() === true

// ── the window rule (this machine) ──────────────────────────────────────────
//
// `docs/wiki/fact--qa-cua-vm.md`: a window means the lume VM `cua`. The host may
// only run what creates no window. Making that a chokepoint rather than a
// convention means a NEW window-opening test fails with an instruction instead
// of stealing the developer's focus.
function windowsAllowed() {
  return process.env.PRODUCTUNE_ALLOW_WINDOWS === '1'
}

class WindowRuleViolation extends Error {
  constructor(how) {
    super(
      `${WINDOW_TAG}: ${how} would open a real window on the host.\n` +
        `On this machine a window means the VM (lume \`cua\`) — see\n` +
        `docs/wiki/fact--qa-cua-vm.md. The host may only run what creates no window:\n` +
        `static analysis, pure unit tests, headless work.\n\n` +
        `  • to run this in the VM:   PRODUCTUNE_ALLOW_WINDOWS=1 pnpm exec playwright test\n` +
        `  • to keep it off the host: tag the test title with @window (the config\n` +
        `    grep-inverts that tag unless PRODUCTUNE_ALLOW_WINDOWS=1)\n`,
    )
    this.name = 'WindowRuleViolation'
  }
}

// ── installation ────────────────────────────────────────────────────────────

/** Patch `_electron.launch` on the singleton every Playwright entrypoint shares. */
function patchElectron(mod) {
  const el = mod && mod._electron
  if (!el || typeof el.launch !== 'function') return
  // `@playwright/test`, `playwright` and `playwright-core` export the SAME
  // `_electron` object (measured, and pinned by an assertion in
  // isolation.guard.spec.ts). Marking the object rather than the module means
  // reaching it through a different entrypoint cannot get an unpatched copy.
  if (el[ELECTRON_PATCHED]) return
  el[ELECTRON_PATCHED] = true

  const originalLaunch = el.launch.bind(el)
  el.launch = function guardedLaunch(options) {
    const o = options ?? {}
    const args = Array.isArray(o.args) ? o.args : []
    assertContained({ how: '_electron.launch()', suppliedEnv: o.env, args })
    if (!windowsAllowed()) throw new WindowRuleViolation('_electron.launch()')
    return launchScope.run(true, () => Promise.resolve(originalLaunch(options)))
  }
}

function installIsolationEnforcer() {
  const g = globalThis
  if (g[INSTALLED]) return
  g[INSTALLED] = true

  realHome() // freeze + re-assert the env var before anything can read it

  // ── _electron.launch ──────────────────────────────────────────────────────
  // Eager if Playwright is already loaded (the runner and every worker), lazy
  // otherwise (a bootstrapped node child pays nothing until it asks for it).
  const PW_ENTRYPOINTS = new Set(['@playwright/test', 'playwright', 'playwright-core'])
  for (const id of PW_ENTRYPOINTS) {
    try {
      const resolved = require.resolve(id)
      if (require.cache[resolved]) patchElectron(require.cache[resolved].exports)
    } catch {
      /* not resolvable from this realm */
    }
  }
  const Module = require('module')
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    const exports = originalLoad.apply(this, arguments)
    if (PW_ENTRYPOINTS.has(request)) {
      try {
        patchElectron(exports)
      } catch {
        /* never let the guard break a module load */
      }
    }
    return exports
  }

  // ── child_process ─────────────────────────────────────────────────────────
  const cp = require('child_process')

  /**
   * Rule 6 — T-450 / S13, re-evaluated at QA's prompting.
   *
   * `detached: true` is what lets a child outlive the run and land its writes
   * AFTER the final fingerprint — the N5 boundary's mechanism. R4 folded a
   * mitigation for it on the grounds that reaping a process group is racy. QA's
   * counter is correct: it is only racy against a child that detaches or
   * `setsid`s ITSELF, and refusing `detached` removes the ordinary way to do
   * that. A test has no legitimate reason to want a child that outlives it, so
   * this is refused rather than mitigated.
   *
   * It does not CLOSE N5 (a child can still call `setsid`, and `sh -c '… &'`
   * survives via the shell), so N5 stays a stated boundary — but its blast radius
   * now requires deliberate effort rather than one option.
   */
  const assertNotDetached = (how, opts) => {
    if (opts && opts.detached) {
      throw new IsolationViolation(
        `${how} with detached: true.`,
        `A detached child outlives the run, so anything it writes to the real home\n` +
          `lands AFTER the tripwire's final fingerprint and is therefore invisible.\n` +
          `A test that needs a background process must reap it before it returns.`,
      )
    }
  }

  /**
   * Give a spawned node realm the rules it would otherwise not have.
   *
   * `PRODUCTUNE_REAL_HOME` is FILLED IN, never overridden — and that choice cost
   * a real mutation of the developer's home to get right, so it is written down.
   *
   * The first version of this function set it unconditionally, reasoning that a
   * spec must not be able to lie to a child about which home is real. The effect
   * was the opposite of safety: `isolation.guard.spec.ts` proves the tripwire by
   * running a NESTED suite against a decoy real home, the clobber replaced that
   * decoy with the developer's ACTUAL home, and the nested fixture — whose whole
   * job is to mutate "the real home" — mutated the real one. It wrote
   * `~/.productune/settings.json` and a stray `SingletonLock` for real.
   *
   * Filling in reopens the tampering case: a child handed a deliberately false
   * value runs unguarded. That is acceptable HERE, and only because of what this
   * ticket established — prevention is not the floor. A child's writes land in
   * the parent's real home, and the parent run's tripwire fingerprints exactly
   * that, so the escape is detected even though it is not prevented. This is not
   * a hole being waved away; it is the layer below doing the job it was added
   * for, and it is exactly how the incident above was caught.
   *
   * `PRODUCTUNE_ALLOW_WINDOWS` is the opposite case and IS clobbered. It encodes a
   * physical fact about the machine — whether a window may appear on this
   * developer's screen — not an identity a nested run may legitimately redefine.
   * A child must never be able to grant itself permission the parent lacks.
   */
  const REQUIRE_FLAG = `--require "${BOOTSTRAP}"`

  const bootstrapEnv = (env) => {
    const existing = env && env.NODE_OPTIONS ? String(env.NODE_OPTIONS) : ''
    return {
      ...env,
      // S7: an explicit env with no HOME would let the child resolve os.homedir()
      // from the OS ACCOUNT and reach the real home. `assertHomeSafe` has already
      // established that this realm's own HOME is outside the real home, so filling
      // it in is safe — and it is stronger than refusing the call, because it also
      // covers a path nobody predicted. Never OVERRIDES a HOME the caller chose.
      HOME: (env && env.HOME) || process.env.HOME,
      PRODUCTUNE_REAL_HOME: (env && env.PRODUCTUNE_REAL_HOME) || REAL_HOME,
      ...(windowsAllowed() ? {} : { PRODUCTUNE_ALLOW_WINDOWS: '' }),
      // Idempotent: NODE_OPTIONS is inherited by grandchildren, so a nested chain
      // would otherwise accumulate one `--require` per level.
      NODE_OPTIONS: existing.includes(BOOTSTRAP)
        ? existing
        : `${existing ? `${existing} ` : ''}${REQUIRE_FLAG}`,
    }
  }

  /**
   * T-450 / S8. Hand the rules to EVERY child, not to children whose name we
   * recognise as node.
   *
   * R4 gated this on `looksLikeNodeChild`, and QA listed four spellings that walk
   * past such a gate: `env node`, `sh -c node`, `execSync`, and a symlink named
   * `nodejs`. Widening the name list would have repeated the S1 mistake — one more
   * spelling enumerated, the next one still open. So the gate is gone:
   *
   *   • a non-node child IGNORES `NODE_OPTIONS`, so injecting it costs nothing;
   *   • a SHELL passes it on, which is what closes `sh -c node`, `env node` and
   *     every other indirection through a shell without parsing the command;
   *   • Node propagates it to grandchildren on its own (measured), so depth is
   *     unbounded.
   *
   * ONE exclusion, and it is not a hole: a launch `isAppLaunch()` recognises is
   * left alone, because Electron only honours an allowlisted subset of
   * `NODE_OPTIONS` and rejects the rest outright — injecting into it would turn a
   * contained, sanctioned `launchApp()` into a hard failure. Those launches are
   * exactly the ones rules 1, 2 and the window rule have already validated.
   */
  const withBootstrap = (opts, file, args) => {
    if (looksLikeAppLaunch(file, args)) return null // see the doc comment above
    return { ...(opts ?? {}), env: bootstrapEnv(effectiveEnv(opts && opts.env)) }
  }

  /**
   * Locate the options object in a `child_process` argument list.
   *
   * Every one of these APIs is overloaded, and the options slot may be absent,
   * may hold a CALLBACK instead, or may follow an argv array. Getting this wrong
   * means silently replacing a caller's callback with an options object — so the
   * shape is read once, here, rather than re-guessed at each call site (the old
   * `optsIndex = Array.isArray(callArgs[1]) ? 2 : 1` was already wrong for
   * `execFile(file, callback)`; it was merely unreachable then).
   */
  const optionsSlot = (callArgs, hasArgvArray) => {
    let index = 1
    if (hasArgvArray && Array.isArray(callArgs[1])) index = 2
    const at = callArgs[index]
    if (typeof at === 'function') return { index, value: undefined, insert: true }
    return { index, value: at ?? undefined, insert: false }
  }

  /** Return a new argument list with `value` in the options slot. */
  const putOptions = (callArgs, slot, value) => {
    const next = [...callArgs]
    if (slot.insert) next.splice(slot.index, 0, value)
    else next[slot.index] = value
    return next
  }

  /**
   * Make a wrapper look like the function it wraps — INCLUDING
   * `util.promisify.custom`.
   *
   * T-450 R2, found by running this on the repo's own suite: `exec` and `execFile`
   * carry a `util.promisify.custom` implementation, and `promisify()` uses it to
   * resolve `{stdout, stderr}`. A bare wrapper does not carry it, so
   * `promisify(execFile)` silently fell back to generic callback promisification
   * and resolved the FIRST callback argument — `stdout` alone. Every
   * `const { stdout } = await execFileAsync(...)` in the product then read
   * `undefined`, and 19 of `packages/core`'s git tests failed with results that
   * looked like product bugs.
   *
   * COPYING the original's `promisify.custom` would be worse than dropping it: it
   * closes over the UNWRAPPED function, so `promisify(execFile)` would have become
   * a documented, supported way to bypass every rule in this file. It is therefore
   * re-derived over the WRAPPER, reproducing Node's contract (resolve
   * `{stdout, stderr}`, attach them to the error on rejection, expose `.child`).
   *
   * This is the same defect class as everything else in this ticket: a shim that
   * reproduced one aspect of what it stood in for and quietly dropped another.
   */
  const util = require('util')
  const adoptFunctionIdentity = (wrapper, original) => {
    for (const key of Reflect.ownKeys(original)) {
      if (key === 'length' || key === 'name' || key === 'prototype') continue
      if (key === util.promisify.custom) continue // re-derived below, never copied
      try {
        Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key))
      } catch {
        /* non-configurable on the wrapper; the descriptor is not load-bearing */
      }
    }
    if (util.promisify.custom in original) {
      Object.defineProperty(wrapper, util.promisify.custom, {
        configurable: true,
        value: (...args) => {
          let child
          const promise = new Promise((resolve, reject) => {
            child = wrapper(...args, (err, stdout, stderr) => {
              if (err) {
                err.stdout = stdout
                err.stderr = stderr
                reject(err)
              } else {
                resolve({ stdout, stderr })
              }
            })
          })
          promise.child = child
          return promise
        },
      })
    }
    return wrapper
  }

  const wrapFileApi = (name) => {
    const original = cp[name]
    if (typeof original !== 'function') return
    cp[name] = adoptFunctionIdentity(function guarded(...callArgs) {
      const file = String(callArgs[0] ?? '')
      const args = Array.isArray(callArgs[1]) ? callArgs[1] : []
      const slot = optionsSlot(callArgs, true)
      const opts = slot.value
      const how = `child_process.${name}()`

      if (!inLaunchScope()) {
        // Rules 1, 4 and 6 first, for every child, ahead of any shape gate. The
        // shape is passed in only to choose the REMEDY for a missing HOME (refuse
        // vs. fill in) — never to decide whether HOME is checked at all.
        const appShaped = looksLikeAppLaunch(file, args)
        assertHomeSafe(how, opts, appShaped)
        assertNotDetached(how, opts)
        if (appShaped) {
          const env = effectiveEnv(opts && opts.env)
          const nodeMode = String(env.ELECTRON_RUN_AS_NODE ?? '') === '1'
          assertContained({
            how: `${how} of the app binary`,
            suppliedEnv: opts && opts.env,
            args,
            nodeMode,
          })
          if (!windowsAllowed() && !nodeMode) {
            throw new WindowRuleViolation(`${how} of the app binary`)
          }
        }
        const patched = withBootstrap(opts, file, args)
        if (patched) return original.apply(this, putOptions(callArgs, slot, patched))
      }
      return original.apply(this, callArgs)
    }, original)
  }

  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) wrapFileApi(name)

  // `fork` is always a node realm: bootstrap it through execArgv, which does not
  // disturb the child's NODE_OPTIONS.
  const originalFork = cp.fork
  if (typeof originalFork === 'function') {
    cp.fork = function guardedFork(modulePath, args, options) {
      const opts = (Array.isArray(args) ? options : args) ?? {}
      if (!inLaunchScope()) {
        assertHomeSafe('child_process.fork()', opts, false)
        assertNotDetached('child_process.fork()', opts)
        // execArgv carries the bootstrap here, so strip the NODE_OPTIONS copy that
        // bootstrapEnv would add — one install per realm is enough, and a
        // duplicate `--require` in NODE_OPTIONS would also leak to grandchildren
        // that already inherit it.
        const { NODE_OPTIONS: _dropped, ...env } = bootstrapEnv(effectiveEnv(opts.env))
        const patched = {
          ...opts,
          execArgv: [...(opts.execArgv ?? process.execArgv ?? []), '--require', BOOTSTRAP],
          env,
        }
        return Array.isArray(args)
          ? originalFork.call(this, modulePath, args, patched)
          : originalFork.call(this, modulePath, patched)
      }
      return originalFork.apply(this, arguments)
    }
  }

  const wrapShellApi = (name) => {
    const original = cp[name]
    if (typeof original !== 'function') return
    cp[name] = adoptFunctionIdentity(function guarded(...callArgs) {
      if (!inLaunchScope()) {
        const command = String(callArgs[0] ?? '')
        // A shell string has no argv array; the whole command is the argv.
        const args = command.split(/\s+/)
        const slot = optionsSlot(callArgs, false)
        const opts = slot.value
        const how = `child_process.${name}()`
        const appShaped = looksLikeAppLaunch(command, args)
        assertHomeSafe(how, opts, appShaped)
        assertNotDetached(how, opts)
        if (appShaped) {
          const env = effectiveEnv(opts && opts.env)
          const nodeMode = String(env.ELECTRON_RUN_AS_NODE ?? '') === '1'
          assertContained({
            how: `${how} of the app binary`,
            suppliedEnv: opts && opts.env,
            args,
            nodeMode,
          })
          if (!windowsAllowed() && !nodeMode) {
            throw new WindowRuleViolation(`${how} of the app binary`)
          }
        }
        // S8: the shell is the indirection that `looksLikeNodeChild` could not
        // see. Give it NODE_OPTIONS and it hands them to whatever node it runs.
        const patched = withBootstrap(opts, command, args)
        if (patched) return original.apply(this, putOptions(callArgs, slot, patched))
      }
      return original.apply(this, callArgs)
    }, original)
  }

  for (const name of ['exec', 'execSync']) wrapShellApi(name)

  // ── worker_threads ────────────────────────────────────────────────────────
  //
  // T-450 / QA escape 4, the one that produced a GREEN run while writing
  // SingletonLock, SingletonSocket and SingletonCookie into the real userData.
  // A Worker is a new realm with its own module cache, so nothing patched above
  // exists inside it. `execArgv: ['--require', …]` IS honoured for workers
  // (measured), so the new realm can be given the rules before its entry module
  // runs. Detection still backs this up — see real-home-tripwire.ts — because
  // this closes the shape, not the class.
  const wt = require('worker_threads')
  const OriginalWorker = wt.Worker
  if (typeof OriginalWorker === 'function' && !OriginalWorker[ELECTRON_PATCHED]) {
    class GuardedWorker extends OriginalWorker {
      constructor(filename, options) {
        const opts = options ?? {}
        // A worker shares `process.env` unless given its own; either way the
        // frozen real home must survive into the new realm.
        process.env.PRODUCTUNE_REAL_HOME = REAL_HOME
        super(filename, {
          ...opts,
          execArgv: [...(opts.execArgv ?? []), '--require', BOOTSTRAP],
          ...(opts.env ? { env: { ...opts.env, PRODUCTUNE_REAL_HOME: REAL_HOME } } : {}),
        })
      }
    }
    GuardedWorker[ELECTRON_PATCHED] = true
    wt.Worker = GuardedWorker
  }

  // ── raw spawn bindings ────────────────────────────────────────────────────
  //
  // T-450 / new escape N4, invented this round. `child_process` is a JS wrapper
  // over `process.binding('spawn_sync')` and `process.binding('process_wrap')`,
  // and both are still reachable on Node 22 (measured). Calling them directly
  // walks past every wrapper above. Node's own internals use `internalBinding`,
  // not `process.binding`, so refusing these two costs nothing.
  const originalBinding = process.binding
  if (typeof originalBinding === 'function') {
    process.binding = function guardedBinding(name) {
      if (name === 'spawn_sync' || name === 'process_wrap') {
        throw new IsolationViolation(
          `process.binding('${name}') — a raw spawn primitive.`,
          `This is the layer child_process is built on, so it bypasses every launch\n` +
            `rule above. There is no legitimate use for it in a test.`,
        )
      }
      return originalBinding.apply(this, arguments)
    }
  }
}

/**
 * Test hook: run `fn` inside a launch scope WITHOUT launching anything.
 *
 * Exists because the QA escape-3 fix cannot otherwise be tested on this machine.
 * Reproducing the race for real needs a genuine launch in flight, and a genuine
 * launch opens a window, which the host may not do. This exposes the scope so
 * the SCOPING property — suppressed on the launch's own async chain, live
 * everywhere else — is asserted directly. The VM run additionally reproduces the
 * race against a real in-flight launch.
 */
function __enterLaunchScopeForTest(fn) {
  return launchScope.run(true, fn)
}

/**
 * Refuse to proceed if `candidate` is `forbidden` or anything under it.
 *
 * THE test-only entrypoint, and the reason it lives here rather than in the
 * fixtures that need it. T-450 / S9: the nested-suite fixtures each carried their
 * own hand-rolled `decoy === forbidden || decoy.startsWith(forbidden + sep)`, and
 * QA found that this reproduced — in the same diff that fixed it in
 * `insideRealHome` — exactly the lexical defect the whole ticket is about. A
 * fixture whose only job is to mutate "the real home" is the last place that
 * should own a second, weaker copy of the containment predicate.
 *
 * Callers are `isolation.guard.spec.ts`'s MUTATING_SPEC and the
 * `tripwire-fixture.spec.ts` written by scripts/verify-isolation-bypass-matrix.sh.
 * Both reach it by absolute path through a bare `require`, from realms with no
 * TypeScript transform — which is why it is exported from the `.cjs` file.
 */
function assertNotForbiddenHome(candidate, forbidden, label) {
  if (!candidate || !forbidden) {
    throw new Error(`${label}: decoy/forbidden home not provided`)
  }
  if (pathContains(forbidden, candidate)) {
    throw new Error(
      `${label} REFUSING to run: ${candidate} is the developer's real home ` +
        `(${forbidden}) — same path after symlink, case and Unicode normalisation. ` +
        `This fixture mutates whatever it is pointed at, so it must never be ` +
        `pointed there.`,
    )
  }
}

module.exports = {
  ISOLATION_TAG,
  WINDOW_TAG,
  IsolationViolation,
  WindowRuleViolation,
  realHome,
  protectedRealPaths,
  insideRealHome,
  resolveRealPath,
  containmentKey,
  pathContains,
  assertNotForbiddenHome,
  FS_CASE_INSENSITIVE,
  looksLikeAppLaunch,
  looksLikeNodeChild,
  readUserDataDirs,
  windowsAllowed,
  installIsolationEnforcer,
  __enterLaunchScopeForTest,
  BOOTSTRAP,
}
