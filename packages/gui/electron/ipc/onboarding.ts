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

// ── Claude hooks install (T-PATCH-246 legacy / T-289 adapter A6 prdt) ──────────
//
// T-PATCH-246: install productune claude hooks + statusLine into
// ~/.claude/settings.json from the GUI onboarding path. Ports the idempotent
// merge from scripts/install.sh (merge_claude_settings_hooks +
// merge_claude_settings_statusline) so a dmg-only user (who never runs
// install.sh in a terminal) still gets the deterministic enforcement hooks
// (frontmatter-lint, po-state shape guards, doctrine-guard, phase-gate, …) that
// gate the GUI-spawned PO's own tool calls. Commands point at the BUNDLED core
// (coreDir/scripts/hooks/*.sh), so they resolve under the packaged app.
// Idempotent: existing productune entries (by path-prefix OR known basename) are
// stripped before re-adding; non-productune user hooks are preserved.
//
// T-289 (adapter A6): a SECOND, coexisting branch installs the prdt hook 3종
// (prdt-session-start / prdt-post-compact / prdt-post-dispatch) + statusline-prdt.sh
// instead, for prdt-kind projects (T-284 project-paths.ts detectProjectKind).
// The legacy branch above is byte-for-byte unchanged — installClaudeHooks defaults
// to it whenever no projectDir is passed (the current onboarding:complete IPC has
// no project context yet, so its call site is untouched). `homeDir` is injectable
// (defaults to os.homedir()) purely so tests can exercise both branches against a
// throwaway fixture HOME instead of the developer's real ~/.claude / ~/.prdt.

const PDT_BASENAMES = [
  'post-edit-format.sh', 'post-compact-doctrine.sh', 'stop-verify.sh', 'post-delegate-state-write.sh',
  'pre-delegate-task-check.sh', 'pre-delegate-ctx-lang.sh', 'pre-chunking-warn.sh', 'post-bash-strip-cost.sh',
  'pre-frontmatter-lint.sh', 'post-ticket-status-verify.sh', 'pre-git-posture.sh', 'session-start-doctrine.sh',
  'pre-doctrine-guard.sh', 'pre-phase-gate-guard.sh', 'prompt-gate-inject.sh', 'session-start-po-state-migrate.sh',
  'pre-po-state-shape-guard.sh', 'post-po-state-shape-guard.sh',
] as const

/** The 3 prdt discipline hooks (packages/core/scripts/prdt-install.sh §4, SoT). */
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

function installLegacyHooks(coreDir: string, settingsPath: string): void {
  const settings = readSettings(settingsPath)

  const hooksDir = path.join(coreDir, 'scripts', 'hooks')
  const h = (name: string) => path.join(hooksDir, name)
  const statusline = path.join(coreDir, 'scripts', 'statusline-productune.sh')

  const dirPrefix = hooksDir.endsWith(path.sep) ? hooksDir : hooksDir + path.sep
  const isPdt = (cmd: unknown): boolean =>
    typeof cmd === 'string' && (cmd.startsWith(dirPrefix) || PDT_BASENAMES.some(b => cmd.endsWith('/scripts/hooks/' + b)))
  const stripPdt = (arr: any): any[] =>
    (Array.isArray(arr) ? arr : []).filter((entry: any) =>
      !((Array.isArray(entry?.hooks) ? entry.hooks : []).some((hk: any) => isPdt(hk?.command))))
  const cmd = (c: string) => ({ type: 'command', command: c })

  const H = (settings.hooks && typeof settings.hooks === 'object') ? settings.hooks : {}
  H.PreToolUse = [...stripPdt(H.PreToolUse),
    { matcher: 'Write|Edit|Bash', hooks: [cmd(h('pre-doctrine-guard.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('pre-delegate-task-check.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('pre-delegate-ctx-lang.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('pre-chunking-warn.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('pre-git-posture.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('pre-phase-gate-guard.sh'))] },
    { matcher: 'Write|Edit|Bash', hooks: [cmd(h('pre-frontmatter-lint.sh'))] },
    { matcher: 'Write|Edit|Bash', hooks: [cmd(h('pre-po-state-shape-guard.sh'))] },
  ]
  H.PostToolUse = [...stripPdt(H.PostToolUse),
    { matcher: 'Write|Edit', hooks: [cmd(h('post-edit-format.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('post-delegate-state-write.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('post-bash-strip-cost.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('post-ticket-status-verify.sh'))] },
    { matcher: 'Bash', hooks: [cmd(h('post-po-state-shape-guard.sh'))] },
  ]
  H.PostCompact = [...stripPdt(H.PostCompact), { hooks: [cmd(h('post-compact-doctrine.sh'))] }]
  H.Stop = [...stripPdt(H.Stop), { matcher: 'pdt-developer', hooks: [cmd(h('stop-verify.sh'))] }]
  H.SessionStart = [...stripPdt(H.SessionStart),
    { matcher: 'startup|resume', hooks: [cmd(h('session-start-doctrine.sh'))] },
    { matcher: 'startup|resume', hooks: [cmd(h('session-start-po-state-migrate.sh'))] },
  ]
  H.UserPromptSubmit = [...stripPdt(H.UserPromptSubmit), { hooks: [cmd(h('prompt-gate-inject.sh'))] }]

  settings.hooks = H
  settings.statusLine = { type: 'command', command: statusline }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

/**
 * prdt branch (T-289): install exactly the 3 discipline hooks + statusline-prdt.sh,
 * producing the SAME settings.json registration prdt-install.sh §4/§6 writes —
 * same `~/.prdt` mirror paths, same matchers, same quoted-command form — so GUI
 * and CLI installs can never diverge or double-register: either one re-run strips
 * its own entries (basename match ⊇ the CLI's path-prefix strip) and re-adds
 * identical values. Coexists with legacy pdt-* entries — only prdt-basename hooks
 * are stripped/replaced.
 *
 * Commands point at the `~/.prdt/hooks/` MIRROR, not the bundled coreDir: the prdt
 * hook scripts are mirrored home by prdt-install.sh (v1 repo prdt-install.sh
 * 24-25행, the SoT for this shape) and the legacy GUI bundle does not carry them.
 * If the mirror is absent (prdt never installed on this machine), registration is
 * SKIPPED with a warn instead of writing hook entries that point at nonexistent
 * scripts — a prdt project can't spawn its PO without `~/.prdt/prdt.env` anyway
 * (po-runner canSpawnClaude), so prdt-install.sh runs first either way.
 */
function installPrdtHooks(settingsPath: string, homeDir: string): void {
  const prdtHome = path.join(homeDir, '.prdt')
  const hooksDir = path.join(prdtHome, 'hooks')
  const missing = PRDT_HOOK_BASENAMES.filter(b => !fs.existsSync(path.join(hooksDir, b)))
  if (missing.length > 0) {
    console.warn(`[onboarding] prdt hook mirror incomplete (${missing.join(', ')} not in ${hooksDir}) — run prdt-install.sh first; skipping hook registration`)
    return
  }

  const settings = readSettings(settingsPath)

  // Quoted (mirrors prdt-install.sh's jq concat) so the registered command
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
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

/**
 * Install claude hooks + statusLine for the current onboarding path. `projectDir`
 * is optional and, when given, decides the branch via A1's detectProjectKind
 * (never re-implemented ad hoc here) — 'prdt' → installPrdtHooks, else →
 * installLegacyHooks. Omitted `projectDir` (the current onboarding:complete IPC
 * call site — no project is selected yet at that point) defaults to legacy, so
 * existing behavior is byte-for-byte unchanged. `homeDir` is test-only.
 */
export function installClaudeHooks(coreDir: string, projectDir?: string, homeDir: string = os.homedir()): void {
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  const kind: ProjectKind = projectDir ? detectProjectKind(projectDir) : 'productune'
  if (kind === 'prdt') installPrdtHooks(settingsPath, homeDir)
  else installLegacyHooks(coreDir, settingsPath)
}

// ── prdt hook install status / on-demand install (T-305) ──────────────────────
//
// A6 (T-289) built installClaudeHooks's prdt branch but nothing ever called it
// for a real project open — the global onboarding wizard (onboarding:complete)
// runs before a project is picked, so it always takes the legacy branch. T-305
// gives the renderer a way to (a) read whether THIS machine already has the
// prdt hooks registered, distinguishing "not installed" from "can't be
// installed yet" (mirror missing → prdt-install.sh never ran here), and
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
  /** ~/.prdt/hooks/{3 hooks} all present — prdt-install.sh has run on this machine. */
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
 * no-ops here too, via installPrdtHooks's own warn-skip). `homeDir` is test-only.
 */
export function installPrdtHooksForProject(
  coreDir: string,
  projectDir: string,
  homeDir: string = os.homedir(),
): { ok: boolean; installed: boolean } {
  installClaudeHooks(coreDir, projectDir, homeDir)
  return { ok: true, installed: checkPrdtHooksStatus(homeDir).installed }
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
      const home = os.homedir()
      const productuneDir = path.join(home, '.productune')
      const claudeAgentsDir = path.join(home, '.claude', 'agents')

      // Resolve packages/core/ from packages/gui/ (app.getAppPath())
      const coreDir = path.join(app.getAppPath(), '..', 'core')

      fs.mkdirSync(productuneDir, { recursive: true })
      fs.mkdirSync(claudeAgentsDir, { recursive: true })

      // 1. Write productune.env (mode 0600)
      const envPath = path.join(productuneDir, 'productune.env')
      let envContent = `MY_PO_ENGINE=${opts.engine}\n`
      envContent += `PRODUCTUNE_REPO=${coreDir}\n`
      envContent += `created_at=${new Date().toISOString()}\n`
      fs.writeFileSync(envPath, envContent, { mode: 0o600 })

      // 2. Symlink agents/*.md → ~/.claude/agents/
      //
      // T-285 (adapter A2): this loop lists `agents/*.md` by directory, not by a
      // hardcoded `pdt-*` name list — so `agents/prdt-{po,designer,developer,qa}.md`
      // (added alongside the legacy `pdt-*.md` specs, coexistence not replacement)
      // are picked up automatically. No special-casing needed here; keep new
      // persona spec files name-agnostic to preserve this.
      const variantDir = path.join(coreDir, 'agents', 'variants', 'keeper')
      const baseAgentsDir = path.join(coreDir, 'agents')

      // Base agents (pdt-po.md / prdt-po.md don't have variants)
      const baseFiles = fs.readdirSync(baseAgentsDir).filter(f => f.endsWith('.md') && !fs.statSync(path.join(baseAgentsDir, f)).isDirectory())
      for (const file of baseFiles) {
        const src = path.join(baseAgentsDir, file)
        const dest = path.join(claudeAgentsDir, file)
        try { fs.unlinkSync(dest) } catch { /* ok if not exists */ }
        fs.symlinkSync(src, dest)
      }

      // Apply variant overrides (pdt-designer.md, pdt-developer.md, pdt-qa.md)
      if (fs.existsSync(variantDir)) {
        const variantFiles = fs.readdirSync(variantDir).filter(f => f.endsWith('.md'))
        for (const file of variantFiles) {
          const src = path.join(variantDir, file)
          const dest = path.join(claudeAgentsDir, file)
          try { fs.unlinkSync(dest) } catch { /* ok */ }
          fs.symlinkSync(src, dest)
        }
      }

      // pdt-wiki-keeper was abolished in the doctrine redesign (T-017). Clean up
      // any stale symlink left by a pre-redesign install so the persona no longer
      // surfaces in ~/.claude/agents/.
      try { fs.unlinkSync(path.join(claudeAgentsDir, 'pdt-wiki-keeper.md')) } catch { /* ok if absent */ }

      // 3. Copy po-instructions.md → ~/.productune/
      const poSrc = path.join(coreDir, 'po', 'po-instructions.md')
      if (fs.existsSync(poSrc)) {
        fs.copyFileSync(poSrc, path.join(productuneDir, 'po-instructions.md'))
      }

      // 4. Tier-2 long-term memory (~/.productune/<persona>/habit.md) is installed by
      //    the doctrine install path, not GUI-seeded. The legacy po-memory.md seed was
      //    retired in the 4-tier redesign (T-PATCH-009 #11) — do not re-create it here.

      // 5. Pre-warm Playwright MCP cache (used by QA's auto smoke gate).
      //    Best-effort: triggers `npx` to download @playwright/mcp now so the
      //    first QA invocation isn't slow. Does NOT block onboarding completion
      //    on failure — agent's mcpServers block will retry lazily.
      await prewarmPlaywrightMcp()

      // 5b. (T-PATCH-246) Install productune claude hooks + statusLine into
      //     ~/.claude/settings.json so the GUI-spawned PO gets the deterministic
      //     enforcement layer without requiring a terminal install.sh run.
      //     Best-effort: a settings.json hiccup should not fail onboarding, but
      //     this is the core enforcement fix so it normally succeeds.
      try {
        installClaudeHooks(coreDir)
      } catch (e: any) {
        console.error('[onboarding] installClaudeHooks failed (non-fatal):', e?.message)
      }

      // 6. Save UI language selection to settings.json
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
      const coreDir = path.join(app.getAppPath(), '..', 'core')
      return installPrdtHooksForProject(coreDir, projectDir)
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
