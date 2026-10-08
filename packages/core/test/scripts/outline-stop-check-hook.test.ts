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

test('a violating reply is blocked once, with the register-check notice naming the lines', () => {
  const out = stop(sandbox(OUTLINE), VIOLATING)
  const r = JSON.parse(out)
  expect(r.decision).toBe('block')
  expect(r.reason).toContain(TAG)
  expect(r.reason).toContain('lines 2, 3')
})

test('the point-block notice (T-869) rides the same block', () => {
  const reply = '- 하나\n  · 가\n- 둘\n  · 나'
  const r = JSON.parse(stop(sandbox(OUTLINE), reply))
  expect(r.decision).toBe('block')
  expect(r.reason).toContain('point block(s)')
})

test('a compliant reply passes', () => {
  expect(stop(sandbox(OUTLINE), COMPLIANT)).toBe('')
})

test('T-789: an English "A …" opener is not an item, and does not block a compliant reply', () => {
  expect(stop(sandbox(OUTLINE), ENGLISH_A)).toBe('')
})

test('a second violating reply passes (stop_hook_active)', () => {
  expect(stop(sandbox(OUTLINE), VIOLATING, { stop_hook_active: true })).toBe('')
})

test('a stop with no reply text passes (tool-only turn)', () => {
  const sb = sandbox(OUTLINE)
  expect(stop(sb, '')).toBe('')
  expect(stop(sb, undefined)).toBe('')
})

test('only while form=outline is bound', () => {
  expect(stop(sandbox(PROSE), VIOLATING)).toBe('')
})

test('only the PO: a worker or plain session stop passes', () => {
  const sb = sandbox(OUTLINE)
  expect(stop(sb, VIOLATING, { agent_type: 'prdt-developer' })).toBe('')
  expect(stop(sb, VIOLATING, { agent_type: undefined })).toBe('')
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
})

test('the manifest registers prdt-user-prompt.sh on Stop beside the question check', () => {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const stops = m.registrations.filter((r: any) => r.event === 'Stop')
  expect(stops).toEqual([
    { event: 'Stop', hooks: ['prdt-question-check.sh'] },
    { event: 'Stop', hooks: ['prdt-user-prompt.sh'] },
  ])
})
