/**
 * useQaLoop.ts — Zustand store for Dev-QA auto-loop state machine (T-P4-112).
 *
 * Populated via 'po:qa-loop-update' IPC (ChatPanel useEffect).
 * One entry per ticketId; cleared when ticket reaches pass/done/blocked.
 * Consumed by BackgroundTaskSegment (attempt badge) and SidePanelArtifacts.
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QaLoopStatus =
  | 'dev-running'
  | 'qa-running'
  | 'pass'
  | 'fail'
  | 'capped'
  | 'auth-required'

export interface QaLoopEntry {
  ticketId: string
  attempt: number       // 1-based current attempt
  maxAttempts: number   // hardcoded 3
  status: QaLoopStatus
  lastFailReason?: string
}

interface QaLoopState {
  entries: Record<string, QaLoopEntry>  // keyed by ticketId

  /** Upsert an entry (create or replace). */
  setEntry: (entry: QaLoopEntry) => void

  /** Remove an entry for a completed ticket. */
  clearEntry: (ticketId: string) => void

  /** Clear all entries — call on session reset. */
  resetAll: () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useQaLoop = create<QaLoopState>((set) => ({
  entries: {},

  setEntry: (entry) =>
    set((s) => ({
      entries: { ...s.entries, [entry.ticketId]: entry },
    })),

  clearEntry: (ticketId) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [ticketId]: _removed, ...rest } = s.entries
      return { entries: rest }
    }),

  resetAll: () => set({ entries: {} }),
}))
