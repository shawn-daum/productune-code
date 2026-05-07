/**
 * poChat.ts — chat-UI state isolated from `useWorkspace` (T-P4-041).
 *
 * `useWorkspace` already owns `messages`, `streaming`, `claudeSessionId` —
 * the conversation domain model. This slice owns purely UI bits that don't
 * belong in the conversation:
 *   - panel visibility (FAB toggle)
 *   - next-delegate selector value
 *   - input draft
 *   - auto-scroll lock
 */

import { create } from 'zustand'

export type DelegatePersona =
  | 'pdt-po'
  | 'pdt-designer'
  | 'pdt-developer'
  | 'pdt-qa'

interface PoChatState {
  panelVisible: boolean
  nextDelegate: DelegatePersona
  inputDraft: string
  autoScrollLocked: boolean

  setPanelVisible: (v: boolean) => void
  togglePanel: () => void
  setNextDelegate: (p: DelegatePersona) => void
  setDraft: (s: string) => void
  setAutoScrollLocked: (b: boolean) => void
}

export const usePoChat = create<PoChatState>((set) => ({
  panelVisible: true,
  nextDelegate: 'pdt-po',
  inputDraft: '',
  autoScrollLocked: false,

  setPanelVisible: (panelVisible) => set({ panelVisible }),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setNextDelegate: (nextDelegate) => set({ nextDelegate }),
  setDraft: (inputDraft) => set({ inputDraft }),
  setAutoScrollLocked: (autoScrollLocked) => set({ autoScrollLocked }),
}))

/** Map a delegate persona handle to a `MessageKind` for pre-allocated bubbles. */
export function delegateToKind(d: DelegatePersona): 'po' | 'designer' | 'dev' | 'qa' {
  switch (d) {
    case 'pdt-po':        return 'po'
    case 'pdt-designer':  return 'designer'
    case 'pdt-developer': return 'dev'
    case 'pdt-qa':        return 'qa'
  }
}
