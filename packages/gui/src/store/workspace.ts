import { create } from 'zustand'
import type { Project, Stage, PoState, Message } from '../lib/types'

interface WorkspaceState {
  project: Project | null
  poState: PoState | null
  stage: Stage

  // ── PO session slice (single per project) ────────────────────────────────────
  messages: Message[]
  claudeSessionId: string | null
  streaming: boolean

  setProject: (p: Project | null) => void
  setPoState: (s: PoState | null) => void
  setMessages: (messages: Message[]) => void
  appendMessage: (message: Message) => void
  appendToLastMessage: (textChunk: string) => void
  setClaudeSessionId: (id: string | null) => void
  setStreaming: (streaming: boolean) => void
  resetSession: () => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  project: null,
  poState: null,
  stage: 'PRD',
  messages: [],
  claudeSessionId: null,
  streaming: false,

  setProject: (project) => set({ project }),

  setPoState: (poState) => {
    const stage = (poState?.current_task?.stage as Stage) ?? 'PRD'
    set({ poState, stage })
  },

  setMessages: (messages) => set({ messages }),

  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  appendToLastMessage: (textChunk) =>
    set((s) => {
      if (s.messages.length === 0) return s
      const last = s.messages[s.messages.length - 1]
      const updated = { ...last, text: last.text + textChunk }
      return { messages: [...s.messages.slice(0, -1), updated] }
    }),

  setClaudeSessionId: (claudeSessionId) => set({ claudeSessionId }),

  setStreaming: (streaming) => set({ streaming }),

  resetSession: () => set({ messages: [], claudeSessionId: null, streaming: false }),
}))
