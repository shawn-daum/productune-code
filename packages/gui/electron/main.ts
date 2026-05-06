import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { initProject, startDeviceFlow, pollDeviceFlow, loadCredentials, createPrivateRepo } from '@productune/core'
import { getSession, appendMessage, setClaudeSessionId, clearSession } from './chat-store'
import type { Message } from './chat-store'

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
    send('🔍 Homebrew 확인 중...')
    let brewOk = false
    try {
      await execFileAsync(findBrew(), ['--version'])
      brewOk = true
      send(`✅ Homebrew 감지됨`)
    } catch { /* not found */ }

    // 2. Install Homebrew if missing
    if (!brewOk) {
      send('📦 Homebrew 설치 중... (몇 분 소요)')
      const installScript =
        'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash'
      await spawnStreaming('/bin/bash', ['-c', installScript], baseEnv, send)
      send('✅ Homebrew 설치 완료')
    }

    // 3. brew install --cask docker
    send('🐳 Docker Desktop 설치 중... (몇 분 소요)')
    const brew = findBrew()
    await spawnStreaming(brew, ['install', '--cask', 'docker'], baseEnv, send)
    send('✅ 설치 완료 — Docker Desktop을 실행해주세요')

    return { ok: true }
  } catch (e: any) {
    const msg = e?.message ?? '알 수 없는 오류'
    send(`❌ 오류: ${msg}`)
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

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
})

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

ipcMain.handle('project:create', (_event, { slug }: { slug: string }) => {
  const baseDir = path.join(os.homedir(), 'productune', 'projects')
  fs.mkdirSync(baseDir, { recursive: true })

  let projectDir = path.join(baseDir, slug)
  let suffix = 2
  while (fs.existsSync(projectDir)) {
    projectDir = path.join(baseDir, `${slug}-${suffix++}`)
  }
  fs.mkdirSync(projectDir, { recursive: true })

  const config = initProject({ slug, projectDir })
  return { projectDir, config }
})

ipcMain.handle('project:installAt', (_event, { projectDir }: { projectDir: string }) => {
  const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
  const config = initProject({ slug, projectDir })
  return { projectDir, config }
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

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]

  const selfConfig = readProductuneConfig(dir)
  if (selfConfig) {
    return { kind: 'self', dir, config: selfConfig }
  }

  const descendants = scanDescendantsForProductune(dir)
  if (descendants.length > 0) {
    return { kind: 'descendant', dir, descendants }
  }

  return { kind: 'none', dir }
})

function readProductuneConfig(dir: string): any | null {
  const configPath = path.join(dir, '.productune', 'config.json')
  if (!fs.existsSync(configPath)) return null
  try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch { return null }
}

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
    const config = readProductuneConfig(childPath)
    if (config) found.push({ path: childPath, config })
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

app.whenReady().then(() => {
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
