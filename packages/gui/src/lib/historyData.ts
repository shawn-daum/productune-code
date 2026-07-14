/**
 * historyData.ts — pure derivation for the Project History tab (T-349, spec §2.4).
 *
 * All data derives from git tags + docs/tickets/v<N>/ + docs/wiki/retro--v<N>.md
 * — nothing hand-maintained. These helpers are the testable core; the React
 * components are thin glue over them.
 */

/** A version id like v1, v1.0, v1.2.3. Excludes `backlog` and other dirs. */
export const VERSION_RE = /^v\d+(\.\d+)*$/

export interface TicketCounts {
  done: number
  dropped: number
  /** Non-terminal tickets still present in a closed version — an anomaly. */
  open: number
  total: number
}

/**
 * Count ticket statuses into the prdt 3-value shape (done / dropped / open).
 * Legacy 7-value statuses fold in: abandoned → dropped; every non-terminal
 * status (todo/in-progress/review/user-verify/blocked/…) → open. Unknown/absent
 * status counts as open (visible, not silently dropped).
 */
export function countTicketStatuses(
  statuses: Array<string | null | undefined>,
): TicketCounts {
  let done = 0
  let dropped = 0
  let open = 0
  for (const raw of statuses) {
    const s = (raw ?? '').trim().toLowerCase()
    if (s === 'done') done++
    else if (s === 'dropped' || s === 'abandoned') dropped++
    else open++
  }
  return { done, dropped, open, total: statuses.length }
}

/**
 * Extract the `## Outcome` block from a retro markdown document — everything
 * between the `## Outcome` heading and the next `## ` heading (or EOF),
 * heading excluded, trimmed. Returns null when there is no Outcome heading.
 * The retro playbook enforces this heading, so the structure is stable.
 */
export function parseOutcomeBlock(retroMarkdown: string): string | null {
  const lines = retroMarkdown.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Outcome\b/i.test(lines[i])) { start = i + 1; break }
  }
  if (start === -1) return null
  const buf: string[] = []
  for (let i = start; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    buf.push(lines[i])
  }
  const block = buf.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
  return block.length ? block : null
}
