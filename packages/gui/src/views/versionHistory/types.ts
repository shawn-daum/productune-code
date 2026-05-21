import type { Ticket } from '../../lib/types'

export type PersonaKey = 'po' | 'designer' | 'developer' | 'qa'

export interface FilterState {
  /** Active persona keys — chip toggled on. */
  personas: Set<PersonaKey>
  /** ISO date string (YYYY-MM-DD) or empty. */
  dateFrom: string
  dateTo: string
}

export type FilterAction =
  | { type: 'toggle-persona'; key: PersonaKey }
  | { type: 'set-date-from'; value: string }
  | { type: 'set-date-to'; value: string }
  | { type: 'reset-dates'; from: string; to: string }

// Vercel deploy event type (inlined — @productune/core value import unsafe in Vite)
export interface FetchedDeployEvent {
  deploymentId: string
  url: string
  createdAt: string
  readyAt: string | null
  state: string
  gitRef: string | null
  includedTickets: string[]
  mergedShaSet: string[]
}

// ── Persona activity row type (from ticket ## Persona Activity table) ─────────
export interface PersonaActivityRow {
  when: string
  persona: string
  model: string
  effort: string
  turn: string
  result: string
}

export interface CommitLine {
  sha: string
  subject: string
  authorDate: string
}

export type StatusKey = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked' | 'abandoned' | string

export type CardItem =
  | { kind: 'ticket'; ticket: Ticket; key: string; date: string }
  | { kind: 'deploy'; deploy: FetchedDeployEvent; key: string; date: string }
