/**
 * chat-store.ts — single PO session per project (GUI 모델).
 *
 * Storage layout:
 *   <projectDir>/.productune/chat.json
 *     { messages: Message[], claude_session_id?: string, updated_at: string }
 *
 * GUI 는 멀티 채팅방 X — 한 프로젝트당 하나의 PO 세션. 멀티 chatroom 모델은
 * CLI/non-GUI 영역의 doctrine 으로 제한되며 본 GUI 에서는 deprecated.
 */

import fs from 'fs'
import path from 'path'

// ── Types (mirrored from src/lib/types.ts — no cross-boundary import in main) ──

export type MessageKind =
  | 'po'
  | 'designer'
  | 'dev'
  | 'qa'
  | 'trace'
  | 'user'
  | 'ask-user-question'    // T-013 (b) / T-PATCH-037
  | 'promotion-candidate'  // T-013 (c)

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  /** UI bubble kind. Optional for backwards compat (T-P4-041). */
  kind?: MessageKind
  text: string
  status?: 'streaming' | 'done' | 'cancelled'
  created_at: string
  /**
   * Action-card payload (T-013 / T-PATCH-037). Opaque to the store — persisted
   * round-trip so the renderer's typed payload (AskUserQuestionPayload /
   * PromotionPayload) survives reload. `unknown` keeps main free of a
   * cross-boundary import of src/lib/types.
   */
  payload?: unknown
  /** Trace sub-level (T-PATCH-033) — carried for `kind: 'trace'` messages. */
  traceLevel?: string
}

export interface Session {
  messages: Message[]
  claude_session_id?: string
  updated_at: string
}

// ── Path helpers ───────────────────────────────────────────────────────────────

function chatJsonPath(projectDir: string): string {
  return path.join(projectDir, '.productune', 'chat.json')
}

// ── Atomic write (tmp + rename) ────────────────────────────────────────────────

function atomicWrite(filePath: string, data: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.writeFileSync(tmp, data, 'utf-8')
  fs.renameSync(tmp, filePath)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Load the project's PO session. Returns an empty session if the file doesn't
 * exist yet (lazy-init on first append).
 */
export function getSession(projectDir: string): Session {
  const p = chatJsonPath(projectDir)
  if (!fs.existsSync(p)) {
    return { messages: [], updated_at: new Date().toISOString() }
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Session
  } catch {
    return { messages: [], updated_at: new Date().toISOString() }
  }
}

/**
 * Append a message to the project's PO session. Lazily creates `.productune/`
 * and `chat.json` on first call.
 */
export function appendMessage(projectDir: string, message: Message): void {
  const session = getSession(projectDir)
  const next: Session = {
    ...session,
    messages: [...session.messages, message],
    updated_at: new Date().toISOString(),
  }
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(next, null, 2))
}

/**
 * Patch a single stored message in place by id (shallow-merge `partial`).
 * No-op if the id is absent. Used by `chat:answerQuestion` (T-PATCH-037) to
 * stamp `payload.resolved` onto an ask-user-question card. Returns true if a
 * message was patched.
 */
export function patchMessage(
  projectDir: string,
  id: string,
  partial: Partial<Message>,
): boolean {
  const session = getSession(projectDir)
  let found = false
  const messages = session.messages.map((m) => {
    if (m.id !== id) return m
    found = true
    return { ...m, ...partial }
  })
  if (!found) return false
  const next: Session = {
    ...session,
    messages,
    updated_at: new Date().toISOString(),
  }
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(next, null, 2))
  return true
}

/**
 * Persist the Claude session id (used to `--resume` future turns). Called by
 * the streaming runner after the first assistant turn returns.
 */
export function setClaudeSessionId(projectDir: string, sessionId: string): void {
  const session = getSession(projectDir)
  const next: Session = {
    ...session,
    claude_session_id: sessionId,
    updated_at: new Date().toISOString(),
  }
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(next, null, 2))
}

/**
 * Reset the session. Drops messages + claude_session_id. Used by "새 세션 시작"
 * action (Slice 3+ UI).
 */
export function clearSession(projectDir: string): void {
  const empty: Session = { messages: [], updated_at: new Date().toISOString() }
  atomicWrite(chatJsonPath(projectDir), JSON.stringify(empty, null, 2))
}
