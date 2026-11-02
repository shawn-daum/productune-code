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

test('matchSingleLinkTarget resolves bare and prefixed ids in a code span', () => {
  expect(matchSingleLinkTarget('T-1157')).toEqual({ label: 'T-1157', href: 'ptn:ticket/T-1157' })
  expect(matchSingleLinkTarget('T-WK-12')).toEqual({ label: 'T-WK-12', href: 'ptn:ticket/T-WK-12' })
  expect(matchSingleLinkTarget('ST-12')).toBeNull()
  expect(matchSingleLinkTarget('T-12a')).toBeNull()
})
