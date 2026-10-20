/**
 * prdt-return-check.sh — T-1173 rule 4: a return about to reach the PO has its
 * memory_notes[] appended verbatim, one line each, to the project inbox, by the
 * hook (file write only, nothing printed). Sandbox project only.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-return-check.sh')
const PY = spawnSync('python3', ['--version']).status === 0

let sb: string, root: string, inbox: string, parent: string

function mk(legacy = false): void {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-inbox-')))
  root = path.join(sb, 'proj')
  const wiki = legacy ? path.join(root, 'docs', 'wiki') : path.join(root, 'docs', '_shared', 'wiki')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(wiki, { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{"stage":"build"}')
  inbox = path.join(wiki, 'inbox.md')
  fs.writeFileSync(inbox, '# Inbox\n')
  parent = path.join(sb, 'sess.jsonl')
  fs.writeFileSync(parent, '')
}
function worker(aid: string, slug = 'T-7'): void {
  const dir = path.join(sb, 'sess', 'subagents')
  fs.mkdirSync(dir, { recursive: true })
  const content = `[ctx] ${JSON.stringify({ slug, dispatch_id: 'd-1' })}\n\ndo it`
  fs.writeFileSync(path.join(dir, `agent-${aid}.jsonl`), JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n')
}
const env = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ persona: 'developer', task: 't', summary: 's', confidence: 0.9, ...extra })
function fire(ev: Record<string, unknown>): string {
  const r = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8' })
  expect(r.status).toBe(0)
  return r.stdout
}
const handback = (aid: string, message: string) => fire({ hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback',
  agent_id: aid, agent_type: 'prdt-developer', cwd: root, session_id: 'sess', transcript_path: parent, tool_input: { message } })
const stop = (aid: string, last: string, refire = false) => fire({ hook_event_name: 'SubagentStop', agent_id: aid, agent_type: 'prdt-developer',
  cwd: root, session_id: 'sess', transcript_path: parent, last_assistant_message: last, stop_hook_active: refire })
const added = () => fs.readFileSync(inbox, 'utf8').split('\n').slice(1).filter(Boolean)

describe.skipIf(!PY)('T-1173 rule 4 — memory_notes reach the inbox by the return hook', () => {
  beforeEach(() => mk())

  test('a clean handback appends each note as one dated line under its ticket, prints nothing, never twice', () => {
    worker('a1')
    const msg = env({ memory_notes: ['note one', 'multi\nline  note'] })
    expect(handback('a1', msg)).toBe('')
    const lines = added()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^- \d{4}-\d{2}-\d{2} \[T-7\] note one$/)
    expect(lines[1]).toMatch(/\[T-7\] multi line note$/)
    expect(handback('a1', msg)).toBe('')
    expect(added()).toHaveLength(2)
  })

  test('a return the gate hands back (first violation) appends nothing; its corrected retry does', () => {
    worker('a2')
    const bad = '```json\n' + env({ memory_notes: ['n'] }) + '\n```'
    expect(handback('a2', bad)).toContain('deny')
    expect(added()).toHaveLength(0)
    expect(handback('a2', env({ memory_notes: ['n'] }))).toBe('')
    expect(added()).toEqual([expect.stringMatching(/\[T-7\] n$/)])
  })

  test('a SubagentStop return (no handback) appends too; no notes append nothing', () => {
    worker('a3', 'not-a-ticket')
    expect(stop('a3', env({ memory_notes: ['stop note'] }))).toBe('')
    expect(added()).toEqual([expect.stringMatching(/^- \d{4}-\d{2}-\d{2} stop note$/)])
    worker('a4')
    expect(stop('a4', env())).toBe('')
    expect(added()).toHaveLength(1)
  })

  test('legacy layout writes docs/wiki/inbox.md', () => {
    mk(true)
    worker('a5')
    expect(handback('a5', env({ memory_notes: ['legacy'] }))).toBe('')
    expect(added()).toHaveLength(1)
  })

  test('a return let through at the retry cap with prose around its JSON still yields its memory_notes, silently', () => {
    worker('a6')
    const wrapped = 'Here is my report:\n' + env({ memory_notes: ['capped note', 'a {brace} inside'] }) + '\nDone.'
    const noise = 'see {not json} and {"other": 1}\n'
    expect(handback('a6', '```json\n' + env() + '\n```')).toContain('deny')
    expect(handback('a6', noise + wrapped)).toBe('')
    expect(added()).toEqual([expect.stringMatching(/\[T-7\] capped note$/), expect.stringMatching(/\[T-7\] a \{brace\} inside$/)])
    worker('a7')
    expect(stop('a7', wrapped)).toContain('block')
    expect(stop('a7', wrapped, true)).toBe('')
    expect(added()).toHaveLength(4)
  })

  test('prose with no JSON object carrying memory_notes appends nothing', () => {
    worker('a8')
    expect(handback('a8', 'nope')).toContain('deny')
    expect(handback('a8', 'still nope {"a": 1} {broken')).toBe('')
    expect(added()).toHaveLength(0)
  })
})
