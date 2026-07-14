/**
 * mdUrlTransform.test.ts — T-345 QA FAIL rework
 *
 * QA live-verified defect: MdRenderer passed no `urlTransform` to
 * <ReactMarkdown>, so react-markdown 9.1.0's `defaultUrlTransform`
 * (http/https/mailto/… whitelist) sanitized every app-internal href to "":
 * `ptn:ticket/…`, `ptn:file/…`, `ptn:doctrine/…` — AND bare `file://…` hrefs
 * from verbatim-preserved markdown links. MdLink's `if (href)` guard then
 * silently ignored every click → app-wide dead ptn:/file:// links (https OK).
 *
 * These cases pin the custom transform contract:
 *   - ptn:  → passed through UNCHANGED (routed by routeLink, never navigated)
 *   - file: → passed through UNCHANGED (routed by routeAbsPath / routeLink)
 *   - everything else → delegated to defaultUrlTransform, so the XSS posture
 *     is EXACTLY react-markdown's own (javascript:/data:/vbscript: stay dead —
 *     a blanket allow-all urlTransform would reintroduce javascript: XSS).
 *
 * Framework-free case list + single vitest driver (project idiom).
 */

import { mdUrlTransform } from './mdUrlTransform'

interface Case {
  readonly label: string
  readonly input: string
  readonly expected: string
}

export const CASES: readonly Case[] = [
  // ── app-internal schemes must survive (the QA-reported regression) ─────────
  {
    label: 'ptn:ticket href passes through unchanged',
    input: 'ptn:ticket/T-345',
    expected: 'ptn:ticket/T-345',
  },
  {
    label: 'ptn:file href passes through unchanged',
    input: 'ptn:file/docs/artifacts/foo.html',
    expected: 'ptn:file/docs/artifacts/foo.html',
  },
  {
    label: 'ptn:doctrine href carrying a nested file:// URI passes through unchanged',
    input: 'ptn:doctrine/file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html',
    expected: 'ptn:doctrine/file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html',
  },
  {
    label: 'bare file:// href (verbatim-preserved explicit md link) passes through unchanged',
    input: 'file:///Users/dev/proj/docs/artifacts/a.html',
    expected: 'file:///Users/dev/proj/docs/artifacts/a.html',
  },

  // ── default sanitize posture preserved for everything else ────────────────
  {
    label: 'https URL still passes (delegated to defaultUrlTransform)',
    input: 'https://example.com/path',
    expected: 'https://example.com/path',
  },
  {
    label: 'javascript: XSS vector still sanitized to empty string',
    input: 'javascript:alert(1)',
    expected: '',
  },
  {
    label: 'data: URI still sanitized to empty string',
    input: 'data:text/html,<script>alert(1)</script>',
    expected: '',
  },
  {
    label: 'case-tricked JavaScript: scheme still sanitized (scheme match must be case-insensitive)',
    input: 'JavaScript:alert(1)',
    expected: '',
  },
  {
    label: 'mailto: still passes (defaultUrlTransform whitelist member)',
    input: 'mailto:shawn.kim@axzcorp.com',
    expected: 'mailto:shawn.kim@axzcorp.com',
  },
  {
    label: 'relative path href untouched',
    input: 'docs/design/PRD.md',
    expected: 'docs/design/PRD.md',
  },
  {
    label: 'fragment href untouched',
    input: '#section',
    expected: '#section',
  },
]

export function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    const out = mdUrlTransform(c.input)
    if (out !== c.expected) {
      failures.push(`${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(out)}`)
    }
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('mdUrlTransform: ptn:/file: survive, javascript:/data: stay dead (T-345 QA rework)', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})
