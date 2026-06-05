import { create } from 'zustand'

// ── Types ────────────────────────────────────────────────────────────────────

export type PersonaId = 'po' | 'designer' | 'dev' | 'qa'

export type PersonaState = 'idle' | 'working' | 'done'

export interface PersonaStatusEvent {
  persona: PersonaId
  state: PersonaState
  artifact?: string  // done 일 때만 채움 — tooltip 노출용 짧은 이름
  at: string         // ISO timestamp
}

export interface PersonaEntry {
  persona: PersonaId
  state: PersonaState
  artifact?: string
  updatedAt: string
}

// ── Tab order: PO → Designer → Dev → QA ────────────────────────────────────

export const PERSONA_ORDER: PersonaId[] = ['po', 'designer', 'dev', 'qa']

export const PERSONA_LABELS: Record<PersonaId, string> = {
  po:       'PO',
  designer: 'Designer',
  dev:      'Developer',
  qa:       'QA',
}

// ── CSS color tokens (fallback hex for inline styles) ────────────────────────
// Mirrors CSS vars: --po / --designer / --dev / --qa (defined in global CSS or
// injected inline here as fallback until global token sheet lands).

export const PERSONA_COLORS: Record<PersonaId, string> = {
  po:       '#8B5CF6',  // --po  (brand violet, T-006 Option B)
  designer: '#FB923C',  // --designer (orange-400, T-006 Option B)
  dev:      '#38BDF8',  // --dev (sky-400)
  qa:       '#34D399',  // --qa
}

// ── Store ────────────────────────────────────────────────────────────────────

interface PersonaPresenceState {
  entries: Record<PersonaId, PersonaEntry>

  /** Apply a PersonaStatusEvent (main→renderer IPC payload or direct call). */
  setPersonaState: (
    persona: PersonaId,
    state: PersonaState,
    artifact?: string,
  ) => void

  /** Reset a persona back to idle (called by done-dismiss logic). */
  dismissDone: (persona: PersonaId) => void

  /** Reset all to idle — called on app boot / page reload. */
  resetAll: () => void
}

function makeDefaultEntries(): Record<PersonaId, PersonaEntry> {
  const now = new Date().toISOString()
  return {
    po:       { persona: 'po',       state: 'idle', updatedAt: now },
    designer: { persona: 'designer', state: 'idle', updatedAt: now },
    dev:      { persona: 'dev',      state: 'idle', updatedAt: now },
    qa:       { persona: 'qa',       state: 'idle', updatedAt: now },
  }
}

export const usePersonaPresence = create<PersonaPresenceState>((set) => ({
  entries: makeDefaultEntries(),

  setPersonaState: (persona, state, artifact) =>
    set((s) => ({
      entries: {
        ...s.entries,
        [persona]: {
          persona,
          state,
          artifact: state === 'done' ? artifact : undefined,
          updatedAt: new Date().toISOString(),
        },
      },
    })),

  dismissDone: (persona) =>
    set((s) => {
      const entry = s.entries[persona]
      if (entry.state !== 'done') return s
      return {
        entries: {
          ...s.entries,
          [persona]: { ...entry, state: 'idle', artifact: undefined, updatedAt: new Date().toISOString() },
        },
      }
    }),

  resetAll: () => set({ entries: makeDefaultEntries() }),
}))
