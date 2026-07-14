import { describe, it, expect } from 'vitest'
import { VERSION_RE, countTicketStatuses, parseOutcomeBlock } from './historyData'

describe('VERSION_RE', () => {
  it('matches version-shaped ids', () => {
    for (const v of ['v1', 'v1.0', 'v1.1', 'v0.5', 'v1.2.3']) {
      expect(VERSION_RE.test(v)).toBe(true)
    }
  })
  it('rejects non-version dir names', () => {
    for (const v of ['backlog', 'v', 'version1', '1.0', 'v1.0-rc', 'vNext']) {
      expect(VERSION_RE.test(v)).toBe(false)
    }
  })
})

describe('countTicketStatuses', () => {
  it('counts the prdt 3-value enum', () => {
    expect(countTicketStatuses(['done', 'done', 'dropped', 'open'])).toEqual({
      done: 2, dropped: 1, open: 1, total: 4,
    })
  })
  it('folds legacy statuses (abandoned→dropped, non-terminal→open)', () => {
    expect(countTicketStatuses(['done', 'abandoned', 'in-progress', 'review', 'blocked', 'todo'])).toEqual({
      done: 1, dropped: 1, open: 4, total: 6,
    })
  })
  it('treats missing/unknown status as open, not dropped', () => {
    expect(countTicketStatuses([null, undefined, 'weird'])).toEqual({
      done: 0, dropped: 0, open: 3, total: 3,
    })
  })
  it('returns zeros for an empty version (v1.0 commit-only case)', () => {
    expect(countTicketStatuses([])).toEqual({ done: 0, dropped: 0, open: 0, total: 0 })
  })
})

describe('parseOutcomeBlock', () => {
  it('extracts the Outcome block up to the next heading', () => {
    const md = [
      '## What shipped', '- a', '', '## Outcome',
      '- **North star: X**', '- Observed: yes', '', '## Next', '- b',
    ].join('\n')
    expect(parseOutcomeBlock(md)).toBe('- **North star: X**\n- Observed: yes')
  })
  it('extracts to EOF when Outcome is the last section', () => {
    const md = '## What shipped\n- a\n\n## Outcome\n- done\n'
    expect(parseOutcomeBlock(md)).toBe('- done')
  })
  it('returns null when there is no Outcome heading', () => {
    expect(parseOutcomeBlock('## What shipped\n- a\n')).toBeNull()
  })
  it('returns null for an empty Outcome block', () => {
    expect(parseOutcomeBlock('## Outcome\n\n## Next\n- b')).toBeNull()
  })
})
