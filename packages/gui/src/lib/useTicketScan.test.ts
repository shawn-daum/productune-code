/**
 * useTicketScan.normalizeStatus — unit cases for the read-time legacy→canonical
 * status synonym map (T-PATCH-137).
 *
 * NOTE: the GUI package has no configured unit-test framework (only the
 * Playwright `smoke` spec, and no `test` script). Rather than wire a new runner
 * (out of this ticket's single-file scope), these cases are expressed as a
 * self-contained, framework-free assertion list that `tsc --noEmit` type-checks
 * as part of the build (AC-5) and that any future runner / `tsx` invocation can
 * execute directly. The live gate for this ticket is `tsc --noEmit` + `vite
 * build`.
 */

import { normalizeStatus } from './useTicketScan'
import type { Status } from './types'

interface Case {
  readonly label: string
  readonly input: Status | string | undefined
  readonly expected: Status | undefined
}

export const NORMALIZE_STATUS_CASES: readonly Case[] = [
  // AC-2 — the two T-PATCH-137 synonyms.
  { label: 'in_progress → in-progress', input: 'in_progress', expected: 'in-progress' },
  { label: 'qa → review', input: 'qa', expected: 'review' },
  // AC-3 — pre-existing synonyms unchanged.
  { label: 'planned → todo', input: 'planned', expected: 'todo' },
  { label: 'qa-pending → review', input: 'qa-pending', expected: 'review' },
  { label: 'user-pending → user-verify', input: 'user-pending', expected: 'user-verify' },
  { label: 'cancelled → abandoned', input: 'cancelled', expected: 'abandoned' },
  { label: 'design-proposal → in-progress', input: 'design-proposal', expected: 'in-progress' },
  { label: 'superseded → abandoned', input: 'superseded', expected: 'abandoned' },
  // AC-3 — canonical values pass through; nullish stays undefined.
  { label: 'in-progress pass-through', input: 'in-progress', expected: 'in-progress' },
  { label: 'review pass-through', input: 'review', expected: 'review' },
  { label: 'done pass-through', input: 'done', expected: 'done' },
  { label: 'undefined → undefined', input: undefined, expected: undefined },
]

export function runNormalizeStatusCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of NORMALIZE_STATUS_CASES) {
    const actual = normalizeStatus(c.input)
    if (actual !== c.expected) {
      failures.push(`${c.label}: expected ${String(c.expected)}, got ${String(actual)}`)
    }
  }
  return { passed: NORMALIZE_STATUS_CASES.length - failures.length, failures }
}
