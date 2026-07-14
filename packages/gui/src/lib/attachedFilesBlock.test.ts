/**
 * attachedFilesBlock.test.ts (T-350)
 *
 * Pins the render-time parser contract against useComposerAttachments'
 * buildAttachedFilesBlock output shape, plus edge cases (no block, empty body,
 * body text that itself contains dash-prefixed lines — must not be swallowed
 * into the attachment list).
 */

import { test, expect } from 'vitest'
import { parseAttachedFilesBlock } from './attachedFilesBlock'

test('no block → null (message text passes through unaffected)', () => {
  expect(parseAttachedFilesBlock('just a plain message')).toBeNull()
  expect(parseAttachedFilesBlock('')).toBeNull()
})

test('single image attachment + body text', () => {
  const text = '## Attached files\n- #1 -> /tmp/pasted.png\n\nCheck this out'
  expect(parseAttachedFilesBlock(text)).toEqual({
    body: 'Check this out',
    images: [{ seq: 1, path: '/tmp/pasted.png' }],
    files: [],
  })
})

test('single paperclip file attachment + body text', () => {
  const text = '## Attached files\n- /Users/dev/proj/doc.pdf\n\nplease review'
  expect(parseAttachedFilesBlock(text)).toEqual({
    body: 'please review',
    images: [],
    files: ['/Users/dev/proj/doc.pdf'],
  })
})

test('mixed images + files, multiple lines, in original order', () => {
  const text =
    '## Attached files\n' +
    '- #1 -> /tmp/a.png\n' +
    '- #2 -> /tmp/b.png\n' +
    '- /Users/dev/doc.pdf\n' +
    '- /Users/dev/notes.txt\n' +
    '\n' +
    'body here'
  expect(parseAttachedFilesBlock(text)).toEqual({
    body: 'body here',
    images: [
      { seq: 1, path: '/tmp/a.png' },
      { seq: 2, path: '/tmp/b.png' },
    ],
    files: ['/Users/dev/doc.pdf', '/Users/dev/notes.txt'],
  })
})

test('attachments-only message (empty body) — attachment-only send', () => {
  const text = '## Attached files\n- #1 -> /tmp/a.png\n\n'
  expect(parseAttachedFilesBlock(text)).toEqual({
    body: '',
    images: [{ seq: 1, path: '/tmp/a.png' }],
    files: [],
  })
})

test('body containing dash-prefixed lines is NOT swallowed into the attachment list', () => {
  const text =
    '## Attached files\n' +
    '- #1 -> /tmp/a.png\n' +
    '\n' +
    '- reminder: buy milk\n' +
    '- another bullet\n' +
    '\n' +
    'see you'
  expect(parseAttachedFilesBlock(text)).toEqual({
    body: '- reminder: buy milk\n- another bullet\n\nsee you',
    images: [{ seq: 1, path: '/tmp/a.png' }],
    files: [],
  })
})

test('a message that merely starts with a "## Attached files" heading typed by the user, with no valid line list, does not parse as a block', () => {
  const text = '## Attached files\nI wrote this heading myself, not a real block.'
  expect(parseAttachedFilesBlock(text)).toBeNull()
})
