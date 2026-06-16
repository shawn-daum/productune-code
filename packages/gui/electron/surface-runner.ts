/**
 * surface-runner.ts — main-process bridge for surface build/smoke commands.
 *
 * T-PATCH-159: a Build(+Smoke) button in the StatusBar runs the surface's
 * deterministic shell command (`config.surfaces.<key>.build|smoke`) directly via
 * `child_process.spawn`. There is NO LLM involvement here — it is a pure shell
 * exec, so it consumes **zero tokens** (AC-2).
 *
 *   ★ ZERO-TOKEN INVARIANT (D0): this module MUST NOT import the @productune/core
 *     LLM helpers, the chat CLI, or the PO turn runner. Only `child_process.spawn`.
 *     Verified by an AC grep that this file is free of those references.
 *
 * Mirrors the stdout/stderr line-buffer + close-handler skeleton of the PO turn
 * runner, but spawns the surface command instead of the chat CLI.
 */

import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

export type SurfaceKind = 'build' | 'smoke'

export interface SurfaceRunCallbacks {
  onStart: (info: { runId: string; surfaceKey: string; kind: SurfaceKind; command: string }) => void
  onOutput: (info: { runId: string; stream: 'stdout' | 'stderr'; chunk: string }) => void
  onDone: (info: { runId: string; code: number | null; status: 'pass' | 'fail' | 'cancelled' }) => void
}

// ── Module state ────────────────────────────────────────────────────────────────

/**
 * D5: in-flight child processes keyed by runId. v1 enforces a single global
 * run (the IPC layer rejects a second `surface:run` while this Map is non-empty),
 * but the Map shape leaves room for the per-surface×kind policy (OQ-2).
 */
const activeRuns = new Map<string, ChildProcess>()

/** D5: true if any surface command is currently running. */
export function hasActiveRun(): boolean {
  return activeRuns.size > 0
}

let runSeq = 0
function newRunId(): string {
  runSeq += 1
  return `srun-${Date.now()}-${runSeq}`
}

/**
 * D5: send SIGTERM to the run identified by `runId`. The close handler then
 * emits `status:'cancelled'` (mirrors the PO turn abort path). Safe no-op
 * when the run is unknown or already gone.
 */
export function cancelSurfaceRun(runId: string): boolean {
  const child = activeRuns.get(runId)
  if (child && !child.killed) {
    cancelled.add(runId)
    child.kill('SIGTERM')
    return true
  }
  return false
}

/**
 * D5 quit cleanup: SIGTERM every in-flight surface run. Called from the
 * window-all-closed / quit path so no orphaned build process survives the app.
 */
export function killAllSurfaceRuns(): void {
  for (const [, child] of activeRuns) {
    if (!child.killed) child.kill('SIGTERM')
  }
  activeRuns.clear()
}

/** runIds that received an explicit cancel — used to classify SIGTERM exits. */
const cancelled = new Set<string>()

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Spawn a surface command and stream its output. Returns the assigned runId
 * synchronously; events flow through `cb`.
 *
 * `command` is the trusted shell string from config (e.g.
 * "pnpm --filter @productune/gui build"), so `shell: true` is required (D3/D8).
 * The command is supplied by the IPC layer after a config-whitelist lookup —
 * the renderer never passes a raw command string (D8).
 */
export function runSurfaceCommand(
  opts: { projectDir: string; surfaceKey: string; kind: SurfaceKind; command: string },
  cb: SurfaceRunCallbacks,
): string {
  const runId = newRunId()

  // D3: shell:true (command is a space-separated shell string), cwd=projectDir,
  // env inherited + FORCE_COLOR:'0' to keep ANSI escapes out of the log panel.
  const child = spawn(opts.command, {
    shell: true,
    cwd: opts.projectDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  activeRuns.set(runId, child)

  cb.onStart({ runId, surfaceKey: opts.surfaceKey, kind: opts.kind, command: opts.command })

  let stdoutBuf = ''
  let stderrBuf = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8')
    let nlIdx
    // eslint-disable-next-line no-cond-assign
    while ((nlIdx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nlIdx)
      stdoutBuf = stdoutBuf.slice(nlIdx + 1)
      cb.onOutput({ runId, stream: 'stdout', chunk: line })
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8')
    let nlIdx
    // eslint-disable-next-line no-cond-assign
    while ((nlIdx = stderrBuf.indexOf('\n')) >= 0) {
      const line = stderrBuf.slice(0, nlIdx)
      stderrBuf = stderrBuf.slice(nlIdx + 1)
      cb.onOutput({ runId, stream: 'stderr', chunk: line })
    }
  })

  child.on('error', (err) => {
    activeRuns.delete(runId)
    cancelled.delete(runId)
    cb.onOutput({ runId, stream: 'stderr', chunk: `spawn failed: ${err.message}` })
    cb.onDone({ runId, code: null, status: 'fail' })
  })

  child.on('close', (code) => {
    activeRuns.delete(runId)
    // Flush any trailing partial line.
    if (stdoutBuf) cb.onOutput({ runId, stream: 'stdout', chunk: stdoutBuf })
    if (stderrBuf) cb.onOutput({ runId, stream: 'stderr', chunk: stderrBuf })

    const wasCancelled = cancelled.delete(runId)
    let status: 'pass' | 'fail' | 'cancelled'
    if (wasCancelled) status = 'cancelled'
    else if (code === 0) status = 'pass'
    else status = 'fail'

    cb.onDone({ runId, code, status })
  })

  return runId
}
