/**
 * T-641 — the Define screen set caller gets a mechanical pin.
 *
 * WHAT WENT MISSING BEFORE: v0.4's screen set (`T-P4-055`) disappeared with no
 * decision record, because nothing failed when it went. T-614 restored it and
 * gave it a caller, but the caller has three parts and none of them were
 * pinned:
 *   1. designer `_index.md` — the `ds-3up` and `hifi` rows' `when:` strings,
 *      both opening on the literal `Define screen set` (this is the same text
 *      the PO's hot-menu match fires on — commit b6a3864).
 *   2. `po/playbooks/define-entry.md` — the sentence stating the ORDER: DS
 *      direction is settled before the prototype is built.
 *
 * WHAT THIS PINS, and why it is not a byte-for-byte sentence pin (T-613/T-639
 * lesson — pin the rule, not the tag/sentence bytes):
 *   - the menu-row test asserts the LITERAL is present in the row, anywhere in
 *     it (no prefix assumption) — T-659 is already scheduled to reword
 *     ds-3up's `when:` to look at DS-settled state, and that rewording keeps
 *     the literal, so a prefix-anchored pin would be a false failure waiting
 *     to happen;
 *   - the order test asserts the PROPERTY (DS direction is named, an
 *     order/precedence word follows it, and "prototype" follows that) rather
 *     than the sentence's exact wording, so a compression pass that keeps the
 *     rule keeps this test green.
 *
 * Each assertion below is proven non-vacuous inline: a fixture with the
 * literal/property removed is run through the SAME assertion helper and shown
 * to fail, right next to the real assertion.
 *
 * discipline/** is read-only here — this file changes nothing under it.
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { pin } from '../helpers/pin'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const DISC = path.join(CORE_ROOT, 'discipline')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..') // git root is `code/` (fact--cli-pty-testing)
const read = (p: string) => fs.readFileSync(p, 'utf8')

const DESIGNER_INDEX_PATH = path.join(DISC, 'designer', 'playbooks', '_index.md')
const DEFINE_ENTRY_PATH = path.join(DISC, 'po', 'playbooks', 'define-entry.md')
const DESIGNER_INDEX = read(DESIGNER_INDEX_PATH)
const DEFINE_ENTRY = read(DEFINE_ENTRY_PATH)

const CALLER_LITERAL = 'Define screen set'

// ── Part 1: the menu rows carry the caller literal ──────────────────────────

function rowFor(indexText: string, playbook: string): string {
  const line = indexText.split('\n').find((l) => l.startsWith(`| ${playbook} |`))
  if (line === undefined) throw new Error(`no '${playbook}' row in discipline/designer/playbooks/_index.md`)
  return line
}

describe('designer _index.md — ds-3up and hifi rows carry the Define screen set caller (T-641)', () => {
  for (const playbook of ['ds-3up', 'hifi'] as const) {
    test(`${playbook} row contains '${CALLER_LITERAL}' (position free — no prefix anchor)`, () => {
      const row = rowFor(DESIGNER_INDEX, playbook)
      pin(row, CALLER_LITERAL, {
        file: `discipline/designer/playbooks/_index.md (the \`${playbook}\` row)`,
        protects:
          "the PO's hot-menu match fires on this literal (commit b6a3864); losing it from either row is how the v0.4 screen set disappeared with no failing test — a worker could again silently drop it while shaving injection bytes (T-641 ## 실측)",
      })
    })

    test(`${playbook} row: non-vacuous — the same assertion fails once the literal is gone`, () => {
      const row = rowFor(DESIGNER_INDEX, playbook)
      const strippedFixture = row.replace(CALLER_LITERAL, 'Some unrelated trigger phrase')
      expect(strippedFixture).not.toContain(CALLER_LITERAL)
      expect(() =>
        pin(strippedFixture, CALLER_LITERAL, { file: 'fixture (literal removed)', protects: 'fixture check' }),
      ).toThrow(/pinned literal missing/)
    })
  }

  test('the literal is not required at row-start — moving it inside the row still passes (T-659 will reword ds-3up\'s `when:`)', () => {
    const row = rowFor(DESIGNER_INDEX, 'ds-3up')
    expect(row.startsWith(`| ds-3up | ${CALLER_LITERAL}`)).toBe(true) // true today; the pin below does not depend on it staying true
    const reorderedFixture = `| ds-3up | while NO DS is settled — ${CALLER_LITERAL} — DS overhaul (approved reversal) | opus/high |`
    expect(() =>
      pin(reorderedFixture, CALLER_LITERAL, { file: 'fixture (literal mid-row)', protects: 'fixture check' }),
    ).not.toThrow()
  })
})

// ── Part 2: the order property — DS direction precedes the prototype ───────

const ORDER_WORD_RE = /\b(?:first|before|precedes?|prior to|ahead of)\b/i

/** The sentence (if any) mentioning both anchors — shared by the pin and its fixtures. */
function sentenceWithBothAnchors(text: string): string | undefined {
  const sentences = text.split(/(?<=[.!?])\s+/)
  return sentences.find((s) => /DS direction/i.test(s) && /prototype/i.test(s))
}

/**
 * Throws (in the shape `pin()` throws) unless `text` contains a sentence
 * stating: DS direction is named, THEN an order/precedence word, THEN
 * "prototype" — in that left-to-right position order. This is the property
 * T-641 needs pinned: DS direction is settled before the prototype is built.
 * It deliberately does not require any other wording in the sentence.
 */
function pinDsBeforePrototypeOrder(text: string, ctx: { file: string; protects: string }): void {
  const candidate = sentenceWithBothAnchors(text)
  const fail = (why: string) => {
    throw new Error(
      [
        `order property missing from ${ctx.file}`,
        `  protects: ${ctx.protects}`,
        `  reason:   ${why}`,
        `  fix (pick one): 1. the rule still holds → restore a sentence naming DS direction, an order word, then prototype, in that position order;`,
        `                  2. the rule moved to another document → move this pin with it;`,
        `                  3. dropped on purpose → delete the pin and say why.`,
      ].join('\n'),
    )
  }
  if (candidate === undefined) return fail('no sentence mentions both "DS direction" and "prototype"')
  const dsIdx = candidate.search(/DS direction/i)
  const orderMatch = ORDER_WORD_RE.exec(candidate)
  const protoIdx = candidate.search(/prototype/i)
  if (orderMatch === null) return fail(`sentence has both anchors but no order word (first/before/precedes/…): "${candidate.trim()}"`)
  if (!(dsIdx < orderMatch.index && orderMatch.index < protoIdx))
    return fail(`anchors are out of order — DS direction @${dsIdx}, order word @${orderMatch.index}, prototype @${protoIdx}: "${candidate.trim()}"`)
}

describe('po/playbooks/define-entry.md — DS direction is stated to precede the prototype (T-641)', () => {
  test('the order property holds in the real file', () => {
    pinDsBeforePrototypeOrder(DEFINE_ENTRY, {
      file: 'discipline/po/playbooks/define-entry.md',
      protects:
        'the Define screen set is two dispatches, DS direction settled first then the prototype — losing this order line is exactly how a caller can again go unrecorded (T-641 ## 실측)',
    })
  })

  test('non-vacuous — removing the DS-direction mention breaks the same assertion', () => {
    const fixture = DEFINE_ENTRY.replace(/DS direction settled first then the prototype/, 'the prototype')
    expect(fixture).not.toMatch(/DS direction/i)
    expect(() =>
      pinDsBeforePrototypeOrder(fixture, { file: 'fixture (DS-direction mention removed)', protects: 'fixture check' }),
    ).toThrow(/order property missing/)
  })

  test('non-vacuous — removing just the order word breaks the same assertion', () => {
    // Replace the WHOLE candidate sentence (not just the DS/prototype phrase):
    // the real sentence also says "both before Build entry" later on, an
    // unrelated "before" that would otherwise leak back into the order-word
    // scan and mask what this fixture is trying to prove.
    const realSentence = sentenceWithBothAnchors(DEFINE_ENTRY)
    expect(realSentence).toBeDefined()
    const cleanSentence = 'The set is Define work — two design dispatches out of this stage, DS direction and the prototype are both handled during Build entry closing out, never a Build ticket.'
    expect(cleanSentence).not.toMatch(ORDER_WORD_RE)
    const fixture = DEFINE_ENTRY.replace(realSentence!, cleanSentence)
    expect(fixture).toMatch(/DS direction/i)
    expect(sentenceWithBothAnchors(fixture)).not.toMatch(ORDER_WORD_RE)
    expect(() =>
      pinDsBeforePrototypeOrder(fixture, { file: 'fixture (order word removed)', protects: 'fixture check' }),
    ).toThrow(/no order word/)
  })

  test('non-vacuous — reversing the order (prototype first, DS direction after) breaks the same assertion', () => {
    const fixture = DEFINE_ENTRY.replace(
      /DS direction settled first then the prototype/,
      'the prototype built first then DS direction',
    )
    expect(fixture).toMatch(/DS direction/i)
    expect(fixture).toMatch(/prototype/i)
    expect(() =>
      pinDsBeforePrototypeOrder(fixture, { file: 'fixture (order reversed)', protects: 'fixture check' }),
    ).toThrow(/out of order/)
  })

  test('a rewording that keeps the rule (synonym order word, more filler text) still passes', () => {
    const fixture = DEFINE_ENTRY.replace(
      /DS direction settled first then the prototype/,
      'DS direction gets settled well before anyone touches the prototype',
    )
    expect(() =>
      pinDsBeforePrototypeOrder(fixture, { file: 'fixture (reworded, rule intact)', protects: 'fixture check' }),
    ).not.toThrow()
  })
})

// ── Part 3: proven against the ACTUAL historical regression, not just synthetic
// fixtures — `git show <rev>:<path>` for byte-identical pre-fix content is the
// repo's own non-vacuous-proof pattern (fact--cli-pty-testing; T-647 precedent
// at test/core-src-tmp-symlink.test.ts). b6a3864 is T-614's own commit (WHAT:
// "the Define screen set gets a caller and a shell"); its parent is the exact
// state this ticket's `## 실측` describes — a caller with no literal, an order
// sentence with no DS/prototype ordering at all.

function hasGit(): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const HAVE_GIT = hasGit()
const T614_COMMIT = 'b6a3864'

function showAtRevision(rev: string, relPath: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${rev}:${relPath}`], { encoding: 'utf8' })
}

describe.skipIf(!HAVE_GIT)('proven against the real pre-T-614 regression (commit before b6a3864)', () => {
  const preFixIndex = showAtRevision(`${T614_COMMIT}~1`, 'packages/core/discipline/designer/playbooks/_index.md')
  const preFixDefineEntry = showAtRevision(`${T614_COMMIT}~1`, 'packages/core/discipline/po/playbooks/define-entry.md')

  for (const playbook of ['ds-3up', 'hifi'] as const) {
    test(`${playbook} row pin fails against the actual pre-T-614 row (no caller literal existed)`, () => {
      const row = rowFor(preFixIndex, playbook)
      expect(row).not.toContain(CALLER_LITERAL)
      expect(() =>
        pin(row, CALLER_LITERAL, { file: `pre-T-614 fixture (${playbook})`, protects: 'fixture check' }),
      ).toThrow(/pinned literal missing/)
    })
  }

  test('order pin fails against the actual pre-T-614 define-entry.md (no DS/prototype ordering existed)', () => {
    expect(sentenceWithBothAnchors(preFixDefineEntry)).toBeUndefined()
    expect(() =>
      pinDsBeforePrototypeOrder(preFixDefineEntry, { file: 'pre-T-614 fixture (define-entry.md)', protects: 'fixture check' }),
    ).toThrow(/order property missing/)
  })
})
