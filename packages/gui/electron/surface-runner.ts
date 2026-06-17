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

import { spawn, execFileSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'

export type SurfaceKind = 'build' | 'run'

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
/**
 * T-PATCH-187: SIGTERM the whole process GROUP, not just the immediate child.
 *
 * Commands run via `shell:true` → the child is `/bin/sh -c "<command>"`, and the
 * real work (e.g. `next dev`) is a grandchild. Killing only the shell can orphan
 * the server, leaving its port occupied. We spawn `detached:true` so the child is
 * its own group leader (pgid === pid); `process.kill(-pid)` then signals the whole
 * group. Falls back to a direct child kill if the group signal fails.
 */
function terminate(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  try {
    if (typeof child.pid === 'number') process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    try { child.kill(signal) } catch { /* already gone */ }
  }
}

export function cancelSurfaceRun(runId: string): boolean {
  const child = activeRuns.get(runId)
  if (child && !child.killed) {
    cancelled.add(runId)
    terminate(child)
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
    if (!child.killed) terminate(child)
  }
  activeRuns.clear()
}

/** runIds that received an explicit cancel — used to classify SIGTERM exits. */
const cancelled = new Set<string>()

/**
 * T-PATCH-186: resolve the user's *login-shell* PATH, cached for the process.
 *
 * When the app is launched from Finder / a packaged .app, Electron inherits
 * launchd's minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) — missing Homebrew
 * (`/opt/homebrew/bin`), language version managers (asdf/fvm/nvm shims), and
 * SDK tool dirs (`~/flutter/bin`, `~/.pub-cache/bin`). So global build tools
 * like `flutter` / `xcodebuild` / `gradle` / `pod` / `cargo` exit 127 even
 * though they work in the user's terminal. Asking the login shell for its PATH
 * (the `fix-path` approach) recovers them. Returns '' on failure or Windows.
 */
let loginShellPathCache: string | null = null
function loginShellPath(): string {
  if (loginShellPathCache !== null) return loginShellPathCache
  if (process.platform === 'win32') return (loginShellPathCache = '')
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    // -ilc: interactive+login so both .zprofile (Homebrew) and .zshrc (asdf/fvm)
    // are sourced. Sentinel-delimit to survive any shell banner noise on stdout.
    const out = execFileSync(shell, ['-ilc', 'echo -n __PB_PATH__"$PATH"__PB_END__'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const m = out.match(/__PB_PATH__(.*)__PB_END__/s)
    return (loginShellPathCache = m ? m[1] : '')
  } catch {
    return (loginShellPathCache = '')
  }
}

/**
 * T-PATCH-186: build a PATH that resolves both project-local and global tools.
 *
 *   1. Project `node_modules/.bin` dirs (projectDir → root) — JS-local CLIs like
 *      `next` / `vite` / `tsc`. npm/pnpm prepend these for scripts; our raw
 *      /bin/sh spawn does not, so a bare `next` exits 127 without this.
 *   2. The login-shell PATH (see loginShellPath) — global SDK tools.
 *   3. The inherited process PATH — last, as a floor.
 *
 * Deduped, order-preserving (earlier entries win).
 */
function pathWithLocalBins(projectDir: string): string {
  const localBins: string[] = []
  let dir = path.resolve(projectDir)
  // Cap the climb defensively (deep monorepos are still < 32 levels).
  for (let i = 0; i < 32; i++) {
    const bin = path.join(dir, 'node_modules', '.bin')
    if (fs.existsSync(bin)) localBins.push(bin)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const sep = path.delimiter
  const merged = [
    ...localBins,
    ...loginShellPath().split(sep),
    ...(process.env.PATH ?? '').split(sep),
  ].filter(Boolean)

  return [...new Set(merged)].join(sep)
}

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
  opts: { projectDir: string; surfaceKey: string; kind: SurfaceKind; command: string; extraEnv?: Record<string, string> },
  cb: SurfaceRunCallbacks,
): string {
  const runId = newRunId()

  // T-PATCH-186/187: build a clean child env.
  //  - Start from process.env, then DELETE NODE_ENV — Electron runs with
  //    NODE_ENV='development', and leaking that into a build/run puts e.g. a
  //    `next build` into a broken "production pipeline + development runtime"
  //    state that crashes static prerender (/_not-found → "reading 'use' of
  //    null"). A clean terminal has NODE_ENV unset, so the tool sets its own.
  //  - Then apply extraEnv (a selected `.env*` file's vars) — so a file that
  //    intentionally sets NODE_ENV still wins over our delete.
  //  - FORCE_COLOR:'0' keeps ANSI escapes out of the log panel; PATH is
  //    augmented to resolve project-local + global tools.
  const base: NodeJS.ProcessEnv = { ...process.env }
  delete base.NODE_ENV
  const childEnv: NodeJS.ProcessEnv = {
    ...base,
    ...(opts.extraEnv ?? {}),
    FORCE_COLOR: '0',
    PATH: pathWithLocalBins(opts.projectDir),
  }

  // D3: shell:true (command is a space-separated shell string), cwd=projectDir.
  // detached:true → child is its own process-group leader so `terminate()` can
  // SIGTERM the whole group (shell + grandchild server), not just the shell.
  const child = spawn(opts.command, {
    shell: true,
    cwd: opts.projectDir,
    env: childEnv,
    detached: true,
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
