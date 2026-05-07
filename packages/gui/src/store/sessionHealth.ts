/**
 * sessionHealth.ts — zustand store for PO session health (T-P4-059).
 *
 * Receives PoHealthEvent from main process via IPC `po:onHealth`
 * (wired in ChatPanel's subscriber effect) and exposes the current
 * health state + detail to all surfaces:
 *   - StatusBar → SessionHealthSegment
 *   - SessionHealthBanner (severity == error only)
 *   - PoFab badge dot
 */

import { create } from 'zustand'

export type PoHealthState =
  | 'healthy'
  | 'delegating'
  | 'compacting'
  | 'rate-limited'
  | 'permission-blocked'
  | 'error-other'

export interface PoHealthDetail {
  /** delegating — sub-agent persona name */
  persona?: string
  /** rate-limited — ISO reset timestamp (optional) */
  resetAt?: string
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
  'delegating': 1,
  'compacting': 2,
  'rate-limited': 3,
  'error-other': 4,
  'permission-blocked': 5,
}

export type HealthSeverity = 'none' | 'info' | 'warn' | 'error'

export function severityOf(state: PoHealthState): HealthSeverity {
  switch (state) {
    case 'healthy':            return 'none'
    case 'delegating':
    case 'compacting':         return 'info'
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

  /** Update health — priority cascade applied */
  setHealth: (event: PoHealthEvent) => void
  /** Force healthy (used after session restart / retry success) */
  clearHealth: () => void
  /** Dismiss the sticky banner (does not change state) */
  dismissBanner: () => void
}

export const useSessionHealth = create<SessionHealthStore>((set, get) => ({
  state: 'healthy',
  detail: {},
  lastUpdatedAt: null,
  dismissed: false,

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
      dismissed: false,
    })
  },

  clearHealth: () => {
    set({
      state: 'healthy',
      detail: {},
      lastUpdatedAt: new Date().toISOString(),
      dismissed: false,
    })
  },

  dismissBanner: () => {
    set({ dismissed: true })
  },
}))
