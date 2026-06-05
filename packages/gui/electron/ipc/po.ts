import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { ChildProcess } from 'child_process'
import { getSession, appendMessage, setClaudeSessionId, clearSession, clearClaudeSessionId, patchMessage } from '../chat-store'
import type { Message } from '../chat-store'
import { runPoTurn, emitToWebContents } from '../po-runner'
import { markPoTurnStart, markPoTurnEnd } from '@productune/core'
import { evaluateCycle, recordTurnDone, resetSessionWindow } from '../po-session-cycle'

// ── Active PO child process tracking (T-P4-059) ───────────────────────────────
// Allows `po:restartSession` to kill the in-flight process.
let activePoChild: ChildProcess | null = null
// T-PATCH-037: latest claude session id, captured from every turn's onDone so a
// resume (e.g. chat:answerQuestion) can thread the same session. Previously
// declared-never-assigned; now wired via `withSessionCapture`. `po:restartSession`
// resets it so the next turn starts fresh (--agent).
let capturedPoSessionId: string | null = null

/**
 * Wrap a RunCallbacks bundle so its onDone also (a) records the session id into
 * the module-scope `capturedPoSessionId` (T-PATCH-037) and (b) increments the
 * per-project PO turn count for the session-cycle threshold (T-PATCH-040).
 * Keeps the renderer-bound emit behavior intact.
 */
function withSessionCapture(wc: WebContents, projectDir: string) {
  const base = emitToWebContents(wc)
  return {
    ...base,
    onDone: (msgId: string, info: { sessionId?: string }) => {
      if (info.sessionId) capturedPoSessionId = info.sessionId
      // T-PATCH-040: count completed PO turns toward the fresh-cycle threshold.
      recordTurnDone(projectDir)
      base.onDone(msgId, info)
    },
  }
}

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

  // ── T-013 (b) / T-PATCH-037 AskUserQuestion answer ───────────────────────────
  // Real handler: (1) patch the stored card's payload.resolved = { chosenKey }
  // in chat.json (idempotent resolved-chip on reload), then (2) RESUME the PO
  // turn via the same runPoTurn path po:sendMessage uses, feeding the chosen
  // option text as the next input. Resume threads the captured claude session id
  // (renderer-held `sessionId` preferred; falls back to module-scope
  // `capturedPoSessionId`) so PO continues from the answer (not a fresh session).
  ipcMain.handle(
    'chat:answerQuestion',
    async (
      event,
      opts: {
        projectDir: string
        messageId: string
        chosenKey: string
        answerText: string
        sessionId?: string | null
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        // (1) Patch payload.resolved on the stored card. Re-read so we merge into
        // the existing payload rather than clobbering question/options.
        const session = getSession(opts.projectDir)
        const card = session.messages.find((m) => m.id === opts.messageId)
        const basePayload =
          card && card.payload && typeof card.payload === 'object'
            ? (card.payload as Record<string, unknown>)
            : {}
        patchMessage(opts.projectDir, opts.messageId, {
          payload: { ...basePayload, resolved: { chosenKey: opts.chosenKey } },
        })

        // (2) Resume the PO turn with the chosen answer text as input.
        const resume = opts.sessionId ?? capturedPoSessionId
        markPoTurnStart()
        try {
          await runPoTurn(
            {
              projectDir: opts.projectDir,
              text: opts.answerText,
              resume,
            },
            withSessionCapture(event.sender, opts.projectDir),
          )
        } finally {
          markPoTurnEnd()
        }
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
        // ── T-PATCH-040: PO session fresh-cycle decision (turn START) ──────────
        // Evaluate BEFORE spawning. If we should cycle (phase changed, OR the
        // turn threshold is crossed AND a safe boundary [ticket close / phase
        // change] occurred since this session started), rotate the session:
        //   - drop the claude_session_id from chat.json (messages PRESERVED — the
        //     visible conversation stays continuous, AC4),
        //   - clear the module-scope captured id,
        //   - force THIS turn's resume to null so it spawns `claude --agent
        //     pdt-po` fresh → re-reads doctrine + re-orients from po-state (AC3/AC5),
        //   - reset the session window so counting restarts here,
        //   - notify the renderer to null its in-memory session id (does NOT
        //     touch messages) so subsequent turns resume the NEW session.
        // The decision only runs on a fresh user turn (po:sendMessage), never on
        // an in-flight resume (chat:answerQuestion) — so we never cut mid-work
        // (AC1/AC2).
        let resume = opts.resume ?? null
        const decision = evaluateCycle(opts.projectDir)
        if (decision.cycle) {
          clearClaudeSessionId(opts.projectDir)
          capturedPoSessionId = null
          resume = null
          resetSessionWindow(opts.projectDir)
          event.sender.send('po:sessionRestarted')
        }

        await runPoTurn(
          {
            projectDir: opts.projectDir,
            text: opts.text,
            resume,
          },
          withSessionCapture(event.sender, opts.projectDir),
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
  ipcMain.handle('po:restartSession', (event, projectDir?: string): { ok: boolean } => {
    // Kill active child if running.
    if (activePoChild) {
      try { activePoChild.kill('SIGTERM') } catch { /* ignore */ }
      activePoChild = null
    }
    // Reset captured session id — next send will use --agent (first turn).
    capturedPoSessionId = null
    // T-PATCH-040: re-snapshot the cycle window so the manual fresh session
    // starts counting from zero (no-op if projectDir is omitted by older callers).
    if (projectDir) resetSessionWindow(projectDir)
    // Notify renderer to reset its session state.
    event.sender.send('po:sessionRestarted')
    return { ok: true }
  })
}
