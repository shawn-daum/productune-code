import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { setUiLanguage } from '@productune/core'
import type { UiLanguage } from '@productune/core'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphitiConfig {
  llmProvider: 'ollama'
  llmModel: string
  embedderProvider: 'ollama'
  embedderModel: string
}

interface OnboardingCompleteOpts {
  engine: 'claude' | 'codex' | 'both'
  wikiBackend: 'filesystem' | 'graphiti'
  uiLanguage?: UiLanguage
  /** Set when wikiBackend==='graphiti' and local LLM was installed in step 3.5. */
  graphitiConfig?: GraphitiConfig
}

interface OnboardingRecord {
  status: 'pending' | 'done'
  source: 'gui-create' | 'install-at' | 'legacy-fallback'
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Open macOS Terminal with the given shell command. Fire-and-forget. */
async function openTerminalWith(cmd: string) {
  await execFileAsync('osascript', [
    '-e', 'tell application "Terminal" to activate',
    '-e', `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`,
  ])
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

  ipcMain.handle('onboarding:listOllamaModels', async () => {
    try {
      const { stdout } = await execFileAsync('ollama', ['list'])
      // Format: NAME  ID  SIZE  MODIFIED — one model per line, skip header
      const models = stdout
        .split('\n')
        .slice(1)
        .map(l => l.trim().split(/\s+/)[0])
        .filter(Boolean)
      return models
    } catch {
      // ollama not installed or daemon not running — return empty list
      return []
    }
  })

  ipcMain.handle('onboarding:installLocalLLM', async (event, opts: { model: string }) => {
    const send = (line: string) =>
      event.sender.send('onboarding:installLocalLLM:log', line)

    const coreDir = path.join(app.getAppPath(), '..', 'core')
    const helperPath = path.join(coreDir, 'scripts', 'install-local-llm.sh')

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
    }

    try {
      send(`로컬 LLM 설치 시작: ${opts.model}`)
      await spawnStreaming('/bin/bash', [helperPath, opts.model], baseEnv, send)
      send(`OK · ${opts.model} 설치 완료`)
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message ?? '알 수 없는 오류'
      send(`ERR · 오류: ${msg}`)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('onboarding:setupGraphiti', async (event) => {
    const send = (line: string) =>
      event.sender.send('onboarding:setupGraphiti:log', line)

    const coreDir = path.join(app.getAppPath(), '..', 'core')
    const scriptPath = path.join(coreDir, 'scripts', 'setup-graphiti.sh')

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
    }

    try {
      send('Graphiti 세팅 시작 (FalkorDB + Graphiti MCP)...')
      await spawnStreaming('/bin/bash', [scriptPath], baseEnv, send)
      send('OK · Graphiti 세팅 완료')
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message ?? '알 수 없는 오류'
      send(`ERR · 오류: ${msg}`)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('onboarding:registerGraphitiMCP', async () => {
    const coreDir = path.join(app.getAppPath(), '..', 'core')
    const launcher = path.join(coreDir, 'scripts', 'graphiti-launcher.sh')

    // Check claude CLI is available
    const claudePath = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      'claude',
    ].find(p => {
      try { return p === 'claude' || fs.existsSync(p) } catch { return false }
    }) ?? 'claude'

    try {
      await execFileAsync(claudePath, ['--version'])
    } catch {
      return { ok: false, alreadyRegistered: false, error: 'claude CLI 미설치' }
    }

    // Check if already registered
    try {
      const { stdout } = await execFileAsync(claudePath, ['mcp', 'list'])
      if (stdout.split('\n').some(l => l.startsWith('graphiti'))) {
        return { ok: true, alreadyRegistered: true }
      }
    } catch { /* list failed — try registering anyway */ }

    // Register
    try {
      await execFileAsync(claudePath, ['mcp', 'add', 'graphiti', launcher, '--', 'designer'])
      return { ok: true, alreadyRegistered: false }
    } catch (e: any) {
      return { ok: false, alreadyRegistered: false, error: e?.message ?? 'MCP 등록 실패' }
    }
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
      // If graphiti backend was chosen but no graphitiConfig was set (e.g. tier B user),
      // fall back to keeper (prevents writing an incomplete graphiti env).
      const backendVal =
        opts.wikiBackend === 'graphiti' && opts.graphitiConfig ? 'graphiti' : 'keeper'
      let envContent = `MY_PO_ENGINE=${engineVal}\n`
      envContent += `PRODUCTUNE_REPO=${coreDir}\n`
      envContent += `WIKI_BACKEND=${backendVal}\n`
      if (backendVal === 'graphiti' && opts.graphitiConfig) {
        const g = opts.graphitiConfig
        envContent += `GRAPHITI_LLM_PROVIDER=${g.llmProvider}\n`
        envContent += `GRAPHITI_LLM_MODEL=${g.llmModel}\n`
        envContent += `GRAPHITI_EMBEDDER_PROVIDER=${g.embedderProvider}\n`
        envContent += `GRAPHITI_EMBEDDER_MODEL=${g.embedderModel}\n`
      }
      envContent += `created_at=${new Date().toISOString()}\n`
      fs.writeFileSync(envPath, envContent, { mode: 0o600 })

      // 2. Symlink agents/*.md → ~/.claude/agents/
      //    Uses keeper variant for filesystem backend, graphiti variant for graphiti.
      const variantDir = path.join(coreDir, 'agents', 'variants', backendVal === 'graphiti' ? 'graphiti' : 'keeper')
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
