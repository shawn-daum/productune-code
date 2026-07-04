/**
 * prdtHookInstall.ts — session-scoped dismiss state for PrdtHookInstallBanner (T-305).
 *
 * In-memory only (no persist middleware, mirrors sessionHealth.ts) — dismissal
 * lasts for the running app session and resets on restart, so a user who
 * declines isn't nagged again this session but is reminded next launch until
 * the hooks are actually installed.
 */

import { create } from 'zustand'

interface PrdtHookInstallState {
  dismissed: boolean
  dismiss: () => void
}

export const usePrdtHookInstall = create<PrdtHookInstallState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}))
