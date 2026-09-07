import { describe, it, expect } from 'vitest'
import { VERSION_RE, countTicketStatuses, parseOutcomeBlock, resolveClosedVersionPrdPath, PRD_MASTER_REL } from './historyData'

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

describe('resolveClosedVersionPrdPath (T-546 follow-up regression pin)', () => {
  it('prdt mode always resolves the living PRD.md, never the versions/ snapshot — even for a version that has NO snapshot file (e.g. a v0.5 git tag left after T-546 deleted its duplicate)', () => {
    expect(resolveClosedVersionPrdPath(true, 'v0.5')).toBe(PRD_MASTER_REL)
    expect(resolveClosedVersionPrdPath(true, 'v0.5')).toBe('docs/prd/PRD.md')
  })
  it('prdt mode resolves PRD.md even for a version whose snapshot WOULD exist under legacy — prdt never probes versions/ at all', () => {
    expect(resolveClosedVersionPrdPath(true, 'v0.4')).toBe(PRD_MASTER_REL)
  })
  it('legacy mode keeps resolving the per-version snapshot path, unchanged', () => {
    expect(resolveClosedVersionPrdPath(false, 'v0.4')).toBe('docs/prd/versions/v0.4.md')
  })
  it('legacy mode resolves a versions/ path even when that file is a multi-version record (v0.4.md covering v0.1~v0.4) — the helper only names the path, existence is a separate concern (IPC readFile) the component still handles', () => {
    expect(resolveClosedVersionPrdPath(false, 'v0.1')).toBe('docs/prd/versions/v0.1.md')
  })
})
