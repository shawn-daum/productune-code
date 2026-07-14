/**
 * linkifyText.test.ts — T-345
 *
 * Covers the acceptance bullet: `file://` links to project artifacts rendered
 * in chat are clickable (previously dead text — the LINK_RE had no branch for
 * a generic `file://` URI, only the narrow `.productune/<persona>/*.md`
 * doctrine-tier form introduced by T-PATCH-106). Also covers the companion
 * relative-path gap: a bare `docs/artifacts/*.html` mention (no `file://`
 * prefix) wasn't linkified either, since alt-4's extension whitelist excluded
 * `.html`.
 *
 * Framework-free case list + single vitest driver, mirroring
 * helpers.artifactOpenType.test.ts / browserUrl.test.ts (T-328).
 */

import { linkifyText, matchSingleLinkTarget } from './linkifyText'

interface Case {
  readonly label: string
  readonly input: string
  readonly expectedContains: string
}

export const CASES: readonly Case[] = [
  {
    label: 'bare file:// URI to a docs/artifacts/*.html mockup becomes a ptn:doctrine link (T-345)',
    input: '디자인 시안: file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html 확인해주세요',
    expectedContains:
      '[enneagram-mentor-ds-a.html](ptn:doctrine/file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html)',
  },
  {
    label: 'trailing sentence punctuation is not absorbed into the href (T-345)',
    input: '확인: file:///Users/dev/proj/docs/artifacts/foo.html.',
    expectedContains: '(ptn:doctrine/file:///Users/dev/proj/docs/artifacts/foo.html)',
  },
  {
    label: 'comma-separated list of file:// paths each resolve to their own link, no bleed (T-345)',
    input:
      'A: file:///p/docs/artifacts/a.html, B: file:///p/docs/artifacts/b.html, C: file:///p/docs/artifacts/c.html',
    expectedContains: '[a.html](ptn:doctrine/file:///p/docs/artifacts/a.html)',
  },
  {
    label: 'bare relative docs/artifacts/*.html mention (no file:// scheme) also linkifies (T-345)',
    input: '산출물: docs/artifacts/foo.html 확인해주세요.',
    expectedContains: '[foo.html](ptn:file/docs/artifacts/foo.html)',
  },
  {
    label: 'existing doctrine .productune/*.md absolute path still linkifies unchanged (no regression, T-PATCH-106)',
    input: '참고: ~/.productune/po/habit.md',
    expectedContains: '[habit.md](ptn:doctrine/~/.productune/po/habit.md)',
  },
  {
    label: 'existing explicit markdown link is preserved verbatim, not double-processed (no regression)',
    input: '[design a](file:///Users/dev/proj/docs/artifacts/a.html)',
    expectedContains: '[design a](file:///Users/dev/proj/docs/artifacts/a.html)',
  },
  {
    label: 'bare https:// URL still linkifies as before (no regression)',
    input: 'https://example.com/path',
    expectedContains: '[example.com](https://example.com/path)',
  },
]

export function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    const out = linkifyText(c.input)
    if (!out.includes(c.expectedContains)) {
      failures.push(`${c.label}: got ${JSON.stringify(out)}`)
    }
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('linkifyText: file:// + docs/artifacts/*.html clickability (T-345), no regression', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})

// ── matchSingleLinkTarget (T-346) ──────────────────────────────────────────────
// Powers MdRenderer's inline `code` component: a backtick-wrapped span whose
// ENTIRE trimmed content is one linkify-eligible token renders clickable.
// linkifyText itself still skips code spans (correct prose semantics) — this
// is the separate render-time path the bug report needed.

test('matchSingleLinkTarget: bare file:// URI in a code span resolves to the doctrine route (T-346)', () => {
  const target = matchSingleLinkTarget(
    'file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html',
  )
  expect(target).toEqual({
    label: 'enneagram-mentor-ds-a.html',
    href: 'ptn:doctrine/file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html',
  })
})

test('matchSingleLinkTarget: bare relative docs/artifacts/*.html in a code span resolves (T-346)', () => {
  const target = matchSingleLinkTarget('docs/artifacts/foo.html')
  expect(target).toEqual({ label: 'foo.html', href: 'ptn:file/docs/artifacts/foo.html' })
})

test('matchSingleLinkTarget: ticket ID in a code span resolves (T-346, same scope as prose linkify)', () => {
  expect(matchSingleLinkTarget('T-P4-114')).toEqual({
    label: 'T-P4-114',
    href: 'ptn:ticket/T-P4-114',
  })
})

test('matchSingleLinkTarget: surrounding whitespace is trimmed before matching (T-346)', () => {
  const target = matchSingleLinkTarget('  docs/artifacts/foo.html  ')
  expect(target).toEqual({ label: 'foo.html', href: 'ptn:file/docs/artifacts/foo.html' })
})

test('matchSingleLinkTarget: ordinary code snippet is NOT linkified — no false positive (T-346)', () => {
  expect(matchSingleLinkTarget('const url = "https://x"')).toBeNull()
  expect(matchSingleLinkTarget('npm install')).toBeNull()
  expect(matchSingleLinkTarget('foo.bar()')).toBeNull()
})

test('matchSingleLinkTarget: a path that is only PART of the span is NOT linkified (whole-span only, T-346)', () => {
  // Guards the "no false positive" acceptance bullet the other direction:
  // trailing prose glued into the same code span must not smuggle a link in.
  expect(matchSingleLinkTarget('see docs/artifacts/foo.html for details')).toBeNull()
})
