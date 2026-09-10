import { describe, it, expect } from 'vitest'
import { VERSION_RE, countTicketStatuses, parseOutcomeBlock, resolveClosedVersionPrdPath, PRD_MASTER_REL, PRD_HISTORY_REL } from './historyData'

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

describe('resolveClosedVersionPrdPath (T-546 follow-up regression pin, re-pinned by T-602)', () => {
  // T-602 moved every closed section out of PRD.md into history.md. Before the
  // split this helper returned PRD.md for prdt; after it, PRD.md holds only the
  // head + the OPEN section, so that answer would open a file that does not
  // contain the version — the "renders empty" defect class this ticket names.
  it('prdt mode resolves the history lump for a closed version, never PRD.md and never the versions/ snapshot', () => {
    expect(resolveClosedVersionPrdPath(true, 'v0.5')).toBe(PRD_HISTORY_REL)
    expect(resolveClosedVersionPrdPath(true, 'v0.5')).toBe('docs/prd/history.md')
    expect(resolveClosedVersionPrdPath(true, 'v1.8')).not.toBe(PRD_MASTER_REL)
  })
  it('prdt mode resolves history.md even for a version whose snapshot WOULD exist under legacy — prdt never probes versions/ at all', () => {
    expect(resolveClosedVersionPrdPath(true, 'v0.4')).toBe(PRD_HISTORY_REL)
  })
  // ntf-pm's portfolio pipe picks the current PRD by FIRST MATCH over
  // docs/prd/PRD.md · docs/PRD.md · PRD.md. A history file with basename PRD.md
  // on any of those would be served as the current PRD, silently.
  it('the history path never collides with a PRD.md candidate path', () => {
    expect(PRD_HISTORY_REL.split('/').pop()).not.toBe('PRD.md')
    expect(['docs/prd/PRD.md', 'docs/PRD.md', 'PRD.md']).not.toContain(PRD_HISTORY_REL)
    expect(PRD_MASTER_REL).toBe('docs/prd/PRD.md')
  })
  it('legacy mode keeps resolving the per-version snapshot path, unchanged', () => {
    expect(resolveClosedVersionPrdPath(false, 'v0.4')).toBe('docs/prd/versions/v0.4.md')
  })
  it('legacy mode resolves a versions/ path even when that file is a multi-version record (v0.4.md covering v0.1~v0.4) — the helper only names the path, existence is a separate concern (IPC readFile) the component still handles', () => {
    expect(resolveClosedVersionPrdPath(false, 'v0.1')).toBe('docs/prd/versions/v0.1.md')
  })
})
