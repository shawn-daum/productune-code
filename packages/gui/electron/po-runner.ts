/**
 * po-runner.ts — main-process bridge for PO chat streaming.
 *
 * Spawns the claude CLI with `--output-format stream-json` and parses the JSONL
 * envelope into three renderer-bound events:
 *
 *   po:onToken     (msgId, chunk)            — assistant text token
 *   po:onAnnounce  (msgId, payload)          — tool_use / system / error
 *   po:onDone      (msgId, { sessionId? })   — turn complete
 *   po:onHealth    (event: PoHealthEvent)    — session health change (T-P4-059)
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
import type { ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'
import type { WebContents } from 'electron'
import { fireNotification } from './notifications'

/**
 * The chat panel always sends to PO. Other personas are reached via PO
 * dispatch (Task tool delegation), surfaced to the renderer via
 * `PersonaPresenceBar` events. (v2 sub-c: persona selector removed.)
 */
const PO_AGENT = 'pdt-po' as const

export interface SendOpts {
  /** User message text. */
  text: string
  /** Existing claude session UUID to `--resume`. Omit for first turn. */
  resume?: string | null
  /** Project working directory — passed as cwd to spawned claude. */
  projectDir: string
}

export interface AnnouncePayload {
  level: 'system' | 'tool' | 'error'
  text: string
}

// ── Health event types (T-P4-059) ────────────────────────────────────────────

export type PoHealthState =
  | 'healthy'
  | 'delegating'
  | 'compacting'
  | 'rate-limited'
  | 'permission-blocked'
  | 'error-other'

export interface PoHealthDetail {
  persona?: string
  resetAt?: string
  /** rate-limited — retry-after seconds extracted from stderr or stream-json envelope */
  retryAfterSec?: number
  errorMessage?: string
  deniedPattern?: string
}

export interface PoHealthEvent {
  state: PoHealthState
  detail?: PoHealthDetail
  at: string
  msgId?: string
}

// ── Todo items (T-P4-113) ─────────────────────────────────────────────────────

/** Raw todo item shape as parsed from PO envelope JSON. */
export interface TodoItemRaw {
  id?: string
  description: string
  type?: 'check' | 'text-input' | 'link'
  href?: string
}

// ── Ticket focus (T-P4-114 §B) ───────────────────────────────────────────────

export interface TicketFocusItem {
  ticketId: string
  reason: 'emit' | 'dispatch'
}

// ── Phase-transition gate (T-019 §B3) ─────────────────────────────────────────

/** Minimal slice of a pending_gate envelope needed for notification copy. */
export interface PendingGateInfo {
  fromPhase?: number
  toPhase?: number
  summary?: string
}

// ── AskUserQuestion (T-PATCH-037) ─────────────────────────────────────────────

/**
 * Main-process mirror of `AskUserQuestionPayload` (src/lib/types.ts:85).
 * Field names are byte-identical so the renderer can consume it directly.
 * `resolved` is omitted here — it's stamped renderer-side on selection.
 */
export interface AskUserQuestionPayload {
  question: string
  options: Array<{ key: string; title: string; description?: string }>
}

interface RunCallbacks {
  onMsgId: (msgId: string) => void
  onToken: (msgId: string, chunk: string) => void
  onAnnounce: (msgId: string, payload: AnnouncePayload) => void
  onDone: (msgId: string, info: { sessionId?: string }) => void
  onHealth: (event: PoHealthEvent) => void
  /** Emitted when PO response contains manual_steps_pending / pending_user_actions. */
  onTodoItems: (items: TodoItemRaw[]) => void
  /** T-P4-114 §B: ticket emit / dispatch detected in PO envelope. */
  onTicketFocus: (ticketId: string, reason: 'emit' | 'dispatch') => void
  /** T-P4-114 §A: changed_files[] detected in PO envelope. */
  onArtifactOpen: (files: string[]) => void
  /** T-P4-116: QA envelope browser_url 감지 → browser tab auto-open. */
  onBrowserOpen: (
    url: string,
    ticketId: string,
    purpose: 'qa-smoke' | 'user-verify',
  ) => void
  /** T-P4-116: QA pass + verify_url 감지 → user-verify flow. */
  onUserVerify: (
    url: string | undefined,
    description: string,
    ticketId: string,
  ) => void
  /** T-P4-116: QA loop 상태 변화 감지 → BackgroundTaskSegment badge 갱신. */
  onQaLoopUpdate: (entry: {
    ticketId: string
    attempt: number
    maxAttempts: number
    status: 'dev-running' | 'qa-running' | 'pass' | 'fail' | 'capped' | 'auth-required'
    lastFailReason?: string
  }) => void
  /** T-019 §B3: PO emitted a phase-transition gate (pending_gate) in its envelope. */
  onPhaseGate: (gate: PendingGateInfo) => void
  /**
   * T-PATCH-037: PO emitted an AskUserQuestion. `msgId` is the turn's msgId
   * (renderer derives a distinct card id from it). Dual-path: fires from the
   * assistant tool_use stream (Path A) OR the result-text marker (Path B).
   */
  onAskUserQuestion: (msgId: string, payload: AskUserQuestionPayload) => void
}

// ── Active child tracking (T-PATCH-081) ──────────────────────────────────────────
// Single-turn model: only one claude child runs at a time. Module-level ref allows
// abortActiveTurn() to SIGTERM it from the po:abort IPC handler without threading
// the handle through callbacks. Cleared on close so repeated aborts are safe no-ops.

let activeChild: ChildProcess | null = null

/**
 * Abort the currently running PO turn by sending SIGTERM to the claude child.
 * Safe to call when no child is running (activeChild === null → no-op).
 * Echo-mode safe: spawnClaude is not called → activeChild stays null → no-op.
 */
export function abortActiveTurn(): void {
  if (activeChild && !activeChild.killed) {
    activeChild.kill('SIGTERM')
  }
  activeChild = null
}

/**
 * T-PATCH-086: check whether a PO turn is currently in flight.
 * Used by the quit guard to decide whether to show the native abort-and-quit dialog
 * instead of the two-tap overlay.
 */
export function isPoRunning(): boolean {
  return activeChild != null && !activeChild.killed
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

// ── Health state machine ──────────────────────────────────────────────────────

interface HealthContext {
  lastToolUse: string | null        // tool name of the most recent tool_use
  lastToolUseAt: number | null      // Date.now() of the most recent tool_use
  lastEmittedState: PoHealthState
  msgId: string
  /** setTimeout handle for the permission-blocked timeout heuristic */
  toolUseTimeoutHandle: ReturnType<typeof setTimeout> | null
  /** setTimeout handle for the compacting heuristic (silence timeout) */
  silenceTimeoutHandle: ReturnType<typeof setTimeout> | null
  lastTokenAt: number | null
}

const TOOL_USE_TIMEOUT_MS = 30_000   // provisional permission-blocked
const SILENCE_TIMEOUT_MS  = 15_000   // heuristic compacting

function makeHealthCtx(msgId: string): HealthContext {
  return {
    lastToolUse: null,
    lastToolUseAt: null,
    lastEmittedState: 'healthy',
    msgId,
    toolUseTimeoutHandle: null,
    silenceTimeoutHandle: null,
    lastTokenAt: null,
  }
}

function emitHealth(
  state: PoHealthState,
  detail: PoHealthDetail | undefined,
  ctx: HealthContext,
  cb: RunCallbacks,
): void {
  // Dedupe — only emit when state changes.
  if (state === ctx.lastEmittedState) return
  ctx.lastEmittedState = state
  cb.onHealth({ state, detail, at: new Date().toISOString(), msgId: ctx.msgId })
}

function clearToolUseTimeout(ctx: HealthContext): void {
  if (ctx.toolUseTimeoutHandle !== null) {
    clearTimeout(ctx.toolUseTimeoutHandle)
    ctx.toolUseTimeoutHandle = null
  }
}

function clearSilenceTimeout(ctx: HealthContext): void {
  if (ctx.silenceTimeoutHandle !== null) {
    clearTimeout(ctx.silenceTimeoutHandle)
    ctx.silenceTimeoutHandle = null
  }
}

function armSilenceTimeout(ctx: HealthContext, cb: RunCallbacks): void {
  clearSilenceTimeout(ctx)
  ctx.silenceTimeoutHandle = setTimeout(() => {
    // Only fire if still healthy/delegating (not already in a worse state)
    if (
      ctx.lastEmittedState === 'healthy' ||
      ctx.lastEmittedState === 'delegating'
    ) {
      emitHealth('compacting', undefined, ctx, cb)
    }
  }, SILENCE_TIMEOUT_MS)
}

/** Inspect a stderr line for health signals. */
function handleStderrHealth(line: string, ctx: HealthContext, cb: RunCallbacks): void {
  // Rate limit — checked before permission so 429 takes priority in stderr
  if (/rate.?limit/i.test(line) || /quota/i.test(line)) {
    let resetAt: string | undefined
    let retryAfterSec: number | undefined

    // Priority 1: retry-after: <seconds>
    const retryAfterMatch = line.match(/retry-after:\s*(\d+)/i)
    if (retryAfterMatch) retryAfterSec = parseInt(retryAfterMatch[1], 10)

    // Priority 2: x-ratelimit-reset-requests: <ISO>
    if (!resetAt) {
      const xResetMatch = line.match(/x-ratelimit-reset-requests:\s*([0-9T:+\-Z.]+)/i)
      if (xResetMatch) resetAt = xResetMatch[1]
    }

    // Priority 3: resets? at <ISO>
    if (!resetAt) {
      const resetMatch = line.match(/resets?\s+at\s+([0-9:T+\-Z.]+)/i)
      if (resetMatch) resetAt = resetMatch[1]
    }

    clearToolUseTimeout(ctx)
    emitHealth('rate-limited', { resetAt, retryAfterSec }, ctx, cb)
    return
  }

  // Permission denied
  const permissionTools = ['Write', 'Edit', 'Bash']
  const isPermissionTool = ctx.lastToolUse !== null && permissionTools.includes(ctx.lastToolUse)
  if (/(permission|denied|deny)/i.test(line) && isPermissionTool) {
    clearToolUseTimeout(ctx)
    emitHealth('permission-blocked', { deniedPattern: ctx.lastToolUse ?? undefined }, ctx, cb)
    return
  }
}

/** Inspect an assistant content text for permission patterns. */
function handleTextHealth(text: string, ctx: HealthContext, cb: RunCallbacks): void {
  if (/^I (need|require) (your )?permission/i.test(text)) {
    clearToolUseTimeout(ctx)
    emitHealth('permission-blocked', { deniedPattern: ctx.lastToolUse ?? undefined }, ctx, cb)
  }
}

/** Process a tool_use part — record and arm timeouts. */
function handleToolUseHealth(toolName: string, ctx: HealthContext, cb: RunCallbacks): void {
  ctx.lastToolUse = toolName
  ctx.lastToolUseAt = Date.now()

  // Task tool → delegating
  if (toolName === 'Task') {
    clearToolUseTimeout(ctx)
    clearSilenceTimeout(ctx)
    emitHealth('delegating', undefined, ctx, cb)
    return
  }

  // Write / Edit / Bash → arm provisional permission-blocked timeout
  const permissionTools = ['Write', 'Edit', 'Bash']
  if (permissionTools.includes(toolName)) {
    clearToolUseTimeout(ctx)
    ctx.toolUseTimeoutHandle = setTimeout(() => {
      // 30s without a result → provisional permission-blocked
      if (ctx.lastEmittedState !== 'permission-blocked') {
        emitHealth('permission-blocked', { deniedPattern: toolName }, ctx, cb)
      }
    }, TOOL_USE_TIMEOUT_MS)
  }
}

// ── Real spawn ──────────────────────────────────────────────────────────────────

function spawnClaude(opts: SendOpts, msgId: string, cb: RunCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const hCtx = makeHealthCtx(msgId)

    // T-PATCH-037: reset per-turn AskUserQuestion de-dupe flag.
    askEmitted = false

    // Emit healthy at turn start.
    emitHealth('healthy', undefined, hCtx, cb)

    // Build args — first call uses `--agent pdt-po`, resume uses `--resume`.
    const args: string[] = []
    if (opts.resume) {
      // T-PATCH-043 (AC1): re-pass `--agent` on resume turns too. `--resume`
      // alone does NOT restore the agent system prompt (hardened pointer) nor
      // populate `agent_type` in the SessionStart hook input — so doctrine
      // would be lost on every resume turn (most GUI turns). Live-confirmed
      // that `--resume` + `--agent` coexist safely.
      args.push('--resume', opts.resume, '--agent', PO_AGENT)
    } else {
      args.push('--agent', PO_AGENT)
    }
    args.push('--print', '--output-format', 'stream-json', '--verbose', opts.text)

    const env = { ...process.env, NO_COLOR: '1' }
    const child = spawn('claude', args, {
      env,
      cwd: opts.projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // T-PATCH-081: track active child for po:abort IPC abort path.
    activeChild = child

    let stdoutBuf = ''
    let stderrBuf = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      // Arm/reset silence timeout on any stdout data.
      armSilenceTimeout(hCtx, cb)
      hCtx.lastTokenAt = Date.now()

      stdoutBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nlIdx).trim()
        stdoutBuf = stdoutBuf.slice(nlIdx + 1)
        if (line) handleStreamJsonLine(line, msgId, cb, hCtx)
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stderrBuf.indexOf('\n')) >= 0) {
        const line = stderrBuf.slice(0, nlIdx).trim()
        stderrBuf = stderrBuf.slice(nlIdx + 1)
        if (line) {
          cb.onAnnounce(msgId, { level: 'error', text: line })
          handleStderrHealth(line, hCtx, cb)
        }
      }
    })

    child.on('error', (err) => {
      clearToolUseTimeout(hCtx)
      clearSilenceTimeout(hCtx)
      emitHealth('error-other', { errorMessage: err.message }, hCtx, cb)
      cb.onAnnounce(msgId, { level: 'error', text: `spawn failed: ${err.message}` })
      cb.onDone(msgId, {})
      resolve()
    })

    child.on('close', (code) => {
      // T-PATCH-081: clear active child ref on close (handles both normal exit and SIGTERM).
      activeChild = null
      clearToolUseTimeout(hCtx)
      clearSilenceTimeout(hCtx)

      if (stdoutBuf.trim()) handleStreamJsonLine(stdoutBuf.trim(), msgId, cb, hCtx)
      if (stderrBuf.trim()) {
        const line = stderrBuf.trim()
        cb.onAnnounce(msgId, { level: 'error', text: line })
        handleStderrHealth(line, hCtx, cb)
      }
      if (code !== 0 && code !== null) {
        cb.onAnnounce(msgId, { level: 'error', text: `claude exited with code ${code}` })
        // Only set error-other if no other state was set.
        if (hCtx.lastEmittedState === 'healthy') {
          emitHealth('error-other', { errorMessage: `exit code ${code}` }, hCtx, cb)
        }
      } else {
        // Normal exit — recover to healthy.
        emitHealth('healthy', undefined, hCtx, cb)
      }
      cb.onDone(msgId, { sessionId: capturedSessionId })
      capturedSessionId = undefined
      askEmitted = false   // T-PATCH-037: clear de-dupe for the next turn
      resolve()
    })
  })
}

// State scratchpad for one turn — captured during `system.init` event.
let capturedSessionId: string | undefined

// T-PATCH-037: per-turn de-dupe flag (AC3). Path A (assistant tool_use) sets it;
// Path B (result-text marker) only emits when still false. Reset on turn start
// (spawnClaude) and after onDone — single in-flight turn model.
let askEmitted = false

function handleStreamJsonLine(
  line: string,
  msgId: string,
  cb: RunCallbacks,
  hCtx: HealthContext,
): void {
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
    // Compacting pre-signal (OQ: may or may not arrive — best-effort).
    if (obj?.subtype === 'compact_pre' || obj?.compact === true) {
      emitHealth('compacting', undefined, hCtx, cb)
    }
    return
  }

  if (type === 'assistant') {
    const content = obj?.message?.content
    if (!Array.isArray(content)) return
    for (const part of content) {
      if (part?.type === 'text' && typeof part?.text === 'string') {
        cb.onToken(msgId, part.text)
        handleTextHealth(part.text, hCtx, cb)
      } else if (part?.type === 'tool_use' && typeof part?.name === 'string') {
        // ── T-PATCH-037 Path A: AskUserQuestion tool_use (PO-only) ──────────
        // Normalize Claude's AskUserQuestion input → AskUserQuestionPayload and
        // emit the card. Skip the generic `→ tool:` announce + health for this
        // tool so it doesn't (a) leave a stray trace, or (b) arm a permission
        // timeout. v1 surfaces the FIRST question only (multi-question = OOS).
        if (part.name === 'AskUserQuestion') {
          const payload = normalizeAskUserQuestion(part.input)
          if (payload && !askEmitted) {
            askEmitted = true
            cb.onAskUserQuestion(msgId, payload)
          }
          continue
        }

        cb.onAnnounce(msgId, { level: 'tool', text: `→ tool: ${part.name}` })
        handleToolUseHealth(part.name, hCtx, cb)

        // Extract subagent_type for delegating detail.
        if (part.name === 'Task' && typeof part?.input?.subagent_type === 'string') {
          // Re-emit with persona detail (dedupe guard bypassed by clearing lastEmittedState).
          hCtx.lastEmittedState = 'healthy'   // allow re-emit with detail
          emitHealth('delegating', { persona: part.input.subagent_type }, hCtx, cb)
        }
      }
    }
    return
  }

  if (type === 'result') {
    if (typeof obj?.session_id === 'string') {
      capturedSessionId = obj.session_id
    }
    // Error result
    if (obj?.subtype === 'error' || obj?.is_error === true) {
      clearToolUseTimeout(hCtx)
      const errStr = JSON.stringify(obj?.error ?? '')
      if (/rate_limit_error|429|rate.?limit/i.test(errStr)) {
        let retryAfterSec: number | undefined
        let resetAt: string | undefined
        if (typeof obj?.retry_after === 'number') retryAfterSec = obj.retry_after
        emitHealth('rate-limited', { retryAfterSec, resetAt }, hCtx, cb)
      } else {
        emitHealth('error-other', { errorMessage: obj?.error ?? 'result error' }, hCtx, cb)
      }
      return
    }
    // Normal result — clear tool-use timeout and recover to healthy.
    clearToolUseTimeout(hCtx)
    clearSilenceTimeout(hCtx)
    emitHealth('healthy', undefined, hCtx, cb)

    // ── Todo item extraction (T-P4-113) ───────────────────────────────────
    // ── Ticket focus + artifact open (T-P4-114) ───────────────────────────
    if (typeof obj?.result === 'string') {
      const resultText = obj.result

      const todoItems = parseTodoItems(resultText)
      if (todoItems.length > 0) cb.onTodoItems(todoItems)

      // T-P4-114 §B: ticket emit/dispatch
      const ticketItems = parseTicketFocusItems(resultText)
      for (const item of ticketItems) {
        cb.onTicketFocus(item.ticketId, item.reason)
      }

      // T-P4-114 §A: artifact changed_files
      const artifactFiles = parseArtifactFiles(resultText)
      if (artifactFiles.length > 0) cb.onArtifactOpen(artifactFiles)

      // T-P4-116: QA envelope dispatch
      const qaEnv = parseQaEnvelope(resultText)
      if (qaEnv) {
        const ticketId =
          typeof qaEnv.ticket_id === 'string' ? qaEnv.ticket_id : ''

        // browser_url 있으면 browser-open
        if (typeof qaEnv.browser_url === 'string' && qaEnv.browser_url) {
          cb.onBrowserOpen(qaEnv.browser_url, ticketId, 'qa-smoke')
        }

        // qa_status === 'pass' → user-verify
        if (qaEnv.qa_status === 'pass') {
          cb.onUserVerify(
            typeof qaEnv.verify_url === 'string' ? qaEnv.verify_url : undefined,
            typeof qaEnv.verify_description === 'string'
              ? qaEnv.verify_description
              : '구현 결과 확인',
            ticketId,
          )
        }

        // qa_loops 또는 qa_status 변화 → qa-loop-update
        if (qaEnv.qa_loops !== undefined || qaEnv.qa_status !== undefined) {
          const rawStatus = qaEnv.qa_status
          const loopStatus: 'dev-running' | 'qa-running' | 'pass' | 'fail' | 'capped' | 'auth-required' =
            rawStatus === 'pass'    ? 'pass'       :
            rawStatus === 'fail'    ? 'fail'       :
            rawStatus === 'running' ? 'qa-running' :
            'qa-running'
          cb.onQaLoopUpdate({
            ticketId,
            attempt: typeof qaEnv.qa_loops === 'number' ? qaEnv.qa_loops : 1,
            maxAttempts: 3,
            status: loopStatus,
            lastFailReason: typeof qaEnv.fail_reason === 'string'
              ? qaEnv.fail_reason
              : undefined,
          })
        }

        // auth_required → po:todo-items (기존 onTodoItems 채널 재사용)
        if (qaEnv.auth_required && typeof qaEnv.auth_required === 'object') {
          const { service, instruction, type } = qaEnv.auth_required
          cb.onTodoItems([{
            id: `qa-auth-${ticketId}-${Date.now()}`,
            description: `인증 필요: ${service} — ${instruction}`,
            type: type === 'env-var' ? 'text-input' : 'check',
          }])
        }
      }

      // T-019 §B3: phase-transition gate emit → notification
      const gate = parsePendingGate(resultText)
      if (gate) cb.onPhaseGate(gate)

      // ── T-PATCH-037 Path B: AskUserQuestion result-text marker (fallback) ──
      // Doctrine-clean channel — PO is the only AskUserQuestion caller and
      // already returns a structured result JSON, so it can surface the
      // question via an `ask_user_question` marker even when --print cancels the
      // raw tool_use before flushing it. Emit only if Path A didn't fire (AC3).
      if (!askEmitted) {
        const askPayload = parseAskUserQuestion(resultText)
        if (askPayload) {
          askEmitted = true
          cb.onAskUserQuestion(msgId, askPayload)
        }
      }
    }
    return
  }

  // Unknown envelope — silent.
}

// ── Todo item parser (T-P4-113) ────────────────────────────────────────────────

/**
 * Attempt to extract todo items from a PO result text.
 * Looks for a JSON block (```json … ```) or raw `{…}` containing
 * `manual_steps_pending` or `pending_user_actions` arrays.
 */
function parseTodoItems(text: string): TodoItemRaw[] {
  // Collect candidate JSON strings: prefer ```json block, then raw object.
  const candidates: string[] = []

  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch?.[1]) candidates.push(jsonBlockMatch[1])

  // Raw JSON object — be conservative: only if we see the key names we need.
  if (/manual_steps_pending|pending_user_actions/.test(text)) {
    const rawObjMatch = text.match(/\{[\s\S]*\}/)
    if (rawObjMatch?.[0]) candidates.push(rawObjMatch[0])
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        for (const key of ['manual_steps_pending', 'pending_user_actions']) {
          const arr = obj[key]
          if (Array.isArray(arr)) {
            const items: TodoItemRaw[] = arr
              .filter(
                (item): item is Record<string, unknown> =>
                  item !== null && typeof item === 'object',
              )
              .filter((item) => typeof item.description === 'string')
              .map((item) => ({
                id: typeof item.id === 'string' ? item.id : undefined,
                description: item.description as string,
                type:
                  item.type === 'check' ||
                  item.type === 'text-input' ||
                  item.type === 'link'
                    ? item.type
                    : 'check',
                href: typeof item.href === 'string' ? item.href : undefined,
              }))
            if (items.length > 0) return items
          }
        }
      }
    } catch {
      /* ignore parse failures */
    }
  }

  return []
}

// ── Echo fallback (no claude installed / no env) ───────────────────────────────

function echoFallback(opts: SendOpts, msgId: string, cb: RunCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const hCtx = makeHealthCtx(msgId)
    // Start healthy.
    emitHealth('healthy', undefined, hCtx, cb)

    cb.onAnnounce(msgId, {
      level: 'system',
      text: '(echo mode — claude CLI not detected)',
    })
    const echo = `Echo: ${opts.text}`
    const chunks = chunkString(echo, 8)
    let i = 0
    const tick = () => {
      if (i >= chunks.length) {
        // End healthy.
        emitHealth('healthy', undefined, hCtx, cb)
        // Echo mode: no todo/ticket/artifact items emitted (noop).
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

// ── Shared JSON candidate extractor ───────────────────────────────────────────

/**
 * Extract JSON string candidates from a result text.
 * Tries a ```json ... ``` fence block first, then falls back to a raw `{...}` match.
 */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = []
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1])
  const rawMatch = text.match(/\{[\s\S]*\}/)
  if (rawMatch?.[0]) candidates.push(rawMatch[0])
  return candidates
}

// ── Ticket focus parser (T-P4-114 §B) ────────────────────────────────────────

/**
 * Extract ticket focus items from PO result text.
 *
 * - `tickets[]` key → reason 'emit'  (PO issued new tickets)
 * - `delegation.ticket_id` key → reason 'dispatch'  (PO delegated work)
 */
function parseTicketFocusItems(text: string): TicketFocusItem[] {
  const results: TicketFocusItem[] = []

  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>

      // tickets[] → 'emit'
      if (Array.isArray(obj.tickets)) {
        for (const t of obj.tickets) {
          // Ticket entry may be a plain string ID or an object with ticket_id / id key
          const id =
            typeof t === 'string'
              ? t
              : typeof (t as any)?.ticket_id === 'string'
              ? (t as any).ticket_id
              : typeof (t as any)?.id === 'string'
              ? (t as any).id
              : null
          if (id) results.push({ ticketId: id, reason: 'emit' })
        }
      }

      // delegation.ticket_id → 'dispatch'
      if (obj.delegation && typeof obj.delegation === 'object') {
        const delegation = obj.delegation as Record<string, unknown>
        if (typeof delegation.ticket_id === 'string' && delegation.ticket_id) {
          results.push({ ticketId: delegation.ticket_id, reason: 'dispatch' })
        }
      }

      if (results.length > 0) return results
    } catch { /* ignore */ }
  }

  return results
}

// ── Artifact open parser (T-P4-114 §A) ───────────────────────────────────────

/**
 * Extract changed_files[] from PO result text.
 * Returns an empty array when the key is absent or unparseable.
 */
function parseArtifactFiles(text: string): string[] {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.changed_files)) {
        return obj.changed_files.filter((f): f is string => typeof f === 'string')
      }
    } catch { /* ignore */ }
  }
  return []
}

// ── QA envelope parser (T-P4-116) ─────────────────────────────────────────────

interface QaEnvelope {
  persona?: string
  ticket_id?: string
  qa_status?: 'pass' | 'fail' | 'running'
  qa_loops?: number
  browser_url?: string | null
  verify_url?: string | null
  verify_description?: string | null
  auth_required?: {
    service: string
    instruction: string
    type: 'manual' | 'oauth' | 'env-var'
  } | null
  fail_reason?: string | null
}

/**
 * QA persona 결과 텍스트에서 QA envelope 추출.
 * 판별 조건: persona === 'pdt-qa' OR qa_status 키 존재 OR browser_url 키 존재.
 * 없으면 null 반환 (noop).
 */
function parseQaEnvelope(text: string): QaEnvelope | null {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>
      if (
        obj.persona === 'pdt-qa' ||
        obj.qa_status !== undefined ||
        obj.browser_url !== undefined
      ) {
        return obj as QaEnvelope
      }
    } catch { /* ignore */ }
  }
  return null
}

// ── Pending-gate parser (T-019 §B3) ───────────────────────────────────────────

/**
 * Extract a phase-transition gate from PO result text.
 *
 * The PO emits a `pending_gate` object (see lib/types.ts PendingGate +
 * po/bookshelf/lifecycle-mechanics.md) when a phase boundary is reached. We
 * read the minimal slice needed for notification copy. Returns null when the
 * key is absent or unparseable.
 */
function parsePendingGate(text: string): PendingGateInfo | null {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>
      const gate = obj.pending_gate
      if (gate && typeof gate === 'object') {
        const g = gate as Record<string, unknown>
        return {
          fromPhase: typeof g.from_phase === 'number' ? g.from_phase : undefined,
          toPhase: typeof g.to_phase === 'number' ? g.to_phase : undefined,
          summary: typeof g.summary === 'string' ? g.summary : undefined,
        }
      }
    } catch { /* ignore */ }
  }
  return null
}

// ── AskUserQuestion normalizers (T-PATCH-037) ─────────────────────────────────

/** Stable option key from an index: 0→A, 1→B, … 25→Z, then A1/A2… (defensive). */
function optionKeyForIndex(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i)
  return `A${i - 25}`
}

/**
 * Normalize one question's options array (Claude AskUserQuestion shape:
 * `{ label, description? }`, or a plain string) → `{ key, title, description? }`
 * with synthesized stable keys. Returns null if no usable options.
 */
function normalizeOptions(
  raw: unknown,
): Array<{ key: string; title: string; description?: string }> | null {
  if (!Array.isArray(raw)) return null
  const out: Array<{ key: string; title: string; description?: string }> = []
  for (const o of raw) {
    let title: string | null = null
    let description: string | undefined
    if (typeof o === 'string') {
      title = o
    } else if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>
      // Claude tool shape uses `label`; the marker may use `title`.
      if (typeof obj.label === 'string') title = obj.label
      else if (typeof obj.title === 'string') title = obj.title
      if (typeof obj.description === 'string') description = obj.description
    }
    if (title) out.push({ key: optionKeyForIndex(out.length), title, description })
  }
  return out.length > 0 ? out : null
}

/**
 * Normalize Claude's `AskUserQuestion` tool input (Path A) → payload.
 *
 * Input shape: `{ questions: [{ question | header, options: [...] }, …] }`.
 * v1 surfaces the FIRST question only (multi-question = out of scope).
 */
function normalizeAskUserQuestion(input: unknown): AskUserQuestionPayload | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  const questions = obj.questions
  if (!Array.isArray(questions) || questions.length === 0) return null

  const first = questions[0]
  if (!first || typeof first !== 'object') return null
  const q = first as Record<string, unknown>

  const question =
    typeof q.question === 'string'
      ? q.question
      : typeof q.header === 'string'
      ? q.header
      : null
  if (!question) return null

  const options = normalizeOptions(q.options)
  if (!options) return null

  return { question, options }
}

/**
 * Path B parser — extract an `ask_user_question` (or `askUserQuestion`) marker
 * from the PO result text. Mirrors `parsePendingGate` structure, reusing
 * `extractJsonCandidates`. Accepts either:
 *   - the Claude tool shape `{ questions: [{ question, options }] }`, or
 *   - a flat `{ question, options }` marker.
 * Returns null when the key is absent or unparseable.
 */
function parseAskUserQuestion(text: string): AskUserQuestionPayload | null {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>
      const marker = obj.ask_user_question ?? obj.askUserQuestion
      if (!marker || typeof marker !== 'object') continue
      const m = marker as Record<string, unknown>

      // Nested `questions[]` (tool shape) → reuse the Path-A normalizer.
      if (Array.isArray(m.questions)) {
        const payload = normalizeAskUserQuestion(m)
        if (payload) return payload
      }

      // Flat `{ question, options }` marker.
      const question =
        typeof m.question === 'string'
          ? m.question
          : typeof m.header === 'string'
          ? m.header
          : null
      if (!question) continue
      const options = normalizeOptions(m.options)
      if (!options) continue
      return { question, options }
    } catch { /* ignore */ }
  }
  return null
}

// ── Renderer subscription helper (bound by main.ts) ─────────────────────────────

/**
 * Bind a single send invocation to a WebContents — emits the IPC channels
 * (`po:onMsgId`, `po:onToken`, `po:onAnnounce`, `po:onDone`, `po:onHealth`).
 */
export function emitToWebContents(wc: WebContents): RunCallbacks {
  return {
    onMsgId:       (msgId)                  => wc.send('po:onMsgId', msgId),
    onToken:       (msgId, chunk)           => wc.send('po:onToken', msgId, chunk),
    onAnnounce:    (msgId, payload)         => wc.send('po:onAnnounce', msgId, payload),
    onDone:        (msgId, info)            => {
      wc.send('po:onDone', msgId, info)
      // T-PATCH-082: notify when PO turn fully completes (once per turn).
      fireNotification({
        kind: 'po-turn-done',
        title: 'productune',
        body: 'PO turn complete — response ready.',
        route: { surface: 'chat' },
      })
    },
    onHealth:      (event)                  => wc.send('po:onHealth', event),
    // T-P4-113: emit parsed todo items to renderer
    onTodoItems:   (items)                  => wc.send('po:todo-items', items),
    // T-P4-114: ticket focus (§B) + artifact open (§A)
    onTicketFocus: (ticketId, reason)       => wc.send('po:ticket-focus', { ticketId, reason }),
    onArtifactOpen:(files)                  => wc.send('po:artifact-open', { files }),
    // T-P4-116: QA loop IPC
    onBrowserOpen: (url, ticketId, purpose) => wc.send('po:browser-open', { url, ticketId, purpose }),
    onUserVerify:  (url, description, ticketId) => wc.send('po:user-verify', { url, description, ticketId }),
    onQaLoopUpdate:(entry) => {
      wc.send('po:qa-loop-update', entry)
      // ── T-019 §B3: OS notifications on QA-loop terminal states ──────────────
      // dispatch-done: a dispatched ticket finished its QA loop (pass).
      if (entry.status === 'pass') {
        fireNotification({
          kind: 'dispatch-done',
          title: '작업 완료',
          body: `${entry.ticketId} — QA 통과`,
          route: { surface: 'ticket-review', ticketId: entry.ticketId },
        })
      }
      // escalation-raised: 3-cap hit (capped) or auth needed (auth-required).
      else if (entry.status === 'capped' || entry.status === 'auth-required') {
        const reason =
          entry.status === 'capped'
            ? `QA 재시도 한도 도달${entry.lastFailReason ? ` — ${entry.lastFailReason}` : ''}`
            : '인증 필요'
        fireNotification({
          kind: 'escalation-raised',
          title: '확인 필요',
          body: `${entry.ticketId} — ${reason}`,
          route: { surface: 'ticket-review', ticketId: entry.ticketId },
        })
      }
    },
    // T-PATCH-037: AskUserQuestion card emit.
    onAskUserQuestion: (msgId, payload) => wc.send('po:onAskUserQuestion', msgId, payload),
    // T-019 §B3: phase-gate-entry — PO emitted a phase-transition gate.
    onPhaseGate: (gate) => {
      const phaseLabel =
        gate.fromPhase !== undefined && gate.toPhase !== undefined
          ? `Phase ${gate.fromPhase} → ${gate.toPhase}`
          : '다음 단계'
      fireNotification({
        kind: 'phase-gate-entry',
        title: '단계 전환 승인 대기',
        body: gate.summary ? `${phaseLabel} — ${gate.summary}` : phaseLabel,
        route: { surface: 'phase-gate' },
      })
    },
  }
}
