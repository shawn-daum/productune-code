/**
 * notifications.ts — native OS notifications (T-019, PRD §B3).
 *
 * Fires Electron `Notification` for the three background-dispatch moments that
 * the user must learn about even when the productune window is not focused:
 *
 *   dispatch-done       — a dispatched ticket finished its QA loop (pass)
 *   escalation-raised   — QA loop hit the 3-cap / needs auth (capped | auth-required)
 *   phase-gate-entry    — PO emitted a phase-transition gate (pending_gate)
 *
 * Real-signal binding (see po-runner.ts):
 *   - dispatch-done     ← onQaLoopUpdate status==='pass'
 *   - escalation-raised ← onQaLoopUpdate status==='capped' | 'auth-required'
 *   - phase-gate-entry  ← parsePendingGate() over the PO `result` envelope
 *
 * Gating (AC-1): a notification only fires while the target window is NOT
 * focused. If any productune window is focused, we stay silent — the user is
 * already looking at the in-app surface (QA badge / gate chip).
 *   Exception (T-PATCH-089): fireNotification accepts opts.bypassFocusGate to
 *   skip the focus gate for the Test notification path (explicit user intent).
 *   All other gates (isSupported, toggle settings) still apply in all paths.
 *
 * Click routing (AC-2): clicking a notification shows + focuses the window and
 * sends `notification:navigate` to the renderer, which routes to the relevant
 * surface via the existing `openTab` store action (reused, no new UI).
 *
 * Suppress-reason log (T-PATCH-089): each early return emits a single
 * console.log("[notifications] suppressed kind=<kind> reason=<reason>") so the
 * dev terminal / packaged-app logs identify which gate fired. The happy path
 * (notification shown) logs nothing — no noise. The bypass path never logs
 * 'focused' because the focus gate was intentionally skipped.
 *
 * Platform scope = macOS first. `Notification.isSupported()` short-circuits on
 * platforms without native support so this is a safe no-op elsewhere.
 */

import { BrowserWindow, Notification } from 'electron'
import { getNotificationSettings } from '@productune/core'

export type NotifyKind =
  | 'dispatch-done'
  | 'escalation-raised'
  | 'phase-gate-entry'
  | 'po-turn-done'

/** Surface the renderer should route to when a notification is clicked. */
export interface NotifyRoute {
  /** Renderer-side surface identifier — interpreted in store/poEvents.ts. */
  surface: 'ticket-review' | 'phase-gate' | 'chat'
  /** Ticket id for ticket-review routing; absent for phase-gate. */
  ticketId?: string
}

export interface NotifySpec {
  kind: NotifyKind
  title: string
  body: string
  route: NotifyRoute
}

/**
 * Returns true when no productune window currently holds OS focus.
 * When false, the user is already in-app, so we suppress the notification.
 */
function isBackgrounded(): boolean {
  return BrowserWindow.getAllWindows().every((w) => w.isDestroyed() || !w.isFocused())
}

/** Pick a window to focus + route to on click (focused first, else first alive). */
function pickTargetWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  const alive = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  return alive[0] ?? null
}

/**
 * Fire a native notification for `spec`, but only while backgrounded.
 * Returns true if a notification was actually shown.
 *
 * opts.bypassFocusGate — when true, the isBackgrounded() gate is skipped so
 * the notification fires even while the window is focused. Used exclusively by
 * the Test button (T-PATCH-089 R2-i); all real emit sites pass no opts.
 */
export function fireNotification(spec: NotifySpec, opts?: { bypassFocusGate?: boolean }): boolean {
  if (!Notification.isSupported()) {
    console.log(`[notifications] suppressed kind=${spec.kind} reason=unsupported`)
    return false
  }
  // AC-1: only when no window is focused.
  // bypassFocusGate skips this gate (test path); real paths always check it.
  if (!opts?.bypassFocusGate && !isBackgrounded()) {
    console.log(`[notifications] suppressed kind=${spec.kind} reason=focused`)
    return false
  }

  // AC-8 (T-PATCH-083): respect user notification toggle settings.
  // master off → no notification fires; per-type off → that kind suppressed.
  // Runs after the focus gate so settings I/O only happens when needed.
  const notifSettings = getNotificationSettings()
  if (!notifSettings.enabled) {
    console.log(`[notifications] suppressed kind=${spec.kind} reason=toggle`)
    return false
  }
  if (!notifSettings.types[spec.kind]) {
    console.log(`[notifications] suppressed kind=${spec.kind} reason=toggle`)
    return false
  }

  const notification = new Notification({
    title: spec.title,
    body: spec.body,
    silent: false,
  })

  notification.on('click', () => {
    // AC-2: clicking focuses the window and routes to the relevant surface.
    const win = pickTargetWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('notification:navigate', spec.route)
  })

  notification.show()
  return true
}
