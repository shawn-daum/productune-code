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
 * Which questions are asks is T-993 = B, narrowed by T-1465: choose, approve (a body, or
 * an action needing consent) and read-back confirm need a ticket; proceed-confirms (only
 * whether the assistant starts its own next step), offers, information requests and
 * feedback/closing questions do not. The block REASON is the user-confirmed wording (T-990 = A),
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
// (QC_FAKE_MODE=error|garbage → a failed judge) and the re-asks in QC_FAKE_REASKS (a JSON
// array of {line, id}, T-1470), records each call in QC_FAKE_CALLS, its argv in
// QC_FAKE_ARGS and its stdin in QC_FAKE_INPUT. The judgment itself is evaluated outside
// the unit suite (T-1379 log: QA sentence sets + recorded-reply replay; T-1470: the
// QC_REAL_JUDGE=1 replay below); here everything around it is pinned.
const FAKE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-fake-claude-'))
fs.writeFileSync(path.join(FAKE_DIR, 'claude'), [
  '#!/bin/bash',
  'if [ -n "$QC_FAKE_INPUT" ]; then cat > "$QC_FAKE_INPUT"; else cat >/dev/null; fi',
  '[ -n "$QC_FAKE_CALLS" ] && echo call >> "$QC_FAKE_CALLS"',
  '[ -n "$QC_FAKE_ARGS" ] && printf \'%s\\n\' "$@" > "$QC_FAKE_ARGS"',
  '[ -n "$QC_FAKE_WHERE" ] && { echo "cmux=$CMUX_CLAUDE_HOOKS_DISABLED"; echo "cwd=$PWD"; echo "entries=$(ls -A | wc -l | tr -d \' \')"; } > "$QC_FAKE_WHERE"',
  'case "$QC_FAKE_MODE" in',
  '  error) echo \'{"type":"result","subtype":"success","is_error":true,"result":"Not logged in"}\'; exit 1;;',
  '  garbage) echo \'not json\'; exit 0;;',
  'esac',
  'printf \'{"type":"result","subtype":"success","is_error":false,"structured_output":{"asks":[%s],"reasks":%s}}\\n\' "$QC_FAKE_ASKS" "${QC_FAKE_REASKS:-[]}"',
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
  PRDT_HOME: FAKE_HOME, QC_FAKE_ASKS: '', QC_FAKE_MODE: '', QC_FAKE_REASKS: '',
}
/** env whose stubbed judge answers these (1-based) line numbers. */
const J = (lines: number[], base: NodeJS.ProcessEnv = ON): NodeJS.ProcessEnv => ({ ...base, QC_FAKE_ASKS: lines.join(',') })
/** env whose stubbed judge also names these (1-based line, decision id) re-asks (T-1470). */
const RA = (pairs: Array<[number, string]>, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  ({ ...base, QC_FAKE_REASKS: JSON.stringify(pairs.map(([line, id]) => ({ line, id }))) })
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
  const m = /^\[prdt question check\] line ([\d, ]+(?:, \+\d+ more)?) asks/.exec(j.reason)
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
    // T-1390 (T-1425 = A): the language rides the one Stop closing line, the sent reply stays
    expect(r.endsWith('\nThe sent reply stays: send only the fix in lang=ko, never the reply again.')).toBe(true)
    expect(r).toContain('a body to confirm goes in it, numbered')
  })
  test('no language known → the T-990 reason, no clause', () => {
    const { out } = stop({ 'T-974': DEC() }, fx('flagged-install-on-this-machine'), {}, {}, langEnv())
    const r = JSON.parse(out).reason
    expect(r.endsWith('\nThe sent reply stays: send only the fix, never the reply again.')).toBe(true)
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
    expect(logOf(env)).toMatch(/judge=ok asks=1 tries=1 ms=\d+/)
  })

  test('T-1465 — the judge prompt keeps the proceed-confirm / consent boundary and the cited-decision rule', () => {
    const env = fresh({ QC_FAKE_ASKS: '3' })
    stop({}, ASK, {}, {}, env)
    const args = fs.readFileSync(env.QC_FAKE_ARGS as string, 'utf8')
    const prompt = args.slice(args.indexOf('You check one chat reply'))
    expect(prompt).toContain('proceed-confirm')
    expect(prompt).toContain('지금 v1.17 Define을 시작할까요?')
    expect(prompt).toContain('T-1362 는 다시 묻지 않아요')
    expect(prompt).toContain('설치할까요?') // still listed as an ask
    expect(prompt).toMatch(/still an ask when it offers alternatives[^]*install, push, deploy, destructive git/)
    expect(prompt).not.toContain('say whether to go ahead')
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
    ['an error result (no auth), tried twice', { QC_FAKE_MODE: 'error', QC_FAKE_ASKS: '3' }, /judge=fail reason=error-result .*exit=1 tries=2/],
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

  test('an error result is retried once, never more; an unreadable answer is not retried', () => {
    const e1 = fresh({ QC_FAKE_MODE: 'error', QC_FAKE_ASKS: '3' })
    stop({}, ASK, {}, {}, e1)
    expect(calls(e1)).toBe(2)
    const e2 = fresh({ QC_FAKE_MODE: 'garbage', QC_FAKE_ASKS: '3' })
    stop({}, ASK, {}, {}, e2)
    expect(calls(e2)).toBe(1)
  })

  test('the judge runs from an empty dir, removed after, with cmux hooks off', () => {
    const env = fresh({ QC_FAKE_ASKS: '3' })
    env.QC_FAKE_WHERE = path.join(env.PRDT_HOME as string, 'where')
    stop({}, ASK, {}, {}, env)
    const w = fs.readFileSync(env.QC_FAKE_WHERE, 'utf8')
    expect(w).toContain('cmux=1')
    expect(w).toContain('entries=0')
    const cwd = (/cwd=(.*)/.exec(w) as RegExpExecArray)[1]
    expect(cwd).toContain('prdt-qc-judge-')
    expect(fs.existsSync(cwd)).toBe(false)
  })

  test('an empty line the judge names is never an ask line', () => {
    expect(stop({}, ASK, {}, {}, J([2])).out).toBe('')
    expect(blockedLines(stop({}, ASK, {}, {}, J([2, 3])).out)).toEqual([3])
  })

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

test('hook-manifest registers it on PostToolUse (Bash) first and on Stop, matcher-less, as the last resort (T-1389)', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(m.basenames).toContain('prdt-question-check.sh')
  const regs = m.registrations.filter((r: { hooks: string[] }) => r.hooks.includes('prdt-question-check.sh'))
  expect(regs).toEqual([
    { event: 'Stop', hooks: ['prdt-question-check.sh'] },
    { event: 'PostToolUse', matcher: 'Bash', hooks: ['prdt-question-check.sh'] },
  ])
})

describe('T-1285 — an ask the judge names as asking a recorded decision again is a re-ask (T-1313 = A; subject by meaning, T-1470)', () => {
  // The re-ask check reads the record through the real `prdt decisions find`; which ask
  // asks which decision again is the judge's answer (stubbed here: QC_FAKE_REASKS).
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const env = (): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-reask-'))
    roots.push(home)
    return { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT, QC_FAKE_INPUT: path.join(home, 'judge-input') }
  }
  function record(proj: string, id: string, o: { status?: string; outcome?: string; log?: string; ago?: number } = {}) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, ['---', `id: ${id}`, `slug: fixture-${id.toLowerCase()}`, 'title: 다시 묻기 막는 방식', 'type: decision',
      `status: ${o.status ?? 'done'}`, 'assignee: user', 'created: 2026-10-27', '---', '', '## problem', '', '- 다시 묻기 막는 방식', '',
      '## options', '', '| A | hook 이 막음 |', '| B | 규율 문구 |', '',
      '## outcome', '', o.outcome ?? 'A (hook 이 막음) — 사용자 「A」', '', '## log', '', o.log ?? '', ''].join('\n'))
    const t = o.ago === undefined ? DAY_AGO : (Date.now() - o.ago) / 1000
    fs.utimesSync(p, t, t)
  }
  function run(setup: (proj: string) => void, reply: string, reasks: Array<[number, string]> = [], e: NodeJS.ProcessEnv = env()) {
    const { root, proj } = makeProject({})
    setup(proj)
    return runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, RA(reasks, J(QJ(reply), e)))
  }
  const judgeInput = (e: NodeJS.ProcessEnv) =>
    fs.existsSync(e.QC_FAKE_INPUT as string) ? fs.readFileSync(e.QC_FAKE_INPUT as string, 'utf8') : ''
  const DECS = '---- closed decisions this reply cites'
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
  const both = (p: string) => { record(p, 'T-1313'); newTicket(p) }

  test('the judge names the ask as asking the recorded decision again → blocked, citing the record', () => {
    const out = run(both, REASK_REPLY, [[12, 'T-1313']])
    const j = JSON.parse(out)
    expect(j.decision).toBe('block')
    expect(j.reason.startsWith(REASK)).toBe(true)
    expect(j.reason).toContain('T-1313')
    expect(j.reason).toMatch(/^\[prdt re-ask check\] line 12 asks again/)
    expect(j.reason).not.toContain('hook 이 막음') // never echoes the reply
  })

  test('the same judge call gets the cited record\'s question and recorded answer, after the numbered reply', () => {
    const e = env()
    run(both, REASK_REPLY, [], e)
    const input = judgeInput(e)
    const [reply, decs] = input.split(DECS)
    expect(reply).toContain('12| 어느 쪽으로 할까요?')
    expect(decs).toContain('[T-1313]')
    expect(decs).toMatch(/question:\n {4}다시 묻기 막는 방식\n[^]*\| A \| hook 이 막음 \|/)
    expect(decs).toContain('recorded answer:\n    A (hook 이 막음) — 사용자 「A」')
    expect(decs).not.toContain('T-1400') // an open decision is not a record
    expect(decs).not.toContain('## log')
  })

  test('citation alone never blocks: the record cited beside an ask the judge does not name a re-ask → no re-ask', () => {
    // the 2026-11-09 shape: a proceed-confirm / new question citing a closed decision as its ground
    const reply = ['## v1.17 방향', '', 'T-1313 에 기록된 대로 A 로 가요. 새 결정은 T-1400 에 열었어요.', '', '배포를 오늘 할까요?'].join('\n')
    expect(run(both, reply)).toBe('')
  })

  test('a judged re-ask on a line that is not an ask, or naming a decision it was not given → dropped', () => {
    expect(run(both, REASK_REPLY, [[5, 'T-1313']])).toBe('')   // line 5 is no ask
    expect(run(both, REASK_REPLY, [[12, 'T-1400']])).toBe('')  // open: never given to the judge
    expect(run(both, REASK_REPLY, [[12, 'T-9999']])).toBe('')
  })

  test('T-1465 replay — heading-less read-back, a done decision cited earlier → the judge decides; no re-ask named → silent', () => {
    const reply = ['**답:** 정리했어요.', '', '**한 일:** T-1313 = A로 정했어요.', '', '**질문:** 읽은 내용이 맞나요? (T-1400)'].join('\n')
    expect(run(both, reply)).toBe('')
  })

  test('T-1390 (T-1425 = A) — the reason is the approved wording, byte for byte, plus the Stop closing line', () => {
    // docs/productune/artifacts/v1.16/t1390-wording-draft.md §2 (337 B) + §4 SENT_TAIL (65 B)
    const TO_BE = '[prdt re-ask check] line %s asks again a decision already answered: %s (`prdt decisions find <id>`). Act on the recorded answer and cite it; a ticket opened this turn for that ask → `dropped` naming the record. Ask again only when the record is stale or conflicting, its state changed, or a consent gate needs live words — say which.'
    const SENT = 'The sent reply stays: send only the fix%s, never the reply again.'
    expect(Buffer.byteLength(TO_BE)).toBe(337)
    expect(Buffer.byteLength(SENT)).toBe(65)
    const reason = JSON.parse(run(both, REASK_REPLY, [[12, 'T-1313']])).reason as string
    const parts = ['12', 'T-1313']
    expect(reason).toBe(TO_BE.replace(/%s/g, () => parts.shift() as string) + '\n' + SENT.replace('%s', ''))
  })

  test('the per-product id form (T-1298) is a citable record too', () => {
    const reply = REASK_REPLY.replace('T-1313', 'T-PRDT-7')
    const out = run((p) => { record(p, 'T-PRDT-7'); newTicket(p) }, reply, [[12, 'T-PRDT-7']])
    expect(JSON.parse(out).reason).toContain('T-PRDT-7')
  })

  test('the record cited with no ask (PO acts on it) → silent', () => {
    const reply = '## 다시 묻기 막는 방식\n\nT-1313 에 기록된 대로 A 로 진행해요. hook 을 고치고 있어요.'
    expect(run((p) => record(p, 'T-1313'), reply, [[3, 'T-1313']])).toBe('')
  })

  test.each([
    ['still open (no answer yet)', (p: string) => { record(p, 'T-1313', { status: 'open', outcome: '' }); newTicket(p) }],
    ['done, outcome empty key headings only', (p: string) => { record(p, 'T-1313', { outcome: '### why\n\n### what\n' }); newTicket(p) }],
    ['reversed', (p: string) => { record(p, 'T-1313', { log: '- 2026-10-28 T-1399 가 이 결정을 뒤집음' }); newTicket(p) }],
    ['closed THIS turn (just answered)', (p: string) => { record(p, 'T-1313', { ago: 1_000 }); newTicket(p) }],
  ])('a cited decision %s → not given to the judge, never a re-ask', (_label, setup) => {
    const e = env()
    expect(run(setup, REASK_REPLY, [[12, 'T-1313']], e)).toBe('')
    expect(judgeInput(e)).not.toContain(DECS)
  })

  test('no decision cited → the judge input is the numbered reply alone', () => {
    const e = env()
    run((p) => record(p, 'T-1313'), '배포를 오늘 할까요?', [], e)
    expect(judgeInput(e)).toBe('1| 배포를 오늘 할까요?')
  })

  test('a waiting item the judge names a re-ask → blocked', () => {
    const reply = ['## 답 기다리는 것', '', '- T-1313 다시 묻기 막는 방식, hook 으로 할까요?'].join('\n')
    const out = run((p) => record(p, 'T-1313'), reply, [[3, 'T-1313']])
    expect(JSON.parse(out).reason.startsWith(REASK)).toBe(true)
  })

  test('the judge fails → no re-ask, logged (fails open; the new ticket still exempts the turn)', () => {
    const e = { ...env(), QC_FAKE_MODE: 'error' }
    expect(run(both, REASK_REPLY, [[12, 'T-1313']], e)).toBe('')
    expect(fs.readFileSync(path.join(e.PRDT_HOME as string, 'run', 'question-check.log'), 'utf8')).toMatch(/judge=fail reason=error-result/)
  })

  test('no prdt CLI reachable → no record, no re-ask (fails open; the new ticket still exempts the turn)', () => {
    const e = { ...env(), PRDT_BIN: '/nonexistent/prdt', PATH: `${FAKE_DIR}:/usr/bin:/bin` }
    expect(run(both, REASK_REPLY, [[12, 'T-1313']], e)).toBe('')
    expect(judgeInput(e)).not.toContain(DECS)
  })

  test('second Stop (stop_hook_active) → never a second block', () => {
    const { root, proj } = makeProject({})
    both(proj)
    expect(runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: true,
      cwd: proj, transcript_path: writeTranscript(root, REASK_REPLY), last_assistant_message: REASK_REPLY,
    }, RA([[12, 'T-1313']], J([12], env())))).toBe('')
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

describe('T-1426 — the batch-ask check counts a decision id written in the heading above its option items', () => {
  // Rebuilt from QA d-v116-t1389-1390-qa1 replay r2c: 11 asks, each decision id in a
  // `**N. title (T-nnn)**` heading, the option lines `- A. …` below it (column 0, so
  // each option is its own list item and the item alone never held the id).
  const BATCH = '[prdt batch-ask check]'
  const ids = Array.from({ length: 11 }, (_, k) => `T-${102 + k}`)
  const store: Store = Object.fromEntries(ids.map(id => [id, DEC()]))
  const R2C_ASKS = [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54] // the first option line of each item
  const reasonOf = (out: string) => (out ? (JSON.parse(out).reason as string) : '')

  test('r2c layout — 11 open decisions named in headings → batch-ask block naming 11', () => {
    const reason = reasonOf(stop(store, fx('batch-r2c-headings'), {}, {}, J(R2C_ASKS)).out)
    expect(reason.startsWith(BATCH)).toBe(true)
    expect(reason).toContain('11 open decisions')
  })

  test('the same layout with indented option lines → still flagged', () => {
    const reply = fx('batch-r2c-headings').replace(/^- /gm, '  - ')
    const reason = reasonOf(stop(store, reply, {}, {}, J(R2C_ASKS)).out)
    expect(reason.startsWith(BATCH)).toBe(true)
    expect(reason).toContain('11 open decisions')
  })

  test('old layout — the id inside the option item → still flagged', () => {
    const reply = ids.slice(0, 7).map((id, k) => `${k + 1}. 항목 ${k + 1} (${id})\n - A. 첫 안\n - B. 둘째 안`).join('\n') +
      '\n번호와 고른 선택지로 답해주세요.'
    const asks = reply.split('\n').flatMap((l, k) => (/^ - A\./.test(l) ? [k + 1] : []))
    const reason = reasonOf(stop(store, reply, {}, {}, J(asks)).out)
    expect(reason.startsWith(BATCH)).toBe(true)
    expect(reason).toContain('7 open decisions')
  })

  test('one decision asked with a table under its heading → not flagged', () => {
    const reply = ['**1. 저장 방식 (T-102)**', '', '| 안 | 내용 |', '|---|---|', '| A | 자동 저장 |', '| B | 저장 버튼 |', '',
      'A 와 B 중 어느 쪽으로 할지 알려 주세요.'].join('\n')
    expect(stop(store, reply, {}, {}, J([5, 8])).out).toBe('')
  })

  test('ids in headings with no ask beside them → not counted', () => {
    const report = ids.slice(0, 6).map((id, k) => `**${k + 1}. 진행 중 항목 (${id})**\n- 개발 중이에요.`).join('\n\n')
    const reply = report + '\n\n**7. 저장 방식 (T-108)**\n- A. 자동 저장\n- B. 저장 버튼'
    const asks = [reply.split('\n').indexOf('- A. 자동 저장') + 1]
    expect(stop(store, reply, {}, {}, J(asks)).out).not.toContain(BATCH)
  })
})

describe('T-1377 — L1 replays: a re-ask never hides batch-ask or question check', () => {
  // Verbatim first replies of docs/productune/artifacts/v1.16/decision-approval-observation.md
  // (1) r1 / r1b, (2) r2, (3) r3, against the scratch project `memo` as it stood:
  // T-001 `theme-follows-system` done + answered a day before; r2 opened T-002~T-011 that turn.
  // T-1470: the judge is stubbed with the re-asks the real judge is expected to name (r1 /
  // r1b: T-001; r2 / r3: none); the QC_REAL_JUDGE=1 replay checks that expectation.
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
  // the asks and re-asks of each fixture, as the judge is stubbed to name them
  const FX_ASKS: Record<string, number[]> = {
    'reask-r1': [5], 'reask-r1b': [3], 'batch-r2': [4, 8, 12, 17, 22, 26, 30, 35, 40, 45], 'approval-r3': [13],
  }
  const FX_REASKS: Record<string, Array<[number, string]>> = {
    'reask-r1': [[5, 'T-001']], 'reask-r1b': [[3, 'T-001']], 'batch-r2': [], 'approval-r3': [],
  }
  function replay(name: string, setup: (proj: string) => void) {
    const reply = fx(name)
    const { root, proj } = makeProject({})
    setup(proj)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, RA(FX_REASKS[name], J(FX_ASKS[name], env())))
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
    }, RA([[5, 'T-001']], J([5, off + 13], env())))
    const both = JSON.parse(out).reason as string
    expect(both.startsWith(REASK)).toBe(true)
    expect(both).toContain('\n\n' + TAG)
    expect(both).toContain('T-001')
  })

  // QA grill d-v116-t1377-qa1 (4): T-001 done a day ago, T-012 opened this turn
  // T-1470: each ask below re-decides T-001; the judge is stubbed to name every ask a re-ask of it
  function inline(reply: string, withT012: boolean) {
    const { root, proj } = makeProject({})
    T001(proj)
    if (withT012) decision(proj, 'T-012', 'in-app-theme-toggle', 'open', '', 1_000)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, RA(QJ(reply).map(n => [n, 'T-001'] as [number, string]), J(QJ(reply), env())))
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
    ['c4 — a fenced draft re-deciding T-001, 컨펌 ask naming the new ticket',
      [DECIDED, '', ...DRAFT, '', '이 초안(T-012)대로 앱 안 테마 설정을 넣는 걸 컨펌해 주세요.'].join('\n'), true],
    ['c5 — the same, 컨펌 ask with no new id', [DECIDED, '', ...DRAFT, '', '이 초안대로 넣어도 되는지 컨펌해 주세요.'].join('\n'), false],
    ['c6 — the same, an English confirm ask', [DECIDED, '', ...DRAFT, '', 'Can you confirm this draft?'].join('\n'), false],
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

describe('T-1389 — PostToolUse first (the reply draft of `prdt wordlist check -`), Stop as the last resort', () => {
  // The L1 replays of decision-approval-observation.md (1) r1 and (2) r2: in both, the PO
  // ran `prdt wordlist check --lang ko -` on its draft before replying (r1 printf, r2 heredoc).
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const BATCH = '[prdt batch-ask check]'
  // r1's ask (line 5) re-asks T-001: the judge is stubbed to say so whenever line 5 is an ask
  const env = (asks: number[]): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-ptu-'))
    roots.push(home)
    return RA(asks.includes(5) ? [[5, 'T-001']] : [], J(asks, { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT, QC_FAKE_CALLS: path.join(home, 'calls') }))
  }
  const calls = (e: NodeJS.ProcessEnv) =>
    fs.existsSync(e.QC_FAKE_CALLS as string) ? fs.readFileSync(e.QC_FAKE_CALLS as string, 'utf8').trim().split('\n').length : 0
  function decision(proj: string, id: string, status: string, outcome: string, ago: number) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, 'type: decision', `status: ${status}`, 'assignee: user',
      'created: 2026-11-01', '---', '', '## problem', '', '- x', '', '## outcome', '', outcome, '', '## log', '', ''].join('\n'))
    const t = (Date.now() - ago) / 1000
    fs.utimesSync(p, t, t)
  }
  const T001 = (proj: string) => decision(proj, 'T-001', 'done', '폰 설정을 따른다 — 사용자 「폰 설정 따라가면 돼」', 86_400_000)
  const heredoc = (draft: string) => `prdt wordlist check --lang ko - <<'EOF'\n${draft}\nEOF`
  function setup(fill: (proj: string) => void) {
    const { root, proj } = makeProject({})
    fill(proj)
    return { root, proj, transcript_path: writeTranscript(root, 'x') }
  }
  function post(p: { proj: string; transcript_path: string }, command: string, e: NodeJS.ProcessEnv, extra: Record<string, unknown> = {}) {
    const out = runHook({
      session_id: 's1', prompt_id: 'p1', hook_event_name: 'PostToolUse', agent_type: 'prdt-po', tool_name: 'Bash',
      tool_input: { command }, tool_response: { stdout: '' }, tool_use_id: 'tu', cwd: p.proj, transcript_path: p.transcript_path, ...extra,
    }, e)
    return out ? (JSON.parse(out).hookSpecificOutput as { hookEventName: string; additionalContext: string }) : null
  }
  function stopAfter(p: { proj: string; transcript_path: string }, reply: string, e: NodeJS.ProcessEnv) {
    const out = runHook({
      session_id: 's1', prompt_id: 'p1', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: p.proj, transcript_path: p.transcript_path, last_assistant_message: reply,
    }, e)
    return out ? JSON.parse(out) : null
  }

  test('(1) r1 draft piped by printf → the re-ask finding arrives on PostToolUse, never a block', () => {
    const p = setup(T001)
    const draft = fx('reask-r1').trimEnd()
    const cmd = `printf '%s\\n' "${draft.replace(/"/g, '\\"')}" | prdt wordlist check --lang ko -`
    const ctx = post(p, cmd, env([5]))
    expect(ctx?.hookEventName).toBe('PostToolUse')
    expect(ctx?.additionalContext.startsWith(REASK)).toBe(true)
    expect(ctx?.additionalContext).toContain('T-001')
    // T-1390: the draft closing line, once, no language (the `[prdt reply]` line carries it)
    expect(ctx?.additionalContext.endsWith('\nFix the draft before you send it.')).toBe(true)
    expect(ctx?.additionalContext.split('Fix the draft').length).toBe(2)
  })

  test('(2) r2 draft in a heredoc → the batch-ask finding arrives on PostToolUse', () => {
    const p = setup((proj) => {
      T001(proj)
      for (const id of ['T-002', 'T-003', 'T-004', 'T-005', 'T-006', 'T-007', 'T-008', 'T-009', 'T-010', 'T-011']) decision(proj, id, 'open', '', 1_000)
    })
    const ctx = post(p, heredoc(fx('batch-r2').trimEnd()), env([4, 8, 12, 17, 22, 26, 30, 35, 40, 45]))
    expect(ctx?.additionalContext.startsWith(BATCH)).toBe(true)
    expect(ctx?.additionalContext).toContain('10 open decisions')
    expect(ctx?.additionalContext).not.toContain(REASK)
  })

  test('the same finding is reported once per turn; a new turn reports it again', () => {
    const p = setup(T001)
    const e = env([5])
    const cmd = heredoc(fx('reask-r1').trimEnd())
    expect(post(p, cmd, e)?.additionalContext).toContain(REASK)
    expect(post(p, cmd, e)).toBeNull()
    expect(post(p, cmd, e, { prompt_id: 'p2' })?.additionalContext).toContain(REASK)
  })

  test('no prompt_id → the transcript\'s last prompt names the turn, still once', () => {
    const p = setup(T001)
    const e = env([5])
    const cmd = heredoc(fx('reask-r1').trimEnd())
    expect(post(p, cmd, e, { prompt_id: undefined })?.additionalContext).toContain(REASK)
    expect(post(p, cmd, e, { prompt_id: undefined })).toBeNull()
  })

  test('Stop is the last resort: a final reply that complies after the report is not blocked; one that still re-asks is', () => {
    const p = setup(T001)
    const e = env([5])
    expect(post(p, heredoc(fx('reask-r1').trimEnd()), e)?.additionalContext).toContain(REASK)
    // the reply the PO then writes acts on T-001 and asks nothing (judge: no ask lines)
    const ok = '다크모드는 T-001 에서 정하신 대로 폰 설정을 따라가게 진행할게요.'
    expect(stopAfter(p, ok, { ...e, QC_FAKE_ASKS: '', QC_FAKE_REASKS: '' })).toBeNull()
    const still = stopAfter(p, fx('reask-r1'), e)
    expect(still.decision).toBe('block')
    expect(still.reason.startsWith(REASK)).toBe(true)
  })

  test('a Bash call that is not a stdin wordlist check, a worker, or a non-Bash tool → silent, no judge call', () => {
    const p = setup(T001)
    const e = env([5])
    expect(post(p, 'prdt wordlist check docs/x.md', e)).toBeNull()
    expect(post(p, 'git status', e)).toBeNull()
    expect(post(p, heredoc(fx('reask-r1').trimEnd()), e, { agent_type: 'prdt-developer' })).toBeNull()
    expect(post(p, heredoc(fx('reask-r1').trimEnd()), e, { tool_name: 'Read' })).toBeNull()
    expect(calls(e)).toBe(0)
  })

  test('a compliant draft → silent on PostToolUse', () => {
    const p = setup(T001)
    expect(post(p, heredoc('다크모드는 T-001 대로 진행할게요.'), env([]))).toBeNull()
  })
})

describe('T-1428 — a confirm request on a body is an ask even when the judge misses it', () => {
  // L1 observation (3) (decision-approval-observation.md, 재관측 2026-11-03): r3 ff50718c and
  // r3b b2007d0d asked to confirm a release-note body with no decision ticket and nothing
  // blocked. Their confirm lines are read deterministically beside the judge: the judge is
  // stubbed to MISS them here ([]), so only CONFIRM_ASK_RE can find them.
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const env = (asks: number[] = [], extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-t1428-'))
    roots.push(home)
    return J(asks, { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT, ...extra })
  }
  function decision(proj: string, id: string, status: string, ago: number) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, 'type: decision', `status: ${status}`, 'assignee: user',
      'created: 2026-11-01', '---', '', '## problem', '', '- x', '', '## outcome', '',
      status === 'done' ? '폰 설정을 따른다 — 사용자 「폰 설정 따라가면 돼」' : '', '', '## log', '', ''].join('\n'))
    const t = (Date.now() - ago) / 1000
    fs.utimesSync(p, t, t)
  }
  function run(reply: string, fill: (proj: string) => void, e: NodeJS.ProcessEnv) {
    const { root, proj } = makeProject({})
    fill(proj)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, e)
    return out
  }
  const none = () => {}
  const T001 = (p: string) => decision(p, 'T-001', 'done', 86_400_000)
  const lineOf = (reply: string, needle: string) => reply.split('\n').findIndex(l => l.includes(needle)) + 1

  const observed: Array<[string, string]> = [
    ['approval-r3-reply', '이대로 괜찮으면 이 메시지에 답해 주세요'],
    ['approval-r3b-which-lines', '이 문구로 괜찮은지, 고칠 줄이 있는지 알려 주세요'],
  ]
  for (const [name, needle] of observed) {
    test(`${name}: 「${needle}」, no decision ticket, judge missed it → flagged on that line`, () => {
      const reply = fx(name)
      expect(blockedLines(run(reply, none, env()))).toEqual([lineOf(reply, needle)])
    })

    test(`${name}: T-001 (answered) cited as the body's source → question check, never re-ask`, () => {
      const reply = fx(name)
      const reason = JSON.parse(run(reply, T001, env([lineOf(reply, needle)]))).reason as string
      expect(reason.startsWith(TAG)).toBe(true)
      expect(reason).not.toContain(REASK)
    })

    test(`${name}: an open decision id cited beside the confirm request → silent`, () => {
      const reply = fx(name).replace(needle, `${needle} (T-002)`)
      expect(run(reply, (p) => { T001(p); decision(p, 'T-002', 'open', 86_400_000) }, env())).toBe('')
    })
  }

  test.each([
    '이대로 괜찮으면 답해 주세요.',
    '아래 내용이 맞는지 답해 주세요.',
    '이 초안으로 좋으면 승인해 주세요.',
    '위 문구가 괜찮으시면 알려 주세요.',
  ])('other confirm-request forms are asks: %s', (ask) => {
    const reply = ['초안이에요.', '```', '- 한 줄', '```', ask].join('\n')
    expect(blockedLines(run(reply, none, env()))).toEqual([5])
  })

  test.each([
    ['quoted', '지난번에 「이대로 괜찮으면 이 메시지에 답해 주세요」 로 물었는데 막히지 않았어요.'],
    ['a blockquote', '> 이대로 괜찮으면 이 메시지에 답해 주세요.'],
    ['inside a fence', '```\n이대로 괜찮으면 이 메시지에 답해 주세요.\n```'],
    ['inline code', '문구 `이대로 괜찮으면 답해 주세요` 를 판정해요.'],
    ['an information request', '이 경로가 맞는지 알려 주세요.'],
    ['no answer asked', '이대로 괜찮으면 따로 답하지 않으셔도 돼요.'],
    ['a look-and-report', '화면이 괜찮은지 직접 봐 주세요.'],
  ])('not a confirm request: %s', (_label, text) => {
    expect(run(['보고예요.', '', text].join('\n'), none, env())).toBe('')
  })

  test('the judge failing does not drop a deterministic confirm request', () => {
    const reply = fx('approval-r3-reply')
    const out = run(reply, none, env([], { QC_FAKE_MODE: 'error' }))
    expect(blockedLines(out)).toEqual([lineOf(reply, '이대로 괜찮으면')])
  })

  test('no existing fixture gains a confirm-request line the judge stubs did not name', () => {
    // replay: every pre-T-1428 fixture, judge stubbed to [] — only approval-r3 holds such a line
    // (13, already judged an ask in the L1 replay above); every other one stays silent.
    const old = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.md') && !f.startsWith('approval-r3-') && !f.startsWith('approval-r3b-'))
    const hit: string[] = []
    for (const f of old) {
      const reply = fx(f.slice(0, -3))
      if (run(reply, none, env())) hit.push(f)
    }
    expect(hit).toEqual(['approval-r3.md'])
  })
})

describe('T-1429 — a confirm request on a new body that cites a done decision only as its basis is never a re-ask', () => {
  // QA re-observation 2026-11-04 (2) (3), decision-approval-observation.md: r3_1 68499f08 and
  // r3_2 110d98ef asked to confirm release-note text, citing T-001 (done) as its basis; the
  // re-ask check blocked 2/2 live and 4/4 in replay with the REAL judge, while the T-1428 tests
  // passed. Cause: logic the T-1428 fixtures never reached — 「확정할까요」 matched no approval
  // word, the judge also names line 1 (above the body), and r3_2 cites T-001 inside the body,
  // so each ask's subject fell back to the whole section. The judge outputs below are the ones
  // the real judge gave on these replies (question-check.log, QA and this ticket's replay).
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const env = (asks: number[]): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-t1429-'))
    roots.push(home)
    return J(asks, { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT })
  }
  function T001(proj: string) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', 'T-001.md')
    fs.writeFileSync(p, ['---', 'id: T-001', 'slug: theme-follows-system', 'type: decision', 'status: done', 'assignee: user',
      'created: 2026-11-01', '---', '', '## problem', '', '- 다크모드', '', '## outcome', '',
      '폰 설정을 따른다 — 사용자 「처음부터 아무것도 안 만지고 쓰게 하고 싶어. 설정 화면 늘어나는 거 싫다. 어두운 건 폰 설정 따라가면 돼」',
      '', '## log', '', ''].join('\n'))
    fs.utimesSync(p, DAY_AGO, DAY_AGO)
  }
  // T-1470: `reasks` = what the judge is stubbed to name as re-asks of T-001
  function reasonOf(reply: string, asks: number[], reasks: number[] = []): string {
    const { root, proj } = makeProject({})
    T001(proj)
    const out = runHook({
      hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: proj, transcript_path: writeTranscript(root, reply), last_assistant_message: reply,
    }, RA(reasks.map(n => [n, 'T-001'] as [number, string]), env(asks)))
    return out ? (JSON.parse(out).reason as string) : ''
  }

  test.each([
    ['approval-r3-cited-t001-1', [18], '18'],   // 「이 문구 그대로 확정할까요?」, T-001 cited in a note after the body
    ['approval-r3-cited-t001-2', [1, 17], '1, 17'],   // 「확인해 주시면」 above the body + 「이대로 괜찮으면 알려 주세요」, T-001 inside the body
  ] as Array<[string, number[], string]>)('%s: real-judge asks %j → question check on those lines, no re-ask', (name, asks, shown) => {
    const reason = reasonOf(fx(name), asks)
    expect(reason).not.toContain(REASK)
    expect(reason.startsWith(`${TAG} line ${shown} asks`)).toBe(true)
  })

  test('the deterministic confirm line alone (judge missed every line) → question check, no re-ask', () => {
    const reason = reasonOf(fx('approval-r3-cited-t001-2'), [])
    expect(reason).not.toContain(REASK)
    expect(reason.startsWith(`${TAG} line 17 asks`)).toBe(true)
  })

  test.each([
    ['reask-r1-reobs-1', [5], '5'],
    ['reask-r1-reobs-2', [10], '10'],
  ] as Array<[string, number[], string]>)('%s: a true re-ask of T-001 (no body) keeps its re-ask finding', (name, asks, shown) => {
    expect(reasonOf(fx(name), asks, asks).startsWith(`${REASK} line ${shown} asks again`)).toBe(true)
  })

  const BODY = ['```', '## v1.0', '- 어두운 화면은 폰 설정을 따른다.', '```']
  test.each([
    ['named on the confirm line itself', ['초안이에요.', ...BODY, 'T-001 을 이 문구로 확정할까요?']],
    ['named in the text presenting the body', ['T-001 을 바꾼 새 안이에요.', ...BODY, '이 문구 그대로 확정할까요?']],
    ['a decision ask with no body word beside a body', ['초안이에요.', ...BODY, 'T-001 에 따라 썼어요.', '이 결정을 바꿀지 골라 주세요.']],
  ])('a done decision %s → still a re-ask', (_label, lines) => {
    const n = (lines as string[]).length
    expect(reasonOf((lines as string[]).join('\n'), [n], [n])).toContain(REASK)
  })
})

describe('T-1470 — the re-ask subject is the judge\'s reading of meaning, shared by PostToolUse and Stop', () => {
  // 2026-11-09 PO replies (this ticket's §problem, decision T-1469): a proceed-confirm citing
  // T-1466 (draft proceed-t1466-cited-draft + sent proceed-t1466-cited) and a new decision
  // T-1469 citing T-1362 / T-1466 (decision-t1469-cites-t1466) — each blocked or flagged as a
  // re-ask by the id-position rule. The real records they cite: fixtures/question-check/records/.
  const PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
  const REASK = '[prdt re-ask check]'
  const RECORDS = path.join(FIXTURES, 'records')
  function place(proj: string, file: string, ago = 86_400_000) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', path.basename(file))
    fs.copyFileSync(file, p)
    const t = (Date.now() - ago) / 1000
    fs.utimesSync(p, t, t)
  }
  function write(proj: string, id: string, lines: string[], ago: number) {
    const p = path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`)
    fs.writeFileSync(p, lines.join('\n') + '\n')
    const t = (Date.now() - ago) / 1000
    fs.utimesSync(p, t, t)
  }
  const T001 = (proj: string) => write(proj, 'T-001', ['---', 'id: T-001', 'slug: theme-follows-system', 'type: decision', 'status: done',
    'assignee: user', 'created: 2026-11-01', '---', '', '## problem', '', '- theme-follows-system', '', '## outcome', '',
    '폰 설정을 따른다 — 사용자 「처음부터 아무것도 안 만지고 쓰게 하고 싶어. 설정 화면 늘어나는 거 싫다. 어두운 건 폰 설정 따라가면 돼」',
    '', '## log', ''], 86_400_000)
  const T1466 = (proj: string) => place(proj, path.join(RECORDS, 'T-1466.md'))
  function project(fill: (proj: string) => void, reply: string) {
    const { root, proj } = makeProject({})
    fill(proj)
    return { proj, transcript_path: writeTranscript(root, reply) }
  }
  function stopOut(p: { proj: string; transcript_path: string }, reply: string, e: NodeJS.ProcessEnv, timeout = 20_000) {
    const out = execFileSync('bash', [HOOK], { input: JSON.stringify({
      session_id: 's1', prompt_id: 'p1', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
      cwd: p.proj, transcript_path: p.transcript_path, last_assistant_message: reply,
    }), encoding: 'utf8', timeout, env: e })
    return out ? (JSON.parse(out).reason as string) : ''
  }
  function postOut(p: { proj: string; transcript_path: string }, reply: string, e: NodeJS.ProcessEnv) {
    const out = runHook({
      session_id: 's1', prompt_id: 'p1', hook_event_name: 'PostToolUse', agent_type: 'prdt-po', tool_name: 'Bash',
      tool_input: { command: `cat <<'EOF' | prdt wordlist check --lang ko -\n${reply.trimEnd()}\nEOF` }, tool_response: { stdout: '' },
      cwd: p.proj, transcript_path: p.transcript_path,
    }, e)
    return out ? (JSON.parse(out).hookSpecificOutput.additionalContext as string) : ''
  }
  const fresh = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-t1470-'))
    roots.push(home)
    return { ...ON, PRDT_HOME: home, PRDT_BIN: PRDT, QC_FAKE_INPUT: path.join(home, 'judge-input'), ...extra }
  }

  test.each([
    ['proceed-t1466-cited (citation only)', 'proceed-t1466-cited', T1466, [20], [] as Array<[number, string]>],
    ['reask-r1 (a true re-ask)', 'reask-r1', T001, [5], [[5, 'T-001']] as Array<[number, string]>],
  ])('%s: the draft and the sent reply give the judge the same input and get the same re-ask verdict', (_l, name, fill, asks, reasks) => {
    const reply = fx(name).trimEnd()
    const ePost = RA(reasks, J(asks, fresh()))
    const eStop = RA(reasks, J(asks, fresh()))
    const pPost = project(fill, reply)
    const pStop = project(fill, reply)
    const post = postOut(pPost, reply, ePost)
    const stopped = stopOut(pStop, reply, eStop)
    const inPost = fs.readFileSync(ePost.QC_FAKE_INPUT as string, 'utf8')
    expect(inPost).toBe(fs.readFileSync(eStop.QC_FAKE_INPUT as string, 'utf8'))
    expect(inPost).toContain('---- closed decisions this reply cites')
    expect(post.includes(REASK)).toBe(stopped.includes(REASK))
    expect(stopped.includes(REASK)).toBe(reasks.length > 0)
  })

  test('the real T-1466 record reaches the judge as its question (title · problem · options) and recorded answer', () => {
    const e = J([20], fresh())
    stopOut(project(T1466, fx('proceed-t1466-cited')), fx('proceed-t1466-cited'), e)
    const decs = fs.readFileSync(e.QC_FAKE_INPUT as string, 'utf8').split('---- closed decisions this reply cites')[1]
    expect(decs).toContain('[T-1466]')
    expect(decs).toContain('v1.17 방향: 무엇을 위한 버전인가')
    expect(decs).toContain('A. PO 규율을 훅과 cold 파일로')
    expect(decs).toMatch(/recorded answer:\n {4}셋 다 레인으로/)
    expect(decs).not.toMatch(/### why/)
  })

  test('a thin record (slug only, no title, no options) reaches the judge with a note that the answer names the subject (QA fail row)', () => {
    const e = J([3], fresh())
    stopOut(project(T001, fx('reask-thin-y2')), fx('reask-thin-y2'), e)
    const decs = fs.readFileSync(e.QC_FAKE_INPUT as string, 'utf8').split('---- closed decisions this reply cites')[1]
    expect(decs).toContain('kept no question text')
    expect(decs).toContain('폰 설정 따라가면 돼')
  })

  test('a record with a title and options carries no thin-record note', () => {
    const e = J([20], fresh())
    stopOut(project(T1466, fx('proceed-t1466-cited')), fx('proceed-t1466-cited'), e)
    expect(fs.readFileSync(e.QC_FAKE_INPUT as string, 'utf8')).not.toContain('kept no question text')
  })

  test.each([['reask-thin-y1', 3], ['reask-thin-y2', 3], ['reask-thin-l3', 1]] as Array<[string, number]>)(
    '%s: a same-choice re-ask of the thin T-001 is blocked as a re-ask when the judge names it', (name, line) => {
      const reply = fx(name).trimEnd()
      const reason = stopOut(project(T001, reply), reply, RA([[line, 'T-001']], J([line], fresh())))
      expect(reason).toContain(REASK)
    })

  // The judgment itself (the real model on these fixtures and records) is evaluated outside the
  // unit suite, whose sandboxed HOME has no `claude` login: T-1470 §evidence holds the replay.
})
