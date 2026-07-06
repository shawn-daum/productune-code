import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { promisify } from 'util'
import { setUiLanguage } from '@productune/core'
import type { UiLanguage } from '@productune/core'
import { withLoginShellPath } from '../surface-runner'
import { onboardingPath as projectOnboardingPath, detectProjectKind } from '../project-paths'
import type { ProjectKind } from '../project-paths'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingCompleteOpts {
  engine: 'claude'
  uiLanguage?: UiLanguage
}

interface OnboardingRecord {
  status: 'pending' | 'done'
  source: 'gui-create' | 'install-at' | 'legacy-fallback'
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// T-PATCH-199: hidden-spawn browser-OAuth login (osascript→Terminal removed).
// `claude auth login` is spawned with piped stdio (no TTY, no terminal window).
// The spawned CLI opens the system browser itself; we parse its stdout to
// (a) surface the OAuth URL as a "reopen browser" button, and (b) detect the
// "paste code" fallback prompt. The child lives for the whole browser handshake,
// so the IPC handler must NOT await it — it returns once the child is spawned,
// and progress is streamed via webContents.send.

/** The single in-flight login child process. Kept at module scope so
 *  submitLoginCode / cancelLogin can reach it across IPC calls. */
let loginChild: ChildProcess | null = null

/** Strip OSC-8 hyperlink escapes (`\x1b]8;;<url>\x07<text>\x1b]8;;\x07`) and any
 *  other ANSI/OSC control sequences so a clean `https://…` URL can be extracted. */
function stripAnsi(s: string): string {
  return s
    // OSC sequences terminated by BEL (\x07) or ST (\x1b\\)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences (colors, cursor moves, etc.)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

/** Extract the first https URL from a (de-escaped) chunk, if any. */
function extractUrl(clean: string): string | null {
  const m = clean.match(/https?:\/\/[^\s'"<>]+/)
  return m ? m[0] : null
}

/** Heuristic: does this output ask the user to paste a code? Generic so it
 *  matches claude's "Paste code here if prompted >" variants. */
function isPasteCodePrompt(clean: string): boolean {
  return /paste\s+(the\s+)?code|enter\s+(the\s+)?code|authorization\s+code|verification\s+code/i.test(clean)
}

/** Broadcast an onboarding login event to all renderer windows. */
function emitLogin(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Build a child env whose PATH includes the user's login-shell PATH, so a
 *  globally-installed `claude` (Homebrew, npm-global, `~/.local/bin`)
 *  resolves even when the app was launched from Finder. A packaged-app launch
 *  inherits launchd's minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), so a bare
 *  `claude` spawn would exit ENOENT and the browser would never open — same
 *  failure surface-runner already fixes for build/run spawns (T-PATCH-186).
 *  Earlier entries win; deduped. */
function loginShellEnv(): NodeJS.ProcessEnv {
  return withLoginShellPath(process.env)
}

/** Spawn a hidden login process (`claude auth login`) and wire its stdout/stderr
 *  to the renderer via webContents.send. Returns immediately; does NOT block on
 *  the browser OAuth handshake. */
function startHiddenLogin(engine: 'claude'): { ok: boolean; error?: string } {
  // Kill any prior in-flight login before starting a new one.
  if (loginChild && loginChild.exitCode === null) {
    try { loginChild.kill() } catch { /* ok */ }
  }
  loginChild = null

  const cmd = 'claude'
  const args = ['auth', 'login']

  let child: ChildProcess
  try {
    child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // T-PATCH-199 fix: augment PATH with the login-shell PATH so the globally
      // installed CLI resolves under a Finder/packaged-app launch (launchd's
      // minimal PATH otherwise → ENOENT, browser never opens). See loginShellEnv.
      env: loginShellEnv(),
    })
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'spawn failed' }
  }

  loginChild = child
  let urlSent = false

  const handleChunk = (raw: Buffer) => {
    const clean = stripAnsi(raw.toString('utf-8'))
    if (!urlSent) {
      const url = extractUrl(clean)
      if (url) {
        urlSent = true
        emitLogin('onboarding:login-url', { engine, url })
      }
    }
    if (isPasteCodePrompt(clean)) {
      emitLogin('onboarding:login-needs-code', { engine })
    }
  }

  child.stdout?.on('data', handleChunk)
  // Some claude builds write the prompt/URL to stderr.
  child.stderr?.on('data', handleChunk)

  child.on('error', (err) => {
    emitLogin('onboarding:login-exit', { engine, code: null, error: err?.message })
    if (loginChild === child) loginChild = null
  })

  child.on('exit', (code) => {
    emitLogin('onboarding:login-exit', { engine, code })
    if (loginChild === child) loginChild = null
  })

  return { ok: true }
}

async function prewarmPlaywrightMcp(): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['-y', '@playwright/mcp@latest', '--help'], {
      stdio: 'ignore',
      shell: true,
    })
    const timeout = setTimeout(() => {
      try { child.kill() } catch { /* ok */ }
      resolve()  // best-effort; don't fail onboarding
    }, 60_000)
    child.on('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.on('error', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

export function writeOnboardingPending(projectDir: string, source: OnboardingRecord['source']): void {
  const onboardingPath = projectOnboardingPath(projectDir)
  const record: OnboardingRecord = {
    status: 'pending',
    source,
    updated_at: new Date().toISOString(),
  }
  fs.writeFileSync(onboardingPath, JSON.stringify(record, null, 2), 'utf-8')
}

// ── Claude hooks install (prdt-only; legacy downgraded to read-only, T-311) ────
//
// T-311: GUI legacy dual-mode was downgraded to read-only. The legacy hook set
// (T-PATCH-246's 18 pdt-* enforcement hooks + statusline-productune) is no longer
// installed from the GUI — installClaudeHooks now installs ONLY the prdt hook 3종
// (T-289 adapter A6) for prdt-kind projects, and is a NO-OP for legacy/undefined
// projects. Legacy projects keep working for file/ticket/po-state VIEWING; only
// the machine-provisioning wiring is cut. prdt install stays the single
// go-forward path: install.sh (mirror + agents + hooks) plus the T-305
// on-demand banner. `homeDir` is injectable (defaults to os.homedir()) so tests
// can exercise the prdt branch against a throwaway fixture HOME instead of the
// developer's real ~/.claude / ~/.prdt.

/** The 3 prdt discipline hooks (packages/core/scripts/install.sh §4, SoT). */
const PRDT_HOOK_BASENAMES = ['prdt-session-start.sh', 'prdt-post-compact.sh', 'prdt-post-dispatch.sh'] as const

function readSettings(settingsPath: string): any {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  let settings: any = {}
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || {} } catch { settings = {} }
    if (typeof settings !== 'object' || settings === null) settings = {}
  }
  return settings
}

/**
 * C5 (T-316): atomic settings.json write — tmp + rename-swap, matching
 * mcp.ts writeClaudeSettings. Claude Code reads ~/.claude/settings.json on
 * startup and on a watch-based reread; a plain writeFileSync leaves a
 * partial-write window that a concurrent read can catch mid-flush. rename(2) is
 * atomic on the same POSIX filesystem, so there is no torn-read window.
 */
function writeSettingsAtomic(settingsPath: string, settings: any): void {
  const tmp = settingsPath + '.tmp'
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2))
  fs.renameSync(tmp, settingsPath)
}

/**
 * prdt branch (T-289): install exactly the 3 discipline hooks + statusline-prdt.sh,
 * producing the SAME settings.json registration install.sh §4/§6 writes —
 * same `~/.prdt` mirror paths, same matchers, same quoted-command form — so GUI
 * and CLI installs can never diverge or double-register: either one re-run strips
 * its own entries (basename match ⊇ the CLI's path-prefix strip) and re-adds
 * identical values. Coexists with legacy pdt-* entries — only prdt-basename hooks
 * are stripped/replaced.
 *
 * Commands point at the `~/.prdt/hooks/` MIRROR, not the bundled coreDir: the prdt
 * hook scripts are mirrored home by install.sh (v1 repo install.sh
 * 24-25행, the SoT for this shape) and the legacy GUI bundle does not carry them.
 * If the mirror is absent (prdt never installed on this machine), registration is
 * SKIPPED with a warn instead of writing hook entries that point at nonexistent
 * scripts — a prdt project can't spawn its PO without `~/.prdt/prdt.env` anyway
 * (po-runner canSpawnClaude), so install.sh runs first either way.
 */
function installPrdtHooks(settingsPath: string, homeDir: string): void {
  const prdtHome = path.join(homeDir, '.prdt')
  const hooksDir = path.join(prdtHome, 'hooks')
  const missing = PRDT_HOOK_BASENAMES.filter(b => !fs.existsSync(path.join(hooksDir, b)))
  if (missing.length > 0) {
    console.warn(`[onboarding] prdt hook mirror incomplete (${missing.join(', ')} not in ${hooksDir}) — run install.sh first; skipping hook registration`)
    return
  }

  const settings = readSettings(settingsPath)

  // Quoted (mirrors install.sh's jq concat) so the registered command
  // resolves as ONE shell arg even if the home path ever contains spaces.
  const h = (name: string) => `"${path.join(hooksDir, name)}"`
  const statusline = `"${path.join(prdtHome, 'bin', 'statusline-prdt.sh')}"`
  const cmd = (c: string) => ({ type: 'command', command: c })

  const isPrdtHook = (c: unknown): boolean =>
    typeof c === 'string' && PRDT_HOOK_BASENAMES.some(b => c.includes(b))
  const stripPrdt = (arr: any): any[] =>
    (Array.isArray(arr) ? arr : []).filter((entry: any) =>
      !((Array.isArray(entry?.hooks) ? entry.hooks : []).some((hk: any) => isPrdtHook(hk?.command))))

  const H = (settings.hooks && typeof settings.hooks === 'object') ? settings.hooks : {}
  H.SessionStart = [...stripPrdt(H.SessionStart),
    { matcher: 'startup|resume|clear', hooks: [cmd(h('prdt-session-start.sh'))] },
    { matcher: 'compact', hooks: [cmd(h('prdt-post-compact.sh'))] },
  ]
  H.SubagentStart = [...stripPrdt(H.SubagentStart),
    { matcher: '^prdt-', hooks: [cmd(h('prdt-session-start.sh'))] },
  ]
  H.SubagentStop = [...stripPrdt(H.SubagentStop),
    { matcher: '^prdt-', hooks: [cmd(h('prdt-post-dispatch.sh'))] },
  ]
  H.PostToolUse = [...stripPrdt(H.PostToolUse),
    { matcher: 'Agent', hooks: [cmd(h('prdt-post-dispatch.sh'))] },
  ]

  settings.hooks = H
  settings.statusLine = { type: 'command', command: statusline }
  writeSettingsAtomic(settingsPath, settings)  // C5 (T-316): tmp+rename, no torn-read window
}

/**
 * Install claude hooks for the current onboarding path. `projectDir`, when given,
 * decides the branch via A1's detectProjectKind (never re-implemented ad hoc
 * here): 'prdt' → installPrdtHooks. Any other kind — legacy `.productune`, or an
 * omitted `projectDir` — is a NO-OP: T-311 downgraded legacy dual-mode to
 * read-only, so the GUI no longer installs the legacy enforcement hooks. `homeDir`
 * is test-only.
 */
export function installClaudeHooks(projectDir?: string, homeDir: string = os.homedir()): void {
  const kind: ProjectKind = projectDir ? detectProjectKind(projectDir) : 'productune'
  if (kind !== 'prdt') return
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  installPrdtHooks(settingsPath, homeDir)
}

// ── prdt hook install status / on-demand install (T-305) ──────────────────────
//
// A6 (T-289) built installClaudeHooks's prdt branch but nothing ever called it
// for a real project open — the global onboarding wizard (onboarding:complete)
// runs before a project is picked, so it always takes the legacy branch. T-305
// gives the renderer a way to (a) read whether THIS machine already has the
// prdt hooks registered, distinguishing "not installed" from "can't be
// installed yet" (mirror missing → install.sh never ran here), and
// (b) trigger the same installPrdtHooks the CLI installer uses, scoped to a
// projectDir the user has explicitly opened. No settings.json write happens
// without an explicit renderer call — never on project open by itself.

/** Every prdt hook basename is registered as a command somewhere in `settings.hooks`. */
function hasPrdtHooksRegistered(settingsPath: string): boolean {
  if (!fs.existsSync(settingsPath)) return false
  let settings: any
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return false
  }
  const commands: string[] = []
  for (const entries of Object.values((settings?.hooks ?? {}) as Record<string, any>)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        if (typeof hook?.command === 'string') commands.push(hook.command)
      }
    }
  }
  return PRDT_HOOK_BASENAMES.every((b) => commands.some((c) => c.includes(b)))
}

export interface PrdtHooksStatus {
  /** ~/.prdt/hooks/{3 hooks} all present — install.sh has run on this machine. */
  mirrorPresent: boolean
  /** settings.json already carries all 3 prdt hook commands. */
  installed: boolean
}

/** Read-only: never writes. `homeDir` is test-only (defaults to os.homedir()). */
export function checkPrdtHooksStatus(homeDir: string = os.homedir()): PrdtHooksStatus {
  const hooksDir = path.join(homeDir, '.prdt', 'hooks')
  const mirrorPresent = PRDT_HOOK_BASENAMES.every((b) => fs.existsSync(path.join(hooksDir, b)))
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  return { mirrorPresent, installed: mirrorPresent && hasPrdtHooksRegistered(settingsPath) }
}

/**
 * Install the prdt hooks for `projectDir` (must be a prdt-kind project — callers
 * check `checkPrdtHooksStatus().mirrorPresent` first; a missing mirror silently
 * no-ops here too, via installPrdtHooks's own warn-skip; a legacy projectDir is a
 * no-op via installClaudeHooks's read-only downgrade). `homeDir` is test-only.
 */
export function installPrdtHooksForProject(
  projectDir: string,
  homeDir: string = os.homedir(),
): { ok: boolean; installed: boolean } {
  installClaudeHooks(projectDir, homeDir)
  return { ok: true, installed: checkPrdtHooksStatus(homeDir).installed }
}

/**
 * Seed the user-global onboarding marker: `~/.productune/productune.env`. This is
 * the ONLY machine-level artifact the GUI onboarding wizard writes now — App.tsx's
 * checkEnv() gates the wizard on this file's presence.
 *
 * T-311: legacy dual-mode was downgraded to read-only. The wizard no longer
 * symlinks pdt-* / prdt-* agents into ~/.claude/agents, copies po-instructions.md
 * into ~/.productune, or installs the 18 legacy enforcement hooks — prdt
 * provisioning is install.sh's job (agents + hooks + mirror), plus the T-305
 * banner for per-project hook opt-in. `homeDir` is test-only (defaults to
 * os.homedir()). The productune.env body is byte-identical to the pre-T-311 seed
 * so the legacy po-runner env gate (canSpawnClaude → productune.env presence) is
 * unaffected.
 */
export function provisionUserGlobals(coreDir: string, homeDir: string = os.homedir()): void {
  const productuneDir = path.join(homeDir, '.productune')
  fs.mkdirSync(productuneDir, { recursive: true })

  const envPath = path.join(productuneDir, 'productune.env')
  let envContent = `MY_PO_ENGINE=claude\n`
  envContent += `PRODUCTUNE_REPO=${coreDir}\n`
  envContent += `created_at=${new Date().toISOString()}\n`
  fs.writeFileSync(envPath, envContent, { mode: 0o600 })
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('onboarding:checkClaude', async () => {
    // T-PATCH-199: detection must resolve the CLI under the login-shell PATH too
    // (Finder/packaged-app launch only inherits launchd's minimal PATH, so a
    // globally-installed `claude` in ~/.local/bin / Homebrew reads as "not
    // installed" and post-login `authed` is never detected). Mirrors the login
    // spawn fix (loginShellEnv) and surface-runner (T-PATCH-186).
    const env = loginShellEnv()
    let installed = false
    try {
      await execFileAsync('which', ['claude'], { env })
      installed = true
    } catch { return { installed: false, authed: false } }

    // Fast path: credentials file
    const credPath = path.join(os.homedir(), '.claude', 'credentials.json')
    if (fs.existsSync(credPath)) return { installed: true, authed: true }

    // Slow path: ask CLI (5 s timeout)
    try {
      const out = await execFileAsync('claude', ['auth', 'status'], { timeout: 5000, env }) as any
      const stdout: string = typeof out === 'string' ? out : (out?.stdout ?? '')
      const data = JSON.parse(stdout)
      return { installed: true, authed: data?.loggedIn === true }
    } catch {
      return { installed: true, authed: false }
    }
  })

  // T-PATCH-199: hidden-spawn browser-OAuth login. Returns once the child is
  // spawned (non-blocking); progress streams via onboarding:login-* events.
  ipcMain.handle('onboarding:claudeLogin', async () => startHiddenLogin('claude'))

  // Paste-code fallback: write the user-entered code to the login child's stdin.
  ipcMain.handle('onboarding:submitLoginCode', async (_event, code: string) => {
    if (!loginChild || loginChild.exitCode !== null || !loginChild.stdin) {
      return { ok: false, error: 'no active login process' }
    }
    try {
      loginChild.stdin.write(String(code ?? '').trim() + '\n')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'stdin write failed' }
    }
  })

  // Cancel an in-flight login (user backs out / closes the card).
  ipcMain.handle('onboarding:cancelLogin', async () => {
    if (loginChild && loginChild.exitCode === null) {
      try { loginChild.kill() } catch { /* ok */ }
    }
    loginChild = null
    return { ok: true }
  })

  ipcMain.handle('onboarding:clearLocalStorage', async () => {
    const home = os.homedir()
    const platform = process.platform

    // OS-aware path resolution
    let appDataBase: string
    if (platform === 'darwin') {
      appDataBase = path.join(home, 'Library', 'Application Support')
    } else if (platform === 'win32') {
      appDataBase = path.join(home, 'AppData', 'Roaming')
    } else {
      // Linux and other POSIX
      appDataBase = path.join(home, '.config')
    }

    const targets = [
      path.join(appDataBase, '@productune', 'Local Storage'),
      path.join(appDataBase, '@productune', 'gui', 'Local Storage'),
    ]

    const removed: string[] = []
    const errors: string[] = []

    for (const target of targets) {
      try {
        fs.rmSync(target, { recursive: true, force: true })
        removed.push(target)
      } catch (e: any) {
        errors.push(`${target}: ${e?.message}`)
      }
    }

    return { ok: errors.length === 0, removed, errors }
  })

  ipcMain.handle('onboarding:checkEnv', () => {
    const envPath = path.join(os.homedir(), '.productune', 'productune.env')
    return fs.existsSync(envPath)
  })

  ipcMain.handle('onboarding:complete', async (_event, opts: OnboardingCompleteOpts) => {
    try {
      // Resolve packages/core/ from packages/gui/ (app.getAppPath())
      const coreDir = path.join(app.getAppPath(), '..', 'core')

      // 1. Seed ~/.productune/productune.env — the GUI onboarding-complete marker
      //    App.tsx's checkEnv() gates the wizard on. T-311: legacy dual-mode was
      //    downgraded to read-only, so the wizard NO LONGER symlinks pdt-* / prdt-*
      //    agents, copies po-instructions.md, or installs the 18 legacy enforcement
      //    hooks. prdt provisioning is install.sh's job (+ the T-305 banner).
      provisionUserGlobals(coreDir)

      // 2. Pre-warm Playwright MCP cache (used by QA's auto smoke gate).
      //    Best-effort: triggers `npx` to download @playwright/mcp now so the
      //    first QA invocation isn't slow. Does NOT block onboarding completion
      //    on failure — agent's mcpServers block will retry lazily.
      await prewarmPlaywrightMcp()

      // 3. Save UI language selection to settings.json
      if (opts.uiLanguage) {
        setUiLanguage(opts.uiLanguage)
      }

      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('onboarding:readProject', (_event, projectDir: string): 'pending' | 'done' | null => {
    try {
      const p = projectOnboardingPath(projectDir)
      const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<OnboardingRecord>
      return data.status ?? null
    } catch {
      return null
    }
  })

  // T-305: prdt hook install status/trigger for a project already open in the GUI.
  ipcMain.handle('onboarding:checkPrdtHooks', (): PrdtHooksStatus => checkPrdtHooksStatus())

  ipcMain.handle('onboarding:installPrdtHooksAt', (_event, projectDir: string): { ok: boolean; installed: boolean; error?: string } => {
    try {
      return installPrdtHooksForProject(projectDir)
    } catch (e: any) {
      return { ok: false, installed: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('onboarding:setDone', (_event, projectDir: string): { ok: boolean; error?: string } => {
    try {
      const p = projectOnboardingPath(projectDir)
      let data: Partial<OnboardingRecord> = {}
      try { data = JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { /* new file */ }
      data.status = 'done'
      data.updated_at = new Date().toISOString()
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })
}
