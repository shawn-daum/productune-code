/**
 * toolchain.test.ts — unit tests for the app-provided JS toolchain (T-440).
 *
 * Everything runs against a throwaway fixture HOME + fixture npm payload —
 * the developer's real ~/.productune is NEVER touched, and no probe ever
 * spawns a real process (the probe leg is injected).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  toolchainBinDir,
  ensureNodeToolchain,
  getToolchainStatus,
  resolveNpmPayloadDir,
  hasNodeOnPath,
  isTransientExecPath,
  __resetToolchainStatusForTest,
} from './toolchain'
import { appPackageRoot } from './app-root'

let home: string
let npmDir: string

/** A fixture npm payload with the two CLI entry files the shims exec. */
function makeNpmPayload(root: string): string {
  const dir = path.join(root, 'npm-payload')
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin', 'npm-cli.js'), '// fixture npm-cli\n')
  fs.writeFileSync(path.join(dir, 'bin', 'npx-cli.js'), '// fixture npx-cli\n')
  return dir
}

const okProbe = (calls?: string[][]) => (cmd: string, args: string[]) => {
  calls?.push([cmd, ...args])
  return args.includes('--version') && cmd.endsWith('npm') ? '11.0.0\n' : 'v22.19.0\n'
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 't440-home-'))
  npmDir = makeNpmPayload(home)
  __resetToolchainStatusForTest()
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

describe('toolchainBinDir — the single writer/reader resolver', () => {
  it('is a pure function of homeDir under ~/.productune (no spaces, user-writable)', () => {
    expect(toolchainBinDir('/Users/x')).toBe('/Users/x/.productune/toolchain/bin')
  })
})

describe('ensureNodeToolchain', () => {
  it('writes executable node/npm/npx shims wired to the app binary via ELECTRON_RUN_AS_NODE', () => {
    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/Contents/MacOS/App', npmDir, probe: okProbe() })
    expect(res.ok).toBe(true)
    expect(res.performed).toBe(true)
    expect(res.nodeVersion).toBe('v22.19.0')
    expect(res.npmVersion).toBe('11.0.0')

    const bin = toolchainBinDir(home)
    for (const name of ['node', 'npm', 'npx']) {
      const p = path.join(bin, name)
      const st = fs.statSync(p)
      expect(st.mode & 0o111).toBeTruthy()
      const body = fs.readFileSync(p, 'utf-8')
      expect(body.startsWith('#!/bin/sh')).toBe(true)
      expect(body).toContain('ELECTRON_RUN_AS_NODE=1')
      expect(body).toContain('"/App/Contents/MacOS/App"')
    }
    expect(fs.readFileSync(path.join(bin, 'npm'), 'utf-8')).toContain(path.join(npmDir, 'bin', 'npm-cli.js'))
    expect(fs.readFileSync(path.join(bin, 'npx'), 'utf-8')).toContain(path.join(npmDir, 'bin', 'npx-cli.js'))
    // npm global prefix is redirected away from the app bundle
    expect(fs.readFileSync(path.join(bin, 'npm'), 'utf-8')).toContain('npm_config_prefix')
  })

  it('is idempotent: a second run with identical inputs re-probes nothing and rewrites nothing', () => {
    const calls: string[][] = []
    ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe(calls) })
    const probesAfterFirst = calls.length
    expect(probesAfterFirst).toBeGreaterThan(0)

    const res2 = ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe(calls) })
    expect(res2.ok).toBe(true)
    expect(res2.performed).toBe(false)
    expect(res2.nodeVersion).toBe('v22.19.0') // versions survive via the marker
    expect(calls.length).toBe(probesAfterFirst)
  })

  it('re-provisions when the app binary moved (execPath changed)', () => {
    ensureNodeToolchain({ homeDir: home, execPath: '/App/old', npmDir, probe: okProbe() })
    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/new', npmDir, probe: okProbe() })
    expect(res.performed).toBe(true)
    expect(fs.readFileSync(path.join(toolchainBinDir(home), 'node'), 'utf-8')).toContain('"/App/new"')
  })

  it('npm payload missing → node shim still provisioned, npm/npx removed, explicit state', () => {
    // First a full provision, then the payload disappears (broken packaging).
    ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() })
    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/b', npmDir: null, probe: okProbe() })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('npm-payload-missing')
    const bin = toolchainBinDir(home)
    expect(fs.existsSync(path.join(bin, 'node'))).toBe(true)
    expect(fs.existsSync(path.join(bin, 'npm'))).toBe(false)
    expect(fs.existsSync(path.join(bin, 'npx'))).toBe(false)
  })

  it('probe failure → all shims removed so a broken runtime is never left resolvable', () => {
    const res = ensureNodeToolchain({
      homeDir: home, execPath: '/App/a', npmDir,
      probe: () => { throw new Error('runAsNode disabled') },
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('probe-failed')
    const bin = toolchainBinDir(home)
    for (const name of ['node', 'npm', 'npx']) {
      expect(fs.existsSync(path.join(bin, name))).toBe(false)
    }
  })

  it('getToolchainStatus reflects the last ensure result', () => {
    expect(getToolchainStatus()).toBeNull()
    ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() })
    expect(getToolchainStatus()?.ok).toBe(true)
  })
})

// ── T-442: structural runaway guards ─────────────────────────────────────────
//
// 2026-07-30 incident: a fuse-disabled scratch app copy under /private/tmp was
// probed as node → ELECTRON_RUN_AS_NODE was INERT → a full GUI booted, whose
// startup re-entered ensureNodeToolchain against the REAL home, overwrote the
// real shims with the transient path, and re-spawned itself once per
// generation until the machine had to be hard-rebooted. These tests pin the
// toolchain-side stops: never provision from a transient path, and never
// full-provision more than STORM_MAX times per window regardless of cause.

describe('isTransientExecPath (T-442)', () => {
  it('flags tmpdirs, /private/tmp, /var/folders and /Volumes; keeps real installs', () => {
    expect(isTransientExecPath('/private/tmp/x/P.app/Contents/MacOS/P')).toBe(true)
    expect(isTransientExecPath('/tmp/P.app/Contents/MacOS/P')).toBe(true)
    expect(isTransientExecPath('/var/folders/ab/T/AppTranslocation/x/P.app/Contents/MacOS/P')).toBe(true)
    expect(isTransientExecPath('/private/var/folders/ab/x/P.app/Contents/MacOS/P')).toBe(true)
    expect(isTransientExecPath('/Volumes/Productune 0.5.0/P.app/Contents/MacOS/P')).toBe(true)
    expect(isTransientExecPath(path.join(os.tmpdir(), 'scratch/P.app/Contents/MacOS/P'))).toBe(true)
    expect(isTransientExecPath('/Applications/Productune.app/Contents/MacOS/Productune')).toBe(false)
    expect(isTransientExecPath('/Users/x/dev/repo/release/mac-arm64/P.app/Contents/MacOS/P')).toBe(false)
    // prefix must be a path-segment boundary, not a string prefix
    expect(isTransientExecPath('/tmpfiles/P.app/Contents/MacOS/P')).toBe(false)
  })
})

describe('ensureNodeToolchain — transient execPath refusal (T-442)', () => {
  it('refuses to provision from a transient path: no shims written, probe never called', () => {
    const calls: string[][] = []
    const res = ensureNodeToolchain({
      homeDir: home,
      execPath: '/private/tmp/scratch/P.app/Contents/MacOS/P',
      npmDir,
      probe: okProbe(calls),
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('exec-path-transient')
    expect(calls.length).toBe(0)
    const bin = toolchainBinDir(home)
    for (const name of ['node', 'npm', 'npx']) {
      expect(fs.existsSync(path.join(bin, name))).toBe(false)
    }
  })

  it('a transient attempt never clobbers healthy shims from a real install', () => {
    // Healthy provision whose exec target actually exists on disk.
    ensureNodeToolchain({ homeDir: home, execPath: '/bin/ls', npmDir, probe: okProbe() })
    const res = ensureNodeToolchain({
      homeDir: home,
      execPath: '/Volumes/Productune 0.5.0/P.app/Contents/MacOS/P',
      npmDir,
      probe: okProbe(),
    })
    expect(res.code).toBe('exec-path-transient')
    const nodeShimBody = fs.readFileSync(path.join(toolchainBinDir(home), 'node'), 'utf-8')
    expect(nodeShimBody).toContain('"/bin/ls"')
  })

  it('a transient attempt sweeps stale shims whose exec target no longer exists (incident state)', () => {
    // Reproduce the incident residue by hand: shims pointing at a vanished app.
    const bin = toolchainBinDir(home)
    fs.mkdirSync(bin, { recursive: true })
    const gone = path.join(home, 'gone-app')
    for (const name of ['node', 'npm', 'npx']) {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${gone}" "$@"\n`, { mode: 0o755 })
    }
    fs.writeFileSync(path.join(home, '.productune', 'toolchain', 'provisioned.json'), '{}')

    const res = ensureNodeToolchain({
      homeDir: home,
      execPath: '/private/tmp/another/P.app/Contents/MacOS/P',
      npmDir,
      probe: okProbe(),
    })
    expect(res.code).toBe('exec-path-transient')
    for (const name of ['node', 'npm', 'npx']) {
      expect(fs.existsSync(path.join(bin, name))).toBe(false)
    }
    expect(fs.existsSync(path.join(home, '.productune', 'toolchain', 'provisioned.json'))).toBe(false)
  })
})

describe('ensureNodeToolchain — provision storm guard (T-442)', () => {
  const attemptsPath = () => path.join(home, '.productune', 'toolchain', 'attempts.json')

  it('records each full provision attempt; fast-path hits record nothing', () => {
    ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() })
    const first = JSON.parse(fs.readFileSync(attemptsPath(), 'utf-8'))
    expect(first.attempts).toHaveLength(1)

    ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() }) // fast path
    const second = JSON.parse(fs.readFileSync(attemptsPath(), 'utf-8'))
    expect(second.attempts).toHaveLength(1)
  })

  it('refuses the 4th full provision inside the window: no probe spawn, no shim write', () => {
    const now = Date.now()
    fs.mkdirSync(path.dirname(attemptsPath()), { recursive: true })
    fs.writeFileSync(attemptsPath(), JSON.stringify({ attempts: [now - 3000, now - 2000, now - 1000] }))

    const calls: string[][] = []
    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe(calls) })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('provision-storm')
    expect(calls.length).toBe(0)
    expect(fs.existsSync(path.join(toolchainBinDir(home), 'node'))).toBe(false)
  })

  it('expired attempts fall out of the window and provisioning proceeds again', () => {
    const old = Date.now() - 10 * 60_000
    fs.mkdirSync(path.dirname(attemptsPath()), { recursive: true })
    fs.writeFileSync(attemptsPath(), JSON.stringify({ attempts: [old, old + 1, old + 2] }))

    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() })
    expect(res.ok).toBe(true)
    expect(res.performed).toBe(true)
    const rec = JSON.parse(fs.readFileSync(attemptsPath(), 'utf-8'))
    expect(rec.attempts).toHaveLength(1) // pruned + current
  })

  it('a corrupt attempts file never blocks provisioning', () => {
    fs.mkdirSync(path.dirname(attemptsPath()), { recursive: true })
    fs.writeFileSync(attemptsPath(), 'not json')
    const res = ensureNodeToolchain({ homeDir: home, execPath: '/App/a', npmDir, probe: okProbe() })
    expect(res.ok).toBe(true)
  })
})

describe('resolveNpmPayloadDir', () => {
  it('packaged app → <Resources>/toolchain/npm; dev → gui node_modules/npm', () => {
    expect(resolveNpmPayloadDir({ isPackaged: true, getAppPath: () => '/x' }, '/Applications/P.app/Contents/Resources'))
      .toBe('/Applications/P.app/Contents/Resources/toolchain/npm')
    expect(resolveNpmPayloadDir({ isPackaged: false, getAppPath: () => '/repo/packages/gui' }, '/ignored'))
      .toBe('/repo/packages/gui/node_modules/npm')
  })

  // ── T-442 F2 ──────────────────────────────────────────────────────────────
  // `app.getAppPath()` is the directory of the main script Electron was handed,
  // NOT the package root. `electron dist-electron/main.js` — how every
  // Playwright spec boots the app — makes it `<gui>/dist-electron`, so the old
  // one-line join pointed at `<gui>/dist-electron/node_modules/npm`, which does
  // not exist. Result: every spec launch fell into `npm-payload-missing` and
  // deleted the user's npm/npx shims + marker. Silent, and once per launch.
  describe('T-442 F2: dev resolution survives the Playwright boot shape', () => {
    /** A gui package as Electron sees it in dev: package.json at the root, the
     *  built main script one level down in dist-electron/. */
    function makeGuiTree(root: string): string {
      const gui = path.join(root, 'packages', 'gui')
      fs.mkdirSync(path.join(gui, 'dist-electron'), { recursive: true })
      fs.writeFileSync(path.join(gui, 'package.json'), '{"name":"@productune/gui"}')
      return gui
    }

    it('resolves the same payload from BOTH boot shapes', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 't442-f2-'))
      const gui = makeGuiTree(root)
      const expected = path.join(gui, 'node_modules', 'npm')

      // `electron dist-electron/main.js` — the shape every spec produces, and
      // the one that used to resolve one directory too deep.
      expect(
        resolveNpmPayloadDir({ isPackaged: false, getAppPath: () => path.join(gui, 'dist-electron') }, '/ignored'),
      ).toBe(expected)

      // `electron .` — must keep working unchanged.
      expect(resolveNpmPayloadDir({ isPackaged: false, getAppPath: () => gui }, '/ignored')).toBe(expected)

      fs.rmSync(root, { recursive: true, force: true })
    })

    it('appPackageRoot walks to the nearest package.json and is a no-op at the root itself', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 't442-f2-root-'))
      const gui = makeGuiTree(root)

      expect(appPackageRoot(path.join(gui, 'dist-electron'))).toBe(gui)
      expect(appPackageRoot(gui)).toBe(gui)

      // No package.json anywhere above → return the input, so the caller's
      // error message still names a concrete, checkable location.
      const orphan = path.join(root, 'no-pkg', 'deep')
      fs.mkdirSync(orphan, { recursive: true })
      expect(resolveNpmPayloadDir({ isPackaged: false, getAppPath: () => orphan }, '/ignored'))
        .toBe(path.join(orphan, 'node_modules', 'npm'))

      fs.rmSync(root, { recursive: true, force: true })
    })
  })
})

// ── T-442 F2: the `npm-payload-missing` branch must not churn the user's home ─
describe('npm-payload-missing is idempotent', () => {
  it('leaves the node shim byte- and mtime-identical on a repeat call', async () => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), 't442-idem-'))
    const opts = { homeDir: h, execPath: '/Applications/P.app/Contents/MacOS/P', npmDir: null }

    const first = ensureNodeToolchain(opts)
    expect(first.code).toBe('npm-payload-missing')
    const shim = path.join(toolchainBinDir(h), 'node')
    const before = fs.statSync(shim)

    // A whole second, so a rewrite would be visible in mtime at 1s resolution.
    await new Promise((r) => setTimeout(r, 1100))

    const second = ensureNodeToolchain(opts)
    expect(second.code).toBe('npm-payload-missing')
    const after = fs.statSync(shim)

    expect(fs.readFileSync(shim, 'utf-8')).toBe(nodeShimBody('/Applications/P.app/Contents/MacOS/P'))
    expect(after.mtimeMs, 'the shim was rewritten despite nothing changing').toBe(before.mtimeMs)
    expect(after.mode & 0o777).toBe(0o755)

    fs.rmSync(h, { recursive: true, force: true })
  })
})

/** The exact body ensureNodeToolchain writes for `node` (kept local to the test
 *  so a drift in the shim body fails here rather than passing vacuously). */
function nodeShimBody(execPath: string): string {
  return [
    '#!/bin/sh',
    '# generated by Productune (T-440) — Node.js runtime shipped inside the app.',
    'export ELECTRON_RUN_AS_NODE=1',
    `exec "${execPath}" "$@"`,
    '',
  ].join('\n')
}

describe('hasNodeOnPath', () => {
  it('finds an executable node in a PATH dir, and reports absence honestly', () => {
    const d = path.join(home, 'somebin')
    fs.mkdirSync(d, { recursive: true })
    expect(hasNodeOnPath(`${d}:/nonexistent`)).toBe(false)
    fs.writeFileSync(path.join(d, 'node'), '#!/bin/sh\n', { mode: 0o755 })
    expect(hasNodeOnPath(`${d}:/nonexistent`)).toBe(true)
  })
})
