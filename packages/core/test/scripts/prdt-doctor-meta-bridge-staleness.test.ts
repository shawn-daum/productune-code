/**
 * prdt-doctor-meta-bridge-staleness.test.ts — T-731.
 *
 * Root cause (T-731, following T-686): `dist/bin/meta-cli.cjs` is a BUILD
 * ARTIFACT of `packages/core/src` (tsc + esbuild), `dist/` is gitignored, and
 * nothing in the install/update path used to rebuild it — a fix committed to
 * core/src bound nothing until someone ran `npm run build` by hand. OBSERVED:
 * T-686's lock fix (d9404460) was committed and "installed" on 2026-09-26, yet
 * the bug it fixed recurred the next day because the bridge running was still
 * a 2026-09-22 build.
 *
 * Black-box over the REAL `prdt` CLI, same throwaway-copy technique
 * `cliWithTsAllowlist` in prdt-doctor-meta-drift.test.ts uses: a copy of the
 * script at `<tmp>/scripts/prdt` so `_repo_root_candidates()`'s self-reference
 * (`Path(__file__).resolve().parent.parent`) resolves to `<tmp>` — the same
 * relative shape `packages/core` has to `scripts/prdt` in the real repo. This
 * never touches the real repo's own dist/.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string
let tmpRoots: string[] = []
// T-734 (review finding 1): `meta_bridge_staleness_warnings` now prefers
// PRDT_REPO over self-reference (see `_repo_root_candidates(prefer_prdt_repo=
// True)`), so every call in this file must run against an isolated PRDT_HOME
// carrying no `prdt.env` — otherwise, on any machine that already ran
// install.sh (this dev box included), the REAL PRDT_REPO from the real
// `~/.prdt/prdt.env` would now outrank every fixture's self-reference and
// every test below would silently judge the real repo checkout instead of
// its own tmp fixture. A test that specifically exercises PRDT_REPO passes
// its own `{ PRDT_HOME }` override (see `prdtHomeWithRepo`), which wins over
// this default the same way any explicit `env` key wins in the merge below.
let isolatedHome: string

function runPrdt(cli: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('python3', [cli, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
    env: { ...process.env, PRDT_HOME: isolatedHome, ...env },
  })
}

function runInit(env: Record<string, string> = {}): any {
  return JSON.parse(runPrdt(PRDT_CLI, ['init', '--json', '--slug', 'proj', '--yes'], env))
}

function doctor(cli = PRDT_CLI, env: Record<string, string> = {}): string {
  try {
    return runPrdt(cli, ['doctor'], env)
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

/** A throwaway copy of the CLI at `<tmp>/scripts/prdt`, so its self-reference
 *  repo root is `<tmp>` — matching the real `packages/core` shape. `srcFiles`
 *  writes each entry under `<tmp>/src/...` with `mtimeOffsetSec` seconds
 *  relative to "now" (negative = older); `bridge` (when given) writes
 *  `<tmp>/dist/bin/meta-cli.cjs` at its own offset. */
function cliWithBridgeFixture(opts: {
  srcFiles: Record<string, number>
  bridgeOffsetSec?: number | null
  packageJsonOffsetSec?: number | null
  tsconfigOffsetSec?: number | null
}): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cli-bridge-'))
  tmpRoots.push(tmp)
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
  const cli = path.join(tmp, 'scripts', 'prdt')
  fs.copyFileSync(PRDT_CLI, cli)
  fs.chmodSync(cli, 0o755)

  const now = Date.now() / 1000
  const setMtime = (p: string, offsetSec: number) => {
    const t = now + offsetSec
    fs.utimesSync(p, t, t)
  }

  for (const [rel, offsetSec] of Object.entries(opts.srcFiles)) {
    const p = path.join(tmp, 'src', rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '// fixture\n')
    setMtime(p, offsetSec)
  }

  if (opts.bridgeOffsetSec != null) {
    const bridge = path.join(tmp, 'dist', 'bin', 'meta-cli.cjs')
    fs.mkdirSync(path.dirname(bridge), { recursive: true })
    fs.writeFileSync(bridge, '// fixture bridge\n')
    setMtime(bridge, opts.bridgeOffsetSec)
  }

  // T-734 (review finding 3, doctor half): package.json / tsconfig.json sit
  // at the repo root (a sibling of src/), not under src/ — the build's own
  // inputs, checked by direct mtime compare alongside the src/ subtree walk.
  if (opts.packageJsonOffsetSec != null) {
    const p = path.join(tmp, 'package.json')
    fs.writeFileSync(p, '{}\n')
    setMtime(p, opts.packageJsonOffsetSec)
  }
  if (opts.tsconfigOffsetSec != null) {
    const p = path.join(tmp, 'tsconfig.json')
    fs.writeFileSync(p, '{}\n')
    setMtime(p, opts.tsconfigOffsetSec)
  }

  return cli
}

/** A standalone repo-root fixture (not wired up as the running CLI's own
 *  self-reference) — `<tmp>/scripts/prdt` (so `_repo_root_candidates()`
 *  accepts it as a candidate at all), `<tmp>/src/...` per `srcFiles`, and
 *  `<tmp>/dist/bin/meta-cli.cjs` when `bridgeOffsetSec` is given. Returns the
 *  repo ROOT (not a cli path) — used as either the self-reference or the
 *  PRDT_REPO side of the two-different-checkouts tests below. */
function repoRootFixture(opts: {
  srcFiles: Record<string, number>
  bridgeOffsetSec?: number | null
}): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-repo-root-'))
  tmpRoots.push(tmp)
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
  fs.copyFileSync(PRDT_CLI, path.join(tmp, 'scripts', 'prdt'))
  fs.chmodSync(path.join(tmp, 'scripts', 'prdt'), 0o755)

  const now = Date.now() / 1000
  const setMtime = (p: string, offsetSec: number) => {
    const t = now + offsetSec
    fs.utimesSync(p, t, t)
  }

  for (const [rel, offsetSec] of Object.entries(opts.srcFiles)) {
    const p = path.join(tmp, 'src', rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '// fixture\n')
    setMtime(p, offsetSec)
  }

  if (opts.bridgeOffsetSec != null) {
    const bridge = path.join(tmp, 'dist', 'bin', 'meta-cli.cjs')
    fs.mkdirSync(path.dirname(bridge), { recursive: true })
    fs.writeFileSync(bridge, '// fixture bridge\n')
    setMtime(bridge, opts.bridgeOffsetSec)
  }

  return tmp
}

/** `<home>/prdt.env` naming `repoRoot` as PRDT_REPO — the fixture home a
 *  `doctor(cli, { PRDT_HOME: home })` call reads it back out of via
 *  `prdt_repo_from_env()`. */
function prdtHomeWithRepo(repoRoot: string): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-home-'))
  tmpRoots.push(home)
  fs.writeFileSync(path.join(home, 'prdt.env'), `PRDT_REPO=${repoRoot}\n`)
  return home
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bridge-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  tmpRoots = []
  isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bridge-home-'))
  tmpRoots.push(isolatedHome)
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
  for (const t of tmpRoots) fs.rmSync(t, { recursive: true, force: true })
  tmpRoots = []
})

describe.skipIf(!PYTHON3)('prdt doctor — meta-cli bridge staleness (T-731)', () => {
  test('installed mirror (no src/bin/meta-cli.ts anywhere nearby) skips the check silently', () => {
    runInit()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-cli-noSrc-'))
    tmpRoots.push(tmp)
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
    const cli = path.join(tmp, 'scripts', 'prdt')
    fs.copyFileSync(PRDT_CLI, cli)
    fs.chmodSync(cli, 0o755)
    const out = doctor(cli)
    expect(out).not.toMatch(/^⚠.*meta-cli bridge/m)
    expect(out).toMatch(/could not look · meta-cli bridge staleness: no source tree nearby/)
  })

  test('bridge missing entirely → warns MISSING, names the bridge path', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: { 'bin/meta-cli.ts': -3600 },
      bridgeOffsetSec: null,
    })
    const out = doctor(cli)
    expect(out).toMatch(/meta-cli bridge MISSING/)
    expect(out).toMatch(/dist[\/\\]bin[\/\\]meta-cli\.cjs/)
    expect(out).toMatch(/npm run build/)
  })

  test('src changed after the last build → doctor warns, names the bridge path', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      // bridge built first (older), then a source file touched after it
      srcFiles: { 'bin/meta-cli.ts': -60, 'git-workflow/meta-backup.ts': -10 },
      bridgeOffsetSec: -3600,
    })
    const out = doctor(cli)
    expect(out).toMatch(/meta-cli bridge STALE/)
    expect(out).toMatch(/dist[\/\\]bin[\/\\]meta-cli\.cjs/)
    expect(out).toMatch(/meta-backup\.ts/)
    expect(out).toMatch(/npm run build/)
  })

  test('bridge newer than every src file → silent (no warning)', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: { 'bin/meta-cli.ts': -3600, 'git-workflow/meta-backup.ts': -3600 },
      bridgeOffsetSec: -10,
    })
    const out = doctor(cli)
    expect(out).not.toMatch(/^⚠.*meta-cli bridge/m)
  })

  // Reproduces the T-731 acceptance line literally: stale first, then "install"
  // (here: rebuild the fixture bridge, standing in for install.sh's own build
  // step, which is covered separately at the install.sh level) clears it.
  test('after the bridge is rebuilt newer than src, the warning clears', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: { 'bin/meta-cli.ts': -60 },
      bridgeOffsetSec: -3600,
    })
    expect(doctor(cli)).toMatch(/meta-cli bridge STALE/)

    const bridge = path.join(path.dirname(path.dirname(cli)), 'dist', 'bin', 'meta-cli.cjs')
    const now = Date.now() / 1000
    fs.utimesSync(bridge, now, now)

    const after = doctor(cli)
    expect(after).not.toMatch(/^⚠.*meta-cli bridge/m)
  })

  // T-734 review finding 3 (doctor half): package.json (esbuild flags) /
  // tsconfig.json rebind the build's OWN inputs without ever touching a file
  // under src/ — before this fix a commit touching only one of them left this
  // check silent forever, even though it rebinds what the build produces.
  test('package.json changed after the last build (src/ untouched) → doctor warns STALE, names it', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: { 'bin/meta-cli.ts': -3600 },
      bridgeOffsetSec: -60,
      packageJsonOffsetSec: -5,
    })
    const out = doctor(cli)
    expect(out).toMatch(/meta-cli bridge STALE/)
    expect(out).toContain('package.json')
  })

  test('tsconfig.json changed after the last build (src/ untouched) → doctor warns STALE, names it', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: { 'bin/meta-cli.ts': -3600 },
      bridgeOffsetSec: -60,
      tsconfigOffsetSec: -5,
    })
    const out = doctor(cli)
    expect(out).toMatch(/meta-cli bridge STALE/)
    expect(out).toContain('tsconfig.json')
  })

  // T-734 review finding 3 (doctor half): the filesystem's / an editor's own
  // bookkeeping under src/ is not a build input. Before this fix, `_tree_files`
  // et al. already filtered this class out of the discipline/hooks drift
  // trees, but `meta_bridge_staleness_warnings` walked `src_dir.rglob("*")`
  // unfiltered — a Finder-dropped `.DS_Store` or a leftover `habit.md.swp`
  // touched after the bridge was built read as "newest source changed" and
  // warned STALE for a file that was never a build input.
  test('non-source files under src/ (.DS_Store, editor swap files) do not make doctor warn', () => {
    runInit()
    const cli = cliWithBridgeFixture({
      srcFiles: {
        'bin/meta-cli.ts': -3600,        // the only real source file — OLDER than the bridge
        '.DS_Store': -5,                 // junk, NEWER than the bridge
        'bin/meta-cli.ts.swp': -5,       // junk (editor swap file), NEWER than the bridge
      },
      bridgeOffsetSec: -1800,            // built after meta-cli.ts, before the junk files
    })
    const out = doctor(cli)
    expect(out).not.toMatch(/^⚠.*meta-cli bridge/m)
  })

  // T-734 review finding 1: the bridge running is resolved from PRDT_REPO
  // ALONE by every consumer (the `prdt` CLI's own meta commands,
  // prdt-session-start.sh, prdt-post-dispatch.sh) — never from self-reference.
  // Before this fix, doctor judged self-reference first, so a dev checkout
  // that differs from the installed PRDT_REPO checkout got a verdict about a
  // bridge nothing ever executes, while the bridge every consumer actually
  // invokes went unjudged.
  describe('PRDT_REPO and self-reference pointing at different checkouts (T-734 review finding 1)', () => {
    test('self-reference is stale/missing, PRDT_REPO is clean → doctor stays silent (judges PRDT_REPO)', () => {
      const selfRoot = repoRootFixture({
        srcFiles: { 'bin/meta-cli.ts': -3600 },
        bridgeOffsetSec: null, // MISSING — would warn loudly if wrongly consulted
      })
      const envRoot = repoRootFixture({
        srcFiles: { 'bin/meta-cli.ts': -3600 },
        bridgeOffsetSec: -10, // clean: bridge newer than src
      })
      const cli = path.join(selfRoot, 'scripts', 'prdt')
      const home = prdtHomeWithRepo(envRoot)
      runInit({ PRDT_HOME: home })
      const out = doctor(cli, { PRDT_HOME: home })
      expect(out).not.toMatch(/^⚠.*meta-cli bridge/m)
      expect(out).not.toContain('meta-cli bridge MISSING')
    })

    test('PRDT_REPO is stale, self-reference is clean → doctor warns about the PRDT_REPO bridge', () => {
      const selfRoot = repoRootFixture({
        srcFiles: { 'bin/meta-cli.ts': -3600 },
        bridgeOffsetSec: -10, // clean — must NOT be what doctor reports as healthy
      })
      const envRoot = repoRootFixture({
        // bridge built first (older), then a source file touched after it
        srcFiles: { 'bin/meta-cli.ts': -60, 'git-workflow/meta-backup.ts': -10 },
        bridgeOffsetSec: -3600,
      })
      const cli = path.join(selfRoot, 'scripts', 'prdt')
      const home = prdtHomeWithRepo(envRoot)
      runInit({ PRDT_HOME: home })
      const out = doctor(cli, { PRDT_HOME: home })
      expect(out).toMatch(/meta-cli bridge STALE/)
      // Names the PRDT_REPO checkout's own bridge/source, not self-reference's.
      expect(out).toContain(path.join(envRoot, 'dist', 'bin', 'meta-cli.cjs'))
      expect(out).toMatch(/meta-backup\.ts/)
      expect(out).not.toContain(path.join(selfRoot, 'dist', 'bin', 'meta-cli.cjs'))
    })
  })
})
