import type { Ticket } from '../../lib/types'
import type { PersonaKey, PersonaActivityRow, CommitLine } from './types'
import { ALL_PERSONAS } from './filterReducer'

// naturalizeCommit is duplicated here from packages/core/src/history/naturalize.ts
// because @productune/core imports Node.js builtins (child_process, util) which
// Vite cannot bundle for the renderer process. The pure string-transform
// functions are safe to inline.
export function naturalizeCommit(msg: string): { summary: string } {
  const trimmed = msg.trim()
  const m = /^(T-[A-Z0-9-]+)\s+\[([^\]]+)\]\s*(.*)/.exec(trimmed)
  if (!m) return { summary: trimmed }
  const summary = m[3].trim() || m[2].trim()
  return { summary }
}

/** Extract rows from the ## Persona Activity table in ticket markdown body. */
export function parsePersonaActivity(raw: string): PersonaActivityRow[] {
  const lines = raw.split('\n')
  let inTable = false
  const rows: PersonaActivityRow[] = []
  for (const line of lines) {
    if (/^\|\s*When\s*\|/.test(line)) { inTable = true; continue }
    if (!inTable) continue
    if (/^\|[-\s|]+\|/.test(line)) continue
    if (!line.startsWith('|')) { inTable = false; continue }
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cols.length >= 5) {
      rows.push({
        when: cols[0] ?? '',
        persona: cols[1] ?? '',
        model: cols[2] ?? '',
        effort: cols[3] ?? '',
        turn: '',
        result: cols[4] ?? '',
      })
    }
  }
  return rows
}

/** Parse the commit subject to a user-visible one-liner (naturalize → summary). */
export function commitSummaryLine(subject: string): string {
  const n = naturalizeCommit(subject)
  return n.summary || subject
}

export function toDateStr(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
}

export function ticketDateKey(ticket: Ticket): string {
  return (ticket as any).completed_at ?? (ticket as any).created_at ?? ''
}

export function dateInRange(dateStr: string, from: string, to: string): boolean {
  if (!dateStr) return true
  const d = dateStr.slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function personaMatchesFilter(ticket: Ticket, activePersonas: Set<PersonaKey>): boolean {
  const assignee = ((ticket as any).assignee as string | undefined) ?? ''
  // assignee is like "pdt-designer" — strip prefix
  const key = assignee.replace('pdt-', '') as PersonaKey
  if (ALL_PERSONAS.includes(key)) return activePersonas.has(key)
  // Unknown persona — show by default
  return true
}
