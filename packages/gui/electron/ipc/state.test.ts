/**
 * prdCandidatePaths (electron twin) — T-306 prdt version-field bridge.
 *
 * The main-process prdReady gate resolves the PRD through this candidate set;
 * before T-306 a prdt po-state (flat `version`, no `current_version`) returned
 * [] → prdReady stuck false → the renderer's #14 PRD auto-nav never fired.
 *
 * Cases prove:
 *   - prdt state (flat `stage` discriminator) → single docs/prd/PRD.md candidate
 *     (prdt has no prd_anchor / per-version snapshots).
 *   - legacy precedence order unchanged: anchor → master PRD.md → versions/<v>.md.
 *   - legacy without current_version still returns [] (fresh project).
 *
 * Case-list + vitest-driver idiom (project.test.ts / costArchive.test.ts).
 */

import path from 'path'
import { prdCandidatePaths } from './state'

interface Case {
  readonly label: string
  readonly state: unknown
  readonly expected: string[]
}

const DIR = '/proj'

export const PRD_CANDIDATE_CASES: readonly Case[] = [
  {
    label: 'prdt state (flat stage+version) → single living PRD.md',
    state: { schema_version: 1, stage: 'build', version: 'v1.1', current_task: null },
    expected: [path.join(DIR, 'docs', 'prd', 'PRD.md')],
  },
  {
    label: 'prdt state at define (no work yet) → still the single PRD.md',
    state: { schema_version: 1, stage: 'define', version: 'v1.0', current_task: null },
    expected: [path.join(DIR, 'docs', 'prd', 'PRD.md')],
  },
  {
    label: 'legacy with anchor → anchor, master, snapshot (order unchanged)',
    state: {
      current_version: 'v0.6',
      versions: [{ id: 'v0.6', prd_anchor: 'docs/prd/custom.md' }],
    },
    expected: [
      path.join(DIR, 'docs/prd/custom.md'),
      path.join(DIR, 'docs', 'prd', 'PRD.md'),
      path.join(DIR, 'docs', 'prd', 'versions', 'v0.6.md'),
    ],
  },
  {
    label: 'legacy without anchor → master, snapshot',
    state: { current_version: 'v0.5', versions: [{ id: 'v0.5' }] },
    expected: [
      path.join(DIR, 'docs', 'prd', 'PRD.md'),
      path.join(DIR, 'docs', 'prd', 'versions', 'v0.5.md'),
    ],
  },
  { label: 'legacy without current_version → [] (fresh project)', state: {}, expected: [] },
  { label: 'null state → []', state: null, expected: [] },
]

export function runPrdCandidateCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of PRD_CANDIDATE_CASES) {
    const actual = prdCandidatePaths(DIR, c.state)
    if (JSON.stringify(actual) !== JSON.stringify(c.expected)) {
      failures.push(`${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(actual)}`)
    }
  }
  return { passed: PRD_CANDIDATE_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('prdCandidatePaths: prdt single-PRD + legacy precedence cases pass', () => {
  const { passed, failures } = runPrdCandidateCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(PRD_CANDIDATE_CASES.length)
})
