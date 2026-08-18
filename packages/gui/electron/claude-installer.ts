/**
 * claude-installer.ts — in-app engine CLI provisioning (T-439).
 *
 * A participant's Mac has no node, no npm, no claude — and the north star is
 * zero terminal. This module installs the engine CLI from inside the GUI via
 * the OFFICIAL native installer path (code.claude.com/docs/en/setup, fetched
 * 2026-07-30): `https://claude.ai/install.sh`, which needs neither node nor
 * npm and registers background auto-update. npm is deliberately NOT used.
 *
 * What the trust chain ACTUALLY provides (corrected 2026-07-30 after QA read
 * the script — the earlier "GPG-signed manifest" claim here was wrong):
 *   1. The installer script is fetched in-process over TLS from the single
 *      documented URL, following redirects, and passes a STRUCTURAL sanity gate
 *      before execution — `validateInstallerScript` checks only: length >= 500,
 *      a leading `#!`, no `<html`/`<!doctype` in the first 2 KB, and that the
 *      substring "claude" occurs somewhere. That rejects a CDN error page or a
 *      truncated body. It is NOT authenticity checking: any well-formed script
 *      served from the origin passes.
 *   2. The script SHA256-checks the downloaded binary against a checksum it
 *      fetches from the SAME origin, and deletes the binary on mismatch. There
 *      is no GPG and no signature verification anywhere in it. Because the
 *      checksum and the binary share an origin, this detects TRANSPORT
 *      corruption and partial downloads — it does not establish integrity
 *      against whoever controls the origin. The effective trust root is TLS
 *      plus Anthropic's control of claude.ai / downloads.claude.ai.
 *   3. Our own independent check is step 3: after install and BEFORE the app
 *      ever spawns `claude`, the placed binary's platform code signature is
 *      verified (`codesign --verify --strict`; macOS binaries are signed by
 *      "Anthropic PBC" and notarized), then a `--version` probe must answer.
 *      On failure the just-provisioned files are removed (the documented
 *      native-uninstall paths) so an unverified binary is never left as the
 *      live launcher. This is the only leg of the chain that does not reduce to
 *      trusting the download origin.
 *   4. The script runs under a FIXED system PATH (INSTALLER_SCRIPT_PATH), so
 *      its helper binaries — `shasum` above all — cannot be shadowed by a shim
 *      in a user-writable directory. This closes a local hijack; it adds
 *      nothing against a compromised origin.
 *
 * Idempotency: a CLI that `resolveClaudeCli` finds — on the login-shell PATH
 * (Homebrew, npm-global, manual) OR at the native launcher path a prior run of
 * this module wrote — is a strict no-op: nothing is downloaded, nothing is
 * executed, the existing install is never touched. We only ever remove files when WE placed them in this run
 * (the install leg is only reached when no claude existed).
 *
 * All effectful legs are injectable (InstallDeps) so the pipeline is
 * unit-testable without network or a real install — claude-installer.test.ts.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { withLoginShellPath, userLocalBinDir } from './surface-runner'

const execFileAsync = promisify(execFile)

/** Official native-installer URL — code.claude.com/docs/en/setup (2026-07-30). */
export const INSTALLER_SCRIPT_URL = 'https://claude.ai/install.sh'

/**
 * T-439 (QA fail row 4): the FIXED, reduced PATH the downloaded installer script
 * runs under. Stock-macOS system dirs only.
 *
 * The script was previously run under `withLoginShellPath(process.env)`. That
 * PATH begins with the login shell's own entries, and this very app creates
 * `~/.local/bin` (prdt-bootstrap §5 symlink) and the official installer puts
 * `claude` there — so on a machine where the participant has `~/.local/bin`
 * ahead of `/usr/bin`, a user-writable `shasum` shim dropped in that directory
 * is what the script executes for its checksum step. QA demonstrated exactly
 * that hijack. Every external command install.sh uses (curl, shasum, uname,
 * mktemp, chmod, mkdir, grep, sed, tr, cut) ships in these four dirs on stock
 * macOS, so pinning them costs nothing and removes the user-writable-dir
 * precedence entirely.
 *
 * This bounds WHICH BINARIES the script resolves. It does not, on its own, make
 * the script's own integrity checking stronger — see the header note.
 */
export const INSTALLER_SCRIPT_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'

/**
 * Env vars that let a caller inject shell code into a `bash script.sh` run
 * without touching PATH. Dropped alongside the PATH pin so the reduced PATH
 * cannot be trivially routed around.
 */
const SHELL_INJECTION_ENV_VARS = ['BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS', 'IFS', 'CDPATH', 'GLOBIGNORE']

/** The environment the fetched installer script executes in: inherited env with
 *  PATH pinned to system dirs and shell-injection hooks stripped. */
export function installerScriptEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const k of SHELL_INJECTION_ENV_VARS) delete env[k]
  env.PATH = INSTALLER_SCRIPT_PATH
  return env
}

/** Absolute path of the launcher the official native installer writes. */
export function nativeLauncherPath(homeDir: string = os.homedir()): string {
  return path.join(userLocalBinDir(homeDir), 'claude')
}

function isExecutableFile(p: string): boolean {
  try {
    // statSync follows symlinks — the native installer's launcher is one.
    if (!fs.statSync(p).isFile()) return false
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * T-439 (QA BLOCKER): resolve the engine CLI to an ABSOLUTE path, or null.
 *
 * Two legs, in order:
 *   1. the login-shell PATH (`which claude`) — Homebrew, npm-global, or a
 *      native install on a machine whose profile DOES export `~/.local/bin`;
 *   2. the official native launcher `~/.local/bin/claude`, checked by absolute
 *      path.
 *
 * Leg 2 is not a nicety, it is the fix. The official installer run
 * non-interactively writes NO shell integration — QA verified `~/.zprofile`
 * stayed 0 bytes and `~/.zshrc` was never created — and a fresh macOS PATH does
 * not contain `~/.local/bin`. With leg 1 alone the app could not see an install
 * it had just performed and verified itself: the engine row reverted to "not
 * installed" forever and each retry silently reinstalled. Detection must not
 * depend on the shell PATH at all, which is why leg 2 asks the filesystem
 * directly rather than re-reading a possibly-stale PATH.
 */
export async function resolveClaudeCli(
  opts: { homeDir?: string; whichClaude?: () => Promise<string | null> } = {},
): Promise<string | null> {
  const viaPath = await (opts.whichClaude ?? defaultWhichClaude)()
  if (viaPath) return viaPath
  const launcher = nativeLauncherPath(opts.homeDir ?? os.homedir())
  return isExecutableFile(launcher) ? launcher : null
}

const SCRIPT_FETCH_TIMEOUT_MS = 30_000
const INSTALL_RUN_TIMEOUT_MS = 10 * 60_000
const VERSION_PROBE_TIMEOUT_MS = 30_000
/** Max stderr/stdout tail carried into the error surface. */
const OUTPUT_TAIL_CHARS = 1_500

export type InstallPhase = 'download' | 'install' | 'verify'

export type InstallErrorCode =
  | 'unsupported-platform'
  | 'network'
  | 'script-invalid'
  | 'install-failed'
  | 'binary-verify-failed'

export interface InstallResult {
  ok: boolean
  /** true when an install actually ran (false on no-op and pre-exec failures). */
  performed: boolean
  alreadyInstalled?: boolean
  /** `claude --version` output on success, e.g. "2.1.211 (Claude Code)". */
  version?: string
  code?: InstallErrorCode
  error?: string
}

export interface InstallDeps {
  platform?: NodeJS.Platform
  homeDir?: string
  tmpDir?: string
  /** Resolve an existing CLI under the login-shell PATH; null when absent. */
  whichClaude?: () => Promise<string | null>
  /** Fetch the official installer script text. Throws on network failure. */
  fetchScript?: () => Promise<string>
  /** Run the saved script with bash. Resolves exit code + output tail. */
  runScript?: (scriptPath: string) => Promise<{ code: number | null; tail: string }>
  /** Platform code-signature gate (darwin). Throws on failure. */
  codesignVerify?: (binPath: string) => Promise<void>
  /** `claude --version` probe against the freshly placed binary. */
  probeVersion?: (binPath: string) => Promise<string>
  onProgress?: (phase: InstallPhase) => void
}

// ── Script validation (before execution) ─────────────────────────────────────

/**
 * Structural gate on the fetched installer before it is ever executed:
 * a real install.sh is a multi-KB bash script; a CDN/service failure comes
 * back as an HTML page or a short error body (the docs call out the
 * `syntax error near unexpected token '<'` class explicitly).
 */
export function validateInstallerScript(text: string): { ok: boolean; reason?: string } {
  if (!text || text.length < 500) return { ok: false, reason: 'body too short to be the installer' }
  if (!text.startsWith('#!')) return { ok: false, reason: 'missing shebang' }
  const head = text.slice(0, 2048).toLowerCase()
  if (head.includes('<html') || head.includes('<!doctype')) return { ok: false, reason: 'HTML page, not a script' }
  if (!/claude/i.test(text)) return { ok: false, reason: 'unexpected content' }
  return { ok: true }
}

// ── Default effectful legs (injectable for tests) ─────────────────────────────

async function defaultWhichClaude(): Promise<string | null> {
  // Login-shell PATH so Homebrew / npm-global / ~/.local/bin installs resolve
  // under a Finder/packaged-app launch too (same class of fix as T-PATCH-199).
  try {
    const { stdout } = await execFileAsync('which', ['claude'], { env: withLoginShellPath(process.env) })
    const p = String(stdout).trim()
    return p || null
  } catch {
    return null
  }
}

async function defaultFetchScript(): Promise<string> {
  const res = await fetch(INSTALLER_SCRIPT_URL, {
    signal: AbortSignal.timeout(SCRIPT_FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`installer download failed: HTTP ${res.status}`)
  return res.text()
}

function defaultRunScript(scriptPath: string): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve, reject) => {
    // /bin/bash + curl + shasum all ship with stock macOS — no prerequisite.
    const child = spawn('/bin/bash', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // T-439 QA row 4: FIXED system PATH, never the login-shell PATH — see
      // INSTALLER_SCRIPT_PATH. `shasum` and `curl` must come from /usr/bin,
      // not from a user-writable dir this app itself put ahead of it.
      env: installerScriptEnv(process.env),
    })
    let tail = ''
    const collect = (raw: Buffer) => {
      tail = (tail + raw.toString('utf-8')).slice(-OUTPUT_TAIL_CHARS * 3)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ok */ }
      reject(new Error('installer timed out'))
    }, INSTALL_RUN_TIMEOUT_MS)
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, tail }) })
  })
}

async function defaultCodesignVerify(binPath: string): Promise<void> {
  // Docs: macOS binaries are signed by "Anthropic PBC" and notarized.
  // /usr/bin/codesign ships with the OS (no CLT needed).
  await execFileAsync('/usr/bin/codesign', ['--verify', '--strict', binPath])
}

async function defaultProbeVersion(binPath: string): Promise<string> {
  const { stdout } = await execFileAsync(binPath, ['--version'], {
    timeout: VERSION_PROBE_TIMEOUT_MS,
    env: withLoginShellPath(process.env),
  })
  return String(stdout)
}

// ── Cleanup on failed verification ────────────────────────────────────────────

/** The documented native-install locations (setup docs, Uninstall section).
 *  Only ever called when THIS run placed the files (no prior claude existed). */
function removeProvisionedInstall(homeDir: string): void {
  try { fs.rmSync(path.join(homeDir, '.local', 'bin', 'claude'), { force: true }) } catch { /* best-effort */ }
  try { fs.rmSync(path.join(homeDir, '.local', 'share', 'claude'), { recursive: true, force: true }) } catch { /* best-effort */ }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function installClaudeCli(deps: InstallDeps = {}): Promise<InstallResult> {
  const platform = deps.platform ?? process.platform
  const homeDir = deps.homeDir ?? os.homedir()
  const tmpDir = deps.tmpDir ?? os.tmpdir()
  const onProgress = deps.onProgress ?? (() => { /* silent */ })

  // Idempotency gate: any resolvable CLI (however installed) → strict no-op.
  // Resolution goes through resolveClaudeCli so the gate sees a native install
  // on a profile-untouched machine too — otherwise every retry of a install
  // that already succeeded downloads and runs the script again (QA's loop).
  const existing = await resolveClaudeCli({ homeDir, whichClaude: deps.whichClaude })
  if (existing) return { ok: true, performed: false, alreadyInstalled: true }

  if (platform !== 'darwin' && platform !== 'linux') {
    return {
      ok: false, performed: false, code: 'unsupported-platform',
      error: `no in-app installer path wired for ${platform}`,
    }
  }

  onProgress('download')
  let script: string
  try {
    script = await (deps.fetchScript ?? defaultFetchScript)()
  } catch (e: any) {
    return { ok: false, performed: false, code: 'network', error: e?.message ?? 'installer download failed' }
  }
  const valid = validateInstallerScript(script)
  if (!valid.ok) {
    return { ok: false, performed: false, code: 'script-invalid', error: `installer script rejected: ${valid.reason}` }
  }

  const scratch = fs.mkdtempSync(path.join(tmpDir, 'claude-cli-install-'))
  const scriptPath = path.join(scratch, 'install.sh')
  fs.writeFileSync(scriptPath, script, { mode: 0o700 })

  onProgress('install')
  try {
    const { code, tail } = await (deps.runScript ?? defaultRunScript)(scriptPath)
    if (code !== 0) {
      return {
        ok: false, performed: true, code: 'install-failed',
        error: (tail || `installer exited with code ${code}`).slice(-OUTPUT_TAIL_CHARS),
      }
    }
  } catch (e: any) {
    return { ok: false, performed: true, code: 'install-failed', error: e?.message ?? 'installer run failed' }
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* best-effort */ }
  }

  onProgress('verify')
  const launcher = path.join(homeDir, '.local', 'bin', 'claude')
  let binPath: string
  try {
    binPath = fs.realpathSync(launcher)
  } catch {
    return {
      ok: false, performed: true, code: 'binary-verify-failed',
      error: `installer finished but no launcher appeared at ${launcher}`,
    }
  }
  try {
    if (platform === 'darwin') await (deps.codesignVerify ?? defaultCodesignVerify)(binPath)
    const version = await (deps.probeVersion ?? defaultProbeVersion)(binPath)
    return { ok: true, performed: true, version: version.trim() }
  } catch (e: any) {
    removeProvisionedInstall(homeDir)
    return { ok: false, performed: true, code: 'binary-verify-failed', error: e?.message ?? 'binary verification failed' }
  }
}
