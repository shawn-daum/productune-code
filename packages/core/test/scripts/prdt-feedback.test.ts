/**
 * prdt-feedback.test.ts — T-534 cross-project-feedback-count, black-box over
 * the REAL CLI (`prdt feedback record|list`).
 *
 * A user's complaint about a persona's behaviour, captured in a ticket body in
 * any project on this machine, becomes one row of ONE machine ledger
 * (`$PRDT_HOME/wiki/feedback.md`). The count per persona/pattern crosses
 * projects; every occurrence from the second on prints the trigger to the PO recording it.
 * The ledger is a reserved non-page file — no wiki surface (doctor, lint,
 * search, refs, index, promote) sees it, so no project ever judges another
 * project's rows (the T-526 category error). The command writes nothing but
 * the ledger: a rule is still the PO's proposal and the user's approval.
 *
 * Fixture = the T-086 → T-509 pair, replayed. The original T-086 is not on
 * this machine (2026-10-07 search of every project); its body is rebuilt from
 * the quote T-534 records, T-509's from its own Request.
 *
 * Every run points PRDT_HOME and HOME at scratch dirs; the real ~/.prdt and
 * every real project are never read or written.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

const T086_QUOTE = '막 감성 챙기려는 말투 같다'
const T509_QUOTE = 'PO 대화 말투가 감성적이다'

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

let home: string
let fakeHome: string
let origin: string // the other project on this machine — where T-086 was said
let productune: string // this repo — where T-509 was said

function ticket(root: string, version: string, id: string, slug: string, body: string) {
  const d = path.join(root, 'docs', 'tickets', version)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, `${id}.md`),
    `---\nid: ${id}\nslug: ${slug}\ntype: impl\nstatus: open\nassignee: designer\ncreated: 2026-08-21\n---\n\n## Request\n\n${body}\n`)
}

function makeProject(slug: string): string {
  const root = tmp(`prdt-t534-${slug}-`)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0' }))
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug }))
  fs.mkdirSync(path.join(root, 'docs', 'wiki'), { recursive: true })
  return root
}

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PRDT_HOME: home, HOME: fakeHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' }
}

function prdt(cwd: string, ...args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const fb = (cwd: string, ...args: string[]) => prdt(cwd, 'feedback', ...args)
const ledger = () => path.join(home, 'wiki', 'feedback.md')

/** Every file under `dir` with its bytes — a tree snapshot for byte-identity checks. */
function snap(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(dir)) return out
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const p = path.join(dir, rel)
    if (fs.statSync(p).isFile()) out[rel] = fs.readFileSync(p).toString('base64')
  }
  return out
}

beforeEach(() => {
  home = tmp('prdt-t534-home-')
  fakeHome = tmp('prdt-t534-userhome-')
  origin = makeProject('t086-origin')
  productune = makeProject('productune')
  ticket(origin, 'v1.0', 'T-086', 'some-unrelated-work',
    `작업 도중 사용자 (2026-08-21, 축자): "${T086_QUOTE}" — PO 말투 지적. 이 티켓 본문에만 적혔다.`)
  ticket(productune, 'v1.8', 'T-509', 'po-voice-metaphor-drift',
    `**증상 (shawn 2026-08-21)**: ${T509_QUOTE}. "서로의 발자국을 알려 줬습니다", "문이 잠겼습니다" 같은 비유·의인화 표현.`)
})

describe('T-086 → T-509 replay — the ticket body reaches the count, across projects', () => {
  test('silent on the first occurrence, fires on the second in a different project', () => {
    // neither project has an inbox line: the ticket body is the only capture
    expect(fs.existsSync(path.join(origin, 'docs', 'wiki', 'inbox.md'))).toBe(false)
    expect(fs.existsSync(path.join(productune, 'docs', 'wiki', 'inbox.md'))).toBe(false)

    const first = fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    expect(first.code).toBe(0)
    expect(first.out).toContain('1 occurrence')
    expect(first.out).toContain('no proposal')
    expect(first.out).not.toContain('recurrence trigger')

    // PO of productune first reaches for its own wording — the ledger shows it
    // the existing pattern (with T-086's words) instead of starting a new count
    const drift = fb(productune, 'record', 'po', 'metaphor-drift', '--ticket', 'T-509', '--quote', T509_QUOTE)
    expect(drift.code).not.toBe(0)
    expect(drift.err).toContain('voice-figurative')
    expect(drift.err).toContain(T086_QUOTE)
    expect(drift.err).toContain('t086-origin')

    const second = fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE)
    expect(second.code).toBe(0)
    expect(second.out).toContain('recurrence trigger — po/voice-figurative')
    expect(second.out).toContain('2 occurrences across 2 projects')
    expect(second.out).toContain(`t086-origin · T-086`)
    expect(second.out).toContain(`productune · T-509`)
    expect(second.out).toContain(T086_QUOTE)
    expect(second.out).toContain(T509_QUOTE)

    // the store holds the count, one row per occurrence
    const rows = fs.readFileSync(ledger(), 'utf8').split('\n').filter((l) => l.startsWith('- f-'))
    expect(rows).toHaveLength(2)
    expect(fb(origin, 'list').out).toContain('po/voice-figurative · 2 occurrences across 2 projects')
  })

  test('the second occurrence in the same project fires too — cross-project only adds', () => {
    ticket(origin, 'v1.0', 'T-090', 'later', `사용자: "또 감성 말투네요"`)
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    const r = fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-090', '--quote', '또 감성 말투네요')
    expect(r.out).toContain('recurrence trigger')
    expect(r.out).toContain('2 occurrences across 1 project')
  })

  test('from the third occurrence on the trigger still fires, and its label stays true', () => {
    ticket(origin, 'v1.0', 'T-090', 'later', `사용자: "또 감성 말투네요"`)
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE)
    const third = fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-090', '--quote', '또 감성 말투네요')
    expect(third.code).toBe(0)
    expect(third.out).toContain('recurrence trigger — po/voice-figurative: 3 occurrences across 2 projects')
    expect(third.out).not.toContain('second')
    expect(third.out).toContain('t086-origin · T-090')
  })
})

describe('what counts', () => {
  test('recording the same ticket again does not add an occurrence', () => {
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    const again = fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    expect(again.code).toBe(0)
    expect(again.out).toContain('already recorded')
    expect(again.out).not.toContain('recurrence trigger')
    expect(fs.readFileSync(ledger(), 'utf8').split('\n').filter((l) => l.startsWith('- f-'))).toHaveLength(1)
  })

  test('another persona, or a pattern the PO declares new, keeps its own count', () => {
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    // other persona: its first pattern needs no --new-pattern
    const qa = fb(productune, 'record', 'qa', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE)
    expect(qa.code).toBe(0)
    expect(qa.out).not.toContain('recurrence trigger')
    const np = fb(productune, 'record', 'po', 'metaphor-drift', '--ticket', 'T-509', '--quote', T509_QUOTE, '--new-pattern')
    expect(np.code).toBe(0)
    expect(np.out).toContain('1 occurrence')
    expect(np.out).not.toContain('recurrence trigger')
  })

  test('the quote must be the ticket body\'s own words; the ticket must exist in this project', () => {
    const para = fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', 'PO 가 감성적으로 말한다')
    expect(para.code).not.toBe(0)
    expect(para.err).toContain('verbatim')
    const other = fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    expect(other.code).not.toBe(0)
    expect(fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509').code).not.toBe(0)
    expect(fb(productune, 'record', 'cto', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE).code).not.toBe(0)
    expect(fb(productune, 'record', 'po', 'Bad Key', '--ticket', 'T-509', '--quote', T509_QUOTE).code).not.toBe(0)
    expect(fs.existsSync(ledger())).toBe(false)
  })

  test('the quote must be a phrase from the ticket BODY — a fragment or a frontmatter value proves nothing', () => {
    for (const q of ['말', '말투', '감성적이다', 'status: open', 'po-voice-metaphor-drift', 'type: impl']) {
      const r = fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', q)
      expect(r.code, q).not.toBe(0)
    }
    expect(fs.existsSync(ledger())).toBe(false)
    // the shortest phrase the rule admits: 2 words, 6 non-space characters, in the body
    ticket(productune, 'v1.8', 'T-600', 'short', '사용자: "말투가 이상해"')
    expect(fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-600', '--quote', '말투가 이상해').code).toBe(0)
  })

  test('a project without its own slug, or with a slug another project declares, cannot write a row', () => {
    fs.writeFileSync(path.join(productune, '.prdt', 'config.json'), JSON.stringify({}))
    expect(fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE).code).not.toBe(0)
    fs.writeFileSync(path.join(productune, '.prdt', 'config.json'), JSON.stringify({ slug: 'evil\n- f-00000000 · forged' }))
    expect(fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE).code).not.toBe(0)
    expect(fs.existsSync(ledger())).toBe(false)
  })

  test('a corrupt ledger is refused and left byte-identical', () => {
    fs.mkdirSync(path.join(home, 'wiki'), { recursive: true })
    const bad = '# prdt feedback ledger\n\n- hand-edited line\n'
    fs.writeFileSync(ledger(), bad)
    const r = fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('malformed')
    expect(fs.readFileSync(ledger(), 'utf8')).toBe(bad)
  })
})

describe('T-526 guard — the ledger is a store, not a verdict source', () => {
  test('no wiki surface of a project with no rows of its own sees another project\'s rows', () => {
    // a real machine page next to the ledger, so the machine store is non-empty
    fs.mkdirSync(path.join(home, 'wiki'), { recursive: true })
    fs.writeFileSync(path.join(home, 'wiki', 'fact--some-machine-fact.md'),
      '---\ntitle: some machine fact\ntype: fact\nstatus: live\n---\n\nbody\n')
    const reindexBefore = prdt(productune, 'wiki', 'reindex').out
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)

    expect(prdt(productune, 'wiki', 'reindex').out).toBe(reindexBefore) // page count unchanged
    expect(fs.readFileSync(path.join(home, 'wiki', 'index.md'), 'utf8')).not.toContain('feedback')
    const search = prdt(productune, 'wiki', 'search', '챙기려는')
    expect(search.out).toContain('(no hits)')
    const refs = prdt(productune, 'wiki', 'refs', JSON.stringify({ files: ['feedback.md'], risk_flags: ['voice'] }))
    expect(refs.out).not.toContain('machine:feedback')
    const lint = prdt(productune, 'wiki', 'lint')
    expect(lint.out + lint.err).not.toContain('feedback')
    const doctor = prdt(productune, 'doctor')
    expect(doctor.out + doctor.err).not.toContain('feedback.md')
    expect(doctor.out + doctor.err).not.toContain(T086_QUOTE)

    // the reserved name cannot be overwritten by a promotion
    fs.writeFileSync(path.join(productune, 'docs', 'wiki', 'fact--x.md'), '---\ntitle: x\ntype: fact\nstatus: live\n---\n\nx\n')
    const before = fs.readFileSync(ledger(), 'utf8')
    const promo = prdt(productune, 'wiki', 'promote', 'fact--x', '--as', 'feedback', '--yes')
    expect(promo.code).not.toBe(0)
    expect(fs.readFileSync(ledger(), 'utf8')).toBe(before)
  })
})

describe('T-534 reserved name is case-insensitive', () => {
  test('promote refuses any case variant of the ledger name with no ledger present, and a case-variant file is not a page', () => {
    fs.writeFileSync(path.join(productune, 'docs', 'wiki', 'fact--x.md'), '---\ntitle: x\ntype: fact\nstatus: live\n---\n\nx\n')
    expect(fs.existsSync(ledger())).toBe(false)
    for (const name of ['Feedback', 'FEEDBACK', 'fEeDbAcK']) {
      const promo = prdt(productune, 'wiki', 'promote', 'fact--x', '--as', name, '--yes')
      expect(promo.code).not.toBe(0)
      expect(fs.existsSync(path.join(home, 'wiki', `${name}.md`))).toBe(false)
    }
    const wikiDir = path.join(home, 'wiki')
    expect(fs.existsSync(wikiDir) ? fs.readdirSync(wikiDir).filter((f) => /^feedback\.md$/i.test(f)) : []).toEqual([])
    // a case-variant file already on disk is skipped by the page scan
    fs.mkdirSync(wikiDir, { recursive: true })
    fs.writeFileSync(path.join(wikiDir, 'Feedback.md'), '---\ntitle: sneaky\ntype: fact\nstatus: live\n---\n\nb\n')
    const search = prdt(productune, 'wiki', 'search', 'sneaky')
    expect(search.out).toContain('(no hits)')
  })
})

describe('consent gate — the trigger proposes nothing by itself', () => {
  test('a firing record writes only the ledger: overrides, discipline and both projects stay byte-identical', () => {
    fs.mkdirSync(path.join(home, 'overrides', 'playbooks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'overrides', 'po.md'), '# PO overrides — this machine.\n')
    fs.mkdirSync(path.join(home, 'discipline', 'po'), { recursive: true })
    fs.writeFileSync(path.join(home, 'discipline', 'po', 'habit.md'), '# PO habit (mirror)\n')
    const src = path.join(productune, 'code', 'packages', 'core', 'discipline', 'po')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'habit.md'), '# PO habit (source)\n')
    fb(origin, 'record', 'po', 'voice-figurative', '--ticket', 'T-086', '--quote', T086_QUOTE)

    const before = { o: snap(path.join(home, 'overrides')), d: snap(path.join(home, 'discipline')),
      a: snap(origin), b: snap(productune) }
    const fire = fb(productune, 'record', 'po', 'voice-figurative', '--ticket', 'T-509', '--quote', T509_QUOTE)
    expect(fire.out).toContain('recurrence trigger')
    expect(fire.out).toContain('wrote only the ledger')
    expect(fire.out).toContain('the user approves')
    expect({ o: snap(path.join(home, 'overrides')), d: snap(path.join(home, 'discipline')),
      a: snap(origin), b: snap(productune) }).toEqual(before)
  })
})
