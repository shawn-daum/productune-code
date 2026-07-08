/**
 * helpers.artifactOpenType.test.ts — T-328
 *
 * Covers the acceptance bullet: `.html` design artifacts under docs/artifacts/
 * now resolve to 'html' (new) so po:artifact-open auto-opens them, WITHOUT
 * regressing the existing 'markdown' (docs/design|tickets|qa/*.md) and
 * 'qa-result' (*.spec.ts|*.test.ts) recognition, and WITHOUT widening the
 * null (skip) fallback for unrelated files (src/**, scripts/**, lock files).
 *
 * Follows the framework-free case list + single vitest driver precedent
 * (src/lib/phase-mapping.test.ts). helpers.ts itself imports zustand/i18n
 * transitively via `../../../store/workspace` — vitest.setup.ts already stubs
 * those for the src/** test glob, so importing artifactOpenType directly is safe.
 */

import { artifactOpenType } from './helpers'

interface Case {
  readonly label: string
  readonly filePath: string
  readonly expected: 'markdown' | 'qa-result' | 'html' | null
}

export const CASES: readonly Case[] = [
  {
    label: 'docs/artifacts/*.html design artifact → html (T-328)',
    filePath: 'docs/artifacts/enneagram-mentor-ds.html',
    expected: 'html',
  },
  {
    label: 'nested docs/artifacts/ html still matches (path segment, not basename, anchored)',
    filePath: 'docs/artifacts/v1/enneagram-mentor-ds.html',
    expected: 'html',
  },
  {
    label: 'docs/design/*.md → markdown (pre-existing, no regression)',
    filePath: 'docs/design/PRD.md',
    expected: 'markdown',
  },
  {
    label: 'docs/tickets/*.md → markdown (pre-existing, no regression)',
    filePath: 'docs/tickets/v1.1/T-328.md',
    expected: 'markdown',
  },
  {
    label: 'docs/qa/*.md → markdown (pre-existing, no regression)',
    filePath: 'docs/qa/T-328-report.md',
    expected: 'markdown',
  },
  {
    label: '*.spec.ts → qa-result (pre-existing, no regression)',
    filePath: 'src/foo.spec.ts',
    expected: 'qa-result',
  },
  {
    label: '*.test.ts → qa-result (pre-existing, no regression)',
    filePath: 'electron/po-runner.test.ts',
    expected: 'qa-result',
  },
  {
    label: 'html OUTSIDE docs/artifacts/ still skipped (null) — scope stays narrow',
    filePath: 'docs/design/notes.html',
    expected: null,
  },
  {
    label: 'unrelated src/** file → null (skip, pre-existing, no regression)',
    filePath: 'src/foo.ts',
    expected: null,
  },
  {
    label: 'lock file → null (skip, pre-existing, no regression)',
    filePath: 'pnpm-lock.yaml',
    expected: null,
  },
]

function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    const actual = artifactOpenType(c.filePath)
    if (actual !== c.expected) {
      failures.push(`[${c.label}]: expected ${String(c.expected)}, got ${String(actual)}`)
    }
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('helpers.artifactOpenType: markdown/qa-result/html routing cases', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})
