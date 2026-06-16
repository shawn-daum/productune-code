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
  hasActiveRun,
  type SurfaceKind,
} from '../surface-runner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SurfaceConfig {
  type: string
  build: string | null
  smoke: string | null
  smoke_driver: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** D8: read .productune/config.json; returns null when absent/corrupt. */
function readConfig(projectDir: string): { surfaces?: Record<string, SurfaceConfig> } | null {
  const configPath = path.join(projectDir, '.productune', 'config.json')
  if (!fs.existsSync(configPath)) return null
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return null
  }
}

/** D8: projectDir guard — must be a string pointing at a real productune project. */
function isProductuneProject(projectDir: unknown): projectDir is string {
  return (
    typeof projectDir === 'string' &&
    projectDir.length > 0 &&
    fs.existsSync(path.join(projectDir, '.productune', 'config.json'))
  )
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── D2: list surfaces ─────────────────────────────────────────────────────────
  ipcMain.handle(
    'surface:list',
    async (
      _event,
      args: { projectDir: string },
    ): Promise<{ ok: boolean; surfaces?: Record<string, SurfaceConfig>; error?: string }> => {
      if (!isProductuneProject(args?.projectDir)) {
        return { ok: false, error: 'not-a-productune-project' }
      }
      const config = readConfig(args.projectDir)
      if (!config || !config.surfaces) return { ok: false, error: 'no-surfaces' }
      return { ok: true, surfaces: config.surfaces }
    },
  )

  // ── D3: run a surface build/smoke ──────────────────────────────────────────────
  ipcMain.handle(
    'surface:run',
    async (
      event,
      args: { projectDir: string; surfaceKey: string; kind: SurfaceKind },
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

      // D8: surfaceKey + kind whitelist — the command is looked up from config,
      // never synthesized from renderer input.
      const kind = args?.kind
      if (kind !== 'build' && kind !== 'smoke') {
        return { ok: false, error: 'invalid-kind' }
      }
      const config = readConfig(args.projectDir)
      const surface = config?.surfaces?.[args?.surfaceKey]
      if (!surface) return { ok: false, error: 'unknown-surface' }
      const command = surface[kind]
      if (!command) return { ok: false, error: `no-${kind}-command` }

      // D5: single global in-flight model (OQ-2). Reject a second run.
      if (hasActiveRun()) {
        return { ok: false, error: 'already-running' }
      }

      const wc = event.sender
      const runId = runSurfaceCommand(
        { projectDir: args.projectDir, surfaceKey: args.surfaceKey, kind, command },
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
