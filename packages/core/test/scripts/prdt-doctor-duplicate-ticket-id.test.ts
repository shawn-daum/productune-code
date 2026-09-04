/**
 * prdt-doctor-duplicate-ticket-id.test.ts — the global-uniqueness claim, checked
 * by a machine for the first time (T-551).
 *
 * contracts §Tickets declares, verbatim: "`id` is a global counter (`T-NNN` unique
 * across ALL ticket dirs)". Nothing verified it. Measured 2026-09-01 (QA and
 * developer independently): 0 duplicates across ~1420 tickets in 9-10 real
 * projects. So this is not a break being repaired — it is a rule that was true
 * only on paper, and a clean run on real data is therefore worth nothing as
 * evidence on its own. The evidence lives here, in fixtures that carry a
 * deliberate duplicate.
 *
 * What a violation actually costs, and why a warning is the right instrument:
 *   · `prdt tickets --link` and every other id lookup resolve through an id-keyed
 *     map, so which colliding file an id means is undefined — last writer wins,
 *     and the loser is invisible to every check reading that map.
 *   · T-548's W2 counts a span across version dirs; T-549 fixed the collapse, but
 *     the duplicate that provoked it is still a discipline violation.
 *
 * SEPARATION FROM THE SEAM (the T-549 lock this ticket deliberately opens):
 * T-549 pinned "no duplicate warning anywhere in the run" so that its own fix could
 * not smuggle the answer in beside itself. That pin is now narrowed in
 * prdt-doctor-feature-seam.test.ts to what it was protecting — the SEAM does not
 * invent it — and this file owns the other half: the warning exists, exactly once,
 * on the `ticket:` channel. The two are kept apart by CHANNEL, not by wording, so a
 * seam check that grew a duplicate line would fail both files at once.
 *
 * DIFFERENT ROUTE: every expectation is fixed by construction. The fixture writer
 * is told which id goes in which file and the assertions quote those paths as
 * literals — nothing is read back from scan_tickets, index.db, or a doctor run.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const CONTRACTS = path.join(CORE_ROOT, 'discipline', 'contracts.md')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version'])

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-dupid-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.8', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

/** Write `<version>/<file>.md` whose frontmatter `id:` is `id`. Filename and
 *  frontmatter id are separate arguments on purpose: a collision can happen in
 *  either, and the caller states which one it is planting. */
function ticket(version: string, file: string, id: string, status = 'done'): string {
  const dir = path.join(projectRoot, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${file}.md`),
    `---\nid: ${id}\nslug: s-${file.toLowerCase()}\ntype: impl\nstatus: ${status}\n` +
    `assignee: developer\ncreated: 2026-01-01\n---\n\nbody\n`)
  return `docs/tickets/${version}/${file}.md`   // the path doctor prints, by construction
}

function doctorOut(): string {
  return execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
}

/** Only the duplicate-id lines. Proof-of-completion first, so a silence below is a
 *  verdict rather than a run that died before reaching the check. */
function dupWarnings(): string[] {
  const out = doctorOut()
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n')
    .filter(l => l.startsWith('⚠ ticket: duplicate id '))
    .map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('the positive set — a duplicate is reported, naming every carrier', () => {
  test('one id in two version dirs: one warning, both files named', () => {
    ticket('v1.1', 'T-200', 'T-200')
    ticket('v1.2', 'T-200', 'T-200')
    const w = dupWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('duplicate id T-200')
    expect(w[0]).toContain('2 files carry it')
    expect(w[0]).toContain('docs/tickets/v1.1/T-200.md')
    expect(w[0]).toContain('docs/tickets/v1.2/T-200.md')
  })

  test('three carriers: all three named — never a count with one example', () => {
    // the repair is a renumber, and you cannot renumber a file you were not told about
    const a = ticket('v1.1', 'T-200', 'T-200')
    const b = ticket('v1.2', 'T-200', 'T-200')
    const c = ticket('backlog', 'T-200', 'T-200')
    const w = dupWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('3 files carry it')
    for (const p of [a, b, c]) expect(w[0]).toContain(p)
  })

  test('the backlog dir is NOT exempt — "ALL ticket dirs" is the contracts wording', () => {
    // deliberately different from T-548's W2, which excludes backlog from its span:
    // uniqueness is a property of the id space, not of the shipped subset
    ticket('backlog', 'T-201', 'T-201')
    ticket('v1.3', 'T-201', 'T-201')
    expect(dupWarnings()).toHaveLength(1)
  })

  test('a FRONTMATTER-only collision counts — the filenames differ, the ids do not', () => {
    // this is the shape that actually breaks `--link`: resolution keys on the id,
    // so T-300.md is reachable by nobody while T-202 means whichever row won
    ticket('v1.1', 'T-202', 'T-202')
    ticket('v1.2', 'T-300', 'T-202')
    const w = dupWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('docs/tickets/v1.1/T-202.md')
    expect(w[0]).toContain('docs/tickets/v1.2/T-300.md')
    // and the pre-existing id-vs-filename check is untouched by this one
    expect(doctorOut()).toContain('frontmatter id T-202 != filename T-300')
  })

  test('two distinct duplicated ids get two separate warnings, sorted by id', () => {
    ticket('v1.1', 'T-210', 'T-210'); ticket('v1.2', 'T-210', 'T-210')
    ticket('v1.1', 'T-205', 'T-205'); ticket('v1.3', 'T-205', 'T-205')
    const w = dupWarnings()
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('duplicate id T-205')
    expect(w[1]).toContain('duplicate id T-210')
  })

  test('status is irrelevant — a dropped ticket still occupies its id', () => {
    ticket('v1.1', 'T-206', 'T-206', 'dropped')
    ticket('v1.2', 'T-206', 'T-206', 'open')
    expect(dupWarnings()).toHaveLength(1)
  })

  test('the message routes to a person and hands over no runnable command', () => {
    ticket('v1.1', 'T-200', 'T-200')
    ticket('v1.2', 'T-200', 'T-200')
    const line = dupWarnings()[0]
    expect(line).toContain('unique across ALL ticket dirs')
    expect(line).toContain('renumber all but one')
    expect(line).not.toMatch(/\bprdt \w+|\bgit \b|\bmv \b|\bsed \b/)
  })
})

describe.skipIf(!CAN_RUN)('the negative set — what must NEVER warn', () => {
  test('distinct ids across many dirs are the normal state (0 duplicates in ~1420)', () => {
    ticket('v1.1', 'T-101', 'T-101')
    ticket('v1.2', 'T-102', 'T-102')
    ticket('v1.2.1', 'T-103', 'T-103')
    ticket('backlog', 'T-104', 'T-104')
    expect(dupWarnings()).toEqual([])
  })

  test('a single ticket, and a project with no ticket dir at all, say nothing', () => {
    ticket('v1.1', 'T-101', 'T-101')
    expect(dupWarnings()).toEqual([])
    fs.rmSync(path.join(projectRoot, 'docs', 'tickets'), { recursive: true })
    expect(dupWarnings()).toEqual([])
  })

  test('ids that merely share a prefix are not merged — verbatim compare', () => {
    ticket('v1.1', 'T-20', 'T-20')
    ticket('v1.2', 'T-200', 'T-200')
    ticket('v1.3', 'T-2000', 'T-2000')
    expect(dupWarnings()).toEqual([])
  })

  test('a prefixed id space is compared verbatim too, not stripped to its number', () => {
    // contracts allows `T-<PREFIX>-NNN`; T-ABC-1 and T-1 are different ids
    ticket('v1.1', 'T-ABC-1', 'T-ABC-1')
    ticket('v1.2', 'T-1', 'T-1')
    expect(dupWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('severity and blast radius', () => {
  test('doctor stays non-blocking with the check firing — exit 0, one severity', () => {
    ticket('v1.1', 'T-200', 'T-200')
    ticket('v1.2', 'T-200', 'T-200')
    const out = doctorOut()   // execFileSync would have thrown on a non-zero exit
    expect(out).toContain('duplicate id T-200')
    expect(out).toContain('(non-blocking)')
    expect(out).not.toMatch(/^(ERROR|FAIL|✖)/m)
    for (const l of out.split('\n').filter(Boolean)) {
      expect(l.startsWith('⚠ ') || l.startsWith('doctor: ')).toBe(true)
    }
  })

  test('the other checks are behaviorally unchanged — same warnings minus this one', () => {
    // one fixture, run twice: the second differs only by the planted duplicate, so
    // any other line that moves is this check bleeding into a neighbour
    ticket('v1.1', 'T-101', 'T-101')
    fs.writeFileSync(path.join(projectRoot, 'docs', 'features', 'renamed-away.md'), '# x\n')
    const before = doctorOut().split('\n').filter(l => l.startsWith('⚠ '))
    expect(before.some(l => l.includes('renamed-away.md'))).toBe(true)   // a live neighbour

    ticket('v1.2', 'T-101', 'T-101')
    const after = doctorOut().split('\n').filter(l => l.startsWith('⚠ '))
    const added = after.filter(l => !before.includes(l))
    expect(added).toHaveLength(1)
    expect(added[0]).toContain('duplicate id T-101')
    expect(after.filter(l => !added.includes(l))).toEqual(before)
  })
})

describe('the claim the check is derived from', () => {
  test('contracts still declares ids globally unique, in the words quoted above', () => {
    // if this wording ever goes, the check is orphaned and must be re-argued, not
    // silently kept
    expect(fs.readFileSync(CONTRACTS, 'utf-8')).toContain('unique across ALL ticket dirs')
  })
})
