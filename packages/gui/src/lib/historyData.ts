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
 * T-657: the closed-version records — every CLOSED `## v<N>.<m>` section is
 * the ENTIRE body of `docs/prd/versions/v<N>.<m>.md`, moved out of PRD.md
 * byte-identical at close (contracts §Fixed paths); a tickets-only round has a
 * one-line `no PRD section — <decision>` stub at the same path. `ls` is the
 * index. T-602's one-lump `docs/prd/history.md` is gone — the user reversed it
 * on 2026-09-18 because a lump has no index and three rounds with no PRD
 * section went unseen in it. No file here is named `PRD.md`: ntf-pm's
 * portfolio pipe resolves the current PRD by first match over
 * `docs/prd/PRD.md` · `docs/PRD.md` · `PRD.md`.
 */
export const PRD_VERSIONS_DIR_REL = 'docs/prd/versions'

/**
 * Resolve the PRD path for a CLOSED version's History-detail row (T-546
 * follow-up: HistoryDetailView hardcoded `docs/prd/versions/<v>.md` with no
 * prdt branch, so a real closed version pointed at a file prdt never wrote and
 * rendered the "no PRD" placeholder instead of the actual PRD).
 *
 * HistoryDetailView only ever renders CLOSED versions (HistoryPane excludes
 * the in-progress version from its list), so — unlike PrdSection, which also
 * distinguishes the OPEN/current version — only the closed record matters:
 *   - prdt (isPrdt=true)  → `docs/prd/versions/<versionId>.md` (T-657): the
 *     closed section (or its stub) IS that file. Between T-602 and T-657 this
 *     branch answered `docs/prd/history.md`; that file no longer exists, so
 *     the old answer would render the placeholder for every closed version.
 *   - legacy (isPrdt=false) → `docs/prd/versions/<versionId>.md`, unchanged.
 *     A legacy snapshot file is not necessarily 1:1 with a version: `v0.4.md`
 *     can be the record for v0.1~v0.4 together — the helper only names the
 *     path; existence is the component's concern (IPC readFile → placeholder).
 * Both branches now name the same path. The parameter stays so the two callers
 * keep one signature and the mode stays visible at the call site.
 */
export function resolveClosedVersionPrdPath(_isPrdt: boolean, versionId: string): string {
  return `${PRD_VERSIONS_DIR_REL}/${versionId}.md`
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
