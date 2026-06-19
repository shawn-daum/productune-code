import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { withLoginShellPath } from '../surface-runner'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

interface McpServerConfig {
  type?: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

/**
 * Origin of a server entry.
 * - File tiers (`productune` | `local` | `project`) are read from local config
 *   files and are EDITABLE via the add/rename/save IPC paths.
 * - `managed` (account-level `claude.ai *`) and `plugin` servers are discovered
 *   only through `claude mcp list`; their configs live in account-synced state /
 *   the plugins tree the GUI does not own, so they are READ-ONLY (T-PATCH-015).
 */
type McpServerSource = 'productune' | 'local' | 'project' | 'managed' | 'plugin'

interface McpServerEntry {
  name: string
  config: McpServerConfig
  source: McpServerSource
  /** True health from `claude mcp list`; undefined when status is unknown. */
  connected?: boolean
  /** Whether the add/rename/save paths can mutate this server (file tiers only). */
  editable: boolean
}

/** One parsed row from `claude mcp list` plain-text output. */
interface CliMcpServer {
  name: string
  endpoint?: string
  connected: boolean
  source: McpServerSource
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
 * Resolve the local-tier mcpServers for a projectDir from ~/.claude.json.
 *
 * T-PATCH-009 #7: Claude Code keys projects[] by the exact cwd it was launched
 * in, but the GUI's runtime projectDir may differ by a trailing slash, symlink
 * (realpath), or case. Exact-key lookup then silently misses a registered server
 * (e.g. `playwright`). Match defensively: try the raw key first, then a
 * normalized comparison (strip trailing sep + realpath) against every project key.
 */
export function resolveLocalMcpServers(
  claudeJson: Record<string, any>,
  projectDir?: string,
): Record<string, McpServerConfig> {
  if (!projectDir) return {}
  const projects = claudeJson.projects
  if (!projects || typeof projects !== 'object') return {}

  // 1. Fast path — exact key.
  if (projects[projectDir]?.mcpServers) return projects[projectDir].mcpServers

  // 2. Normalized match (trailing-sep strip + realpath, best-effort).
  const norm = (p: string): string => {
    const stripped = p.length > 1 && p.endsWith(path.sep) ? p.slice(0, -1) : p
    try { return fs.realpathSync(stripped) } catch { return stripped }
  }
  const target = norm(projectDir)
  for (const key of Object.keys(projects)) {
    if (norm(key) === target && projects[key]?.mcpServers) {
      return projects[key].mcpServers
    }
  }
  return {}
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

/**
 * Classify a server name into a source/origin.
 * `claude.ai *` → account-managed; `plugin:*` → plugin-provided; else file-tier.
 */
function classifyCliSource(name: string): McpServerSource {
  if (name.startsWith('plugin:')) return 'plugin'
  if (name.startsWith('claude.ai ')) return 'managed'
  return 'local' // file-tier server seen by the CLI (e.g. playwright)
}

/**
 * Parse one line of `claude mcp list` plain-text output.
 *
 * Format (per the installed Claude Code version, no `--json` flag):
 *   `<name>: <endpoint> - <status>`
 * where <status> is one of `✓ Connected`, `✗ Failed to connect`,
 * `! Needs authentication`. Both <name> and <endpoint> may themselves contain
 * `:` (e.g. `plugin:vercel-plugin:vercel: https://... (HTTP) - ...`), so we split
 * the name on the FIRST `: ` and the status on the LAST ` - `.
 */
function parseCliMcpLine(line: string): CliMcpServer | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  // Skip the "Checking MCP server health…" preamble and any non-entry line.
  const nameSep = trimmed.indexOf(': ')
  if (nameSep < 0) return null
  const name = trimmed.slice(0, nameSep).trim()
  if (!name) return null

  const rest = trimmed.slice(nameSep + 2)
  const statusSep = rest.lastIndexOf(' - ')
  const endpoint = statusSep >= 0 ? rest.slice(0, statusSep).trim() : undefined
  const status = statusSep >= 0 ? rest.slice(statusSep + 3).trim() : rest.trim()

  // Connected only when explicitly ✓/Connected. Failed / Needs auth = not connected.
  const connected = /✓/.test(status) || /^connected\b/i.test(status)

  return { name, endpoint, connected, source: classifyCliSource(name) }
}

/**
 * Shell out to `claude mcp list` (the DISPLAY source-of-truth per T-PATCH-015 PO
 * decision) and parse the server list + live connection status. Returns an empty
 * array if the CLI is unavailable / errors — callers fall back to the file tiers.
 *
 * Reuses the same login-shell PATH resolution as the other CLI spawns
 * (onboarding.ts / po-runner.ts) via withLoginShellPath — `claude` resolves even
 * under a Finder/packaged-app launch (launchd's minimal PATH). T-PATCH-216.
 */
async function listClaudeCliServers(): Promise<CliMcpServer[]> {
  try {
    const { stdout } = await execFileAsync('claude', ['mcp', 'list'], {
      timeout: 15_000,
      env: withLoginShellPath({ ...process.env, NO_COLOR: '1' }),
      maxBuffer: 1024 * 1024,
    })
    const out: CliMcpServer[] = []
    for (const line of stdout.split('\n')) {
      const parsed = parseCliMcpLine(line)
      if (parsed) out.push(parsed)
    }
    return out
  } catch {
    return []
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle(
    'mcp:getServers',
    async (_event, projectDir?: string): Promise<McpServerEntry[]> => {
      // ── File tiers (EDITABLE) — kept verbatim so playwright/.mcp.json still work.
      // Tier 1 (lowest): productune — ~/.claude/settings.json
      const productuneCfg = readClaudeSettings()
      const productuneTier: Record<string, McpServerConfig> =
        productuneCfg.mcpServers ?? {}

      // Tier 2: local — ~/.claude.json projects[projectDir].mcpServers
      // Key lookup is normalized (trailing slash / realpath / casing) so a
      // registered server surfaces even when projectDir != the exact stored key.
      const claudeJson = readClaudeJson()
      const localTier: Record<string, McpServerConfig> =
        resolveLocalMcpServers(claudeJson, projectDir)

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

      // Merge file tiers: later tier wins. These entries are editable.
      const merged = new Map<string, McpServerEntry>()
      const setFileTier = (
        n: string,
        config: McpServerConfig,
        source: 'productune' | 'local' | 'project',
      ) => merged.set(n, { name: n, config, source, editable: true })
      for (const [n, c] of Object.entries(productuneTier)) setFileTier(n, c, 'productune')
      for (const [n, c] of Object.entries(localTier))      setFileTier(n, c, 'local')
      for (const [n, c] of Object.entries(projectTier))    setFileTier(n, c, 'project')

      // ── CLI list (DISPLAY source-of-truth, T-PATCH-015) — adds account-managed
      // (`claude.ai *`) + plugin servers the file tiers never carry, and supplies
      // the real `connected` flag. One shell-out per refresh (panel already polls).
      const cli = await listClaudeCliServers()
      for (const c of cli) {
        const existing = merged.get(c.name)
        if (existing) {
          // De-dupe by name: keep the file-tier (editable) config + source, but
          // let the CLI status win for `connected`.
          existing.connected = c.connected
        } else {
          // managed / plugin server — read-only, status from the CLI.
          const config: McpServerConfig =
            c.endpoint && /^https?:\/\//.test(c.endpoint)
              ? { type: 'http', url: c.endpoint }
              : { type: 'stdio', command: c.endpoint }
          merged.set(c.name, {
            name: c.name,
            config,
            source: c.source,
            connected: c.connected,
            editable: c.source !== 'managed' && c.source !== 'plugin',
          })
        }
      }

      return Array.from(merged.values())
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
