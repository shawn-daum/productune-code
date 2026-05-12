/**
 * naturalize.ts — user-visible natural language mapping for version history.
 *
 * Converts internal commit messages and ticket frontmatter milestones into
 * human-readable Korean strings. Zero external vocabulary (no branch / commit /
 * push / merge / worktree / dev / staging exposure).
 *
 * Re-used by: R7 메모리 편집기 timeline (read timeline source = useTicketScan,
 * same frontmatter parsing path). Do not add R7-specific logic here — keep this
 * module as a pure string-transform layer.
 */

// ── Commit message parser ─────────────────────────────────────────────────────

/**
 * Parsed fields from an autosave commit message.
 * Internal prefix (ticketId + changeReason + before/after) stays in metadata;
 * only `summary` is user-visible.
 */
export interface NaturalizedCommit {
  /** Ticket id extracted from commit subject (e.g. "T-P4-023"). null if not found. */
  ticketId: string | null
  /** Persona from old-style "[persona/turn N]" prefix. null if not present. */
  persona: string | null
  /** Turn number. null if not present. */
  turn: number | null
  /** The human-readable summary — the only field exposed in UI strings. */
  summary: string
}

// Autosave format (T-P4-021): "T-NNN [changeReason: before→after] summary"
// Old-style / plan.md format:  "T-NNN [persona/turn N] summary"
// Both patterns share: ticket-id at start, bracket group, summary tail.
const COMMIT_RE = /^(T-[A-Z0-9-]+)\s+\[([^\]]+)\]\s*(.*)/

/**
 * Parse a commit subject line into structured fields.
 *
 * Supports two bracket formats:
 *  - `T-NNN [status-change: todo→in-progress] summary` (autosave T-P4-021)
 *  - `T-NNN [persona/turn 3] summary` (older plan-format)
 *  - Any other subject → ticketId null, full string as summary.
 */
export function naturalizeCommit(msg: string): NaturalizedCommit {
  const trimmed = msg.trim()
  const m = COMMIT_RE.exec(trimmed)
  if (!m) {
    return { ticketId: null, persona: null, turn: null, summary: trimmed }
  }
  const ticketId = m[1]
  const bracket = m[2].trim()  // e.g. "status-change: todo→in-progress" or "pdt-developer/turn 3"
  const summary = m[3].trim() || bracket

  // Try persona/turn pattern
  const personaTurnM = /^([a-z-]+)\/turn\s+(\d+)$/i.exec(bracket)
  if (personaTurnM) {
    return {
      ticketId,
      persona: personaTurnM[1],
      turn: Number(personaTurnM[2]),
      summary,
    }
  }

  // Autosave change-reason pattern — bracket is metadata, not user-visible
  return { ticketId, persona: null, turn: null, summary }
}

// ── Frontmatter milestone mapper ──────────────────────────────────────────────

/**
 * Minimal frontmatter fields needed for milestone label generation.
 * Matches the Ticket interface subset used by useTicketScan.
 */
export interface TicketFrontmatter {
  ticket_id: string
  version?: string | null
  /** ISO date string or null */
  created_at?: string | null
  /** ISO date string or null */
  completed_at?: string | null
  status?: string | null
}

/**
 * Map ticket frontmatter to a user-visible milestone label.
 *
 * Mapping rule (§3.2 service-flow vocab + plan.md §2.2):
 *  - current open ticket in current version → "이번 작업"
 *  - completed ticket in past version      → "지난 작업"
 *  - ticket with no completed_at           → "{id} 시작"
 *  - ticket with completed_at              → "{id} 완료"
 */
export function naturalizeMilestone(ticket: TicketFrontmatter): string {
  const { ticket_id, status, completed_at } = ticket
  const isDone = status === 'done' || !!completed_at

  if (!isDone) {
    // Heuristic: "이번 작업" for in-progress / current
    if (status === 'in-progress' || status === 'review') {
      return '이번 작업'
    }
    return `${ticket_id} 시작`
  }

  // Done — distinguish current vs past by presence of completed_at
  if (completed_at) {
    return `${ticket_id} 완료`
  }
  return '지난 작업'
}

/**
 * Map an autosave change-reason string to a short user-visible action label.
 *
 * Used for the per-turn activity line inside a ticket card (plan §2.2).
 * External vocabulary is zero — internal reason stays internal.
 */
export function naturalizeChangeReason(reason: string): string {
  // Autosave reasons from T-P4-021
  if (reason.startsWith('status-change')) return '상태 변경'
  if (reason.startsWith('qa-status-change')) return '품질 확인'
  if (reason.startsWith('qa-loops-change')) return '품질 재확인'
  if (reason === 'manual') return '자동저장'
  // Fallback
  return '자동저장'
}
