/**
 * useBackgroundTasks.ts — Zustand slice for background sub-agent task monitoring.
 * T-P4-068: BackgroundTaskMonitor
 *
 * Tracks Task-tool spawns from po-runner IPC events. Separate from
 * SessionHealth (T-P4-059) — different event channel, different concerns.
 */

import { create } from 'zustand'

// ── Types ────────────────────────────────────────────────────────────────────

export type BackgroundTaskPersona = 'po' | 'designer' | 'dev' | 'qa' | 'unknown'

export interface PopupAnchor {
  type: 'segment' | 'chip'
  rect: DOMRect | null
}

export interface BackgroundTask {
  id: string                           // tool_use_id from envelope
  persona: BackgroundTaskPersona
  description: string                  // truncated 80 chars
  started_at: number                   // epoch ms
  completed_at?: number
  status: 'running' | 'done' | 'error'
}

interface BackgroundTasksState {
  tasks: BackgroundTask[]

  /** Add a new task (running). Idempotent on duplicate id. */
  addTask: (task: BackgroundTask) => void

  /** Mark a task done or error. Noop if id not found. */
  completeTask: (id: string, status: 'done' | 'error', completed_at: number) => void

  /** Remove a task. Only done/error tasks can be dismissed; running is silently ignored. */
  dismissTask: (id: string) => void

  /** Clear all tasks — called on PO chat session reset. */
  resetAll: () => void

  // ── Popup control ────────────────────────────────────────────────────────
  popupOpen: boolean
  popupPersonaFilter: BackgroundTaskPersona | null   // null = no filter
  popupAnchor: PopupAnchor | null

  /** Open popup, optionally filtered to one persona. */
  openPopup: (filter?: BackgroundTaskPersona) => void

  /** Close popup. */
  closePopup: () => void

  /** Set positioning anchor for the popup. */
  setPopupAnchor: (anchor: PopupAnchor) => void
}

// ── Store ────────────────────────────────────────────────────────────────────

const MAX_RECENT = 10

export const useBackgroundTasks = create<BackgroundTasksState>((set) => ({
  tasks: [],
  popupOpen: false,
  popupPersonaFilter: null,
  popupAnchor: null,

  addTask: (task) =>
    set((s) => {
      // Idempotent — skip if same id already tracked
      if (s.tasks.some((t) => t.id === task.id)) return s
      return { tasks: [...s.tasks, task] }
    }),

  completeTask: (id, status, completed_at) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id && t.status === 'running'
          ? { ...t, status, completed_at }
          : t,
      ),
    })),

  dismissTask: (id) =>
    set((s) => {
      const task = s.tasks.find((t) => t.id === id)
      // running tasks cannot be dismissed
      if (!task || task.status === 'running') return s
      return { tasks: s.tasks.filter((t) => t.id !== id) }
    }),

  resetAll: () => set({ tasks: [], popupOpen: false, popupPersonaFilter: null, popupAnchor: null }),

  openPopup: (filter) =>
    set({ popupOpen: true, popupPersonaFilter: filter ?? null }),

  closePopup: () =>
    set({ popupOpen: false, popupPersonaFilter: null }),

  setPopupAnchor: (anchor) =>
    set({ popupAnchor: anchor }),
}))

// ── Selectors (pure functions; consume tasks array) ───────────────────────────

/** Running tasks only. */
export function selectRunning(tasks: BackgroundTask[]): BackgroundTask[] {
  return tasks.filter((t) => t.status === 'running')
}

/** Done/error tasks, sorted newest-first, capped at MAX_RECENT. */
export function selectRecent(tasks: BackgroundTask[]): BackgroundTask[] {
  return tasks
    .filter((t) => t.status === 'done' || t.status === 'error')
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    .slice(0, MAX_RECENT)
}

/** Running task counts per persona. */
export function selectCountByPersona(tasks: BackgroundTask[]): Record<BackgroundTaskPersona, number> {
  const counts: Record<BackgroundTaskPersona, number> = {
    po: 0, designer: 0, dev: 0, qa: 0, unknown: 0,
  }
  tasks.filter((t) => t.status === 'running').forEach((t) => {
    counts[t.persona]++
  })
  return counts
}

// ── Persona normalizer (used by po-runner AND in tests) ───────────────────────

export function normalizePersona(subagentType: string): BackgroundTaskPersona {
  const p = (subagentType ?? '').toLowerCase()
  if (p.includes('designer')) return 'designer'
  if (p.includes('developer') || p === 'pdt-dev' || p === 'dev') return 'dev'
  if (p.includes('qa')) return 'qa'
  if (p.includes('po') || p === 'pdt-po') return 'po'
  return 'unknown'
}

export function extractDescription(input: Record<string, unknown>): string {
  const raw =
    (typeof input?.prompt === 'string'
      ? input.prompt.split('\n')[0]
      : undefined) ??
    (typeof input?.description === 'string' ? input.description : undefined) ??
    ''
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw
}
