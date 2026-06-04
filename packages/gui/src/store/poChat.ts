/**
 * poChat.ts — chat-UI state isolated from `useWorkspace` (T-P4-041).
 *
 * `useWorkspace` already owns `messages`, `streaming`, `claudeSessionId` —
 * the conversation domain model. This slice owns purely UI bits that don't
 * belong in the conversation:
 *   - input draft
 *   - auto-scroll lock
 *
 * T-026: `panelVisible`, `setPanelVisible`, `togglePanel` removed — PO chat is
 * always visible and cannot be minimized or hidden.
 *
 * v2 doctrine sub-c: `nextDelegate` / `setNextDelegate` / `delegateToKind` /
 * `DelegatePersona` removed — PO orchestrator decides dispatch autonomously;
 * users always send to PO.
 */

import { create } from 'zustand'

interface PoChatState {
  inputDraft: string
  autoScrollLocked: boolean
  restartModalOpen: boolean

  setDraft: (s: string) => void
  setAutoScrollLocked: (b: boolean) => void
  setRestartModalOpen: (v: boolean) => void
}

export const usePoChat = create<PoChatState>((set) => ({
  inputDraft: '',
  autoScrollLocked: false,
  restartModalOpen: false,

  setDraft: (inputDraft) => set({ inputDraft }),
  setAutoScrollLocked: (autoScrollLocked) => set({ autoScrollLocked }),
  setRestartModalOpen: (restartModalOpen) => set({ restartModalOpen }),
}))
