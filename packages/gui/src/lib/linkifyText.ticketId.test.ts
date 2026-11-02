/**
 * linkifyText.ticketId.test.ts — T-1157
 *
 * Bare `T-NNN` and per-product `T-<PREFIX>-<n>` ticket ids link in GUI
 * message text — the same id shapes the terminal MessageDisplay autolink
 * (T-1143, `ID_RE` in packages/core/scripts/hooks/prdt-message-display-autolink.sh)
 * recognizes. Code spans, URLs, file paths and look-alikes stay plain.
 */

import { expect, test } from 'vitest'
import { linkifyText, matchSingleLinkTarget } from './linkifyText'

const link = (id: string) => `[${id}](ptn:ticket/${id})`

test.each([
  ['bare T-NNN', 'T-1157 끝났어요', `${link('T-1157')} 끝났어요`],
  ['per-product prefix', 'see T-WK-12 now', `see ${link('T-WK-12')} now`],
  ['T-PATCH-n', 'T-PATCH-93 done', `${link('T-PATCH-93')} done`],
  ['legacy T-P4-n still links', 'T-P4-114', link('T-P4-114')],
  ['trailing punctuation outside the link', '(T-12), T-13.', `(${link('T-12')}), ${link('T-13')}.`],
  ['Korean particle right after the id', 'T-1157은 닫힘', `${link('T-1157')}은 닫힘`],
])('links %s', (_label, input, expected) => {
  expect(linkifyText(input)).toBe(expected)
})

test.each([
  ['look-alike ST-12', 'ST-12 is not a ticket'],
  ['look-alike T-12a', 'T-12a is not a ticket'],
  ['id inside an inline code span', 'run `T-1157` here'],
  ['id inside a fenced block', '```\nT-1157\n```'],
  ['id as a path segment', 'tracks/T-1157 worktree'],
  ['id followed by -word (slug)', 'T-1157-gui-links'],
  ['lowercase prefix', 'T-wk-12'],
  ['vowel prefix (not a product prefix)', 'T-AB-12'],
  ['seven-plus digits', 'T-1234567'],
])('does not link %s', (_label, input) => {
  expect(linkifyText(input)).toBe(input)
})

test('id inside a URL stays part of the URL link, never a ticket link', () => {
  expect(linkifyText('https://example.com/T-1157 here')).toBe(
    '[example.com](https://example.com/T-1157) here',
  )
})

test('existing markdown link around an id is kept verbatim', () => {
  const input = 'see [T-1157](ptn:ticket/T-1157) now'
  expect(linkifyText(input)).toBe(input)
})

test('ticket file path still links as a file, not a ticket', () => {
  expect(linkifyText('docs/productune/tickets/v1.16/T-1157.md')).toBe(
    '[T-1157.md](ptn:file/docs/productune/tickets/v1.16/T-1157.md)',
  )
})

test('matchSingleLinkTarget never makes a ticket-id-only code span a link', () => {
  for (const id of ['T-1157', 'T-WK-12', 'T-PATCH-93', 'T-P4-114', ' T-1157 ']) {
    expect(matchSingleLinkTarget(id)).toBeNull()
  }
  expect(matchSingleLinkTarget('ST-12')).toBeNull()
  expect(matchSingleLinkTarget('T-12a')).toBeNull()
})

test('matchSingleLinkTarget still resolves the other whole-span targets (T-346)', () => {
  expect(matchSingleLinkTarget('docs/artifacts/foo.html')).toEqual({
    label: 'foo.html',
    href: 'ptn:file/docs/artifacts/foo.html',
  })
  expect(matchSingleLinkTarget('https://example.com/x')).toEqual({
    label: 'example.com',
    href: 'https://example.com/x',
  })
})

// ── QA d-v116-t1157-qa1 fail rows: every code form keeps ids plain ───────────

test.each([
  ['tilde fence', '~~~\nT-1157\n~~~'],
  ['tilde fence with info string', '~~~text\nsee T-1157 now\n~~~'],
  ['four-tilde fence holding a ~~~ line', '~~~~\nT-1\n~~~\nT-2\n~~~~'],
  ['unclosed fence runs to the end', '```\nT-1157\nT-12'],
  ['multi-line inline code span', 'run `T-1157\nT-12` here'],
  ['double-backtick span holding a backtick', 'run ``a ` T-1157`` here'],
  ['four-space indented code block', 'intro\n\n    T-1157 in code\n'],
  ['tab indented code block', 'intro\n\n\tT-1157 in code\n'],
])('does not link an id inside a %s', (_label, input) => {
  expect(linkifyText(input)).toBe(input)
})

test('prose around a code form still links', () => {
  expect(linkifyText('T-1 ~~~ no fence\n\n~~~\nT-2\n~~~\n\nT-3 `T-4\nT-5` T-6')).toBe(
    `${link('T-1')} ~~~ no fence\n\n~~~\nT-2\n~~~\n\n${link('T-3')} \`T-4\nT-5\` ${link('T-6')}`,
  )
})

test('an indented list continuation is prose, not code — its id still links', () => {
  expect(linkifyText('- item\n\n    T-12 continues the item')).toBe(
    `- item\n\n    ${link('T-12')} continues the item`,
  )
})

test('a lone backtick is not a code span — ids after it still link', () => {
  expect(linkifyText('a ` tick then T-12')).toBe(`a \` tick then ${link('T-12')}`)
})

test.each(['json', 'ts', 'yaml', 'txt', 'sh', 'tsx', 'log'])(
  'T-1157.%s (filename-like) stays plain',
  (ext) => {
    const input = `open T-1157.${ext} now`
    expect(linkifyText(input)).toBe(input)
  },
)
