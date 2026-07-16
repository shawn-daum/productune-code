/**
 * helpers.meta.test.ts — meta track grouping (T-367).
 *
 * groupCommitsByTicket must mirror @productune/core groupByTicket: ticket-id
 * subject prefix keys the group; non-prefixed subjects (fallback beat commits)
 * land under ''. Order within a group preserves input order (newest-first).
 */

import { describe, it, expect } from 'vitest'
import { groupCommitsByTicket } from './helpers'
import type { CommitLine } from './types'

const c = (sha: string, subject: string): CommitLine => ({ sha, subject, authorDate: '2026-07-16 12:00:00 +0900' })

describe('groupCommitsByTicket', () => {
  it('groups by ticket-id prefix and preserves order', () => {
    const map = groupCommitsByTicket([
      c('a', 'T-903 [status-change: open→done] 마무리'),
      c('b', 'T-903 [qa-status-change: →pass] QA'),
      c('d', 'T-P4-023 [manual: →] legacy id format'),
    ])
    expect(map.get('T-903')?.map((x) => x.sha)).toEqual(['a', 'b'])
    expect(map.get('T-P4-023')).toHaveLength(1)
  })

  it("fallback beat commits (no ticket prefix) group under ''", () => {
    const map = groupCommitsByTicket([c('a', '메타 자동 저장'), c('b', 'initial meta snapshot (prdt init)')])
    expect(map.get('')?.map((x) => x.sha)).toEqual(['a', 'b'])
    expect(map.size).toBe(1)
  })

  it('empty input → empty map', () => {
    expect(groupCommitsByTicket([]).size).toBe(0)
  })
})
