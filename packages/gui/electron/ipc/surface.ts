/**
 * ipc/surface.ts — IPC for the StatusBar Build(+Smoke) button (T-PATCH-159).
 *
 *   surface:list   (projectDir)                 → config.surfaces (D2)
 *   surface:run    ({projectDir,surfaceKey,kind})→ spawn surface command (D3)
 *   surface:cancel ({runId})                    → SIGTERM the run (D5)
 *
 * Streaming events (mirrors po-runner emitToWebContents):
 *   surface:onStart  / surface:onOutput / surface:onDone
 *
 * ★ ZERO-TOKEN (D0): this module + surface-runner.ts never touch claude /
 *   @productune/core LLM / po-runner. Pure config read + child_process.spawn.
 */

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  runSurfaceCommand,
  cancelSurfaceRun,
  type SurfaceKind,
} from '../surface-runner'
import { configPath } from '../project-paths'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * T-PATCH-187: a surface's `run` config. Type-aware by shape:
 *   - string                       → single run command, no environments (e.g. an electron gui dev)
 *   - { command, preview? }        → a run command whose ENVIRONMENTS are discovered
 *                                    from the project's `.env*` files (web: local/prod/…)
 * `preview:'auto'` (default for the object form) tells the renderer to watch the
 * run's stdout for a localhost URL and auto-open an in-app browser tab.
 */
type RunConfig =
  | string
  | { command: string; preview?: 'auto' | false }

interface SurfaceConfig {
  type: string
  build?: string | null
  run?: RunConfig
  // Legacy (T-PATCH-159) — ignored by the Run launcher; kept for back-compat.
  smoke?: string | null
  smoke_driver?: string
}

/** A run environment discovered from a `.env*` file (label shown, file loaded). */
interface RunEnv { label: string; file: string }

/** Normalized run info returned to the renderer (command + discovered envs). */
interface RunInfo { command: string; preview: boolean; environments: RunEnv[] }
interface SurfaceOut { type: string; build?: string | null; run?: RunInfo }

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** D8: read .productune/config.json; returns null when absent/corrupt. */
function readConfig(projectDir: string): { surfaces?: Record<string, SurfaceConfig> } | null {
  const cfgPath = configPath(projectDir)
  if (!fs.existsSync(cfgPath)) return null
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } catch {
    return null
  }
}

/** D8: projectDir guard — must be a string pointing at a real productune project. */
function isProductuneProject(projectDir: unknown): projectDir is string {
  return (
    typeof projectDir === 'string' &&
    projectDir.length > 0 &&
    fs.existsSync(configPath(projectDir))
  )
}

/**
 * T-PATCH-187: derive a run-environment label from a `.env*` filename.
 * Strip only the `.env.` prefix and keep the rest verbatim, so the label is
 * 1:1 with the file and never collides (e.g. `.env.prod` vs `.env.prod.local`).
 *   .env            → 'default'
 *   .env.local      → 'local'
 *   .env.prod       → 'prod'
 *   .env.prod.local → 'prod.local'
 *   .env.test.local → 'test.local'
 */
function envLabel(filename: string): string {
  if (filename === '.env') return 'default'
  return filename.replace(/^\.env\./, '')
}

/**
 * Discover run environments from the project's `.env*` files. Excludes any file
 * whose name contains "example". Sorted by label for a stable menu order.
 */
function discoverEnvFiles(projectDir: string): RunEnv[] {
  let names: string[]
  try { names = fs.readdirSync(projectDir) } catch { return [] }
  return names
    .filter((n) => /^\.env(\.|$)/.test(n) && !/example/i.test(n))
    .map((n) => ({ label: envLabel(n), file: n }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Minimal dotenv parser — KEY=VALUE per line, `#` comments, optional `export `
 * and surrounding quotes. Used to inject a selected env file into the run's
 * child env. Path is always a config-discovered file under projectDir (never a
 * renderer-supplied path) — see surface:run.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {}
  let text: string
  try { text = fs.readFileSync(filePath, 'utf-8') } catch { return out }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    let key = line.slice(0, eq).trim()
    if (key.startsWith('export ')) key = key.slice(7).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/** Normalize a raw surface config into the renderer-facing shape (+ discovered envs). */
function normalizeSurface(s: SurfaceConfig, projectDir: string): SurfaceOut {
  const out: SurfaceOut = { type: s.type, build: s.build ?? null }
  if (typeof s.run === 'string') {
    out.run = { command: s.run, preview: false, environments: [] }
  } else if (s.run && typeof s.run === 'object' && s.run.command) {
    out.run = {
      command: s.run.command,
      preview: s.run.preview !== false,
      environments: discoverEnvFiles(projectDir),
    }
  }
  return out
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── D2: list surfaces ─────────────────────────────────────────────────────────
  ipcMain.handle(
    'surface:list',
    async (
      _event,
      args: { projectDir: string },
    ): Promise<{ ok: boolean; surfaces?: Record<string, SurfaceOut>; error?: string }> => {
      if (!isProductuneProject(args?.projectDir)) {
        return { ok: false, error: 'not-a-productune-project' }
      }
      const config = readConfig(args.projectDir)
      if (!config || !config.surfaces) return { ok: false, error: 'no-surfaces' }
      const surfaces: Record<string, SurfaceOut> = {}
      for (const [key, s] of Object.entries(config.surfaces)) {
        surfaces[key] = normalizeSurface(s, args.projectDir)
      }
      return { ok: true, surfaces }
    },
  )

  // ── D3: run a surface build/run ─────────────────────────────────────────────────
  ipcMain.handle(
    'surface:run',
    async (
      event,
      args: { projectDir: string; surfaceKey: string; kind: SurfaceKind; env?: string },
    ): Promise<{ ok: boolean; runId?: string; command?: string; error?: string }> => {
      // D8: reject auto/synthetic invocations — only real user gestures.
      if (!event.senderFrame) {
        // senderFrame undefined → not a live renderer frame; reject defensively.
        return { ok: false, error: 'untrusted-sender' }
      }

      // D8: projectDir guard.
      if (!isProductuneProject(args?.projectDir)) {
        return { ok: false, error: 'not-a-productune-project' }
      }

      // D8: surfaceKey + kind + env whitelist — the command is ALWAYS looked up
      // from config, never synthesized from renderer input (the renderer only
      // names a surface/kind/env; the command string itself comes from disk).
      const kind = args?.kind
      if (kind !== 'build' && kind !== 'run') {
        return { ok: false, error: 'invalid-kind' }
      }
      const config = readConfig(args.projectDir)
      const surface = config?.surfaces?.[args?.surfaceKey]
      if (!surface) return { ok: false, error: 'unknown-surface' }

      // Resolve the command from config by kind. The command string ALWAYS comes
      // from disk — the renderer only names surface/kind/env.
      let command: string | null | undefined
      if (kind === 'build') {
        command = surface.build
      } else if (typeof surface.run === 'string') {
        command = surface.run
      } else if (surface.run && typeof surface.run === 'object') {
        command = surface.run.command
      }
      if (!command) return { ok: false, error: `no-${kind}-command` }

      // T-PATCH-187: an env selection (env label) → load that `.env*` file's vars
      // into the child env. The label is validated against the discovered set, so
      // we only ever read a real, project-local `.env*` file (never a renderer path).
      let extraEnv: Record<string, string> | undefined
      if (kind === 'run' && typeof args?.env === 'string' && args.env.length > 0) {
        const entry = discoverEnvFiles(args.projectDir).find((e) => e.label === args.env)
        if (!entry) return { ok: false, error: 'unknown-env' }
        extraEnv = parseEnvFile(path.join(args.projectDir, entry.file))
      }

      // T-PATCH-187: concurrency allowed (run servers are long-lived). The renderer
      // dedupes by surface+env tab id and focuses an existing run tab on re-click,
      // so we no longer reject a second spawn here (was the D5 single-run model).

      const wc = event.sender
      const runId = runSurfaceCommand(
        { projectDir: args.projectDir, surfaceKey: args.surfaceKey, kind, command, extraEnv },
        {
          onStart: (info) => { if (!wc.isDestroyed()) wc.send('surface:onStart', info) },
          onOutput: (info) => { if (!wc.isDestroyed()) wc.send('surface:onOutput', info) },
          onDone: (info) => {
            if (!wc.isDestroyed()) wc.send('surface:onDone', info)
            // D6 (build-done OS notification) deferred — see ticket notes.
          },
        },
      )

      return { ok: true, runId, command }
    },
  )

  // ── D5: cancel a run ────────────────────────────────────────────────────────────
  ipcMain.handle(
    'surface:cancel',
    async (
      _event,
      args: { runId: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      if (typeof args?.runId !== 'string') return { ok: false, error: 'invalid-runId' }
      const ok = cancelSurfaceRun(args.runId)
      return { ok, ...(ok ? {} : { error: 'not-running' }) }
    },
  )
}
