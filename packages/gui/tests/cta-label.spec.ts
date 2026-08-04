/**
 * cta-label.spec.ts — T-442 F-B, closed. Pure unit assertions, no app, no window.
 *
 * The Korean CTA fix was measured to work but nothing held it in place. These
 * assertions fail if the regex regresses, and they run on the host because they
 * need neither the app nor a Korean locale — which was the whole reason the
 * original defect went unnoticed for as long as it did.
 */

import { test, expect } from '@playwright/test'
import { CTA_LABEL_RE, RESET_LABEL_RE } from './cta-label'

test('T-442 F-B: the CTA matcher matches the Korean label', () => {
  // THE REGRESSION. Each of these was measured false under the old
  // `/^(Next|다음)\b/` and is the assertion that fails if `\b` comes back after
  // the Hangul alternative.
  expect(CTA_LABEL_RE.test('다음'), "'다음' must match — this is the F-B bug").toBe(true)
  expect(CTA_LABEL_RE.test('다음 단계'), "'다음 단계' must match").toBe(true)
  expect(CTA_LABEL_RE.test('다음으로'), "'다음으로' must match").toBe(true)
})

test('T-442 F-B: the English branch still rejects a longer word', () => {
  expect(CTA_LABEL_RE.test('Next')).toBe(true)
  expect(CTA_LABEL_RE.test('Next step')).toBe(true)
  // The `\b` on the ASCII side is load-bearing: this is what it is FOR.
  expect(CTA_LABEL_RE.test('Nextcloud'), "'Nextcloud' must not match the CTA").toBe(false)
})

test('T-442 F-B: the matcher is anchored and rejects unrelated labels', () => {
  for (const label of ['Back', '이전', 'Reset', '초기화', 'Skip Next', '']) {
    expect(CTA_LABEL_RE.test(label), `${label || '<empty>'} must not match`).toBe(false)
  }
})

test('T-442 F-B: `\\b` after Hangul is the trap, demonstrated not asserted', () => {
  // Why the fix is what it is: `\b` needs a `[A-Za-z0-9_]` on one side. After a
  // Hangul syllable there is none, so the boundary can never be found. Pinning
  // the mechanism means the next author cannot "tidy" the regex back.
  const broken = /^(Next|다음)\b/
  expect(broken.test('다음'), 'the old regex is the control — it must still fail').toBe(false)
  expect(broken.test('Next'), 'the old regex worked for ASCII, which is why it looked fine').toBe(true)
  // And `u` alone does not rescue it — the flag is not the fix.
  expect(/^(Next|다음)\b/u.test('다음')).toBe(false)
})

test('T-442 F-B: the CTA matcher survives the round-trip theme.spec.ts does', () => {
  // theme.spec.ts cannot pass a RegExp through `page.evaluate` — it travels as
  // `.source` and is rebuilt in the page context. If the pattern ever needs a
  // flag to be correct, that flag would be silently dropped there. Pin the
  // round-trip, not just the literal.
  const rebuilt = new RegExp(CTA_LABEL_RE.source, 'u')
  expect(rebuilt.test('다음')).toBe(true)
  expect(rebuilt.test('Nextcloud')).toBe(false)
  expect(rebuilt.source).toBe(CTA_LABEL_RE.source)
})

test('T-442 F-B: the reset matcher covers both locales too', () => {
  for (const label of ['Reset', '초기화', 'Reset all']) expect(RESET_LABEL_RE.test(label)).toBe(true)
  expect(RESET_LABEL_RE.test('다음')).toBe(false)
})
