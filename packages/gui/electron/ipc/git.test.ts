import { describe, it, expect } from 'vitest'
import { parseTagLines } from './git'

describe('parseTagLines (git:listTags)', () => {
  it('returns [] for empty stdout (tag-less repo)', () => {
    expect(parseTagLines('')).toEqual([])
    expect(parseTagLines('\n')).toEqual([])
    expect(parseTagLines('   \n  \n')).toEqual([])
  })

  it('parses name|date lines', () => {
    const out = parseTagLines('v1.0|2026-07-03\nv0.5|2026-06-25\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'v0.5', date: '2026-06-25' },
    ])
  })

  it('sorts by date descending regardless of input order', () => {
    const out = parseTagLines('v0.5|2026-06-25\nv1.0|2026-07-03\nv0.4|2026-06-01\n')
    expect(out.map((t) => t.name)).toEqual(['v1.0', 'v0.5', 'v0.4'])
  })

  it('tolerates trailing CR (\\r\\n) and blank lines', () => {
    const out = parseTagLines('v1.0|2026-07-03\r\n\r\nv0.5|2026-06-25\r\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'v0.5', date: '2026-06-25' },
    ])
  })

  it('keeps a tag with a missing date (no separator) and sorts it last', () => {
    const out = parseTagLines('weird-tag\nv1.0|2026-07-03\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'weird-tag', date: '' },
    ])
  })

  it('does not filter non-version tag names (caller decides the pattern)', () => {
    const out = parseTagLines('release-candidate|2026-07-01\nv1.0|2026-07-03\n')
    expect(out.map((t) => t.name)).toEqual(['v1.0', 'release-candidate'])
  })
})
