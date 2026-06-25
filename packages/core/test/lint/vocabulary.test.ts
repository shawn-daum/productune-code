/**
 * vocabulary.test.ts — Unit tests for lintVocabulary (T-P4-023 sub-d).
 *
 * Run: node --loader ts-node/esm test/lint/vocabulary.test.ts
 * (or via vitest when configured)
 *
 * Validates:
 *  - lintVocabulary flags external tokens with correct suggestion
 *  - longer pattern ("pull request") takes priority over sub-token ("PR")
 *  - clean strings return empty array
 */

import { test, expect } from 'vitest'
import { lintVocabulary, type VocabIssue } from '../../src/lint/vocabulary'

// ── Tests ─────────────────────────────────────────────────────────────────────

test('clean string returns empty array', () => {
  const issues = lintVocabulary('작업을 완료했습니다.')
  expect(issues).toHaveLength(0)
})

test('"this branch is merged" → 2 issues (branch, merge)', () => {
  const issues = lintVocabulary('this branch is merged')
  expect(issues).toHaveLength(2)
  const tokens = issues.map((i: VocabIssue) => i.token)
  if (!tokens.includes('branch')) throw new Error('Expected branch token')
  if (!tokens.includes('merge')) throw new Error('Expected merge token')
})

test('"pull request" flagged as one issue (not two)', () => {
  const issues = lintVocabulary('Please open a pull request when done.')
  // "pull request" should be ONE issue (not double-flagged as PR too)
  const prIssues = issues.filter((i: VocabIssue) => i.token === 'PR')
  const pullRequestIssues = issues.filter((i: VocabIssue) => i.token === 'pull request')
  expect(pullRequestIssues).toHaveLength(1)
  expect(prIssues).toHaveLength(0)
})

test('"commit your changes" → commit flagged', () => {
  const issues = lintVocabulary('Please commit your changes.')
  const tokens = issues.map((i: VocabIssue) => i.token)
  if (!tokens.includes('commit')) throw new Error('Expected commit token')
})

test('"sha" flagged with suggestion', () => {
  const issues = lintVocabulary('The sha is abc123')
  const sha = issues.find((i: VocabIssue) => i.token === 'sha')
  if (!sha) throw new Error('Expected sha issue')
  if (!sha.suggestion) throw new Error('Expected suggestion for sha')
})

test('suggestion text is populated for each issue', () => {
  const issues = lintVocabulary('this branch was squashed and merged via git worktree')
  for (const issue of issues) {
    if (!issue.suggestion) {
      throw new Error(`Missing suggestion for token: ${issue.token}`)
    }
  }
  expect(issues.length).toBeGreaterThan(0)
})

test('issues are sorted by index ascending', () => {
  const issues = lintVocabulary('branch merge commit')
  for (let i = 1; i < issues.length; i++) {
    if (issues[i].index < issues[i - 1].index) {
      throw new Error(`Issues not sorted at index ${i}: ${issues[i - 1].index} > ${issues[i].index}`)
    }
  }
})

test('case-insensitive matching', () => {
  const issues1 = lintVocabulary('BRANCH MERGE')
  const issues2 = lintVocabulary('Branch Merge')
  expect(issues1.length).toBe(issues2.length)
  expect(issues1.length).toBeGreaterThan(0)
})

