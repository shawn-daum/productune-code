/**
 * sessionHealth.ts — zustand store for PO session health (T-P4-059).
 *
 * Receives PoHealthEvent from main process via IPC `po:onHealth`
 * (wired in ChatPanel's subscriber effect) and exposes the current
 * health state + detail to all surfaces:
 *   - StatusBar → SessionHealthSegment
 *   - SessionHealthBanner (severity == error only)
 *   - PoFab badge dot
 *
 * T-PATCH-231: also stores the health-smoke result pushed via `po:smokeResult`
 * after a failing turn. The banner surfaces this as an actionable classification
 * (auth / not-installed / incompatible) so the user can act immediately.
 */

import { create } from 'zustand'

// ── Smoke result (T-PATCH-231) ────────────────────────────────────────────────

/**
 * Classification received from `po:smokeResult` after a failing PO turn.
 * Mirror of `SmokeClassification` in po-runner.ts (kept in sync manually).
 */
export type SmokeClassification = 'auth' | 'not-installed' | 'incompatible' | 'ok'

export interface SmokeResult {
  classification: SmokeClassification
  /** Raw error string from stream-json result.error (auth / incompatible only). */
  rawError?: string
}

// ── Health state ─────────────────────────────────────────────────────────────

export type PoHealthState =
  | 'healthy'
  // T-PATCH-221: silence heuristic — claude is producing nothing yet. Was mislabeled
  // 'compacting'; 'thinking' is accurate (first token of a heavy pdt-po prompt is slow).
  | 'thinking'
  | 'delegating'
  | 'compacting'
  // T-PATCH-221: long silence + no output → likely blocked/hung (no timeout before).
  | 'stalled'
  | 'rate-limited'
  | 'permission-blocked'
  | 'error-other'

export interface PoHealthDetail {
  /** delegating — sub-agent persona name */
  persona?: string
  /** delegating — sub-agent 작업 요약(Task.description 또는 prompt 앞부분, T-PATCH-148) */
  task?: string
  /** rate-limited — ISO reset timestamp (optional) */
  resetAt?: string
  /** rate-limited — retry-after seconds extracted from stderr or stream-json envelope */
  retryAfterSec?: number
  /** error-other — human-readable error message */
  errorMessage?: string
  /** permission-blocked — which tool was denied (Write / Edit / Bash) */
  deniedPattern?: string
}

export interface PoHealthEvent {
  state: PoHealthState
  detail?: PoHealthDetail
  at: string   // ISO
  msgId?: string
}

/**
 * Priority cascade: higher index = higher priority.
 * When multiple signals arrive before the state clears, the highest
 * priority wins.
 */
export const HEALTH_PRIORITY: Record<PoHealthState, number> = {
  'healthy': 0,
  'thinking': 1,
  'delegating': 2,
  'compacting': 3,
  'stalled': 4,
  'rate-limited': 5,
  'error-other': 6,
  'permission-blocked': 7,
}

export type HealthSeverity = 'none' | 'info' | 'warn' | 'error'

export function severityOf(state: PoHealthState): HealthSeverity {
  switch (state) {
    case 'healthy':            return 'none'
    case 'thinking':
    case 'delegating':
    case 'compacting':         return 'info'
    case 'stalled':
    case 'rate-limited':       return 'warn'
    case 'permission-blocked':
    case 'error-other':        return 'error'
  }
}

interface SessionHealthStore {
  state: PoHealthState
  detail: PoHealthDetail
  lastUpdatedAt: string | null
  /** banner dismissed by user (resets on next state change) */
  dismissed: boolean
  /**
   * T-PATCH-231: result from the health smoke run after a failing PO turn.
   * Set by `po:smokeResult` IPC push; cleared on session restart or next healthy turn.
   * The banner reads this to show an actionable classification instead of the generic
   * error-other message.
   */
  smokeResult: SmokeResult | null

  /** Update health — priority cascade applied */
  setHealth: (event: PoHealthEvent) => void
  /** Force healthy (used after session restart / retry success) */
  clearHealth: () => void
  /** Dismiss the sticky banner (does not change state) */
  dismissBanner: () => void
  /** T-PATCH-231: store the health smoke classification result */
  setSmokeResult: (result: SmokeResult) => void
  /** T-PATCH-231: clear smoke result (e.g. after session restart) */
  clearSmokeResult: () => void
}

export const useSessionHealth = create<SessionHealthStore>((set, get) => ({
  state: 'healthy',
  detail: {},
  lastUpdatedAt: null,
  dismissed: false,
  smokeResult: null,

  setHealth: (event) => {
    const current = get().state
    // Apply priority cascade — only advance to higher-priority states.
    // 'healthy' always wins over any current state (recovery path).
    if (
      event.state !== 'healthy' &&
      HEALTH_PRIORITY[event.state] <= HEALTH_PRIORITY[current]
    ) {
      return
    }
    set({
      state: event.state,
      detail: event.detail ?? {},
      lastUpdatedAt: event.at,
      // Reset dismissed flag whenever state changes (new banner needed).
      // T-PATCH-231: also clear stale smoke result when health transitions to a
      // new state — the banner will re-populate once the next smoke completes.
      dismissed: false,
      smokeResult: event.state === 'healthy' ? null : get().smokeResult,
    })
  },

  clearHealth: () => {
    set({
      state: 'healthy',
      detail: {},
      lastUpdatedAt: new Date().toISOString(),
      dismissed: false,
      smokeResult: null,   // T-PATCH-231: clear on session restart
    })
  },

  dismissBanner: () => {
    set({ dismissed: true })
  },

  setSmokeResult: (result) => {
    set({ smokeResult: result })
  },

  clearSmokeResult: () => {
    set({ smokeResult: null })
  },
}))
