/**
 * po-deploy-guard.ts — T-P4-022 sub-e / constraint §9
 *
 * Runtime enforcement that `deploy:execute` IPC calls ONLY originate
 * from a user-click event path, never from a PO turn.
 *
 * Pattern:
 *   - In the renderer, any caller that wants to trigger deploy must first
 *     call `assertUserInitiated()` to confirm a user-gesture context is active.
 *   - In the main process, `isPoTurnActive()` is checked before executing.
 *   - Unit tests mock the context to verify PO-turn paths are blocked.
 */

// ── Main-process guard ────────────────────────────────────────────────────────

let _poTurnActive = false

/** Called by po-runner when a PO turn starts. */
export function markPoTurnStart(): void {
  _poTurnActive = true
}

/** Called by po-runner when a PO turn ends (success or error). */
export function markPoTurnEnd(): void {
  _poTurnActive = false
}

/**
 * Returns true if a PO turn is currently active.
 * Use this in the `deploy:execute` IPC handler to block automated calls.
 */
export function isPoTurnActive(): boolean {
  return _poTurnActive
}

/**
 * Guard function for the `deploy:execute` IPC handler.
 * Throws if called during an active PO turn.
 */
export function assertNotPoTurn(context = 'deploy:execute'): void {
  if (_poTurnActive) {
    throw new Error(
      `${context} may only be triggered by explicit user action, not during a PO turn. ` +
      'PRD line 169: 사용자 명시 클릭만 트리거.',
    )
  }
}

// ── Renderer-side guard helper (re-export safe for renderer — no Node deps) ───

/**
 * In the renderer, call this before invoking deploy:execute.
 * Pass the originating DOM event to confirm user-gesture context.
 * Throws if called without a trusted user event (e.g. from an automated handler).
 */
export function assertUserInitiated(event?: Event): void {
  // `isTrusted` is set to true by the browser only for real user-generated events.
  // Synthetic events created via dispatchEvent() have isTrusted === false.
  if (event && !event.isTrusted) {
    throw new Error(
      '[배포하기] 버튼은 사용자가 직접 클릭해야 합니다. 자동 호출이 차단되었습니다.',
    )
  }
}
