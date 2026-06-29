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
import { app } from 'electron'
import type { WebContents } from 'electron'
import { fireNotification } from './notifications'
import { withLoginShellPath } from './surface-runner'
import {
  appendSubagentTurn,
  extractSubagentCapture,
  mergeCapture,
  type SubagentCostCapture,
} from './subagent-cost'

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
  /**
   * T-PATCH-100: how this turn began — `'user-requested'` for a direct user
   * utterance (po:sendMessage), `'auto'` for non-utterance turns (answerQuestion
   * resume, fresh-cycle re-orient). Stamped onto any promotion candidate emitted
   * during the turn. Omitted → conservative `'auto'` fallback at the emit site.
   */
  turnOrigin?: 'user-requested' | 'auto'
}

export interface AnnouncePayload {
  level: 'system' | 'tool' | 'error' | 'info'
  text: string
  /** T-PATCH-087: structured kind so the renderer can localize via t(). */
  kind?: 'turn-aborted' | 'exit-error'
  /** T-PATCH-087: exit code for exit-error kind. */
  code?: number
  /** T-PATCH-108: tool_use.name — only set for level:'tool'. */
  toolName?: string
  /**
   * T-PATCH-108: tool_use.input — only set for level:'tool'. Forwarded raw
   * (no serialization/truncation here — the renderer owns that, AC4 single source).
   */
  toolInput?: unknown
}

// ── Health event types (T-P4-059) ────────────────────────────────────────────

export type PoHealthState =
  | 'healthy'
  | 'thinking'      // T-PATCH-221: silence heuristic (was mislabeled 'compacting')
  | 'delegating'
  | 'compacting'    // only on a real compact_pre / compact===true stream event
  | 'stalled'       // T-PATCH-221: long silence + no output → likely blocked/hung
  | 'rate-limited'
  | 'permission-blocked'
  | 'error-other'
  // T-PATCH-164: per-subagent 완료 신호. presence-only — sessionHealth 표면에는
  // 노출되지 않음(poEvents 핸들러가 setHealth 보다 먼저 분기·격리).
  | 'subagent-done'

export interface PoHealthDetail {
  persona?: string
  /** delegating — sub-agent 작업 요약(Task.description 또는 prompt 앞부분, T-PATCH-148) */
  task?: string
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

// ── Promotion candidate (T-PATCH-100 / 097 follow-up) ─────────────────────────

/**
 * Raw promotion candidate as emitted in a PO envelope. Mirrors the doctrine
 * `promotion_candidates[]` schema (common/bookshelf/promotion-candidate-schema.md):
 * 7 fields, none of which is `origin` — origin is a GUI/transport concern inferred
 * by ipc/po.ts, NOT part of doctrine (T-PATCH-100 §3, doctrine unchanged).
 */
export interface PromotionCandidateRaw {
  scope?: string
  pattern?: string
  target?: string
  delta?: string
  rationale?: string
  area_tag?: string
  source_ticket?: string
}

/**
 * Main-process mirror of `PromotionPayload` (src/lib/types.ts:92) — the shape the
 * renderer's PromotionCard / PromotionQuestionCard consume. `origin` is stamped by
 * the IPC layer (turn-origin inference); `resolved` is stamped renderer-side.
 */
export interface PromotionPayload {
  candidateSummary: string
  targetTier: string
  rationale: string
  sourceTicketId: string
  origin?: 'user-requested' | 'auto'
}

/** Per-candidate emit metadata. `origin` is filled by the IPC binding closure. */
export interface PromotionCandidateMeta {
  origin?: 'user-requested' | 'auto'
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
  /**
   * T-PATCH-100: PO emitted one or more `promotion_candidates[]` in its envelope.
   * Fires once per candidate. `meta.origin` is inferred by the IPC layer (whether
   * the turn began as a user utterance via po:sendMessage). Mirrors the
   * `onAskUserQuestion` result-text path (Path B) — promotions have no tool_use
   * surface, so there is no Path A for them.
   */
  onPromotionCandidate: (
    msgId: string,
    payload: PromotionPayload,
    meta: PromotionCandidateMeta,
  ) => void
  /**
   * T-PATCH-270 (#9): a delegated worker (designer/dev/qa) produced a short
   * read-only output tail line. `persona` is the raw subagent_type string
   * (e.g. 'pdt-developer'); the renderer maps it via personaIdFromAgentType.
   * `line` is an already-coalesced, whitespace-collapsed single tail line
   * (e.g. 'Read design-system.md', 'Write style-b.html'). PO is never a worker
   * here — these events fire only for NESTED (sidechain) activity, and the
   * top-level PO turn is not nested, so PO output never reaches this channel.
   * NOISE-0 on success: emitted for meaningful tool calls + coalesced text
   * lines only, never per-token.
   */
  onWorkerStream: (persona: string, line: string) => void
}

// ── Health-smoke result (T-PATCH-231) ────────────────────────────────────────────

/**
 * Classification emitted by the health smoke when a PO turn fails abnormally.
 *
 * - 'auth'        — claude returned `authentication_failed` / 401 in stream-json
 *                   result.error. Actionable: `claude auth login`.
 * - 'not-installed' — spawn raised ENOENT (claude not on PATH / not installed).
 *                   Actionable: install from claude.ai/code.
 * - 'incompatible' — exit≠0 without a completed result. claude version mismatch
 *                   or unknown runtime error.
 * - 'ok'          — smoke passed (trivial prompt ran cleanly). Original PO turn
 *                   failure was transient or unrelated to claude itself.
 */
export type SmokeClassification = 'auth' | 'not-installed' | 'incompatible' | 'ok'

export interface SmokeResult {
  classification: SmokeClassification
  /** Raw error string surfaced from result.error (present for auth / incompatible). */
  rawError?: string
}

// ── Active child tracking (T-PATCH-081) ──────────────────────────────────────────
// Single-turn model: only one claude child runs at a time. Module-level ref allows
// abortActiveTurn() to SIGTERM it from the po:abort IPC handler without threading
// the handle through callbacks. Cleared on close so repeated aborts are safe no-ops.

let activeChild: ChildProcess | null = null

/** T-PATCH-087: set true by abortActiveTurn() so the close handler emits a
 *  localized info trace instead of a raw error. Reset at end of close handler. */
let wasAborted = false

/**
 * Abort the currently running PO turn by sending SIGTERM to the claude child.
 * Safe to call when no child is running (activeChild === null → no-op).
 * Echo-mode safe: spawnClaude is not called → activeChild stays null → no-op.
 */
export function abortActiveTurn(): void {
  if (activeChild && !activeChild.killed) {
    wasAborted = true   // T-PATCH-087: mark before SIGTERM so close handler knows
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
  // T-PATCH-218: in a packaged app, claude genuinely missing is a real user-facing
  // condition — surface install/login guidance instead of the dev-only echo loop.
  // dev (!isPackaged) keeps echo mode so the UI stays exercisable without claude.
  if (app.isPackaged) {
    return claudeMissingNotice(msgId, cb)
  }
  return echoFallback(opts, msgId, cb)
}

// ── claude detection ────────────────────────────────────────────────────────────

function canSpawnClaude(): boolean {
  // Two preconditions: env file present, claude on PATH.
  const envPath = path.join(os.homedir(), '.productune', 'productune.env')
  if (!fs.existsSync(envPath)) return false

  // T-PATCH-218: search the SAME login-shell-augmented PATH the actual spawn uses
  // (withLoginShellPath, see runPoTurn). A Finder/packaged-app launch only inherits
  // launchd's minimal PATH, so a `claude` in ~/.local/bin / Homebrew was missed here
  // → false "not detected" → echo mode even with claude installed + authed.
  if (process.platform === 'win32') return false
  const searchPath = withLoginShellPath(process.env).PATH ?? ''
  for (const p of searchPath.split(path.delimiter)) {
    try {
      if (p && fs.existsSync(path.join(p, 'claude'))) return true
    } catch { /* ignore */ }
  }
  return false
}

// ── Health state machine ──────────────────────────────────────────────────────

interface HealthContext {
  lastToolUse: string | null        // tool name of the most recent tool_use
  lastToolUseAt: number | null      // Date.now() of the most recent tool_use
  lastEmittedState: PoHealthState
  /**
   * T-PATCH-148: last delegating persona emitted this turn. The dedupe is
   * state-only, so a SECOND parallel/sequential 'delegating' for a DIFFERENT
   * persona in the same turn would otherwise be dropped (and that sub-agent
   * would never go 'working' in the renderer). Tracking the persona lets the
   * dedupe stay persona-aware for 'delegating'.
   */
  lastDelegatedPersona: string | null
  msgId: string
  /** setTimeout handle for the silence heuristic (→ 'thinking') */
  silenceTimeoutHandle: ReturnType<typeof setTimeout> | null
  /** T-PATCH-221: longer watchdog — sustained silence → 'stalled' (likely hung) */
  stallTimeoutHandle: ReturnType<typeof setTimeout> | null
  lastTokenAt: number | null
  /** T-PATCH-164: 진행 중 위임의 tool_use.id → subagent_type(원본 문자열). per-subagent 완료 매핑용. */
  delegatedByToolUseId: Map<string, string>
  /**
   * T-PATCH-170: 진행 중 위임의 parent tool_use.id → 누적 subagent usage/cost
   * capture. subagent(sidechain) 이벤트(parent_tool_use_id 일치)에서 best-effort
   * 로 추출·머지하다가, 해당 위임의 tool_result(완료) 도착 시 turns.jsonl 에
   * scope=subagent 항목으로 flush. usage 가 끝까지 안 잡히면 gate 가 no-op.
   */
  subagentCaptureByParentId: Map<string, SubagentCostCapture>
  /** T-PATCH-170: subagent 비용 기록을 위한 projectDir (turns.jsonl 위치). */
  projectDir: string
  /**
   * T-PATCH-197 (b): set true when the current turn has emitted an
   * AskUserQuestion tool_use and is now awaiting the user's answer. While
   * this flag is true, `armSilenceTimeout` is a no-op — the silence is
   * expected, not a stall. Cleared on turn start and after onDone.
   */
  oqPending: boolean
  /**
   * T-PATCH-268: set true when at least one assistant text token was forwarded
   * via cb.onToken this turn. Used with toolErrorInfo to detect the
   * "tool failed + no assistant reply" silent-fail pattern.
   */
  assistantTextEmitted: boolean
  /**
   * T-PATCH-268: last tool error detail observed this turn (from type:'user'
   * tool_result with is_error=true or content text matching permission-denied
   * patterns). null when no tool error has been seen.
   */
  toolErrorInfo: { toolName?: string; errorText: string } | null
  /**
   * T-PATCH-270 (#9): coalescing buffer for a worker's nested text deltas,
   * keyed by parent Agent tool_use id (== parent_tool_use_id of the sidechain
   * event). Text deltas accumulate here; whole lines are flushed to
   * onWorkerStream on newline boundaries (or at delegation completion), so the
   * renderer never sees per-token churn. Cleared per parent on completion.
   */
  workerTextBufByParentId: Map<string, string>
  /**
   * T-PATCH-271 (#17): rolling tail of the most recent stderr lines (most-recent
   * last, capped at STDERR_TAIL_MAX). On an abnormal exit (code≠0) the close
   * handler classifies this tail to surface WHY claude died (usage/session limit,
   * auth, rate-limit) instead of a raw "exited with code N".
   */
  stderrTail: string[]
}

const SILENCE_TIMEOUT_MS  = 15_000   // silence → 'thinking' (claude producing nothing yet)
const STALL_TIMEOUT_MS    = 90_000   // T-PATCH-221: sustained silence → 'stalled' (likely hung)

// T-PATCH-158: Claude Code renamed the sub-agent dispatch tool Task→Agent.
// Match BOTH so delegation detection (→ persona bar designer/dev/qa) fires
// under the new name while staying backward-compatible with the old one.
const DELEGATE_TOOLS = ['Task', 'Agent']

function makeHealthCtx(msgId: string, projectDir = ''): HealthContext {
  return {
    lastToolUse: null,
    lastToolUseAt: null,
    lastEmittedState: 'healthy',
    lastDelegatedPersona: null,
    msgId,
    silenceTimeoutHandle: null,
    stallTimeoutHandle: null,
    lastTokenAt: null,
    delegatedByToolUseId: new Map(),
    subagentCaptureByParentId: new Map(),
    projectDir,
    oqPending: false,            // T-PATCH-197 (b): no OQ in flight at turn start
    assistantTextEmitted: false, // T-PATCH-268: no assistant text yet
    toolErrorInfo: null,         // T-PATCH-268: no tool error seen yet
    workerTextBufByParentId: new Map(), // T-PATCH-270 (#9): nested text coalescing
    stderrTail: [],              // T-PATCH-271 (#17): rolling stderr tail for exit classification
  }
}

// T-PATCH-271 (#17): how many trailing stderr lines to retain for exit-code
// classification. Small bounded window — only the tail carries the failure cause.
const STDERR_TAIL_MAX = 20

function emitHealth(
  state: PoHealthState,
  detail: PoHealthDetail | undefined,
  ctx: HealthContext,
  cb: RunCallbacks,
): void {
  // Dedupe — only emit when state changes.
  // T-PATCH-148: 'delegating' is persona-aware — a distinct sub-agent persona in
  // the same turn (parallel/sequential dispatch) re-emits even though the state
  // string is unchanged, so the renderer can transition each persona to 'working'
  // (otherwise a second parallel dispatch would be dropped and lose a persona).
  if (state === ctx.lastEmittedState) {
    if (state !== 'delegating') return
    const nextPersona = detail?.persona ?? null
    if (nextPersona === ctx.lastDelegatedPersona) return
    // distinct persona → fall through and re-emit
  }
  ctx.lastEmittedState = state
  ctx.lastDelegatedPersona = state === 'delegating' ? (detail?.persona ?? null) : null
  cb.onHealth({ state, detail, at: new Date().toISOString(), msgId: ctx.msgId })
}

function clearSilenceTimeout(ctx: HealthContext): void {
  if (ctx.silenceTimeoutHandle !== null) {
    clearTimeout(ctx.silenceTimeoutHandle)
    ctx.silenceTimeoutHandle = null
  }
  // T-PATCH-221: clear the stall watchdog alongside the silence timer.
  if (ctx.stallTimeoutHandle !== null) {
    clearTimeout(ctx.stallTimeoutHandle)
    ctx.stallTimeoutHandle = null
  }
}

function armSilenceTimeout(ctx: HealthContext, cb: RunCallbacks): void {
  // T-PATCH-197 (b): while a PO turn is awaiting an OQ answer, stdout is
  // intentionally silent. Do NOT re-arm the compacting heuristic — the silence
  // is expected, not a stall. Any arm call that arrives during the OQ-pending
  // window is silently dropped; re-arming resumes normally on the next turn
  // (oqPending is cleared on turn start and after onDone).
  if (ctx.oqPending) return
  clearSilenceTimeout(ctx)
  // T-PATCH-221: silence → 'thinking' (NOT 'compacting'; real compaction is emitted
  // only on the compact_pre/compact stream event). Don't downgrade 'delegating'.
  ctx.silenceTimeoutHandle = setTimeout(() => {
    if (ctx.lastEmittedState === 'healthy') {
      emitHealth('thinking', undefined, ctx, cb)
    }
  }, SILENCE_TIMEOUT_MS)
  // T-PATCH-221: sustained silence with no output → 'stalled' (likely blocked/hung).
  // Surfaces a "may be stuck — Reset session" affordance instead of locking forever.
  ctx.stallTimeoutHandle = setTimeout(() => {
    if (
      ctx.lastEmittedState === 'healthy' ||
      ctx.lastEmittedState === 'thinking' ||
      ctx.lastEmittedState === 'delegating'
    ) {
      emitHealth('stalled', undefined, ctx, cb)
    }
  }, STALL_TIMEOUT_MS)
}

/**
 * T-PATCH-271 (#17): extract a rate-limit reset deadline from a stderr line.
 * Shared by the stream-time classifier (handleStderrHealth) and the exit-code
 * classifier (classifyExitError) so both surface the same countdown to the
 * renderer's RateLimitBanner. Priority: retry-after secs > x-ratelimit-reset
 * ISO > "resets at" ISO.
 */
function extractRateLimitReset(text: string): { resetAt?: string; retryAfterSec?: number } {
  let resetAt: string | undefined
  let retryAfterSec: number | undefined

  // Priority 1: retry-after: <seconds>
  const retryAfterMatch = text.match(/retry-after:\s*(\d+)/i)
  if (retryAfterMatch) retryAfterSec = parseInt(retryAfterMatch[1], 10)

  // Priority 2: x-ratelimit-reset-requests: <ISO>
  const xResetMatch = text.match(/x-ratelimit-reset-requests:\s*([0-9T:+\-Z.]+)/i)
  if (xResetMatch) resetAt = xResetMatch[1]

  // Priority 3: resets? at <ISO>
  if (!resetAt) {
    const resetMatch = text.match(/resets?\s+at\s+([0-9:T+\-Z.]+)/i)
    if (resetMatch) resetAt = resetMatch[1]
  }

  return { resetAt, retryAfterSec }
}

/** Inspect a stderr line for health signals. */
function handleStderrHealth(line: string, ctx: HealthContext, cb: RunCallbacks): void {
  // Rate limit — checked before permission so 429 takes priority in stderr
  if (/rate.?limit/i.test(line) || /quota/i.test(line)) {
    const { resetAt, retryAfterSec } = extractRateLimitReset(line)
    emitHealth('rate-limited', { resetAt, retryAfterSec }, ctx, cb)
    return
  }

  // T-PATCH-147: stderr-based permission detection removed. Under
  // bypassPermissions there is no permission prompt/denial, so this path could
  // only ever fire a false positive. The `permission-blocked` health state is
  // retained renderer-side but is no longer emitted by the runner.
}

/** Process a tool_use part — record tool name + delegating transition. */
function handleToolUseHealth(toolName: string, ctx: HealthContext, cb: RunCallbacks): void {
  ctx.lastToolUse = toolName
  ctx.lastToolUseAt = Date.now()

  // Task/Agent tool → delegating (T-PATCH-158: detect both names)
  if (DELEGATE_TOOLS.includes(toolName)) {
    clearSilenceTimeout(ctx)
    emitHealth('delegating', undefined, ctx, cb)
    return
  }

  // T-PATCH-147: the provisional 30s Write/Edit/Bash → permission-blocked timer
  // was removed (always a false positive under bypassPermissions, and prone to
  // misfire on long Bash/build/stream delays). Silence-timeout handles genuine
  // no-output hangs separately.
}

// ── T-PATCH-268: TCC / permission-denied silent-fail detector ───────────────────

/**
 * TCC and permission patterns: macOS TCC sandbox denial, ENOENT, generic
 * "operation not permitted" / "permission denied" strings that the claude CLI
 * surfaces as a tool_result error text when the OS refuses file access.
 */
const TCC_PATTERNS = [
  /operation not permitted/i,
  /permission denied/i,
  /access denied/i,
  /tcc|transparency.consent/i,
  /not allowed to access/i,
  /you don['']t have permission/i,
  /EACCES/,
  /EPERM/,
]

/**
 * T-PATCH-268: Build a user-visible actionable message for a silent tool
 * failure. Returns null if there is nothing to surface (no tool error seen).
 * TCC-specific failure → special System Settings guidance; other → generic.
 */
function buildToolFailureMessage(
  toolErrorInfo: { toolName?: string; errorText: string } | null,
): string | null {
  if (!toolErrorInfo) return null
  const { toolName, errorText } = toolErrorInfo
  const isTcc = TCC_PATTERNS.some((p) => p.test(errorText))
  const toolLabel = toolName ? ` (${toolName})` : ''
  if (isTcc) {
    return (
      `Tool access was denied by macOS${toolLabel}: ${errorText}\n\n` +
      'To fix: System Settings → Privacy & Security → Files and Folders → ' +
      'allow Productune access, then retry.'
    )
  }
  return `Tool call failed${toolLabel}: ${errorText}\n\nYou may retry or check the file path.`
}

// ── T-PATCH-271 (#17): claude exit-code error classification ──────────────────

/**
 * Classification of an abnormal claude exit, derived from the stderr tail.
 * Maps to an existing PoHealthState (no new renderer state introduced):
 *   - 'usage-limit' → rate-limited (renders the RateLimitBanner countdown; the
 *     usage/session cap IS a time-bounded limit, so the countdown banner is the
 *     closest existing surface — 'capped'/'auth-required' are QA-loop statuses,
 *     NOT PoHealthState values, so they cannot be passed to emitHealth).
 *   - 'rate-limit'  → rate-limited (429 / explicit rate limit).
 *   - 'auth'        → error-other (SessionHealthBanner error variant).
 */
type ExitErrorKind = 'usage-limit' | 'rate-limit' | 'auth' | null

/**
 * Tunable pattern → kind table. Order matters: the FIRST matching row wins, so
 * the more specific / higher-priority patterns are listed first. Add new rows
 * here to extend classification without touching the close-handler logic.
 */
const EXIT_ERROR_PATTERNS: Array<{ kind: Exclude<ExitErrorKind, null>; re: RegExp }> = [
  // Usage / session / plan caps (Claude subscription limits).
  { kind: 'usage-limit', re: /usage limit/i },
  { kind: 'usage-limit', re: /session limit/i },
  { kind: 'usage-limit', re: /5-?hour/i },
  { kind: 'usage-limit', re: /limit reached/i },
  { kind: 'usage-limit', re: /you['’]?ve reached/i },
  { kind: 'usage-limit', re: /reached your .*limit/i },
  // Rate limit / HTTP 429 (transient throttling).
  { kind: 'rate-limit', re: /rate.?limit/i },
  { kind: 'rate-limit', re: /\b429\b/ },
  { kind: 'rate-limit', re: /\bquota\b/i },
  // Auth / login.
  { kind: 'auth', re: /unauthorized/i },
  { kind: 'auth', re: /not logged in/i },
  { kind: 'auth', re: /\blog ?in\b/i },
  { kind: 'auth', re: /authentication/i },
  { kind: 'auth', re: /\bauth\b/i },
  { kind: 'auth', re: /401\b/ },
]

/** Classify the stderr tail into an ExitErrorKind (null when no row matches). */
function classifyExitError(tail: string): ExitErrorKind {
  for (const { kind, re } of EXIT_ERROR_PATTERNS) {
    if (re.test(tail)) return kind
  }
  return null
}

/**
 * Build a plain-language Korean actionable message for a classified exit error.
 * `resetHint` is an already-formatted reset/retry phrase (or '' when unknown).
 */
function buildExitErrorMessage(kind: Exclude<ExitErrorKind, null>, resetHint: string): string {
  switch (kind) {
    case 'usage-limit':
      return (
        'Claude 사용량 한도에 도달해 작업이 중단되었습니다.' +
        (resetHint ? ` ${resetHint}` : ' 잠시 후 다시 시도해 주세요.') +
        ' (한도가 풀리면 같은 메시지를 다시 보내면 됩니다.)'
      )
    case 'rate-limit':
      return (
        '요청이 너무 잦아 Claude가 일시적으로 제한했습니다.' +
        (resetHint ? ` ${resetHint}` : ' 잠시 후 다시 시도해 주세요.')
      )
    case 'auth':
      return (
        'Claude 로그인이 만료되었거나 인증되지 않아 작업이 중단되었습니다. ' +
        '터미널에서 `claude` 로그인을 다시 한 뒤 메시지를 다시 보내 주세요.'
      )
  }
}

// ── T-PATCH-270 (#9): worker output tail-line builders ────────────────────────

/** Max chars for a worker tail line before the renderer ellipsizes. We keep the
 *  main-side cap generous (renderer owns per-line ellipsis); this only guards
 *  against pathologically long single-token spans. */
const WORKER_LINE_MAX = 200

/** Collapse whitespace + trim a worker tail line; '' when nothing meaningful. */
function normalizeWorkerLine(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > WORKER_LINE_MAX ? oneLine.slice(0, WORKER_LINE_MAX - 1) + '…' : oneLine
}

/**
 * Build a short tail line for a worker's nested tool_use (e.g.
 * "Read design-system.md", "Write style-b.html", "Bash npm run build").
 * Returns '' when the tool/input carries nothing worth surfacing — NOISE-0:
 * the caller skips emit on ''. Mirrors the renderer's tool-detail intent but
 * stays a single compact line (the stream slot is mono, per-line ellipsis).
 */
function buildWorkerToolLine(toolName: string, input: unknown): string {
  const inp = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {}
  const basename = (p: unknown): string =>
    typeof p === 'string' && p ? p.split('/').filter(Boolean).pop() ?? p : ''
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const f = basename(inp.file_path ?? inp.notebook_path ?? inp.path)
      return f ? `${toolName} ${f}` : toolName
    }
    case 'Bash': {
      const cmd = typeof inp.command === 'string' ? inp.command : ''
      return cmd ? `Bash ${cmd}` : 'Bash'
    }
    case 'Glob':
    case 'Grep': {
      const pat = typeof inp.pattern === 'string' ? inp.pattern : ''
      return pat ? `${toolName} ${pat}` : toolName
    }
    case 'Task':
    case 'Agent': {
      const sub = typeof inp.subagent_type === 'string' ? inp.subagent_type : ''
      return sub ? `Agent → ${sub}` : 'Agent'
    }
    case 'TodoWrite':
      // High-frequency, low-signal — drop (NOISE-0).
      return ''
    default:
      return toolName
  }
}

/**
 * Resolve the worker persona for a nested event's parent Agent id and emit a
 * tail line. `parentId` is the parent Agent tool_use id (== parent_tool_use_id
 * of the sidechain event), captured at delegate time in delegatedByToolUseId.
 * Skips when the parent isn't a tracked delegation (e.g. PO's own nested calls
 * never get here since PO isn't dispatched as a sidechain), or the line is empty.
 */
function emitWorkerStream(
  parentId: string,
  rawLine: string,
  hCtx: HealthContext,
  cb: RunCallbacks,
): void {
  const persona = hCtx.delegatedByToolUseId.get(parentId)
  if (!persona) return            // not a tracked worker delegation — skip
  const line = normalizeWorkerLine(rawLine)
  if (!line) return               // NOISE-0: nothing meaningful to surface
  cb.onWorkerStream(persona, line)
}

/**
 * Accumulate a worker text delta and flush any COMPLETE lines (split on '\n').
 * Partial trailing text stays buffered until the next newline or flushWorkerText.
 * Coalescing here is what keeps the channel at line granularity, not token.
 */
function handleWorkerText(
  parentId: string,
  delta: string,
  hCtx: HealthContext,
  cb: RunCallbacks,
): void {
  const buf = (hCtx.workerTextBufByParentId.get(parentId) ?? '') + delta
  const nl = buf.lastIndexOf('\n')
  if (nl < 0) {
    hCtx.workerTextBufByParentId.set(parentId, buf)
    return
  }
  const complete = buf.slice(0, nl)
  hCtx.workerTextBufByParentId.set(parentId, buf.slice(nl + 1))
  for (const rawLine of complete.split('\n')) {
    emitWorkerStream(parentId, rawLine, hCtx, cb)
  }
}

/** Flush any buffered partial worker text as a final line (e.g. before a tool
 *  line lands, or at delegation completion). Clears the buffer for that parent. */
function flushWorkerText(parentId: string, hCtx: HealthContext, cb: RunCallbacks): void {
  const buf = hCtx.workerTextBufByParentId.get(parentId)
  if (buf == null) return
  hCtx.workerTextBufByParentId.delete(parentId)
  if (buf.trim()) emitWorkerStream(parentId, buf, hCtx, cb)
}

// ── Real spawn ──────────────────────────────────────────────────────────────────

function spawnClaude(opts: SendOpts, msgId: string, cb: RunCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const hCtx = makeHealthCtx(msgId, opts.projectDir)
    // T-PATCH-100: capture turn origin for any promotion candidate emitted this
    // turn. Conservative default = 'auto' when the caller didn't stamp it.
    const turnOrigin: 'user-requested' | 'auto' = opts.turnOrigin ?? 'auto'

    // T-PATCH-037: reset per-turn AskUserQuestion de-dupe flag.
    askEmitted = false
    // T-PATCH-197 (b): oqPending is per-HealthContext, initialized false in
    // makeHealthCtx above. No explicit reset needed here — makeHealthCtx is
    // called fresh each spawnClaude invocation (hCtx = makeHealthCtx(msgId, ...)).

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
    // T-PATCH-147: default permission mode = bypassPermissions (≡ --dangerously-skip-permissions).
    // Trusted local runtime (user's own machine + own project); user decision 2026-06-16.
    // headless `claude --print` has no TTY, so an un-allowed tool would otherwise abort the
    // session. `.claude/settings.json` permissions.defaultMode is ignored in print mode → the
    // CLI flag is the correct path. Applies to both first-call and resume paths.
    args.push('--permission-mode', 'bypassPermissions')
    // T-PATCH-166: token-level (typewriter) streaming. With this flag the CLI
    // emits `type:'stream_event'` envelopes carrying `content_block_delta` /
    // `text_delta` per token (parsed in handleStreamJsonLine). Compatible with
    // headless `--print --output-format stream-json --verbose`; orthogonal to
    // `--agent` / `--permission-mode`. Applies to both first-call + resume.
    args.push('--include-partial-messages')
    // T-PATCH-263: place `--` end-of-options sentinel BEFORE the user text positional
    // so claude CLI does not interpret a leading `-` or `--` in the message as a flag.
    // Applies to both first-call and resume paths (args array is built above).
    args.push('--print', '--output-format', 'stream-json', '--verbose', '--', opts.text)

    // T-PATCH-149: experimental — exposes SendMessage (PO can continue a subagent by agentId
    // instead of fresh re-dispatch); also activates auto-resume + TeamCreate/TeamDelete. User
    // decision 2026-06-16. Sole gate for agent-teams; works in headless `--print`.
    // T-PATCH-216: augment PATH with the login-shell PATH so `claude` resolves
    // under a Finder/packaged-app launch (launchd's minimal PATH → ENOENT otherwise).
    const env = withLoginShellPath({ ...process.env, NO_COLOR: '1', CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' })
    const child = spawn('claude', args, {
      env,
      cwd: opts.projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // T-PATCH-081: track active child for po:abort IPC abort path.
    activeChild = child

    // T-PATCH-221 fix: arm the silence/stall timers NOW (at spawn), not only on the
    // first stdout chunk. A heavy pdt-po turn can stay token-silent for 2m+ before any
    // stdout arrives; arming only inside child.stdout.on('data') meant pre-token silence
    // never started the timer → 'thinking'/'stalled' never fired (the 1st-pass bug).
    armSilenceTimeout(hCtx, cb)

    let stdoutBuf = ''
    let stderrBuf = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      // T-PATCH-221: output resumed → clear a prior silence guess (thinking/stalled)
      // back to healthy so the indicator and input recover (handleStreamJsonLine may
      // then promote to delegating/etc. based on the actual event).
      if (hCtx.lastEmittedState === 'thinking' || hCtx.lastEmittedState === 'stalled') {
        emitHealth('healthy', undefined, hCtx, cb)
      }
      // Arm/reset silence timeout on any stdout data.
      armSilenceTimeout(hCtx, cb)
      hCtx.lastTokenAt = Date.now()

      stdoutBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nlIdx).trim()
        stdoutBuf = stdoutBuf.slice(nlIdx + 1)
        if (line) handleStreamJsonLine(line, msgId, cb, hCtx, turnOrigin)
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
          // T-PATCH-271: retain a bounded tail for exit-code classification.
          hCtx.stderrTail.push(line)
          if (hCtx.stderrTail.length > STDERR_TAIL_MAX) hCtx.stderrTail.shift()
          cb.onAnnounce(msgId, { level: 'error', text: line })
          handleStderrHealth(line, hCtx, cb)
        }
      }
    })

    child.on('error', (err) => {
      clearSilenceTimeout(hCtx)
      emitHealth('error-other', { errorMessage: err.message }, hCtx, cb)
      cb.onAnnounce(msgId, { level: 'error', text: `spawn failed: ${err.message}` })
      cb.onDone(msgId, {})
      resolve()
    })

    child.on('close', (code) => {
      // T-PATCH-081: clear active child ref on close (handles both normal exit and SIGTERM).
      activeChild = null
      clearSilenceTimeout(hCtx)

      if (stdoutBuf.trim()) handleStreamJsonLine(stdoutBuf.trim(), msgId, cb, hCtx, turnOrigin)
      if (stderrBuf.trim()) {
        const line = stderrBuf.trim()
        // T-PATCH-271: include the final (un-newline-terminated) stderr line in the tail.
        hCtx.stderrTail.push(line)
        if (hCtx.stderrTail.length > STDERR_TAIL_MAX) hCtx.stderrTail.shift()
        cb.onAnnounce(msgId, { level: 'error', text: line })
        handleStderrHealth(line, hCtx, cb)
      }

      // T-PATCH-268: detect "tool called + no assistant text + tool error" → surface
      // actionable message. Fires when:
      //   1. At least one tool_use was issued this turn (lastToolUseAt set), AND
      //   2. The PO produced zero assistant text tokens (assistantTextEmitted=false), AND
      //   3. A tool_result with is_error=true was captured (toolErrorInfo set).
      // Skipped on user-abort (wasAborted) and already-announced stream errors
      // (those go through the code≠0 branch below). Fires BEFORE the code branch so
      // the actionable message precedes any generic "exit-error" announcement.
      if (
        !wasAborted &&
        hCtx.lastToolUseAt !== null &&
        !hCtx.assistantTextEmitted &&
        hCtx.toolErrorInfo !== null
      ) {
        const actionableMsg = buildToolFailureMessage(hCtx.toolErrorInfo)
        if (actionableMsg) {
          emitHealth('permission-blocked', { deniedPattern: hCtx.toolErrorInfo.errorText }, hCtx, cb)
          cb.onAnnounce(msgId, {
            level: 'error',
            text: actionableMsg,
          })
        }
      }

      if (code !== 0 && code !== null) {
        if (wasAborted) {
          // User-initiated abort — localized info, not an error.
          cb.onAnnounce(msgId, { level: 'info', kind: 'turn-aborted', text: '' })
        } else {
          // T-PATCH-271 (#17): classify the stderr tail BEFORE the generic exit-error
          // announce. A usage/session limit, rate-limit, or auth failure exits the CLI
          // with code≠0 but the stderr tail explains why — surface an actionable health
          // STATE + ko message instead of a raw "code N". No match → unchanged fallback.
          const tail = hCtx.stderrTail.join('\n')
          const kind = classifyExitError(tail)
          if (kind === 'usage-limit' || kind === 'rate-limit') {
            const { resetAt, retryAfterSec } = extractRateLimitReset(tail)
            const resetHint =
              retryAfterSec != null
                ? `약 ${Math.ceil(retryAfterSec / 60)}분 후 다시 시도할 수 있습니다.`
                : resetAt
                  ? `${resetAt}에 한도가 초기화됩니다.`
                  : ''
            // 'capped'/'auth-required' are NOT PoHealthState values (QA-loop statuses
            // only), so we map usage/session caps to 'rate-limited' — its RateLimitBanner
            // countdown is the closest existing usage surface (T-231 health-state reuse).
            emitHealth('rate-limited', { resetAt, retryAfterSec, errorMessage: tail.slice(0, 200) }, hCtx, cb)
            cb.onAnnounce(msgId, { level: 'error', text: buildExitErrorMessage(kind, resetHint) })
          } else if (kind === 'auth') {
            // auth → error-other (SessionHealthBanner error variant) + actionable ko.
            emitHealth('error-other', { errorMessage: tail.slice(0, 200) }, hCtx, cb)
            cb.onAnnounce(msgId, { level: 'error', text: buildExitErrorMessage(kind, '') })
          } else {
            // Unclassified real crash — renderer localizes via kind; text kept as English fallback.
            cb.onAnnounce(msgId, { level: 'error', kind: 'exit-error', code: code ?? undefined, text: `claude exited with code ${code}` })
            // Only set error-other if no other state was set.
            if (hCtx.lastEmittedState === 'healthy') {
              emitHealth('error-other', { errorMessage: `exit code ${code}` }, hCtx, cb)
            }
          }
        }
      } else {
        // Normal exit — recover to healthy.
        emitHealth('healthy', undefined, hCtx, cb)
      }
      cb.onDone(msgId, { sessionId: capturedSessionId })
      capturedSessionId = undefined
      askEmitted = false        // T-PATCH-037: clear de-dupe for the next turn
      hCtx.oqPending = false   // T-PATCH-197 (b): clear OQ-pending after done
      wasAborted = false        // T-PATCH-087: reset flag for next turn
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
  turnOrigin: 'user-requested' | 'auto',
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

  // ── T-PATCH-165: nested(subagent/sidechain) 이벤트 필터 ────────────────────
  // 증상: PO 가 dev/designer/qa 를 Agent 로 위임하면, --verbose 스트림에 subagent
  // 내부 tool_use(Read/Write/Edit/Bash)가 섞여 들어오고 po-runner 가 top-level 과
  // 구분 없이 전부 announce → PO "도구 N개" 리스트가 subagent 내부 도구로 오염.
  //
  // 유력 후보(1순위 검증): 메시지 봉투의 `parent_tool_use_id`. sidechain(subagent)
  // 이벤트면 부모 Agent 의 tool_use id 로 non-null, top-level 이벤트면 null/부재.
  // 따라서 `isNested === true` 인 이벤트의 tool_use announce / 텍스트 토큰을 스킵해
  // PO 자기 도구 + Agent 디스패치 엔트리만 남긴다.
  //
  // 중요 — subagent 완료 tool_result 는 top-level(부모) 메시지로 도착하며 그 봉투의
  // parent_tool_use_id 는 null 이다(부모 Agent tool_use id 를 가리키는 건 part 안의
  // tool_use_id 이지 봉투 필드가 아님). 즉 isNested=false → T-164 의 subagent-done
  // emit 은 그대로 통과한다. 스킵 대상은 오직 subagent 의 *내부* tool_use/tool_result.
  //
  // graceful: parent_tool_use_id 가 실제 sidechain 마커가 아니면(필드 부재) isNested
  // 는 항상 false → 필터 no-op → 기존 동작 무변(무해). 실측 확정은 runtime verify 필요.
  const isNested = obj?.parent_tool_use_id != null

  // ── T-PATCH-170: per-subagent usage/cost capture (gated, best-effort) ──────
  // The GUI dispatches sub-agents via the Agent tool, so the Bash-matched
  // post-delegate hook never fires → no scope=subagent turns.jsonl rows. We
  // recover the cost here: for any nested(sidechain) event we best-effort extract
  // {cost_usd, model, usage} and merge it into a buffer keyed by the parent Agent
  // tool_use id (== obj.parent_tool_use_id). On delegation completion the
  // top-level tool_result (type:'user', handled below) flushes the buffer to a
  // scope=subagent row keyed by persona. The sub-agent's usage most plausibly
  // rides on its FINAL assistant sidechain message (message.usage) or a nested
  // result envelope (total_cost_usd/usage/modelUsage) — extractSubagentCapture
  // probes both. graceful: if no usable field is ever seen, the flush gate
  // (hasUsableCapture in appendSubagentTurn) makes it a no-op. Exact stream shape
  // is runtime-verify (same class as T-165/166); this path is harmless until
  // usage appears, then lights up with no further change.
  if (isNested) {
    const parentId = obj.parent_tool_use_id as string
    const cap = extractSubagentCapture(obj)
    const prev = hCtx.subagentCaptureByParentId.get(parentId)
    hCtx.subagentCaptureByParentId.set(parentId, mergeCapture(prev, cap))
  }

  // ── T-PATCH-166: per-token (typewriter) text streaming ─────────────────────
  // With `--include-partial-messages`, the CLI emits `type:'stream_event'`
  // envelopes carrying Anthropic raw streaming events. The token-level text
  // arrives as `event.type === 'content_block_delta'` with a `text_delta`. We
  // forward each delta via cb.onToken so the renderer accumulates char-by-char
  // (MessageBubble's streaming ▋ cursor now tracks per token).
  //
  // ★Double-append avoidance: the FINAL `type:'assistant'` message repeats the
  // FULL text. So the `type:'assistant'` handler below NO LONGER calls onToken
  // for text parts (it only keeps tool_use handling) — text now comes solely
  // from these deltas.
  //
  // ★Nested (T-165 정합): subagent(sidechain) text deltas must not pollute the
  // PO bubble. We gate with the same `parent_tool_use_id != null → skip` marker
  // class used for assistant/user. The marker may ride either on the outer
  // stream_event envelope OR on the inner raw event, so we check both. graceful:
  // if neither carries it (field absent), isNested stays false → delta flows
  // (no-op gate). Runtime-verify needed to confirm the sidechain marker shape on
  // stream_event.
  if (type === 'stream_event') {
    const event = obj?.event
    if (
      event?.type === 'content_block_delta' &&
      event?.delta?.type === 'text_delta' &&
      typeof event?.delta?.text === 'string'
    ) {
      const eventNested = isNested || obj?.event?.parent_tool_use_id != null
      if (!eventNested) {
        cb.onToken(msgId, event.delta.text)
        hCtx.assistantTextEmitted = true   // T-PATCH-268: track that the PO produced text
      } else {
        // ── T-PATCH-270 (#9): worker (sidechain) text → coalesced tail lines ──
        // Buffer deltas per parent Agent id; flush whole lines on '\n' so the
        // renderer never sees per-token churn (NOISE-0). The persona is resolved
        // from the same delegatedByToolUseId map used for subagent-done.
        const parentId =
          (typeof obj?.parent_tool_use_id === 'string' && obj.parent_tool_use_id) ||
          (typeof obj?.event?.parent_tool_use_id === 'string' && obj.event.parent_tool_use_id) ||
          null
        if (parentId) handleWorkerText(parentId, event.delta.text, hCtx, cb)
      }
    }
    return
  }

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
    // T-PATCH-165: subagent(sidechain) 내부 assistant 이벤트면 PO bubble 으로 흘리지
    // 않는다 — PO bubble 은 PO 자기 narration/도구만 보여야 한다. nested 의 텍스트
    // 토큰(subagent 내부 서술)도 onToken 으로 새면 PO 버블 오염이므로 함께 스킵.
    if (isNested) {
      // ── T-PATCH-270 (#9/#10): worker (sidechain) tool_use → tail line ──────
      // The PO bubble is unaffected (we still return below). We surface the
      // worker's tool calls as short read-only tail lines, and — crucially for
      // #10 — re-assert the persona as `working` on its FIRST nested activity.
      // Nested activity is ground-truth that this worker is live, more robust
      // than parsing subagent_type off the parent partial-message tool_use.
      const parentId = typeof obj?.parent_tool_use_id === 'string' ? obj.parent_tool_use_id : null
      if (parentId) {
        // Flush any buffered worker prose first so tool lines land in order.
        flushWorkerText(parentId, hCtx, cb)
        for (const part of content) {
          if (part?.type === 'tool_use' && typeof part?.name === 'string') {
            const line = buildWorkerToolLine(part.name, part.input)
            if (line) emitWorkerStream(parentId, line, hCtx, cb)
          }
        }
      }
      return
    }
    for (const part of content) {
      if (part?.type === 'text') {
        // T-PATCH-166: text now streams via `type:'stream_event'` text_delta
        // (typewriter). The FINAL assistant message repeats the FULL text, so
        // calling cb.onToken here would DOUBLE-append. Skip text parts; keep the
        // tool_use branch (delegating/persona/도구 announce — T-148/165, and the
        // AskUserQuestion path) intact.
        continue
      } else if (part?.type === 'tool_use' && typeof part?.name === 'string') {
        // ── T-PATCH-037 Path A: AskUserQuestion tool_use (PO-only) ──────────
        // Normalize Claude's AskUserQuestion input → AskUserQuestionPayload and
        // emit the card. Skip the generic `→ tool:` announce + health for this
        // tool so it doesn't leave a stray trace. v1 surfaces the FIRST question
        // only (multi-question = OOS).
        if (part.name === 'AskUserQuestion') {
          const payload = normalizeAskUserQuestion(part.input)
          if (payload && !askEmitted) {
            askEmitted = true
            // T-PATCH-197 (b): mark that this turn is now awaiting the user's
            // OQ answer. armSilenceTimeout will be a no-op while this is true,
            // preventing a false 'compacting' health event during the wait.
            // Also disarm any currently armed timer (edge: stdout data arrived
            // just before the AskUserQuestion part and armed the timeout).
            hCtx.oqPending = true
            clearSilenceTimeout(hCtx)
            cb.onAskUserQuestion(msgId, payload)
          }
          continue
        }

        // T-PATCH-108: forward the parsed tool name + raw input so the renderer
        // can show per-tool detail. `text` kept for backward compat. Raw input is
        // structured-clone-safe plain object; renderer serializes/truncates.
        cb.onAnnounce(msgId, {
          level: 'tool',
          text: `→ tool: ${part.name}`,
          toolName: part.name,
          toolInput: part.input,
        })
        handleToolUseHealth(part.name, hCtx, cb)

        // Extract subagent_type + task summary for delegating detail.
        if (DELEGATE_TOOLS.includes(part.name) && typeof part?.input?.subagent_type === 'string') {
          // T-PATCH-148 (Q2): sub-agent 작업 요약. Task.description(3-5 단어, 표준
          // 필드)을 1순위로, 부재 시 prompt 앞 60자 fallback. 최종 절단은 renderer
          // tooltip 에서.
          const taskSummary =
            typeof part.input?.description === 'string' && part.input.description.trim()
              ? part.input.description.trim()
              : typeof part.input?.prompt === 'string'
                ? part.input.prompt.trim().slice(0, 60)
                : undefined
          // Re-emit with persona+task detail (dedupe guard bypassed by clearing
          // lastEmittedState). emitHealth 의 dedupe 가 persona-aware 이므로(아래),
          // 한 turn 에 여러 persona 를 병렬 디스패치해도 각 persona 의 delegating 이
          // 개별 도착한다(T-PATCH-148).
          hCtx.lastEmittedState = 'healthy'   // allow re-emit with detail
          emitHealth('delegating', { persona: part.input.subagent_type, task: taskSummary }, hCtx, cb)

          // T-PATCH-164: per-subagent 완료 매핑 — tool_use.id → subagent_type 적재.
          // tool_result(type:'user') 도착 시 이 맵으로 역참조해 해당 persona 만 done.
          if (typeof part.id === 'string') {
            hCtx.delegatedByToolUseId.set(part.id, part.input.subagent_type)
          }
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
    // Normal result — clear silence timeout and recover to healthy.
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

      // ── T-PATCH-100: promotion_candidates[] → promotion-candidate card(s) ──
      // Mirror of the AskUserQuestion result-text path: PO returns a structured
      // result JSON; we extract any promotion candidates and surface one card per
      // candidate. `turnOrigin` (user-requested vs auto) is GUI-inferred (§B) and
      // stamped onto each payload via meta. doctrine schema is untouched (§3).
      const promoCandidates = parsePromotionCandidates(resultText)
      for (const raw of promoCandidates) {
        const payload = mapPromotionCandidate(raw, turnOrigin)
        cb.onPromotionCandidate(msgId, payload, { origin: turnOrigin })
      }
    }
    return
  }

  // T-PATCH-147: the former `type === 'user'` tool_result handler existed only to
  // clear the provisional permission-blocked timer (T-PATCH-131); it was dropped.
  // T-PATCH-164: re-activated for per-subagent completion. When a delegated
  // sub-agent finishes, the CLI emits a `type:'user'` message whose content[]
  // carries a `tool_result` keyed by the original `tool_use_id`. We reverse-map
  // that id → subagent_type (captured at delegate time, Fix-1b) and emit a
  // presence-only `subagent-done` so ONLY that persona flips done→idle (AC-2).
  if (type === 'user') {
    // T-PATCH-165: subagent 내부 tool_result(예: subagent 가 호출한 Read/Bash 의
    // 결과)는 nested → 스킵. subagent *완료* tool_result 는 부모(top-level) 메시지로
    // 도착하므로 isNested=false → 아래 역참조 로직(T-164)이 그대로 동작한다.
    if (isNested) return
    const content = obj?.message?.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'tool_result' && typeof part?.tool_use_id === 'string') {
          // T-PATCH-268: capture tool errors (is_error=true) for the silent-fail
          // detector. Extract the error text from the content array or string.
          // Only capture the FIRST error per turn (last-writer semantics would
          // obscure the root cause); skip if a higher-priority error already captured.
          if ((part.is_error === true || part.is_error === 'true') && !hCtx.toolErrorInfo) {
            let errorText = ''
            if (Array.isArray(part.content)) {
              errorText = part.content
                .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
                .map((c: any) => c.text as string)
                .join('\n')
                .trim()
            } else if (typeof part.content === 'string') {
              errorText = part.content.trim()
            }
            if (!errorText) errorText = 'tool call failed (no details)'
            // Reverse-lookup the tool name from delegatedByToolUseId (delegates) or
            // the last tool recorded in hCtx.lastToolUse.
            const toolName = hCtx.delegatedByToolUseId.get(part.tool_use_id) ?? hCtx.lastToolUse ?? undefined
            hCtx.toolErrorInfo = { toolName: toolName ?? undefined, errorText }
          }

          const agentType = hCtx.delegatedByToolUseId.get(part.tool_use_id)
          if (agentType) {
            // T-PATCH-270 (#9): flush any buffered worker prose BEFORE deleting
            // the delegation mapping (emitWorkerStream resolves persona off it).
            flushWorkerText(part.tool_use_id, hCtx, cb)
            hCtx.delegatedByToolUseId.delete(part.tool_use_id)
            // dedupe 우회: emitHealth()는 state 기반 dedupe라 동일 'subagent-done'
            // 연속 도착 시 둘째가 드롭됨(병렬 완료에서 치명적). 따라서 emitHealth 를
            // 거치지 않고 cb.onHealth 를 직접 호출하고 lastEmittedState 는 건드리지
            // 않는다(delegating/healthy 상태머신과 독립).
            cb.onHealth({
              state: 'subagent-done',
              detail: { persona: agentType },
              at: new Date().toISOString(),
              msgId: hCtx.msgId,
            })

            // ── T-PATCH-170: flush per-subagent cost → turns.jsonl ──────────
            // The completion tool_result is keyed by the SAME id the sidechain
            // events carried as parent_tool_use_id, so the accumulated capture is
            // at subagentCaptureByParentId[tool_use_id]. Some CLI versions also
            // attach usage/total_cost_usd to the tool_result part or its envelope
            // → merge those in too before the write. appendSubagentTurn gates on
            // usable data (no-op when nothing was captured), so this never writes
            // a garbage row and never throws into the turn.
            const buffered = hCtx.subagentCaptureByParentId.get(part.tool_use_id)
            hCtx.subagentCaptureByParentId.delete(part.tool_use_id)
            const fromResult = mergeCapture(
              extractSubagentCapture(part),
              extractSubagentCapture(obj),
            )
            const finalCap = mergeCapture(buffered, fromResult)
            appendSubagentTurn(hCtx.projectDir, agentType, finalCap)
          }
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

// ── Claude-missing notice (packaged app) ──────────────────────────────────────

/** T-PATCH-218: packaged app with no claude on the login-shell PATH (or no env
 *  file) → actionable install/login guidance instead of the dev-only echo loop. */
function claudeMissingNotice(msgId: string, cb: RunCallbacks): Promise<void> {
  const hCtx = makeHealthCtx(msgId)
  emitHealth('healthy', undefined, hCtx, cb)
  cb.onAnnounce(msgId, {
    level: 'system',
    text: 'Claude Code CLI not detected. Install it from https://claude.ai/code, launch it once to log in, then retry — Settings → engine to reconnect.',
  })
  cb.onDone(msgId, {})
  emitHealth('healthy', undefined, hCtx, cb)
  return Promise.resolve()
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

// ── Promotion candidate parser + mapper (T-PATCH-100) ─────────────────────────

/**
 * Extract a `promotion_candidates[]` array from PO result text. Mirrors
 * `parsePendingGate` / `parseAskUserQuestion`: reuses `extractJsonCandidates`,
 * conservative about shape. Also accepts a single `promotion_candidate` object
 * for forward-compat. Returns `[]` when the key is absent or unparseable.
 */
function parsePromotionCandidates(text: string): PromotionCandidateRaw[] {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const obj = parsed as Record<string, unknown>

      // Plural array form (canonical).
      if (Array.isArray(obj.promotion_candidates)) {
        const out = obj.promotion_candidates.filter(
          (c): c is Record<string, unknown> => c !== null && typeof c === 'object',
        )
        if (out.length > 0) return out as PromotionCandidateRaw[]
      }

      // Singular object form (forward-compat).
      const single = obj.promotion_candidate
      if (single && typeof single === 'object') {
        return [single as PromotionCandidateRaw]
      }
    } catch { /* ignore */ }
  }
  return []
}

/** Trim a delta to a 1-line summary (truncate overly long deltas for the card). */
function summarizeDelta(delta: string | undefined): string {
  if (!delta) return ''
  const oneLine = delta.replace(/\s+/g, ' ').trim()
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine
}

/**
 * Map the doctrine 7-field promotion candidate → renderer `PromotionPayload`
 * (T-PATCH-100 §4 mapping table). `scope`+`pattern` → `<scope>/<pattern>` token
 * (PromotionTier shape, e.g. `global/habit`). `origin` is GUI-inferred (§B).
 */
function mapPromotionCandidate(
  raw: PromotionCandidateRaw,
  origin: 'user-requested' | 'auto',
): PromotionPayload {
  const scope = typeof raw.scope === 'string' ? raw.scope : ''
  const pattern = typeof raw.pattern === 'string' ? raw.pattern : ''
  const targetTier = scope && pattern ? `${scope}/${pattern}` : (scope || pattern)
  return {
    candidateSummary: summarizeDelta(
      typeof raw.delta === 'string' ? raw.delta : undefined,
    ),
    targetTier,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    sourceTicketId: typeof raw.source_ticket === 'string' ? raw.source_ticket : '',
    origin,
  }
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

// ── Health smoke (T-PATCH-231) ────────────────────────────────────────────────────

/**
 * Run a trivial one-shot claude spawn to diagnose WHY a PO turn failed.
 *
 * Called automatically once after a PO turn exits with code≠0 OR `is_error=true`
 * (AC-1). Uses prod-identical flags / env (AC-3) so the result reflects the real
 * runtime. Returns a `SmokeResult` classifying the root cause; never throws.
 *
 * AC-3 key: the 401 case manifests as a stream-json `result.is_error=true` with
 * `error` containing `authentication_failed` or `401`. Exit code alone is not
 * enough — exit 1 + completed is the documented 401 shape. We parse `result`
 * from stdout, not just the exit code.
 *
 * AC-4: this function is only invoked on the fallback path (after a failing
 * turn). Normal turns never call it → zero overhead on the happy path.
 */
export function runHealthSmoke(projectDir: string): Promise<SmokeResult> {
  return new Promise((resolve) => {
    // Smoke is skipped when claude is not on PATH — reuse canSpawnClaude() gate.
    if (!canSpawnClaude()) {
      resolve({ classification: 'not-installed' })
      return
    }

    // Trivial prompt: one word, zero cost, still exercises the full auth path.
    const smokeArgs = [
      '--agent', PO_AGENT,
      '--permission-mode', 'bypassPermissions',
      '--print', '--output-format', 'stream-json', '--verbose',
      'ping',
    ]
    const env = withLoginShellPath({ ...process.env, NO_COLOR: '1' })

    let child: ChildProcess
    try {
      child = spawn('claude', smokeArgs, {
        env,
        cwd: projectDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err: any) {
      // spawn() itself threw (ENOENT on some platforms before the error event).
      const isEnoent = err?.code === 'ENOENT' || /not found|enoent/i.test(err?.message ?? '')
      resolve({ classification: isEnoent ? 'not-installed' : 'incompatible', rawError: err?.message })
      return
    }

    let stdoutBuf = ''
    let smokeResultObj: any = null
    let sawError = false

    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code
      const isEnoent = code === 'ENOENT' || /not found|enoent/i.test(err.message)
      resolve({ classification: isEnoent ? 'not-installed' : 'incompatible', rawError: err.message })
      sawError = true
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let nlIdx
      // eslint-disable-next-line no-cond-assign
      while ((nlIdx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nlIdx).trim()
        stdoutBuf = stdoutBuf.slice(nlIdx + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line)
          // Capture the last `type:'result'` envelope — that's where is_error lives.
          if (obj?.type === 'result') smokeResultObj = obj
        } catch { /* non-JSON line — ignore */ }
      }
    })

    // Drain stderr silently — we classify via stdout stream-json, not stderr.
    child.stderr?.resume()

    child.on('close', (code) => {
      if (sawError) return   // already resolved via error event

      // Flush any trailing stdout.
      if (stdoutBuf.trim()) {
        try {
          const obj = JSON.parse(stdoutBuf.trim())
          if (obj?.type === 'result') smokeResultObj = obj
        } catch { /* ignore */ }
      }

      // AC-3: classify via stream-json result.is_error / result.error, NOT exit code.
      if (smokeResultObj) {
        const isError = smokeResultObj.is_error === true || smokeResultObj.subtype === 'error'
        if (!isError) {
          // result envelope present and not an error → smoke passed.
          resolve({ classification: 'ok' })
          return
        }
        // Parse the error field for auth signals.
        const errStr = JSON.stringify(smokeResultObj.error ?? '')
        if (/authentication_failed|401/i.test(errStr)) {
          resolve({
            classification: 'auth',
            rawError: typeof smokeResultObj.error === 'string'
              ? smokeResultObj.error
              : errStr,
          })
          return
        }
        // Other result-level error (e.g. timeout, model error) → incompatible.
        resolve({
          classification: 'incompatible',
          rawError: typeof smokeResultObj.error === 'string'
            ? smokeResultObj.error
            : errStr,
        })
        return
      }

      // No result envelope at all — check exit code as last resort.
      if (code !== 0 && code !== null) {
        resolve({ classification: 'incompatible', rawError: `exit code ${code}` })
      } else {
        // Exited 0 with no result? Treat as ok (could be an empty --verbose run).
        resolve({ classification: 'ok' })
      }
    })
  })
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
    // T-PATCH-100: promotion-candidate card emit. `origin` is already baked into
    // payload by mapPromotionCandidate; meta is forwarded for symmetry/debug.
    onPromotionCandidate: (msgId, payload) =>
      wc.send('po:onPromotionCandidate', msgId, payload),
    // T-PATCH-270 (#9): worker output tail line → presence stream slot.
    onWorkerStream: (persona, line) => wc.send('po:worker-stream', { persona, line }),
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
