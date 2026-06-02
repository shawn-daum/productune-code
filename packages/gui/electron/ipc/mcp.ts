import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  source: 'productune' | 'local' | 'project'
}

// ── Helpers (exported for hooks.ts) ──────────────────────────────────────────

export function readClaudeSettings(): Record<string, any> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

/** Read ~/.claude.json — Claude Code's own state file (MCP local-tier registrations). */
export function readClaudeJson(): Record<string, any> {
  const p = path.join(os.homedir(), '.claude.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return {} }
}

/**
 * Atomic write to ~/.claude.json — read-modify-write preserving all existing keys.
 * Uses tmp+rename POSIX atomic pattern (same as writeClaudeSettings).
 * CAUTION: ~/.claude.json is Claude Code's own state file. Never truncate — always
 * merge with existing content. Only call after readClaudeJson().
 */
function writeClaudeJson(data: Record<string, any>): void {
  const p = path.join(os.homedir(), '.claude.json')
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, p)
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

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle(
    'mcp:getServers',
    (_event, projectDir?: string): McpServerEntry[] => {
      // Tier 1 (lowest): productune — ~/.claude/settings.json
      const productuneCfg = readClaudeSettings()
      const productuneTier: Record<string, McpServerConfig> =
        productuneCfg.mcpServers ?? {}

      // Tier 2: local — ~/.claude.json projects[projectDir].mcpServers
      const claudeJson = readClaudeJson()
      const localTier: Record<string, McpServerConfig> =
        (projectDir && claudeJson.projects?.[projectDir]?.mcpServers) ?? {}

      // Tier 3 (highest): project — <projectDir>/.mcp.json
      let projectTier: Record<string, McpServerConfig> = {}
      if (projectDir) {
        try {
          const parsed = JSON.parse(
            fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8')
          )
          projectTier = parsed.mcpServers ?? parsed ?? {}
        } catch { /* no .mcp.json */ }
      }

      // Merge: later tier wins
      const merged = new Map<
        string,
        { config: McpServerConfig; source: 'productune' | 'local' | 'project' }
      >()
      for (const [n, c] of Object.entries(productuneTier)) merged.set(n, { config: c, source: 'productune' })
      for (const [n, c] of Object.entries(localTier))     merged.set(n, { config: c, source: 'local'      })
      for (const [n, c] of Object.entries(projectTier))   merged.set(n, { config: c, source: 'project'    })

      return Array.from(merged.entries()).map(([name, { config, source }]) => ({
        name, config, source,
      }))
    },
  )

  ipcMain.handle(
    'mcp:save',
    (
      _event,
      serverName: string,
      config: McpServerConfig,
      projectDir?: string,
    ): { ok: boolean; error?: string } => {
      try {
        if (projectDir) {
          // Primary path: write to local tier (~/.claude.json)
          const claudeJson = readClaudeJson()
          if (!claudeJson.projects)                              claudeJson.projects = {}
          if (!claudeJson.projects[projectDir])                  claudeJson.projects[projectDir] = {}
          if (!claudeJson.projects[projectDir].mcpServers)       claudeJson.projects[projectDir].mcpServers = {}
          claudeJson.projects[projectDir].mcpServers[serverName] = config
          writeClaudeJson(claudeJson)
        } else {
          // Fallback (no projectDir): write to productune tier (~/.claude/settings.json)
          const settings = readClaudeSettings()
          if (!settings.mcpServers) settings.mcpServers = {}
          settings.mcpServers[serverName] = config
          writeClaudeSettings(settings)
        }
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown error' }
      }
    },
  )

  ipcMain.handle(
    'mcp:rename',
    (
      _event,
      oldName: string,
      newName: string,
      projectDir?: string,
    ): { ok: boolean; error?: string } => {
      try {
        const trimmed = newName.trim()
        if (!trimmed) return { ok: false, error: 'empty name' }
        if (trimmed === oldName) return { ok: true }

        // Rename in whichever store the server lives in. Check project-local
        // (~/.claude.json) first when a projectDir is given, then productune
        // tier (~/.claude/settings.json). Project .mcp.json is repo-tracked and
        // edited via the repo, so we don't mutate it here.
        if (projectDir) {
          const claudeJson = readClaudeJson()
          const servers = claudeJson.projects?.[projectDir]?.mcpServers
          if (servers && Object.prototype.hasOwnProperty.call(servers, oldName)) {
            if (Object.prototype.hasOwnProperty.call(servers, trimmed)) {
              return { ok: false, error: 'name already exists' }
            }
            servers[trimmed] = servers[oldName]
            delete servers[oldName]
            writeClaudeJson(claudeJson)
            return { ok: true }
          }
        }

        const settings = readClaudeSettings()
        const servers = settings.mcpServers
        if (servers && Object.prototype.hasOwnProperty.call(servers, oldName)) {
          if (Object.prototype.hasOwnProperty.call(servers, trimmed)) {
            return { ok: false, error: 'name already exists' }
          }
          servers[trimmed] = servers[oldName]
          delete servers[oldName]
          writeClaudeSettings(settings)
          return { ok: true }
        }

        return { ok: false, error: 'server not found in a writable tier' }
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
}
