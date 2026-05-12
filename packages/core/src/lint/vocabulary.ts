/**
 * vocabulary.ts — T-P4-022 sub-f + T-P4-023 sub-d (extended)
 *
 * Two APIs:
 *  - checkVocabulary / assertVocabulary / lintLocaleObject — T-P4-022 sub-f
 *    (violation detection only, no replacement suggestion)
 *  - lintVocabulary — T-P4-023 sub-d (VocabIssue with suggestion field)
 *    (design service-flow §3.2 mapping table)
 *
 * Patterns that must NOT appear in user-visible strings.
 * Internal variable names / code comments are OK.
 *
 * Usage:
 *   import { checkVocabulary, FORBIDDEN_PATTERNS } from '@productune/core/lint/vocabulary'
 *   const violations = checkVocabulary(str)
 *   if (violations.length > 0) throw new Error(...)
 */

export interface VocabViolation {
  pattern: string
  match: string
  index: number
}

/**
 * Patterns forbidden in user-visible UI strings.
 * Case-insensitive. Whole-word or phrase match.
 */
export const FORBIDDEN_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'PR',           re: /\bPR\b/i },
  { label: 'pull request', re: /pull\s+request/i },
  { label: 'branch',       re: /\bbranch(es)?\b/i },
  { label: 'merge',        re: /\bmerge[sd]?\b/i },
  { label: 'squash',       re: /\bsquash\b/i },
  { label: 'commit',       re: /\bcommit[s]?\b/i },
  { label: 'sha',          re: /\bsha\b/i },
  { label: 'worktree',     re: /\bworktree[s]?\b/i },
  { label: 'staging',      re: /\bstaging\b/i },
]

/**
 * Check a user-facing string for forbidden vocabulary.
 * Returns a (possibly empty) array of violations.
 */
export function checkVocabulary(text: string): VocabViolation[] {
  const violations: VocabViolation[] = []
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    const reGlobal = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = reGlobal.exec(text)) !== null) {
      violations.push({ pattern: label, match: m[0], index: m.index })
    }
  }
  return violations
}

/**
 * Assert no forbidden vocabulary in a user-facing string.
 * Throws with a descriptive message if any violations are found.
 */
export function assertVocabulary(text: string, context = 'string'): void {
  const violations = checkVocabulary(text)
  if (violations.length > 0) {
    const msgs = violations.map((v) => `"${v.match}" (pattern: ${v.pattern}) at index ${v.index}`)
    throw new Error(
      `Vocabulary lint failed in ${context}: ${msgs.join('; ')}`,
    )
  }
}

// ── T-P4-023 sub-d: lintVocabulary with suggestion mapping ────────────────────
// Design service-flow §3.2 mapping table: external vocab → natural Korean.

export interface VocabIssue {
  /** The canonical token label matched. */
  token: string
  /** Suggested natural-language replacement (Korean). */
  suggestion: string
  /** Char offset of the match in the original text. */
  index: number
}

interface VocabMappingEntry {
  /** Global regex — must have the `g` flag. */
  pattern: RegExp
  token: string
  suggestion: string
}

/**
 * Ordered mapping table — longer patterns first to avoid sub-match overlap
 * (e.g. "pull request" tested before bare "PR").
 */
const VOCAB_MAPPING: VocabMappingEntry[] = [
  { pattern: /pull\s+request/gi, token: 'pull request', suggestion: '작업 제출 (배포 요청)' },
  { pattern: /\bPR\b/g,           token: 'PR',           suggestion: '작업 제출' },
  { pattern: /\bbranch(?:es)?\b/gi, token: 'branch',     suggestion: '작업 공간' },
  { pattern: /\bmerge[sd]?\b/gi,  token: 'merge',        suggestion: '통합 완료' },
  { pattern: /\bsquash\b/gi,      token: 'squash',       suggestion: '정리 저장' },
  { pattern: /\bcommit[st]?\b/gi, token: 'commit',       suggestion: '자동 저장' },
  { pattern: /\bsha\b/gi,         token: 'sha',          suggestion: '저장 식별자' },
  { pattern: /\bworktree\b/gi,    token: 'worktree',     suggestion: '작업 공간' },
  { pattern: /\bdev\b/gi,         token: 'dev',          suggestion: '개발 환경' },
  { pattern: /\bstaging\b/gi,     token: 'staging',      suggestion: '검증 환경' },
  { pattern: /\bgit\b/gi,         token: 'git',          suggestion: '이력 관리' },
]

/**
 * Lint `text` for external vocabulary. Returns one VocabIssue per match,
 * ordered by `index` ascending.
 *
 * Longer patterns (e.g. "pull request") take priority — sub-tokens within
 * already-matched ranges are skipped to avoid double-flagging.
 */
export function lintVocabulary(text: string): VocabIssue[] {
  const issues: VocabIssue[] = []
  // Track [start, end) ranges already covered by a longer match.
  const covered: Array<[number, number]> = []

  const isCovered = (s: number, e: number): boolean =>
    covered.some(([cs, ce]) => s >= cs && e <= ce)

  for (const entry of VOCAB_MAPPING) {
    entry.pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = entry.pattern.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (!isCovered(start, end)) {
        issues.push({ token: entry.token, suggestion: entry.suggestion, index: start })
        covered.push([start, end])
      }
    }
  }

  return issues.sort((a, b) => a.index - b.index)
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a locale JSON object (flat or nested) for vocabulary violations.
 * Returns a map of dotted key → violations array.
 */
export function lintLocaleObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, VocabViolation[]> {
  const out: Record<string, VocabViolation[]> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, lintLocaleObject(v as Record<string, unknown>, key))
    } else if (typeof v === 'string') {
      const violations = checkVocabulary(v)
      if (violations.length > 0) {
        out[key] = violations
      }
    }
  }
  return out
}
