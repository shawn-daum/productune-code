/**
 * PRD read unit + feature-spec store — discipline text pin (T-476).
 *
 * T-476 shrank what a worker loads from the PRD: `[ctx].prd_path` no longer
 * names the whole 1,411-line file but ONE version section via a fragment
 * (`docs/prd/PRD.md#v<N>.<m>` — measured −87.2% bytes / −89.0% chars), and a
 * feature's CURRENT contract moved out of the PRD into `docs/features/<feature>.md`.
 *
 * Both are text-only contracts — nothing in the code path constructs the
 * `[ctx]` line, the PO writes it by hand from contracts.md's schema. So the
 * discipline prose IS the enforcement, and a paraphrase or a revert of one of
 * the four coordinated edits silently restores the old whole-file read. This
 * test pins the load-bearing clauses verbatim.
 *
 * The line caps are pinned here too, deliberately: `prdt doctor` reports a cap
 * violation as a WARNING and never gates, so the cap that made T-476 fold its
 * new PRD row in-line (contracts.md ≤ 80) has no failing surface anywhere else.
 */

import fs from 'fs'
import path from 'path'
import { test, expect, describe } from 'vitest'

const DISCIPLINE = path.resolve(__dirname, '..', '..', 'discipline')
const CONTRACTS = path.join(DISCIPLINE, 'contracts.md')
const DESIGNER_HABIT = path.join(DISCIPLINE, 'designer', 'habit.md')
const PRD_CLARITY = path.join(DISCIPLINE, 'designer', 'playbooks', 'prd-clarity.md')
const PO_HABIT = path.join(DISCIPLINE, 'po', 'habit.md')
const SCOPE_CHALLENGE = path.join(DISCIPLINE, 'designer', 'playbooks', 'scope-challenge.md')

const read = (p: string) => fs.readFileSync(p, 'utf-8')
// Same count doctor uses: python splitlines() ignores one trailing newline.
const lineCount = (p: string) => read(p).replace(/\n$/, '').split('\n').length
// Mirrors doctor's body_line_count: frontmatter stripped, trailing newlines ignored.
const bodyLineCount = (p: string) =>
  read(p).split(/^---$/m).slice(2).join('---').replace(/\n+$/, '').split('\n').length

describe('contracts.md — prd_path is a fragment, not the whole file', () => {
  test('the [ctx] schema line carries the version fragment', () => {
    expect(read(CONTRACTS)).toContain('"prd_path":"docs/prd/PRD.md#v<N>.<m>"')
  })

  // The regression this guards: any edit that drops the fragment back to the
  // bare path hands the worker all eight version sections again.
  test('no bare whole-file prd_path example survives anywhere in contracts', () => {
    expect(read(CONTRACTS)).not.toMatch(/"prd_path":"docs\/prd\/PRD\.md"/)
  })

  test('the Fixed paths PRD row states the read unit', () => {
    const row = read(CONTRACTS).split('\n').find((l) => l.startsWith('| PRD (single living file) |'))
    expect(row).toBeDefined()
    expect(row).toContain('`docs/prd/PRD.md#v<N>.<m>`')
    expect(row).toContain('that ONE version section, never the whole file')
    // T-476 F4: a live '## Phase N' section sits outside the version section
    // and must be pulled into the read unit too, or a worker reading only
    // head+version-section misses its still-open Non-goals/Acceptance.
    expect(row).toContain('## Phase N')
    // A closed section is an immutable episode — the whole point of keeping the
    // cumulative SoT while shrinking the read unit.
    expect(row).toContain('append a supersede note, never rewrite it')
  })
})

describe('contracts.md — docs/features is a registered fixed path', () => {
  const row = () =>
    read(CONTRACTS)
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes('`docs/features/<feature>.md`'))

  test('the Fixed paths table registers docs/features/<feature>.md', () => {
    expect(row()).toBeDefined()
  })

  test('the row fixes the naming rule, the flat-dir rule and the no-index rule', () => {
    const r = row()!
    expect(r).toContain('the ticket frontmatter `feature:` value verbatim')
    expect(r).toContain('flat dir, no index file')
  })

  test('the row fixes the validity-window tagging and no-delete rules', () => {
    const r = row()!
    expect(r).toContain('`(vX~)`')
    expect(r).toContain('`(vX~vY, replaced-by …)`')
    expect(r).toContain('never deleted')
  })

  // features/ sits OUTSIDE the wiki store, so `prdt wiki lint` cannot see a
  // wikilink written there — it would be an unchecked dead link.
  test('the row bans wikilinks in the features store', () => {
    expect(row()).toContain('Never `[[…]]` here')
  })
})

describe('designer habit + prd-clarity playbook', () => {
  test('habit carries the feature-spec bullet with the three promotion tests', () => {
    const h = read(DESIGNER_HABIT)
    expect(h).toContain('**Feature spec** is `docs/features/<feature>.md`')
    expect(h).toContain('three tests TOGETHER')
    expect(h).toContain('never delete an invalidated one')
  })

  test('prd-clarity states what the PRD does NOT hold', () => {
    const p = read(PRD_CLARITY)
    expect(p).toContain('## What the PRD does NOT hold')
    expect(p).toContain('never restate a live contract inside a version section')
    expect(p).toContain('the standing head + ONE version section')
  })
})

describe('line caps (doctor only warns — this is the failing surface)', () => {
  test('contracts.md stays within its 80-line cap', () => {
    expect(lineCount(CONTRACTS)).toBeLessThanOrEqual(80)
  })

  test('designer/habit.md stays within its 40-line worker-habit cap', () => {
    expect(lineCount(DESIGNER_HABIT)).toBeLessThanOrEqual(40)
  })

  test('prd-clarity body stays within its 80-line playbook cap', () => {
    expect(bodyLineCount(PRD_CLARITY)).toBeLessThanOrEqual(80)
  })

  // T-497 added a rule to po/habit.md (61/64) and a whole new playbook. Neither
  // had a failing surface here, so both caps could drift on a warning alone.
  test('po/habit.md stays within its 64-line PO-habit cap', () => {
    expect(lineCount(PO_HABIT)).toBeLessThanOrEqual(64)
  })

  test('scope-challenge body stays within its 80-line playbook cap', () => {
    expect(bodyLineCount(SCOPE_CHALLENGE)).toBeLessThanOrEqual(80)
  })
})
