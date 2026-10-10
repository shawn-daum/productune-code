/**
 * prdt-user-prompt.sh on Stop — the form=outline check at the end of a PO
 * reply (T-1022; T-1020 = A). Same detector as the next-turn notice
 * (user-prompt-register-check.test.ts), run on the reply itself so the PO
 * rewrites it once before the user is left with it. One block, never two:
 * `stop_hook_active` (true on the Stop after a block) lets the rewrite through.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-user-prompt.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const TAG = '[prdt register check]'

const VIOLATING = '첫 문장입니다.\n둘째 문장입니다.\n셋째 문장입니다.'
const COMPLIANT = '결론 한 줄.\n\n- 첫째 항목\n- 둘째 항목'
const ENGLISH_A = 'A dispatch was denied.\n\n- 원인을 확인했어요\n- 다시 시도해요'

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

function sandbox(bindingTail: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1022-'))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify({ stage: 'build', version: 'v1.13' }))
  const dir = path.join(root, 'hooks')
  fs.mkdirSync(dir)
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'), `#!/usr/bin/env bash\necho "[prdt register] ${bindingTail}"\n`)
  return { root, proj, hook }
}

const OUTLINE = 'audience=developer · form=outline · structure=planner-tables'
const PROSE = 'audience=developer · form=prose · structure=planner-tables'

function stop(sb: ReturnType<typeof sandbox>, reply: unknown, extra: Record<string, unknown> = {}) {
  const ev = {
    session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
    cwd: sb.proj, last_assistant_message: reply, ...extra,
  }
  return execFileSync('bash', [sb.hook], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env: { ...process.env, PRDT_HOME: path.join(sb.root, 'home') } })
}

const HOT = '[prdt form=outline] Next act a tool call \u2192 ignore this. Next act the final user-chat reply \u2192 one point per marked line: never 2+ sentences on an unmarked line, never 2+ unmarked lines in a row; one blank line after each point\'s block, none inside it.'

function post(sb: ReturnType<typeof sandbox>, extra: Record<string, unknown> = {}) {
  const ev = { session_id: 's', hook_event_name: 'PostToolUse', agent_type: 'prdt-po', cwd: sb.proj, tool_name: 'Bash', ...extra }
  return execFileSync('bash', [sb.hook], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 20_000, env: { ...process.env, PRDT_HOME: path.join(sb.root, 'home') } })
}
const rows = (sb: ReturnType<typeof sandbox>) => {
  const f = path.join(sb.root, 'home', 'run', 'form-outline-counts.jsonl')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
}

test('PostToolUse for the PO while form=outline is bound returns the hot line', () => {
  const r = JSON.parse(post(sandbox(OUTLINE)))
  expect(r.hookSpecificOutput.hookEventName).toBe('PostToolUse')
  expect(r.hookSpecificOutput.additionalContext).toBe(HOT)
})

test('PostToolUse: nothing for a worker, prose, or outside a project', () => {
  expect(post(sandbox(OUTLINE), { agent_type: 'prdt-developer' })).toBe('')
  expect(post(sandbox(OUTLINE), { agent_type: undefined })).toBe('')
  expect(post(sandbox(PROSE))).toBe('')
  const sb = sandbox(OUTLINE)
  fs.rmSync(path.join(sb.proj, '.prdt'), { recursive: true })
  expect(post(sb)).toBe('')
})

test('Stop never blocks or prints, and records the paragraph-line and blank-block counts', () => {
  const sb = sandbox(OUTLINE)
  expect(stop(sb, VIOLATING)).toBe('')
  expect(stop(sb, '- 하나\n  · 가\n- 둘\n  · 나')).toBe('')
  const r = rows(sb)
  expect(r).toHaveLength(2)
  expect(r[0]).toMatchObject({ session_id: 's', paragraph_lines: 2, blank_blocks: 0 })
  expect(r[1]).toMatchObject({ paragraph_lines: 0, blank_blocks: 1 })
})

test('Stop records a compliant reply as zeros, and nothing for tool-only turns, prose, workers', () => {
  const sb = sandbox(OUTLINE)
  expect(stop(sb, COMPLIANT)).toBe('')
  expect(rows(sb)).toMatchObject([{ paragraph_lines: 0, blank_blocks: 0 }])
  expect(stop(sb, '')).toBe('')
  expect(stop(sb, VIOLATING, { agent_type: 'prdt-developer' })).toBe('')
  expect(rows(sb)).toHaveLength(1)
  const p = sandbox(PROSE)
  expect(stop(p, VIOLATING)).toBe('')
  expect(rows(p)).toHaveLength(0)
})

test('outside a prdt project it passes', () => {
  const sb = sandbox(OUTLINE)
  fs.rmSync(path.join(sb.proj, '.prdt'), { recursive: true })
  expect(stop(sb, VIOLATING)).toBe('')
})

test('a resolver that cannot answer fails open', () => {
  const sb = sandbox(OUTLINE)
  fs.writeFileSync(path.join(path.dirname(sb.hook), 'prdt-audience-inject.sh'), '#!/usr/bin/env bash\nexit 1\n')
  expect(stop(sb, VIOLATING)).toBe('')
  expect(rows(sb)).toHaveLength(0)
})

test('the manifest registers prdt-user-prompt.sh on Stop beside the question check', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const stops = m.registrations.filter((r: any) => r.event === 'Stop')
  expect(stops).toEqual([
    { event: 'Stop', hooks: ['prdt-question-check.sh'] },
    // T-899: prdt-link-check.sh, its own Stop entry between the two.
    { event: 'Stop', hooks: ['prdt-link-check.sh'] },
    { event: 'Stop', hooks: ['prdt-user-prompt.sh'] },
  ])
  const post = m.registrations.filter((r: any) => r.event === 'PostToolUse' && r.hooks.includes('prdt-user-prompt.sh'))
  expect(post).toEqual([{ event: 'PostToolUse', hooks: ['prdt-user-prompt.sh'] }])
})

test('next-turn variant keeps its own wording, and reads the rewrite when one followed the blocked reply', () => {
  const sb = sandbox(OUTLINE)
  const asst = (text: string) => JSON.stringify({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text }] } })
  const run = (lines: string[]) => {
    const tp = path.join(sb.root, 't.jsonl')
    fs.writeFileSync(tp, lines.join('\n') + '\n')
    const ev = { hook_event_name: 'UserPromptSubmit', session_id: 'sx' + lines.length, cwd: sb.proj, prompt: 'next', transcript_path: tp }
    const out = execFileSync('bash', [sb.hook], { input: JSON.stringify(ev), encoding: 'utf8', env: { ...process.env, PRDT_HOME: path.join(sb.root, 'home') } })
    return JSON.parse(out).hookSpecificOutput.additionalContext as string
  }
  const ctx = run([asst(VIOLATING)])
  expect(ctx).toContain('your last user-chat reply broke form=outline')
  expect(ctx).toContain('Leave the sent reply as is')
  expect(ctx).toContain(HOT)
  expect(run([asst(VIOLATING), asst(COMPLIANT)])).not.toContain(TAG)
})

test('a ~1.3 MB reply is still recorded (event travels on stdin, not in the environment)', () => {
  const big = VIOLATING + '\n' + 'x'.repeat(1_300_000)
  const sb = sandbox(OUTLINE)
  expect(stop(sb, big)).toBe('')
  expect(rows(sb)).toHaveLength(1)
})

test('a non-PO Stop leaves before python3 starts (fork-0 case filter)', () => {
  const src = fs.readFileSync(HOOK, 'utf8')
  expect(src).toMatch(/"hook_event_name":"Stop"[\s\S]*?"prdt-po"[\s\S]*?exit 0[\s\S]*?python3 -c/)
})
