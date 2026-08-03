/**
 * prewarm.ts — onboarding Playwright-MCP cache prewarm, with an explicit state (T-440).
 *
 * The old implementation (inline in ipc/onboarding.ts) spawned a bare `npx`
 * with stdio ignored, the inherited launchd PATH, and a void resolve on every
 * outcome — on a fresh participant Mac it failed instantly and SILENTLY
 * (T-439 unresolved). Two fixes here:
 *
 *   1. The child runs under withLoginShellPath's PATH — which now ends with
 *      the app-provided toolchain (toolchain.ts), so `npx` resolves on a
 *      machine with no JS toolchain of its own, and the user's own npx still
 *      wins when one exists (resolution order proven in
 *      surface-runner.path.test.ts).
 *   2. It resolves with a STATE — ready | failed | timeout (+ output tail) —
 *      which onboarding:complete forwards to the renderer. It never rejects
 *      and never blocks onboarding: the MCP config retries lazily at first
 *      QA use, so a non-ready state is a report, not a stop.
 *
 * No electron import (unit-testable + live-proof-drivable under plain Node).
 */

import { spawn } from 'child_process'
import { withLoginShellPath } from './surface-runner'

export type PrewarmState = 'ready' | 'failed' | 'timeout'

export interface PrewarmResult {
  state: PrewarmState
  /** Output tail (stdout+stderr) — diagnostics for logs, never shown raw to the user. */
  detail?: string
}

export interface PrewarmOpts {
  /** Test/driver override of the shell command. */
  command?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

const PREWARM_TIMEOUT_MS = 60_000
const DETAIL_TAIL_CHARS = 800

/** The npx invocation is a fixed literal (never renderer input) — shell:true is
 *  how the command word gets resolved against the CHILD env's PATH. */
const PREWARM_COMMAND = 'npx -y @playwright/mcp@latest --help'

export function prewarmPlaywrightMcp(opts: PrewarmOpts = {}): Promise<PrewarmResult> {
  return new Promise((resolve) => {
    const child = spawn(opts.command ?? PREWARM_COMMAND, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: opts.env ?? withLoginShellPath(process.env),
    })

    let tail = ''
    const collect = (raw: Buffer) => {
      tail = (tail + raw.toString('utf-8')).slice(-DETAIL_TAIL_CHARS * 3)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)

    let settled = false
    const settle = (res: PrewarmResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(res)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ok */ }
      settle({ state: 'timeout', detail: tail.slice(-DETAIL_TAIL_CHARS) || undefined })
    }, opts.timeoutMs ?? PREWARM_TIMEOUT_MS)

    child.on('error', (err) => {
      settle({ state: 'failed', detail: err?.message })
    })
    child.on('close', (code) => {
      settle(
        code === 0
          ? { state: 'ready', detail: tail.slice(-DETAIL_TAIL_CHARS) || undefined }
          : { state: 'failed', detail: (tail || `exit ${code}`).slice(-DETAIL_TAIL_CHARS) },
      )
    })
  })
}
