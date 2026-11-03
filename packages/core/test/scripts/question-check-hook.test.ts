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
import { test, expect, describe, afterEach, afterAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-question-check.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const FIXTURES = path.join(CORE_ROOT, 'test', 'fixtures', 'question-check')
const TAG = '[prdt question check]'

// T-1379 (T-1380 = D): which lines are asks is a MODEL judgment (`claude -p`). Tests
// stub it: a fake `claude` first on PATH answers the line numbers in QC_FAKE_ASKS
// (QC_FAKE_MODE=error|garbage → a failed judge), records each call in QC_FAKE_CALLS
// and its argv in QC_FAKE_ARGS. The judgment itself is evaluated outside the unit
// suite (T-1379 log: QA sentence sets + recorded-reply replay); here everything
// around it is pinned.
const FAKE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-fake-claude-'))
fs.writeFileSync(path.join(FAKE_DIR, 'claude'), [
  '#!/bin/bash',
  'cat >/dev/null',
  '[ -n "$QC_FAKE_CALLS" ] && echo call >> "$QC_FAKE_CALLS"',
  '[ -n "$QC_FAKE_ARGS" ] && printf \'%s\\n\' "$@" > "$QC_FAKE_ARGS"',
  'case "$QC_FAKE_MODE" in',
  '  error) echo \'{"type":"result","subtype":"success","is_error":true,"result":"Not logged in"}\'; exit 1;;',
  '  garbage) echo \'not json\'; exit 0;;',
  'esac',
  'printf \'{"type":"result","subtype":"success","is_error":false,"structured_output":{"asks":[%s]}}\\n\' "$QC_FAKE_ASKS"',
  '',
].join('\n'), { mode: 0o755 })
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-home-'))
afterAll(() => {
  fs.rmSync(FAKE_DIR, { recursive: true, force: true })
  fs.rmSync(FAKE_HOME, { recursive: true, force: true })
})
// T-1260: the hook is ON by default; `off` disables it. Behaviour tests pin it on explicitly.
const ON: NodeJS.ProcessEnv = {
  ...process.env, PRDT_QUESTION_CHECK: 'on', PATH: `${FAKE_DIR}:${process.env.PATH}`,
  PRDT_HOME: FAKE_HOME, QC_FAKE_ASKS: '', QC_FAKE_MODE: '',
}
/** env whose stubbed judge answers these (1-based) line numbers. */
const J = (lines: number[], base: NodeJS.ProcessEnv = ON): NodeJS.ProcessEnv => ({ ...base, QC_FAKE_ASKS: lines.join(',') })
/** Stub judgment for short inline replies: every line holding a `?` or 주세요. */
const QJ = (reply: string) => reply.split('\n').flatMap((l, k) => (/[?？]|주세요/.test(l) ? [k + 1] : []))

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

function runHook(event: Record<string, unknown>, env: NodeJS.ProcessEnv = ON): string {
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', timeout: 20_000, env })
}

function stop(store: Store, reply: string, extra: Record<string, unknown> = {}, opts: { prdt?: boolean } = {}, env: NodeJS.ProcessEnv = ON) {
  const { root, proj } = makeProject(store, opts)
  const transcript_path = writeTranscript(root, reply)
  const out = runHook({
    session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
    cwd: proj, transcript_path, last_assistant_message: reply, ...extra,
  }, env)
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
  // [fixture, store, judged ask lines, blocked lines]
  const cases: Array<[string, Store, number[], number[]]> = [
    // two questions in the 답 기다리는 것 list, no ticket cited; T-982 open elsewhere doesn't count
    ['flagged-statusline-two-rows', { 'T-975': IMPL(), 'T-982': DEC() }, [12, 13], [12, 13]],
    // the 「이 기기에 설치할까요?」 heading + two uncited waiting items; T-974 (open decision)
    // cited in the SAME list covers only its own item
    ['flagged-install-on-this-machine', { 'T-974': DEC(), 'T-479': IMPL('done') }, [22, 33, 34, 35], [22, 33, 35]],
    // 「정본으로 넣을까요?」 — T-949 is cited in the reply but is a design ticket
    ['flagged-t949-canon', { 'T-949': { type: 'design', status: 'open' } }, [26], [26]],
    ['flagged-install-after-qa', { 'T-974': DEC(), 'T-479': IMPL(), 'T-938': IMPL() }, [28, 29], [29]],
    ['flagged-t949-waiting-item', { 'T-949': { type: 'design', status: 'open' }, 'T-960': IMPL(), 'T-975': IMPL() }, [24], [24]],
  ]
  for (const [name, store, judged, lines] of cases) {
    test(`${name} → blocked once, lines ${lines.join(',')}`, () => {
      const { out } = stop(store, fx(name), {}, {}, J(judged))
      expect(blockedLines(out)).toEqual(lines)
    })
  }

  test('the reason never echoes the reply text', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'), {}, {}, J([22, 33, 34, 35]))
    expect(JSON.parse(out).reason).not.toContain('설치')
  })
})

describe('T-1116 — the language clause', () => {
  // HOME = sandbox: no macOS global-preferences plist; locale env empty → no device language
  const langEnv = (userLang?: string): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-lang-'))
    roots.push(home)
    if (userLang) fs.writeFileSync(path.join(home, 'user-lang'), userLang + '\n')
    return J([22, 33, 34, 35], { ...ON, HOME: home, PRDT_HOME: home, LC_ALL: '', LC_MESSAGES: '', LANG: 'C' })
  }
  test('a stored language names itself in the reason', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'), {}, {}, langEnv('ko'))
    const r = JSON.parse(out).reason
    expect(r).toContain('again in lang=ko, opening with')
    // T-1302: the re-send keeps every other line; a body up for approval keeps its numbers
    expect(r).toContain('every other line kept')
    expect(r).toContain('never the options alone')
  })
  test('no language known → the T-990 reason, no clause', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'), {}, {}, langEnv())
    const r = JSON.parse(out).reason
    expect(r).toContain('again, opening with')
    expect(r).toContain('every other line kept')
    expect(r).toContain('never the options alone')
    expect(r).not.toContain('lang=')
  })
  test('device language only (en-OS, nothing stored) → no clause (T-1281)', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'), {}, {}, { ...langEnv(), LANG: 'en_US.UTF-8' })
    expect(JSON.parse(out).reason).not.toContain('lang=')
  })
})

describe('compliant — asks backed by an open decision ticket, and reports', () => {
  // [fixture, store, judged ask lines]
  const cases: Array<[string, Store, number[]]> = [
    ['compliant-t982-options', { 'T-982': DEC(), 'T-961': IMPL() }, [28, 39]],
    ['compliant-t984-options', { 'T-984': DEC(), 'T-960': IMPL(), 'T-961': IMPL() }, [6, 26]],
    // quotes 「"이 기기에 설치할까요?"」 as a report of the miss — quoted asks are not asks
    ['compliant-t986-options-quoted-asks', { 'T-986': DEC(), 'T-985': IMPL(), 'T-984': DEC('done'), 'T-869': IMPL('done') }, [24, 42]],
    ['compliant-t987-t988-options', { 'T-986': DEC(), 'T-987': DEC(), 'T-988': DEC(), 'T-961': IMPL() }, [20, 36, 53, 54, 55]],
    ['compliant-t987-t988-waiting', { 'T-986': DEC('done'), 'T-985': IMPL(), 'T-987': DEC(), 'T-988': DEC() }, [22, 23]],
    // T-987 closed this reply; T-988 (open) carries the options and the closing pick question
    ['compliant-t988-examples', { 'T-987': DEC('done'), 'T-988': DEC(), 'T-949': { type: 'design', status: 'done' } }, [8, 55]],
    ['compliant-t988-pick-imperative', { 'T-985': IMPL(), 'T-988': DEC() }, [2]],
    ['report-only', { 'T-988': DEC('done'), 'T-984': DEC('done'), 'T-961': IMPL() }, []],
    ['report-only-short', { 'T-960': IMPL(), 'T-961': IMPL() }, []],
  ]
  for (const [name, store, judged] of cases) {
    test(`${name} → silent`, () => {
      expect(stop(store, fx(name), {}, {}, J(judged)).out).toBe('')
    })
  }

  test('the same options reply is blocked once its ticket is no longer open — the citation is what covers it', () => {
    const { out } = stop({ 'T-984': DEC('done') }, fx('compliant-t984-options'), {}, {}, J([6, 26]))
    expect(blockedLines(out).length).toBeGreaterThan(0)
  })

  test('an English ask the judge names, with no ticket → flagged', () => {
    const { out } = stop({}, 'Tests are green.\n\nShould I install it on this machine now?', {}, {}, J([3]))
    expect(blockedLines(out)).toEqual([3])
  })
})

describe('gating', () => {
  const flagged = () => fx('flagged-t949-canon')
  const store: Store = { 'T-949': { type: 'design', status: 'open' } }
  const G = J([26])

  test('default ON (T-1260): unset blocks; `off` alone disables', () => {
    const { root, proj } = makeProject(store)
    const event = JSON.stringify({
      session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, flagged()), last_assistant_message: flagged(),
    })
    const { PRDT_QUESTION_CHECK: _drop, ...bare } = G
    for (const env of [bare, { ...bare, PRDT_QUESTION_CHECK: 'on' }]) {
      expect(blockedLines(execFileSync('bash', [HOOK], { input: event, encoding: 'utf8', env }))).toEqual([26])
    }
    expect(execFileSync('bash', [HOOK], { input: event, encoding: 'utf8', env: { ...bare, PRDT_QUESTION_CHECK: 'off' } })).toBe('')
  })

  test('second consecutive Stop (stop_hook_active) → never a second block', () => {
    expect(stop(store, flagged(), { stop_hook_active: true }, {}, G).out).toBe('')
  })

  test('worker turns are never checked', () => {
    expect(stop(store, flagged(), { agent_type: 'prdt-developer' }, {}, G).out).toBe('')
    expect(stop(store, flagged(), { agent_type: undefined }, {}, G).out).toBe('')
  })

  test('a decision ticket created this turn → no block', () => {
    const { root, proj } = makeProject(store)
    fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.13', 'T-990.md'),
      '---\nid: T-990\ntype: decision\nstatus: open\nassignee: user\n---\n')
    const reply = flagged()
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, G)
    expect(out).toBe('')
  })

  test('falls back to the transcript when the event has no last_assistant_message', () => {
    const { out } = stop(store, flagged(), { last_assistant_message: undefined }, {}, G)
    expect(blockedLines(out)).toEqual([26])
  })

  test('outside a prdt project, or with no readable transcript → silent (fails open)', () => {
    expect(stop(store, flagged(), {}, { prdt: false }, G).out).toBe('')
    expect(stop(store, flagged(), { transcript_path: '/nonexistent/x.jsonl' }, {}, G).out).toBe('')
    expect(execFileSync('bash', [HOOK], { input: 'not json "prdt-po"', encoding: 'utf8', env: ON })).toBe('')
  })
})

describe('T-1379 — the model judge: who pays, how it fails, what is kept of its answer', () => {
  const ASK = '테스트 통과했어요.\n\n사용자가 볼 화면을 A 와 B 중 어느 쪽으로 할지 알려 주세요.'
  const logOf = (env: NodeJS.ProcessEnv) => {
    const p = path.join(env.PRDT_HOME as string, 'run', 'question-check.log')
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  }
  const fresh = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-judge-'))
    roots.push(home)
    return { ...ON, PRDT_HOME: home, QC_FAKE_CALLS: path.join(home, 'calls'), QC_FAKE_ARGS: path.join(home, 'args'), ...extra }
  }
  const calls = (env: NodeJS.ProcessEnv) =>
    fs.existsSync(env.QC_FAKE_CALLS as string) ? fs.readFileSync(env.QC_FAKE_CALLS as string, 'utf8').trim().split('\n').length : 0

  test('a PO Stop asks the judge once — no tools, no settings, no session record — and logs the outcome', () => {
    const env = fresh({ QC_FAKE_ASKS: '3' })
    expect(blockedLines(stop({}, ASK, {}, {}, env).out)).toEqual([3])
    expect(calls(env)).toBe(1)
    const args = fs.readFileSync(env.QC_FAKE_ARGS as string, 'utf8').split('\n')
    expect(args.slice(0, 3)).toEqual(['-p', '--model', 'haiku'])
    for (const f of ['--no-session-persistence', '--strict-mcp-config', '--json-schema', '--system-prompt']) expect(args).toContain(f)
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(logOf(env)).toMatch(/judge=ok asks=1 ms=\d+/)
  })

  test('worker and plain-session Stops never call the judge', () => {
    const env = fresh({ QC_FAKE_ASKS: '3' })
    expect(stop({}, ASK, { agent_type: 'prdt-developer' }, {}, env).out).toBe('')
    expect(stop({}, ASK, { agent_type: undefined }, {}, env).out).toBe('')
    expect(stop({}, ASK, { stop_hook_active: true }, {}, env).out).toBe('')
    expect(calls(env)).toBe(0)
  })

  test('a decision ticket changed this turn and no decision cited → nothing could block, no judge call', () => {
    const env = fresh({ QC_FAKE_ASKS: '3' })
    const { root, proj } = makeProject({})
    fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.13', 'T-990.md'), '---\nid: T-990\ntype: decision\nstatus: open\nassignee: user\n---\n')
    expect(runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, ASK), last_assistant_message: ASK,
    }, env)).toBe('')
    expect(calls(env)).toBe(0)
  })

  const failing: Array<[string, NodeJS.ProcessEnv, RegExp]> = [
    ['an error result (no auth)', { QC_FAKE_MODE: 'error', QC_FAKE_ASKS: '3' }, /judge=fail reason=error-result exit=1/],
    ['an unreadable answer', { QC_FAKE_MODE: 'garbage', QC_FAKE_ASKS: '3' }, /judge=fail reason=unreadable exit=0/],
    ['no claude CLI on PATH', { PATH: '/usr/bin:/bin', QC_FAKE_ASKS: '3' }, /judge=skip reason=no-claude-cli/],
  ]
  for (const [label, extra, line] of failing) {
    test(`${label} → fails open (no block), with a log line`, () => {
      const env = fresh(extra)
      expect(stop({}, ASK, {}, {}, env).out).toBe('')
      expect(logOf(env)).toMatch(line)
    })
  }

  test('judged lines out of range are ignored; none left → silent', () => {
    expect(stop({}, ASK, {}, {}, J([0, 99])).out).toBe('')
  })

  test('a judged line inside a code fence or a blockquote is dropped; a fenced option line is kept', () => {
    const reply = ['예시예요.', '```', '이 문구로 괜찮은지 알려 주세요.', '```', '> 진행할지 알려 주세요.', '', '```', 'A  초안대로 ← 추천', 'B  고쳐서', '```'].join('\n')
    expect(blockedLines(stop({}, reply, {}, {}, J([3, 5, 8])).out)).toEqual([8])
  })

  test('kind comes from structure: an option line or option-letter ask is covered by any open decision in the reply', () => {
    const reply = ['## 화면', '', '| 안 | 내용 |', '|---|---|', '| A. 탭바 | 시안대로 |', '| B. 지금 구조 | 작아요 |', '',
      '## 근거', '', 'T-301 에 올렸어요.'].join('\n')
    expect(stop({ 'T-301': DEC() }, reply, {}, {}, J([5])).out).toBe('')
    expect(blockedLines(stop({}, reply, {}, {}, J([5])).out)).toEqual([5])
  })

  test('a waiting item is covered by an open assignee:user ticket in its own item', () => {
    const reply = ['## 답 기다리는 것', '', '- T-302 배포 계정 만들어 주시기', '- 화면 문구 확인']
      .join('\n')
    expect(blockedLines(stop({ 'T-302': { type: 'impl', status: 'open', assignee: 'user' } }, reply, {}, {}, J([3, 4])).out)).toEqual([4])
  })
})

describe('fails open on unreadable inputs, never hangs', () => {
  const ask = '- [T-977] 이 기기에 설치할까요?'
  const A1 = J([1])

  test('a cited ticket that cannot be read → silent', () => {
    const { root, proj } = makeProject({ 'T-977': DEC() })
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', 'T-977.md')
    fs.chmodSync(p, 0o000)
    try {
      const out = runHook({
        hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
        cwd: proj, transcript_path: writeTranscript(root, ask), last_assistant_message: ask,
      }, A1)
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
    }, A1)
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
      }, A1)
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
    }, A1)
    expect(blockedLines(out)).toEqual([1])
  })
})

test('hook-manifest registers it once, on Stop, matcher-less', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(m.basenames).toContain('prdt-question-check.sh')
  const regs = m.registrations.filter((r: { hooks: string[] }) => r.hooks.includes('prdt-question-check.sh'))
  expect(regs).toEqual([{ event: 'Stop', hooks: ['prdt-question-check.sh'] }])
})

describe('T-1285 — a recorded decision cited beside an ask is a re-ask (T-1313 = A)', () => {
  // The re-ask check reads the record through the real `prdt decisions find`.
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const env = (): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-reask-'))
    roots.push(home)
    return { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT }
  }
  function record(proj: string, id: string, o: { status?: string; outcome?: string; log?: string; ago?: number } = {}) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, ['---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, 'type: decision', `status: ${o.status ?? 'done'}`,
      'assignee: user', 'created: 2026-10-27', '---', '', '## problem', '', '- 다시 묻기 막는 방식', '',
      '## outcome', '', o.outcome ?? 'A (hook 이 막음) — 사용자 「A」', '', '## log', '', o.log ?? '', ''].join('\n'))
    const t = o.ago === undefined ? DAY_AGO : (Date.now() - o.ago) / 1000
    fs.utimesSync(p, t, t)
  }
  function run(setup: (proj: string) => void, reply: string, e: NodeJS.ProcessEnv = env()) {
    const { root, proj } = makeProject({})
    setup(proj)
    return runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, J(QJ(reply), e))
  }
  // observation (4) of T-1239: the PO cites the record, opens a NEW decision ticket and asks A/B again
  const REASK_REPLY = [
    '진행 상황이에요.',
    '',
    '## 다시 묻기 막는 방식',
    '',
    'T-1313 에 기록이 있어요. T-1400 으로 다시 여쭤요.',
    '',
    '| 안 | 내용 | 추천 |',
    '|---|---|---|',
    '| A | hook 이 막음 | ← |',
    '| B | 규율 문구 | |',
    '',
    '어느 쪽으로 할까요?',
  ].join('\n')
  const newTicket = (proj: string) => record(proj, 'T-1400', { status: 'open', outcome: '', ago: 1_000 })

  test('cites a recorded (done, answered) decision beside the options + a new decision ticket this turn → blocked, citing the record', () => {
    const out = run((p) => { record(p, 'T-1313'); newTicket(p) }, REASK_REPLY)
    const j = JSON.parse(out)
    expect(j.decision).toBe('block')
    expect(j.reason.startsWith(REASK)).toBe(true)
    expect(j.reason).toContain('T-1313')
    expect(j.reason).toMatch(/\(line [\d, ]+\)/)
    expect(j.reason).not.toContain('hook 이 막음') // never echoes the reply
  })

  test('T-1365 = A — the reason is the approved To-Be wording, byte for byte', () => {
    // docs/productune/artifacts/v1.16/lane-records-build-entry-step.md §B To-Be (467 B)
    const TO_BE = '[prdt re-ask check] this reply asks the user (line %s) beside a decision already answered: %s (answer: `prdt decisions find <id>`). Act on the recorded answer and cite it, never ask it again; a decision ticket opened this turn for that ask → `dropped` naming the record. Keep the ask only when the record is stale or conflicting, its state changed, or a consent gate needs live words — say which beside the ask. Then send the reply again%s, every other line kept.'
    expect(Buffer.byteLength(TO_BE)).toBe(467)
    const reason = JSON.parse(run((p) => { record(p, 'T-1313'); newTicket(p) }, REASK_REPLY)).reason as string
    const lines = (/\(line ([\d, ]+)\)/.exec(reason) as RegExpExecArray)[1]
    const parts = [lines, 'T-1313', '']
    expect(reason).toBe(TO_BE.replace(/%s/g, () => parts.shift() as string))
  })

  test('the per-product id form (T-1298) is a citable record too', () => {
    const reply = REASK_REPLY.replace('T-1313', 'T-PRDT-7')
    const out = run((p) => { record(p, 'T-PRDT-7'); newTicket(p) }, reply)
    expect(JSON.parse(out).reason).toContain('T-PRDT-7')
  })

  test('the record cited with no ask (PO acts on it) → silent', () => {
    const reply = '## 다시 묻기 막는 방식\n\nT-1313 에 기록된 대로 A 로 진행해요. hook 을 고치고 있어요.'
    expect(run((p) => record(p, 'T-1313'), reply)).toBe('')
  })

  test('the cited decision is still open (no answer yet) → not a re-ask', () => {
    expect(run((p) => { record(p, 'T-1313', { status: 'open', outcome: '' }); newTicket(p) }, REASK_REPLY)).toBe('')
  })

  test('a done decision whose outcome is empty key headings only → not a recorded answer', () => {
    expect(run((p) => { record(p, 'T-1313', { outcome: '### why\n\n### what\n' }); newTicket(p) }, REASK_REPLY)).toBe('')
  })

  test('a reversed record → not a re-ask', () => {
    expect(run((p) => { record(p, 'T-1313', { log: '- 2026-10-28 T-1399 가 이 결정을 뒤집음' }); newTicket(p) }, REASK_REPLY)).toBe('')
  })

  test('a decision closed THIS turn (just answered) → not a re-ask', () => {
    expect(run((p) => { record(p, 'T-1313', { ago: 1_000 }); newTicket(p) }, REASK_REPLY)).toBe('')
  })

  test('the record cited in another section than the ask → not a re-ask', () => {
    const reply = ['## 기록', '', '- T-1313 = A 로 정해져 있어요.', '', '## 새 질문', '', '배포를 오늘 할지 T-1400 에 올렸어요.', '',
      '| 안 | 내용 | 추천 |', '|---|---|---|', '| A | 오늘 | ← |', '| B | 내일 | |', '', '어느 쪽으로 할까요?'].join('\n')
    expect(run((p) => { record(p, 'T-1313'); newTicket(p) }, reply)).toBe('')
  })

  test('a waiting item or plain question citing the record in its own item → blocked', () => {
    const reply = ['## 답 기다리는 것', '', '- T-1313 다시 묻기 막는 방식, hook 으로 할까요?'].join('\n')
    const out = run((p) => record(p, 'T-1313'), reply)
    expect(JSON.parse(out).reason.startsWith(REASK)).toBe(true)
  })

  test('no prdt CLI reachable → the re-ask check fails open (the new ticket still exempts the turn)', () => {
    const e = { ...env(), PRDT_BIN: '/nonexistent/prdt', PATH: `${FAKE_DIR}:/usr/bin:/bin` }
    expect(run((p) => { record(p, 'T-1313'); newTicket(p) }, REASK_REPLY, e)).toBe('')
  })

  test('second Stop (stop_hook_active) → never a second block', () => {
    const { root, proj } = makeProject({})
    record(proj, 'T-1313'); newTicket(proj)
    expect(runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: true,
      cwd: proj, transcript_path: writeTranscript(root, REASK_REPLY), last_assistant_message: REASK_REPLY,
    }, env())).toBe('')
  })
})

describe('T-1364 = C (threshold 4) — asks over 4+ open decisions in one reply block once', () => {
  const BATCH = '[prdt batch-ask check]'
  const store = (n: number): Store => Object.fromEntries(Array.from({ length: n }, (_, k) => [`T-20${k + 1}`, DEC()]))
  const sb = (st: Store, reply: string, extra: Record<string, unknown> = {}) => stop(st, reply, extra, {}, J(QJ(reply)))
  const waiting = (ids: string[]) => ['## 답 기다리는 것', '', ...ids.map(id => `- ${id} 이 항목, A 로 할까요?`)].join('\n')

  test('4 open decisions, each with its own ask → blocked once, naming the count', () => {
    const { out } = sb(store(4), waiting(['T-201', 'T-202', 'T-203', 'T-204']))
    const j = JSON.parse(out)
    expect(j.decision).toBe('block')
    expect(j.reason.startsWith(BATCH)).toBe(true)
    expect(j.reason).toContain('4 open decisions')
    expect(j.reason).not.toContain('이 항목') // never echoes the reply
  })

  test('5 asks over the same 4 ids count 4 distinct ids → still one block', () => {
    const reply = waiting(['T-201', 'T-202', 'T-203', 'T-204', 'T-201'])
    expect(JSON.parse(sb(store(4), reply).out).reason).toContain('4 open decisions')
  })

  test('3 open decisions with asks → no block from this check (all covered → silent)', () => {
    expect(sb(store(3), waiting(['T-201', 'T-202', 'T-203'])).out).toBe('')
  })

  test('3 asked + a 4th open decision only cited, with no ask beside it → not counted', () => {
    const reply = waiting(['T-201', 'T-202', 'T-203']) + '\n\n## 진행 중\n\nT-204 는 기록만 해 두었어요.'
    expect(sb(store(4), reply).out).toBe('')
  })

  test('done or non-decision tickets beside the asks are not open decisions → not counted', () => {
    const s: Store = { ...store(3), 'T-204': IMPL() }
    expect(sb(s, waiting(['T-201', 'T-202', 'T-203', 'T-204'])).out).not.toContain(BATCH)
  })

  test('decision tickets opened this turn do not exempt the batch', () => {
    const { root, proj } = makeProject(store(4))
    const now = Date.now() / 1000
    fs.utimesSync(path.join(proj, 'docs', 'tickets', 'v1.13', 'T-201.md'), now, now)
    const reply = waiting(['T-201', 'T-202', 'T-203', 'T-204'])
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, J(QJ(reply)))
    expect(JSON.parse(out).reason.startsWith(BATCH)).toBe(true)
  })

  test('second Stop (stop_hook_active) → never a second block', () => {
    const reply = waiting(['T-201', 'T-202', 'T-203', 'T-204'])
    expect(sb(store(4), reply, { stop_hook_active: true }).out).toBe('')
  })
})

describe('T-1377 — L1 replays: re-ask only on the recorded decision itself, never hiding batch-ask or question check', () => {
  // Verbatim first replies of docs/productune/artifacts/v1.16/decision-approval-observation.md
  // (1) r1 / r1b, (2) r2, (3) r3, against the scratch project `memo` as it stood:
  // T-001 `theme-follows-system` done + answered a day before; r2 opened T-002~T-011 that turn.
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const BATCH = '[prdt batch-ask check]'
  const env = (): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-l1-'))
    roots.push(home)
    return { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT }
  }
  function decision(proj: string, id: string, slug: string, status: string, outcome: string, ago: number) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, ['---', `id: ${id}`, `slug: ${slug}`, 'type: decision', `status: ${status}`, 'assignee: user',
      'created: 2026-11-01', '---', '', '## problem', '', `- ${slug}`, '', '## outcome', '', outcome, '', '## log', '', ''].join('\n'))
    const t = (Date.now() - ago) / 1000
    fs.utimesSync(p, t, t)
  }
  const T001 = (proj: string) => decision(proj, 'T-001', 'theme-follows-system', 'done',
    '폰 설정을 따른다 — 사용자 「처음부터 아무것도 안 만지고 쓰게 하고 싶어. 설정 화면 늘어나는 거 싫다. 어두운 건 폰 설정 따라가면 돼」', 86_400_000)
  const R2_OPENED = ['T-002', 'T-003', 'T-004', 'T-005', 'T-006', 'T-007', 'T-008', 'T-009', 'T-010', 'T-011']
  // the asks of each fixture, as the judge is stubbed to name them
  const FX_ASKS: Record<string, number[]> = {
    'reask-r1': [5], 'reask-r1b': [3], 'batch-r2': [4, 8, 12, 17, 22, 26, 30, 35, 40, 45], 'approval-r3': [13],
  }
  function replay(name: string, setup: (proj: string) => void) {
    const reply = fx(name)
    const { root, proj } = makeProject({})
    setup(proj)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, J(FX_ASKS[name], env()))
    return out ? (JSON.parse(out).reason as string) : ''
  }

  test('(1) r1 — a true re-ask of T-001 → re-ask block naming T-001', () => {
    const reason = replay('reask-r1', T001)
    expect(reason.startsWith(REASK)).toBe(true)
    expect(reason).toContain('T-001')
    expect(reason).not.toContain(TAG)
  })

  test('(1) r1b — a true re-ask of T-001 → re-ask block naming T-001', () => {
    const reason = replay('reask-r1b', T001)
    expect(reason.startsWith(REASK)).toBe(true)
    expect(reason).toContain('T-001')
  })

  test('(2) r2 — 10 open decisions asked, T-001 cited as a reason → batch-ask block, no re-ask block', () => {
    const reason = replay('batch-r2', (p) => {
      T001(p)
      for (const id of R2_OPENED) decision(p, id, `memo-${id.toLowerCase()}`, 'open', '', 1_000)
    })
    expect(reason).not.toContain(REASK)
    expect(reason.startsWith(BATCH)).toBe(true)
    expect(reason).toContain('10 open decisions')
  })

  test('(3) r3 — approval of a release-note body with no decision ticket, T-001 cited as a source → question check, no re-ask block', () => {
    const reason = replay('approval-r3', T001)
    expect(reason).not.toContain(REASK)
    expect(reason.startsWith(TAG)).toBe(true)
  })

  test('several checks applying in one Stop → the reason carries each, none dropped', () => {
    // r1's re-ask of T-001 + r3's ticketless approval in one reply, in separate sections
    const head = fx('reask-r1') + '\n## 릴리스 노트\n\n'
    const reply = head + fx('approval-r3')
    const off = head.split('\n').length - 1
    const { root, proj } = makeProject({})
    T001(proj)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, J([5, off + 13], env()))
    const both = JSON.parse(out).reason as string
    expect(both.startsWith(REASK)).toBe(true)
    expect(both).toContain('\n\n' + TAG)
    expect(both).toContain('T-001')
  })

  // QA grill d-v116-t1377-qa1 (4): T-001 done a day ago, T-012 opened this turn
  function inline(reply: string, withT012: boolean) {
    const { root, proj } = makeProject({})
    T001(proj)
    if (withT012) decision(proj, 'T-012', 'in-app-theme-toggle', 'open', '', 1_000)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, J(QJ(reply), env()))
    return out ? (JSON.parse(out).reason as string) : ''
  }
  const DECIDED = '다크모드는 T-001 에서 폰 설정을 따르기로 정하셨어요.'
  const DRAFT = ['```', '설정 > 화면 테마: 시스템 따라가기 / 밝게 / 어둡게', '```']
  const cases: [string, string, boolean][] = [
    ['d — a new ticket named on the ask line', [DECIDED, '', '앱 안 토글을 둘지 다시 골라 주세요 (T-012).'].join('\n'), true],
    ['d2 — a new ticket heading the ask line', [DECIDED, '', 'T-012: 앱 안 토글을 둘까요?'].join('\n'), true],
    ['c3 — a fenced draft re-deciding T-001, approval naming the new ticket',
      [DECIDED, '', ...DRAFT, '', '이 초안(T-012)대로 앱 안 테마 설정을 넣는 걸 승인해 주실까요?'].join('\n'), true],
    ['c — a fenced draft re-deciding T-001, approval with no new id',
      [DECIDED, '', ...DRAFT, '', '이 초안대로 앱 안 테마 설정을 넣는 걸 승인해 주실까요?'].join('\n'), false],
    ['c2 — the same, an imperative approval', [DECIDED, '', ...DRAFT, '', '이 초안대로 넣어도 되는지 승인해 주세요.'].join('\n'), false],
  ]
  for (const [label, reply, withT012] of cases) {
    test(`${label} → re-ask on T-001 only`, () => {
      const reason = inline(reply, withT012)
      expect(reason.startsWith(REASK)).toBe(true)
      expect(reason).toContain('T-001')
      expect(reason).not.toContain(TAG)
    })
  }

  test('re-ask and question check on the same decision in one section → re-ask only', () => {
    const reply = ['## 화면 테마', '', DECIDED, '', '- 앱 안 토글, 이번에 넣을까요?', '', '이대로 갈까요, 아니면 바꿀까요?'].join('\n')
    const reason = inline(reply, false)
    expect(reason.startsWith(REASK)).toBe(true)
    expect(reason).not.toContain(TAG)
  })
})
