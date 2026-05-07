/**
 * po-runner.ts — main-process bridge for PO chat streaming.
 *
 * Spawns the claude CLI with `--output-format stream-json` and parses the JSONL
 * envelope into three renderer-bound events:
 *
 *   po:onToken     (msgId, chunk)            — assistant text token
 *   po:onAnnounce  (msgId, payload)          — tool_use / system / error
 *   po:onDone      (msgId, { sessionId? })   — turn complete
 *
 * Doctrine refs (`packages/core/po/po-instructions.md`):
 *   first turn: claude --agent pdt-<persona> --print --output-format json "$TASK"
 *   resume    : claude --resume "$SID"       --print --output-format json "$TASK"
 *
 * We override `--output-format` with `stream-json` (requires `--verbose`) for
 * token-level streaming. If `claude` is not on PATH OR the productune env file
 * is absent, we fall back to **echo mode** so the UI is exercisable in dev
 * environments without a paid Claude.
 */

import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'
import type { WebContents } from 'electron'

export type Persona = 'pdt-po' | 'pdt-designer' | 'pdt-developer' | 'pdt-qa'

export interface SendOpts {
  /** User message text. */
  text: string
  /** Next delegate persona. Defaults to `pdt-po` (the chat owner). */
  persona?: Persona
  /** Existing claude session UUID to `--resume`. Omit for first turn. */
  resume?: string | null
  /** Project working directory — passed as cwd to spawned claude. */
  projectDir: string
}

export interface AnnouncePayload {
  level: 'system' | 'tool' | 'error'
  text: string
}

interface RunCallbacks {
  onMsgId: (msgId: string) => void
  onToken: (msgId: string, chunk: string) => void
  onAnnounce: (msgId: string, payload: AnnouncePayload) => void
  onDone: (msgId: string, info: { sessionId?: string }) => void
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Run a single PO turn. Returns immediately; events flow through `cb`.
 * Resolves once the underlying child process exits (or echo timer completes).
 */
export async function runPoTurn(opts: SendOpts, cb: RunCallbacks): Promise<void> {
  const msgId = newMsgId()
  cb.onMsgId(msgId)

  // Decide spawn vs. echo.
  if (canSpawnClaude()) {
    return spawnClaude(opts, msgId, cb)
  }
  return echoFallback(opts, msgId, cb)
}

// ── claude detection ────────────────────────────────────────────────────────────

function canSpawnClaude(): boolean {
  // Two preconditions: env file present, claude on PATH.
  const envPath = path.join(os.homedir(), '.productune', 'productune.env')
  if (!fs.existsSync(envPath)) return false

  // Cheap PATH lookup — POSIX shells expose `which`; on Windows, skip.
  if (process.platform === 'win32') return false
  const paths = (process.env.PATH ?? '').split(':')
  for (const p of paths) {
    try {
      if (fs.existsSync(path.join(p, 'claude'))) return true
    } catch { /* ignore */ }
  }
  return false
}

// ── Real spawn ──────────────────────────────────────────────────────────────────

function spawnClaude(opts: SendOpts, msgId: string, cb: RunCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const persona = opts.persona ?? 'pdt-po'

    // Build args — first call uses `--agent`, resume uses `--resume`.
    const args: string[] = []
    if (opts.resume) {
      args.push('--resume', opts.resume)
    } else {
      args.push('--agent', persona)
    }
    args.push('--print', '--output-format', 'stream-json', '--verbose', opts.text)

    const env = { ...process.env, NO_COLOR: '1' }
    const child = spawn('claude', args, {
      env,
      cwd: opts.projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuf = ''
    let stderrBuf = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nlIdx).trim()
        stdoutBuf = stdoutBuf.slice(nlIdx + 1)
        if (line) handleStreamJsonLine(line, msgId, cb)
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stderrBuf.indexOf('\n')) >= 0) {
        const line = stderrBuf.slice(0, nlIdx).trim()
        stderrBuf = stderrBuf.slice(nlIdx + 1)
        if (line) cb.onAnnounce(msgId, { level: 'error', text: line })
      }
    })

    child.on('error', (err) => {
      cb.onAnnounce(msgId, { level: 'error', text: `spawn failed: ${err.message}` })
      cb.onDone(msgId, {})
      resolve()
    })

    child.on('close', (code) => {
      if (stdoutBuf.trim()) handleStreamJsonLine(stdoutBuf.trim(), msgId, cb)
      if (stderrBuf.trim()) {
        cb.onAnnounce(msgId, { level: 'error', text: stderrBuf.trim() })
      }
      if (code !== 0 && code !== null) {
        cb.onAnnounce(msgId, { level: 'error', text: `claude exited with code ${code}` })
      }
      cb.onDone(msgId, { sessionId: capturedSessionId })
      capturedSessionId = undefined
      resolve()
    })
  })
}

// State scratchpad for one turn — captured during `system.init` event.
let capturedSessionId: string | undefined

function handleStreamJsonLine(line: string, msgId: string, cb: RunCallbacks): void {
  let obj: any
  try {
    obj = JSON.parse(line)
  } catch {
    // Not JSON — likely a transient banner. Forward as announce so the user
    // sees something during dev runs.
    cb.onAnnounce(msgId, { level: 'system', text: line })
    return
  }

  const type = obj?.type as string | undefined
  if (!type) return

  if (type === 'system') {
    if (obj?.subtype === 'init' && typeof obj?.session_id === 'string') {
      capturedSessionId = obj.session_id
    }
    return
  }

  if (type === 'assistant') {
    const content = obj?.message?.content
    if (!Array.isArray(content)) return
    for (const part of content) {
      if (part?.type === 'text' && typeof part?.text === 'string') {
        cb.onToken(msgId, part.text)
      } else if (part?.type === 'tool_use' && typeof part?.name === 'string') {
        cb.onAnnounce(msgId, { level: 'tool', text: `→ tool: ${part.name}` })
      }
    }
    return
  }

  if (type === 'result') {
    if (typeof obj?.session_id === 'string') {
      capturedSessionId = obj.session_id
    }
    return
  }

  // Unknown envelope — silent.
}

// ── Echo fallback (no claude installed / no env) ───────────────────────────────

function echoFallback(opts: SendOpts, msgId: string, cb: RunCallbacks): Promise<void> {
  return new Promise((resolve) => {
    cb.onAnnounce(msgId, {
      level: 'system',
      text: '(echo mode — claude CLI not detected)',
    })
    const echo = `Echo: ${opts.text}`
    const chunks = chunkString(echo, 8)
    let i = 0
    const tick = () => {
      if (i >= chunks.length) {
        cb.onDone(msgId, {})
        resolve()
        return
      }
      cb.onToken(msgId, chunks[i++])
      setTimeout(tick, 40)
    }
    setTimeout(tick, 100)
  })
}

function chunkString(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function newMsgId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Renderer subscription helper (bound by main.ts) ─────────────────────────────

/**
 * Bind a single send invocation to a WebContents — emits the three IPC channels
 * (`po:onMsgId`, `po:onToken`, `po:onAnnounce`, `po:onDone`).
 */
export function emitToWebContents(wc: WebContents): RunCallbacks {
  return {
    onMsgId:    (msgId)             => wc.send('po:onMsgId', msgId),
    onToken:    (msgId, chunk)      => wc.send('po:onToken', msgId, chunk),
    onAnnounce: (msgId, payload)    => wc.send('po:onAnnounce', msgId, payload),
    onDone:     (msgId, info)       => wc.send('po:onDone', msgId, info),
  }
}
