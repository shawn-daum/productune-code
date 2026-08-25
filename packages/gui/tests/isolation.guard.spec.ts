/**
 * isolation.guard.spec.ts — T-442 F1 / F-A / T-450. The isolation rule, verified.
 *
 * The acceptance condition is not "the specs that exist today were fixed". It is
 * "a spec added next month cannot make this mistake again". Three rounds claimed
 * that and three rounds were wrong, each in the same way: the proof enumerated
 * the shapes its author had thought of, and QA arrived with a new one.
 *
 *   R2  the rule was a static scan over `readdirSync(tests/)` filtered to
 *       `.spec.ts`. QA bypassed it three ways — a subdirectory, a `.test.ts`, and
 *       a non-spec helper — and all three mutated the REAL userData.
 *   R3  the rule became a runtime chokepoint, justified by "Node's module cache
 *       is per-process". It is per-REALM. QA booted the app from a
 *       `worker_threads` worker, wrote SingletonLock/SingletonSocket/
 *       SingletonCookie into the real userData, and Playwright reported PASSED.
 *
 * T-450 therefore inverts what the guarantee rests on. Prevention is still here
 * and still worth having — it fails early and names the rule — but the FLOOR is
 * detection: `real-home-tripwire-reporter.ts` fingerprints the real home around
 * every test in the run, so a mutation turns the run red no matter which spec,
 * realm or API produced it. Layers under test:
 *
 *   L1  playwright.config.ts repoints HOME for the runner and every worker.
 *   L2  tests/harness.ts is the sanctioned launcher (both redirections).
 *   L3  tests/isolation-rules.cjs — prevention, now realm-aware: carried into
 *       workers, forks and spawned node children by isolation-realm-bootstrap.cjs.
 *   L4  tests/isolation-scan.ts, recursive over every code file under testDir,
 *       cross-checked against Playwright's own `--list` output.
 *   L5  THE FLOOR — the suite-global tripwire. Proven here by running a nested
 *       suite against a DECOY real home, mutating it, and observing the nested run
 *       go red where the same run with the tripwire disabled stays green.
 *
 * Every test in this file is host-safe: nothing opens a window unless it carries
 * `@window` in its title, and the config grep-inverts those unless
 * PRODUCTUNE_ALLOW_WINDOWS=1 (see docs/wiki/fact--qa-cua-vm.md).
 */

import cp from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect, _electron } from '@playwright/test'
import pwConfig, { ALLOW_WINDOWS, TEST_DIR, WINDOW_TAG_PATTERN } from '../playwright.config'
import {
  DEFAULT_SANDBOX_HOME,
  MAIN,
  PROTECTED_REAL_PATHS,
  REAL_HOME,
  SANDBOX_ROOT,
  assertOutsideRealHome,
  launchApp,
  sandboxHome,
} from './harness'
import {
  BOOTSTRAP,
  FS_CASE_INSENSITIVE,
  ISOLATION_TAG,
  assertNotForbiddenHome,
  WINDOW_TAG,
  __enterLaunchScopeForTest,
  fileIdentity,
  insideRealHome,
  looksLikeAppLaunch,
  looksLikeNodeChild,
  pathContains,
  readUserDataDirs,
  resolveRealPath,
  windowsAllowed,
} from './isolation-enforcer'
import {
  CODE_FILE_RE,
  PLAYWRIGHT_TEST_FILE_RE,
  SCAN_EXEMPT,
  formatOffenders,
  listCodeFiles,
  listCollectableTestFiles,
  scanForUnsanctionedLaunch,
} from './isolation-scan'
import {
  diffSnapshots,
  snapshotRealHome,
  tripwireExcludedSubtrees,
  tripwireNameOnlySubtrees,
  tripwireSizeOnlyPaths,
  tripwireSurfaces,
  verifyTripwire,
} from './real-home-tripwire'
import type { HomeSnapshot } from './real-home-tripwire'

const TESTS_DIR = __dirname
const GUI_ROOT = path.resolve(__dirname, '..')

/** Real userData — the surface HOME cannot move and the round-2 bypasses hit. */
const REAL_USER_DATA = path.join(REAL_HOME, 'Library', 'Application Support', 'productune')

/**
 * An app-SHAPED path that does not exist.
 *
 * Adversarial rows need a target the rules recognise as the app. Using the real
 * binary would mean that a row which FAILS to be blocked opens a real window on
 * the host — the exact thing this machine forbids. Pointing at a non-existent
 * executable inside a real `Electron.app/Contents/MacOS/` keeps the shape (so
 * `looksLikeAppLaunch` fires) while making an escape harmless: the spawn fails
 * with ENOENT instead of rendering. Every "must be blocked" row that could
 * otherwise reach a launcher uses this.
 */
const APP_SHAPED_MISSING = path.join(
  GUI_ROOT,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'NoSuchBinary',
)

// ─────────────────────────────────────────────────────────────────────────────
// L4 — the static scan, over the set Playwright actually collects
// ─────────────────────────────────────────────────────────────────────────────

test('T-442 F-A: the scan root is the configured testDir, not a hardcoded path', () => {
  expect(pwConfig.testDir, 'the config must not point testDir somewhere the scan does not follow').toBe(
    TEST_DIR,
  )
  expect(path.resolve(GUI_ROOT, TEST_DIR)).toBe(TESTS_DIR)

  // The exempt list is pinned. Adding a file to it is an edit to this line, in
  // review, rather than a quiet extra entry in a Set literal.
  expect([...SCAN_EXEMPT].sort()).toEqual([
    'harness.ts',
    'isolation-enforcer.ts',
    'isolation-rules.cjs',
    'isolation-scan.ts',
    'isolation.guard.spec.ts',
  ])
})

test('T-442 F-A: the scan covers everything Playwright collects (asked, not assumed)', () => {
  // Round 2's scan matched `.spec.ts` at the top level and nothing else, so it
  // *believed* it was complete. The only way to know is to ask the runner.
  // Recursion guard: the child sets this, and then skips re-listing.
  test.skip(process.env.PRODUCTUNE_ISOLATION_LIST === '1', 'nested --list child')
  test.setTimeout(180_000)

  const cli = require.resolve('@playwright/test/cli')
  const res = cp.spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
    cwd: GUI_ROOT,
    encoding: 'utf-8',
    // PRODUCTUNE_ISOLATION_LIST=1 doubles as the config's collect-everything
    // switch, so the listing is not filtered by `grepInvert` — a filtered listing
    // would make this cross-check silently vacuous for exactly the specs most
    // likely to launch something. It grants no window permission (the guard
    // refuses to let a child do that), and `--list` executes nothing anyway.
    env: { ...process.env, PRODUCTUNE_ISOLATION_LIST: '1' },
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  })
  expect(res.error, `could not run playwright --list: ${res.error?.message}`).toBeFalsy()
  const json = res.stdout.slice(res.stdout.indexOf('{'))
  expect(
    json.length,
    `--list produced no JSON.\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
  ).toBeGreaterThan(0)

  const parsed = JSON.parse(json) as {
    config?: { rootDir?: string; projects?: Array<{ testDir?: string }> }
    suites?: Array<{ file?: string }>
  }
  // Reported paths are relative to the runner's own rootDir, so normalise
  // through it rather than assuming it equals testDir.
  const rootDir = parsed.config?.rootDir
  expect(rootDir, '--list did not report a rootDir').toBeTruthy()
  const collected = (parsed.suites ?? [])
    .map((s) => s.file)
    .filter((f): f is string => !!f)
    .map((f) => path.relative(TESTS_DIR, path.resolve(rootDir as string, f)).split(path.sep).join('/'))
  expect(collected.length, 'Playwright collected nothing — the cross-check would be vacuous').toBeGreaterThan(0)

  // The runner's own testDir must be the directory we scan. If someone points
  // it elsewhere (or adds a second project), the scan would be covering the
  // wrong tree while still looking green.
  for (const p of parsed.config?.projects ?? []) {
    expect(p.testDir && fs.realpathSync(p.testDir), 'a project collects tests outside the scanned tree').toBe(
      fs.realpathSync(TESTS_DIR),
    )
  }

  const scanned = new Set(listCodeFiles(TESTS_DIR))
  const missed = collected.filter((f) => !scanned.has(f))
  expect(
    missed,
    'Playwright runs these files but the isolation scan never opens them. ' +
      'That is exactly the round-2 defect. Widen listCodeFiles().',
  ).toEqual([])

  // …and the scan is a strict superset: it also reads non-collected helpers,
  // which is how `tests/evil-helper.ts` (bypass #3) becomes visible at all.
  expect(scanned.size).toBeGreaterThan(collected.length)

  // Our local mirror of Playwright's default testMatch agrees with the runner.
  expect(listCollectableTestFiles(TESTS_DIR).sort()).toEqual([...collected].sort())

  // T-450: the `.cjs` rules file is CODE and must be inside the scanned set —
  // it is exempt from the PATTERNS, not from being read. An exemption that also
  // hid the file would be a hole.
  expect(scanned.has('isolation-rules.cjs'), 'the rules file must be scanned, merely pattern-exempt').toBe(true)
  expect(scanned.has('isolation-realm-bootstrap.cjs'), 'the realm bootstrap must be scanned').toBe(true)
})

test('T-442 F-A: the scan catches every bypass shape (matrix, not one control)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-scan-matrix-'))
  try {
    const shapes: Record<string, string> = {
      // ── the three QA actually executed ────────────────────────────────────
      'sub/evil-subdir.spec.ts':
        "import { _electron } from '@playwright/test'\nawait _electron.launch({ args: [MAIN] })\n",
      'evil-suffix.test.ts':
        "import { _electron as e } from '@playwright/test'\nawait e.launch({ args: [MAIN] })\n",
      'evil-helper.ts':
        "import { _electron } from '@playwright/test'\nexport const boot = () => _electron.launch({})\n",
      // ── shapes nobody bypassed yet ────────────────────────────────────────
      'deep/deeper/evil.spec.tsx': "const { _electron } = require('@playwright/test')\n",
      'evil-dynamic.spec.mts': "const pw = require('@playwright/test')\npw.electron.launch({})\n",
      'evil-await-import.spec.ts': "const pw = await import('@playwright/test')\n",
      'evil-hardcoded-main.spec.ts': "cp.spawn(bin, [path.join(root, 'dist-electron/main.js')])\n",
      'evil-appbundle.test.js': "cp.spawn('/Applications/Productune.app/Contents/MacOS/Productune')\n",
      'evil-cjs-helper.cts': "import { _electron } from '@playwright/test'\n",
    }
    // Innocent files that must NOT be flagged, or the rule gets switched off.
    const innocent: Record<string, string> = {
      'ok.spec.ts': "import { launchApp } from './harness'\nawait launchApp({ home })\n",
      'sub/ok-helper.ts': 'export const wait = (ms: number) => new Promise(r => setTimeout(r, ms))\n',
      // TypeScript's type-position `import()` is erased at compile time. This
      // is the shape smoke.spec.ts:32 uses; flagging it was a false positive
      // the first run of this matrix caught, so it is pinned here.
      'ok-typeimport.spec.ts': "let p: { locator: (s: string) => import('@playwright/test').Locator }\n",
      'notes.md': 'const { _electron } = require("@playwright/test")\n',
    }
    for (const [rel, src] of Object.entries({ ...shapes, ...innocent })) {
      const full = path.join(root, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, src)
    }

    const offenders = scanForUnsanctionedLaunch(root, new Set())
    const flagged = new Set(offenders.map((o) => o.file))

    for (const rel of Object.keys(shapes)) {
      expect(flagged.has(rel), `bypass shape NOT caught by the scan: ${rel}`).toBe(true)
    }
    for (const rel of Object.keys(innocent)) {
      expect(flagged.has(rel), `false positive — the scan flagged an innocent file: ${rel}`).toBe(false)
    }
    // `.md` is not code, so it is not scanned — assert that on purpose rather
    // than leaving it to the reader of CODE_FILE_RE.
    expect(CODE_FILE_RE.test('notes.md')).toBe(false)
    expect(PLAYWRIGHT_TEST_FILE_RE.test('evil-suffix.test.ts')).toBe(true)
    expect(PLAYWRIGHT_TEST_FILE_RE.test('evil-helper.ts')).toBe(false)
    // T-450: `.cjs` is code and must be walked, or the realm bootstrap and the
    // rules file would be invisible to the scan entirely.
    expect(CODE_FILE_RE.test('isolation-rules.cjs')).toBe(true)
    expect(PLAYWRIGHT_TEST_FILE_RE.test('isolation-rules.cjs')).toBe(false)

    // ── KNOWN BOUNDARY, asserted rather than hidden ─────────────────────────
    //
    // A text scan loses to string assembly. This fixture spawns the Electron
    // binary with every recognisable substring built by `path.join`, so no
    // literal in the file contains `.app/Contents/MacOS/` or
    // `dist-electron/main.js`, and it never names `_electron`. The scan CANNOT
    // see it — measured, not assumed. Asserting the miss keeps the limitation
    // honest and makes it a visible change if the scan is ever widened.
    //
    // This shape is still blocked, by the runtime rules: the matrix row
    // 'child_process.spawn of the Electron binary…' below is the same shape,
    // and scripts/verify-isolation-bypass-matrix.sh runs it as a real collected
    // spec and shows the suite go red. That is exactly why L3 is prevention and
    // L4 is only the early, readable warning — and why L5 is the floor.
    const boundary = path.join(root, 'assembled.spec.ts')
    fs.writeFileSync(
      boundary,
      [
        "const BIN = path.join(GUI, 'node_modules', 'electron', 'dist',",
        "  'Electron.app', 'Contents', 'MacOS', 'Electron')",
        "cp.spawn(BIN, [path.join(GUI, 'dist-electron', 'main.js')])",
      ].join('\n'),
    )
    expect(
      scanForUnsanctionedLaunch(root, new Set()).filter((o) => o.file === 'assembled.spec.ts'),
      'the scan unexpectedly caught the assembled-path shape — good news, but the ' +
        'boundary comment above is now stale and must be rewritten',
    ).toEqual([])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('T-442 F1: no file under testDir launches Electron outside the harness', () => {
  const files = listCodeFiles(TESTS_DIR)
  expect(files.length, 'no files found — the scan would be vacuous').toBeGreaterThan(0)
  for (const e of SCAN_EXEMPT) {
    expect(files, `exempt entry ${e} does not exist — a stale exemption is a hole`).toContain(e)
  }

  const offenders = scanForUnsanctionedLaunch(TESTS_DIR)
  expect(
    offenders.length === 0 ? '' : `\n${formatOffenders(offenders)}\n`,
    'These files boot Electron around the harness. A direct launch cannot pass\n' +
      "`--user-data-dir`, so it writes the REAL ~/Library/Application Support/productune\n" +
      "and steals the real app's single-instance lock even when HOME is sandboxed.\n" +
      'Use `launchApp()` from tests/harness.ts instead.',
  ).toBe('')
})

// ─────────────────────────────────────────────────────────────────────────────
// L5 — THE FLOOR. The suite-global tripwire.
// ─────────────────────────────────────────────────────────────────────────────

test('T-450: the tripwire covers the product write surfaces, and userData is one of them', () => {
  const surfaces = tripwireSurfaces()
  expect(surfaces.sort()).toEqual(
    [
      path.join(REAL_HOME, '.productune'),
      path.join(REAL_HOME, '.prdt'),
      path.join(REAL_HOME, 'productune'),
      path.join(REAL_HOME, 'Library', 'Application Support', 'productune'),
      // T-450 R2 / S10 — the THIRD root, added because QA refuted the premise that
      // HOME and userData were the only two. Cocoa derives these from the app's
      // BUNDLE IDENTIFIER, which neither `HOME` nor `--user-data-dir` moves.
      path.join(REAL_HOME, 'Library', 'Preferences', 'com.productune.gui.plist'),
      path.join(REAL_HOME, 'Library', 'Preferences', 'com.github.Electron.plist'),
      path.join(REAL_HOME, 'Library', 'Caches', 'electron'),
    ].sort(),
  )

  // Both bundle identifiers, on purpose: a packaged build is `com.productune.gui`,
  // but the DEV layout runs inside `Electron.app` and is `com.github.Electron` —
  // and the 2026-07-30 incident that started all of this was a dev-layout launch,
  // so covering only the packaged id would miss the shape with history.
  expect(
    surfaces.filter((s) => s.includes('Library/Preferences')).length,
    'both the packaged and the dev-layout bundle identifier must be covered',
  ).toBe(2)

  // T-450 R2 / S11 → R3 / F3. R2 EXCLUDED this churning leaf outright, and QA R2
  // showed a full exclusion is a laundering channel: per-file deletion of the
  // user's recovery snapshots was invisible while the run stayed green. It is now
  // fingerprinted in NAME-ONLY mode — present by path, no size/mtime signal,
  // additions ignored by the diff — so removals and renames are drift while the
  // legitimate writer's churn (in-place rewrites, new snapshots, `*.tmp`) is not.
  // The end-to-end proof runs against a decoy in its own test below.
  //
  // QA R3 / B2 adds the second one: `~/.prdt/.auto-open-debounce` is written by
  // prdt's PostToolUse auto-open hook during any agent session — the same
  // "legitimate writer inside a watched surface" shape, closed the same way.
  expect(tripwireNameOnlySubtrees()).toEqual([
    path.join(REAL_HOME, '.productune', 'state', 'autosave-snapshots'),
    path.join(REAL_HOME, '.prdt', '.auto-open-debounce'),
  ])
  const snap0 = snapshotRealHome()
  for (const leaf of tripwireNameOnlySubtrees()) {
    if (!fs.existsSync(leaf)) continue // proven end-to-end against a decoy below
    const under = snap0.detail.filter((l) => l.startsWith(leaf + path.sep))
    expect(under.length, `${leaf} exists but contributed no fingerprint lines`).toBeGreaterThan(0)
    expect(
      under.every((l) => l.endsWith('\tname-only')),
      `entries under ${leaf} must carry no size/mtime signal — that signal is what reddened legitimate runs`,
    ).toBe(true)
  }
  // …and every relaxation must be a LEAF, strictly inside a covered surface and
  // never a surface itself, or the S11/B2 fixes would have thrown away the
  // detection this ticket exists for.
  for (const leaf of tripwireNameOnlySubtrees()) {
    expect(surfaces, 'a name-only subtree must never be a surface').not.toContain(leaf)
    expect(
      surfaces.some((s) => leaf.startsWith(s + path.sep)),
      `a name-only subtree must live inside a covered surface: ${leaf}`,
    ).toBe(true)
  }

  // T-450 R3 / F2 → QA R3 / B1. A FILE-shaped surface records a SIZE, not
  // `exists=` alone (QA R2: both plists exist on the real machine, so `exists=true`
  // never changed and every NSUserDefaults write was invisible). It deliberately
  // does NOT record mtime: a sanctioned `launchApp()` flushes user defaults on
  // exit at an unchanged byte length, so mtime here is a red light on correct
  // behaviour — measured on the VM, `51 passed, exit 1` every window run.
  // Both bundle ids get the mode from ONE derivation, so the surface set and the
  // mode set cannot disagree about the packaged id, whose flush QA could not
  // observe but whose position is identical.
  expect(tripwireSizeOnlyPaths().sort()).toEqual(surfaces.filter((s) => s.endsWith('.plist')).sort())
  for (const plist of tripwireSizeOnlyPaths()) {
    expect(surfaces, `${plist} must be a covered surface`).toContain(plist)
    if (!fs.existsSync(plist)) continue // creation-from-absent is in the decoy test
    const line = snap0.detail.find((l) => l.startsWith(`${plist}\t`))
    expect(line, `the file surface ${plist} must have a detail line`).toBeTruthy()
    expect(line, 'a size-only surface records size, never bare exists= and never mtime').toMatch(/\t\d+$/)
  }

  // The acceptance names userData specifically: it is the third real-home surface,
  // HOME cannot move it, and it carries the single-instance-lock edge.
  expect(surfaces, 'Electron userData must be covered — HOME alone cannot move it').toContain(REAL_USER_DATA)

  // `~/.claude` is deliberately NOT a tripwire surface but IS still refused by
  // prevention. Asserting both halves keeps the asymmetry a decision rather than
  // an oversight: prevention false positives cost nothing, detection false
  // positives get the tripwire deleted, and the agent harness rewrites ~/.claude
  // continuously (measured: 16 changed entries in 60s with no suite running).
  const claude = path.join(REAL_HOME, '.claude')
  expect(surfaces, '~/.claude must NOT be a tripwire surface — it churns constantly').not.toContain(claude)
  expect(PROTECTED_REAL_PATHS, '~/.claude must still be refused by prevention').toContain(claude)

  // T-491: `~/.prdt/run/` is a FULL exclusion (not name-only) — the call-governor
  // hook's own counter directory, tooling-owned per contracts §Return envelope
  // (2026-08-20) and rewritten (create-then-remove) on every tool call of the
  // governed session running this very suite. Name-only mode would not have
  // fixed the regression this ticket exists for: the diff keeps a name-only
  // REMOVAL as drift on purpose, and create-then-remove is exactly the
  // governor's whole repertoire.
  expect(tripwireExcludedSubtrees()).toEqual([path.join(REAL_HOME, '.prdt', 'run')])
  for (const leaf of tripwireExcludedSubtrees()) {
    expect(surfaces, 'an excluded subtree must never be a surface itself').not.toContain(leaf)
    expect(
      surfaces.some((s) => leaf.startsWith(s + path.sep)),
      `an excluded subtree must live inside a covered surface: ${leaf}`,
    ).toBe(true)
  }
  // On THIS machine, in a governed session, `~/.prdt/run/call-governor/` is
  // guaranteed non-empty (the governor wrote to it to let this very test run).
  // A snapshot taken right now must carry ZERO lines for it — not `exists=`,
  // not name-only, nothing — or the exclusion is incomplete.
  for (const leaf of tripwireExcludedSubtrees()) {
    if (!fs.existsSync(leaf)) continue
    const under = snapshotRealHome().detail.filter((l) => l === leaf || l.startsWith(leaf + path.sep) || l.startsWith(`${leaf}\t`))
    expect(under, `${leaf} must contribute NO fingerprint lines at all`).toEqual([])
  }

  // A snapshot must be non-vacuous, or every comparison below passes for free.
  const snap = snapshotRealHome()
  const total = Object.values(snap.perSurface).reduce((n, s) => n + s.count, 0)
  expect(total, 'the fingerprint saw nothing — it would never detect anything either').toBeGreaterThan(10)
  expect(snap.realHome).toBe(REAL_HOME)

  // Taking a snapshot must not itself create anything (it walks with lstat and
  // existsSync only). Two consecutive snapshots of an idle real home agree.
  expect(diffSnapshots(snap, snapshotRealHome()), 'the fingerprint perturbed the home it measures').toEqual([])
})

/**
 * Run a NESTED Playwright suite against a DECOY real home.
 *
 * This is how the tripwire is proven without touching the developer's actual
 * home. `PRODUCTUNE_REAL_HOME` is what the rules and the tripwire treat as "the
 * real home", so pointing it at a throwaway directory makes the whole mechanism
 * observable end-to-end: a fixture mutates the decoy, and the nested run's exit
 * code is the answer. Nothing in the nested suite launches anything, so no window
 * opens and the host run rule holds.
 */
interface NestedOpts {
  specSource: string
  tripwire: boolean
  /**
   * Body of a `globalSetup` module for the nested config. The S3 fixture: a
   * globalSetup mutation must be INSIDE the observed window, which is only true
   * because the baseline is armed at config module scope.
   */
  globalSetupSource?: string
  /** Extra CLI args — the S4 fixture passes `--reporter=line`. */
  extraArgs?: string[]
  /** Omit the globalTeardown from the nested config (to prove it is the floor). */
  omitTeardown?: boolean
  /**
   * Reuse a home root across nested runs. The N5 reduced-form fixture needs run 2
   * to arm against the SAME decoy real home run 1 fingerprinted, or the
   * between-run warning it demonstrates would have nothing to compare. The caller
   * owns the directory's lifetime; `cleanup()` then removes only the code root.
   */
  reuseHomeRoot?: string
}

function runNestedSuite(opts: NestedOpts): {
  code: number | null
  output: string
  decoyHome: string
  cleanup: () => void
} {
  // Two roots, for two reasons that pull in opposite directions.
  //
  // CODE goes inside this package. The nested spec does
  // `require('@playwright/test')`, and CJS resolution walks up from the FILE, so a
  // spec under /var/folders never reaches `<gui>/node_modules` and the nested run
  // dies with "Cannot find module '@playwright/test'". A dot-prefixed directory
  // keeps it invisible to everything that matters: `listCodeFiles` skips dot
  // directories so the scan does not walk it, and `testDir` is ./tests so the
  // outer run never collects it.
  //
  // HOMES go in os.tmpdir(). The repo lives inside the developer's real home, so a
  // sandbox HOME placed next to the code would be a path inside the real home —
  // and rule 4 correctly refuses to hand any child such a HOME. (It did exactly
  // that when both were colocated here, which is the rule working, not a nuisance.)
  // Sweep anything a previously interrupted run left behind, so these cannot
  // accumulate in the package directory.
  for (const entry of fs.readdirSync(GUI_ROOT)) {
    if (entry.startsWith('.t450-nested-')) fs.rmSync(path.join(GUI_ROOT, entry), { recursive: true, force: true })
  }
  const codeRoot = fs.mkdtempSync(path.join(GUI_ROOT, '.t450-nested-'))
  const homeRoot = opts.reuseHomeRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'productune-tripwire-'))
  const cleanup = (): void => {
    const owned = opts.reuseHomeRoot ? [codeRoot] : [codeRoot, homeRoot]
    for (const d of owned) fs.rmSync(d, { recursive: true, force: true })
  }
  const decoyHome = path.join(homeRoot, 'decoy-real-home')
  const nestedHome = path.join(homeRoot, 'nested-sandbox-home')
  const specDir = path.join(codeRoot, 'specs')
  for (const d of [specDir, nestedHome, path.join(decoyHome, '.productune'), path.join(decoyHome, '.prdt')]) {
    fs.mkdirSync(d, { recursive: true })
  }
  // Seed the decoy so the baseline is a real, non-empty fingerprint. Idempotent,
  // so a reused decoy keeps whatever an earlier run landed in it.
  const settingsSeed = path.join(decoyHome, '.productune', 'settings.json')
  if (!fs.existsSync(settingsSeed)) fs.writeFileSync(settingsSeed, JSON.stringify({ seeded: true }))
  const doctrineSeed = path.join(decoyHome, '.prdt', 'doctrine.md')
  if (!fs.existsSync(doctrineSeed)) fs.writeFileSync(doctrineSeed, '# seed\n')

  fs.writeFileSync(path.join(specDir, 'nested.spec.js'), opts.specSource)
  const reporter = path.join(TESTS_DIR, 'real-home-tripwire-reporter.ts')
  const teardown = path.join(TESTS_DIR, 'real-home-tripwire-teardown.ts')
  const tripwireCjs = path.join(TESTS_DIR, 'real-home-tripwire.cjs')
  if (opts.globalSetupSource) {
    fs.writeFileSync(path.join(codeRoot, 'global-setup.js'), opts.globalSetupSource)
  }
  // The nested config MIRRORS the real one, because that is what is under test:
  // arm at module scope, adjudicate in globalTeardown, attribute in the reporter.
  // A nested config that only registered the reporter would have proven the R1
  // design, which is exactly the design QA broke.
  fs.writeFileSync(
    path.join(codeRoot, 'playwright.config.js'),
    `process.env.HOME = ${JSON.stringify(nestedHome)}\n` +
      `require(${JSON.stringify(tripwireCjs)}).armTripwire('nested config module scope')\n` +
      `module.exports = {\n` +
      `  testDir: ${JSON.stringify(specDir)},\n` +
      `  timeout: 30000,\n  workers: 1,\n` +
      (opts.globalSetupSource
        ? `  globalSetup: ${JSON.stringify(path.join(codeRoot, 'global-setup.js'))},\n`
        : '') +
      (opts.omitTeardown ? '' : `  globalTeardown: ${JSON.stringify(teardown)},\n`) +
      `  reporter: [['list'], [${JSON.stringify(reporter)}]],\n` +
      `}\n`,
  )

  const res = cp.spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '--config',
      path.join(codeRoot, 'playwright.config.js'),
      ...(opts.extraArgs ?? []),
    ],
    {
      cwd: GUI_ROOT,
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        PRODUCTUNE_REAL_HOME: decoyHome,
        // Told separately, so the fixture can refuse if the decoy is ever the
        // developer's actual home. See MUTATING_SPEC.
        T450_FORBIDDEN_HOME: REAL_HOME,
        T450_RULES: path.join(TESTS_DIR, 'isolation-rules.cjs'),
        HOME: nestedHome,
        PRODUCTUNE_TRIPWIRE: opts.tripwire ? 'on' : 'off',
        PRODUCTUNE_ISOLATION_LIST: '1', // keep the nested run from re-listing
        // The nested run has a DIFFERENT real home (the decoy), so it must arm its
        // own baseline. Inheriting the parent's run id made every nested run
        // compare the decoy against the developer's real home and report the whole
        // tree as drifted. `armTripwire` also refuses an inherited baseline whose
        // realHome disagrees, so this is belt and braces — deliberately, because a
        // fixture that silently reuses the wrong baseline proves nothing.
        PRODUCTUNE_TRIPWIRE_RUN: '',
      },
    },
  )
  // The decoy must have been honoured. If propagation ever clobbers it again, the
  // nested run targeted the developer's home and that must fail HERE, loudly,
  // rather than being noticed later in a diff.
  expect(
    res.stdout.includes('REFUSING to run'),
    'the nested run was pointed at the real home — bootstrap propagation regressed',
  ).toBe(false)
  // A nested run that could not even start is not evidence of anything, and it
  // must not be mistaken for "the tripwire did not fire".
  expect(
    `${res.stdout}${res.stderr}`,
    'the nested run failed to load its own dependencies, so it proves nothing',
  ).not.toContain("Cannot find module '@playwright/test'")
  return { code: res.status, output: `${res.stdout}\n${res.stderr}`, decoyHome, cleanup }
}

/**
 * The refusal guard every mutating fixture in this repo must use, as source.
 *
 * T-450 R2 / S9. R1 hand-rolled this check inside each fixture as
 * `decoy === forbidden || decoy.startsWith(forbidden + path.sep)` — a purely
 * LEXICAL comparison. QA's finding is the sharpest one of the round: the SAME DIFF
 * that fixed lexical containment in `insideRealHome` reproduced the identical
 * defect in the brand-new guard, so `T450_FORBIDDEN_HOME` could be walked past
 * with a case variant or a symlink. The fixture that exists to mutate "the real
 * home" was the one place with the weakest idea of what the real home is.
 *
 * It now calls `assertNotForbiddenHome()` from `isolation-rules.cjs` — the same
 * normalisation every other layer uses. Reached by absolute path through a bare
 * `require`, because the fixture runs in a realm with no TypeScript transform.
 */
const REFUSAL_GUARD = `
  const decoy = process.env.PRODUCTUNE_REAL_HOME
  const forbidden = process.env.T450_FORBIDDEN_HOME
  require(process.env.T450_RULES).assertNotForbiddenHome(decoy, forbidden, 'T-450 fixture')
`

/**
 * A nested spec that writes the decoy real home. No launch, no window.
 *
 * The refusal guard is not decoration. The first version of this fixture trusted
 * `PRODUCTUNE_REAL_HOME` to be the decoy, the parent's own bootstrap propagation
 * overwrote that variable with the developer's ACTUAL home, and this fixture then
 * rewrote the real `~/.productune/settings.json`. The propagation bug is fixed in
 * `isolation-rules.cjs`, but a fixture whose entire purpose is to mutate "the real
 * home" must not depend on one variable being right — so it is told, separately,
 * which home it must never touch, and it refuses rather than writes.
 */
const MUTATING_SPEC = `
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

test('a perfectly ordinary-looking passing test', () => {
${REFUSAL_GUARD}
  // No launch. No Electron. Just a write to the real home — which is what an
  // escaped launch amounts to, and which prevention has nothing to say about.
  fs.writeFileSync(path.join(decoy, '.productune', 'settings.json'), JSON.stringify({ mutatedByATest: true, at: Date.now() }))
  fs.writeFileSync(path.join(decoy, '.productune', 'SingletonLock'), 'x')
  expect(1 + 1).toBe(2)
})
`

/**
 * S3 — a `globalSetup` that mutates the decoy real home.
 *
 * This is the shape that was COMPLETELY invisible in R1: `globalSetup` runs before
 * the reporter's `onBegin`, so the reporter's baseline already included the damage
 * and the run reported exit 0, "real home unchanged", with the home actually gone.
 * It is observable now only because the baseline is armed at config MODULE SCOPE,
 * which is earlier still.
 */
const MUTATING_GLOBAL_SETUP = `
const fs = require('fs')
const path = require('path')
module.exports = async () => {
${REFUSAL_GUARD}
  fs.writeFileSync(path.join(decoy, '.productune', 'settings.json'), JSON.stringify({ mutatedByGlobalSetup: Date.now() }))
  fs.rmSync(path.join(decoy, '.prdt', 'doctrine.md'), { force: true })
}
`

const CLEAN_SPEC = `
const { test, expect } = require('@playwright/test')
test('a test that touches nothing', () => { expect(1 + 1).toBe(2) })
`

test('T-450 THE FLOOR: mutating the real home turns the run red, where today it stays green', () => {
  test.setTimeout(300_000)

  // This test deliberately mutates "a real home". Fingerprint the DEVELOPER's real
  // home around the whole thing so that if the decoy indirection ever fails, this
  // test says so itself instead of leaving it to the run-level tripwire.
  const guardBefore = snapshotRealHome()

  const nested: Array<{ cleanup: () => void }> = []
  try {
  // 1. CONTROL — the tripwire must not fire on a run that touches nothing. If
  //    this is red, everything below is meaningless because the tripwire would
  //    just be failing all runs.
  const clean = runNestedSuite({ specSource: CLEAN_SPEC, tripwire: true })
  nested.push(clean)
  expect(clean.code, `a clean nested run must stay green.\n${clean.output}`).toBe(0)
  expect(clean.output).toContain('real home unchanged across the run')

  // 2. TODAY'S BEHAVIOUR — the same mutating spec with the tripwire disabled.
  //    This is the defect this ticket exists for, reproduced as a fixture: the
  //    test PASSES, the run is GREEN, and the real home has been rewritten.
  const before = runNestedSuite({ specSource: MUTATING_SPEC, tripwire: false })
  nested.push(before)
  expect(
    before.code,
    `without the tripwire the mutating run is expected to be GREEN — that is the bug.\n${before.output}`,
  ).toBe(0)
  expect(before.output).toContain('1 passed')
  expect(
    fs.existsSync(path.join(before.decoyHome, '.productune', 'SingletonLock')),
    'the mutation must really have happened, or this is not a proof of anything',
  ).toBe(true)

  // 3. WITH THE TRIPWIRE — same spec, same mutation, run goes RED.
  const after = runNestedSuite({ specSource: MUTATING_SPEC, tripwire: true })
  nested.push(after)
  expect(after.code, `the tripwire must fail the run.\n${after.output}`).not.toBe(0)
  expect(after.output).toContain('REAL HOME MUTATED DURING THIS RUN')
  expect(after.output, 'the tripwire must name the test it can attribute the change to').toContain(
    'a perfectly ordinary-looking passing test',
  )
  expect(after.output, 'the drifted surface must be named').toContain('.productune')
  // The individual test still passed — which is the entire point. The run is red
  // because of what the suite DID, not because of what any assertion said.
  expect(after.output, 'the test itself passes; the RUN is what fails').toContain('1 passed')

  // The proof must not have cost anything. All three nested runs mutated only the
  // decoy; the developer's own home is byte-identical.
  expect(
    diffSnapshots(guardBefore, snapshotRealHome()),
    'proving the tripwire must not mutate the developer\'s real home — the decoy leaked',
  ).toEqual([])

  console.log(
    `T-450 tripwire proof\n` +
      `  clean run              exit ${clean.code} (green, nothing touched)\n` +
      `  mutating, tripwire off exit ${before.code} (GREEN WHILE MUTATING — the bug)\n` +
      `  mutating, tripwire on  exit ${after.code} (RED — the fix)\n` +
      `  developer's real home  unchanged`,
  )
  } finally {
    for (const n of nested) n.cleanup()
  }
})

test('T-450 S3: a globalSetup mutation is inside the observed window', () => {
  // THE R1 ESCAPE, as a fixture. `globalSetup` runs AFTER the config is evaluated
  // but BEFORE the reporter's `onBegin`, so a reporter-armed baseline already
  // contained the damage: QA measured exit 0 and "real home unchanged" while the
  // decoy home had actually been rewritten.
  //
  // It is observable now for one reason only — the baseline is armed at config
  // MODULE SCOPE, which is earlier than globalSetup. This test is what stops that
  // ordering from being quietly changed back.
  test.setTimeout(300_000)
  const guardBefore = snapshotRealHome()
  const run = runNestedSuite({
    specSource: CLEAN_SPEC,
    tripwire: true,
    globalSetupSource: MUTATING_GLOBAL_SETUP,
  })
  try {
    expect(run.code, `S3: a globalSetup mutation must fail the run.\n${run.output}`).not.toBe(0)
    expect(run.output, 'S3: the mutation must be reported, not merely counted').toContain(
      'REAL HOME MUTATED DURING THIS RUN',
    )
    // The TEST passed — the run is red because of what globalSetup did, which is
    // the whole point and the reason `onBegin` could not see it.
    expect(run.output, 'S3: the test itself passes; the RUN is what fails').toContain('1 passed')
    // Both directions of the mutation are visible: a write AND a deletion.
    expect(run.output, 'S3: the removed file must show as removed').toMatch(/-\s*\d+ entries|- .*doctrine\.md/)
    console.log(
      'T-450 S3 (globalSetup, before any test)\n' +
        `  run exit ${run.code} (RED)\n` +
        '  baseline is armed at config module scope, which precedes globalSetup',
    )
  } finally {
    run.cleanup()
  }
  expect(diffSnapshots(guardBefore, snapshotRealHome()), 'the S3 fixture leaked out of the decoy').toEqual([])
})

test('T-450 S4: --reporter=line cannot remove the floor', () => {
  // R1's floor WAS the reporter, and `--reporter` REPLACES the config's reporter
  // array — so this everyday flag removed the whole guarantee with no warning at
  // all. The tell was already in R1's own code: `PRODUCTUNE_TRIPWIRE=off` announces
  // itself loudly, so a mechanism that could be switched off more quietly than the
  // documented off-switch was never a floor.
  //
  // Two runs, and BOTH halves matter. With `--reporter=line` the run must still be
  // red (the verdict is in globalTeardown, which no CLI flag overrides). With the
  // globalTeardown deliberately omitted, the run must go GREEN — which is what
  // proves the teardown is load-bearing rather than decorative.
  test.setTimeout(300_000)
  const guardBefore = snapshotRealHome()
  const runs: Array<{ cleanup: () => void }> = []
  try {
    const flagged = runNestedSuite({
      specSource: MUTATING_SPEC,
      tripwire: true,
      extraArgs: ['--reporter=line'],
    })
    runs.push(flagged)
    expect(
      flagged.code,
      `S4: --reporter=line must NOT disarm the floor.\n${flagged.output}`,
    ).not.toBe(0)
    expect(flagged.output).toContain('REAL HOME MUTATED DURING THIS RUN')
    expect(flagged.output, 'S4: the attribution reporter is genuinely gone').not.toContain(
      'mutation event(s) attributed',
    )

    // NEGATIVE CONTROL: without the globalTeardown, the same run is green. If this
    // is ever red, the assertion above has stopped proving what it claims.
    const noFloor = runNestedSuite({ specSource: MUTATING_SPEC, tripwire: true, omitTeardown: true, extraArgs: ['--reporter=line'] })
    runs.push(noFloor)
    expect(
      noFloor.code,
      `S4 control: with no globalTeardown AND no reporter there is nothing left to fail the run, ` +
        `so this must be GREEN. If it is red, the test above is not measuring the teardown.\n${noFloor.output}`,
    ).toBe(0)

    console.log(
      'T-450 S4 (--reporter=line)\n' +
        `  mutating + --reporter=line, teardown present exit ${flagged.code} (RED — floor held)\n` +
        `  mutating + --reporter=line, teardown removed exit ${noFloor.code} (GREEN — the control)`,
    )
  } finally {
    for (const r of runs) r.cleanup()
  }
  expect(diffSnapshots(guardBefore, snapshotRealHome()), 'the S4 fixture leaked out of the decoy').toEqual([])
})

test('T-450: a disabled or broken tripwire cannot be mistaken for a passing one', () => {
  test.setTimeout(120_000)
  const off = runNestedSuite({ specSource: CLEAN_SPEC, tripwire: false })
  try {
    // The banner now comes from `armTripwire` at config module scope — earlier than
    // any reporter, and therefore printed even by a run whose reporter was replaced.
    expect(off.output, 'a disabled tripwire must announce itself loudly').toContain('tripwire is DISABLED')
    expect(off.output).toContain('proves NOTHING about the real home')
  } finally {
    off.cleanup()
  }
})

test('T-450: an unarmed tripwire fails the run instead of reading as clean', () => {
  // The failure mode that would silently undo everything: a config that forgets
  // `armTripwire()`. The verdict must not interpret "no baseline" as "no drift".
  test.setTimeout(120_000)
  const before = snapshotRealHome()
  const savedRun = process.env.PRODUCTUNE_TRIPWIRE_RUN
  try {
    delete process.env.PRODUCTUNE_TRIPWIRE_RUN
    const result = verifyTripwire({ consume: false })
    expect(result.ok, 'an unarmed tripwire must NOT report clean').toBe(false)
    expect(result.report).toContain('TRIPWIRE WAS NEVER ARMED')
  } finally {
    if (savedRun === undefined) delete process.env.PRODUCTUNE_TRIPWIRE_RUN
    else process.env.PRODUCTUNE_TRIPWIRE_RUN = savedRun
  }
  // …and the armed run we are actually inside of reports clean, so the check above
  // is not just "verifyTripwire always fails".
  expect(verifyTripwire({ consume: false }).ok, 'this run IS armed and clean').toBe(true)
  expect(diffSnapshots(before, snapshotRealHome())).toEqual([])
})

// ─────────────────────────────────────────────────────────────────────────────
// L3 — prevention. The five QA-demonstrated escapes, individually.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  name: string
  run: () => Promise<unknown>
  expect: RegExp
}

async function assertBlocked(row: Row): Promise<string> {
  let message = ''
  try {
    const out = await row.run()
    await closeQuietly(out)
    message = 'NOT BLOCKED — this shape reached the real launcher'
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  expect(message, `[${row.name}] must be blocked`).toContain(ISOLATION_TAG)
  expect(message, `[${row.name}] blocked for the wrong reason`).toMatch(row.expect)
  return `  blocked: ${row.name}`
}

test('T-450 QA escapes 1+2 (LEXICAL): a symlink to the real home no longer launders it', async () => {
  const before = snapshotRealHome()
  const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-symlink-'))
  const homeLink = path.join(linkRoot, 'home-link')
  const uddLink = path.join(linkRoot, 'udd-link')
  fs.symlinkSync(REAL_HOME, homeLink)
  fs.symlinkSync(REAL_USER_DATA, uddLink)
  const okUdd = `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'productune-udd-'))}`

  try {
    // The predicate itself was the defect: `path.resolve` is purely lexical, so a
    // symlink resolved "outside" the real home and compared clean. Pin the
    // predicate directly, then pin the launcher that depends on it.
    expect(path.resolve(uddLink).startsWith(REAL_HOME), 'lexically the symlink looks innocent').toBe(false)
    expect(resolveRealPath(uddLink), 'realpath must see through it').toBe(resolveRealPath(REAL_USER_DATA))
    expect(insideRealHome(uddLink), 'ESCAPE 1: a symlinked --user-data-dir must be refused').toBe(true)
    expect(insideRealHome(homeLink), 'ESCAPE 2: a symlinked HOME must be refused').toBe(true)
    // …and a genuinely outside path must still be accepted, or this is just a
    // predicate that says yes to everything.
    expect(insideRealHome(linkRoot), 'a real temp dir must NOT count as inside the real home').toBe(false)

    const results = [
      await assertBlocked({
        name: 'ESCAPE 1 — --user-data-dir is a symlink to the real userData',
        run: () =>
          _electron.launch({
            args: [MAIN, `--user-data-dir=${uddLink}`],
            env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
          }),
        expect: /--user-data-dir inside the real home/,
      }),
      await assertBlocked({
        name: 'ESCAPE 2 — HOME is a symlink to the real home',
        run: () =>
          _electron.launch({ args: [MAIN, okUdd], env: { ...process.env, HOME: homeLink } as Record<string, string> }),
        expect: /HOME inside the real home/,
      }),
      // The same laundering one level deeper: a subdirectory of the symlink.
      await assertBlocked({
        name: 'ESCAPE 1b — a path UNDER the symlink (not the symlink itself)',
        run: () =>
          _electron.launch({
            args: [MAIN, `--user-data-dir=${path.join(homeLink, 'Library', 'Application Support', 'productune')}`],
            env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
          }),
        expect: /--user-data-dir inside the real home/,
      }),
      // A --user-data-dir that does not exist yet is the NORMAL case, and it is
      // why `fs.realpathSync` alone could not be used: it throws ENOENT. Pin
      // that the longest-existing-ancestor resolution still catches it.
      await assertBlocked({
        name: 'ESCAPE 1c — a NOT-YET-EXISTING path under the symlink',
        run: () =>
          _electron.launch({
            args: [MAIN, `--user-data-dir=${path.join(uddLink, 'does', 'not', 'exist', 'yet')}`],
            env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
          }),
        expect: /--user-data-dir inside the real home/,
      }),
    ]
    console.log(`T-450 QA escapes 1+2 (symlink laundering)\n${results.join('\n')}`)
  } finally {
    fs.rmSync(linkRoot, { recursive: true, force: true })
  }
  expect(diffSnapshots(before, snapshotRealHome()), 'the symlink rows mutated the real home').toEqual([])
})

test('T-450 S1 (CASE): a case variant of the real home no longer launders it', async () => {
  // ── THE REPEATED META-DEFECT, as one executable fixture ─────────────────────
  //
  // Four rounds in a row the containment predicate was fixed for ONE shape of
  // non-canonical path and left open for the rest. R3: purely lexical, so a
  // SYMLINK walked through. R4: `realpath` added — and nothing else, so CASE
  // walked through. macOS is case-insensitive by default but `realpath` does NOT
  // canonicalise case, so `/users/<u>` survives every resolution step unchanged
  // while naming the very same directory.
  //
  // Re-measured here with QA's own evidence (`stat().ino` + `st.dev`), because the
  // fix is gated on that measurement rather than on `platform === 'darwin'`.
  const before = snapshotRealHome()
  const lowerHome = REAL_HOME.replace(/^\/Users\//, '/users/')
  expect(lowerHome, 'this machine is not under /Users — rewrite this fixture').not.toBe(REAL_HOME)

  const a = fs.statSync(REAL_HOME)
  const b = fs.statSync(lowerHome)
  expect(a.ino === b.ino && a.dev === b.dev, 'S1: the case variant must be the SAME directory').toBe(true)
  // The two facts that together made this an escape.
  expect(path.resolve(lowerHome).startsWith(REAL_HOME), 'lexically the case variant looks innocent').toBe(false)
  expect(resolveRealPath(lowerHome), 'realpath does NOT canonicalise case — this is the mechanism').toBe(lowerHome)
  // …and the predicate sees through it anyway.
  expect(insideRealHome(lowerHome), 'S1: a case-variant HOME must be refused').toBe(true)
  expect(
    insideRealHome(path.join(lowerHome, 'Library', 'Application Support', 'productune')),
    'S1: a case-variant userData must be refused',
  ).toBe(true)
  // Mixed case at a LATER segment too, or this would only be "the /Users prefix".
  expect(
    insideRealHome(path.join(REAL_HOME, 'library', 'APPLICATION SUPPORT', 'productune')),
    'S1: case folding must apply to every segment, not just the first',
  ).toBe(true)
  // And it is still a predicate that says NO to something: a genuinely outside path.
  expect(insideRealHome(os.tmpdir()), 'a temp dir must NOT count as inside the real home').toBe(false)

  // ONE HELPER, EVERY LAYER. The specific thing QA caught was that the test-only
  // `T450_FORBIDDEN_HOME` guard, written in the same diff, had the old lexical
  // defect. All three layers are asserted against the same input here.
  expect(FS_CASE_INSENSITIVE, 'the case measurement must have succeeded on this machine').toBe(true)
  expect(pathContains(REAL_HOME, lowerHome), 'layer: the shared predicate').toBe(true)
  expect(() => assertOutsideRealHome(lowerHome, 'harness layer'), 'layer: the harness').toThrow(/REAL home/)
  expect(
    () => assertNotForbiddenHome(lowerHome, REAL_HOME, 'fixture layer'),
    'layer: the test-only fixture guard (S9) — the one that had the defect again',
  ).toThrow(/REFUSING to run/)
  // A symlink must ALSO still be refused by that same fixture guard: S9 is "the
  // guard is lexical", so both non-canonical forms have to be checked, not one.
  const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-s9-'))
  const homeLink = path.join(linkRoot, 'home-link')
  fs.symlinkSync(REAL_HOME, homeLink)
  try {
    expect(
      () => assertNotForbiddenHome(homeLink, REAL_HOME, 'fixture layer'),
      'S9: a symlinked decoy must be refused by the fixture guard too',
    ).toThrow(/REFUSING to run/)
    // …and a genuine decoy is still allowed, or the guard refuses everything and
    // the tripwire proof above would be vacuous.
    expect(() => assertNotForbiddenHome(linkRoot, REAL_HOME, 'fixture layer')).not.toThrow()
  } finally {
    fs.rmSync(linkRoot, { recursive: true, force: true })
  }

  // Finally the launcher, through the case variant — the incident's exact mechanism.
  const msg = await assertBlocked({
    name: 'S1 — --user-data-dir at the real userData, spelled in lower case',
    run: () =>
      _electron.launch({
        args: [MAIN, `--user-data-dir=${path.join(lowerHome, 'Library', 'Application Support', 'productune')}`],
        env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
      }),
    expect: /--user-data-dir inside the real home/,
  })
  const homeMsg = await assertBlocked({
    name: 'S1b — HOME spelled in lower case',
    run: () =>
      _electron.launch({
        args: [MAIN, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'productune-udd-'))}`],
        env: { ...process.env, HOME: lowerHome } as Record<string, string>,
      }),
    expect: /HOME inside the real home/,
  })
  console.log(`T-450 S1 (case-insensitive laundering)\n${msg}\n${homeMsg}`)
  expect(diffSnapshots(before, snapshotRealHome()), 'the S1 rows mutated the real home').toEqual([])
})

test('T-450 F1 (FIRMLINK): containment identity is the filesystem\'s, so the alias CLASS is closed', async () => {
  // ── THE FIFTH ROUND OF THE SAME META-DEFECT, and where its shape changed ────
  //
  // R2 genuinely collected normalisation into one helper — every layer shared it,
  // QA confirmed. But the helper still ENUMERATED alias mechanisms (realpath,
  // case fold, NFC), and QA's fifth round arrived with the enumeration's next
  // missing member: the APFS FIRMLINK. `/System/Volumes/Data/Users/<u>` and
  // `/Users/<u>` are ONE directory that `realpathSync` does not fold, so
  // `containmentKey()` produced two different strings — rules 1, 2 and 4 fell,
  // and `assertNotForbiddenHome`, added as incident #4's re-occurrence guard,
  // answered NOT-REFUSED. On the host the window rule happened to catch the
  // launch shape; under PRODUCTUNE_ALLOW_WINDOWS=1 — the VM, the only place real
  // launches happen — nothing fired at all.
  //
  // The fix is NOT "add firmlinks to the list" (that is the sixth round waiting
  // to happen). `pathContains` now decides by stat(2) identity — (dev, ino) —
  // for everything that exists: two spellings of one directory cannot disagree
  // about its inode, whatever alias mechanism produced them, including one
  // nobody has named yet. String comparison survives ONLY for path components
  // that do not exist yet, which cannot be aliases of anything (no inode to
  // share); that remainder is stated in the CONTAINMENT section of
  // isolation-rules.cjs rather than left as an implicit fallback.
  const before = snapshotRealHome()
  const FIRM = path.join('/System/Volumes/Data', REAL_HOME)

  // The mechanism, re-measured with QA's own evidence — the fix is gated on the
  // measurement, not on an assumption about macOS layouts.
  const a = fs.statSync(REAL_HOME)
  const b = fs.statSync(FIRM)
  expect(a.ino === b.ino && a.dev === b.dev, 'F1: the firmlink spelling must be the SAME directory').toBe(true)
  expect(resolveRealPath(FIRM), 'realpath does NOT fold a firmlink — the mechanism').toBe(FIRM)
  expect(fileIdentity(FIRM), 'one directory, one identity — whatever the spelling').toBe(fileIdentity(REAL_HOME))

  // The predicate, existing and not-yet-existing, plus the combination shape:
  const firmUserData = path.join(FIRM, 'Library', 'Application Support', 'productune')
  expect(insideRealHome(FIRM), 'F1: the firmlink home must be inside').toBe(true)
  expect(insideRealHome(firmUserData), 'F1: the firmlink userData must be inside').toBe(true)
  expect(
    insideRealHome(path.join(firmUserData, 'does', 'not', 'exist', 'yet')),
    'F1: a not-yet-existing tail under the firmlink must be inside',
  ).toBe(true)
  expect(insideRealHome(FIRM.toLowerCase()), 'F1: firmlink AND case, combined').toBe(true)
  // …and a firmlink spelling of a non-home path stays outside, or the predicate
  // just says yes to every /System/Volumes/Data path.
  expect(
    insideRealHome(path.join('/System/Volumes/Data', fs.realpathSync(os.tmpdir()))),
    'a firmlink spelling of a NON-home path must stay outside',
  ).toBe(false)

  // ONE IMPLEMENTATION, EVERY LAYER — the same three layers S1 pins, same input.
  expect(pathContains(REAL_HOME, FIRM), 'layer: the shared predicate').toBe(true)
  expect(() => assertOutsideRealHome(FIRM, 'harness layer'), 'layer: the harness').toThrow(/REAL home/)
  expect(
    () => assertNotForbiddenHome(FIRM, REAL_HOME, 'fixture layer'),
    'layer: the incident-#4 guard — the one QA measured NOT-REFUSED in R2',
  ).toThrow(/REFUSING to run/)

  // The launcher. Rule 2 fires BEFORE the window rule, so this row proves the
  // same thing on the host and on the VM — the environment where R2's rule 2
  // did not fire at all.
  const msg = await assertBlocked({
    name: 'F1 — --user-data-dir at the real userData, spelled through the firmlink',
    run: () =>
      _electron.launch({
        args: [MAIN, `--user-data-dir=${firmUserData}`],
        env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
      }),
    expect: /--user-data-dir inside the real home/,
  })
  const homeMsg = await assertBlocked({
    name: 'F1b — HOME spelled through the firmlink',
    run: () =>
      _electron.launch({
        args: [MAIN, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'productune-udd-'))}`],
        env: { ...process.env, HOME: FIRM } as Record<string, string> ,
      }),
    expect: /HOME inside the real home/,
  })
  console.log(`T-450 F1 (firmlink laundering — identity, not spelling)\n${msg}\n${homeMsg}`)
  expect(diffSnapshots(before, snapshotRealHome()), 'the F1 rows mutated the real home').toEqual([])
})

test('T-450 R3 INVENTED: `link/..` laundering — lexical dot-collapse vs the kernel', async () => {
  // The acceptance requires a shape NOBODY has raised, invented this round.
  //
  // MEASURED mechanism: `path.resolve` collapses `..` TEXTUALLY before any
  // filesystem call, and Node's JS `fs.realpathSync` does the same internally —
  // while the kernel resolves the symlink FIRST. So with `lnk → <real
  // home>/Library`, the string layers all see `<tmp>/.productune` for
  // `<tmp>/lnk/../.productune`, and the kernel sees the real
  // `~/.productune`. Every R2 predicate — realpath'd, case-folded, NFC'd —
  // compared clean, because they all started from the lexical collapse. stat(2)
  // identity does not.
  const before = snapshotRealHome()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-dotdot-'))
  const lnk = path.join(root, 'lnk')
  fs.symlinkSync(path.join(REAL_HOME, 'Library'), lnk)
  const sep = path.sep
  const evil = `${lnk}${sep}..${sep}.productune` // NOT path.join — join collapses the dots
  try {
    // The two facts that make it an escape from every string predicate:
    expect(
      path.resolve(evil).startsWith(REAL_HOME),
      'lexically the path never touches the real home — that is the laundering',
    ).toBe(false)
    expect(
      fileIdentity(`${lnk}${sep}..`),
      'the kernel resolves the symlink BEFORE the dots — this IS the real home',
    ).toBe(fileIdentity(REAL_HOME))

    // The predicate sees through it — existing, and with a not-yet-existing tail.
    expect(insideRealHome(evil), 'INVENTED: link/.. laundering must be inside').toBe(true)
    expect(insideRealHome(`${evil}${sep}not${sep}yet`), '…with a not-yet-existing tail too').toBe(true)
    expect(
      () => assertNotForbiddenHome(`${lnk}${sep}..`, REAL_HOME, 'fixture layer'),
      'the fixture guard must refuse it too — one implementation, every layer',
    ).toThrow(/REFUSING to run/)
    // Negative control: dots that stay outside stay outside.
    expect(insideRealHome(path.join(root, 'a', '..', 'b'))).toBe(false)

    const msg = await assertBlocked({
      name: 'INVENTED — --user-data-dir through link/.. into the real userData',
      run: () =>
        _electron.launch({
          args: [MAIN, `--user-data-dir=${lnk}${sep}..${sep}Library${sep}Application Support${sep}productune`],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /--user-data-dir inside the real home/,
    })
    console.log(`T-450 INVENTED (link/.. dot-collapse laundering)\n${msg}`)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
  expect(diffSnapshots(before, snapshotRealHome()), 'the invented-shape rows mutated the real home').toEqual([])
})

test('T-450 S12: an in-place edit deeper than the old depth limit is visible', () => {
  // The old walk stopped at depth 4, so an IN-PLACE edit below that changed the
  // file's size and mtime with no line in the fingerprint covering it. Depth was
  // the wrong knob — it had been chosen for cost, so the bound is now cost (an
  // entry budget) and the walk is unbounded.
  //
  // Proven against a DECOY real home, so the developer's machine pays nothing.
  const guardBefore = snapshotRealHome()
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-depth-'))
  const saved = process.env.PRODUCTUNE_REAL_HOME
  try {
    // 7 levels below the surface root — comfortably past the old limit of 4.
    const deep = path.join(decoy, '.productune', 'a', 'b', 'c', 'd', 'e', 'f')
    fs.mkdirSync(deep, { recursive: true })
    const target = path.join(deep, 'deep-file.json')
    fs.writeFileSync(target, JSON.stringify({ v: 1 }))

    // `realHome()` is frozen per realm, so the tripwire cannot simply be repointed
    // in-process. Ask a child, which is also how a real nested run does it.
    const probe = (): string =>
      cp
        .execFileSync(
          process.execPath,
          [
            '-e',
            `const m = require(${JSON.stringify(path.join(TESTS_DIR, 'real-home-tripwire.cjs'))});` +
              `const s = m.snapshotRealHome();` +
              `process.stdout.write(JSON.stringify(s.perSurface[${JSON.stringify(path.join(decoy, '.productune'))}]))`,
          ],
          {
            encoding: 'utf-8',
            timeout: 60_000,
            env: { ...process.env, PRODUCTUNE_REAL_HOME: decoy, HOME: DEFAULT_SANDBOX_HOME },
          },
        )
        .trim()

    const first = JSON.parse(probe()) as { count: number; hash: string }
    expect(first.count, 'the deep tree must be walked at all').toBeGreaterThan(7)

    // AN IN-PLACE EDIT: same path, different content. Nothing is added or removed,
    // so only size/mtime can reveal it — and only if the walk reached that depth.
    fs.writeFileSync(target, JSON.stringify({ v: 2, padded: 'x'.repeat(64) }))
    const second = JSON.parse(probe()) as { count: number; hash: string }

    expect(second.count, 'no entry was added or removed — this is purely in-place').toBe(first.count)
    expect(
      second.hash,
      'S12: an in-place edit 7 levels deep must change the fingerprint. Under the old ' +
        'WALK_DEPTH=4 these hashes were identical and the edit was invisible.',
    ).not.toBe(first.hash)
    console.log(
      'T-450 S12 (walk depth)\n' +
        `  in-place edit at depth 7, entries unchanged (${first.count}), hash changed: yes\n` +
        '  the bound is now an entry budget, and exhausting it FAILS rather than truncating',
    )
  } finally {
    if (saved === undefined) delete process.env.PRODUCTUNE_REAL_HOME
    else process.env.PRODUCTUNE_REAL_HOME = saved
    fs.rmSync(decoy, { recursive: true, force: true })
  }
  expect(diffSnapshots(guardBefore, snapshotRealHome()), 'the S12 fixture leaked out of the decoy').toEqual([])
})

test('T-450 F2/B1 + F3/B2: per-surface recording keeps legitimate writers green and destruction red', () => {
  // Four findings, one decoy, because they are one defect seen from four sides:
  // what the fingerprint RECORDS decides both what the diff can SEE and what it
  // FALSELY FIRES ON. Each surface below has a legitimate writer, and the mode is
  // the difference between that writer's repertoire and destruction.
  //
  //   F2  (QA R2) `walkSurface` recorded `exists=` alone for a file-shaped
  //       surface, so NSUserDefaults writes to the two existing plists were wholly
  //       invisible — and the R2 spec asserted list MEMBERSHIP, not detection,
  //       which is why it passed. Fixed by recording size+mtime.
  //   B1  (QA R3) …and that fix, being correct, surfaced a pre-existing conflict:
  //       a sanctioned `launchApp()` flushes `com.github.Electron` defaults at an
  //       UNCHANGED byte length, so mtime made the VM `@window` leg permanently
  //       red — `51 passed, exit 1`, reproduced twice. Size-only mode: creation,
  //       deletion and length change stay red, the equal-length rewrite goes
  //       green. Asserted BOTH ways here, because a mode that only relaxes is
  //       indistinguishable from deleting the surface.
  //   F3  (QA R2) excluding `~/.productune/state/autosave-snapshots` made in-place
  //       corruption and per-file DELETION of real recovery snapshots invisible.
  //       R2's defence ("a launch with the real HOME writes settings.json too")
  //       was about launches; the tripwire's own purpose #2 is a direct fs write
  //       with no launch. Name-only fingerprint instead.
  //   B2  (QA R3) `~/.prdt/.auto-open-debounce` is the same shape: prdt's
  //       PostToolUse hook writes epoch markers there during any agent session,
  //       and QA demonstrated one added marker turning a run red. Same mode.
  const guardBefore = snapshotRealHome()
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-surface-'))
  const prefDir = path.join(decoy, 'Library', 'Preferences')
  const snapDir = path.join(decoy, '.productune', 'state', 'autosave-snapshots')
  const debounceDir = path.join(decoy, '.prdt', '.auto-open-debounce')
  const devPlist = path.join(prefDir, 'com.github.Electron.plist')
  const pkgPlist = path.join(prefDir, 'com.productune.gui.plist')

  // `realHome()` is frozen per realm, so the decoy is fingerprinted from a child
  // — the same route a real nested run takes (see S12 above).
  const probe = (): HomeSnapshot =>
    JSON.parse(
      cp.execFileSync(
        process.execPath,
        [
          '-e',
          `process.stdout.write(JSON.stringify(require(process.argv[1]).snapshotRealHome()))`,
          path.join(TESTS_DIR, 'real-home-tripwire.cjs'),
        ],
        {
          encoding: 'utf-8',
          timeout: 60_000,
          env: { ...process.env, PRODUCTUNE_REAL_HOME: decoy, HOME: DEFAULT_SANDBOX_HOME },
        },
      ).trim(),
    ) as HomeSnapshot

  try {
    fs.mkdirSync(prefDir, { recursive: true })
    fs.mkdirSync(snapDir, { recursive: true })
    fs.mkdirSync(debounceDir, { recursive: true })
    fs.writeFileSync(path.join(decoy, '.productune', 'settings.json'), '{}')
    fs.writeFileSync(path.join(decoy, '.prdt', 'doctrine.md'), '# doctrine')
    fs.writeFileSync(devPlist, 'AAAA') // the dev-layout id — exists, like on the real machine
    fs.writeFileSync(path.join(snapDir, 'a.json'), JSON.stringify({ v: 1 }))
    fs.writeFileSync(path.join(snapDir, 'b.json'), JSON.stringify({ v: 1 }))
    fs.writeFileSync(path.join(debounceDir, '1146162765-137'), '1786000000') // the hook's shape: cksum key, 10-byte epoch
    fs.writeFileSync(path.join(debounceDir, '2402555511-22'), '1786000001')
    const s1 = probe()

    // F2 — recording: a file surface carries a size, never bare `exists=`.
    // B1 — …and NOT an mtime, which is what made the sanctioned launch red.
    const plistLine = s1.detail.find((l) => l.startsWith(`${devPlist}\t`))
    expect(plistLine, 'the plist surface must be in the fingerprint').toBeTruthy()
    expect(plistLine, 'B1: a size-only surface records size and no mtime').toMatch(/\t\d+$/)

    // B1 — GREEN: the sanctioned writer's exact shape. An in-place rewrite of the
    // same byte length with the mtime moved is what `launchApp()` provokes out of
    // Cocoa on the VM (measured: 237 bytes before and after, mtime forward), and
    // it must not turn the run red. `utimesSync` is explicit about the mtime move
    // rather than relying on the write's own clock resolution.
    const bumped = new Date(Date.now() + 60_000)
    fs.writeFileSync(devPlist, 'BBBB')
    fs.utimesSync(devPlist, bumped, bumped)
    const s2 = probe()
    expect(
      diffSnapshots(s1, s2),
      'B1: an equal-length in-place plist rewrite is the sanctioned launch, and must be GREEN',
    ).toEqual([])

    // B1 — RED, the half that survives: the byte length changing at all. A
    // wholesale replacement, a truncation, keys added or removed.
    fs.writeFileSync(devPlist, 'BBBBB')
    const s2b = probe()
    expect(
      diffSnapshots(s2, s2b).some((d) => d.surface === devPlist),
      'B1: a plist whose byte length changed must turn the diff red',
    ).toBe(true)

    // B1 — RED: DELETION. The user's defaults destroyed is the same category of
    // unrecoverable loss as incident #4's settings.json, and it stays detected.
    fs.rmSync(devPlist)
    const s2c = probe()
    expect(
      diffSnapshots(s2b, s2c).some((d) => d.surface === devPlist),
      'B1: deleting the plist must turn the diff red',
    ).toBe(true)
    fs.writeFileSync(devPlist, 'BBBBB')

    // F2 — the packaged bundle id: absent (as on a machine that never ran a
    // packaged build), then CREATED by a first NSUserDefaults write. `exists=false`
    // → size line is drift, so creation is detected too. This is the id whose
    // legitimate flush QA could not observe (25s run, SIGTERM); it carries the
    // same mode by construction, so a normal-exit flush cannot reopen B1 here.
    const s2d = probe()
    expect(s2d.detail).toContain(`${pkgPlist}\texists=false`)
    fs.writeFileSync(pkgPlist, 'C')
    const s3 = probe()
    expect(
      diffSnapshots(s2d, s3).some((d) => d.surface === pkgPlist),
      'F2: the packaged-id plist appearing must turn the diff red',
    ).toBe(true)
    expect(
      s3.detail.find((l) => l.startsWith(`${pkgPlist}\t`)),
      'B1: both bundle ids get the size-only mode from one derivation',
    ).toMatch(/\t\d+$/)

    // F3 — the legitimate writer's whole repertoire is invisible: an in-place
    // rewrite (size change included), a NEW snapshot, and the tmp+rename
    // transient. This is what a live agent session does during every run
    // (measured, S11), and what must NOT redden it.
    fs.writeFileSync(path.join(snapDir, 'a.json'), JSON.stringify({ v: 2, pad: 'x'.repeat(64) }))
    fs.writeFileSync(path.join(snapDir, 'c.json'), '{}')
    fs.writeFileSync(path.join(snapDir, 'd.json.tmp'), 'partial')
    const s4 = probe()
    expect(
      diffSnapshots(s3, s4),
      'F3: the legitimate writer\'s churn (rewrite + add + tmp) must NOT be drift',
    ).toEqual([])

    // F3 — what the legitimate writer NEVER does is exactly what turns red:
    fs.rmSync(path.join(snapDir, 'b.json'))
    const s5 = probe()
    const d5 = diffSnapshots(s4, s5)
    expect(
      d5.length === 1 && d5[0].removed.some((l) => l.includes('b.json')),
      `F3: deleting one recovery snapshot must be drift. got ${JSON.stringify(d5)}`,
    ).toBe(true)

    fs.rmSync(snapDir, { recursive: true, force: true })
    const s6 = probe()
    expect(
      diffSnapshots(s5, s6).some((d) => d.removed.length > 0),
      'F3: deleting the whole subtree must be drift',
    ).toBe(true)

    // …and the relaxation is scoped to the leaf: a sibling file keeps full fidelity.
    fs.writeFileSync(path.join(decoy, '.productune', 'settings.json'), JSON.stringify({ corrupt: 1 }))
    const s7 = probe()
    expect(
      diffSnapshots(s6, s7).some((d) => d.surface === path.join(decoy, '.productune')),
      'a settings.json rewrite outside the name-only leaf must still be drift',
    ).toBe(true)

    // B2 — GREEN: an AGENT-SESSION-SHAPED marker write. Read off
    // `~/.prdt/hooks/prdt-auto-open.sh`: a new `<cksum>-<blocks>` marker for a
    // path written for the first time, plus an in-place 10-byte epoch rewrite of
    // an existing one. That is the hook's entire repertoire, and QA showed one
    // added marker turning a run red before this mode existed.
    fs.writeFileSync(path.join(debounceDir, '3980043065-91'), '1786000002')
    fs.writeFileSync(path.join(debounceDir, '1146162765-137'), '1786000003')
    const s8 = probe()
    expect(
      diffSnapshots(s7, s8),
      'B2: a hook-shaped marker add + in-place epoch rewrite must be GREEN',
    ).toEqual([])

    // B2 — RED: what the hook never does. It has no expiry path at all — it never
    // deletes, renames or prunes — so a missing marker is not the writer.
    fs.rmSync(path.join(debounceDir, '2402555511-22'))
    const s9 = probe()
    const d9 = diffSnapshots(s8, s9)
    expect(
      d9.length === 1 && d9[0].removed.some((l) => l.includes('2402555511-22')),
      `B2: deleting one debounce marker must be drift. got ${JSON.stringify(d9)}`,
    ).toBe(true)

    fs.rmSync(debounceDir, { recursive: true, force: true })
    const s10 = probe()
    expect(
      diffSnapshots(s9, s10).some((d) => d.removed.length > 0),
      'B2: a test rampaging through ~/.prdt and taking the whole subtree must be drift',
    ).toBe(true)

    // …and, as for F3, the relaxation is a LEAF: the rest of ~/.prdt is untouched
    // by it and a doctrine file rewrite is still full-fidelity drift.
    fs.writeFileSync(path.join(decoy, '.prdt', 'doctrine.md'), '# doctrine, corrupted')
    const s11 = probe()
    expect(
      diffSnapshots(s10, s11).some((d) => d.surface === path.join(decoy, '.prdt')),
      'a ~/.prdt rewrite outside the name-only leaf must still be drift',
    ).toBe(true)

    console.log(
      'T-450 F2/B1 + F3/B2 (per-surface recording, decoy-proven)\n' +
        '  B1 green: equal-length in-place plist rewrite with mtime moved (= the\n' +
        '            sanctioned launchApp() flush, measured 237B on the VM)\n' +
        '  B1 red:   byte-length change, deletion, packaged-id creation; both ids\n' +
        '            carry the mode from one derivation\n' +
        '  F3 red:   snapshot deletion, subtree deletion; green: rewrite/add/tmp churn\n' +
        '  B2 green: hook-shaped marker add + in-place epoch rewrite\n' +
        '  B2 red:   marker deletion, subtree removal; ~/.prdt outside the leaf keeps\n' +
        '            full fidelity\n' +
        '  boundaries stated in real-home-tripwire.cjs: an equal-length plist rewrite\n' +
        '            and an in-place snapshot/marker corruption are indistinguishable\n' +
        '            from their legitimate writers by any metadata signal',
    )
  } finally {
    fs.rmSync(decoy, { recursive: true, force: true })
  }
  expect(
    diffSnapshots(guardBefore, snapshotRealHome()),
    'the F2/B1 + F3/B2 fixture leaked out of the decoy',
  ).toEqual([])
})

test('T-491: ~/.prdt/run/ is excluded from detection, and the rest of ~/.prdt keeps full fidelity', () => {
  // The regression this ticket fixes: the call-governor hook that governs the
  // very session running `npx vitest run` writes to `~/.prdt/run/call-governor/`
  // on every tool call — creating `.fired-*` markers and `<session>.<agent>`
  // counters, then removing them — and that always fired T-450, red on every
  // governed run regardless of whether any test touched anything. Proven here
  // against a DECOY, same route as the F2/B1 + F3/B2 test above.
  //
  // POSITIVE CONTROL FIRST (per this round's own lesson: a clean run proves
  // nothing by itself) — the excluded subtree must still let a mutation
  // ELSEWHERE in `.prdt` turn the diff red, or this "fix" would have widened
  // into laundering the whole surface instead of the one tooling-owned leaf.
  const guardBefore = snapshotRealHome()
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-run-exclusion-'))
  const runDir = path.join(decoy, '.prdt', 'run', 'call-governor')

  const probe = (): HomeSnapshot =>
    JSON.parse(
      cp.execFileSync(
        process.execPath,
        [
          '-e',
          `process.stdout.write(JSON.stringify(require(process.argv[1]).snapshotRealHome()))`,
          path.join(TESTS_DIR, 'real-home-tripwire.cjs'),
        ],
        {
          encoding: 'utf-8',
          timeout: 60_000,
          env: { ...process.env, PRODUCTUNE_REAL_HOME: decoy, HOME: DEFAULT_SANDBOX_HOME },
        },
      ).trim(),
    ) as HomeSnapshot

  try {
    fs.mkdirSync(runDir, { recursive: true })
    fs.writeFileSync(path.join(decoy, '.prdt', 'doctrine.md'), '# doctrine')
    fs.writeFileSync(path.join(runDir, '.fired-PreToolUse'), '1')
    fs.writeFileSync(path.join(runDir, 'session-a.agent-a'), '1')
    const s1 = probe()

    // The excluded subtree contributes NOTHING to the fingerprint, even though
    // it exists and is non-empty — not `exists=`, not name-only.
    const under = s1.detail.filter((l) => l.startsWith(runDir + path.sep) || l.startsWith(`${runDir}\t`))
    expect(under, '~/.prdt/run/ must contribute no fingerprint lines').toEqual([])

    // GREEN: the governor's actual shape — create, then remove, on every tool
    // call. Before this fix this alone turned every governed run red.
    fs.writeFileSync(path.join(runDir, '.fired-PostToolBatch'), '1')
    fs.rmSync(path.join(runDir, 'session-a.agent-a'))
    fs.writeFileSync(path.join(runDir, 'session-b.agent-b'), '1')
    const s2 = probe()
    expect(
      diffSnapshots(s1, s2),
      'T-491: create-then-remove churn inside ~/.prdt/run/ must be GREEN',
    ).toEqual([])

    // RED, the positive control: deleting the WHOLE run/ subtree is still
    // invisible (that is the point of a full exclusion, stated as a limit
    // rather than hidden) — so prove the boundary is a LEAF by showing a
    // sibling change in ~/.prdt keeps full fidelity.
    fs.rmSync(runDir, { recursive: true, force: true })
    const s3 = probe()
    expect(
      diffSnapshots(s2, s3),
      'T-491: even deleting the whole excluded subtree must stay GREEN — that is the documented limit',
    ).toEqual([])

    fs.writeFileSync(path.join(decoy, '.prdt', 'doctrine.md'), '# doctrine, corrupted')
    const s4 = probe()
    expect(
      diffSnapshots(s3, s4).some((d) => d.surface === path.join(decoy, '.prdt')),
      'T-491 positive control: a doctrine.md rewrite outside the excluded leaf must still be drift — ' +
        'the tripwire is not blind to the rest of ~/.prdt',
    ).toBe(true)

    console.log(
      'T-491 (call-governor exclusion, decoy-proven)\n' +
        '  green: create/remove churn inside ~/.prdt/run/, including deleting the whole subtree\n' +
        '  red:   a ~/.prdt/doctrine.md rewrite outside the excluded leaf — the tripwire keeps working',
    )
  } finally {
    fs.rmSync(decoy, { recursive: true, force: true })
  }
  expect(
    diffSnapshots(guardBefore, snapshotRealHome()),
    'the T-491 fixture leaked out of the decoy',
  ).toEqual([])
})

/**
 * QA R3 / B1+B2 at RUN level: the legitimate writers of both surfaces.
 *
 * Byte-identical to what actually writes them — `launchApp()` provoking a Cocoa
 * defaults flush at an unchanged length, and prdt's auto-open hook dropping a
 * 10-byte epoch marker. Nothing here launches anything, so no window opens.
 */
const LEGITIMATE_WRITER_SPEC = `
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

test('a run during which the sanctioned writers write', () => {
${REFUSAL_GUARD}
  const plist = path.join(decoy, 'Library', 'Preferences', 'com.github.Electron.plist')
  // The launch flush: same byte length, mtime forward. Measured on the VM at 237
  // bytes before and after; utimes makes the mtime move explicit rather than
  // leaving it to the write clock's resolution.
  const size = fs.statSync(plist).size
  fs.writeFileSync(plist, 'B'.repeat(size))
  const bumped = new Date(Date.now() + 60000)
  fs.utimesSync(plist, bumped, bumped)
  // The auto-open hook: one new marker, one in-place epoch rewrite.
  const dir = path.join(decoy, '.prdt', '.auto-open-debounce')
  fs.writeFileSync(path.join(dir, '3980043065-91'), '1786000002')
  fs.writeFileSync(path.join(dir, '1146162765-137'), '1786000003')
  expect(1 + 1).toBe(2)
})
`

/** The same two surfaces, destroyed. Must stay red. */
const SURFACE_DESTROYING_SPEC = `
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

test('a run that destroys what the sanctioned writers only ever add to', () => {
${REFUSAL_GUARD}
  fs.truncateSync(path.join(decoy, 'Library', 'Preferences', 'com.github.Electron.plist'), 10)
  fs.rmSync(path.join(decoy, '.prdt', '.auto-open-debounce', '2402555511-22'))
  expect(1 + 1).toBe(2)
})
`

test('T-450 B1+B2 end-to-end: a run with the sanctioned writers is GREEN, the same surfaces destroyed is RED', () => {
  test.setTimeout(300_000)
  // QA R3 measured both halves of this at RUN level — a `@window` leg at
  // `51 passed, exit 1` from a plist whose only change was its mtime, and one
  // added debounce marker reddening a run — so the answer is owed at run level
  // too. The decoy-diff test above proves what the fingerprint records; this
  // proves what a whole run does with it, exit code included.
  //
  // A permanently red leg is not a safe state. It is the failure mode this ticket
  // named for itself: a floor that cries wolf gets deleted, and three of the four
  // incidents in this lineage happened while red was being read as normal.
  const guardBefore = snapshotRealHome()

  // The surfaces must EXIST before the run arms its baseline, or creating them
  // would be the drift instead of writing them. `runNestedSuite` lets the caller
  // own the home root exactly for this kind of pre-seeding.
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-b1b2-'))
  const decoyHome = path.join(homeRoot, 'decoy-real-home')
  const plist = path.join(decoyHome, 'Library', 'Preferences', 'com.github.Electron.plist')
  const debounceDir = path.join(decoyHome, '.prdt', '.auto-open-debounce')
  const nested: Array<{ cleanup: () => void }> = []
  try {
    fs.mkdirSync(path.dirname(plist), { recursive: true })
    fs.mkdirSync(debounceDir, { recursive: true })
    fs.writeFileSync(plist, 'A'.repeat(237)) // the VM's real byte length
    fs.writeFileSync(path.join(debounceDir, '1146162765-137'), '1786000000')
    fs.writeFileSync(path.join(debounceDir, '2402555511-22'), '1786000001')

    const green = runNestedSuite({ specSource: LEGITIMATE_WRITER_SPEC, tripwire: true, reuseHomeRoot: homeRoot })
    nested.push(green)
    expect(
      green.code,
      `B1+B2: a run whose only real-home writes are the sanctioned ones must be GREEN.\n${green.output}`,
    ).toBe(0)
    expect(green.output).toContain('real home unchanged across the run')
    // …and the writes really happened, or this proves nothing.
    expect(fs.readFileSync(plist, 'utf-8'), 'the plist rewrite must really have happened').toBe('B'.repeat(237))
    expect(fs.existsSync(path.join(debounceDir, '3980043065-91')), 'the new marker must really exist').toBe(true)

    const red = runNestedSuite({ specSource: SURFACE_DESTROYING_SPEC, tripwire: true, reuseHomeRoot: homeRoot })
    nested.push(red)
    expect(red.code, `B1+B2: destroying the same two surfaces must be RED.\n${red.output}`).not.toBe(0)
    expect(red.output).toContain('REAL HOME MUTATED DURING THIS RUN')
    expect(red.output, 'the truncated plist must be named').toContain('com.github.Electron.plist')
    expect(red.output, 'the deleted marker must be named').toContain('2402555511-22')
    expect(red.output, 'the test itself passes; the RUN is what fails').toContain('1 passed')

    console.log(
      'T-450 B1+B2, end-to-end at run level\n' +
        `  sanctioned writers (equal-length plist rewrite + mtime, marker add + rewrite)\n` +
        `                                exit ${green.code} — "real home unchanged"\n` +
        `  same surfaces destroyed (plist truncated, marker deleted)\n` +
        `                                exit ${red.code} — both named in the report\n` +
        '  VM confirmation: the @window leg is 51 passed / exit 0 with the real plist\n' +
        '  mtime moving during the run (237 bytes before and after, twice)',
    )
  } finally {
    for (const n of nested) n.cleanup()
    fs.rmSync(homeRoot, { recursive: true, force: true })
  }
  expect(diffSnapshots(guardBefore, snapshotRealHome()), 'the B1+B2 fixture leaked out of the decoy').toEqual([])
})

test('T-450 S13: detached children are refused, so a child cannot outlive the run by option', () => {
  // RE-EVALUATED at QA's prompting. R1 folded this, reasoning that a process-group
  // reap is racy because a child can escape its group. QA's counter is correct: it
  // is only racy against a child that detaches or `setsid`s ITSELF, and `detached:
  // true` is the ordinary way to do that. Refusing the option removes the ordinary
  // way, which is worth doing even though it does not close the class.
  //
  // Why this matters at all: a child that outlives the run lands its writes AFTER
  // the final fingerprint, where NOTHING can see them. It is the one shape that
  // defeats detection as well as prevention (see N5 below).
  for (const attempt of [
    () => cp.spawn('/bin/sleep', ['30'], { detached: true }),
    () => cp.spawnSync('/bin/sleep', ['1'], { detached: true }),
    () => (cp.exec as unknown as (c: string, o: unknown) => unknown)('sleep 30', { detached: true }),
  ]) {
    let message = ''
    try {
      attempt()
      message = 'NOT BLOCKED'
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    expect(message, 'S13: detached:true must be refused').toContain(ISOLATION_TAG)
    expect(message).toMatch(/detached: true/)
  }
  // …and a non-detached child is untouched, or every innocent spawn breaks.
  expect(() => cp.spawnSync('/bin/echo', ['ok'], { detached: false })).not.toThrow()
  console.log(
    'T-450 S13 (detached children)\n' +
      '  refused: spawn / spawnSync / exec with detached:true\n' +
      '  NOT closed: a child that calls setsid() itself — see the N5 boundary\n' +
      '  ALSO adopted: the next run WARNS about drift since the last run (see armTripwire)',
  )
})

test('T-450 QA escape 3 (RACE): the launch suppression is async-scoped, not process-wide', async () => {
  // T-442 suppressed the child_process check while a launch was in flight using a
  // PROCESS-WIDE counter, so rule 3 was globally off for the duration of ANY
  // launch. QA isolated it exactly: D0=BLOCKED → D1=NOT-BLOCKED → D2=BLOCKED.
  //
  // Reproducing that with a real in-flight launch needs a real window, which the
  // host may not open — so the SCOPING property is asserted directly here, and
  // the VM leg reproduces the race against a genuine launch.
  const attempt = (): string => {
    try {
      cp.spawnSync(APP_SHAPED_MISSING, [], {
        env: { ...process.env, HOME: REAL_HOME } as NodeJS.ProcessEnv,
      })
      return 'NOT BLOCKED'
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  // D0 — no launch scope: blocked, as always.
  expect(attempt(), 'D0 must be blocked').toContain(ISOLATION_TAG)

  // D1 — INSIDE a launch scope: suppressed, by design. This is the one case the
  // suppression exists for (Playwright's own spawn of the binary it just validated).
  expect(__enterLaunchScopeForTest(() => attempt()), 'inside the launch scope, suppression applies').toBe(
    'NOT BLOCKED',
  )
  // …and still suppressed further down the scope's own async chain, which is what
  // makes it usable for a real launch rather than only for a synchronous call.
  const onChain = await __enterLaunchScopeForTest(async () => {
    await Promise.resolve()
    return attempt()
  })
  expect(onChain, 'the scope must survive an await on its own chain').toBe('NOT BLOCKED')

  // THE FIX — a callback rooted OUTSIDE the scope, firing while the scope's async
  // body is still pending, must STILL be blocked. Under the old process-wide
  // counter this window was exactly when rule 3 was off, so this returned NOT
  // BLOCKED: the suppression was scoped to TIME, and it needed to be scoped to the
  // launch's own causal chain.
  let offChain = ''
  const rootedOutside = new Promise<void>((resolve) => {
    setTimeout(() => {
      offChain = attempt()
      resolve()
    }, 0)
  })
  await __enterLaunchScopeForTest(async () => {
    // The timer above fires while this async body is still pending, i.e. while a
    // launch would have been "in flight" under the old counter.
    await rootedOutside
  })
  expect(
    offChain,
    'ESCAPE 3: a spawn on an unrelated async chain must STILL be blocked while a launch is in flight',
  ).toContain(ISOLATION_TAG)

  // D2 — after the scope closes, blocked again.
  expect(attempt(), 'D2 must be blocked').toContain(ISOLATION_TAG)
  console.log(
    'T-450 QA escape 3 (launch-scope race)\n' +
      '  blocked: D0 (no launch in flight)\n' +
      '  suppressed: D1 (inside the launch’s own async chain, by design)\n' +
      '  blocked: unrelated async chain while a launch is in flight (the fix)\n' +
      '  blocked: D2 (after the launch completes)',
  )
})

test('T-450 QA escape 4 (PER-REALM): a worker_threads realm gets the rules carried into it', async () => {
  const before = snapshotRealHome()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-worker-'))
  const workerFile = path.join(dir, 'escape-worker.cjs')
  // The realm the R3 escape used. `@playwright/test` is resolved through the
  // package root because the worker script itself lives outside it.
  fs.writeFileSync(
    workerFile,
    `const { parentPort } = require('worker_threads')
const installed = !!globalThis[Symbol.for('productune.t442.isolationEnforcer')]
if (!installed) {
  // Report and STOP. Attempting the launch in an unguarded realm is exactly what
  // wrote the real userData in R3, and it would open a window here.
  parentPort.postMessage({ installed: false })
} else {
  const pw = require(require.resolve('@playwright/test', { paths: [${JSON.stringify(GUI_ROOT)}] }))
  const results = {}
  // The guard throws SYNCHRONOUSLY (containment is checked before any promise is
  // created), so a bare .then/.catch would not see it — the throw would escape as
  // a worker error instead. Both paths are handled.
  try {
    pw._electron.launch({ args: [${JSON.stringify(MAIN)}] }).then(
      () => { results.electron = 'NOT BLOCKED'; finish() },
      (e) => { results.electron = e.message; finish() },
    )
  } catch (e) { results.electron = e.message; finish() }
  function finish() {
    try {
      require('child_process').spawnSync(${JSON.stringify(APP_SHAPED_MISSING)}, [], {
        env: { ...process.env, HOME: ${JSON.stringify(REAL_HOME)} },
      })
      results.childProcess = 'NOT BLOCKED'
    } catch (e) { results.childProcess = e.message }
    parentPort.postMessage({ installed: true, results })
  }
}
`,
  )

  try {
    const { Worker } = require('worker_threads') as typeof import('worker_threads')
    const msg = await new Promise<{ installed: boolean; results?: Record<string, string> }>((resolve, reject) => {
      const w = new Worker(workerFile)
      w.once('message', (m) => {
        void w.terminate()
        resolve(m)
      })
      w.once('error', reject)
    })

    expect(
      msg.installed,
      'ESCAPE 4: the worker realm has NO isolation rules. This is the R3 escape — a ' +
        'launch from here writes the real userData while Playwright reports PASSED.',
    ).toBe(true)
    expect(msg.results?.electron, 'ESCAPE 4: the launcher must be guarded inside the worker realm').toContain(
      ISOLATION_TAG,
    )
    expect(msg.results?.childProcess, 'ESCAPE 4: child_process must be guarded inside the worker realm').toContain(
      ISOLATION_TAG,
    )
    console.log(
      'T-450 QA escape 4 (worker_threads realm)\n' +
        '  rules present in the new realm: yes (via execArgv --require)\n' +
        '  blocked: _electron.launch inside the worker\n' +
        '  blocked: child_process.spawnSync inside the worker\n' +
        '  NOTE prevention here closes the SHAPE; the tripwire is what closes the CLASS.',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  expect(diffSnapshots(before, snapshotRealHome()), 'the worker rows mutated the real home').toEqual([])
})

test('T-450 QA escape 5 (GRANDCHILD): a spawned node child inherits the rules', () => {
  const before = snapshotRealHome()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-grandchild-'))
  const grandchild = path.join(dir, 'grandchild.cjs')
  const middle = path.join(dir, 'middle.cjs')

  // The grandchild tries the app launch. The outer spawn's argv is NOT app-shaped
  // (it is `node middle.cjs`), which is precisely why T-442's rule 3 never fired.
  fs.writeFileSync(
    grandchild,
    `const installed = !!globalThis[Symbol.for('productune.t442.isolationEnforcer')]
let blocked = 'NOT ATTEMPTED'
if (installed) {
  try {
    require('child_process').spawnSync(${JSON.stringify(APP_SHAPED_MISSING)}, [], {
      env: { ...process.env, HOME: ${JSON.stringify(REAL_HOME)} },
    })
    blocked = 'NOT BLOCKED'
  } catch (e) { blocked = e.message }
}
console.log(JSON.stringify({ depth: process.env.__T450_DEPTH, installed, blocked }))
`,
  )
  fs.writeFileSync(
    middle,
    `const cp = require('child_process')
const installed = !!globalThis[Symbol.for('productune.t442.isolationEnforcer')]
console.log(JSON.stringify({ depth: 'child', installed }))
// A GREAT-grandchild, spawned by a realm that itself only got the rules by
// inheritance. NODE_OPTIONS propagates on its own, which is what makes depth
// unbounded rather than "one level deep".
const r = cp.spawnSync(process.execPath, [${JSON.stringify(grandchild)}], {
  encoding: 'utf-8',
  env: { ...process.env, __T450_DEPTH: 'grandchild' },
})
process.stdout.write(r.stdout)
process.stderr.write(r.stderr)
`,
  )

  try {
    const res = cp.spawnSync(process.execPath, [middle], {
      cwd: GUI_ROOT,
      encoding: 'utf-8',
      timeout: 60_000,
      env: { ...process.env, __T450_DEPTH: 'child' },
    })
    const lines = res.stdout
      .split('\n')
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => JSON.parse(l) as { depth: string; installed: boolean; blocked?: string })
    const child = lines.find((l) => l.depth === 'child')
    const grand = lines.find((l) => l.depth === 'grandchild')

    expect(child, `no report from the child.\n${res.stdout}\n${res.stderr}`).toBeTruthy()
    expect(child?.installed, 'ESCAPE 5: the spawned node child had no rules').toBe(true)
    expect(grand, `no report from the grandchild.\n${res.stdout}\n${res.stderr}`).toBeTruthy()
    expect(
      grand?.installed,
      'ESCAPE 5: the GRANDchild had no rules — propagation stopped after one level',
    ).toBe(true)
    expect(grand?.blocked, 'ESCAPE 5: the grandchild must be blocked from launching the app').toContain(
      ISOLATION_TAG,
    )
    console.log(
      'T-450 QA escape 5 (grandchild node realm)\n' +
        '  rules present in child:      yes (NODE_OPTIONS --require injected by the guard)\n' +
        '  rules present in grandchild: yes (Node propagates NODE_OPTIONS on its own)\n' +
        '  blocked: app launch from the grandchild\n' +
        '  NOTE this closes NODE realms. A non-node grandchild is a stated boundary below.',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  expect(diffSnapshots(before, snapshotRealHome()), 'the grandchild rows mutated the real home').toEqual([])
})

test('T-450 S8: every spelling of a node grandchild gets the rules', () => {
  // R1 claimed the grandchild case was closed. QA listed four spellings that walk
  // past it, all of them defeating the same thing — a NAME-based `looksLikeNodeChild`
  // gate on whether to inject the bootstrap:
  //
  //   `env node`      the argv[0] is `env`, not `node`
  //   `sh -c node`    the argv[0] is `sh`, and the shell APIs injected nothing
  //   `execSync`      a shell API, so it never reached the injection at all
  //   `nodejs`        a symlink under a different name
  //
  // Widening the name list would have been the S1 mistake again. The gate is GONE:
  // `NODE_OPTIONS` now goes to EVERY child, because a non-node child ignores it and
  // a shell hands it on. Each spelling below is executed and asked whether the
  // realm it produced has the rules.
  const before = snapshotRealHome()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-s8-'))
  const probe = path.join(dir, 'probe.cjs')
  fs.writeFileSync(
    probe,
    `console.log(JSON.stringify({ installed: !!globalThis[Symbol.for('productune.t442.isolationEnforcer')] }))\n`,
  )
  // A symlink to node under a different name, which is QA's `nodejs` case.
  const nodeAlias = path.join(dir, 'nodejs')
  fs.symlinkSync(process.execPath, nodeAlias)

  const parse = (out: string): boolean => {
    const line = out.split('\n').find((l) => l.trim().startsWith('{'))
    expect(line, `no probe report in output:\n${out}`).toBeTruthy()
    return (JSON.parse(line as string) as { installed: boolean }).installed
  }
  const q = (s: string): string => JSON.stringify(s)

  try {
    const results: Record<string, boolean> = {
      'env node (argv[0] is `env`)': parse(
        cp.execFileSync('/usr/bin/env', ['node', probe], { encoding: 'utf-8', timeout: 60_000 }),
      ),
      'sh -c node (argv[0] is `sh`)': parse(
        cp.execFileSync('/bin/sh', ['-c', `${q(process.execPath)} ${q(probe)}`], {
          encoding: 'utf-8',
          timeout: 60_000,
        }),
      ),
      'execSync (a shell API — injected nothing at all)': parse(
        cp.execSync(`${q(process.execPath)} ${q(probe)}`, { encoding: 'utf-8', timeout: 60_000 }),
      ),
      'exec (async shell API)': parse(
        cp.execFileSync('/bin/sh', ['-c', `${q(nodeAlias)} ${q(probe)}`], {
          encoding: 'utf-8',
          timeout: 60_000,
        }),
      ),
      'a symlink named `nodejs`': parse(
        cp.execFileSync(nodeAlias, [probe], { encoding: 'utf-8', timeout: 60_000 }),
      ),
      // The depth case R1 did close, kept so a regression there is visible too.
      'sh -c sh -c node (two shells deep)': parse(
        cp.execFileSync('/bin/sh', ['-c', `/bin/sh -c ${q(`${q(process.execPath)} ${q(probe)}`)}`], {
          encoding: 'utf-8',
          timeout: 60_000,
        }),
      ),
    }
    for (const [shape, installed] of Object.entries(results)) {
      expect(installed, `S8: this realm has NO rules — ${shape}`).toBe(true)
    }

    // The predicate that used to be the gate is still widened, because it still
    // chooses `execArgv` over `NODE_OPTIONS` for forks — but it is no longer what
    // decides whether a realm is guarded.
    expect(looksLikeNodeChild(nodeAlias), 'a symlink to node resolves to node whatever it is named').toBe(true)
    expect(looksLikeNodeChild('/usr/bin/nodejs'), '`nodejs` is a node name').toBe(true)
    expect(looksLikeNodeChild('/bin/sh'), 'a shell is still not a node realm').toBe(false)

    console.log(
      `T-450 S8 (grandchild bootstrap)\n` +
        Object.keys(results)
          .map((k) => `  rules present: ${k}`)
          .join('\n'),
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  expect(diffSnapshots(before, snapshotRealHome()), 'the S8 rows mutated the real home').toEqual([])
})

test('T-442 F-A: the rules reject every unsandboxed launch shape, and the real home is untouched', async () => {
  const before = snapshotRealHome()

  const outsideSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-udd-'))
  const okUdd = `--user-data-dir=${outsideSandbox}`

  /**
   * Each row is a way a future author could reach `_electron.launch`. The
   * chokepoint is the function, so location and import style are irrelevant BY
   * CONSTRUCTION — these rows prove that claim instead of asserting it.
   */
  const rows: Row[] = [
    {
      // The exact three-liner the round-2 scan was built around.
      name: 'direct import, no env, no --user-data-dir',
      run: () => _electron.launch({ args: [MAIN] }),
      expect: /without --user-data-dir/,
    },
    {
      // Bypass #3's mechanism: the call site is not the spec.
      name: 'through a helper function (indirection)',
      run: () => bypassViaHelper(),
      expect: /without --user-data-dir/,
    },
    {
      // Dodges any check that reads static imports.
      name: 'dynamic require at call time',
      run: () =>
        (require('@playwright/test') as typeof import('@playwright/test'))._electron.launch({ args: [MAIN] }),
      expect: /without --user-data-dir/,
    },
    {
      // THE round-2 hole, in one row: HOME is sandboxed and it still writes the
      // real userData, because HOME does not move it.
      name: 'sandboxed HOME but no --user-data-dir',
      run: () =>
        _electron.launch({
          args: [MAIN],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /without --user-data-dir/,
    },
    {
      name: '--user-data-dir pointed straight at the real userData',
      run: () =>
        _electron.launch({
          args: [MAIN, `--user-data-dir=${REAL_USER_DATA}`],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /--user-data-dir inside the real home/,
    },
    {
      name: 'real HOME restored explicitly, userData sandboxed',
      run: () =>
        _electron.launch({ args: [MAIN, okUdd], env: { ...process.env, HOME: REAL_HOME } as Record<string, string> }),
      expect: /HOME inside the real home/,
    },
    {
      name: 'env stripped entirely (no HOME at all)',
      run: () => _electron.launch({ args: [MAIN, okUdd], env: {} as Record<string, string> }),
      expect: /no HOME in its environment/,
    },
    {
      // Never touches `_electron`. This is the shape the scan could only ever
      // guess at, and the one the T-440 live-proof driver actually uses.
      name: 'child_process.spawn of the Electron binary with the real HOME',
      run: async () =>
        cp.spawn(APP_SHAPED_MISSING, [MAIN], { env: { ...process.env, HOME: REAL_HOME } as NodeJS.ProcessEnv }),
      expect: /child_process\.spawn\(\)[\s\S]*HOME inside the real home/,
    },
    {
      name: 'child_process.execFileSync of a packaged .app executable',
      run: async () =>
        cp.execFileSync('/Applications/Productune.app/Contents/MacOS/Productune', [], {
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as NodeJS.ProcessEnv,
        }),
      expect: /without --user-data-dir/,
    },
    {
      // T-450 boundary ③ corrected: a NON-app-shaped child handed the real home.
      // Under T-442 nothing fired at all here, because `looksLikeAppLaunch` was
      // false and `assertContained` was therefore never called — so rule 1 was
      // skipped, not just rule 2.
      name: 'a plain, non-app-shaped child handed the REAL home',
      run: async () => cp.spawnSync('/bin/echo', ['hi'], { env: { HOME: REAL_HOME } as NodeJS.ProcessEnv }),
      expect: /HOME inside the real home/,
    },
    {
      // T-450 R2 / S6. The checker read the FIRST --user-data-dir; Chromium uses
      // the LAST (QA proved it with a real launch in the VM). So a launch could be
      // validated against a clean path and executed against the real userData.
      name: 'S6 — TWO --user-data-dir flags, the last one at the real userData',
      run: () =>
        _electron.launch({
          args: [MAIN, `--user-data-dir=${outsideSandbox}`, `--user-data-dir=${REAL_USER_DATA}`],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /--user-data-dir inside the real home/,
    },
    {
      // …and the reverse order too, so this is "every occurrence must be clean"
      // rather than "mirror whichever one Chromium happens to prefer today".
      name: 'S6b — the REAL userData first, a clean path last',
      run: () =>
        _electron.launch({
          args: [MAIN, `--user-data-dir=${REAL_USER_DATA}`, `--user-data-dir=${outsideSandbox}`],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /--user-data-dir inside the real home/,
    },
  ]

  const results: string[] = []
  for (const row of rows) results.push(await assertBlocked(row))
  console.log(`T-442 F-A bypass matrix — ${rows.length} shapes\n${results.join('\n')}`)

  fs.rmSync(outsideSandbox, { recursive: true, force: true })

  expect(diffSnapshots(before, snapshotRealHome()), 'a bypass attempt mutated the REAL home').toEqual([])
})

// ─────────────────────────────────────────────────────────────────────────────
// Escape shapes INVENTED THIS ROUND — the acceptance asks for a guarantee that
// holds for a spec that does not exist yet, not a re-run of the known five.
// ─────────────────────────────────────────────────────────────────────────────

test('T-450 NEW N1: deleting PRODUCTUNE_REAL_HOME no longer neuters every rule', async () => {
  // The most damaging shape found this round, and it is one line.
  //
  // T-442 read `process.env.PRODUCTUNE_REAL_HOME` on EVERY call, falling back to
  // `os.homedir()`. `os.homedir()` follows HOME on POSIX (measured) and the config
  // repoints HOME at the sandbox — so
  //
  //     delete process.env.PRODUCTUNE_REAL_HOME
  //
  // made `realHome()` return the SANDBOX. Every containment check then compared
  // real paths against the sandbox, found them "outside", and passed. Not one
  // rule survived; the enforcer became a no-op that still looked installed.
  const saved = process.env.PRODUCTUNE_REAL_HOME
  try {
    delete process.env.PRODUCTUNE_REAL_HOME
    expect(insideRealHome(REAL_USER_DATA), 'N1: the real userData must still be recognised').toBe(true)
    expect(insideRealHome(REAL_HOME), 'N1: the real home must still be recognised').toBe(true)

    const msg = await assertBlocked({
      name: 'N1 — real-home marker deleted, then launch at the real userData',
      run: () =>
        _electron.launch({
          args: [MAIN, `--user-data-dir=${REAL_USER_DATA}`],
          env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as Record<string, string>,
        }),
      expect: /--user-data-dir inside the real home/,
    })

    // Self-healing: the frozen value is put back so spawned realms still inherit
    // it. A child that inherited a stripped environment would be unguarded.
    expect(process.env.PRODUCTUNE_REAL_HOME, 'N1: the marker must be restored for children').toBe(REAL_HOME)
    console.log(`T-450 NEW N1 (frozen real home)\n${msg}`)
  } finally {
    if (saved === undefined) delete process.env.PRODUCTUNE_REAL_HOME
    else process.env.PRODUCTUNE_REAL_HOME = saved
  }
})

test('T-450 NEW N2: reaching the launcher through a different package entrypoint', async () => {
  // `@playwright/test` re-exports the launcher from `playwright-core`. If those
  // were DIFFERENT objects, patching one would leave the other pristine and a
  // spec could simply import the other one. Measured: all three entrypoints share
  // one `_electron` object, so the patch covers them — but that is a fact about
  // today's Playwright, not a law, so it is pinned here rather than assumed.
  const pt = require('@playwright/test') as { _electron: unknown }
  const entrypoints = ['playwright', 'playwright-core']
  const reachable: string[] = []
  for (const id of entrypoints) {
    let mod: { _electron?: unknown } | null = null
    try {
      mod = require(require.resolve(id, { paths: [path.dirname(require.resolve('@playwright/test')), GUI_ROOT] }))
    } catch {
      continue // not reachable from this install — nothing to patch
    }
    reachable.push(id)
    expect(
      mod?._electron,
      `N2: ${id} exposes a DIFFERENT launcher object than @playwright/test. The patch ` +
        `does not cover it, and a spec can import it directly. Patch it in ` +
        `isolation-rules.cjs (patchElectron already accepts any module).`,
    ).toBe(pt._electron)
  }
  expect(reachable.length, 'N2: neither alternate entrypoint resolved — the check was vacuous').toBeGreaterThan(0)

  // And going through one of them is blocked, not merely "the same object".
  const msg = await assertBlocked({
    name: 'N2 — launch via the playwright-core entrypoint',
    run: () => {
      const core = require(
        require.resolve('playwright-core', { paths: [path.dirname(require.resolve('@playwright/test')), GUI_ROOT] }),
      ) as { _electron: { launch: (o: unknown) => Promise<unknown> } }
      return core._electron.launch({ args: [MAIN] })
    },
    expect: /without --user-data-dir/,
  })
  console.log(`T-450 NEW N2 (alternate package entrypoints: ${reachable.join(', ')})\n${msg}`)
})

test('T-450 NEW N3: raw spawn primitives under child_process are refused', () => {
  // `child_process` is a JS wrapper over process bindings, and those bindings are
  // still reachable on Node 22 (measured). A spec that calls them directly walks
  // past every wrapper the enforcer installs — no `_electron`, no
  // `child_process.spawn`, nothing to patch.
  for (const name of ['spawn_sync', 'process_wrap']) {
    let message = ''
    try {
      ;(process as unknown as { binding: (n: string) => unknown }).binding(name)
      message = 'NOT BLOCKED'
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    expect(message, `N3: process.binding('${name}') must be refused`).toContain(ISOLATION_TAG)
  }
  // Collateral check: unrelated bindings must still work, or this rule breaks
  // Node internals and gets reverted.
  expect(() => (process as unknown as { binding: (n: string) => unknown }).binding('fs')).not.toThrow()
  console.log(
    "T-450 NEW N3 (raw spawn bindings)\n  blocked: process.binding('spawn_sync')\n" +
      "  blocked: process.binding('process_wrap')\n  intact:  process.binding('fs')",
  )
})

test('T-450 NEW N6: promisify(execFile) is guarded, not a supported bypass', async () => {
  // ── INVENTED THIS ROUND, and it was very nearly shipped as a hole. ──────────
  //
  // `child_process.exec` and `execFile` carry a `util.promisify.custom`
  // implementation, and `promisify()` prefers it over generic callback
  // promisification. A wrapper that does not carry that property changes BEHAVIOUR:
  // `promisify(execFile)` silently falls back and resolves `stdout` alone instead
  // of `{stdout, stderr}`. That is how it was found — 19 of packages/core's git
  // tests failed with results that read like product bugs.
  //
  // The obvious repair is to copy the original's own properties onto the wrapper.
  // That would have been WORSE than the bug: the original's `promisify.custom`
  // closes over the UNWRAPPED function, so `promisify(execFile)` would have become
  // a documented, supported, entirely innocent-looking way to bypass every rule in
  // isolation-rules.cjs. Both halves are pinned here.
  const util = require('util') as typeof import('util')

  // HALF 1 — the CONTRACT is preserved, or the product breaks and someone reverts
  // the guard to make the tests pass again.
  const execFileAsync = util.promisify(cp.execFile)
  const ok = await execFileAsync('/bin/echo', ['contract'])
  expect(typeof ok, 'promisify(execFile) must resolve an OBJECT, not a bare string').toBe('object')
  expect(ok.stdout.trim()).toBe('contract')
  expect(ok.stderr, 'stderr must be present, which is what the custom impl is for').toBe('')

  // HALF 2 — and it is still GUARDED. This is the row that would have been green
  // for the wrong reason under a naive property copy.
  let message = ''
  try {
    await execFileAsync(APP_SHAPED_MISSING, [], {
      env: { ...process.env, HOME: REAL_HOME } as NodeJS.ProcessEnv,
    })
    message = 'NOT BLOCKED'
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  expect(
    message,
    'N6: promisify(execFile) must go through the guard. If this is NOT BLOCKED, the ' +
      "wrapper is exposing the original's promisify.custom and every rule here is optional.",
  ).toContain(ISOLATION_TAG)

  // The same for `exec`, which has its own custom impl.
  const execAsync = util.promisify(cp.exec)
  const okExec = await execAsync('echo contract2')
  expect(okExec.stdout.trim()).toBe('contract2')
  let execMsg = ''
  try {
    await execAsync('true', { env: { ...process.env, HOME: REAL_HOME } as NodeJS.ProcessEnv })
    execMsg = 'NOT BLOCKED'
  } catch (e) {
    execMsg = e instanceof Error ? e.message : String(e)
  }
  expect(execMsg, 'N6: promisify(exec) must be guarded too').toContain(ISOLATION_TAG)

  console.log(
    'T-450 NEW N6 (promisify.custom)\n' +
      '  contract kept: promisify(execFile) resolves {stdout, stderr}\n' +
      '  guarded:       promisify(execFile) and promisify(exec) both hit the rules\n' +
      "  NOT done:      copying the original's promisify.custom, which would be a bypass",
  )
})

test('T-450 NEW N7: a realm that cannot identify the real home fails closed', () => {
  // ── ALSO INVENTED THIS ROUND, and it is the S1 defect in a second place. ────
  //
  // `REAL_HOME` falls back to `os.homedir()` when `PRODUCTUNE_REAL_HOME` is unset,
  // and refuses to guess when HOME is already a sandbox — because comparing every
  // real path against the sandbox makes the whole enforcer a silent no-op.
  //
  // That fail-closed check listed ONE sandbox root: the Playwright one. This ticket
  // put the rules into vitest realms, whose sandbox root is a DIFFERENT directory
  // (`productune-vitest-home`, see scripts/vitest-home-sandbox.ts) — so in a vitest
  // realm the check did not fire, the sandbox was recorded as "the real home", and
  // every containment test passed. Exactly S1's shape: a predicate that knew about
  // one spelling of the same thing and not the others.
  // MEASURED BY LOADING A FRESH COPY OF THE MODULE, not by spawning a child.
  //
  // A child cannot show this any more, and the reason is itself worth recording:
  // `bootstrapEnv` now injects `PRODUCTUNE_REAL_HOME` into EVERY child, so a
  // spawned realm can no longer be missing the marker at all. That is defence in
  // depth working — and it also means the fail-closed check has to be exercised
  // where it lives: at module load, with `require.cache` cleared.
  const rulesPath = require.resolve(path.join(TESTS_DIR, 'isolation-rules.cjs'))
  const originalModule = require.cache[rulesPath]
  const savedHome = process.env.HOME
  const savedMarker = process.env.PRODUCTUNE_REAL_HOME

  const loadFresh = (home: string, withMarker: boolean): string => {
    delete require.cache[rulesPath]
    process.env.HOME = home
    if (withMarker) process.env.PRODUCTUNE_REAL_HOME = REAL_HOME
    else delete process.env.PRODUCTUNE_REAL_HOME
    try {
      require(rulesPath)
      return 'LOADED'
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  try {
    for (const [label, root] of [
      ['playwright', SANDBOX_ROOT],
      ['vitest', path.join(os.tmpdir(), 'productune-vitest-home')],
    ] as const) {
      expect(
        loadFresh(path.join(root, 'some-worker-home'), false),
        `N7: with HOME inside the ${label} sandbox root and no marker, the rules MUST refuse to ` +
          `load. Loading means the sandbox was recorded as the real home and every rule is a no-op.`,
      ).toContain('cannot determine the real home')
    }

    // T-450 R3 / F5 — the S1 defect in a THIRD place: the fail-closed check used
    // to match sandbox roots by `os.tmpdir()` PREFIX, and `os.tmpdir()` answers
    // `/tmp` in a realm without TMPDIR (measured) while the sandboxes live under
    // `/var/folders/…` — so a child spawned without TMPDIR failed to match,
    // recorded the sandbox as the real home, and every rule reopened as a no-op.
    // Recognition is now by path SEGMENT, which travels with the path itself and
    // needs nothing from the environment.
    const savedTmpdir = process.env.TMPDIR
    try {
      delete process.env.TMPDIR
      expect(
        loadFresh(path.join(SANDBOX_ROOT, 'some-worker-home'), false),
        'F5: with TMPDIR unset the sandbox HOME must STILL be recognised and refused',
      ).toContain('cannot determine the real home')
    } finally {
      if (savedTmpdir === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = savedTmpdir
    }

    // …and with the marker present it loads normally, or the check would just be
    // "the rules never load in a sandbox".
    expect(
      loadFresh(path.join(os.tmpdir(), 'productune-vitest-home', 'w'), true),
      'N7: with PRODUCTUNE_REAL_HOME provided the rules must load',
    ).toBe('LOADED')
  } finally {
    // Restore BOTH the environment and the module cache. Every other module in this
    // realm already holds a reference to the original instance, so leaving a second
    // one cached would mean two frozen REAL_HOME values in one process.
    if (savedHome === undefined) delete process.env.HOME
    else process.env.HOME = savedHome
    if (savedMarker === undefined) delete process.env.PRODUCTUNE_REAL_HOME
    else process.env.PRODUCTUNE_REAL_HOME = savedMarker
    delete require.cache[rulesPath]
    if (originalModule) require.cache[rulesPath] = originalModule
  }

  // The environment survived the experiment — this spec's later rows depend on it.
  expect(process.env.HOME, 'N7 must leave HOME as it found it').toBe(DEFAULT_SANDBOX_HOME)
  expect(insideRealHome(REAL_USER_DATA), 'the rules still work after the cache dance').toBe(true)

  // And the defence-in-depth half, stated as an assertion rather than a comment:
  // a spawned realm cannot be missing the marker, because the guard supplies it.
  const spawned = cp.spawnSync(
    process.execPath,
    ['-e', 'process.stdout.write(String(process.env.PRODUCTUNE_REAL_HOME))'],
    { encoding: 'utf-8', timeout: 60_000, env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } },
  )
  expect(spawned.stdout, 'every child is handed the real-home marker').toBe(REAL_HOME)

  console.log(
    'T-450 NEW N7 (fail-closed real-home detection)\n' +
      '  refused: HOME inside the playwright sandbox root, no marker\n' +
      '  refused: HOME inside the VITEST sandbox root, no marker (the new one)\n' +
      '  refused: same with TMPDIR unset (F5 — path-segment match, not tmpdir prefix)\n' +
      '  loaded:  marker present\n' +
      '  and:     every spawned child is handed the marker, so the case is unreachable here',
  )
})

test('T-450 NEW N4: a direct fs write to the real home — prevention is silent, detection is not', () => {
  // Deliberately NOT a launch. No chokepoint in isolation-rules.cjs has anything
  // to say about `fs.writeFileSync`, and adding one would be hopeless: `fs` has
  // dozens of entry points and a spec can reach the syscalls through many of them.
  //
  // This is the shape that shows why detection had to become the floor. The
  // guarantee here is not "it cannot happen" but "the run goes red if it does",
  // which is proven end-to-end by the nested-suite test above (the mutating spec
  // does exactly this and the run fails).
  const target = path.join(REAL_HOME, '.productune', 'T450-WOULD-HAVE-WRITTEN-THIS')
  expect(insideRealHome(target), 'the target is inside the real home').toBe(true)
  expect(fs.existsSync(target), 'this test must never actually create it').toBe(false)

  // Assert the honest boundary: prevention does not cover this path at all.
  expect(
    looksLikeAppLaunch('/bin/dd', [`of=${target}`]),
    'N4: a plain file write is not an app launch and is not meant to be caught here',
  ).toBe(false)
  console.log(
    'T-450 NEW N4 (direct fs write, no launch)\n' +
      '  prevention: NOT COVERED, by design — fs has too many entry points\n' +
      '  detection:  COVERED — see "T-450 THE FLOOR", whose fixture performs this write',
  )
})

test('T-450 NEW N5 BOUNDARY: a delayed non-node grandchild escapes BOTH layers', () => {
  // ── THIS SHAPE IS NOT CLOSED. Stated, with blast radius, per acceptance. ────
  //
  //   cp.spawn('/bin/sh', ['-c', 'sleep 60; exec "$E" "$M"'], {
  //     detached: true,
  //     env: { ...process.env, E: <electron binary>, M: <main.js> },
  //   })
  //
  // Why prevention misses it:
  //   • the argv is `/bin/sh -c 'sleep 60; exec "$E" "$M"'` — the app path is in
  //     the ENVIRONMENT, so the joined argv contains no APP_SHAPES marker and
  //     `looksLikeAppLaunch` is false;
  //   • HOME is the sandbox, so the explicit-real-HOME rule (rule 4) is satisfied
  //     — and it does not matter, because Electron takes userData from the OS
  //     account, not from HOME. That is the whole reason rule 2 exists;
  //   • `/bin/sh` is not a node binary, so no NODE_OPTIONS bootstrap is injected
  //     and the realm that eventually execs Electron never has the rules.
  //
  // Why detection misses it: the mutation happens AFTER the run's final
  // fingerprint. A run-scoped tripwire cannot observe a write that has not
  // happened yet.
  //
  // BLAST RADIUS: a full unsandboxed app boot against the real userData —
  // `SingletonLock`, `SingletonSocket`, `SingletonCookie`, `Local Storage`,
  // `DevToolsActivePort` — and, because the single-instance lock is
  // filesystem-scoped to userData, it can kill or steal focus from the
  // developer's own running Productune. `~/.productune` and `~/.prdt` are NOT hit
  // (HOME is genuinely sandboxed), so the damage is confined to userData plus one
  // stray GUI process. The run is green and nothing correlates the damage with it,
  // which is the same invisibility this ticket set out to remove — for one shape.
  //
  // ── T-450 R2 / S13: BOTH mitigations R1 folded are now ADOPTED ──────────────
  //
  // R1 declined them and gave two reasons. QA disputed both, and QA was right on
  // both counts, so the reasons are corrected rather than the conclusion repeated:
  //
  //   • "a process-group reap is racy — the child can escape its group". True only
  //     of a child that detaches or `setsid`s ITSELF, and `detached: true` was the
  //     ordinary way to do that. It is now REFUSED outright (rule 6, fixture
  //     above). The reap itself is still not implemented, for a different and
  //     narrower reason: killing a process group from inside the run means aiming
  //     a signal at the developer's own shell session, and that blast radius is
  //     worse than the shape it would close.
  //   • "persisting the snapshot can only be a warning, never a failure". Also
  //     true, and irrelevant to whether it is worth having: QA points out it would
  //     have SURFACED incidents ② and ③ of this ticket's lineage, both of which
  //     were instead found days later by reading a diff. It is implemented, as a
  //     warning, in `armTripwire` — the only mechanism in this file that can see a
  //     mutation which lands after a run has already ended.
  //
  // WHAT REMAINS OPEN is therefore narrower than R1's statement, not the same: a
  // child that calls `setsid()` itself, or backgrounds work with `sh -c '… &'`, can
  // still outlive the run. The blast radius above is unchanged for that shape, and
  // the next run's warning is what surfaces it.
  const shellCommand = 'sleep 60; exec "$E" "$M"'
  expect(
    looksLikeAppLaunch('/bin/sh', ['-c', shellCommand]),
    'N5: if this is now TRUE the boundary has narrowed and this comment is stale — rewrite it',
  ).toBe(false)
  expect(looksLikeNodeChild('/bin/sh'), 'N5: /bin/sh gets no bootstrap, so the realm is unguarded').toBe(false)
  // The same command with the path inline IS caught — which is what makes the
  // env-indirection the actual escape rather than "shells are unguarded".
  expect(
    looksLikeAppLaunch('/bin/sh', ['-c', `sleep 60; exec ${MAIN}`]),
    'N5: the inline-path variant must still be recognised',
  ).toBe(true)
  console.log(
    'T-450 NEW N5 (delayed non-node grandchild) — OPEN BOUNDARY\n' +
      '  prevention: escapes (no app-shape in argv, HOME legitimately sandboxed, non-node realm)\n' +
      '  detection:  escapes (mutation lands after the run’s final fingerprint)\n' +
      '  blast radius: real userData + single-instance lock of the developer’s running app\n' +
      '  demonstrated: the reduced form, end-to-end — see the next test',
  )
})

test('T-450 N5 REDUCED FORM demonstrated: invisible to its own run, surfaced by the next run\'s warning', () => {
  // QA R2 could not demonstrate this because their harness could not background
  // cleanly — the hazard lives in quoting `sh -c '… &'`. Two changes make it
  // deterministic here: the command travels through ENV VARS instead of quoted
  // interpolation, and the backgrounded writer waits for a FLAG FILE that this
  // test creates only AFTER the nested run has exited — so the write provably
  // lands after that run's final fingerprint, not on a sleep race.
  //
  // What this proves, in order:
  //   1. `sh -c '… &'` still slips past prevention (the S13 fix refuses
  //      `detached: true`, the ordinary route; the shell ampersand is the
  //      deliberate-effort route that keeps N5 a boundary);
  //   2. the run it escaped from is GREEN and honestly reports "unchanged" —
  //      the write had not happened yet, which is WHY no run-scoped mechanism
  //      can close N5;
  //   3. the NEXT run's between-run warning (S13, adopted at QA's prompting in
  //      R2) surfaces exactly this landing — the mechanism that would have
  //      surfaced incidents ② and ③ of this ticket's lineage, now measured
  //      instead of argued.
  test.setTimeout(300_000)
  const guardBefore = snapshotRealHome()
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-n5-'))
  const flag = path.join(homeRoot, 'land-now')
  const runs: Array<{ cleanup: () => void }> = []
  try {
    const LATE_SPEC = `
const cp = require('child_process')
const path = require('path')
const { test, expect } = require('@playwright/test')

test('spawns a backgrounded writer and finishes clean', () => {
${REFUSAL_GUARD}
  const target = path.join(decoy, '.productune', 'late-landing-write')
  // NOT detached (that is refused, S13). A shell '&' orphan survives the run —
  // the exact N5 reduced form. The writer spins on the flag file, capped at 60s
  // so a failed outer test cannot leave an immortal orphan.
  cp.spawn('/bin/sh', ['-c',
    'i=0; until [ -f "$T450_FLAG" ] || [ "$i" -ge 600 ]; do sleep 0.1; i=$((i+1)); done; ' +
    'if [ -f "$T450_FLAG" ]; then echo late > "$T450_TARGET"; fi &'],
    { env: { ...process.env, T450_FLAG: ${JSON.stringify(flag)}, T450_TARGET: target }, stdio: 'ignore' })
  expect(1 + 1).toBe(2)
})
`
    // Run 1 — backgrounds the writer, exits green.
    const run1 = runNestedSuite({ specSource: LATE_SPEC, tripwire: true, reuseHomeRoot: homeRoot })
    runs.push(run1)
    const landed = path.join(run1.decoyHome, '.productune', 'late-landing-write')
    expect(run1.code, `N5: the backgrounding run must be GREEN — that is the boundary.\n${run1.output}`).toBe(0)
    expect(run1.output).toContain('real home unchanged across the run')
    expect(fs.existsSync(landed), 'the write must NOT have landed during the run, or this proves nothing').toBe(
      false,
    )

    // The run is over; NOW let the orphan land.
    fs.writeFileSync(flag, 'go')
    const deadline = Date.now() + 45_000
    while (!fs.existsSync(landed) && Date.now() < deadline) cp.execFileSync('/bin/sleep', ['0.2'])
    expect(fs.existsSync(landed), 'the orphaned writer must land AFTER the run — the N5 window').toBe(true)

    // Run 2, same decoy real home — the between-run warning surfaces the landing.
    const run2 = runNestedSuite({ specSource: CLEAN_SPEC, tripwire: true, reuseHomeRoot: homeRoot })
    runs.push(run2)
    expect(
      run2.code,
      'the next run is legitimately GREEN — between runs the developer uses their own machine, ' +
        'which is why this can only ever be a warning',
    ).toBe(0)
    expect(
      run2.output,
      'N5: the NEXT run must WARN about the late landing — the only mechanism that can see it',
    ).toContain('the real home changed since the last suite run')
    expect(run2.output).toContain('.productune')

    console.log(
      'T-450 N5 reduced form, demonstrated end-to-end\n' +
        `  run 1 (backgrounds writer)  exit ${run1.code} (GREEN, honestly: nothing had landed)\n` +
        '  after run 1 exits           the orphan lands its write (flag-gated, no sleep race)\n' +
        `  run 2 (same decoy home)     exit ${run2.code} + WARNING naming .productune\n` +
        '  the boundary stands; its landing is no longer silent',
    )
  } finally {
    try {
      fs.writeFileSync(flag, 'go') // never leave the orphan spinning
    } catch {
      /* homeRoot already gone */
    }
    for (const r of runs) r.cleanup()
    fs.rmSync(homeRoot, { recursive: true, force: true })
  }
  expect(diffSnapshots(guardBefore, snapshotRealHome()), 'the N5 fixture leaked out of the decoy').toEqual([])
})

// ─────────────────────────────────────────────────────────────────────────────
// The two boundary claims T-442 stated incorrectly — corrected, not deleted.
// ─────────────────────────────────────────────────────────────────────────────

test('T-450 boundary ① corrected: what the CJS pin actually protects, and the real ESM risk', () => {
  test.setTimeout(120_000)

  // T-442 asserted `pkg.type === 'commonjs'` with this justification: a true-ESM
  // test file "would get Node's own frozen `node:child_process` namespace, which
  // cannot be monkey-patched", so an ESM flip would silently drop rule 3.
  //
  // Measured, both halves are false. Node builds a builtin's ESM namespace from
  // that builtin's CJS exports, so a `.mjs` importing `node:child_process` AFTER
  // the patch sees the PATCHED functions. QA measured BLOCKED in a real
  // `.spec.mjs`; the two subprocess experiments below re-measure it here.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-esm-'))
  const rulesPath = path.join(TESTS_DIR, 'isolation-rules.cjs')
  const probe = `spawnSync(${JSON.stringify(APP_SHAPED_MISSING)}, [], { env: { ...process.env, HOME: ${JSON.stringify(
    REAL_HOME,
  )} } })`

  const write = (name: string, body: string): string => {
    const f = path.join(dir, name)
    fs.writeFileSync(
      f,
      `import { createRequire } from 'module'\nconst require = createRequire(import.meta.url)\n${body}\n`,
    )
    return f
  }
  const run = (file: string): string =>
    cp
      .execFileSync(process.execPath, [file], {
        encoding: 'utf-8',
        timeout: 60_000,
        env: { ...process.env, PRODUCTUNE_REAL_HOME: REAL_HOME, HOME: DEFAULT_SANDBOX_HOME },
      })
      .trim()

  try {
    // EXPERIMENT A — a true-ESM named import in a realm where the rules are
    // installed. T-442 asserted this is unpatchable; it is patched.
    const afterFile = write(
      'after.mjs',
      `require(${JSON.stringify(rulesPath)}).installIsolationEnforcer()\n` +
        `const { spawnSync } = await import('node:child_process')\n` +
        `try { ${probe}; console.log('NOT BLOCKED') } catch (e) { console.log('BLOCKED') }`,
    )
    expect(
      run(afterFile),
      'boundary ①: a true-ESM named import IS patched. ' +
        "T-442's claim that ESM is unpatchable is false, and the pin was guarding a risk that does not exist.",
    ).toBe('BLOCKED')

    // EXPERIMENT B — the REAL risk, which is ORDERING.
    //
    // R1 measured this by spawning the probe through `/bin/sh` to obtain a realm
    // with NO rules, so the `.mjs` could import before installing. That route is
    // deliberately gone: the S8 fix hands `NODE_OPTIONS=--require <bootstrap>` to
    // EVERY child, and a shell passes it on, so there is no longer a way to get an
    // unbootstrapped realm out of this suite. Which is the good news — but it also
    // means the old experiment would now silently measure nothing, so it is
    // replaced rather than left to rot.
    //
    // The Node property is measured directly instead, with no dependence on our
    // rules being absent: patch a builtin's CJS exports AFTER importing it, and
    // compare the pre-import binding against the post-patch value.
    const orderingFile = write(
      'ordering.mjs',
      `const ns = await import('node:child_process')\n` +
        `const { spawnSync: capturedNamed } = ns\n` +
        `const live = require('child_process')\n` +
        `const before = live.spawnSync\n` +
        `live.spawnSync = function patchedLater() { return 'PATCHED' }\n` +
        `console.log(JSON.stringify({\n` +
        `  named: capturedNamed === before ? 'STALE' : 'LIVE',\n` +
        `  namespaceProp: ns.spawnSync === before ? 'STALE' : 'LIVE',\n` +
        `  defaultExport: ns.default.spawnSync === before ? 'STALE' : 'LIVE',\n` +
        `}))`,
    )
    const ordering = JSON.parse(run(orderingFile)) as Record<string, string>
    expect(
      ordering.named,
      'boundary ①: a NAMED ESM binding captured before the patch must go stale — this is ' +
        'the real risk T-442 could not see. If this is now LIVE, Node changed and both this ' +
        'test and the comments in isolation-enforcer.ts must be rewritten.',
    ).toBe('STALE')
    expect(ordering.namespaceProp, 'the namespace snapshot goes stale with it').toBe('STALE')
    // …and the DEFAULT export stays live, which is why the failure mode is narrow:
    // only pre-patch NAMED bindings go stale.
    expect(ordering.defaultExport, 'the default export is the live exports object').toBe('LIVE')

    // THE INVARIANT THAT ACTUALLY HOLDS, now asserted rather than argued: every
    // realm-entry path installs the rules through a PRELOAD (`--require` via
    // execArgv or NODE_OPTIONS), which runs before the realm's entry module — so
    // "import before install" is not reachable from inside this suite. S14: this
    // is a property of every new realm, not only of ESM.
    const rulesSrc = fs.readFileSync(rulesPath, 'utf-8')
    for (const realmEntry of ['execArgv', 'NODE_OPTIONS']) {
      expect(rulesSrc, `the ${realmEntry} preload path must exist, or a new realm starts unguarded`).toContain(
        realmEntry,
      )
    }
    expect(
      fs.readFileSync(path.join(GUI_ROOT, 'vitest.config.ts'), 'utf-8'),
      'vitest realms must be preloaded too — a setupFile would already be too late',
    ).toMatch(/execArgv:\s*\['--require', BOOTSTRAP\]/)

    console.log(
      'T-450 boundary ① (ESM + realm ordering), measured\n' +
        '  named import with rules installed  -> BLOCKED (T-442 claimed impossible)\n' +
        `  named binding captured pre-patch   -> ${ordering.named} (the REAL risk: ordering)\n` +
        `  default export captured pre-patch  -> ${ordering.defaultExport} (live object, so narrow)\n` +
        '  S14: every realm is preloaded, so "import before install" is unreachable here',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }

  // The pin is KEPT, for its true reason: this package's own CJS assumptions.
  // `__dirname` across tests/, `require()` in this spec, and
  // `require('./isolation-rules.cjs')` in isolation-enforcer.ts all break on an
  // ESM flip — loudly, which is why the assertion is still worth having.
  const pkg = JSON.parse(fs.readFileSync(path.join(GUI_ROOT, 'package.json'), 'utf-8')) as { type?: string }
  expect(
    pkg.type ?? 'commonjs',
    'packages/gui switched to ESM. This does NOT silently drop rule 3 (measured above) — ' +
      'what it breaks is this package\'s CJS assumptions: __dirname across tests/, require() ' +
      'in this spec, and require("./isolation-rules.cjs") in isolation-enforcer.ts.',
  ).toBe('commonjs')
  expect(typeof require, 'specs are not running as CJS').toBe('function')

  // The invariant that ACTUALLY protects rule 3 is ordering: the enforcer must
  // install before anything captures a child_process binding. In this suite that
  // is guaranteed structurally — playwright.config.ts installs it at module scope,
  // and Playwright evaluates the config before it loads any collected file.
  const configSrc = fs.readFileSync(path.join(GUI_ROOT, 'playwright.config.ts'), 'utf-8')
  const installLine = configSrc.split('\n').findIndex((l) => /^installIsolationEnforcer\(\)/.test(l))
  expect(installLine, 'installIsolationEnforcer() must be called at module scope in the config').toBeGreaterThan(0)
  expect(
    configSrc.split('\n').slice(0, installLine).join('\n'),
    'the config must not import child_process before installing the enforcer — a pre-patch ' +
      'named ESM binding is the one shape that really does go stale',
  ).not.toMatch(/from\s+['"](node:)?child_process['"]|require\(\s*['"](node:)?child_process['"]/)
})

test('T-450 boundary ② corrected: an unrecognised child no longer skips rule 1 as well', () => {
  // T-442's comment: "A spec that spawns a renamed copy of the app binary from a
  // path with no Electron/Productune marker is not recognised by rule 3. Rules 1+2
  // at the `_electron` level still apply."
  //
  // The second sentence is false for the `child_process` path. Nothing at the
  // `_electron` level applies to a call that never touches `_electron`, and
  // because `assertContained` was called only INSIDE the `looksLikeAppLaunch`
  // branch, an unrecognised shape skipped rule 1 (HOME) too — not merely rule 2.
  const renamed = path.join(os.tmpdir(), 'totally-innocent-tool')
  expect(looksLikeAppLaunch(renamed, []), 'a renamed binary is still unrecognised — that part was true').toBe(false)

  // The corrected behaviour: shape-gating now applies ONLY to the userData rule.
  // A real-home HOME is refused for every child, recognised or not.
  let message = ''
  try {
    cp.spawnSync(renamed, [], { env: { HOME: REAL_HOME } as NodeJS.ProcessEnv })
    message = 'NOT BLOCKED'
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  expect(message, 'boundary ②: rule 1 must apply to an unrecognised child too').toContain(ISOLATION_TAG)
  expect(message).toMatch(/HOME inside the real home/)

  // …and innocent spawns are untouched, which is what keeps the rule alive.
  expect(() => cp.spawnSync('/bin/echo', ['ok'], { env: { ...process.env } as NodeJS.ProcessEnv })).not.toThrow()
  expect(() => cp.spawnSync('/bin/echo', ['ok'])).not.toThrow()

  // ── T-450 R2 / S5: the residual NARROWED, and the reason is not the name ────
  //
  // R1 left this residual: "a renamed binary with a sandboxed HOME and no
  // --user-data-dir is not recognised, so rule 2 does not fire". QA showed how
  // expensive that was — it is the 2026-07-30 ancestor incident's exact shape, and
  // the same miss also skipped the WINDOW rule, which is the hole underneath the
  // argument that per-test `@window` precision could be left to the runtime rule.
  //
  // The gate no longer decides by NAME. Three of its five signals catch a renamed
  // copy, and each is asserted here rather than described.
  expect(
    looksLikeAppLaunch(renamed, [`--user-data-dir=${REAL_USER_DATA}`]),
    'S5: --user-data-dir is a Chromium-only flag, so its mere presence makes this an app launch',
  ).toBe(true)

  const electronBinary = path.join(
    GUI_ROOT,
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
  )
  test.skip(!fs.existsSync(electronBinary), 'the electron devDependency binary is not installed')

  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-renamed-'))
  const bySymlink = path.join(linkDir, 'totally-innocent-tool')
  fs.symlinkSync(electronBinary, bySymlink)
  try {
    expect(
      looksLikeAppLaunch(bySymlink, []),
      'S5: a symlink under an innocent name resolves to a known Electron binary',
    ).toBe(true)

    // A real COPY is the shape QA used, and it shares nothing but its bytes. Copying
    // ~100MB is worth it once: this is the assertion that would have caught the
    // ancestor incident, so it is measured rather than reasoned about.
    const byCopy = path.join(linkDir, 'definitely-not-electron')
    fs.copyFileSync(electronBinary, byCopy)
    expect(
      looksLikeAppLaunch(byCopy, []),
      'S5: a renamed COPY is byte-size-identical to a known Electron binary',
    ).toBe(true)

    // …and the WINDOW rule follows the same gate, which is the half R1 missed.
    let windowMsg = ''
    try {
      cp.spawnSync(byCopy, [`--user-data-dir=${path.join(linkDir, 'udd')}`], {
        env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as NodeJS.ProcessEnv,
      })
      windowMsg = 'NOT BLOCKED'
    } catch (e) {
      windowMsg = e instanceof Error ? e.message : String(e)
    }
    if (ALLOW_WINDOWS) {
      // In the VM a fully contained launch is allowed, so there is nothing to assert
      // beyond "it was not refused as an isolation violation".
      expect(windowMsg, 'S5: a contained launch must not be an isolation violation').not.toContain(ISOLATION_TAG)
    } else {
      expect(
        windowMsg,
        'S5: a renamed copy must hit the WINDOW rule too — this is the half R1 missed, ' +
          'and the reason the @window tag can be left to the runtime rule',
      ).toContain(WINDOW_TAG)
    }

    // ── T-450 R3 / F4: the S5 residual — corrected wording, then narrowed ──────
    //
    // R2 stated the residual as "rule 2 does not fire". UNDERSTATED, QA measured:
    // the WINDOW RULE sits behind the same gate, so a size-altered copy skipped
    // both — and on the host a window IS the incident; detection reddens the run
    // afterwards but cannot undo a window or return stolen focus.
    //
    // Closed for anything that can actually BOOT: dyld resolves the binary's
    // `@executable_path/../Frameworks` load command, so a copy that can launch
    // structurally carries an `../Frameworks/Electron Framework.framework`
    // sibling — signal 6, independent of the copy's name AND its size. Asserted
    // with a size-altered copy in a bundle layout, i.e. QA's exact R2 shape.
    const bundleDir = path.join(linkDir, 'Copied.app', 'Contents')
    fs.mkdirSync(path.join(bundleDir, 'MacOS'), { recursive: true })
    fs.mkdirSync(path.join(bundleDir, 'Frameworks', 'Electron Framework.framework'), { recursive: true })
    const sizeAltered = path.join(bundleDir, 'MacOS', 'definitely-not-electron')
    // 4KB of a ~100MB binary: name, size and inode all defeat signals 1–5.
    fs.writeFileSync(sizeAltered, fs.readFileSync(electronBinary).subarray(0, 4096))
    expect(
      looksLikeAppLaunch(sizeAltered, []),
      'F4: a size-altered copy inside a bundle layout must be recognised (signal 6)',
    ).toBe(true)
    let alteredMsg = ''
    try {
      cp.spawnSync(sizeAltered, [], { env: { ...process.env, HOME: DEFAULT_SANDBOX_HOME } as NodeJS.ProcessEnv })
      alteredMsg = 'NOT BLOCKED'
    } catch (e) {
      alteredMsg = e instanceof Error ? e.message : String(e)
    }
    expect(
      alteredMsg,
      'F4: the size-altered copy must be refused for CONTAINMENT (missing --user-data-dir), ' +
        'ahead of any window — this is the row that was NOT-BLOCKED in R2',
    ).toContain(ISOLATION_TAG)

    // The remainder, still honest and now narrower: a copy whose load commands
    // were REWRITTEN to a relocated/renamed framework (install_name_tool —
    // deliberate binary patching, not `cp`). Blast radius, stated per acceptance:
    // on the VM, an unsandboxed real-userData boot that only the tripwire
    // reddens after the fact; on the host, ADDITIONALLY a real window opens
    // before anything can refuse it — the one part of the damage no detection
    // layer can undo.
    const trimmed = path.join(linkDir, 'trimmed-copy')
    fs.writeFileSync(trimmed, fs.readFileSync(electronBinary).subarray(0, 1024))
    expect(
      looksLikeAppLaunch(trimmed, []),
      'the residual: a modified copy OUTSIDE any bundle layout is not recognised',
    ).toBe(false)

    console.log(
      'T-450 boundary ② + S5/F4 (unrecognised child)\n' +
        '  corrected: rule 1 (HOME) applies regardless of shape\n' +
        '  S5 closed: --user-data-dir presence, inode identity, byte-size identity\n' +
        '  F4 closed: size-altered copy in a bundle layout (framework sibling, signal 6)\n' +
        '             — R2 wording understated this: it skipped the WINDOW rule too\n' +
        '  residual:  a copy with RELOCATED load commands (install_name_tool);\n' +
        '             VM: tripwire-red userData boot · host: + a real window, undoable by nothing',
    )
  } finally {
    fs.rmSync(linkDir, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// The window rule (this machine) — acceptance: nothing that opens a window
// runs on the host.
// ─────────────────────────────────────────────────────────────────────────────

test('T-450: the window rule is a chokepoint, not a convention', async () => {
  // docs/wiki/fact--qa-cua-vm.md: a window means the VM. A tag alone would be a
  // convention a new test can forget, so the launcher itself refuses.
  expect(windowsAllowed()).toBe(process.env.PRODUCTUNE_ALLOW_WINDOWS === '1')

  if (ALLOW_WINDOWS) {
    expect(pwConfig.grepInvert, 'with windows allowed, @window tests must NOT be filtered out').toBeFalsy()
  } else {
    expect(String(pwConfig.grepInvert), 'a host run must grep-invert @window').toBe(String(WINDOW_TAG_PATTERN))

    // A launch that satisfies every containment rule is STILL refused on the
    // host, because it would open a window. This is what protects against a new
    // test that forgets the tag.
    const okHome = sandboxHome('window-rule')
    const okUdd = path.join(okHome, 'Library', 'Application Support', 'productune')
    let message = ''
    try {
      await _electron.launch({
        args: [MAIN, `--user-data-dir=${okUdd}`],
        env: { ...process.env, HOME: okHome } as Record<string, string>,
      })
      message = 'NOT BLOCKED'
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    fs.rmSync(okHome, { recursive: true, force: true })
    expect(message, 'a fully contained launch must still be refused on the host').toContain(WINDOW_TAG)
    expect(message, 'the refusal must say how to run it properly').toContain('PRODUCTUNE_ALLOW_WINDOWS=1')
    // …and it must NOT be reported as an isolation violation, or the two rules
    // would be indistinguishable in a log.
    expect(message, 'the window rule is not an isolation violation').not.toContain(ISOLATION_TAG)
  }

  // The realm bootstrap must exist on disk, or every "carried into a new realm"
  // claim above silently degrades to "not carried at all".
  expect(fs.existsSync(BOOTSTRAP), 'the realm bootstrap file must exist').toBe(true)
  expect(path.extname(BOOTSTRAP), 'the bootstrap must be plain CJS — a worker has no TS transform').toBe('.cjs')
})

/**
 * NOTE ON THIS TEST'S TITLE — it deliberately does NOT contain the literal window
 * tag, and that is load-bearing rather than stylistic.
 *
 * The first version was titled '…is tagged @window'. `grepInvert` matches titles,
 * so the test that polices tagging was itself filtered out of every host run — the
 * one environment where a static check like this is the whole point. It only ever
 * executed in the VM, where it then failed, and the failure was real: see below.
 */
test('T-450: a spec that boots the app carries the window tag', () => {
  // WHY FILE-LEVEL AND NOT PER-TEST.
  //
  // The first version split each file on `test(` and flagged any block mentioning
  // `launchApp(`. Measured in the VM, that produced two false positives, both from
  // string LITERALS rather than calls: the scan matrix embeds a fixture source
  // containing "await launchApp({ home })", and the scan test's own failure
  // message reads 'Use `launchApp()` from tests/harness.ts instead.'. Matching raw
  // source cannot tell a call from a mention, and a check that cries wolf is a
  // check someone deletes — which is how this ticket's predecessors died.
  //
  // Two corrections. Comments and string literals are stripped before matching, so
  // only real call sites count. And the assertion is FILE-level: a spec that
  // launches the app must carry the tag on at least one test. Per-test precision is
  // deliberately not attempted here — enumerating call shapes is what went wrong
  // above (the second attempt's prefix list missed `return launchApp({` in
  // t439.spec.ts). `tests/isolation-rules.cjs` refuses `_electron.launch` outright
  // unless PRODUCTUNE_ALLOW_WINDOWS=1, so an individually untagged window test
  // fails loudly with an instruction. That runtime refusal is the enforcement; this
  // is only the early, file-shaped warning.
  const offenders: string[] = []
  const tagged: string[] = []
  for (const rel of listCodeFiles(TESTS_DIR)) {
    if (!PLAYWRIGHT_TEST_FILE_RE.test(path.basename(rel))) continue
    const src = stripCommentsAndStrings(fs.readFileSync(path.join(TESTS_DIR, rel), 'utf-8'))
    if (!/\blaunchApp\s*\(/.test(src)) continue
    // The tag is read from the ORIGINAL source: it lives in test titles, which are
    // string literals and would have just been stripped.
    if (WINDOW_TAG_PATTERN.test(fs.readFileSync(path.join(TESTS_DIR, rel), 'utf-8'))) tagged.push(rel)
    else offenders.push(rel)
  }
  expect(
    offenders,
    'These specs boot the app but carry no window tag on any test, so a host run would ' +
      'try to open a real window. Tag the launching tests (docs/wiki/fact--qa-cua-vm.md).',
  ).toEqual([])
  // Non-vacuous: if nothing is tagged, the check above passed for free.
  expect(tagged.sort(), 'no spec carries the window tag — the check is vacuous').toEqual([
    'isolation.guard.spec.ts',
    'smoke.spec.ts',
    't439.spec.ts',
    'theme.spec.ts',
  ])
})

// ─────────────────────────────────────────────────────────────────────────────
// L1 / L2 — kept from round 2, still the reason a forgetful spec is safe at all
// ─────────────────────────────────────────────────────────────────────────────

test('T-442 F1: the config-level HOME sandbox is in effect in this worker', () => {
  expect(process.env.HOME, 'playwright.config.ts did not repoint HOME for this worker').toBe(
    DEFAULT_SANDBOX_HOME,
  )
  expect(os.homedir(), 'os.homedir() must follow the sandboxed HOME').toBe(DEFAULT_SANDBOX_HOME)
  expect(REAL_HOME, 'the real home must still be recorded for the guards').not.toBe(DEFAULT_SANDBOX_HOME)
  expect(DEFAULT_SANDBOX_HOME.startsWith(SANDBOX_ROOT)).toBe(true)
  expect(() => assertOutsideRealHome(DEFAULT_SANDBOX_HOME, 'default sandbox')).not.toThrow()
})

test('T-442 F1: the harness refuses to target the real home', () => {
  for (const p of [REAL_HOME, ...PROTECTED_REAL_PATHS]) {
    expect(() => assertOutsideRealHome(p, 'probe'), `${p} must be refused`).toThrow(/REAL home/)
  }
  expect(() => assertOutsideRealHome(path.join(__dirname, '..', 'test-results'), 'probe')).toThrow()

  const good = sandboxHome('guard')
  expect(() => assertOutsideRealHome(good, 'probe')).not.toThrow()
  fs.rmSync(good, { recursive: true, force: true })
})

test('T-442 F-A @window: the sanctioned harness call satisfies the same rules (no exemption)', async () => {
  // The rules have no allowlist, so this doubles as proof that the gate is
  // value-based: the harness passes because of WHAT it passes, not WHO it is.
  const home = sandboxHome('enforcer-ok')
  const app = await launchApp({ home })
  try {
    const seen = await app.evaluate(({ app: a }) => ({
      userData: a.getPath('userData'),
      envHome: process.env.HOME,
    }))
    expect(seen.envHome).toBe(home)
    expect(insideRealHome(seen.userData), 'harness launch put userData in the real home').toBe(false)
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('T-442 F1/F5 @window: a launched app resolves BOTH home and userData into the sandbox', async () => {
  const home = sandboxHome('isolation')
  const app = await launchApp({ home })
  try {
    // Ask the MAIN PROCESS where it resolved its two roots. `require` is not
    // available in this context (the main bundle is ESM), so read HOME from the
    // process env — which is exactly what `os.homedir()` returns on POSIX and
    // therefore what every `~/.productune` / `~/.prdt` writer resolves through.
    const paths = await app.evaluate(({ app: a }) => ({
      userData: a.getPath('userData'),
      envHome: process.env.HOME,
    }))

    expect(paths.envHome, 'app HOME — drives ~/.productune, ~/.prdt, ~/.claude').toBe(home)

    // Chromium canonicalises userData, so on macOS the sandbox's /var/folders
    // comes back as /private/var/folders. Compare realpaths, not strings.
    const real = (p: string) => fs.realpathSync(p)
    expect(real(paths.userData), 'app userData — drives Cache, Local Storage, single-instance lock')
      .toBe(real(path.join(home, 'Library', 'Application Support', 'productune')))

    for (const p of PROTECTED_REAL_PATHS) {
      expect(paths.userData.startsWith(p), `userData must not be under ${p}`).toBe(false)
    }
    expect(paths.userData.startsWith(REAL_HOME + path.sep), 'userData must be outside the real home').toBe(false)

    // Reading paths is a claim; this is the observation. The app provisions
    // ~/.prdt and ~/.productune/toolchain during startup, so by now those must
    // exist INSIDE the sandbox — proving the redirection governed real writes
    // and not merely a getter.
    await expect
      .poll(() => fs.existsSync(path.join(home, '.productune')) || fs.existsSync(path.join(home, '.prdt')), {
        timeout: 20_000,
        message: 'the app wrote neither ~/.productune nor ~/.prdt into the sandbox — ' +
          'either startup provisioning did not run, or it wrote somewhere else',
      })
      .toBe(true)
    expect(fs.existsSync(path.join(paths.userData, 'Cache')), 'userData Cache must land in the sandbox').toBe(true)
  } finally {
    await app.close()
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberate indirection: the banned call is NOT in the test body. This is
 * bypass #3's mechanism (`tests/evil-viahelper.spec.ts` →
 * `tests/evil-helper.ts`) reproduced in-process, where the chokepoint has to
 * catch it without help from any file scan.
 */
async function bypassViaHelper(): Promise<unknown> {
  const boot = async (): Promise<unknown> => _electron.launch({ args: [MAIN] })
  return boot()
}

/**
 * Remove comments and string/template literals, so a source search finds CALLS
 * rather than mentions. Approximate by design — it is used only to decide whether
 * `launchApp(` appears as code, and every inaccuracy errs towards removing text,
 * i.e. towards not flagging a mention.
 */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/\/\/[^\n]*/g, ' ') // line comments
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``') // template literals
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''") // single-quoted
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""') // double-quoted
}

async function closeQuietly(handle: unknown): Promise<void> {
  const h = handle as { close?: () => Promise<void>; kill?: () => void } | null
  try {
    if (h && typeof h.close === 'function') await h.close()
    else if (h && typeof h.kill === 'function') h.kill()
  } catch {
    /* the assertion that follows is the report */
  }
}
