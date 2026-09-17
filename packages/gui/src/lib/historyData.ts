/**
 * historyData.ts — pure derivation for the Project History tab (T-349, spec §2.4).
 *
 * All data derives from git tags + docs/tickets/v<N>/ + docs/wiki/retro--v<N>.md
 * — nothing hand-maintained. These helpers are the testable core; the React
 * components are thin glue over them.
 */

/** A version id like v1, v1.0, v1.2.3. Excludes `backlog` and other dirs. */
export const VERSION_RE = /^v\d+(\.\d+)*$/

/** The PRD working document (prdt mode): standing head + the ONE open version
 * section. PrdSection imports this — one definition, two readers. */
export const PRD_MASTER_REL = 'docs/prd/PRD.md'

/**
 * T-602: the PRD history — every CLOSED `## v<N>.<m>` section, moved out of
 * PRD.md byte-identical at close (contracts §Fixed paths). One human-read lump,
 * never per-version files, and deliberately NOT named `PRD.md`: ntf-pm's
 * portfolio pipe resolves the current PRD by first match over
 * `docs/prd/PRD.md` · `docs/PRD.md` · `PRD.md`, so a `PRD.md` basename on any of
 * those paths could serve history as the current PRD without an error.
 */
export const PRD_HISTORY_REL = 'docs/prd/history.md'

/**
 * Resolve the PRD path for a CLOSED version's History-detail row (T-546
 * follow-up: HistoryDetailView hardcoded `docs/prd/versions/<v>.md` with no
 * prdt branch, so a real closed version — e.g. a `v0.5` git tag — pointed at
 * a file prdt never writes and rendered the "no PRD" placeholder instead of
 * the actual PRD).
 *
 * HistoryDetailView only ever renders CLOSED versions (HistoryPane excludes
 * the in-progress version from its list), so — unlike PrdSection, which also
 * distinguishes the OPEN/current version — the only branch that matters here
 * is prdt vs legacy:
 *   - prdt (isPrdt=true)  → ALWAYS docs/prd/history.md (T-602), regardless of
 *     whether a `docs/prd/versions/<versionId>.md` file happens to exist on
 *     disk. prdt abolished the per-version snapshot (T-291, adapter A8), and
 *     since T-602 a closed section no longer lives in PRD.md either — PRD.md is
 *     head + the open section only, so resolving it here would render a file
 *     that does not contain this version. The reader gets the whole history
 *     lump (no `#v` anchor scroll in the md tab yet).
 *   - legacy (isPrdt=false) → ALWAYS `docs/prd/versions/<versionId>.md`,
 *     unchanged. A legacy snapshot file is not necessarily 1:1 with a version:
 *     `v0.4.md` can be the record for v0.1~v0.4 together, so this branch never
 *     stops reading `versions/` — it only stops being reached at all once a
 *     project is prdt.
 */
export function resolveClosedVersionPrdPath(isPrdt: boolean, versionId: string): string {
  return isPrdt ? PRD_HISTORY_REL : `docs/prd/versions/${versionId}.md`
}

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
