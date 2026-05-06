import { create } from 'zustand'
import type { Project, Phase, PoState, Message } from '../lib/types'
import { PHASE_NAMES } from '../lib/types'

interface WorkspaceState {
  project: Project | null
  poState: PoState | null
  phase: Phase  // Layer A — Version cycle position (derived from poState.current_phase)

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

function derivePhase(poState: PoState | null): Phase {
  const num = poState?.current_phase
  if (typeof num === 'number' && num in PHASE_NAMES) return PHASE_NAMES[num]
  return 'PRD'  // fallback for projects on legacy schema
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  project: null,
  poState: null,
  phase: 'PRD',
  messages: [],
  claudeSessionId: null,
  streaming: false,

  setProject: (project) => set({ project }),

  setPoState: (poState) => {
    set({ poState, phase: derivePhase(poState) })
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
