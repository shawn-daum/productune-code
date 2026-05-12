import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogChunk = string

export interface LogStreamHandle {
  /** Kill the underlying child process. Safe to call multiple times. */
  stop: () => void
  /** Resolves when the process exits (normally or via stop()). */
  done: Promise<void>
}

export type LogStreamError =
  | { code: 'cli-not-installed' }
  | { code: 'spawn-error'; detail: string }

// ── vercel CLI detection ──────────────────────────────────────────────────────

/**
 * Resolve vercel CLI path. Checks PATH for `vercel`; returns null if not found.
 * We intentionally avoid which/where so it works cross-platform without an
 * extra async hop — spawn itself will throw ENOENT if not found.
 */
function vercelBin(): string {
  return 'vercel'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Stream `vercel logs --follow <deploymentUrl>` output.
 *
 * @param deploymentUrl  Full https:// deployment URL from createDeployment.
 * @param token          Vercel API token (passed via VERCEL_TOKEN env).
 * @param onChunk        Called with each line of stdout/stderr output.
 * @returns A handle to stop streaming, or a LogStreamError if CLI is absent.
 */
export function streamLogs(
  deploymentUrl: string,
  token: string,
  onChunk: (chunk: LogChunk) => void,
): LogStreamHandle | LogStreamError {
  let child: ChildProcess | null = null
  let stopped = false

  let resolveDone!: () => void
  const done = new Promise<void>((res) => { resolveDone = res })

  try {
    child = spawn(vercelBin(), ['logs', '--follow', deploymentUrl], {
      env: { ...process.env, VERCEL_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    const detail = err?.message ?? String(err)
    // ENOENT = CLI not found
    if (err?.code === 'ENOENT') {
      return { code: 'cli-not-installed' }
    }
    return { code: 'spawn-error', detail }
  }

  const emit = (data: Buffer) => {
    if (stopped) return
    for (const line of data.toString('utf8').split('\n')) {
      const trimmed = line.trimEnd()
      if (trimmed) onChunk(trimmed)
    }
  }

  child.stdout?.on('data', emit)
  child.stderr?.on('data', emit)

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (stopped) return
    if (err.code === 'ENOENT') {
      onChunk('[error] vercel CLI not installed — install via: npm i -g vercel')
    } else {
      onChunk(`[error] ${err.message}`)
    }
    resolveDone()
  })

  child.on('close', () => {
    resolveDone()
  })

  const stop = () => {
    if (stopped) return
    stopped = true
    try { child?.kill('SIGTERM') } catch { /* ok */ }
  }

  return { stop, done }
}

/** Check if vercel CLI is available. Resolves true/false. */
export async function isVercelCliInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(vercelBin(), ['--version'], {
      stdio: 'ignore',
      timeout: 3000,
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}
