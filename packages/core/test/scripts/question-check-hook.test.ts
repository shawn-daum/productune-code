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
 * Which questions are asks is T-993 = B: choose, yes/no confirm and read-back
 * confirm need a ticket; offers, information requests and feedback/closing
 * questions do not. The block REASON is the user-confirmed wording (T-990 = A),
 * pinned here by property (tag + line numbers), never verbatim.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-question-check.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const FIXTURES = path.join(CORE_ROOT, 'test', 'fixtures', 'question-check')
const TAG = '[prdt question check]'
// T-1001 = B: the hook ships OFF; every behaviour test below runs it switched on.
const ON = { ...process.env, PRDT_QUESTION_CHECK: 'on' }

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
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', timeout: 20_000, env: ON })
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

  test('default OFF (T-1001 = B): unset, or any value but `on` → a flagged reply passes silently', () => {
    const { root, proj } = makeProject(store)
    const event = JSON.stringify({
      session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, flagged()), last_assistant_message: flagged(),
    })
    const { PRDT_QUESTION_CHECK: _drop, ...bare } = process.env
    for (const env of [bare, { ...bare, PRDT_QUESTION_CHECK: 'off' }, { ...bare, PRDT_QUESTION_CHECK: '1' }]) {
      expect(execFileSync('bash', [HOOK], { input: event, encoding: 'utf8', env })).toBe('')
    }
    // same event, switched on → blocked (the fixture is a real flagged ask)
    expect(blockedLines(execFileSync('bash', [HOOK], { input: event, encoding: 'utf8', env: ON }))).toEqual([26])
  })

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
    expect(execFileSync('bash', [HOOK], { input: 'not json "prdt-po"', encoding: 'utf8', env: ON })).toBe('')
  })
})

describe('T-993 = B — which questions are asks', () => {
  const blocked: Array<[string, string]> = [
    ['read-back confirm', '상태줄을 두 줄로 나누는 걸로 이해했는데 맞나요?'],
    ['yes/no confirm', '테스트 통과했어요. 이 기기에 설치할까요?'],
    ['permission confirm', '운영 DB에 이 값으로 써도 되나요?'],
    ['either/or with a request ending', '이대로 쓸까요, 아니면 션님 문장으로 주시겠어요?'],
    ['English choice', 'Do you want the two-row layout or the single row?'],
    ['English which-should', 'Which one should we start with?'],
    ['English shall-we mid-sentence', 'Tests are green, so shall we ship it today?'],
    ['English read-back', 'You want the empty row hidden. Is that right?'],
  ]
  for (const [label, reply] of blocked) {
    test(`${label} → blocked`, () => {
      expect(blockedLines(stop({}, reply).out)).toEqual([1])
    })
  }

  const silent: Array<[string, string]> = [
    ['offer', '목업을 만들었어요. 뷰어를 열어 드릴까요?'],
    ['offer, informal', '요청 문장을 써 드릴까?'],
    ['information request', '로그에 찍힌 에러 줄을 붙여 주시겠어요?'],
    ['information request (can you)', '임시 채널 ID를 알려 주실 수 있을까요?'],
    ['fact question', '리뷰 수집은 구글만 되나요?'],
    ['English fact question with or', 'Is the bucket in dev or only in prd?'],
    ['English which-fact', 'Which version are you running?'],
    ['English offer', 'Would you like me to open the viewer?'],
    ['feedback', '화면 보시고 어떠셨어요?'],
  ]
  for (const [label, reply] of silent) {
    test(`${label} → silent`, () => {
      expect(stop({}, reply).out).toBe('')
    })
  }
})

describe('option sets — only a laid-out choice counts', () => {
  test('an A/B/C-keyed status table with no recommendation or option marker → silent', () => {
    const reply = [
      '**게이트 2 현황**', '',
      '| 갈래 | 상태 |', '|---|---|',
      '| **A 분류기** | A1 · A2 · A3 전부 실측 |',
      '| **B 판정** | 비어 있음 — 세션 대기 |',
      '| **C 실행 가능성** | iOS · Android 둘 다 통과 |', '',
      'B만 남았어요. 결과가 나오면 바로 세션 열게요.',
    ].join('\n')
    expect(stop({}, reply).out).toBe('')
  })

  test('arrow diagram lines and a mermaid fence are not options', () => {
    const reply = [
      '흐름은 이래요. 추천 경로는 위쪽이에요.', '',
      'A --> B', 'B -> C', '',
      '```mermaid', 'graph TD', 'A[시작] --> B[끝]', 'A', 'B', '```', '',
      '끝났어요.',
    ].join('\n')
    expect(stop({}, reply).out).toBe('')
  })

  test('the same table with a recommendation beside it is an option set → blocked', () => {
    const reply = [
      '| 안 | 내용 |', '|---|---|',
      '| A. 탭바 + my 화면 | 시안대로 |',
      '| B. 지금 구조에서 처리 | 작아요 |', '',
      'B를 추천해요.',
    ].join('\n')
    expect(blockedLines(stop({}, reply).out)).toEqual([3])
  })
})

describe('fails open on unreadable inputs, never hangs', () => {
  const ask = '- [T-977] 이 기기에 설치할까요?'

  test('a cited ticket that cannot be read → silent', () => {
    const { root, proj } = makeProject({ 'T-977': DEC() })
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', 'T-977.md')
    fs.chmodSync(p, 0o000)
    try {
      const out = runHook({
        hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
        cwd: proj, transcript_path: writeTranscript(root, ask), last_assistant_message: ask,
      })
      expect(out).toBe('')
    } finally {
      fs.chmodSync(p, 0o644)
    }
  })

  test('a cited ticket that is a FIFO → silent, and the hook returns', () => {
    const { root, proj } = makeProject({})
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', 'T-977.md')
    expect(spawnSync('mkfifo', [p]).status).toBe(0)
    const t0 = Date.now()
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, ask), last_assistant_message: ask,
    })
    expect(out).toBe('')
    expect(Date.now() - t0).toBeLessThan(10_000)
  })

  test('a tickets dir that cannot be listed → silent', () => {
    const { root, proj } = makeProject({})
    const dir = path.join(proj, 'docs', 'tickets')
    fs.chmodSync(dir, 0o000)
    try {
      const out = runHook({
        hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
        cwd: proj, transcript_path: writeTranscript(root, ask), last_assistant_message: ask,
      })
      expect(out).toBe('')
    } finally {
      fs.chmodSync(dir, 0o755)
    }
  })

  test('more than the scan budget after the turn prompt → the last message is still checked', () => {
    const { root, proj } = makeProject({})
    const reply = '테스트 통과했어요. 이 기기에 설치할까요?'
    const p = writeTranscript(root, reply)
    const recs = fs.readFileSync(p, 'utf8').trimEnd().split('\n')
    const last = recs.pop() as string
    const filler = JSON.stringify({
      type: 'user', isSidechain: false, timestamp: new Date(Date.now() - 30_000).toISOString(),
      message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'x'.repeat(64 * 1024) }] },
    })
    const bulk = Array.from({ length: 150 }, () => filler) // ~9.8 MB, past TAIL_MAX
    fs.writeFileSync(p, [...recs, ...bulk, last].join('\n') + '\n')
    expect(fs.statSync(p).size).toBeGreaterThan(9 * 1024 * 1024)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: p, last_assistant_message: reply,
    })
    expect(blockedLines(out)).toEqual([1])
  })
})

test('hook-manifest registers it once, on Stop, matcher-less', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(m.basenames).toContain('prdt-question-check.sh')
  const regs = m.registrations.filter((r: { hooks: string[] }) => r.hooks.includes('prdt-question-check.sh'))
  expect(regs).toEqual([{ event: 'Stop', hooks: ['prdt-question-check.sh'] }])
})
