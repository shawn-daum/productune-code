/**
 * T-431: GUI in-app prdt bootstrap — a participant's Mac must reach a usable
 * project-create state from the packaged app alone (zero terminal, zero repo
 * credentials, north-star rehearsal R-40).
 *
 * This is the TS equivalent of packages/core/scripts/install.sh:
 *   §1 mirror discipline/doctrine/hooks/bin → ~/.prdt  (+ `prdt menus` regen)
 *   §2 ~/.prdt/prdt.env             (created only when absent — NEVER rewritten:
 *       repointing a repo install's PRDT_REPO at the app bundle would break
 *       `prdt update` on that machine)
 *   §3 agents → ~/.claude/agents
 *   §4/§6 settings.json hooks + statusline — NOT re-implemented here: reuses
 *       onboarding.ts installPrdtHooks, whose registration is derived from the
 *       same hook-manifest.json SoT install.sh reduces over (T-414 parity test)
 *   §5 ~/.local/bin/prdt symlink    (best-effort)
 *
 * Why TS instead of spawning the bundled install.sh: install.sh hard-requires
 * `jq` (and python3), and a fresh participant Mac ships neither jq nor working
 * Xcode CLT — spawning it would fail exactly on the machines this exists for.
 * The settings.json merge is done natively; the only external dependency left
 * is python3 for `prdt menus` (and for the prdt CLI itself at project-create),
 * which is preflighted WITHOUT triggering Apple's CLT install dialog.
 *
 * Provenance policy (decideBootstrap):
 *   - ~/.prdt/bin/prdt missing            → provision  (participant first launch)
 *   - mirror incomplete                   → provision  (repair a broken install)
 *   - gui marker present + app version ≠  → provision  (refresh after app update)
 *   - complete mirror, NO gui marker      → skip       (repo-managed install —
 *       install.sh / `prdt update` own that machine; the bundled payload must
 *       never downgrade a newer repo mirror, e.g. on a developer's machine)
 *
 * The marker (~/.prdt/gui-bootstrap.json) is written ONLY by this module, so a
 * repo-managed ~/.prdt is never reclassified as app-managed.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { installPrdtHooks } from './ipc/onboarding'
import hookManifestJson from '../../core/scripts/hook-manifest.json'

const HOOK_BASENAMES: readonly string[] = (hookManifestJson as { basenames: string[] }).basenames

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BootstrapPaths {
  /** Root of the bundled installer payload (packages/core shape). */
  payloadRoot: string
  homeDir: string
  appVersion: string
  /** Test-only injection — replaces the python3 preflight. */
  checkPython?: () => boolean
}

export type BootstrapDecision =
  | { action: 'provision'; reason: 'missing-bin' | 'incomplete-mirror' | 'gui-stale' }
  | { action: 'skip'; reason: 'current' | 'foreign-install' }

export interface BootstrapResult {
  ok: boolean
  /** true when a provision actually ran (false on skip and on preflight fail). */
  performed: boolean
  reason: string
  /** Machine-readable failure class for the renderer/IPC error surface. */
  code?: 'missing-python3' | 'payload-missing' | 'step-failed'
  error?: string
}

// ── Path helpers ──────────────────────────────────────────────────────────────

export function guiMarkerPath(homeDir: string): string {
  return path.join(homeDir, '.prdt', 'gui-bootstrap.json')
}

/** The bundled payload root: packaged app → <Resources>/prdt-core (electron-
 *  builder extraResources, T-431); dev/non-packaged → the repo's packages/core
 *  (same relative hop onboarding.ts already uses for coreDir). */
export function resolveDefaultPaths(app: {
  isPackaged: boolean
  getAppPath: () => string
  getVersion: () => string
}): BootstrapPaths {
  const payloadRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'prdt-core')
    : path.join(app.getAppPath(), '..', 'core')
  return { payloadRoot, homeDir: os.homedir(), appVersion: app.getVersion() }
}

// ── python3 preflight (no CLT-dialog side effect) ─────────────────────────────

/**
 * True when a WORKING python3 is available. On macOS, `command -v python3`
 * always hits the /usr/bin/python3 CLT stub, and actually RUNNING the stub on a
 * CLT-less machine pops Apple's blocking install dialog — so instead:
 * CLT installed (`xcode-select -p` exit 0) counts, and any non-/usr/bin python3
 * (Homebrew, python.org, pyenv) counts. Non-darwin: plain PATH lookup.
 */
function pythonUsable(): boolean {
  if (process.platform === 'darwin') {
    try {
      execFileSync('/usr/bin/xcode-select', ['-p'], { stdio: 'ignore' })
      return true
    } catch { /* no CLT — check for a real (non-stub) python3 below */ }
    const fixed = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3']
    const fromPath = (process.env.PATH ?? '')
      .split(':')
      .filter((d) => d && d !== '/usr/bin')
      .map((d) => path.join(d, 'python3'))
    return [...fixed, ...fromPath].some((p) => {
      try { return fs.existsSync(p) } catch { return false }
    })
  }
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['python3'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// ── Decision ──────────────────────────────────────────────────────────────────

function mirrorComplete(homeDir: string): boolean {
  const prdt = path.join(homeDir, '.prdt')
  const required = [
    path.join(prdt, 'bin', 'prdt'),
    path.join(prdt, 'bin', 'statusline-prdt.sh'),
    path.join(prdt, 'doctrine.md'),
    path.join(prdt, 'discipline'),
    ...HOOK_BASENAMES.map((b) => path.join(prdt, 'hooks', b)),
  ]
  return required.every((p) => {
    try { return fs.existsSync(p) } catch { return false }
  })
}

export function decideBootstrap(paths: BootstrapPaths): BootstrapDecision {
  const binPrdt = path.join(paths.homeDir, '.prdt', 'bin', 'prdt')
  if (!fs.existsSync(binPrdt)) return { action: 'provision', reason: 'missing-bin' }
  if (!mirrorComplete(paths.homeDir)) return { action: 'provision', reason: 'incomplete-mirror' }

  let marker: { app_version?: string } | null = null
  try {
    marker = JSON.parse(fs.readFileSync(guiMarkerPath(paths.homeDir), 'utf-8'))
  } catch { marker = null }
  if (!marker) return { action: 'skip', reason: 'foreign-install' }
  if (marker.app_version !== paths.appVersion) return { action: 'provision', reason: 'gui-stale' }
  return { action: 'skip', reason: 'current' }
}

// ── Provision ─────────────────────────────────────────────────────────────────

function payloadValid(payloadRoot: string): boolean {
  return ['scripts/prdt', 'scripts/statusline-prdt.sh', 'doctrine.md', 'discipline']
    .every((rel) => {
      try { return fs.existsSync(path.join(payloadRoot, rel)) } catch { return false }
    })
}

/** Unconditional provision — the install.sh-equivalent steps. Synchronous by
 *  design (a few hundred KB of copies + one short `prdt menus` run). */
export function runBootstrap(paths: BootstrapPaths): BootstrapResult {
  const { payloadRoot, homeDir, appVersion } = paths

  // Preflights — fail BEFORE touching disk so a broken state is never half-built.
  if (!payloadValid(payloadRoot)) {
    return {
      ok: false, performed: false, reason: 'payload-missing', code: 'payload-missing',
      error: `installer payload not found at ${payloadRoot}`,
    }
  }
  const pythonOk = paths.checkPython ? paths.checkPython() : pythonUsable()
  if (!pythonOk) {
    return {
      ok: false, performed: false, reason: 'missing-python3', code: 'missing-python3',
      error: 'python3 unavailable (macOS Command Line Tools not installed)',
    }
  }

  const prdtHome = path.join(homeDir, '.prdt')
  const claudeDir = path.join(homeDir, '.claude')
  try {
    // §1 mirror (1-way: payload → home; user files live in overrides/, never in the mirror)
    fs.mkdirSync(path.join(prdtHome, 'overrides'), { recursive: true })
    fs.mkdirSync(path.join(prdtHome, 'hooks'), { recursive: true })
    fs.mkdirSync(path.join(prdtHome, 'bin'), { recursive: true })
    fs.rmSync(path.join(prdtHome, 'discipline'), { recursive: true, force: true })
    fs.cpSync(path.join(payloadRoot, 'discipline'), path.join(prdtHome, 'discipline'), { recursive: true })
    fs.copyFileSync(path.join(payloadRoot, 'doctrine.md'), path.join(prdtHome, 'doctrine.md'))
    for (const b of HOOK_BASENAMES) {
      const dst = path.join(prdtHome, 'hooks', b)
      fs.copyFileSync(path.join(payloadRoot, 'scripts', 'hooks', b), dst)
      fs.chmodSync(dst, 0o755)
    }
    const binPrdt = path.join(prdtHome, 'bin', 'prdt')
    fs.copyFileSync(path.join(payloadRoot, 'scripts', 'prdt'), binPrdt)
    fs.chmodSync(binPrdt, 0o755)
    const statusline = path.join(prdtHome, 'bin', 'statusline-prdt.sh')
    fs.copyFileSync(path.join(payloadRoot, 'scripts', 'statusline-prdt.sh'), statusline)
    fs.chmodSync(statusline, 0o755)

    // menus are derived — regenerate against the installed mirror (install.sh §1)
    execFileSync(binPrdt, ['menus'], {
      env: { ...process.env, PRDT_DISCIPLINE: path.join(prdtHome, 'discipline') },
      stdio: 'ignore',
      timeout: 30_000,
    })

    // §2 prdt.env — created only when absent; an existing env is NEVER rewritten
    // (deliberate divergence from install.sh, which repoints PRDT_REPO: here an
    // existing env means a repo install being repaired — its PRDT_REPO must keep
    // pointing at the git clone or `prdt update` dies on that machine).
    const envFile = path.join(prdtHome, 'prdt.env')
    const envCreated = !fs.existsSync(envFile)
    if (envCreated) {
      const lines = [
        `PRDT_REPO=${payloadRoot}`,
        `created_at=${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
        'PRDT_HOOKS_INSTALLED=true',
        'PRDT_STATUSLINE_INSTALLED=false',
        'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1',
      ]
      fs.writeFileSync(envFile, lines.join('\n') + '\n', { mode: 0o600 })
    }

    // §3 agents (copy — additive)
    const agentsSrc = path.join(payloadRoot, 'agents')
    const agentsDst = path.join(claudeDir, 'agents')
    fs.mkdirSync(agentsDst, { recursive: true })
    for (const f of fs.readdirSync(agentsSrc)) {
      if (/^prdt-.*\.md$/.test(f)) {
        fs.copyFileSync(path.join(agentsSrc, f), path.join(agentsDst, f))
      }
    }

    // §4/§6 settings.json hooks + statusline — the SAME derivation install.sh
    // reduces over (hook-manifest.json SoT; idempotent strip+re-add; existing
    // statusLine preserved). Runs AFTER the mirror copy so its completeness
    // check passes.
    const settingsPath = path.join(claudeDir, 'settings.json')
    installPrdtHooks(settingsPath, homeDir)

    // install.sh §6 parity: when OUR statusline ended up registered, flip the
    // env flag (string replace, exactly like install.sh's python snippet).
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (String(settings?.statusLine?.command ?? '').includes('statusline-prdt.sh')) {
        const env = fs.readFileSync(envFile, 'utf-8')
        fs.writeFileSync(envFile, env.replace('PRDT_STATUSLINE_INSTALLED=false', 'PRDT_STATUSLINE_INSTALLED=true'))
      }
    } catch { /* flag update is best-effort */ }

    // §5 PATH symlink (best-effort — a GUI-only participant never needs it, but
    // it gives terminal parity with install.sh at zero cost)
    try {
      const localBin = path.join(homeDir, '.local', 'bin')
      fs.mkdirSync(localBin, { recursive: true })
      const link = path.join(localBin, 'prdt')
      try { fs.unlinkSync(link) } catch { /* absent */ }
      fs.symlinkSync(binPrdt, link)
    } catch { /* non-fatal, mirrors install.sh's `|| true` posture */ }

    // marker — records this ~/.prdt as app-managed so app updates refresh it
    fs.writeFileSync(guiMarkerPath(homeDir), JSON.stringify({
      app_version: appVersion,
      payload_root: payloadRoot,
      bootstrapped_at: new Date().toISOString(),
    }, null, 2) + '\n')

    return { ok: true, performed: true, reason: 'provisioned' }
  } catch (e: any) {
    return {
      ok: false, performed: true, reason: 'step-failed', code: 'step-failed',
      error: e?.message ?? String(e),
    }
  }
}

/** Decide + (maybe) run. The single entry point main.ts / project.ts call. */
export function ensurePrdtProvisioned(paths: BootstrapPaths): BootstrapResult {
  const decision = decideBootstrap(paths)
  if (decision.action === 'skip') {
    return { ok: true, performed: false, reason: decision.reason }
  }
  const res = runBootstrap(paths)
  return res.ok ? { ...res, reason: decision.reason } : res
}
