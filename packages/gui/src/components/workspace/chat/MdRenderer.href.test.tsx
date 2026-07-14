/**
 * MdRenderer.href.test.tsx — T-345 QA FAIL rework (wiring regression pin)
 *
 * The QA-verified defect was in the WIRING, not the transform logic: MdRenderer
 * simply didn't pass `urlTransform` to <ReactMarkdown>, so react-markdown's
 * defaultUrlTransform rewrote every ptn:/file: href to "" in the actual
 * rendered DOM — a pure unit test on mdUrlTransform alone would never have
 * caught it (and didn't exist to). This test renders the REAL MdRenderer
 * through react-dom/server and asserts the href attribute survives end-to-end
 * (linkifyText → ReactMarkdown → urlTransform → MdLink <a href>).
 *
 * renderToStaticMarkup runs fine in the node test environment: MdRenderer only
 * reads the (vitest.setup-mocked) zustand store inside click handlers, never
 * during render. No jsdom / @testing-library needed.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import MdRenderer from './MdRenderer'
import { linkifyText } from '../../../lib/linkifyText'

interface Case {
  readonly label: string
  readonly text: string
  readonly expectedHref: string
}

export const CASES: readonly Case[] = [
  {
    label: 'chat prose file:// artifact link survives to rendered DOM href (the QA-reported kill)',
    text: '디자인 시안: file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html 확인해주세요',
    expectedHref:
      'href="ptn:doctrine/file:///Users/dev/proj/docs/artifacts/enneagram-mentor-ds-a.html"',
  },
  {
    label: 'ticket link href survives to rendered DOM',
    text: '관련 티켓: T-P4-114 참고',
    expectedHref: 'href="ptn:ticket/T-P4-114"',
  },
  {
    label: 'relative file link href survives to rendered DOM',
    text: '문서: docs/design/PRD.md 확인',
    expectedHref: 'href="ptn:file/docs/design/PRD.md"',
  },
  {
    label: 'doctrine ~/.productune link href survives to rendered DOM',
    text: '참고: ~/.productune/po/habit.md',
    expectedHref: 'href="ptn:doctrine/~/.productune/po/habit.md"',
  },
  {
    label: 'explicit [text](file://…) markdown link href survives to rendered DOM',
    text: '[design a](file:///Users/dev/proj/docs/artifacts/a.html)',
    expectedHref: 'href="file:///Users/dev/proj/docs/artifacts/a.html"',
  },
  {
    label: 'https link still renders with its href (default transform path unregressed)',
    text: 'https://example.com/path',
    expectedHref: 'href="https://example.com/path"',
  },
]

export function runCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of CASES) {
    const html = renderToStaticMarkup(
      createElement(MdRenderer, { text: linkifyText(c.text) }),
    )
    if (!html.includes(c.expectedHref)) {
      failures.push(`${c.label}: ${c.expectedHref} not in ${JSON.stringify(html)}`)
    }
  }
  return { passed: CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('MdRenderer rendered DOM: ptn:/file: hrefs survive urlTransform wiring (T-345 QA rework)', () => {
  const { passed, failures } = runCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(CASES.length)
})

test('MdRenderer rendered DOM: javascript: href does NOT survive (XSS posture pinned)', () => {
  const html = renderToStaticMarkup(
    createElement(MdRenderer, { text: '[click](javascript:alert(1))' }),
  )
  expect(html).not.toContain('href="javascript:')
})
