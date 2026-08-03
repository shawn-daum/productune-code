/**
 * isolation.guard.spec.ts — T-442 F1 / F-A. The isolation rule, verified.
 *
 * The acceptance condition is not "the specs that exist today were fixed". It
 * is "a spec added next month cannot make this mistake again". Round 2 claimed
 * that and was wrong: the rule was a static scan over
 * `readdirSync(tests/).filter(f => f.endsWith('.spec.ts'))`, and the only shape
 * it could catch was the single shape its author had used as a negative
 * control. QA wrote three bypasses and all three passed the scan while
 * mutating 28 files in the REAL `~/Library/Application Support/productune`.
 *
 * A single negative control proves nothing. This file therefore checks the rule
 * against a MATRIX of bypass shapes — the three QA executed plus more — and
 * each row is an assertion, not a comment.
 *
 * Layers under test:
 *   L1  playwright.config.ts repoints HOME for the runner and every worker.
 *   L2  tests/harness.ts is the sanctioned launcher (both redirections).
 *   L3  tests/isolation-enforcer.ts wraps `_electron.launch` and app-shaped
 *       `child_process` calls in every worker. THE HARD GATE.
 *   L4  tests/isolation-scan.ts, recursive over every code file under testDir,
 *       cross-checked against Playwright's own `--list` collection.
 *   L5  a real-home fingerprint taken around the whole matrix: whatever the
 *       above miss, a mutation of the real home still turns the suite red.
 */

import cp from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect, _electron } from '@playwright/test'
import pwConfig, { TEST_DIR } from '../playwright.config'
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
import { ISOLATION_TAG, insideRealHome } from './isolation-enforcer'
import {
  CODE_FILE_RE,
  PLAYWRIGHT_TEST_FILE_RE,
  SCAN_EXEMPT,
  formatOffenders,
  listCodeFiles,
  listCollectableTestFiles,
  scanForUnsanctionedLaunch,
} from './isolation-scan'

const TESTS_DIR = __dirname
const GUI_ROOT = path.resolve(__dirname, '..')

/** Real userData — the surface HOME cannot move and the round-2 bypasses hit. */
const REAL_USER_DATA = path.join(REAL_HOME, 'Library', 'Application Support', 'productune')

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

    // ── KNOWN BOUNDARY, asserted rather than hidden ─────────────────────────
    //
    // A text scan loses to string assembly. This fixture spawns the Electron
    // binary with every recognisable substring built by `path.join`, so no
    // literal in the file contains `.app/Contents/MacOS/` or
    // `dist-electron/main.js`, and it never names `_electron`. The scan CANNOT
    // see it — measured, not assumed. Asserting the miss keeps the limitation
    // honest and makes it a visible change if the scan is ever widened.
    //
    // This shape is still blocked, by the runtime enforcer: the matrix row
    // 'child_process.spawn of the Electron binary…' below is the same shape,
    // and scripts/verify-isolation-bypass-matrix.sh runs it as a real collected
    // spec and shows the suite go red. That is exactly why L3 is the gate and
    // L4 is only the early, readable warning.
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
// L3 — the runtime chokepoint. THE fix for F-A.
// ─────────────────────────────────────────────────────────────────────────────

test('T-442 F-A: the enforcer rejects every unsandboxed launch shape, and the real home is untouched', async () => {
  const before = fingerprintRealHome()

  const outsideSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'productune-udd-'))
  const okUdd = `--user-data-dir=${outsideSandbox}`

  /**
   * Each row is a way a future author could reach `_electron.launch`. The
   * chokepoint is the function, so location and import style are irrelevant BY
   * CONSTRUCTION — these rows prove that claim instead of asserting it.
   */
  const rows: Array<{ name: string; run: () => Promise<unknown>; expect: RegExp }> = [
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
        cp.spawn(electronBinary(), [MAIN], { env: { ...process.env, HOME: REAL_HOME } as NodeJS.ProcessEnv }),
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
  ]

  const results: string[] = []
  for (const row of rows) {
    let message = ''
    try {
      const out = await row.run()
      // A returned handle means the app really booted. Close it before failing,
      // so one escaped launch does not leave a GUI process behind.
      await closeQuietly(out)
      message = 'NOT BLOCKED — this shape reached the real launcher'
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }
    expect(message, `[${row.name}] must be blocked by the isolation enforcer`).toContain(ISOLATION_TAG)
    expect(message, `[${row.name}] blocked for the wrong reason`).toMatch(row.expect)
    results.push(`  blocked: ${row.name}`)
  }
  console.log(`T-442 F-A bypass matrix — ${rows.length} shapes\n${results.join('\n')}`)

  fs.rmSync(outsideSandbox, { recursive: true, force: true })

  // L5 — whatever a shape did before being blocked, the real home did not move.
  expect(fingerprintRealHome(), 'a bypass attempt mutated the REAL home').toEqual(before)
})

test('T-442 F-A: the sanctioned harness call satisfies the same enforcer (no exemption)', async () => {
  // The enforcer has no allowlist, so this doubles as proof that the gate is
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

test('T-442 F-A: the CJS assumption the child_process guard depends on still holds', () => {
  // `child_process` is patched on the CJS module object. That reaches every
  // collected file only while Playwright transpiles this package to CJS. If the
  // package ever gains `"type": "module"`, collected files would get Node's
  // frozen `node:child_process` namespace and the guard would silently stop
  // covering them — a boundary worth failing on rather than documenting.
  const pkg = JSON.parse(fs.readFileSync(path.join(GUI_ROOT, 'package.json'), 'utf-8')) as { type?: string }
  expect(
    pkg.type ?? 'commonjs',
    'packages/gui switched to ESM — tests/isolation-enforcer.ts rule 3 (child_process) ' +
      'no longer reaches collected files. Re-verify before removing this assertion.',
  ).toBe('commonjs')
  expect(typeof require, 'specs are not running as CJS').toBe('function')
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

test('T-442 F1/F5: a launched app resolves BOTH home and userData into the sandbox', async () => {
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

function electronBinary(): string {
  return path.join(GUI_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
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

/**
 * A cheap, stable fingerprint of the real-home surfaces this ticket protects.
 * Names + sizes + mtimes, no contents: enough to see a rewrite, cheap enough to
 * run around every matrix row.
 */
function fingerprintRealHome(): string[] {
  const out: string[] = []
  const walk = (root: string, depth: number): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(root, e.name)
      try {
        const st = fs.lstatSync(full)
        out.push(`${full}\t${st.size}\t${st.mtimeMs}`)
        if (e.isDirectory() && depth > 0) walk(full, depth - 1)
      } catch {
        /* raced away; absence is itself recorded by the missing line */
      }
    }
  }
  for (const p of [...PROTECTED_REAL_PATHS, REAL_USER_DATA]) {
    out.push(`${p}\texists=${fs.existsSync(p)}`)
    walk(p, 2)
  }
  return out
}
