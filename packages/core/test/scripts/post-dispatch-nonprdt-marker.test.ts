/**
 * T-1196: a non-`prdt-` subagent / fork gets the run/dispatches in-flight marker
 * at SubagentStart and a stamp + schedule `stop` row at SubagentStop, so the
 * gate's inflight_max and per-tier caps count it while it runs. prdt-* behaviour
 * is covered by post-dispatch-dispatch-marker.test.ts and stays unchanged.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-post-dispatch.sh')
const GATE = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-dispatch-gate.sh')

let root: string
let home: string
const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p))

function markerFile(aid: string): string {
  return path.join(home, 'run', 'dispatches', `${crypto.createHash('sha256').update(aid, 'utf8').digest('hex')}.json`)
}
function hook(ev: Record<string, unknown>) {
  const res = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', env: { ...process.env, PRDT_HOME: home }, timeout: subprocessTimeout('hook') })
  expect(res.status).toBe(0)
  expect(res.stderr).toBe('')
  expect(res.stdout).toBe('')
}
function start(aid: string, agentType?: string, transcript?: string) {
  hook({ session_id: 's1', cwd: root, agent_id: aid, hook_event_name: 'SubagentStart', ...(agentType !== undefined ? { agent_type: agentType } : {}), ...(transcript ? { transcript_path: transcript } : {}) })
}
function stop(aid: string, agentType?: string) {
  hook({ session_id: 's1', cwd: root, agent_id: aid, hook_event_name: 'SubagentStop', stop_hook_active: false, last_assistant_message: 'done', ...(agentType !== undefined ? { agent_type: agentType } : {}) })
}
const marker = (aid: string) => JSON.parse(fs.readFileSync(markerFile(aid), 'utf8'))

beforeEach(() => {
  root = fs.realpathSync(tmp('prdt-t1196-proj-'))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.14', current_task: null }))
  home = tmp('prdt-t1196-home-')
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(home, { recursive: true, force: true })
})

describe('T-1196: non-prdt start marker and stop stamp', () => {
  test('Explore: marker at start (persona = its type), stamped at stop, nothing else written', () => {
    start('ex1', 'Explore')
    expect(marker('ex1')).toMatchObject({ agent_id: 'ex1', persona: 'Explore', subagent_type: 'Explore', project_root: root })
    expect(marker('ex1').stopped_at).toBeUndefined()
    stop('ex1', 'Explore')
    expect(marker('ex1').stopped_at).toBeTruthy()
    for (const f of ['sessions.json', 'turns.jsonl']) expect(fs.existsSync(path.join(root, '.prdt', f))).toBe(false)
  })

  test('a fork (no agent_type) is a marker typed `fork`', () => {
    start('fk1')
    expect(marker('fk1')).toMatchObject({ persona: 'fork', subagent_type: 'fork' })
    stop('fk1')
    expect(marker('fk1').stopped_at).toBeTruthy()
  })

  test('workflow-subagent is never counted', () => {
    start('wf1', 'workflow-subagent')
    expect(fs.existsSync(markerFile('wf1'))).toBe(false)
  })

  test('pairs with its own parent Agent call by subagent_type and takes its model', () => {
    const t = path.join(root, 'parent.jsonl')
    fs.writeFileSync(t, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: 'Agent', input: { subagent_type: 'Explore', prompt: 'sweep', model: 'sonnet' } }] } }) + '\n')
    start('ex2', 'Explore', t)
    expect(marker('ex2')).toMatchObject({ tool_use_id: 'toolu_x', model: 'sonnet', pairing: 'confirmed' })
  })

  test('the stop row joins the gate-written dispatch row by tool_use_id', () => {
    const t = path.join(root, 'parent.jsonl')
    fs.writeFileSync(t, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_y', name: 'Agent', input: { subagent_type: 'Explore', prompt: 'sweep', model: 'sonnet' } }] } }) + '\n')
    fs.writeFileSync(path.join(root, '.prdt', 'schedule.jsonl'), JSON.stringify({ kind: 'dispatch', tool_use_id: 'toolu_y', persona: 'Explore' }) + '\n')
    start('ex3', 'Explore', t)
    stop('ex3', 'Explore')
    const rows = fs.readFileSync(path.join(root, '.prdt', 'schedule.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(rows[1]).toMatchObject({ kind: 'stop', tool_use_id: 'toolu_y', persona: 'Explore', outcome: 'no-envelope' })
  })

  test('the gate counts it while running: inflight_max 1 + one live Explore marker denies the next dispatch, none once stopped', () => {
    fs.writeFileSync(path.join(home, 'dispatch-caps.json'), JSON.stringify({ inflight_max: 0 }))
    const tr = path.join(home, 'agent-ex4.jsonl')
    fs.writeFileSync(tr, '{"type":"assistant","message":{"model":"claude-sonnet-5","content":[]}}\n')
    start('ex4', 'Explore')
    const m = marker('ex4'); m.transcript = tr; fs.writeFileSync(markerFile('ex4'), JSON.stringify(m))
    const ev = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent', cwd: root, tool_input: { subagent_type: 'Explore', prompt: 'x', model: 'haiku' } })
    const gate = () => spawnSync('bash', [GATE], { input: ev, encoding: 'utf8', cwd: root, env: { ...process.env, PRDT_HOME: home } }).stdout
    expect(gate()).toContain('in-flight')
    stop('ex4', 'Explore')
    expect(gate()).toBe('')
  })
})
