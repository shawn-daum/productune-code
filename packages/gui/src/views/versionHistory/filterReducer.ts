import type { PersonaKey, FilterState, FilterAction } from './types'

export const LS_PERSONA_KEY = 'workspace.versionHistory.filter.persona'

export const ALL_PERSONAS: PersonaKey[] = ['po', 'designer', 'developer', 'qa']

export const PERSONA_COLORS: Record<PersonaKey, string> = {
  po:        '#8B5CF6',  // brand violet
  designer:  '#FB923C',  // orange-400
  developer: '#38BDF8',  // sky-400
  qa:        '#34D399',  // emerald-400
}

export function loadPersonaFilter(): Set<PersonaKey> {
  try {
    const raw = localStorage.getItem(LS_PERSONA_KEY)
    if (!raw) return new Set(ALL_PERSONAS)
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed) || parsed.length === 0) return new Set(ALL_PERSONAS)
    return new Set(parsed.filter((p): p is PersonaKey => ALL_PERSONAS.includes(p as PersonaKey)))
  } catch {
    return new Set(ALL_PERSONAS)
  }
}

export function savePersonaFilter(active: Set<PersonaKey>): void {
  try {
    localStorage.setItem(LS_PERSONA_KEY, JSON.stringify([...active]))
  } catch { /* storage unavailable — silently ignore */ }
}

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'toggle-persona': {
      const next = new Set(state.personas)
      if (next.has(action.key)) {
        next.delete(action.key)
        // Always keep at least 1 persona active
        if (next.size === 0) return state
      } else {
        next.add(action.key)
      }
      savePersonaFilter(next)
      return { ...state, personas: next }
    }
    case 'set-date-from':
      return { ...state, dateFrom: action.value }
    case 'set-date-to':
      return { ...state, dateTo: action.value }
    case 'reset-dates':
      return { ...state, dateFrom: action.from, dateTo: action.to }
    default:
      return state
  }
}
