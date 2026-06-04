/**
 * doctrineDelta — T-PATCH-022 (GAP-1)
 *
 * Builds the CURATED change summary enqueued as a pending-promotion `delta` for
 * the PO-review save path. Critically this is NOT the full edited file: the
 * existing mechanicalWrite APPENDS `delta` to the target on approval, so enqueueing
 * the whole document would duplicate it. Instead we enqueue a human-readable
 * change note + a compact unified-diff-style delta of the proposed change, which
 * matches the existing curation-and-append promotion semantics.
 */

export interface DoctrineReviewDeltaInput {
  /** Canonical persona dir token, e.g. `developer`. */
  persona: string
  /** Doctrine tier (1 = project, 2 = personal). */
  tier: 0 | 1 | 2
  /** Display path (relName preferred, else absolute). */
  relPath: string
  /** Current on-disk content (baseline). */
  before: string
  /** Proposed edited content. */
  after: string
}

const MAX_DIFF_LINES = 60

/**
 * A minimal line-level diff (LCS) emitting unified-diff-style markers:
 *   `  ctx` unchanged, `- old`, `+ new`. Truncated to MAX_DIFF_LINES with a
 * trailing ellipsis marker. Good enough for a human review note — not a patch
 * meant to be applied.
 */
function lineDiff(before: string, after: string): string {
  const a = before.length ? before.split('\n') : []
  const b = after.length ? after.split('\n') : []

  // LCS table.
  const m = a.length
  const n = b.length
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: string[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`)
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`)
      i++
    } else {
      out.push(`+ ${b[j]}`)
      j++
    }
  }
  while (i < m) out.push(`- ${a[i++]}`)
  while (j < n) out.push(`+ ${b[j++]}`)

  // Keep only changed lines plus light context: drop runs of unchanged lines.
  const changed = out.filter((l) => l.startsWith('+ ') || l.startsWith('- '))
  const body = changed.length ? changed : out
  if (body.length <= MAX_DIFF_LINES) return body.join('\n')
  return body.slice(0, MAX_DIFF_LINES).join('\n') + `\n… (+${body.length - MAX_DIFF_LINES} more lines)`
}

export function buildDoctrineReviewDelta(input: DoctrineReviewDeltaInput): string {
  const { persona, tier, relPath, before, after } = input
  const tierLabel = tier === 1 ? 'project (T1)' : tier === 2 ? 'personal (T2)' : `tier ${tier}`
  const beforeLines = before.length ? before.split('\n').length : 0
  const afterLines = after.length ? after.split('\n').length : 0
  const diff = lineDiff(before, after)

  return [
    `## GUI doctrine edit — review requested`,
    ``,
    `- persona: ${persona || '(unknown)'}`,
    `- tier: ${tierLabel}`,
    `- file: ${relPath}`,
    `- lines: ${beforeLines} → ${afterLines}`,
    ``,
    `Proposed full-file replacement. Change summary (unified-diff style; not a`,
    `literal patch — review and apply manually):`,
    ``,
    '```diff',
    diff || '(no textual changes detected)',
    '```',
  ].join('\n')
}
