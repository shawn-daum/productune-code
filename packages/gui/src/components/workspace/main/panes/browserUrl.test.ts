/**
 * browserUrl.test.ts — T-328
 *
 * Covers the acceptance bullet: an input that already carries ANY
 * `scheme://` prefix (file://, http://, https://, or another scheme) loads
 * unmodified; a bare scheme-less input still gets `https://` prepended.
 * Follows the framework-free case list + single vitest driver precedent
 * (src/lib/phase-mapping.test.ts).
 */

import { normalizeBrowserUrl } from './browserUrl'

interface Case {
  readonly label: string
  readonly input: string
  readonly expected: string
}

export const CASES: readonly Case[] = [
  {
    label: 'file:// triple-slash path passes through unmodified (T-328 bug #1)',
    input: 'file:///Users/x/docs/artifacts/enneagram-mentor-ds.html',
    expected: 'file:///Users/x/docs/artifacts/enneagram-mentor-ds.html',
  },
  {
    label: 'http:// passes through unmodified',
    input: 'http://example.com',
    expected: 'http://example.com',
  },
  {
    label: 'https:// passes through unmodified',
    input: 'https://example.com',
    expected: 'https://example.com',
  },
  {
    label: 'an arbitrary other scheme (e.g. devtools://) passes through unmodified',
    input: 'devtools://devtools/bundled/inspector.html',
    expected: 'devtools://devtools/bundled/inspector.html',
  },
  {
    label: 'bare domain (no scheme) gets https:// prepended',
    input: 'example.com',
    expected: 'https://example.com',
  },
  {
    label: 'bare localhost:port (no scheme) gets https:// prepended',
    input: 'localhost:5173',
    // NOTE: "localhost:5173" itself matches no `://` scheme (the colon has no
    // slashes after it), so it is treated as scheme-less — unchanged from
    // pre-T-328 behavior for this input shape.
    expected: 'https://localhost:5173',
  },
]

function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    const actual = normalizeBrowserUrl(c.input)
    if (actual !== c.expected) {
      failures.push(`[${c.label}]: expected ${c.expected}, got ${actual}`)
    }
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('browserUrl.normalizeBrowserUrl: scheme-aware normalization cases', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})
