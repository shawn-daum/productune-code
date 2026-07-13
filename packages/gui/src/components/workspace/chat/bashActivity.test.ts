/**
 * bashActivity.test.ts — T-333
 *
 * Covers the acceptance bullets: a Bash tool_use's activity label is always
 * human-readable (never raw shell text), an unusable/missing `description`
 * falls back to a command-pattern bucket, and an unmapped command still
 * resolves to the safe generic bucket instead of erroring or leaking raw text.
 * Follows the framework-free case-table + single vitest driver precedent
 * (../main/panes/browserUrl.test.ts).
 */

import { descriptionUsable, bashFallbackBucket, rawBashCommand } from './bashActivity'
import { test, expect } from 'vitest'

interface DescCase {
  readonly label: string
  readonly desc: string
  readonly uiLang: string | undefined
  readonly expected: boolean
}

const DESCRIPTION_CASES: readonly DescCase[] = [
  { label: 'Korean description under Korean UI is usable', desc: 'po-state 확인', uiLang: 'ko', expected: true },
  { label: 'English description under Korean UI is NOT usable (T-333 lever b)', desc: 'Check po-state file', uiLang: 'ko', expected: false },
  { label: 'English description under English UI is usable', desc: 'Check po-state file', uiLang: 'en', expected: true },
  { label: 'no uiLang (unknown) defaults to usable — never blocks on missing signal', desc: 'Check po-state file', uiLang: undefined, expected: true },
  { label: 'ko-KR locale variant still recognized as Korean', desc: 'Check po-state file', uiLang: 'ko-KR', expected: false },
]

interface BucketCase {
  readonly label: string
  readonly cmd: string
  readonly expected: string
}

const BUCKET_CASES: readonly BucketCase[] = [
  { label: 'cat maps to cat bucket', cmd: 'cat .prdt/po-state.json', expected: 'cat' },
  { label: 'chained echo+cat (the real T-333 repro) maps off the first word (echo)', cmd: 'echo "--- po-state ---"; cat .prdt/po-state.json', expected: 'echo' },
  { label: 'grep maps to grep bucket', cmd: 'grep -rn "foo" src/', expected: 'grep' },
  { label: 'ripgrep alias maps to grep bucket', cmd: 'rg "foo"', expected: 'grep' },
  { label: 'git maps to git bucket', cmd: 'git status', expected: 'git' },
  { label: 'npm maps to run bucket', cmd: 'npm test', expected: 'run' },
  { label: 'absolute-path command is basename-resolved', cmd: '/usr/bin/git log -1', expected: 'git' },
  { label: 'unmapped command falls back to generic — never errors, never raw', cmd: 'some-random-tool --flag', expected: 'generic' },
  { label: 'empty command falls back to generic', cmd: '', expected: 'generic' },
]

function runDescriptionCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of DESCRIPTION_CASES) {
    const actual = descriptionUsable(c.desc, c.uiLang)
    if (actual !== c.expected) {
      failures.push(`[${c.label}]: expected ${c.expected}, got ${actual}`)
    }
  }
  return { passed: DESCRIPTION_CASES.length - failures.length, failures }
}

function runBucketCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of BUCKET_CASES) {
    const actual = bashFallbackBucket(c.cmd)
    if (actual !== c.expected) {
      failures.push(`[${c.label}]: expected ${c.expected}, got ${actual}`)
    }
  }
  return { passed: BUCKET_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

test('bashActivity.descriptionUsable: language-mismatch fallback cases', () => {
  const { passed, failures } = runDescriptionCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(DESCRIPTION_CASES.length)
})

test('bashActivity.bashFallbackBucket: command-pattern mapping cases', () => {
  const { passed, failures } = runBucketCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(BUCKET_CASES.length)
})

test('bashActivity.rawBashCommand: extracts trimmed command, never throws on bad input', () => {
  expect(rawBashCommand({ command: '  git status  ' })).toBe('git status')
  expect(rawBashCommand({})).toBe('')
  expect(rawBashCommand(null)).toBe('')
  expect(rawBashCommand(undefined)).toBe('')
  expect(rawBashCommand('not-an-object')).toBe('')
})
