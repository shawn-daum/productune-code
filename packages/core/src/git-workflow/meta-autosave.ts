/**
 * meta-autosave.ts — the meta repo's autosave beat (T-367, PRD §v1.2 경계 결정 2).
 *
 * T-364 landed the meta-git primitives (commitMeta / scanMetaHistory) with no
 * caller; this module is the single wiring point that puts commitMeta on the
 * EXISTING §10 autosave lifecycle: at each persona-turn beat it re-reads every
 * ticket, detects `AutosaveChangeReason` transitions against the same snapshot
 * store the code autosave uses (detectTicketTransitionsBatch — no new trigger
 * system), and makes at most one allowlist-scoped meta commit.
 *
 * Beat driver: the prdt-post-dispatch hook (PostToolUse:Agent + SubagentStop)
 * invokes `metaAutosaveTick` via the dist/bin/meta-cli bridge. Because GUI
 * persona sessions run through the same `claude` CLI (po-runner) as terminal
 * sessions, that ONE call site fires identically from CLI and GUI — parity by
 * construction, not by duplicated wiring.
 *
 * Silence contract (ticket 주의): on a project without the meta split
 * (`<stateDir>/meta.git` absent) this is a cheap, silent no-op that does NOT
 * consume the snapshot store — the pending transitions stay available for the
 * first beat after migration (T-366) initializes the repo.
 */

import fs from 'fs'
import path from 'path'
import {
  detectTicketTransitionsBatch,
  buildAutosaveMessage,
  type TicketTransition,
} from './autosave'
import {
  metaRepoExists,
  commitMeta,
  type MetaCommitSkipReason,
} from './meta-git'

/**
 * Commit subject for a beat that has a meta diff but no ticket transition
 * (PRD·wiki·state writes — PRD 경계 결정 2 includes these in the beat).
 * Plain subject: naturalizeCommit falls back to the full string as the
 * user-visible summary, and groupByTicket files it under the '' group.
 */
export const META_BEAT_FALLBACK_SUBJECT = '메타 자동 저장'

export interface MetaAutosaveTickResult {
  committed: boolean
  /** Present when committed. */
  sha?: string
  /** The commit subject used (present when committed). */
  message?: string
  /** Ticket transitions consumed by this beat (empty on a no-transition beat). */
  transitions: TicketTransition[]
  /** Present when not committed. */
  skipReason?: MetaCommitSkipReason
}

/** List every ticket markdown file: docs/tickets/<version-dir>/*.md. */
function listTicketFiles(projectDir: string): string[] {
  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  let versionDirs: string[]
  try {
    versionDirs = fs
      .readdirSync(ticketsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }

  const files: string[] = []
  for (const vd of versionDirs) {
    try {
      for (const entry of fs.readdirSync(path.join(ticketsRoot, vd))) {
        if (entry.endsWith('.md')) files.push(path.join(ticketsRoot, vd, entry))
      }
    } catch {
      // unreadable version dir — skip
    }
  }
  return files
}

/**
 * Build the beat's commit subject from its transitions.
 *
 * One logical change = one commit (PRD 경계 결정 2). commitMeta stages the
 * whole allowlist, so a beat that carries several transitions still lands as
 * ONE commit — the first transition names it (buildAutosaveMessage, the same
 * naturalize-parseable format as the code autosave) and the extra count is
 * appended to the summary tail so nothing is silently unlabeled.
 */
export function buildTickMessage(transitions: TicketTransition[]): string {
  if (transitions.length === 0) return META_BEAT_FALLBACK_SUBJECT
  const t = transitions[0]
  const extra = transitions.length > 1 ? ` (+${transitions.length - 1})` : ''
  return buildAutosaveMessage(t.ticketId, t.changeReason, t.before, t.after, t.summary + extra)
}

/**
 * One meta autosave beat: detect ticket transitions → commit the allowlist.
 *
 * - Meta repo missing → silent no-op; the snapshot store is NOT touched.
 * - No transitions → still attempts a commit (PRD/wiki/state writes are part
 *   of the beat) with the fallback subject; empty diff → `diff-empty` skip.
 * - Snapshot consumption is tied to the commit OUTCOME: on `manager-error`
 *   (e.g. an index.lock race) the snapshot is left untouched so the next beat
 *   re-detects the same transition and its label is not lost. `diff-empty`
 *   DOES consume — the content is already at HEAD (a concurrent beat won).
 * - Never throws: commitMeta already maps git failures to `manager-error`.
 */
export async function metaAutosaveTick(projectDir: string): Promise<MetaAutosaveTickResult> {
  if (!metaRepoExists(projectDir)) {
    return { committed: false, transitions: [], skipReason: 'meta-repo-missing' }
  }

  const tickets: Array<{ ticketId: string; content: string }> = []
  for (const fp of listTicketFiles(projectDir)) {
    try {
      // Ticket id = basename by prdt convention (docs/tickets/<v>/<T-id>.md);
      // processTicketFileChange uses the same fallback.
      tickets.push({ ticketId: path.basename(fp, '.md'), content: fs.readFileSync(fp, 'utf-8') })
    } catch {
      // unreadable ticket — skip, never fail the beat
    }
  }

  const { transitions, persist } = detectTicketTransitionsBatch(projectDir, tickets)
  const message = buildTickMessage(transitions)

  const res = await commitMeta(projectDir, message)
  if (res.committed) {
    persist()
    return { committed: true, sha: res.sha, message, transitions }
  }
  if (res.skipReason === 'diff-empty') persist()
  return { committed: false, transitions, skipReason: res.skipReason }
}
