/**
 * po-runner rate-limit / session-limit classification — T-352.
 *
 * shawn(dogfood, 2026-07-14 screenshot): a PO turn died on a claude session
 * limit and the GUI showed the generic "claude가 오류로 종료되었습니다 (코드 1) …
 * 버전 확인 필요" instead of a rate-limit state, and the retry button stayed
 * enabled even though retrying before the reset can't work.
 *
 * Root cause (found by inspection, not by guess): claude reports a session/
 * usage-limit hit via a stdout `type:'result', is_error:true` stream-json
 * envelope (result.error is a plain sentence, e.g. "You've hit your session
 * limit · resets 1:10pm (Asia/Seoul)") — NOT via stderr. The T-PATCH-271
 * exit-code classifier (classifyExitError/extractRateLimitReset) already
 * covers "session limit" wording and was already unit-tested, but the
 * `result` handler had its OWN narrower regex
 * (`/rate_limit_error|429|rate.?limit/i`) that doesn't match "session limit" /
 * "usage limit" phrasing at all, so this exact shape fell through to
 * `error-other` → the generic exit-error copy + a later health-smoke run that
 * (mis)reports "incompatible" (the observed "버전 확인 필요"). The fix reuses
 * classifyExitError/extractRateLimitReset in the `result` handler too (see
 * po-runner.ts's `type === 'result'` block), so both sources land on identical
 * classification. This file locks the classification + extraction pieces
 * (the pure, exported halves of that fix) against the real captured shape +
 * near-neighbor variants, INCLUDING a message with no parsable reset time
 * (T-352 acceptance: "messages with no parsable reset time").
 *
 * Mirrors the case-list + vitest driver idiom of po-runner.envgate.test.ts /
 * po-runner.args.test.ts.
 */

import { classifyExitError, extractRateLimitReset, buildResetHint } from './po-runner'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const eq = (got: unknown, want: unknown): { ok: boolean; detail?: string } =>
  JSON.stringify(got) === JSON.stringify(want)
    ? { ok: true }
    : { ok: false, detail: `got=${JSON.stringify(got)} want=${JSON.stringify(want)}` }

// ── classifyExitError ─────────────────────────────────────────────────────────

const CLASSIFY_CASES: readonly Case[] = [
  {
    label: 'real captured session-limit message → usage-limit',
    run: () => eq(
      classifyExitError("You've hit your session limit · resets 1:10pm (Asia/Seoul)"),
      'usage-limit',
    ),
  },
  {
    label: '"usage limit" wording variant → usage-limit',
    run: () => eq(
      classifyExitError('You have reached your usage limit for this session. It resets at 3:45pm (America/New_York).'),
      'usage-limit',
    ),
  },
  {
    label: 'session limit with no reset time at all → still usage-limit',
    run: () => eq(
      classifyExitError("You've hit your session limit for today."),
      'usage-limit',
    ),
  },
  {
    label: '429 / rate-limit wording → rate-limit',
    run: () => eq(
      classifyExitError('API Error: 429 Too Many Requests'),
      'rate-limit',
    ),
  },
  {
    label: 'retry-after header style → rate-limit',
    run: () => eq(
      classifyExitError('429 Too Many Requests\nretry-after: 120'),
      'rate-limit',
    ),
  },
  {
    label: 'ISO resets-at (pre-existing shape) → rate-limit (regression)',
    run: () => eq(
      classifyExitError('rate limited, resets at 2026-07-14T13:10:00Z'),
      'rate-limit',
    ),
  },
  {
    label: 'auth/unauthorized wording → auth',
    run: () => eq(
      classifyExitError('Error: Unauthorized (401). Please run `claude login`.'),
      'auth',
    ),
  },
  {
    label: 'unrelated crash text → null (unclassified, unchanged generic fallback)',
    run: () => eq(
      classifyExitError("TypeError: Cannot read properties of undefined (reading 'foo')"),
      null,
    ),
  },
]

// ── extractRateLimitReset ─────────────────────────────────────────────────────

const EXTRACT_CASES: readonly Case[] = [
  {
    label: 'real captured message → human clock time + tz kept as-is',
    run: () => eq(
      extractRateLimitReset("You've hit your session limit · resets 1:10pm (Asia/Seoul)"),
      { resetAt: '1:10pm (Asia/Seoul)', retryAfterSec: undefined },
    ),
  },
  {
    label: '"resets at <time> (<tz>)" wording variant',
    run: () => eq(
      extractRateLimitReset('You have reached your usage limit. It resets at 3:45pm (America/New_York).'),
      { resetAt: '3:45pm (America/New_York)', retryAfterSec: undefined },
    ),
  },
  {
    label: 'no tz parens, no am/pm — 24h clock still parsed',
    run: () => eq(
      extractRateLimitReset('usage limit reached, resets 23:10'),
      { resetAt: '23:10', retryAfterSec: undefined },
    ),
  },
  {
    label: 'no reset time present at all → resetAt undefined (T-352 acceptance)',
    run: () => eq(
      extractRateLimitReset("You've hit your session limit for today."),
      { resetAt: undefined, retryAfterSec: undefined },
    ),
  },
  {
    label: 'unrelated bare number after "resets" does not false-match (e.g. a count, not a time)',
    run: () => eq(
      extractRateLimitReset('rate limited — resets after 5 requests'),
      { resetAt: undefined, retryAfterSec: undefined },
    ),
  },
  {
    label: 'ISO resets-at (pre-existing shape) still resolves — regression',
    run: () => eq(
      extractRateLimitReset('rate limited, resets at 2026-07-14T13:10:00Z'),
      { resetAt: '2026-07-14T13:10:00Z', retryAfterSec: undefined },
    ),
  },
  {
    label: 'retry-after header takes priority over any resets time',
    run: () => eq(
      extractRateLimitReset('429 Too Many Requests\nretry-after: 120\nresets at 2026-07-14T13:10:00Z'),
      { resetAt: '2026-07-14T13:10:00Z', retryAfterSec: 120 },
    ),
  },
]

// ── buildResetHint ────────────────────────────────────────────────────────────

const RESET_HINT_CASES: readonly Case[] = [
  {
    label: 'retryAfterSec present → minutes phrasing, takes priority over resetAt',
    run: () => eq(
      buildResetHint('1:10pm (Asia/Seoul)', 120),
      '약 2분 후 다시 시도할 수 있습니다.',
    ),
  },
  {
    label: 'resetAt only (human time) → reset phrasing carries the raw text as-is',
    run: () => eq(
      buildResetHint('1:10pm (Asia/Seoul)', undefined),
      '1:10pm (Asia/Seoul)에 한도가 초기화됩니다.',
    ),
  },
  {
    label: 'neither present → empty (generic fallback text takes over downstream)',
    run: () => eq(buildResetHint(undefined, undefined), ''),
  },
]

// ── driver ────────────────────────────────────────────────────────────────────

function runCases(cases: readonly Case[]): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of cases) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: cases.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('T-352: classifyExitError classifies real captured rate/usage-limit shapes', () => {
  const { passed, failures } = runCases(CLASSIFY_CASES)
  if (failures.length > 0) throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  expect(passed).toBe(CLASSIFY_CASES.length)
})

test('T-352: extractRateLimitReset parses reset time incl. human clock shape + no-match case', () => {
  const { passed, failures } = runCases(EXTRACT_CASES)
  if (failures.length > 0) throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  expect(passed).toBe(EXTRACT_CASES.length)
})

test('T-352: buildResetHint formats the actionable ko reset phrase', () => {
  const { passed, failures } = runCases(RESET_HINT_CASES)
  if (failures.length > 0) throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  expect(passed).toBe(RESET_HINT_CASES.length)
})
