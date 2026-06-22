import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { getSession, appendMessage, setClaudeSessionId, clearSession, clearClaudeSessionId, patchMessage } from '../chat-store'
import type { Message } from '../chat-store'
import { runPoTurn, emitToWebContents, abortActiveTurn, runHealthSmoke } from '../po-runner'
import { markPoTurnStart, markPoTurnEnd } from '@productune/core'
import { evaluateCycle, recordTurnDone, resetSessionWindow } from '../po-session-cycle'

// po:restartSession kills any in-flight child via abortActiveTurn() (po-runner.ts).
// T-PATCH-037: latest claude session id, captured from every turn's onDone so a
// resume (e.g. chat:answerQuestion) can thread the same session. Previously
// declared-never-assigned; now wired via `withSessionCapture`. `po:restartSession`
// resets it so the next turn starts fresh (--agent).
let capturedPoSessionId: string | null = null

/**
 * Wrap a RunCallbacks bundle so its onDone also (a) records the session id into
 * the module-scope `capturedPoSessionId` (T-PATCH-037) and (b) increments the
 * per-project PO turn count for the session-cycle threshold (T-PATCH-040).
 *
 * T-PATCH-231: also intercepts onHealth to detect error-other / rate-limited at
 * turn end, then fires a health smoke after onDone and pushes the result to the
 * renderer via `po:smokeResult`. Smoke runs at most once per failing turn; it is
 * skipped when the turn was user-aborted (wasAborted path emits turn-aborted, not
 * error-other) and when the error is rate-limited (no benefit diagnosing quota with
 * a smoke — that would just burn tokens). AC-4: zero overhead on normal turns.
 */
function withSessionCapture(wc: WebContents, projectDir: string) {
  const base = emitToWebContents(wc)

  // T-PATCH-231: track the last health state emitted during this turn so we can
  // decide after onDone whether to fire a smoke. We only smoke on 'error-other'
  // (catches both exit≠0 and result.is_error paths). 'rate-limited' is excluded —
  // a 429 is already diagnosed; smoking it would just consume more quota.
  let lastHealthState: string = 'healthy'

  return {
    ...base,
    onHealth: (event: Parameters<typeof base.onHealth>[0]) => {
      lastHealthState = event.state
      base.onHealth(event)
    },
    onDone: (msgId: string, info: { sessionId?: string }) => {
      if (info.sessionId) capturedPoSessionId = info.sessionId
      // T-PATCH-040: count completed PO turns toward the fresh-cycle threshold.
      recordTurnDone(projectDir)
      base.onDone(msgId, info)

      // T-PATCH-231: fire health smoke async after turn complete — never blocks onDone.
      // Only smoke on 'error-other' (AC-1). Skip rate-limited, healthy, etc.
      if (lastHealthState === 'error-other') {
        runHealthSmoke(projectDir).then((result) => {
          // RISK-1 guard: window may have been closed while smoke was running
          // (async gap between onDone and smoke completion). wc.send on a
          // destroyed WebContents throws 'Object has been destroyed'.
          if (wc.isDestroyed()) return
          wc.send('po:smokeResult', result)
        }).catch(() => {
          // smoke itself errored — treat as incompatible, still surface it
          if (wc.isDestroyed()) return
          wc.send('po:smokeResult', { classification: 'incompatible' })
        })
      }
      // Reset for next turn.
      lastHealthState = 'healthy'
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
        // T-PATCH-157: the GUI runs `claude --print`, so the AskUserQuestion
        // tool_use ends the turn WITHOUT a tool_result (no stdin pipe, no
        // synthetic result is fed — see po-runner.ts:599). The answer arrives on
        // a SEPARATE `--resume` turn as a bare user string ("예"). Resuming a
        // conversation whose last turn ended on an unresolved AskUserQuestion
        // tool_use with a bare string makes the model frequently fail to bind it
        // to the pending question and re-ask in text (the reported symptom).
        // Wrap the resume input so the binding is unambiguous (MODE-1 fix,
        // ticket Option C). The original chosen label is preserved verbatim on
        // its own line so the PO still has the exact answer text.
        //
        // T-PATCH-197 (a): sanitize answerText before interpolation. A malformed
        // option label (control characters, stray newlines, accidental raw-JSON
        // payload) could corrupt the boundText string that becomes the --resume
        // message, which in turn could trigger an upstream InputValidationError
        // when claude re-validates the pending AskUserQuestion tool_use params.
        // Strip C0/C1 control chars (U+0000–U+001F, U+007F–U+009F), normalize
        // all whitespace runs to a single space, and trim. Normal single-word /
        // short-phrase labels (e.g. "A안", "예", "계속") pass through unchanged.
        const sanitizedAnswerText = opts.answerText
          // eslint-disable-next-line no-control-regex
          .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')  // strip control chars → space
          .replace(/\s+/g, ' ')                      // collapse whitespace runs
          .trim()
        const boundText = `[직전 AskUserQuestion에 대한 사용자 선택]\n선택: ${sanitizedAnswerText}`
        markPoTurnStart()
        try {
          await runPoTurn(
            {
              projectDir: opts.projectDir,
              text: boundText,
              resume,
              // T-PATCH-100 §B: a question-answer resume is NOT a fresh user
              // utterance — any promotion candidate emitted here is auto-surfaced.
              turnOrigin: 'auto',
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

  // ── T-PATCH-073: dismiss ask-user-question (X) — persist resolved, no PO resume ──
  // Stamps payload.resolved: { chosenKey: '__dismissed__' } to chat.json so the
  // card is excluded by pendingQuestion's !resolved guard after remount / reload.
  // Does NOT resume a PO turn (contrast: chat:answerQuestion which does both).
  ipcMain.handle(
    'chat:dismissQuestion',
    async (
      _event,
      opts: { projectDir: string; messageId: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const session = getSession(opts.projectDir)
        const card = session.messages.find((m) => m.id === opts.messageId)
        const basePayload =
          card && card.payload && typeof card.payload === 'object'
            ? (card.payload as Record<string, unknown>)
            : {}
        patchMessage(opts.projectDir, opts.messageId, {
          payload: { ...basePayload, resolved: { chosenKey: '__dismissed__' } },
        })
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown' }
      }
    },
  )

  // ── T-013 (c) / T-PATCH-100 PromotionCard resolve ────────────────────────────
  // Persists the user's approve/reject decision onto the promotion-candidate card
  // in chat.json so the resolved card re-renders idempotently after remount/reload
  // (AC-4). Mirrors `chat:dismissQuestion`: re-read the card's payload and
  // merge-patch `resolved` so we never clobber candidateSummary/targetTier/etc.
  //
  // BOUNDARY (AC-6, §3): this handler owns ONLY the persistence + display of the
  // user's decision. It does NOT write any Tier 1/2 long-term doctrine (habit /
  // bookshelf) — that delta-write on approve is the PO agent's responsibility via
  // the promotion-process flow (po/bookshelf/promotion-process.md). The renderer's
  // usePromotionResolve() already appends the trace system line, so this handler
  // does NOT emit one (avoids a duplicate system line in chat.json).
  ipcMain.handle(
    'chat:resolvePromotion',
    async (
      _event,
      opts: { projectDir: string; messageId: string; outcome: 'approved' | 'rejected' },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const session = getSession(opts.projectDir)
        const card = session.messages.find((m) => m.id === opts.messageId)
        const basePayload =
          card && card.payload && typeof card.payload === 'object'
            ? (card.payload as Record<string, unknown>)
            : {}
        patchMessage(opts.projectDir, opts.messageId, {
          payload: { ...basePayload, resolved: { outcome: opts.outcome } },
        })
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
            // T-PATCH-100 §B: a direct user message starts a user-requested turn.
            // Any promotion candidate emitted here → origin 'user-requested' →
            // renders as the question-style PromotionQuestionCard (097 branch).
            // If a fresh-cycle re-orient was forced above (decision.cycle), the
            // turn is still driven by THIS user utterance, so it stays
            // 'user-requested' (the re-orient is internal session rotation, not a
            // PO auto-surfacing turn).
            turnOrigin: 'user-requested',
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

  // ── PO turn abort (T-PATCH-081) ───────────────────────────────────────────────
  // Renderer clicks stop button → po:abort → abortActiveTurn() SIGTERMs the child.
  // Returns { ok: true } immediately (fire-and-forget from the renderer's perspective).
  ipcMain.handle('po:abort', (): { ok: boolean } => {
    abortActiveTurn()
    return { ok: true }
  })

  // ── PO session restart (T-P4-059) ─────────────────────────────────────────────
  ipcMain.handle('po:restartSession', (event, projectDir?: string): { ok: boolean } => {
    abortActiveTurn()
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
