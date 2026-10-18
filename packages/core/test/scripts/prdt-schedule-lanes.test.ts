/**
 * prdt-schedule-lanes.test.ts — T-1145 (v1.14 `lanes`): one lane per PRD
 * 합격선 row, computed once (`compute_lanes`) and rendered by `prdt schedule`,
 * `--json` and the dispatch gate's warning. Black-box over the REAL CLI.
 *
 * Design SoT: docs/artifacts/v1.14/lanes-design.html, rules R1–R3 + R6.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PRDT_CLI = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'prdt')
const PYTHON3 = (() => { try { return execFileSync('which', ['python3'], { encoding: 'utf8' }).trim() || null } catch { return null } })()

let tmpRoot: string
let projectDir: string
let prdtHome: string

function run(args: string[], input?: string): { out: string; err: string; status: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir, encoding: 'utf-8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'), env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' },
    })
    return { out, err: '', status: 0 }
  } catch (e: any) {
    return { out: e.stdout ?? '', err: e.stderr ?? '', status: e.status ?? 1 }
  }
}

const GATE_A = 'docs/artifacts/v0.1/a.md'
const GATE_B = 'docs/artifacts/v0.1/b.md'

function lanes(): any[] {
  const r = run(['schedule', '--json'])
  expect(r.status).toBe(0)
  return JSON.parse(r.out).lanes
}

function writeTicket(version: string, id: string, fm: { type?: string; status?: string; assignee?: string; deps?: string; gate?: string } = {}) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${fm.type ?? 'impl'}`,
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-10-15', '---', '', '## problem', '', fm.gate ? `Produces \`${fm.gate}\`.` : 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function writePrd(gateRows: string[]) {
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  const table = gateRows.length === 0 ? [] : ['### 합격선', '', '| 항목 | 문언 |', '|:--|:--|', ...gateRows, '']
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), ['# PRD', '', '## v0.1 — test round', '', ...table, '#### alpha — item', '', 'a', ''].join('\n'))
}

const rowA = `| **합격선** | **레인 A · \`${GATE_A}\` 가 있다** |`
const rowB = `| **합격선** | **레인 B · \`${GATE_B}\` 가 있다** |`

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-lanes-'))
  projectDir = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  expect(run(['init', '--json', '--slug', 'proj', '--yes']).status).toBe(0)
  fs.rmSync(path.join(projectDir, 'docs', 'tickets'), { recursive: true, force: true })
})

afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt schedule lanes', () => {
  test('one gate: one lane over the gate ticket and its deps closure, dropped and other-version tickets not counted', () => {
    writePrd([rowA])
    writeTicket('v0.0', 'T-001', { status: 'done' }) // closure member outside the current folder: not counted
    writeTicket('v0.1', 'T-002', { status: 'done', deps: '[T-001]' })
    writeTicket('v0.1', 'T-003', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-004', { status: 'dropped' })
    writeTicket('v0.1', 'T-005', { deps: '[T-003, T-004]', gate: GATE_A })
    writeTicket('v0.1', 'T-006', {}) // outside the lane
    const [a, ...rest] = lanes()
    expect(rest).toEqual([])
    expect(a).toMatchObject({ name: 'A', gate_ticket: 'T-005', linked: true, done: 1, total: 3, finished: false, working: [], blockers: [] })
    expect(a.tickets).toEqual(['T-001', 'T-002', 'T-003', 'T-005'])
    expect(a.next).toEqual(['T-003'])
    const t = run(['schedule'])
    expect(t.out).toMatch(/^lane A 1\/3 \| next T-003 \(developer\)$/m)
    expect(t.out).toMatch(/outside the lanes — 1 open ticket/)
    expect(t.out).not.toContain('critical path')
  })

  test('two gates: lanes follow table order, a named lane keeps its name, a row with no path is not linked, a second row on the same ticket is not linked with a warning', () => {
    writePrd([rowA, rowB, `| **합격선** | **경로 없는 행** |`, `| **합격선** | **\`${GATE_A}\` 와 같은 티켓** |`])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    writeTicket('v0.1', 'T-002', { gate: GATE_B, deps: '[T-001]' })
    const ls = lanes()
    expect(ls.map((l: any) => [l.name, l.gate_ticket, l.linked])).toEqual([['A', 'T-001', true], ['B', 'T-002', true], ['C', null, false], ['D', null, false]])
    expect(ls[1]).toMatchObject({ done: 0, total: 2 }) // lane B reaches T-001 through deps: counted in both lanes
    expect(ls[0]).toMatchObject({ done: 0, total: 1 })
    expect(ls[3].warning).toMatch(/T-001/)
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane C not linked$/m)
    expect(t).toMatch(/^note: lane D: /m)
  })

  test('PO-owned tickets are in the lane and in `next`', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { status: 'done' })
    writeTicket('v0.1', 'T-002', { assignee: 'po', deps: '[T-001]', gate: GATE_A })
    const [a] = lanes()
    expect(a.next).toEqual(['T-002'])
    expect(a.next_owner).toEqual({ 'T-002': 'po' })
    expect(run(['schedule']).out).toMatch(/^lane A 1\/2 \| next T-002 \(po\)$/m)
  })

  test('user-blocked lane: open decision → decision, open user ticket → request, version folder does not matter', () => {
    writePrd([rowA])
    writeTicket('v0.0', 'T-001', { type: 'decision', assignee: 'user' })
    writeTicket('v0.1', 'T-002', { assignee: 'user' })
    writeTicket('v0.1', 'T-003', { deps: '[T-001, T-002]', gate: GATE_A })
    const [a] = lanes()
    expect(a.blockers).toEqual([{ id: 'T-001', kind: 'decision' }, { id: 'T-002', kind: 'request' }])
    expect(a.next).toEqual([]) // T-003 waits on open deps; the user tickets are not dispatchable
    expect(run(['schedule']).out).toMatch(/^lane A 0\/2 \| working 0 \| blocker T-001 \(decision\) T-002 \(request\)$/m)
  })

  test('lane done: done = total > 0 prints only `done`', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { status: 'done', gate: GATE_A })
    const [a] = lanes()
    expect(a).toMatchObject({ done: 1, total: 1, finished: true, next: [], working: [] })
    expect(run(['schedule']).out).toMatch(/^lane A 1\/1 \| done$/m)
  })

  test('a live dispatch on a lane ticket is `working` and hides `next`', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002]' })
    writeTicket('v0.1', 'T-002', {})
    const md = path.join(prdtHome, 'run', 'dispatches')
    fs.mkdirSync(md, { recursive: true })
    const transcript = path.join(tmpRoot, 'agent.jsonl')
    fs.writeFileSync(transcript, '{"type":"assistant","message":{"model":"claude-x"}}\n')
    fs.writeFileSync(path.join(md, 'a.json'), JSON.stringify({
      agent_id: 'a1', persona: 'developer', ticket_id: 'T-002', dispatch_id: 'd-1',
      project_root: fs.realpathSync(projectDir), since: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), transcript,
    }))
    const [a] = lanes()
    expect(a.working).toEqual(['T-002'])
    expect(a.next).toEqual([])
  })

  test('no 합격선 table: no lanes, text output has no lane lines and keeps the critical path', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', {})
    expect(lanes()).toEqual([])
    const t = run(['schedule']).out
    expect(t).toContain('critical path (1): T-001')
    expect(t).not.toMatch(/^lane /m)
    expect(t).not.toContain('outside the lanes')
  })

  describe('dispatch gate warning (R6)', () => {
    function record(ticketSlug: string) {
      const ctx = { slug: ticketSlug, goal: 'g', change_meta: { files: [], user_facing: false, risk_flags: [], stage: 'build' }, acceptance: 'a', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/prd/PRD.md#v0.1', dispatch_id: 'd-9' }
      const ev = { cwd: projectDir, session_id: 's', tool_use_id: 'toolu_1', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer', prompt: `[ctx] ${JSON.stringify(ctx)}\n\nx` } }
      return run(['schedule', 'record'], JSON.stringify(ev)).out
    }
    test('outside-lane dispatch while a lane has next and nothing running warns with lane name and next ticket', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A })
      writeTicket('v0.1', 'T-002', {})
      const out = record('s-t-002')
      expect(out).toMatch(/outside the lanes/)
      expect(out).toMatch(/lane A next T-001/)
    })
    test('a lane ticket, or an idle-less lane, or no lanes at all: no lane warning', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A })
      writeTicket('v0.1', 'T-002', {})
      expect(record('s-t-001')).toBe('')
      writeTicket('v0.1', 'T-001', { gate: GATE_A, status: 'done' })
      expect(record('s-t-002')).toBe('')
      writePrd([])
      fs.rmSync(path.join(projectDir, '.prdt', 'schedule.jsonl'), { force: true })
      expect(record('s-t-002')).not.toMatch(/outside the lanes/)
    })
  })
})
