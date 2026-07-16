/**
 * gitignore-managed-block.ts — code-repo `.gitignore` managed block (T-365,
 * PRD §v1.2 경계 결정 3).
 *
 * prdt owns exactly one marker-delimited block inside the CODE repo's
 * `.gitignore`; the block carries the meta allowlist as root-anchored ignore
 * patterns, so meta changes never appear in the code repo's status / diff /
 * commits. Everything outside the markers is user territory and is never
 * touched — a malformed marker pair (one missing, reversed) makes the sync a
 * safe no-op instead of a destructive rewrite.
 *
 * The sync is idempotent (unchanged content → no write) and is invoked on the
 * meta turn beat (commitMeta, 경계 결정 2) plus at init. The python CLI
 * (`scripts/prdt`) renders the identical block for fresh `prdt init`; a parity
 * test (gitignore-managed-block.test.ts) pins the two literals together.
 *
 * This module intentionally takes the allowlist as a parameter (instead of
 * importing meta-git's readMetaAllowlist) to stay dependency-free — meta-git
 * imports this module for the commitMeta beat, and a reverse import would be a
 * cycle.
 */

import fs from 'fs'
import path from 'path'

export const MANAGED_BLOCK_START = '# >>> prdt meta (managed) >>>'
export const MANAGED_BLOCK_END = '# <<< prdt meta (managed) <<<'

/** One stable comment line inside the block (prdt-owned space). */
const MANAGED_BLOCK_COMMENT =
  '# generated from the prdt meta allowlist — edits inside this block are overwritten'

/**
 * Allowlist entry → root-anchored .gitignore pattern (`docs/prd` → `/docs/prd`).
 * Root-anchoring keeps the block from ignoring same-named files elsewhere in
 * user code. Empty/degenerate entries are dropped.
 */
function toPattern(entry: string): string | null {
  let s = entry.trim()
  if (s.startsWith('./')) s = s.slice(2)
  s = s.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!s) return null
  return '/' + s
}

/** Render the full managed block (markers included, no trailing newline). */
export function renderManagedBlock(allowlist: string[]): string {
  const patterns: string[] = []
  for (const entry of allowlist) {
    const p = toPattern(entry)
    if (p && !patterns.includes(p)) patterns.push(p)
  }
  return [MANAGED_BLOCK_START, MANAGED_BLOCK_COMMENT, ...patterns, MANAGED_BLOCK_END].join('\n')
}

export interface GitignoreSyncResult {
  /** True when `.gitignore` was (re)written. */
  changed: boolean
  /** Present when the sync intentionally did nothing. */
  skipped?: 'malformed-markers'
  error?: string
}

/**
 * Idempotently inject/refresh the managed block in `<projectDir>/.gitignore`.
 *
 * - No markers → append the block (creating the file if absent).
 * - Both markers, in order → rewrite ONLY the lines between them.
 * - One marker missing or reversed → `skipped: 'malformed-markers'`, no write.
 * - Result byte-identical to the current file → no write (`changed: false`).
 *
 * Write is atomic (tmp + rename). Never throws — fs errors land in `error`.
 */
export function syncGitignoreManagedBlock(
  projectDir: string,
  allowlist: string[],
): GitignoreSyncResult {
  const fp = path.join(projectDir, '.gitignore')
  const block = renderManagedBlock(allowlist)

  let current: string | null = null
  try {
    current = fs.readFileSync(fp, 'utf-8')
  } catch {
    current = null // absent → create below
  }

  let next: string
  if (current === null || current === '') {
    next = block + '\n'
  } else {
    const lines = current.split('\n')
    const start = lines.findIndex((l) => l.trim() === MANAGED_BLOCK_START)
    const end = lines.findIndex((l) => l.trim() === MANAGED_BLOCK_END)

    if (start === -1 && end === -1) {
      const sep = current.endsWith('\n') ? '' : '\n'
      next = current + sep + block + '\n'
    } else if (start === -1 || end === -1 || end < start) {
      return { changed: false, skipped: 'malformed-markers' }
    } else {
      const before = lines.slice(0, start)
      const after = lines.slice(end + 1)
      next = [...before, block, ...after].join('\n')
      if (!next.endsWith('\n')) next += '\n'
    }
  }

  if (next === current) return { changed: false }

  try {
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, next)
    fs.renameSync(tmp, fp)
    return { changed: true }
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : String(err) }
  }
}
