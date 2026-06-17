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
import { persist, createJSONStorage } from 'zustand/middleware'

interface PoChatState {
  inputDraft: string
  autoScrollLocked: boolean
  restartModalOpen: boolean
  /** T-PATCH-052: set to true after a successful session restart; ChatPanel consumes + resets. */
  restartCompleted: boolean

  setDraft: (s: string) => void
  setAutoScrollLocked: (b: boolean) => void
  setRestartModalOpen: (v: boolean) => void
  setRestartCompleted: (v: boolean) => void
}

export const usePoChat = create<PoChatState>()(
  persist(
    (set) => ({
      inputDraft: '',
      autoScrollLocked: false,
      restartModalOpen: false,
      restartCompleted: false,

      setDraft: (inputDraft) => set({ inputDraft }),
      setAutoScrollLocked: (autoScrollLocked) => set({ autoScrollLocked }),
      setRestartModalOpen: (restartModalOpen) => set({ restartModalOpen }),
      setRestartCompleted: (restartCompleted) => set({ restartCompleted }),
    }),
    {
      // T-PATCH-205: persist ONLY the unsent input draft so a ⌘R renderer
      // reload (or crash) doesn't lose what the user was typing. ChatPanel
      // calls setDraft('') on send, which writes '' through here — so a sent
      // message clears the persisted draft too (AC-5; send-clear unchanged).
      //
      // SENSITIVITY (구현주의 3): an unsent draft now lives in sessionStorage.
      // Mirroring store/workspace.ts, we use sessionStorage (NOT localStorage):
      // it survives a ⌘R reload but is wiped when the renderer session ends
      // (app quit), so the draft is not persisted to disk long-term. Only
      // `inputDraft` is partialized — the transient UI flags below stay
      // in-memory and are intentionally NOT persisted.
      name: 'productune.poChat',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ inputDraft: s.inputDraft }),
    },
  ),
)
