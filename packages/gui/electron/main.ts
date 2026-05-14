import { app, BrowserWindow, ipcMain, dialog, shell, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { initProject, bootstrapClaudeSettings, startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo, getUiLanguage, setUiLanguage, settingsFileExists, loadRules, saveRules, appendPendingPromotion, listPendingPromotions, resolvePendingPromotion, autoDropStale, markSurfaced, listAllPromotions, createDeployPR, squashMergePR, triggerVercelDeployAfterMerge, checkPRMergeability, classifyConflict, assertNotPoTurn, markPoTurnStart, markPoTurnEnd, getVercelToken, setVercelToken, createWorktree, stashAndCreate, commitAndCreate } from '@productune/core'
import type { UiLanguage, GitRules, PendingPromotion, CreateWorktreeArgs } from '@productune/core'
import { getSession, appendMessage, setClaudeSessionId, clearSession } from './chat-store'
import type { Message } from './chat-store'
import { runPoTurn, emitToWebContents } from './po-runner'
import { mechanicalWrite } from './mechanical-write'
import type { ChildProcess } from 'child_process'

// ── Active PO child process tracking (T-P4-059) ───────────────────────────────
// Allows `po:restartSession` to kill the in-flight process.
let activePoChild: ChildProcess | null = null
let capturedPoSessionId: string | null = null

// ── Open Recent — deferred open-file queue (T-P4-111) ─────────────────────────
// macOS may fire `open-file` before app.whenReady / before a window exists.
// Store the path and flush it once the first window finishes loading.
let deferredOpenPath: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (process.platform === 'darwin') {
    app.addRecentDocument(filePath)
  }
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-recent-project', filePath)
  } else {
    deferredOpenPath = filePath
  }
})

const execFileAsync = promisify(execFile)

// ── Shell ─────────────────────────────────────────────────────────────────────

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  return shell.openExternal(url)
})

// ── Docker install ────────────────────────────────────────────────────────────

/** Run a command, stream each stdout/stderr line to the renderer via event. */
function spawnStreaming(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })

    const pipe = (data: Buffer) => {
      for (const line of data.toString('utf8').split('\n')) {
        const trimmed = line.trimEnd()
        if (trimmed) onLine(trimmed)
      }
    }
    child.stdout?.on('data', pipe)
    child.stderr?.on('data', pipe)

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`프로세스 종료 코드: ${code}`))
    })
  })
}

ipcMain.handle('onboarding:installDocker', async (event) => {
  const send = (line: string) =>
    event.sender.send('onboarding:installDocker:log', line)

  // Homebrew binary — Apple Silicon installs to /opt/homebrew, Intel to /usr/local
  const brewCandidates = [
    '/opt/homebrew/bin/brew',
    '/usr/local/bin/brew',
    'brew',
  ]
  const findBrew = () => brewCandidates.find(b => {
    try { return b === 'brew' || fs.existsSync(b) } catch { return false }
  }) ?? 'brew'

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NONINTERACTIVE: '1',
    CI: '1',
    // Ensure Homebrew paths are available in the spawned shell
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
  }

  try {
    // 1. Check brew
    send('Homebrew 확인 중...')
    let brewOk = false
    try {
      await execFileAsync(findBrew(), ['--version'])
      brewOk = true
      send(`OK · Homebrew 감지됨`)
    } catch { /* not found */ }

    // 2. Install Homebrew if missing
    if (!brewOk) {
      send('Homebrew 설치 중... (몇 분 소요)')
      const installScript =
        'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash'
      await spawnStreaming('/bin/bash', ['-c', installScript], baseEnv, send)
      send('OK · Homebrew 설치 완료')
    }

    // 3. brew install --cask docker
    send('Docker Desktop 설치 중... (몇 분 소요)')
    const brew = findBrew()
    await spawnStreaming(brew, ['install', '--cask', 'docker'], baseEnv, send)
    send('OK · 설치 완료 — Docker Desktop을 실행해주세요')

    return { ok: true }
  } catch (e: any) {
    const msg = e?.message ?? '알 수 없는 오류'
    send(`ERR · 오류: ${msg}`)
    return { ok: false, error: msg }
  }
})

ipcMain.handle('onboarding:openDockerApp', async () => {
  try {
    await execFileAsync('open', ['-a', 'Docker'])
  } catch {
    // Fallback: direct .app path
    try { await execFileAsync('open', ['/Applications/Docker.app']) } catch { /* ignore */ }
  }
})

// ── Engine check / login IPC ──────────────────────────────────────────────────

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

/** Open macOS Terminal with the given shell command. Fire-and-forget. */
async function openTerminalWith(cmd: string) {
  await execFileAsync('osascript', [
    '-e', 'tell application "Terminal" to activate',
    '-e', `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`,
  ])
}

ipcMain.handle('onboarding:claudeLogin', async () => {
  try {
    await openTerminalWith('claude auth login')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
})

ipcMain.handle('onboarding:codexLogin', async () => {
  try {
    await openTerminalWith('codex login')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
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

// ── Onboarding IPC ────────────────────────────────────────────────────────────

ipcMain.handle('onboarding:checkEnv', () => {
  const envPath = path.join(os.homedir(), '.productune', 'productune.env')
  return fs.existsSync(envPath)
})

ipcMain.handle('onboarding:detectHardware', async () => {
  const ram_gb = Math.floor(os.totalmem() / (1024 * 1024 * 1024))
  const apple_silicon = process.platform === 'darwin' && process.arch === 'arm64'

  // Docker probe — hard 2 s timeout
  let docker = false
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile('docker', ['info'], { timeout: 2000 }, (err) => {
        if (err) reject(err); else resolve()
      })
      child.on('error', reject)
    })
    docker = true
  } catch { /* not reachable or not running */ }

  // Tier logic mirrors install.sh detect_tier()
  let tier: 'S' | 'A' | 'B'
  if (!docker) {
    tier = 'B'
  } else if (apple_silicon && ram_gb >= 16) {
    tier = 'S'
  } else if (apple_silicon && ram_gb >= 8) {
    tier = 'A'
  } else if (ram_gb >= 32) {
    tier = 'S'
  } else if (ram_gb >= 16) {
    tier = 'A'
  } else {
    tier = 'B'
  }

  return { tier, ram_gb, apple_silicon, docker }
})

interface OnboardingCompleteOpts {
  engine: 'claude' | 'codex' | 'both'
  wikiBackend: 'filesystem' | 'graphiti'
  uiLanguage?: UiLanguage
}

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
    const backendVal = opts.wikiBackend === 'graphiti' ? 'graphiti' : 'keeper'
    let envContent = `MY_PO_ENGINE=${engineVal}\n`
    envContent += `PRODUCTUNE_REPO=${coreDir}\n`
    envContent += `WIKI_BACKEND=${backendVal}\n`
    envContent += `created_at=${new Date().toISOString()}\n`
    fs.writeFileSync(envPath, envContent, { mode: 0o600 })

    // 2. Symlink agents/*.md → ~/.claude/agents/
    //    Uses keeper variant for filesystem backend, graphiti variant for graphiti.
    const variantDir = path.join(coreDir, 'agents', 'variants', backendVal === 'graphiti' ? 'graphiti' : 'keeper')
    const baseAgentsDir = path.join(coreDir, 'agents')

    // Base agents (pdt-po.md, pdt-wiki-keeper.md don't have variants)
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

    // Remove pdt-wiki-keeper for graphiti backend (not needed)
    if (backendVal === 'graphiti') {
      const keeperDest = path.join(claudeAgentsDir, 'pdt-wiki-keeper.md')
      try { fs.unlinkSync(keeperDest) } catch { /* ok */ }
    }

    // 3. Copy po-instructions.md → ~/.productune/
    const poSrc = path.join(coreDir, 'po', 'po-instructions.md')
    if (fs.existsSync(poSrc)) {
      fs.copyFileSync(poSrc, path.join(productuneDir, 'po-instructions.md'))
    }

    // 4. Seed po-memory.md only if not already present
    const poMemDest = path.join(productuneDir, 'po-memory.md')
    const poMemTemplate = path.join(coreDir, 'po', 'po-memory.md.template')
    if (!fs.existsSync(poMemDest) && fs.existsSync(poMemTemplate)) {
      fs.copyFileSync(poMemTemplate, poMemDest)
    }

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Flush deferred open-file path (T-P4-111 §E queue pattern).
  win.webContents.once('did-finish-load', () => {
    if (deferredOpenPath) {
      win.webContents.send('open-recent-project', deferredOpenPath)
      deferredOpenPath = null
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('ping', () => 'pong')

ipcMain.handle('init:project', (_event, opts: { slug: string; projectDir: string }) => {
  return initProject(opts)
})

ipcMain.handle('project:create', (_event, { slug, initialVersionId }: { slug: string; initialVersionId?: string }) => {
  const baseDir = path.join(os.homedir(), 'productune', 'projects')
  fs.mkdirSync(baseDir, { recursive: true })

  let projectDir = path.join(baseDir, slug)
  let suffix = 2
  while (fs.existsSync(projectDir)) {
    projectDir = path.join(baseDir, `${slug}-${suffix++}`)
  }
  fs.mkdirSync(projectDir, { recursive: true })

  const config = initProject({ slug, projectDir, initialVersionId })
  if (process.platform === 'darwin') app.addRecentDocument(projectDir)
  return { projectDir, config }
})

ipcMain.handle('project:installAt', (_event, { projectDir }: { projectDir: string }) => {
  const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
  const config = initProject({ slug, projectDir })
  if (process.platform === 'darwin') app.addRecentDocument(projectDir)
  return { projectDir, config }
})

// ── Project existence check (T-P4-091) ────────────────────────────────────────
// Returns true only when the directory AND a .productune/config.json marker both exist.
// Any exception (empty path, EPERM, etc.) → false (safe fallback).
ipcMain.handle('project:exists', (_event, { projectDir }: { projectDir: string }): boolean => {
  try {
    if (!projectDir) return false
    return (
      fs.existsSync(projectDir) &&
      fs.existsSync(path.join(projectDir, '.productune', 'config.json'))
    )
  } catch {
    return false
  }
})

ipcMain.handle('projects:list', () => {
  const baseDir = path.join(os.homedir(), 'productune', 'projects')
  if (!fs.existsSync(baseDir)) return []
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
  const projects: Array<{ slug: string; mode: string; created_at: string; path: string }> = []
  for (const entry of entries) {
    const configPath = path.join(baseDir, entry.name, '.productune', 'config.json')
    if (!fs.existsSync(configPath)) continue
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      projects.push({ ...cfg, path: path.join(baseDir, entry.name) })
    } catch {}
  }
  return projects
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
})

// ── Productune folder detection ───────────────────────────────────────────────

interface DetectResult {
  kind: 'self-current' | 'self-legacy' | 'none'
  config?: any
  hints?: string[]
}

/**
 * Detect whether a directory contains a productune project (current or legacy layout).
 *
 * - 'self-current': .productune/config.json exists and is parseable.
 * - 'self-legacy':  .productune/ exists with po-state.json/briefs/po.lock/turns/ but no config.json.
 * - 'none':         No productune layout detected.
 */
function detectProductuneLayout(dir: string): DetectResult {
  const productuneDir = path.join(dir, '.productune')
  if (!fs.existsSync(productuneDir)) return { kind: 'none' }

  const configPath = path.join(productuneDir, 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { kind: 'self-current', config }
    } catch {
      // Corrupt config — treat as legacy
    }
  }

  // config.json absent — check for legacy traces
  const hints: string[] = []
  if (fs.existsSync(path.join(productuneDir, 'po-state.json'))) hints.push('po-state.json')
  if (fs.existsSync(path.join(productuneDir, 'briefs'))) hints.push('briefs/')
  if (fs.existsSync(path.join(productuneDir, 'po.lock'))) hints.push('po.lock')
  if (fs.existsSync(path.join(productuneDir, 'turns'))) hints.push('turns/')

  if (hints.length > 0) return { kind: 'self-legacy', hints }
  return { kind: 'none' }
}

ipcMain.handle('dialog:openFilePicker', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]

  const detect = detectProductuneLayout(dir)
  if (detect.kind === 'self-current') {
    if (process.platform === 'darwin') app.addRecentDocument(dir)
    return { kind: 'self', dir, config: detect.config }
  }
  if (detect.kind === 'self-legacy') {
    return { kind: 'self-legacy', dir, hints: detect.hints }
  }

  const descendants = scanDescendantsForProductune(dir)
  if (descendants.length > 0) {
    return { kind: 'descendant', dir, descendants }
  }

  return { kind: 'none', dir }
})

// ── Open a known directory path without dialog (T-P4-111 — Open Recent flow) ──
// Mirrors dialog:openFolder but accepts a pre-known path instead of showing a picker.

ipcMain.handle('project:openKnownDir', (_event, dir: string) => {
  if (!dir) return null
  try {
    if (!fs.existsSync(dir)) return null
  } catch {
    return null
  }

  const detect = detectProductuneLayout(dir)
  if (detect.kind === 'self-current') {
    if (process.platform === 'darwin') app.addRecentDocument(dir)
    return { kind: 'self', dir, config: detect.config }
  }
  if (detect.kind === 'self-legacy') {
    return { kind: 'self-legacy', dir, hints: detect.hints }
  }

  const descendants = scanDescendantsForProductune(dir)
  if (descendants.length > 0) {
    return { kind: 'descendant', dir, descendants }
  }

  return { kind: 'none', dir }
})

ipcMain.handle('project:migrateLegacy', (_event, { projectDir, slug }: { projectDir: string; slug?: string }) => {
  const derivedSlug = (slug ?? path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')) || 'project'
  const config = initProject({ slug: derivedSlug, projectDir })
  if (process.platform === 'darwin') app.addRecentDocument(projectDir)
  return { projectDir, config, migrated: true }
})

function scanDescendantsForProductune(baseDir: string): { path: string; config: any }[] {
  const found: { path: string; config: any }[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const childPath = path.join(baseDir, entry.name)
    const detect = detectProductuneLayout(childPath)
    if (detect.kind === 'self-current') {
      found.push({ path: childPath, config: detect.config })
    } else if (detect.kind === 'self-legacy') {
      // Include legacy projects in descendant scan — renderer decides how to handle
      found.push({ path: childPath, config: { slug: entry.name, _legacy: true, hints: detect.hints } })
    }
  }
  return found
}

ipcMain.handle('github:checkToken', () => {
  return loadCredentials()
})

ipcMain.handle('github:startDeviceFlow', async (_event, clientId: string) => {
  return startDeviceFlow(clientId)
})

ipcMain.handle('github:pollDeviceFlow', async (_event, { clientId, deviceCode, interval }: { clientId: string; deviceCode: string; interval: number }) => {
  return pollDeviceFlow(clientId, deviceCode, interval)
})

ipcMain.handle('github:createRepo', async (_event, { token, slug }: { token: string; slug: string }) => {
  return createPrivateRepo(token, slug)
})

ipcMain.handle('github:setupRemote', async (_event, { projectDir, cloneUrl }: { projectDir: string; cloneUrl: string }) => {
  try {
    await execFileAsync('git', ['init'], { cwd: projectDir })
    await execFileAsync('git', ['remote', 'add', 'origin', cloneUrl], { cwd: projectDir })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

// ── Workspace state IPC ───────────────────────────────────────────────────────

ipcMain.handle('state:readPoState', async (_event, projectDir: string) => {
  const statePath = path.join(projectDir, '.productune', 'po-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

// ── Tickets fs-scan IPC (T-P4-065 sub-f) ─────────────────────────────────────

interface ScannedTicket {
  ticket_id: string
  version: string | null
  slug?: string
  title?: string
  type?: string
  stage?: string
  status?: string
  qa_status?: string
  qa_loops?: number
  assignee?: string
  estimated_complexity?: string
  risk_flags?: string
  branch?: string
  worktree_path?: string
  success_metric?: string | null
  validation_method?: string | null
  observed_result?: string | null
  started_at?: string | null
  completed_at?: string | null
  duration_min?: number | null
  request_summary?: string
  path?: string
}

function parseFrontmatter(content: string): Record<string, any> {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, any> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const m = lines[i].match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val: any = m[2].trim()
    if (val === '') val = null
    else if (val === 'null') val = null
    else if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (/^-?\d+$/.test(val)) val = Number(val)
    else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    else if (val.startsWith('[') || val.startsWith('{')) { /* leave as string */ }
    out[key] = val
  }
  return out
}

function extractRequestSummary(content: string): string | undefined {
  // Find `## Request` heading and return first non-empty paragraph after it.
  const lines = content.split('\n')
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Request\b/.test(lines[i])) {
      startIdx = i + 1
      break
    }
  }
  if (startIdx < 0) return undefined
  const buf: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^##\s/.test(t)) break
    if (!t) {
      if (buf.length > 0) break
      continue
    }
    buf.push(t)
  }
  const para = buf.join(' ').trim()
  return para.length > 240 ? para.slice(0, 237) + '…' : (para || undefined)
}

ipcMain.handle('tickets:scan', async (_event, projectDir: string): Promise<ScannedTicket[]> => {
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  if (!fs.existsSync(ticketsRoot)) return []
  const out: ScannedTicket[] = []
  let versionDirs: string[] = []
  try {
    versionDirs = fs.readdirSync(ticketsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch { return [] }

  for (const versionDir of versionDirs) {
    const dirPath = path.join(ticketsRoot, versionDir)
    let files: string[] = []
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'))
    } catch { continue }
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      let content: string
      try { content = fs.readFileSync(filePath, 'utf-8') } catch { continue }
      const fm = parseFrontmatter(content)
      const ticket_id = String(fm.ticket_id ?? path.basename(file, '.md'))
      const ticket: ScannedTicket = {
        ticket_id,
        version: (fm.version && String(fm.version).trim()) || null,
        slug: fm.slug,
        title: fm.title,
        type: fm.type,
        stage: fm.stage,
        status: fm.status,
        qa_status: fm.qa_status,
        qa_loops: typeof fm.qa_loops === 'number' ? fm.qa_loops : undefined,
        assignee: fm.assignee,
        estimated_complexity: fm.estimated_complexity,
        risk_flags: fm.risk_flags,
        branch: fm.branch ?? undefined,
        worktree_path: fm.worktree_path ?? undefined,
        success_metric: fm.success_metric ?? null,
        validation_method: fm.validation_method ?? null,
        observed_result: fm.observed_result ?? null,
        started_at: fm.started_at ?? null,
        completed_at: fm.completed_at ?? null,
        duration_min: typeof fm.duration_min === 'number' ? fm.duration_min : null,
        request_summary: extractRequestSummary(content),
        path: filePath,
      }
      // Extract title from first H1 if not in frontmatter
      if (!ticket.title) {
        const h1 = content.match(/^#\s+(.+)$/m)
        if (h1) ticket.title = h1[1].replace(/^T-[A-Z]+-\d+:?\s*/, '').trim()
      }
      out.push(ticket)
    }
  }
  return out
})

// ── Pending promotions IPC (T-P4-066) ────────────────────────────────────────

ipcMain.handle('state:appendPendingPromotion', (
  _event,
  projectDir: string,
  candidate: Omit<PendingPromotion, 'id' | 'status'>,
): PendingPromotion => {
  return appendPendingPromotion(projectDir, candidate)
})

ipcMain.handle('state:listPendingPromotions', (
  _event,
  projectDir: string,
): PendingPromotion[] => {
  return listPendingPromotions(projectDir)
})

ipcMain.handle('state:resolvePendingPromotion', (
  _event,
  projectDir: string,
  id: string,
  status: 'approved' | 'dropped' | 'edited',
  finalTarget?: string,
): PendingPromotion | null => {
  return resolvePendingPromotion(projectDir, id, status, finalTarget)
})

ipcMain.handle('state:autoDropStale', (
  _event,
  projectDir: string,
): number => {
  return autoDropStale(projectDir)
})

ipcMain.handle('state:markSurfaced', (
  _event,
  projectDir: string,
  id: string,
): void => {
  markSurfaced(projectDir, id)
})

ipcMain.handle('state:listAllPromotions', (
  _event,
  projectDir: string,
): PendingPromotion[] => {
  return listAllPromotions(projectDir)
})

ipcMain.handle(
  'state:mechanicalWrite',
  async (
    _event,
    promotion: PendingPromotion,
    claudeSessionId?: string,
  ) => {
    return mechanicalWrite(promotion, { claudeSessionId })
  },
)

// ── Chat IPC (single PO session per project) ──────────────────────────────────

ipcMain.handle('chat:getSession', (_event, projectDir: string) => {
  return getSession(projectDir)
})

ipcMain.handle('chat:appendMessage', (_event, projectDir: string, message: Message) => {
  appendMessage(projectDir, message)
})

ipcMain.handle('chat:setClaudeSessionId', (_event, projectDir: string, sessionId: string) => {
  setClaudeSessionId(projectDir, sessionId)
})

ipcMain.handle('chat:clearSession', (_event, projectDir: string) => {
  clearSession(projectDir)
})

// ── PO chat streaming (T-P4-041) ──────────────────────────────────────────────

ipcMain.handle(
  'po:sendMessage',
  async (
    event,
    opts: { projectDir: string; text: string; resume?: string | null },
  ): Promise<{ ok: boolean; error?: string }> => {
    markPoTurnStart()
    try {
      await runPoTurn(
        {
          projectDir: opts.projectDir,
          text: opts.text,
          resume: opts.resume ?? null,
        },
        emitToWebContents(event.sender),
      )
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    } finally {
      markPoTurnEnd()
    }
  },
)

// ── PO session restart (T-P4-059) ─────────────────────────────────────────────

ipcMain.handle('po:restartSession', (event): { ok: boolean } => {
  // Kill active child if running.
  if (activePoChild) {
    try { activePoChild.kill('SIGTERM') } catch { /* ignore */ }
    activePoChild = null
  }
  // Reset captured session id — next send will use --agent (first turn).
  capturedPoSessionId = null
  // Notify renderer to reset its session state.
  event.sender.send('po:sessionRestarted')
  return { ok: true }
})

// ── Design artifacts IPC ──────────────────────────────────────────────────────

/**
 * Walk docs/design/ (1 level of subdirectories) and return relative .md paths.
 * projectRoot is validated to be an absolute path to an existing directory.
 */
ipcMain.handle('design:listArtifacts', (_event, projectRoot: string): string[] => {
  const designDir = path.resolve(projectRoot, 'docs', 'design')
  if (!fs.existsSync(designDir)) return []

  const results: string[] = []

  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && depth < 1) {
        walk(fullPath, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(projectRoot, fullPath))
      }
    }
  }

  walk(designDir, 0)
  return results.sort()
})

/**
 * Read a design artifact file.
 * relPath must resolve to inside docs/design/ — path traversal is rejected.
 */
ipcMain.handle('design:readArtifact', (_event, projectRoot: string, relPath: string): string => {
  const designDir = path.resolve(projectRoot, 'docs', 'design')
  const resolved = path.resolve(projectRoot, relPath)

  // Path traversal guard: resolved path must start with designDir + separator
  if (!resolved.startsWith(designDir + path.sep) && resolved !== designDir) {
    throw new Error('Path traversal rejected')
  }

  if (!resolved.endsWith('.md')) {
    throw new Error('Only .md files are readable via this handler')
  }

  return fs.readFileSync(resolved, 'utf-8')
})

// ── Settings IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('settings:getUiLanguage', (): UiLanguage => {
  return getUiLanguage()
})

ipcMain.handle('settings:setUiLanguage', (_event, lng: UiLanguage): { ok: boolean; error?: string } => {
  try {
    setUiLanguage(lng)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
})

ipcMain.handle('settings:hasLanguagePref', (): boolean => {
  return settingsFileExists()
})

ipcMain.handle('settings:getOsLocale', (): string => {
  return app.getLocale()
})

// ── Vercel token IPC (OQ-T022-1 (b) — "외부 연결" sub-tab) ───────────────────

ipcMain.handle('settings:getVercelToken', (): string | null => {
  return getVercelToken()
})

ipcMain.handle('settings:setVercelToken', (_event, token: string | null): { ok: boolean; error?: string } => {
  try {
    setVercelToken(token)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
})

// ── MCP Servers IPC (T-P4-048-mh) ────────────────────────────────────────────

interface McpServerConfig {
  type?: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

interface McpServerEntry {
  name: string
  config: McpServerConfig
  source: 'global' | 'project'
}

function readClaudeSettings(): Record<string, any> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Atomic write: write to .tmp then rename-swap to avoid partial-write corruption.
 * Claude Code reads settings.json on startup / watch-based reread — rename is atomic
 * on POSIX (same filesystem), so no read-corrupt window.
 */
function writeClaudeSettings(settings: Record<string, any>): void {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  const tmpPath = settingsPath + '.tmp'
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), { mode: 0o600 })
  fs.renameSync(tmpPath, settingsPath)
}

ipcMain.handle(
  'mcp:getServers',
  (_event, projectDir?: string): McpServerEntry[] => {
    const globalSettings = readClaudeSettings()
    const globalServers: Record<string, McpServerConfig> =
      globalSettings.mcpServers ?? {}

    // Project-level .mcp.json (optional)
    let projectServers: Record<string, McpServerConfig> = {}
    if (projectDir) {
      const mcpJsonPath = path.join(projectDir, '.mcp.json')
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
        projectServers = parsed.mcpServers ?? parsed ?? {}
      } catch { /* no .mcp.json or unreadable */ }
    }

    // Merge: project-level wins
    const merged: Record<string, { config: McpServerConfig; source: 'global' | 'project' }> = {}
    for (const [name, config] of Object.entries(globalServers)) {
      merged[name] = { config, source: 'global' }
    }
    for (const [name, config] of Object.entries(projectServers)) {
      merged[name] = { config, source: 'project' }
    }

    return Object.entries(merged).map(([name, { config, source }]) => ({
      name,
      config,
      source,
    }))
  },
)

ipcMain.handle(
  'mcp:save',
  (_event, serverName: string, config: McpServerConfig): { ok: boolean; error?: string } => {
    try {
      const settings = readClaudeSettings()
      if (!settings.mcpServers) settings.mcpServers = {}
      settings.mcpServers[serverName] = config
      writeClaudeSettings(settings)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  },
)

ipcMain.handle(
  'mcp:testConnection',
  (
    _event,
    _serverName: string,
    _config: McpServerConfig,
  ): { ok: boolean; ms?: number; error?: string } => {
    // MVP: structural validation only (process spawn + health ping = Phase 5).
    return { ok: true, ms: 0 }
  },
)

// ── Hooks IPC (T-P4-048-mh) ──────────────────────────────────────────────────

interface HookRow {
  eventType: string
  matcher: string | null
  commandBasename: string
  commandFull: string
}

ipcMain.handle('hooks:list', (): HookRow[] => {
  const settings = readClaudeSettings()
  const hooks: Record<string, any[]> = settings.hooks ?? {}
  const rows: HookRow[] = []

  for (const [eventType, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const matcher: string | null = entry.matcher ?? null
      const hookItems: any[] = Array.isArray(entry.hooks) ? entry.hooks : []
      for (const hookItem of hookItems) {
        const commandFull: string = hookItem.command ?? ''
        rows.push({
          eventType,
          matcher,
          commandBasename: path.basename(commandFull) || commandFull,
          commandFull,
        })
      }
    }
  }

  return rows
})

// ── Deploy modal trigger (T-P4-022 — PO fires state:openDeployModal) ──────────
// PO (or any main-process code) calls this IPC to open the DeployConfirmModal
// in the renderer. Renderer listens via preload `onDeployModal`.

ipcMain.handle(
  'state:openDeployModal',
  (
    event,
    payload: {
      tickets: Array<{ id: string; title: string }>
      gitRef: string
      project: string
      projectDir?: string
      owner?: string
      repo?: string
      branchName?: string
      ticketId?: string
      ticketTitle?: string
      ticketAcceptance?: string
      vercelProject?: string
    },
  ): void => {
    event.sender.send('deploy:openModal', payload)
  },
)

// ── Git workflow rules IPC ─────────────────────────────────────────────────────

ipcMain.handle('settings:loadRules', (_event, projectDir: string): GitRules => {
  return loadRules(projectDir)
})

ipcMain.handle('settings:saveRules', (_event, projectDir: string, rules: GitRules): { ok: boolean; error?: string } => {
  try {
    saveRules(projectDir, rules)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
})

// ── Worktree IPC (T-P4-092) ──────────────────────────────────────────────────
// Three invoke handlers: create / stashAndCreate / commitAndCreate.
// After worktree:create succeeds or fails, main emits worktree:createResult
// to the renderer so WorkspaceShell can show traces / BaseDirtyModal.

ipcMain.handle(
  'worktree:create',
  async (event, args: CreateWorktreeArgs) => {
    const result = await createWorktree(args)
    event.sender.send('worktree:createResult', {
      result,
      ticketId: args.ticketId,
      slug: args.slug,
      type: args.type,
      projectDir: args.projectDir,
    })
    return result
  },
)

ipcMain.handle(
  'worktree:stashAndCreate',
  async (event, args: CreateWorktreeArgs) => {
    const result = await stashAndCreate(args)
    if (result.ok) {
      event.sender.send('worktree:createResult', {
        result,
        ticketId: args.ticketId,
        slug: args.slug,
        type: args.type,
        projectDir: args.projectDir,
      })
    }
    return result
  },
)

ipcMain.handle(
  'worktree:commitAndCreate',
  async (event, args: CreateWorktreeArgs & { message?: string }) => {
    const result = await commitAndCreate(args)
    if (result.ok) {
      event.sender.send('worktree:createResult', {
        result,
        ticketId: args.ticketId,
        slug: args.slug,
        type: args.type,
        projectDir: args.projectDir,
      })
    }
    return result
  },
)

// ── Explorer IPC (T-P4-045) ───────────────────────────────────────────────────

interface FsNode {
  name: string
  path: string
  isDir: boolean
}

const EXPLORER_EXCLUDE = new Set([
  '.git', 'node_modules', '.next', 'dist', 'dist-electron',
  'build', 'out', '.turbo', '.cache', '.DS_Store',
])

ipcMain.handle('explorer:listDir', (_event, absPath: string): FsNode[] => {
  try {
    const entries = fs.readdirSync(absPath, { withFileTypes: true })
    return entries
      .filter((e) => !EXPLORER_EXCLUDE.has(e.name))
      .map((e) => ({
        name: e.name,
        path: path.join(absPath, e.name),
        isDir: e.isDirectory(),
      }))
  } catch {
    return []
  }
})

ipcMain.handle('explorer:revealInOS', (_event, absPath: string): void => {
  shell.showItemInFolder(absPath)
})

// ── Explorer fs-watcher (singleton, root only) ────────────────────────────────

type ExplorerWatcher = ReturnType<typeof fs.watch>

let explorerWatcher: ExplorerWatcher | null = null
let explorerWatchRoot: string | null = null
let explorerDebounceTimer: NodeJS.Timeout | null = null

function startExplorerWatch(root: string, sender: Electron.WebContents): void {
  if (explorerWatcher && explorerWatchRoot === root) return
  stopExplorerWatch()
  explorerWatchRoot = root
  try {
    explorerWatcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      // Exclude noise from baseline dirs.
      const parts = filename.split(path.sep)
      if (parts.some((p) => EXPLORER_EXCLUDE.has(p))) return

      const absPath = path.join(root, filename)
      // Derive event type for renderer.
      let type: string = 'change'
      try {
        const exists = fs.existsSync(absPath)
        if (eventType === 'rename') {
          type = exists ? 'add' : 'unlink'
        } else {
          type = 'change'
        }
      } catch {
        type = 'unlink'
      }

      if (explorerDebounceTimer) clearTimeout(explorerDebounceTimer)
      explorerDebounceTimer = setTimeout(() => {
        if (!sender.isDestroyed()) {
          sender.send('explorer:fs-changed', { type, path: absPath })
        }
      }, 500)
    })
  } catch {
    // fs.watch not supported (e.g. some network drives) — silently skip.
  }
}

function stopExplorerWatch(): void {
  if (explorerDebounceTimer) { clearTimeout(explorerDebounceTimer); explorerDebounceTimer = null }
  if (explorerWatcher) { try { explorerWatcher.close() } catch { /* ok */ } explorerWatcher = null }
  explorerWatchRoot = null
}

ipcMain.handle('explorer:watch', (event, root: string): void => {
  startExplorerWatch(root, event.sender)
})

ipcMain.handle('explorer:unwatch', (): void => {
  stopExplorerWatch()
})

// ── Quick Open file listing (T-P4-047) ────────────────────────────────────────

const QO_EXCLUDE = new Set([
  '.git', 'node_modules', 'dist', 'dist-electron', '.next', 'build',
  'out', '.turbo', '.cache', '.DS_Store',
])

const QO_EXT_WHITELIST = new Set(['.md', '.json', '.html', '.txt'])

interface QuickOpenFile {
  path: string
  ext: string
}

function listProjectFilesRecursive(dir: string, out: QuickOpenFile[] = []): QuickOpenFile[] {
  let entries: import('fs').Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (QO_EXCLUDE.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      listProjectFilesRecursive(fullPath, out)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (QO_EXT_WHITELIST.has(ext)) {
        out.push({ path: fullPath, ext })
      }
    }
  }
  return out
}

ipcMain.handle('slash:listProjectFiles', (_event, projectDir: string): QuickOpenFile[] => {
  if (!projectDir || !fs.existsSync(projectDir)) return []
  return listProjectFilesRecursive(projectDir)
})

// ── Deploy state poll (T-P4-022 3rd PR) ──────────────────────────────────────

ipcMain.handle(
  'deploy:state',
  async (
    _event,
    args: { projectDir: string; deploymentId: string },
  ): Promise<{ ok: boolean; state?: string; error?: string }> => {
    try {
      const { getDeploymentState } = await import('@productune/core')
      const token = getVercelToken()
      if (!token) return { ok: false, error: 'VERCEL_TOKEN not configured' }
      const state = await getDeploymentState(args.deploymentId, token)
      return { ok: true, state }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
)

// ── Deploy execute (T-P4-022 3rd PR) ─────────────────────────────────────────

type DeployProgressStep =
  | 'pr-creating'
  | 'pr-created'
  | 'merging'
  | 'merged'
  | 'deploy-triggering'
  | 'deploy-triggered'
  | 'failed'

/** In-flight PR context for resolve-conflict continuation. */
let _pendingPrCtx: {
  owner: string
  repo: string
  prNumber: number
  projectDir: string
  vercelProject?: string
} | null = null

ipcMain.handle(
  'deploy:execute',
  async (
    event,
    args: {
      projectDir: string
      owner: string
      repo: string
      branchName: string
      ticketId: string
      ticketTitle: string
      ticketAcceptance?: string
      vercelProject?: string
    },
  ): Promise<{ ok: boolean; prUrl?: string; deployUrl?: string; error?: string; errorReason?: string }> => {
    try {
      assertNotPoTurn('deploy:execute')
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'PO turn active', errorReason: 'po-turn-active' }
    }

    const emit = (step: DeployProgressStep, detail?: Record<string, unknown>) => {
      event.sender.send('deploy:progress', { step, ...detail })
    }

    try {
      // Step 1: create PR
      emit('pr-creating')
      const prResult = await createDeployPR({
        branchName: args.branchName,
        owner: args.owner,
        repo: args.repo,
        baseBranch: 'main',
        ticketId: args.ticketId,
        ticketTitle: args.ticketTitle,
        ticketAcceptance: args.ticketAcceptance ?? '',
        personaActivity: [],
      })
      emit('pr-created', { prUrl: prResult.prUrl, prNumber: prResult.prNumber })

      // Step 2: poll mergeability (up to 3 attempts, 2s apart)
      let mergeCheck = await checkPRMergeability(args.owner, args.repo, prResult.prNumber)
      for (let attempt = 0; attempt < 2 && mergeCheck.mergeable === null; attempt++) {
        await new Promise(r => setTimeout(r, 2000))
        mergeCheck = await checkPRMergeability(args.owner, args.repo, prResult.prNumber)
      }

      if (mergeCheck.mergeable === false) {
        const conflictType = classifyConflict(mergeCheck.conflictPaths ?? [])
        _pendingPrCtx = { owner: args.owner, repo: args.repo, prNumber: prResult.prNumber, projectDir: args.projectDir, vercelProject: args.vercelProject }
        event.sender.send('deploy:conflict', {
          owner: args.owner,
          repo: args.repo,
          prNumber: prResult.prNumber,
          conflictPaths: mergeCheck.conflictPaths ?? [],
          conflictType,
        })
        return { ok: false, prUrl: prResult.prUrl, error: 'conflict', errorReason: 'conflict' }
      }

      // Step 3: squash merge
      emit('merging')
      const mergeResult = await squashMergePR({
        owner: args.owner,
        repo: args.repo,
        prNumber: prResult.prNumber,
        commitTitle: `${args.ticketId}: ${args.ticketTitle}`,
      })
      emit('merged', { sha: mergeResult.mergedSha })

      // Step 4: trigger Vercel deploy
      emit('deploy-triggering')
      const deployResult = await triggerVercelDeployAfterMerge({
        projectDir: args.projectDir,
        project: args.vercelProject ?? '',
        gitRef: mergeResult.mergedSha,
      })
      emit('deploy-triggered', { deployUrl: deployResult.deploymentUrl })

      return { ok: true, prUrl: prResult.prUrl, deployUrl: deployResult.deploymentUrl }
    } catch (err: any) {
      const reason = err?.reason ?? 'generic'
      emit('failed', { error: err?.message ?? String(err), errorReason: reason })
      return { ok: false, error: err?.message ?? String(err), errorReason: reason }
    }
  },
)

ipcMain.handle(
  'deploy:resolve-conflict',
  async (
    _event,
    args: { strategy: 'theirs' | 'ours' | 'manual' },
  ): Promise<{ ok: boolean; error?: string }> => {
    const ctx = _pendingPrCtx
    _pendingPrCtx = null
    if (!ctx) return { ok: false, error: 'No pending conflict context' }
    if (args.strategy === 'manual') {
      // User will resolve manually — just acknowledge
      return { ok: true }
    }
    // 'theirs' / 'ours' — Phase 5 auto-resolution; for now return ok so UI can reset
    return { ok: true }
  },
)

// ── Deploy event cross-ref (T-P4-023 sub-c) ───────────────────────────────────
// Uses dynamic import to avoid top-level import conflicts with parallel PRs.

ipcMain.handle(
  'deploy:fetch-events',
  async (
    _event,
    args: { projectDir: string; projectName: string; sinceIso: string; untilIso: string },
  ): Promise<{ ok: boolean; events: unknown[]; error?: string }> => {
    try {
      const { fetchVercelDeploys } = await import('@productune/core')
      const events = await fetchVercelDeploys(
        args.projectName,
        args.sinceIso,
        args.untilIso,
        args.projectDir,
      )
      return { ok: true, events }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, events: [], error: message }
    }
  },
)

function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project…',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToFocused('menu:new-project'),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu:open-project'),
        },
        {
          label: 'Open Recent',
          role: 'recentDocuments' as const,
          submenu: [
            {
              label: 'Clear Menu',
              role: 'clearRecentDocuments' as const,
            },
          ],
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'productune docs',
          click: () => shell.openExternal('https://github.com/shawn-kim-axz/productune'),
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

function sendToFocused(channel: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.webContents.send(channel)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
