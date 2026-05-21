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
