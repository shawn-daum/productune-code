/**
 * prdt-user-prompt.sh on PostToolUse — the mid-turn language check (T-1307).
 *
 * The PO prose written right before a tool call (after a tool output or a worker
 * return) is judged at that tool call's PostToolUse, not only at Stop. Each text is
 * judged once: only the text that directly precedes THIS tool_use (no other tool_use
 * between them) and follows the last user record. Nothing drifted → the branch's
 * additionalContext is byte-identical to before (the reply hot line only).
 *
 * Session language (T-1317 = A): a language the user asked for in chat this session
 * (UserPromptSubmit) outranks the stored `user.lang`, for this check and the Stop check.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, afterEach, describe } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-user-prompt.sh')

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

function sandbox(userLang: string | null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1307-'))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ stage: 'build', version: 'v1.16' }))
  const dir = path.join(root, 'hooks')
  fs.mkdirSync(dir)
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'), '#!/usr/bin/env bash\nexit 0\n')
  const home = path.join(root, 'home')
  fs.mkdirSync(home)
  if (userLang !== null) fs.writeFileSync(path.join(home, 'user-lang'), userLang + '\n')
  const transcript = path.join(root, 'transcript.jsonl')
  return { root, proj, hook, home, transcript }
}
type Sb = ReturnType<typeof sandbox>

function run(sb: Sb, ev: Record<string, unknown>) {
  const out = execFileSync('bash', [sb.hook], {
    input: JSON.stringify({ session_id: 's1', cwd: sb.proj, transcript_path: sb.transcript, ...ev }),
    encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, HOME: sb.root, PRDT_HOME: sb.home, LC_ALL: '', LC_MESSAGES: '', LANG: 'C' },
  })
  return out
}

function post(sb: Sb, toolUseId: string, extra: Record<string, unknown> = {}) {
  const out = run(sb, { hook_event_name: 'PostToolUse', agent_type: 'prdt-po', tool_name: 'Bash', tool_use_id: toolUseId, ...extra })
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext as string : null
}

// Transcript records, one content block per record (the shape Claude Code writes).
type Rec = Record<string, unknown>
const userPrompt = (text: string): Rec => ({ type: 'user', isSidechain: false, message: { role: 'user', content: text } })
const aText = (text: string, sidechain = false): Rec =>
  ({ type: 'assistant', isSidechain: sidechain, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const aTool = (id: string): Rec =>
  ({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: {} }] } })
const toolResult = (id: string, body = 'ok'): Rec =>
  ({ type: 'user', isSidechain: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: body }] } })
const attachment: Rec = { type: 'attachment', isSidechain: false }
function write(sb: Sb, recs: Rec[]) {
  fs.writeFileSync(sb.transcript, recs.map(r => JSON.stringify(r)).join('\n') + '\n')
}

const HOT_KO = '[prdt reply] Final user-chat reply only, over one line → `prdt wordlist check --lang ko -` on the draft first, each hit (`—` · 합치기 · 모름) → a listed replacement.'
const NOTICE = (lang: string) =>
  `[prdt lang check] your text before this tool call is not in lang=${lang}. Write the rest of this turn in that language; code, paths, ids, quoted text unchanged.`

// The observed shape (v1.15 po-voice observation (4)): English prose right after a worker's English return.
const ENGLISH_AFTER_WORKER =
  'The developer returned a green build for T-384, so now I will dispatch QA to verify both places before we land it.'
const KOREAN = 'T-384 개발 반환이 green 이라서, land 전에 두 곳을 QA 에 확인시키려고 발주할게요.'

describe('mid-turn prose in another language is caught at the next tool call', () => {
  test('English prose after a worker return, user-lang=ko → the hot line plus the mid-turn notice', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('T-384 진행해줘'), aTool('t1'), toolResult('t1', 'worker return in English'), attachment,
      aText(ENGLISH_AFTER_WORKER), aTool('t2')])
    expect(post(sb, 't2')).toBe(HOT_KO + '\n' + NOTICE('ko'))
  })

  test('Korean prose → the branch prints exactly what it printed before (hot line only)', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('진행해줘'), aTool('t1'), toolResult('t1'), aText(KOREAN), aTool('t2')])
    expect(post(sb, 't2')).toBe(HOT_KO)
  })

  test('the tool result already written after the tool_use does not hide the prose', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('진행해줘'), aText(ENGLISH_AFTER_WORKER), aTool('t2'), toolResult('t2', 'x'.repeat(300_000))])
    expect(post(sb, 't2')).toBe(HOT_KO + '\n' + NOTICE('ko'))
  })

  test('each text is judged once: parallel tool calls flag only the first one after the text', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('진행해줘'), aText(ENGLISH_AFTER_WORKER), aTool('a'), aTool('b')])
    expect(post(sb, 'a')).toBe(HOT_KO + '\n' + NOTICE('ko'))
    expect(post(sb, 'b')).toBe(HOT_KO)
  })

  test('text before an earlier tool call is not judged again at a later one', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('진행해줘'), aText(ENGLISH_AFTER_WORKER), aTool('t1'), toolResult('t1'), aTool('t2')])
    expect(post(sb, 't2')).toBe(HOT_KO)
  })

  test('short narration, sidechain text, unknown tool id, missing transcript → hot line only', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('진행해줘'), aText('Let me check the file.'), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO)
    write(sb, [userPrompt('진행해줘'), aText(ENGLISH_AFTER_WORKER, true), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO)
    write(sb, [userPrompt('진행해줘'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 'zzz')).toBe(HOT_KO)
    fs.rmSync(sb.transcript)
    expect(post(sb, 't1')).toBe(HOT_KO)
  })

  test('no stored language and no chat request → never judged', () => {
    const sb = sandbox(null)
    write(sb, [userPrompt('go'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).not.toContain('[prdt lang check]')
  })

  test('a non-PO PostToolUse prints nothing', () => {
    const sb = sandbox('ko')
    write(sb, [userPrompt('go'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1', { agent_type: 'prdt-developer' })).toBeNull()
  })
})

describe('T-1317: a language asked for in chat outranks stored user.lang for the session', () => {
  function prompt(sb: Sb, text: string, sid = 's1') {
    run(sb, { hook_event_name: 'UserPromptSubmit', prompt: text, session_id: sid })
  }
  function stop(sb: Sb, reply: string, sid = 's1') {
    const out = run(sb, { hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false, last_assistant_message: reply, session_id: sid })
    return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext as string : null
  }

  test('"영어로 답해줘" with user-lang=ko → English passes, Korean is flagged as not lang=en (mid-turn and Stop)', () => {
    const sb = sandbox('ko')
    prompt(sb, '이번 세션은 영어로 답해줘')
    write(sb, [userPrompt('이번 세션은 영어로 답해줘'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO)
    expect(stop(sb, ENGLISH_AFTER_WORKER)).toBeNull()
    write(sb, [userPrompt('ok'), aText(KOREAN + ' 그리고 다음 단계도 이어서 바로 진행할게요.'), aTool('t2')])
    expect(post(sb, 't2')).toBe(HOT_KO + '\n' + NOTICE('en'))
  })

  test('English request phrasing, then a later Korean request: the latest one wins', () => {
    const sb = sandbox('ko')
    prompt(sb, 'please reply in English from now on')
    write(sb, [userPrompt('x'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO)
    prompt(sb, '다시 한국어로 말해줘')
    expect(post(sb, 't1')).toBe(HOT_KO + '\n' + NOTICE('ko'))
  })

  test('the request holds for its own session only', () => {
    const sb = sandbox('ko')
    prompt(sb, '영어로 대답해', 'other')
    write(sb, [userPrompt('x'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO + '\n' + NOTICE('ko'))
  })

  test('a task about English text is not a chat-language request', () => {
    const sb = sandbox('ko')
    prompt(sb, 'README 를 영어로 번역해서 translate it into English 해줘')
    write(sb, [userPrompt('x'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).toBe(HOT_KO + '\n' + NOTICE('ko'))
  })

  test('no stored language: a chat request alone turns the check on', () => {
    const sb = sandbox(null)
    prompt(sb, 'answer in Korean please')
    write(sb, [userPrompt('x'), aText(ENGLISH_AFTER_WORKER), aTool('t1')])
    expect(post(sb, 't1')).toContain(NOTICE('ko'))
  })
})
