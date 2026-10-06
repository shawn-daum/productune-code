/**
 * prdt-question-check.sh — the PO's unticketed-question check at Stop (T-985,
 * enforcement point T-986 = B).
 *
 * WHY (docs/tickets/v1.13/T-985.md): POs ask the user to choose or confirm
 * without opening a `type: decision` ticket, so the answer never shows in the
 * statusline `dec` and gets lost. The rule was text only; this hook returns the
 * reply to the PO once, before the turn ends, when an ask has no ticket.
 *
 * FIXTURES are the PO's real replies of 2026-10-06 (test/fixtures/question-check/),
 * each run against the ticket store as it stood when the reply was sent:
 *   flagged   — the statusline two-row question (before T-984 existed),
 *               「이 기기에 설치할까요?」, 「T-949 를 정본으로 넣을까요?」 (+ two
 *               siblings of the same day: the install question's first form and
 *               the T-949 waiting-list item)
 *   compliant — replies presenting T-982 / T-984 / T-986 / T-987 / T-988 with
 *               options, and two report-only replies.
 * The block REASON wording is a placeholder pending the designer's inject-edit —
 * pinned here by property (tag + line numbers), never verbatim.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-question-check.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const FIXTURES = path.join(CORE_ROOT, 'test', 'fixtures', 'question-check')
const TAG = '[prdt question check]'

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

type Ticket = { type: string; status: string; assignee?: string }
type Store = Record<string, Ticket>

const DAY_AGO = (Date.now() - 86_400_000) / 1000

function makeProject(store: Store, opts: { prdt?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t985-'))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, 'docs', 'tickets', 'v1.13'), { recursive: true })
  if (opts.prdt !== false) {
    fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ stage: 'build', version: 'v1.13' }))
  }
  for (const [id, t] of Object.entries(store)) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, `---\nid: ${id}\ntype: ${t.type}\nstatus: ${t.status}\nassignee: ${t.assignee ?? 'po'}\n---\n\n## problem\n`)
    fs.utimesSync(p, DAY_AGO, DAY_AGO)
  }
  return { root, proj }
}

/** A transcript whose last user prompt opened the turn a minute ago. */
function writeTranscript(root: string, reply: string): string {
  const p = path.join(root, 'session.jsonl')
  const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
  const recs = [
    { type: 'user', isSidechain: false, timestamp: ts(3_600_000), message: { role: 'user', content: 'earlier prompt' } },
    { type: 'assistant', isSidechain: false, timestamp: ts(3_500_000), message: { content: [{ type: 'text', text: 'earlier reply?' }] } },
    { type: 'user', isSidechain: false, timestamp: ts(60_000), message: { role: 'user', content: [{ type: 'text', text: 'this turn' }] } },
    { type: 'assistant', isSidechain: false, timestamp: ts(50_000), message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } },
    { type: 'user', isSidechain: false, timestamp: ts(40_000), message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
    { type: 'assistant', isSidechain: false, timestamp: ts(1_000), message: { content: [{ type: 'text', text: reply }] } },
  ]
  fs.writeFileSync(p, recs.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

function runHook(event: Record<string, unknown>): string {
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', timeout: 20_000 })
}

function stop(store: Store, reply: string, extra: Record<string, unknown> = {}, opts: { prdt?: boolean } = {}) {
  const { root, proj } = makeProject(store, opts)
  const transcript_path = writeTranscript(root, reply)
  const out = runHook({
    session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
    cwd: proj, transcript_path, last_assistant_message: reply, ...extra,
  })
  return { out, proj, root }
}

function blockedLines(out: string): number[] {
  const j = JSON.parse(out)
  expect(j.decision).toBe('block')
  expect(j.reason.startsWith(TAG)).toBe(true)
  const m = /\(line ([\d, ]+)\)/.exec(j.reason)
  expect(m, j.reason).not.toBeNull()
  return (m as RegExpExecArray)[1].split(',').map(s => Number(s.trim()))
}

const fx = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.md`), 'utf8')

// Ticket stores as they stood when each reply was sent (2026-10-06).
const IMPL = (status = 'open'): Ticket => ({ type: 'impl', status })
const DEC = (status = 'open'): Ticket => ({ type: 'decision', status, assignee: 'user' })

describe('flagged — real ticketless asks of 2026-10-06', () => {
  const cases: Array<[string, Store, number[]]> = [
    // two questions in the 답 기다리는 것 list, no ticket cited; T-982 open elsewhere doesn't count
    ['flagged-statusline-two-rows', { 'T-975': IMPL(), 'T-982': DEC() }, [12, 13]],
    // the 「이 기기에 설치할까요?」 heading + two uncited waiting items; T-974 (open decision)
    // cited in the SAME list covers only its own item
    ['flagged-install-on-this-machine', { 'T-974': DEC(), 'T-479': IMPL('done') }, [22, 33, 35]],
    // 「정본으로 넣을까요?」 — T-949 is cited in the reply but is a design ticket
    ['flagged-t949-canon', { 'T-949': { type: 'design', status: 'open' } }, [26]],
    ['flagged-install-after-qa', { 'T-974': DEC(), 'T-479': IMPL(), 'T-938': IMPL() }, [29]],
    ['flagged-t949-waiting-item', { 'T-949': { type: 'design', status: 'open' }, 'T-960': IMPL(), 'T-975': IMPL() }, [24]],
  ]
  for (const [name, store, lines] of cases) {
    test(`${name} → blocked once, lines ${lines.join(',')}`, () => {
      const { out } = stop(store, fx(name))
      expect(blockedLines(out)).toEqual(lines)
    })
  }

  test('the reason never echoes the reply text', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'))
    expect(JSON.parse(out).reason).not.toContain('설치')
  })
})

describe('compliant — asks backed by an open decision ticket, and reports', () => {
  const cases: Array<[string, Store]> = [
    ['compliant-t982-options', { 'T-982': DEC(), 'T-961': IMPL() }],
    ['compliant-t984-options', { 'T-984': DEC(), 'T-960': IMPL(), 'T-961': IMPL() }],
    // quotes 「"이 기기에 설치할까요?"」 as a report of the miss — quoted asks are not asks
    ['compliant-t986-options-quoted-asks', { 'T-986': DEC(), 'T-985': IMPL(), 'T-984': DEC('done'), 'T-869': IMPL('done') }],
    ['compliant-t987-t988-options', { 'T-986': DEC(), 'T-987': DEC(), 'T-988': DEC(), 'T-961': IMPL() }],
    ['compliant-t987-t988-waiting', { 'T-986': DEC('done'), 'T-985': IMPL(), 'T-987': DEC(), 'T-988': DEC() }],
    // T-987 closed this reply; T-988 (open) carries the options and the closing pick question
    ['compliant-t988-examples', { 'T-987': DEC('done'), 'T-988': DEC(), 'T-949': { type: 'design', status: 'done' } }],
    ['compliant-t988-pick-imperative', { 'T-985': IMPL(), 'T-988': DEC() }],
    ['report-only', { 'T-988': DEC('done'), 'T-984': DEC('done'), 'T-961': IMPL() }],
    ['report-only-short', { 'T-960': IMPL(), 'T-961': IMPL() }],
  ]
  for (const [name, store] of cases) {
    test(`${name} → silent`, () => {
      expect(stop(store, fx(name)).out).toBe('')
    })
  }

  test('the same options reply is blocked once its ticket is no longer open — the citation is what covers it', () => {
    const { out } = stop({ 'T-984': DEC('done') }, fx('compliant-t984-options'))
    expect(blockedLines(out).length).toBeGreaterThan(0)
  })

  test('rhetorical and closing questions ask nothing to decide', () => {
    const reply = [
      '왜 이렇게 됐을까요? 원인은 캐시 파일이에요.',
      '',
      '- 테스트 2,820개 통과했어요.',
      '- 더 도와드릴 게 있을까요?',
      '- 기능 화면은 보시고 어떠셨어요?',
    ].join('\n')
    expect(stop({}, reply).out).toBe('')
  })

  test('an English choose question without a ticket is flagged', () => {
    const { out } = stop({}, 'Tests are green.\n\nShould I install it on this machine now?')
    expect(blockedLines(out)).toEqual([3])
  })
})

describe('gating', () => {
  const flagged = () => fx('flagged-t949-canon')
  const store: Store = { 'T-949': { type: 'design', status: 'open' } }

  test('second consecutive Stop (stop_hook_active) → never a second block', () => {
    expect(stop(store, flagged(), { stop_hook_active: true }).out).toBe('')
  })

  test('worker turns are never checked', () => {
    expect(stop(store, flagged(), { agent_type: 'prdt-developer' }).out).toBe('')
    expect(stop(store, flagged(), { agent_type: undefined }).out).toBe('')
  })

  test('a decision ticket created this turn → no block', () => {
    const { root, proj } = makeProject(store)
    fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.13', 'T-990.md'),
      '---\nid: T-990\ntype: decision\nstatus: open\nassignee: user\n---\n')
    const reply = flagged()
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    })
    expect(out).toBe('')
  })

  test('falls back to the transcript when the event has no last_assistant_message', () => {
    const { out } = stop(store, flagged(), { last_assistant_message: undefined })
    expect(blockedLines(out)).toEqual([26])
  })

  test('outside a prdt project, or with no readable transcript → silent (fails open)', () => {
    expect(stop(store, flagged(), {}, { prdt: false }).out).toBe('')
    expect(stop(store, flagged(), { transcript_path: '/nonexistent/x.jsonl' }).out).toBe('')
    expect(execFileSync('bash', [HOOK], { input: 'not json "prdt-po"', encoding: 'utf8' })).toBe('')
  })
})

test('hook-manifest registers it once, on Stop, matcher-less', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(m.basenames).toContain('prdt-question-check.sh')
  const regs = m.registrations.filter((r: { hooks: string[] }) => r.hooks.includes('prdt-question-check.sh'))
  expect(regs).toEqual([{ event: 'Stop', hooks: ['prdt-question-check.sh'] }])
})
