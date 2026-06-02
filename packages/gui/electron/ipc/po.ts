import { ipcMain } from 'electron'
import type { ChildProcess } from 'child_process'
import { getSession, appendMessage, setClaudeSessionId, clearSession } from '../chat-store'
import type { Message } from '../chat-store'
import { runPoTurn, emitToWebContents } from '../po-runner'
import { markPoTurnStart, markPoTurnEnd } from '@productune/core'

// ── Active PO child process tracking (T-P4-059) ───────────────────────────────
// Allows `po:restartSession` to kill the in-flight process.
let activePoChild: ChildProcess | null = null
let capturedPoSessionId: string | null = null

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('chat:getSession', (_event, projectDir: string) => {
    return getSession(projectDir)
  })

  ipcMain.handle('chat:appendMessage', (_event, projectDir: string, message: Message) => {
    appendMessage(projectDir, message)
  })

  ipcMain.handle('chat:setClaudeSessionId', (_event, projectDir: string, sessionId: string) => {
    setClaudeSessionId(projectDir, sessionId)
  })

  ipcMain.handle('chat:clearSession', (_event, projectDir: string) => {
    clearSession(projectDir)
  })

  // ── Browser tab IPC (T-P4-114 §D) ────────────────────────────────────────────
  // Channel reserved for T-P4-115 Playwright MCP integration.
  // BrowserTab renderer emits this on mount; main process noop until T-P4-115 fills it.
  ipcMain.on('browser:opened', (_e, payload: { url: string; tabId: string }) => {
    void payload  // noop — T-P4-115 will replace with playwrightMcp.navigate(url)
  })

  // ── T-013 (b) AskUserQuestion answer ─────────────────────────────────────────
  // Stub handler: stores chosen key in chat.json's message payload.resolved and
  // echoes the answer text back to PO via poSendMessage.
  // Full trigger (PO instruction emitting ask-user-question via claude tool-use)
  // is a follow-up scope (risk_flags: ipc-action-card-event-shape).
  ipcMain.handle(
    'chat:answerQuestion',
    async (
      _event,
      opts: { projectDir: string; messageId: string; chosenKey: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        // Patch the message in chat.json — reuse appendMessage-level store logic.
        // For now: noop stub (PO trigger not yet implemented).
        // When PO emits ask-user-question, this handler will:
        //   1. Read session, find message by id, patch payload.resolved
        //   2. Call poSendMessage with the chosen answer text
        void opts
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown' }
      }
    },
  )

  // ── T-013 (c) PromotionCard resolve ──────────────────────────────────────────
  // Stub handler: stores outcome in chat.json's message payload.resolved.
  // Full trigger (PO instruction emitting promotion-candidate via claude tool-use)
  // is a follow-up scope (risk_flags: promotion-event-trigger-undefined).
  ipcMain.handle(
    'chat:resolvePromotion',
    async (
      _event,
      opts: { projectDir: string; messageId: string; outcome: 'approved' | 'rejected' },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        // Stub: noop until PO promotion-candidate trigger ships.
        void opts
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown' }
      }
    },
  )

  // ── PO chat streaming (T-P4-041) ──────────────────────────────────────────────
  ipcMain.handle(
    'po:sendMessage',
    async (
      event,
      opts: { projectDir: string; text: string; resume?: string | null },
    ): Promise<{ ok: boolean; error?: string }> => {
      markPoTurnStart()
      try {
        await runPoTurn(
          {
            projectDir: opts.projectDir,
            text: opts.text,
            resume: opts.resume ?? null,
          },
          emitToWebContents(event.sender),
        )
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown error' }
      } finally {
        markPoTurnEnd()
      }
    },
  )

  // ── PO session restart (T-P4-059) ─────────────────────────────────────────────
  ipcMain.handle('po:restartSession', (event): { ok: boolean } => {
    // Kill active child if running.
    if (activePoChild) {
      try { activePoChild.kill('SIGTERM') } catch { /* ignore */ }
      activePoChild = null
    }
    // Reset captured session id — next send will use --agent (first turn).
    capturedPoSessionId = null
    // Notify renderer to reset its session state.
    event.sender.send('po:sessionRestarted')
    return { ok: true }
  })
}
