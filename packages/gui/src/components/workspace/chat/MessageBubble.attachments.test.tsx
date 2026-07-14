/**
 * MessageBubble.attachments.test.tsx (T-350)
 *
 * Renders the REAL UserBubble (via MessageBubble's `kind: 'user'` dispatch)
 * through react-dom/server, same idiom as MdRenderer.href.test.tsx — proves the
 * actual DOM output, not just the parser unit (attachedFilesBlock.test.ts).
 *
 * Pins:
 *   - the raw "## Attached files" heading/bullet markdown is NOT in the
 *     rendered HTML (the reported defect)
 *   - body text renders before the attachment chips (bottom placement)
 *   - both image and paperclip-file attachments render as chips (filename
 *     visible, full path only in the title tooltip)
 *   - a message with no attachments is rendered unaffected (plain passthrough)
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { test, expect } from 'vitest'
import MessageBubble from './MessageBubble'
import type { Message } from '../../../lib/types'

function render(text: string): string {
  const message: Message = {
    id: 'm1',
    role: 'user',
    kind: 'user',
    text,
    status: 'done',
    created_at: new Date().toISOString(),
  }
  return renderToStaticMarkup(createElement(MessageBubble, { message }))
}

test('sent message with an image + file attachment: no raw "Attached files" markdown, body before chips', () => {
  const text =
    '## Attached files\n' +
    '- #1 -> /tmp/pasted.png\n' +
    '- /Users/dev/proj/report.pdf\n' +
    '\n' +
    'please review this'

  const html = render(text)

  // The reported defect: raw heading/bullet markdown must not appear.
  expect(html).not.toContain('Attached files')
  expect(html).not.toContain('- #1 -&gt;')          // raw bullet line, escaped arrow
  // The path IS present, but only inside the chip's title tooltip attribute —
  // never as bare visible bullet text (which is what "raw markdown" would look like).
  expect(html).toContain('title="/tmp/pasted.png"')

  // Body text present.
  expect(html).toContain('please review this')

  // File chip shows the basename as visible label; full path in the title tooltip.
  expect(html).toContain('report.pdf')
  expect(html).toContain('title="/Users/dev/proj/report.pdf"')

  // Body-before-chips: body text index precedes the file chip's index.
  const bodyIdx = html.indexOf('please review this')
  const chipIdx = html.indexOf('report.pdf')
  expect(bodyIdx).toBeGreaterThan(-1)
  expect(chipIdx).toBeGreaterThan(bodyIdx)
})

test('attachments-only message (no body text) still renders chips, no crash', () => {
  const text = '## Attached files\n- /Users/dev/proj/notes.txt\n\n'
  const html = render(text)
  expect(html).not.toContain('Attached files')
  expect(html).toContain('notes.txt')
})

test('message without attachments renders unaffected (plain passthrough)', () => {
  const html = render('just a normal message, no attachments here')
  expect(html).toContain('just a normal message, no attachments here')
})
