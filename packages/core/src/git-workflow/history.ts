/**
 * history.ts — git log scan and ticket-group helpers for version history UI.
 *
 * Parses `git -C <worktreePath> log --format='%H|%s|%ai'` output into
 * structured HistoryEntry records, then groups by ticket id extracted from
 * the commit subject prefix (autosave format: "T-NNN [...] summary").
 *
 * Graceful fallback: parse errors and missing worktrees return [] + warn.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  /** Full SHA-1 hash */
  sha: string
  /** Commit subject line (raw — naturalize.ts converts to user-visible) */
  subject: string
  /** ISO-8601 date string (author date from %ai) */
  authorDate: string
}

// ── Git log scan ──────────────────────────────────────────────────────────────

const TICKET_PREFIX_RE = /^(T-[A-Z0-9-]+)\s+/

/**
 * Run `git log` in `worktreePath` and return structured entries.
 *
 * @param worktreePath Absolute path to the git worktree (or project root).
 * @param opts.since   Only return commits newer than this date (optional).
 * @param opts.limit   Max entries to return (default 200).
 */
export async function scanGitHistory(
  worktreePath: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<HistoryEntry[]> {
  const limit = opts.limit ?? 200
  const args: string[] = ['-C', worktreePath, 'log', `--format=%H|%s|%ai`]

  if (opts.since) {
    // git --after accepts ISO date strings
    args.push(`--after=${opts.since.toISOString()}`)
  }
  args.push(`-n`, String(limit))

  let stdout: string
  try {
    const result = await execFileAsync('git', args, { timeout: 10_000 })
    stdout = result.stdout
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Non-fatal — worktree may not exist yet or git may be unavailable.
    console.warn('[history] scanGitHistory: git log failed —', msg)
    return []
  }

  const entries: HistoryEntry[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const firstPipe = line.indexOf('|')
    const secondPipe = line.indexOf('|', firstPipe + 1)
    if (firstPipe < 0 || secondPipe < 0) {
      console.warn('[history] scanGitHistory: unexpected log line —', line)
      continue
    }
    const sha = line.slice(0, firstPipe).trim()
    const subject = line.slice(firstPipe + 1, secondPipe).trim()
    const authorDate = line.slice(secondPipe + 1).trim()
    if (!sha) continue
    entries.push({ sha, subject, authorDate })
  }

  return entries
}

// ── Group by ticket id ────────────────────────────────────────────────────────

/**
 * Group HistoryEntry records by the ticket id extracted from the commit subject.
 *
 * Commits whose subject does not start with a ticket id prefix (T-NNN) are
 * grouped under the key `''` (empty string).
 *
 * Entries within each group preserve the original order (newest-first from
 * git log).
 */
export function groupByTicket(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const m = TICKET_PREFIX_RE.exec(entry.subject)
    const key = m ? m[1] : ''
    const existing = map.get(key) ?? []
    existing.push(entry)
    map.set(key, existing)
  }
  return map
}
