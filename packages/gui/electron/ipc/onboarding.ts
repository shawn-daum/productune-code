import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { promisify } from 'util'
import { setUiLanguage } from '@productune/core'
import type { UiLanguage } from '@productune/core'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingCompleteOpts {
  engine: 'claude' | 'codex' | 'both'
  uiLanguage?: UiLanguage
}

interface OnboardingRecord {
  status: 'pending' | 'done'
  source: 'gui-create' | 'install-at' | 'legacy-fallback'
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// T-PATCH-199: hidden-spawn browser-OAuth login (osascript→Terminal removed).
// `claude auth login` / `codex login` are spawned with piped stdio (no TTY, no
// terminal window). The spawned CLI opens the system browser itself; we parse
// its stdout to (a) surface the OAuth URL as a "reopen browser" button, and
// (b) detect the "paste code" fallback prompt. The child lives for the whole
// browser handshake, so the IPC handler must NOT await it — it returns once the
// child is spawned, and progress is streamed via webContents.send.

/** The single in-flight login child process (claude or codex). Kept at module
 *  scope so submitLoginCode / cancelLogin can reach it across IPC calls. */
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
 *  matches both claude's "Paste code here if prompted >" and codex variants. */
function isPasteCodePrompt(clean: string): boolean {
  return /paste\s+(the\s+)?code|enter\s+(the\s+)?code|authorization\s+code|verification\s+code/i.test(clean)
}

/** Broadcast an onboarding login event to all renderer windows. */
function emitLogin(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Spawn a hidden login process (`claude auth login` / `codex login`) and wire
 *  its stdout/stderr to the renderer via webContents.send. Returns immediately;
 *  does NOT block on the browser OAuth handshake. */
function startHiddenLogin(engine: 'claude' | 'codex'): { ok: boolean; error?: string } {
  // Kill any prior in-flight login before starting a new one.
  if (loginChild && loginChild.exitCode === null) {
    try { loginChild.kill() } catch { /* ok */ }
  }
  loginChild = null

  const cmd = engine === 'claude' ? 'claude' : 'codex'
  const args = engine === 'claude' ? ['auth', 'login'] : ['login']

  let child: ChildProcess
  try {
    child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Inherit the user's PATH so the globally-installed CLI resolves.
      env: process.env,
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
  // codex (and some claude builds) may write the prompt/URL to stderr.
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
  const onboardingPath = path.join(projectDir, '.productune', 'onboarding.json')
  const record: OnboardingRecord = {
    status: 'pending',
    source,
    updated_at: new Date().toISOString(),
  }
  fs.writeFileSync(onboardingPath, JSON.stringify(record, null, 2), 'utf-8')
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('onboarding:checkClaude', async () => {
    let installed = false
    try {
      await execFileAsync('which', ['claude'])
      installed = true
    } catch { return { installed: false, authed: false } }

    // Fast path: credentials file
    const credPath = path.join(os.homedir(), '.claude', 'credentials.json')
    if (fs.existsSync(credPath)) return { installed: true, authed: true }

    // Slow path: ask CLI (5 s timeout)
    try {
      const out = await execFileAsync('claude', ['auth', 'status'], { timeout: 5000 }) as any
      const stdout: string = typeof out === 'string' ? out : (out?.stdout ?? '')
      const data = JSON.parse(stdout)
      return { installed: true, authed: data?.loggedIn === true }
    } catch {
      return { installed: true, authed: false }
    }
  })

  ipcMain.handle('onboarding:checkCodex', async () => {
    let installed = false
    try {
      await execFileAsync('which', ['codex'])
      installed = true
    } catch { return { installed: false, authed: false } }

    // Auth file check
    const authPath = path.join(os.homedir(), '.codex', 'auth.json')
    return { installed: true, authed: fs.existsSync(authPath) }
  })

  // T-PATCH-199: hidden-spawn browser-OAuth login. Returns once the child is
  // spawned (non-blocking); progress streams via onboarding:login-* events.
  ipcMain.handle('onboarding:claudeLogin', async () => startHiddenLogin('claude'))

  ipcMain.handle('onboarding:codexLogin', async () => startHiddenLogin('codex'))

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
      const engineVal = opts.engine === 'both' ? 'claude' : opts.engine
      let envContent = `MY_PO_ENGINE=${engineVal}\n`
      envContent += `PRODUCTUNE_REPO=${coreDir}\n`
      envContent += `created_at=${new Date().toISOString()}\n`
      fs.writeFileSync(envPath, envContent, { mode: 0o600 })

      // 2. Symlink agents/*.md → ~/.claude/agents/
      const variantDir = path.join(coreDir, 'agents', 'variants', 'keeper')
      const baseAgentsDir = path.join(coreDir, 'agents')

      // Base agents (pdt-po.md doesn't have variants)
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
      const p = path.join(projectDir, '.productune', 'onboarding.json')
      const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<OnboardingRecord>
      return data.status ?? null
    } catch {
      return null
    }
  })

  ipcMain.handle('onboarding:setDone', (_event, projectDir: string): { ok: boolean; error?: string } => {
    try {
      const p = path.join(projectDir, '.productune', 'onboarding.json')
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
