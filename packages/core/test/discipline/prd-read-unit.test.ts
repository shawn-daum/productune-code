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
import { pin, pinAbsent } from '../helpers/pin'

const DISCIPLINE = path.resolve(__dirname, '..', '..', 'discipline')
const CONTRACTS = path.join(DISCIPLINE, 'contracts.md')
const DESIGNER_HABIT = path.join(DISCIPLINE, 'designer', 'habit.md')
const PRD_CLARITY = path.join(DISCIPLINE, 'designer', 'playbooks', 'prd-clarity.md')
const PO_HABIT = path.join(DISCIPLINE, 'po', 'habit.md')
const SCOPE_CHALLENGE = path.join(DISCIPLINE, 'designer', 'playbooks', 'scope-challenge.md')
const FIXED_PATHS_ANNEX = path.join(DISCIPLINE, 'contracts', 'fixed-paths.md')
const AUTO_OPEN_HOOK = path.join(DISCIPLINE, '..', 'scripts', 'hooks', 'prdt-auto-open.sh')

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
    const row = read(CONTRACTS).split('\n').find((l) => l.startsWith('| PRD (working document + history) |'))
    expect(row).toBeDefined()
    expect(row).toContain('`docs/prd/PRD.md#v<N>.<m>`')
    expect(row).toContain('that ONE version section')
    // T-602: the working file is head + the open section and nothing else, so
    // reading the whole file IS the read unit — the old "never the whole file"
    // wording would now forbid the intended read.
    expect(row).toContain('the working file IS the read unit')
    expect(row).not.toContain('never the whole file')
    // T-476 F4: a live '## Phase N' section sits outside the version section
    // and must be pulled into the read unit too, or a worker reading only
    // head+version-section misses its still-open Non-goals/Acceptance.
    expect(row).toContain('## Phase N')
    // A closed section is an immutable episode — the whole point of keeping the
    // cumulative SoT while shrinking the read unit.
    expect(row).toContain('append a supersede note, never rewrite it')
  })
})

describe('contracts.md — PRD split: working document + history (T-602)', () => {
  const row = () =>
    read(CONTRACTS).split('\n').find((l) => l.startsWith('| PRD (working document + history) |'))!

  // The user's requirement is sight: opening the working document shows the
  // current version only. The row must therefore name BOTH files and say the
  // move is a move (byte-identical, immutable record) — not a copy, which §Git
  // bans, and not per-version files, which v1.10 would have to fold back.
  test('the row names history.md and the byte-identical move', () => {
    const r = row()
    expect(r).toContain('`docs/prd/PRD.md` = the standing head + the ONE open `## v<N>.<m>` section')
    expect(r).toContain('MOVES its section byte-identical into `docs/prd/history.md`')
    // The row must not restate an anchor the annex owns and states differently.
    expect(r).not.toContain('to the end of `docs/prd/history.md`')
    expect(r).toContain('never a per-version file, never a copy')
  })

  // Two prd_path forms. A dispatch always works the OPEN version, and the
  // dispatch-gate hook pins `docs/prd/PRD.md#v<N>.<m>` by regex — so the closed
  // form is a citation form only, and the row has to say so or a PO will type
  // `history.md#v1.3` into a dispatch and be denied by the gate.
  test('the row gives the closed-section citation form and keeps it out of dispatch prd_path', () => {
    const r = row()
    expect(r).toContain('`docs/prd/history.md#v<N>.<m>`')
    expect(r).toContain('a form a dispatch `prd_path` never takes')
    expect(read(CONTRACTS)).toContain('`[ctx].prd_path` = `docs/prd/PRD.md#v<N>.<m>`')
    expect(read(CONTRACTS)).not.toMatch(/"prd_path":"docs\/prd\/history\.md/)
  })

  test('§Git still bans snapshot copies and classifies history.md as a move', () => {
    const git = read(CONTRACTS).split('\n').find((l) => l.startsWith('- git is the version history'))!
    expect(git).toContain('no snapshot copies')
    expect(git).toContain('`docs/prd/history.md` is a move, not a copy')
  })

  // A PRD resolver takes the FIRST match over three candidate paths; a history
  // file named PRD.md on any of them would be served as the current PRD with no
  // error. The annex has to carry that constraint.
  test('the annex carries the close procedure and the candidate-path constraint', () => {
    const annex = read(FIXED_PATHS_ANNEX)
    expect(annex).toContain('## PRD — closing a `## v<N>.<m>` version section')
    expect(annex).toContain('append it verbatim after the LAST `## v` section of `history.md`')
    expect(annex).toContain('never named `PRD.md` and never sits on a path a PRD resolver would try')
    expect(annex).toContain('`docs/prd/PRD.md` · `docs/PRD.md` · `PRD.md`')
    expect(annex).toMatch(/^when: .*closing a PRD `## v<N>\.<m>` version section/m)
  })

  // A close appends; the version run must stay contiguous even in a history file
  // that carries trailing non-version matter, so "the end of the file" is the
  // wrong anchor and the annex must not say it.
  test('the close appends after the last version section, not at EOF', () => {
    const annex = read(FIXED_PATHS_ANNEX)
    expect(annex).toContain('ahead of any trailing non-version matter')
    expect(annex).not.toContain('append it verbatim to the end of `history.md`')
  })

  // The byte compare is the proof the move was a move. It has to say which side
  // the blank separator belongs to, or the first real close fails its own shasum.
  test('the byte compare names the separator convention', () => {
    const annex = read(FIXED_PATHS_ANNEX)
    expect(annex).toContain('each side rstripped')
    expect(annex).toContain('belongs to the FILE, not to either block')
  })

  // This annex is mirrored into EVERY prdt project. A sentence stating one
  // project's version history or a sibling project's name is false everywhere
  // else, so the contract states the RULE and the project's own file heads
  // state its facts.
  test('the shared annex states no project-private fact', () => {
    const annex = read(FIXED_PATHS_ANNEX)
    expect(annex).not.toMatch(/v0\.\d/)
    expect(annex).not.toContain('versions/v0.4.md')
    expect(annex).not.toContain('ntf-pm')
    expect(annex).toContain('belongs to the two file heads, never to this contract')
  })

  test('the auto-open hook documents that history.md is deliberately not a light-open match', () => {
    expect(read(AUTO_OPEN_HOOK)).toContain('NOT docs/prd/history.md')
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
    expect(r).toContain('named by that value verbatim')
    expect(r).toContain('flat dir, no index file')
  })

  // T-547: `feature:` is a GROUPING KEY. Measured across 8 prdt projects on
  // 2026-09-01, 131 of 134 values carry no spec file — so a row that calls
  // every value a spec pointer declares 131 legal tickets in violation. The
  // read-FIRST duty is real, but it fires only where the file EXISTS. Both
  // halves are pinned: dropping the condition and dropping the duty are the
  // two ways this row goes wrong, and each fails here.
  test('the row makes read-FIRST conditional on the spec file existing', () => {
    const r = row()!
    expect(r).toContain('a grouping key, not a pointer')
    expect(r).toContain('a value with NO spec file is legal and the normal state')
    expect(r).toContain('When `docs/features/<value>.md` EXISTS')
    expect(r).toContain('read it FIRST, before touching that feature')
    expect(r).toContain('history/lessons only, never the current spec')
  })

  // T-613: the row no longer carries the tags. T-586 moved spec-AUTHORING rules
  // into the annex this row points at, and the designer habit carries the same
  // vocabulary for the author — the rule is intact, so the pin moved to its new
  // home instead of being deleted or dropped to a weaker check. Both halves are
  // still pinned: the tags (validity window) and "never deleted" (no-delete).
  test('the validity-window tagging and no-delete rules live in the annex the row points at', () => {
    expect(row()).toContain('`contracts/fixed-paths.md`')
    const a = read(FIXED_PATHS_ANNEX)
    const ctx = {
      file: 'discipline/contracts/fixed-paths.md',
      protects: 'a spec file states the CURRENT contract only: every fact carries its validity window, and an invalidated fact is annotated, never deleted',
    }
    for (const lit of ['`(vX~)`', '`(vX~vY, replaced-by …)`', 'never deleted']) pin(a, lit, ctx)
    // no dual text: the hot row points, it does not restate
    pinAbsent(row()!, '`(vX~', { file: 'discipline/contracts.md (feature-spec row)', protects: 'the row points at the annex instead of carrying authoring vocabulary' })
  })

  // features/ sits OUTSIDE the wiki store, so `prdt wiki lint` cannot see a
  // wikilink written there — it would be an unchecked dead link. The ban is a
  // spec-AUTHORING rule, so it lives in the on-demand annex the row points at
  // (T-586 hot→cold split); the row keeps the pointer, the annex keeps the text.
  test('the row points at the annex that bans wikilinks in the features store', () => {
    expect(row()).toContain('`contracts/fixed-paths.md`')
    expect(read(FIXED_PATHS_ANNEX)).toContain('Never `[[…]]` here')
    expect(row()).not.toContain('Never `[[…]]` here')
  })
})

describe('designer habit + prd-clarity playbook', () => {
  test('habit carries the feature-spec bullet with the three promotion tests', () => {
    const h = read(DESIGNER_HABIT)
    expect(h).toContain('**Feature spec** is `docs/features/<feature>.md`')
    expect(h).toContain('three tests TOGETHER')
    expect(h).toContain('never delete an invalidated one')
  })

  // T-552: the Feature spec line's T2 absorbed what used to be a separate
  // third test — "a real consumer needs this contract". The absorption is what
  // `docs/wiki/fact--discipline-editing.md` records; lose this half and T2
  // degrades to "is there a contract?", which every feature passes, and the
  // wiki page's statement becomes false. Pinned by the consumer half alone so
  // rewording the surrounding sentence stays legal.
  test('T2 keeps its consumer half — the contract has to be gettable-wrong', () => {
    expect(read(DESIGNER_HABIT)).toContain(
      'an agent touching this area gets WRONG without reading it',
    )
  })

  test('prd-clarity states what the PRD does NOT hold', () => {
    const p = read(PRD_CLARITY)
    expect(p).toContain('## What the PRD does NOT hold')
    expect(p).toContain('never restate a live contract inside a version section')
    expect(p).toContain('the standing head + ONE version section')
  })
})

describe('contracts.md — risk_flags names only the risk the change CREATES', () => {
  const tierRule = () =>
    read(CONTRACTS)
      .split('\n')
      .find((l) => l.startsWith('- Impl return whose') && l.includes('auto-dispatches QA'))

  test('the dispatch tier rule exists', () => {
    expect(tierRule()).toBeDefined()
  })

  // T-552: without the negative list the definition reads as a platitude and
  // every persona keeps flagging the bug it just fixed — the four recorded
  // mis-routings all resolve on this half, not on the positive sentence. Three
  // substrings, each load-bearing on its own: the ban, the literals people
  // actually typed as flags, and the consequence that makes the ban matter.
  test('the rule states the defect being fixed is never a flag', () => {
    const r = tierRule()!
    expect(r).toContain('The defect being FIXED is never a flag')
    expect(r).toContain('`crash`, `data-loss`, `p0`')
    expect(r).toContain('never raises the tier')
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
