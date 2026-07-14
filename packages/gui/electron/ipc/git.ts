/**
 * git.ts — read-only local git tag list (T-349, spec §2.4).
 *
 * The project history feature needs the set of closed versions, and the ONLY
 * source of truth for "closed" is a git tag existing (retro/ticket status are
 * secondary). The git tag commit date is also the only date source we have
 * (retro frontmatter carries no date). No existing IPC reads local tags —
 * `github:*` is the remote GitHub API, not `git tag`. This adds the one net-new
 * backend dependency the spec flags.
 *
 * Channel: git:listTags(projectDir) → { name, date }[]
 *   - name = tag short name (e.g. "v1.0")
 *   - date = commit/creator date, "YYYY-MM-DD"
 *   - sorted by date descending (newest closed version first)
 *
 * Read-only invariant: no ref creation/mutation. Safe on repos with zero tags
 * (returns []) and on non-git directories (git errors → []).
 */

import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitTag {
  name: string
  /** Commit/creator date, "YYYY-MM-DD". */
  date: string
}

// Field separator between tag name and date. Version tag names (v1.0) and
// short dates (YYYY-MM-DD) never contain a pipe, so it round-trips safely.
const SEP = '|'
const FORMAT = `%(refname:short)${SEP}%(creatordate:short)`

/**
 * Parse `git for-each-ref` stdout (one "name<SEP>YYYY-MM-DD" per line) into
 * GitTag[], sorted by date descending. Pure + exported for unit testing.
 *
 * Robust to blank/malformed lines (skipped) and missing dates (kept with an
 * empty date so a tag never silently vanishes; it sorts last).
 */
export function parseTagLines(stdout: string): GitTag[] {
  const tags: GitTag[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim()) continue
    const sepIdx = line.indexOf(SEP)
    const name = (sepIdx === -1 ? line : line.slice(0, sepIdx)).trim()
    if (!name) continue
    const date = sepIdx === -1 ? '' : line.slice(sepIdx + 1).trim()
    tags.push({ name, date })
  }
  // Date descending (newest first). Empty dates sort last. String compare is
  // valid for "YYYY-MM-DD".
  tags.sort((a, b) => {
    if (a.date === b.date) return a.name.localeCompare(b.name)
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
  return tags
}

export async function listTags(projectDir: string): Promise<GitTag[]> {
  if (!projectDir) return []
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectDir, 'for-each-ref', `--format=${FORMAT}`, 'refs/tags'],
      { maxBuffer: 4 * 1024 * 1024 },
    )
    return parseTagLines(stdout)
  } catch {
    // Non-git dir, git not installed, or any git failure → no tags. The history
    // UI treats [] + its own error banner (git IPC unavailable) distinctly.
    return []
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('git:listTags', async (_event, projectDir: string): Promise<GitTag[]> =>
    listTags(projectDir),
  )
}
