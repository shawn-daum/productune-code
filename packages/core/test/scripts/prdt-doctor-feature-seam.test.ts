/**
 * prdt-doctor-feature-seam.test.ts — the docs/features/ seam (T-548, rules T-547 §6).
 *
 * contracts claims `prdt doctor` watches this seam. Before this slice nothing
 * did: across the 8 prdt projects measured on 2026-09-01, 134 `feature:` values
 * carried 3 spec files and no check ever fired anywhere.
 *
 * What T-547 fixed, and what this file pins:
 *   `feature:` is a GROUPING KEY, not a spec pointer. A value with no
 *   `docs/features/<value>.md` is legal and the normal state (131 of 134). So
 *   the negative set below binds exactly as hard as the positive one — a check
 *   that reported "no spec file" would fire on 131 legal values and make
 *   v1.8's zero-warning goal unreachable by construction.
 *
 * Three warnings, all standard doctor severity (non-blocking, never a gate):
 *   W1 orphan spec        — a file no ticket's value names
 *   W2 promotion candidate — T3 passes, unpromoted, unrecorded (a PENDING JUDGMENT)
 *   W3 stale record        — a `features.non_features` entry that has rotted
 *
 * Only T3 (done tickets span >= 2 version dirs) is machine-computable. T1
 * "is it a mechanism?" and T2 "is the contract still true?" are human yes/no
 * calls; a doctor that computed them would be making the judgment this check
 * exists to route TO a person, so their absence here is the design.
 *
 * DIFFERENT ROUTE (v1.6/v1.7 both paid for checks that read one value twice):
 * every expectation here is fixed by CONSTRUCTION — the fixture builder is told
 * how many version dirs a value spans and the assertion quotes that number as a
 * literal. The test never asks scan_tickets, index.db, or a doctor run what the
 * answer should be. The two sides doctor joins (ticket frontmatter, the spec
 * directory listing) are independent of each other and of this file.
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

interface Ticket { id: string; version: string; feature: string; status: 'open' | 'done' | 'dropped' }

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-featseam-'))
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
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
  config({ slug: 'proj' })
}

function config(cfg: Record<string, unknown>): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'), JSON.stringify(cfg, null, 2))
}

function ticket(t: Ticket): void {
  const dir = path.join(projectRoot, 'docs', 'tickets', t.version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${t.id}.md`),
    `---\nid: ${t.id}\nslug: s-${t.id.toLowerCase()}\ntype: impl\nstatus: ${t.status}\n` +
    `assignee: developer\nfeature: ${t.feature}\ncreated: 2026-01-01\n---\n\nbody\n`)
}

let nextId = 100
/** Give `value` `versions.length` tickets at `status`, one per named dir. The
 *  CALLER states the span; assertions quote it as a literal. */
function span(value: string, versions: string[], status: Ticket['status'] = 'done'): void {
  for (const v of versions) ticket({ id: `T-${++nextId}`, version: v, feature: value, status })
}

function spec(name: string): void {
  fs.writeFileSync(path.join(projectRoot, 'docs', 'features', `${name}.md`), `# ${name}\n`)
}

/** Only the seam's own lines. Everything else doctor says is another check's. */
function featureWarnings(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
  // proof the run reached the end rather than dying early — silence below is
  // then a verdict, not a dead code path
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n').filter(l => l.startsWith('⚠ feature:')).map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) { nextId = 100; makeFixture() } })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('W1 — orphan spec file', () => {
  test('a spec file no ticket names IS reported', () => {
    spec('renamed-away')
    span('something-else', ['v1.1'])
    expect(featureWarnings()).toContain(
      "feature: docs/features/renamed-away.md is named by no ticket's feature: value (orphan — renamed value or typo)")
  })

  test('a ticket in ANY status or dir rescues the file — existence, not doneness', () => {
    // W1's existence set is deliberately wider than T3's: open tickets and the
    // backlog dir both count here, and neither counts for W2.
    spec('open-only'); span('open-only', ['v1.1'], 'open')
    spec('backlog-only'); span('backlog-only', ['backlog'])
    spec('dropped-only'); span('dropped-only', ['v1.1'], 'dropped')
    expect(featureWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('W2 — promotion candidate (T3 passes, judgment pending)', () => {
  test('done tickets in 2 version dirs with no spec file IS reported, with the span', () => {
    span('real-mech', ['v1.1', 'v1.2'])          // 2 dirs, by construction
    const w = featureWarnings()
    expect(w).toContain(
      "feature: 'real-mech' — done tickets span 2 version dirs but docs/features/real-mech.md " +
      'does not exist — promotion candidate: apply the three tests (designer habit), then ' +
      'promote or record in .prdt/config.json features.non_features')
    expect(w).toHaveLength(1)
  })

  test('a patch dir counts separately from its minor — T-476 own measurement', () => {
    span('patchy', ['v1.2', 'v1.2.1'])           // 2 dirs: v1.2 and v1.2.1
    expect(featureWarnings()[0]).toContain('span 2 version dirs')
  })

  test('the message routes to a person and hands over no runnable command', () => {
    span('real-mech', ['v1.1', 'v1.2'])
    const line = featureWarnings()[0]
    // the three tests are the designer's; doctor computed only T3
    expect(line).toContain('apply the three tests (designer habit)')
    expect(line).not.toMatch(/\bprdt \w+|\bgit \b|\bmkdir\b|\bcp \b/)
  })

  test('a value spelled differently is NOT merged — verbatim compare, no alias machine', () => {
    span('discipline', ['v1.1'])
    span('prdt-discipline', ['v1.5'])
    // 1 + 1 verbatim, never 2 merged: neither reaches T3
    expect(featureWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('the negative set — what must NEVER warn (T-547 §6)', () => {
  test('T3 not met + no spec file is the NORMAL state (131 of 134 values)', () => {
    span('one-dir', ['v1.1'])
    span('another', ['v1.4'])
    span('dormant-tag', ['v1.1'], 'open')
    expect(featureWarnings()).toEqual([])
  })

  test('open tickets are not facts — T3 counts done only, however many dirs they span', () => {
    span('all-open', ['v1.1', 'v1.2', 'v1.3', 'v1.4'], 'open')
    span('all-dropped', ['v1.1', 'v1.2'], 'dropped')
    expect(featureWarnings()).toEqual([])
  })

  test('the backlog dir is excluded from the T3 span', () => {
    // done in backlog + done in v1.1 == ONE counted dir, not two
    span('half', ['backlog', 'v1.1'])
    expect(featureWarnings()).toEqual([])
  })

  test('a recorded non-promotion silences W2 — the judgment is DONE', () => {
    config({ slug: 'proj', features: { non_features: ['gui', 'discipline'] } })
    span('gui', ['v1.1', 'v1.2', 'v1.5', 'v1.6'])
    span('discipline', ['v1.1', 'v1.3'])
    expect(featureWarnings()).toEqual([])
  })

  test('the project slug is never its own feature', () => {
    config({ slug: 'daum-mini-games' })
    span('daum-mini-games', ['v1.1', 'v1.2'])
    expect(featureWarnings()).toEqual([])
  })

  test('promoted and carried is the healthy shape', () => {
    spec('meta-split'); span('meta-split', ['v1.2', 'v1.2.1', 'v1.3', 'v1.4'])
    expect(featureWarnings()).toEqual([])
  })

  test('a project with no docs/features/ dir at all is not itself a finding', () => {
    fs.rmSync(path.join(projectRoot, 'docs', 'features'), { recursive: true })
    span('one-dir', ['v1.1'])
    expect(featureWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('W3 — a non_features record that has rotted', () => {
  test('an entry that now HAS a spec file is reported (contradiction)', () => {
    config({ slug: 'proj', features: { non_features: ['gui'] } })
    spec('gui'); span('gui', ['v1.1'])
    expect(featureWarnings()).toContain(
      "feature: config features.non_features entry 'gui' is stale — a spec file exists")
  })

  test('an entry no ticket carries is reported (typo / dead value)', () => {
    config({ slug: 'proj', features: { non_features: ['guii'] } })
    span('gui', ['v1.1'])
    expect(featureWarnings()).toContain(
      "feature: config features.non_features entry 'guii' is stale — no ticket carries it")
  })

  test('an entry backed by tickets and no spec file stays SILENT — a live judgment', () => {
    config({ slug: 'proj', features: { non_features: ['gui'] } })
    span('gui', ['v1.1', 'v1.2'])
    expect(featureWarnings()).toEqual([])
  })

  test('no features record at all is silent — the default is an empty list', () => {
    config({ slug: 'proj' })
    span('gui', ['v1.1'])
    expect(featureWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('the positive control, then the zero — v1.8 gated-goal shape', () => {
  test('all three fire together, then resolving each one drives the count to 0', () => {
    config({ slug: 'proj', features: { non_features: ['promoted-anyway', 'ghost-value', 'judged'] } })
    span('real-mech', ['v1.1', 'v1.2'])                    // W2
    spec('orphan-spec')                                    // W1
    spec('promoted-anyway'); span('promoted-anyway', ['v1.1'])  // W3 (a)
    /* 'ghost-value' carried by nothing */                 // W3 (b)
    span('judged', ['v1.1', 'v1.2'])                       // negative control
    const before = featureWarnings()
    expect(before).toHaveLength(4)
    expect(before.filter(l => l.includes('orphan —'))).toHaveLength(1)
    expect(before.filter(l => l.includes('promotion candidate'))).toHaveLength(1)
    expect(before.filter(l => l.includes('is stale —'))).toHaveLength(2)

    // resolve: promote the candidate, delete the orphan, drop both stale records
    spec('real-mech')
    fs.rmSync(path.join(projectRoot, 'docs', 'features', 'orphan-spec.md'))
    config({ slug: 'proj', features: { non_features: ['judged'] } })
    expect(featureWarnings()).toEqual([])
  })

  test('doctor stays non-blocking with the seam firing — exit 0, never a gate', () => {
    span('real-mech', ['v1.1', 'v1.2'])
    const r = execFileSync('python3', [PRDT_CLI, 'doctor'],
      { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
    expect(r).toContain('promotion candidate')
    expect(r).toContain('(non-blocking)')   // execFileSync would have thrown on a non-zero exit
  })
})

describe.skipIf(!CAN_RUN)('T3 is computed over ROWS, not over an id-keyed map (T-549)', () => {
  // The defect this pins was a FALSE SILENCE, not a wrong number: doctor handed
  // the seam `{id: row}.values()`, so a ticket id present in two version dirs
  // collapsed to one entry and its genuine 2-dir span was never seen. A wrong
  // warning gets noticed; a missing one ships as "zero" in the instrument v1.8's
  // gated goal is measured with. Absent in all 8 real projects on 2026-09-01 —
  // latent, which is exactly why only a fixture can hold the line.
  test('one id `done` in two version dirs reports W2 with the span the dirs state', () => {
    // Same id, two dirs, by construction — deliberately NOT via span(), whose
    // per-dir fresh ids can never reproduce the collapse.
    ticket({ id: 'T-200', version: 'v1.1', feature: 'real-mech', status: 'done' })
    ticket({ id: 'T-200', version: 'v1.2', feature: 'real-mech', status: 'done' })
    const w = featureWarnings()
    expect(w).toContain(
      "feature: 'real-mech' — done tickets span 2 version dirs but docs/features/real-mech.md " +
      'does not exist — promotion candidate: apply the three tests (designer habit), then ' +
      'promote or record in .prdt/config.json features.non_features')
    expect(w).toHaveLength(1)
  })

  test('the SEAM does not invent the duplicate warning — the dedicated check owns it (T-551)', () => {
    // T-549 wrote this as "nothing in the whole run says `duplicate`", because at
    // the time nothing was supposed to, and a blanket assertion was the cheapest
    // way to stop this slice smuggling the answer in next to its own fix. T-551 is
    // the sanctioned opening of that lock, and it narrows the pin to the thing the
    // pin was actually protecting: the seam's subject is `feature:` and nothing
    // else, so the seam's OWN lines must still never mention a duplicate id.
    //
    // The two are kept distinct by channel, not by wording: this check filters the
    // `⚠ feature:` lines and requires silence there, then requires the warning to
    // exist exactly once on the `⚠ ticket:` channel that duplicate_ticket_id_warnings
    // owns. A future seam check that grew a duplicate-id line would satisfy neither
    // half — it would break the silence here AND double the count there.
    ticket({ id: 'T-200', version: 'v1.1', feature: 'real-mech', status: 'done' })
    ticket({ id: 'T-200', version: 'v1.2', feature: 'real-mech', status: 'done' })
    const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
      { cwd: projectRoot, encoding: 'utf8', env, timeout: 60000 })
    const lines = out.split('\n').filter(l => l.startsWith('⚠ '))
    expect(lines.filter(l => l.startsWith('⚠ feature:') && /duplicate/i.test(l))).toEqual([])
    expect(lines.filter(l => /^⚠ ticket: duplicate id T-200 /.test(l))).toHaveLength(1)
    // and the seam still says its own piece in the same run, unchanged by T-551
    expect(lines.filter(l => l.startsWith('⚠ feature:') && l.includes('promotion candidate')))
      .toHaveLength(1)
    expect(out).toContain('(non-blocking)')   // still exit 0 with both firing
  })

  test('the collapse does not silence the negative set either — a 1-dir dup stays silent', () => {
    // Same id twice in ONE dir is impossible (one file per name), so the shape
    // here is the near miss: two ids, one dir. T3 needs 2 dirs, not 2 tickets.
    ticket({ id: 'T-300', version: 'v1.1', feature: 'one-dir', status: 'done' })
    ticket({ id: 'T-301', version: 'v1.1', feature: 'one-dir', status: 'done' })
    expect(featureWarnings()).toEqual([])
  })
})

describe('the seam the discipline claims is the seam doctor watches', () => {
  const contracts = fs.readFileSync(CONTRACTS, 'utf-8')

  test('contracts stays at its 80-line cap', () => {
    expect(contracts.replace(/\n$/, '').split('\n').length).toBeLessThanOrEqual(80)
  })
})
