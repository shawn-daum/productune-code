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

function runPrdt(cli: string, args: string[]): string {
  return execFileSync('python3', [cli, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: subprocessTimeout('cli'),
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(PRDT_CLI, ['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(cli = PRDT_CLI): string {
  try {
    return runPrdt(cli, ['doctor'])
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

  return cli
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-bridge-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  tmpRoots = []
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
})
