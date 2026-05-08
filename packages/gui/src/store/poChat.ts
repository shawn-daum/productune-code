/**
 * poChat.ts — chat-UI state isolated from `useWorkspace` (T-P4-041).
 *
 * `useWorkspace` already owns `messages`, `streaming`, `claudeSessionId` —
 * the conversation domain model. This slice owns purely UI bits that don't
 * belong in the conversation:
 *   - panel visibility (FAB toggle)
 *   - input draft
 *   - auto-scroll lock
 *
 * v2 doctrine sub-c: `nextDelegate` / `setNextDelegate` / `delegateToKind` /
 * `DelegatePersona` removed — PO orchestrator decides dispatch autonomously;
 * users always send to PO.
 */

import { create } from 'zustand'

interface PoChatState {
  panelVisible: boolean
  inputDraft: string
  autoScrollLocked: boolean
  restartModalOpen: boolean

  setPanelVisible: (v: boolean) => void
  togglePanel: () => void
  setDraft: (s: string) => void
  setAutoScrollLocked: (b: boolean) => void
  setRestartModalOpen: (v: boolean) => void
}

export const usePoChat = create<PoChatState>((set) => ({
  panelVisible: true,
  inputDraft: '',
  autoScrollLocked: false,
  restartModalOpen: false,

  setPanelVisible: (panelVisible) => set({ panelVisible }),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setDraft: (inputDraft) => set({ inputDraft }),
  setAutoScrollLocked: (autoScrollLocked) => set({ autoScrollLocked }),
  setRestartModalOpen: (restartModalOpen) => set({ restartModalOpen }),
}))
