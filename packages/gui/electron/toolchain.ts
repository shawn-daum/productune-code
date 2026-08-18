/**
 * toolchain.ts — the app-provided JS toolchain for the PARTICIPANT'S product (T-440).
 *
 * A participant's Mac has no node/npm, so the product they build (a web app,
 * per the north-star scenario) can neither build nor run — surface commands
 * exit 127 and the onboarding Playwright-MCP prewarm dies silently on `npx`.
 * prdt itself needs no node; this is about the participant's own product.
 *
 * shawn's decision (2026-07-30, T-440): the app PROVIDES the toolchain, with
 * no extra download and no administrator authentication — so we expose the
 * runtime the app ALREADY SHIPS instead of running any installer:
 *
 *   node → the Electron binary itself. `ELECTRON_RUN_AS_NODE=1 <app-binary>`
 *          IS a full Node.js (process.versions.node, currently 22.x for
 *          Electron 36). No download, no admin, works from the .dmg alone.
 *   npm/npx → npm is pure JS. The `npm` package is bundled with the app
 *          (dev: packages/gui/node_modules/npm; packaged: Resources/toolchain/npm
 *          via electron-builder extraResources) and executed under that same
 *          Electron-as-Node runtime.
 *
 * Three /bin/sh shims (`node`, `npm`, `npx`) are written to
 * `~/.productune/toolchain/bin` — a user-writable dir that is NEVER put on the
 * user's own shell PATH. Only app-spawned children see it, and always LAST:
 *
 *   ★ RESOLUTION ORDER (non-interference contract, both PATH builders in
 *     surface-runner.ts): project node_modules/.bin → login-shell PATH →
 *     process PATH → (~/.local/bin) → THIS DIR. A machine that already has its
 *     own node/nvm/Homebrew toolchain keeps using it — the app toolchain can
 *     never shadow anything; a machine with none falls through to ours.
 *
 *   ★ ONE RESOLVER: `toolchainBinDir()` is the only definition of that
 *     location. The writer (ensureNodeToolchain) and every reader
 *     (surface-runner's pathWithLocalBins / withLoginShellPath) import it —
 *     the write side and the read side cannot drift (T-439 lesson).
 *
 * Version/provenance: participants get Electron's embedded Node (report via
 * `nodeVersion`) + the bundled npm. A project that needs a DIFFERENT version
 * keeps working the moment the user installs one — theirs is earlier on PATH
 * by construction. npm `engines` mismatches warn (EBADENGINE) but proceed.
 *
 * Known bound (accepted, YAGNI): native addons. N-API prebuilds (the modern
 * default: swc, esbuild, sharp) work under Electron-as-Node; legacy NAN
 * addons and node-gyp SOURCE builds do not — the latter need Xcode CLT, which
 * a zero-admin participant machine cannot get anyway.
 *
 * NO electron import here (same posture as prdt-bootstrap.ts): paths are
 * injected by resolveNpmPayloadDir/main.ts, so tests and the live-proof
 * driver exercise the REAL module under a plain Node process.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { appPackageRoot } from './app-root'

// ── The single location resolver (writer AND readers import this) ─────────────

/** `~/.productune/toolchain/bin` — app-owned, user-writable, space-free. */
export function toolchainBinDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.productune', 'toolchain', 'bin')
}

/** Marker recording what the current shims were provisioned FOR (skip re-probe). */
function markerPath(homeDir: string): string {
  return path.join(homeDir, '.productune', 'toolchain', 'provisioned.json')
}

/** T-442: rolling log of full-provision attempts (the storm guard's state). */
function attemptsPath(homeDir: string): string {
  return path.join(homeDir, '.productune', 'toolchain', 'attempts.json')
}

// ── T-442: transient-path detection ──────────────────────────────────────────
//
// 2026-07-30 incident: shims in the REAL home ended up exec'ing an app copy
// under /private/tmp that no longer existed. A shim must never point at a
// path that can vanish or unmount: scratch/tmp dirs, macOS App Translocation
// (/private/var/folders/**/AppTranslocation), or a mounted .dmg (/Volumes) a
// participant runs the app from without copying it out. Provisioning from such
// a path is refused outright — the app still works for this session (node
// resolution falls through to any real toolchain), and the next launch from a
// real install location provisions normally.

const TRANSIENT_ROOTS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', '/Volumes']

/** Is `execPath` under a location that can vanish or unmount (never allowed as
 *  a shim exec target)? Segment-boundary prefix match, plus the platform tmpdir. */
export function isTransientExecPath(execPath: string, tmpDir: string = os.tmpdir()): boolean {
  const within = (root: string): boolean => {
    if (!root) return false
    const r = root.endsWith(path.sep) ? root.slice(0, -1) : root
    return execPath === r || execPath.startsWith(r + path.sep)
  }
  return [...TRANSIENT_ROOTS, tmpDir].some(within)
}

/** Parse a shim body's `exec "<target>" …` line. Null when unparsable. */
function shimExecTarget(shimFile: string): string | null {
  try {
    const m = fs.readFileSync(shimFile, 'utf-8').match(/^exec "([^"]+)"/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** T-442: remove shims whose exec target no longer exists (incident residue —
 *  e.g. a scratch app copy that was deleted), plus the marker. Healthy shims
 *  (target still on disk) are left untouched. */
function sweepStaleShims(binDir: string, homeDir: string): void {
  let sweptAny = false
  for (const name of ['node', 'npm', 'npx']) {
    const p = path.join(binDir, name)
    if (!fs.existsSync(p)) continue
    const target = shimExecTarget(p)
    if (!target || !fs.existsSync(target)) {
      rmQuiet(p)
      sweptAny = true
    }
  }
  if (sweptAny) rmQuiet(markerPath(homeDir))
}

// ── T-442: provision storm guard ─────────────────────────────────────────────
//
// Root-cause-agnostic backstop: NO loop shape may full-provision (= write
// shims + spawn version probes) more than STORM_MAX_ATTEMPTS times per
// STORM_WINDOW_MS against one home, no matter what is driving it — a misfired
// GUI re-entering startup, a future retry bug, anything. The guard state lives
// in the same home the provisioning targets, so it binds exactly the resource
// the runaway fights over, and it needs no environment variable to survive
// (the incident's env marker was inert). Fast-path hits never count.

const STORM_WINDOW_MS = 120_000
const STORM_MAX_ATTEMPTS = 3

function readRecentAttempts(homeDir: string, now: number): number[] {
  try {
    const rec = JSON.parse(fs.readFileSync(attemptsPath(homeDir), 'utf-8'))
    const arr: unknown = rec?.attempts
    if (!Array.isArray(arr)) return []
    return arr.filter((t): t is number => typeof t === 'number' && t <= now && now - t < STORM_WINDOW_MS)
  } catch {
    return [] // missing / corrupt state must never block provisioning
  }
}

function recordAttempt(homeDir: string, attempts: number[]): void {
  try {
    fs.mkdirSync(path.dirname(attemptsPath(homeDir)), { recursive: true })
    fs.writeFileSync(attemptsPath(homeDir), JSON.stringify({ attempts }) + '\n')
  } catch { /* best-effort — the guard is advisory state, not a lock */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolchainStatus {
  ok: boolean
  /** true when shims were (re)written + probed in this call. */
  performed: boolean
  binDir: string
  /** Electron's embedded Node version, e.g. "v22.19.0" (provenance surface). */
  nodeVersion?: string
  npmVersion?: string
  code?: 'npm-payload-missing' | 'probe-failed' | 'shim-write-failed' | 'exec-path-transient' | 'provision-storm'
  error?: string
}

export interface EnsureToolchainOpts {
  homeDir?: string
  /** The app binary that doubles as node under ELECTRON_RUN_AS_NODE. */
  execPath?: string
  /** Dir containing bin/npm-cli.js + bin/npx-cli.js, or null when unresolvable. */
  npmDir?: string | null
  /** Injectable version probe (tests / driver). Returns stdout; throws on failure. */
  probe?: (cmd: string, args: string[]) => string
}

// ── Payload resolution (main.ts passes electron's app; injectable for tests) ──

/** Where the bundled npm package lives: packaged → <Resources>/toolchain/npm
 *  (electron-builder extraResources, unpacked — npm-cli.js must run from a real
 *  fs path); dev → the gui package's own node_modules/npm.
 *
 *  T-442 F2: the dev branch used to be a bare `getAppPath()/node_modules/npm`,
 *  which assumed `app.getAppPath()` is the package root. It is not — see
 *  app-root.ts. Under the Playwright boot shape it resolved to
 *  `<gui>/dist-electron/node_modules/npm`, so every launch took the
 *  `npm-payload-missing` path and deleted the user's npm/npx shims plus the
 *  marker: a real degradation of the user's toolchain caused purely by the boot
 *  shape, and silent because nothing about it is a hard failure. */
export function resolveNpmPayloadDir(
  app: { isPackaged: boolean; getAppPath: () => string },
  resourcesPath: string = process.resourcesPath ?? '',
): string {
  return app.isPackaged
    ? path.join(resourcesPath, 'toolchain', 'npm')
    : path.join(appPackageRoot(app.getAppPath()), 'node_modules', 'npm')
}

// ── Shim bodies ───────────────────────────────────────────────────────────────

/** ELECTRON_RUN_AS_NODE is exported (not inline) so npm's own child spawns of
 *  process.execPath inherit it and never boot the GUI. */
function nodeShim(execPath: string): string {
  return [
    '#!/bin/sh',
    '# generated by Productune (T-440) — Node.js runtime shipped inside the app.',
    'export ELECTRON_RUN_AS_NODE=1',
    `exec "${execPath}" "$@"`,
    '',
  ].join('\n')
}

/** npm/npx: same runtime, exec'ing the bundled npm package's CLI entry.
 *  npm_config_prefix defaults global installs AWAY from the app bundle (npm
 *  derives its default prefix from process.execPath, which would be the app). */
function npmShim(execPath: string, cliJs: string): string {
  return [
    '#!/bin/sh',
    '# generated by Productune (T-440) — npm shipped inside the app.',
    'export ELECTRON_RUN_AS_NODE=1',
    'export npm_config_prefix="${npm_config_prefix:-$HOME/.productune/toolchain/npm-global}"',
    `exec "${execPath}" "${cliJs}" "$@"`,
    '',
  ].join('\n')
}

// ── Module state (surface.ts reads this for the failure hint) ─────────────────

let lastStatus: ToolchainStatus | null = null

export function getToolchainStatus(): ToolchainStatus | null {
  return lastStatus
}

export function __resetToolchainStatusForTest(): void {
  lastStatus = null
}

// ── Probe default ─────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 30_000

function defaultProbe(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    // T-442: a probe child that hangs is, in the failure mode that mattered
    // (runAsNode inert → the "node" is a booting GUI app), a live process bomb
    // — SIGKILL it, don't ask nicely. Its Chromium helpers die with it.
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'ignore'],
    // The shim resolves everything by absolute path; a minimal PATH keeps the
    // probe honest about not depending on the ambient environment.
    env: { ...process.env, PATH: '/usr/bin:/bin' },
  })
}

// ── Provision ─────────────────────────────────────────────────────────────────

function rmQuiet(p: string): void {
  try { fs.rmSync(p, { force: true }) } catch { /* best-effort */ }
}

/** Write only when the on-disk body differs, so a steady state leaves the
 *  user's home byte- AND mtime-identical (T-442 F2). Mode is re-applied either
 *  way: writeFileSync's `mode` is ignored when the file already exists. */
function writeIfChanged(p: string, body: string): void {
  let current: string | null = null
  try { current = fs.readFileSync(p, 'utf-8') } catch { /* absent → write */ }
  if (current !== body) fs.writeFileSync(p, body, { mode: 0o755 })
  fs.chmodSync(p, 0o755)
}

/**
 * Idempotent provision: write the three shims and probe them once; a repeat
 * call with identical inputs (same app binary, same payload) is a no-op that
 * returns the marker's cached versions. On probe failure ALL shims are removed
 * — a broken runtime must never be left resolvable on the child PATH.
 */
export function ensureNodeToolchain(opts: EnsureToolchainOpts = {}): ToolchainStatus {
  const homeDir = opts.homeDir ?? os.homedir()
  const execPath = opts.execPath ?? process.execPath
  const npmDir = opts.npmDir ?? null
  const probe = opts.probe ?? defaultProbe
  const binDir = toolchainBinDir(homeDir)

  const finish = (s: ToolchainStatus): ToolchainStatus => { lastStatus = s; return s }

  // T-442: a shim must never point at a path that can vanish or unmount
  // (scratch/tmp copies, App Translocation, a mounted .dmg). Refuse BEFORE the
  // fast path so a pre-existing transient provision can never be blessed as ok,
  // and sweep any incident residue (shims whose target is already gone).
  if (isTransientExecPath(execPath)) {
    sweepStaleShims(binDir, homeDir)
    return finish({
      ok: false, performed: false, binDir, code: 'exec-path-transient',
      error: `app binary is at a transient location (${execPath}); shims not provisioned — run the app from a real install location`,
    })
  }

  const npmCli = npmDir ? path.join(npmDir, 'bin', 'npm-cli.js') : null
  const npxCli = npmDir ? path.join(npmDir, 'bin', 'npx-cli.js') : null
  const npmValid = !!(npmCli && npxCli && fs.existsSync(npmCli) && fs.existsSync(npxCli))

  try {
    fs.mkdirSync(binDir, { recursive: true })
  } catch (e: any) {
    return finish({ ok: false, performed: false, binDir, code: 'shim-write-failed', error: e?.message ?? String(e) })
  }

  if (!npmValid) {
    // Half a toolchain must not look whole: keep node (harmless, still a real
    // runtime), drop npm/npx so a stale pair from a previous app never lingers.
    //
    // T-442 F2: write the node shim ONLY when its content would change. This
    // branch runs ahead of both the fast path and the storm guard, so an
    // unconditional write meant every single launch rewrote a file in the
    // user's home even in a steady state — the `bin/node` re-write timestamps
    // that made the incident forensics so hard to read. rmQuiet is already a
    // no-op on an absent path, so the whole branch is now idempotent.
    try {
      writeIfChanged(path.join(binDir, 'node'), nodeShim(execPath))
    } catch { /* keep going — the state below is the signal */ }
    rmQuiet(path.join(binDir, 'npm'))
    rmQuiet(path.join(binDir, 'npx'))
    rmQuiet(markerPath(homeDir))
    return finish({
      ok: false, performed: false, binDir, code: 'npm-payload-missing',
      error: `bundled npm payload not found${npmDir ? ` at ${npmDir}` : ''}`,
    })
  }

  const desired: Record<string, string> = {
    node: nodeShim(execPath),
    npm: npmShim(execPath, npmCli!),
    npx: npmShim(execPath, npxCli!),
  }

  // Fast path: shims already match AND the marker records a successful probe
  // for exactly these inputs — skip the (slow) version probes entirely.
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath(homeDir), 'utf-8'))
    const shimsMatch = Object.entries(desired).every(
      ([name, body]) => fs.readFileSync(path.join(binDir, name), 'utf-8') === body,
    )
    if (shimsMatch && marker?.execPath === execPath && marker?.npmDir === npmDir && marker?.nodeVersion) {
      return finish({
        ok: true, performed: false, binDir,
        nodeVersion: marker.nodeVersion, npmVersion: marker.npmVersion,
      })
    }
  } catch { /* no marker / drift → full provision below */ }

  // T-442 storm guard: bound full provisions (shim writes + probe spawns) per
  // home per window, whatever is driving the repetition. This is the
  // env-independent stop for the incident's loop shape: each misfired GUI
  // generation re-entered exactly this path.
  const now = Date.now()
  const recent = readRecentAttempts(homeDir, now)
  if (recent.length >= STORM_MAX_ATTEMPTS) {
    return finish({
      ok: false, performed: false, binDir, code: 'provision-storm',
      error: `${recent.length} full provision attempts in the last ${Math.round(STORM_WINDOW_MS / 1000)}s — refusing to spawn more probes; will retry after the window`,
    })
  }
  recordAttempt(homeDir, [...recent, now])

  try {
    for (const [name, body] of Object.entries(desired)) {
      const p = path.join(binDir, name)
      fs.writeFileSync(p, body, { mode: 0o755 })
      fs.chmodSync(p, 0o755) // writeFileSync mode is ignored when the file exists
    }
  } catch (e: any) {
    return finish({ ok: false, performed: true, binDir, code: 'shim-write-failed', error: e?.message ?? String(e) })
  }

  let nodeVersion: string
  let npmVersion: string
  try {
    nodeVersion = probe(path.join(binDir, 'node'), ['--version']).trim()
    npmVersion = probe(path.join(binDir, 'npm'), ['--version']).trim()
  } catch (e: any) {
    for (const name of Object.keys(desired)) rmQuiet(path.join(binDir, name))
    rmQuiet(markerPath(homeDir))
    return finish({ ok: false, performed: true, binDir, code: 'probe-failed', error: e?.message ?? String(e) })
  }

  try {
    fs.writeFileSync(markerPath(homeDir), JSON.stringify({
      execPath, npmDir, nodeVersion, npmVersion,
      provisioned_at: new Date().toISOString(),
    }, null, 2) + '\n')
  } catch { /* marker is an optimization only */ }

  return finish({ ok: true, performed: true, binDir, nodeVersion, npmVersion })
}

// ── Read-side helper (surface.ts failure hint) ────────────────────────────────

/** Can ANY dir on `searchPath` resolve an executable `node`? Used to decide
 *  whether a failed surface run should carry the toolchain-unavailable hint. */
export function hasNodeOnPath(searchPath: string): boolean {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!dir) continue
    try {
      const p = path.join(dir, 'node')
      if (fs.statSync(p).isFile()) {
        fs.accessSync(p, fs.constants.X_OK)
        return true
      }
    } catch { /* keep scanning */ }
  }
  return false
}
