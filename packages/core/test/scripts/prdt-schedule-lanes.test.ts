/**
 * prdt-schedule-lanes.test.ts — T-1145 (v1.14 `lanes`): one lane per PRD
 * 합격선 row, computed once (`compute_lanes`) and rendered by `prdt schedule`,
 * `--json` and the dispatch gate's warning. Black-box over the REAL CLI.
 *
 * Design SoT: docs/artifacts/v1.14/lanes-design.html, rules R1–R3 + R6; rev2/rev3 tab 「T-1178 · 레인 = 합격선 + 자투리」 R7–R12 (T-1184).
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

function liveMarker(ticket: string, persona = 'developer') {
  const md = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(md, { recursive: true })
  const transcript = path.join(tmpRoot, `agent-${ticket}.jsonl`)
  fs.writeFileSync(transcript, '{"type":"assistant","message":{"model":"claude-x"}}\n')
  fs.writeFileSync(path.join(md, `${ticket}.json`), JSON.stringify({
    agent_id: `a-${ticket}`, persona, ticket_id: ticket, dispatch_id: `d-${ticket}`,
    project_root: fs.realpathSync(projectDir), since: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), transcript,
  }))
}

const GATE_A = 'docs/artifacts/v0.1/a.md'
const GATE_B = 'docs/artifacts/v0.1/b.md'

function lanes(): any[] {
  const r = run(['schedule', '--json'])
  expect(r.status).toBe(0)
  return JSON.parse(r.out).lanes
}

function writeTicket(version: string, id: string, fm: { type?: string; status?: string; assignee?: string; deps?: string; gate?: string; extra?: string[] } = {}) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${fm.type ?? 'impl'}`,
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  if (fm.extra) lines.push(...fm.extra)
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
    writeTicket('v0.1', 'T-006', {}) // in no gate lane, no 자투리 record: 기본 레인 (T-1514)
    const [a, j, ...rest] = lanes()
    expect(rest).toEqual([])
    expect(j).toMatchObject({ name: '기본 레인', besteffort: true, default: true, linked: true, gate_ticket: null, done: 0, total: 1, tickets: ['T-006'], next: ['T-006'] })
    expect(a).toMatchObject({ name: 'A', gate_ticket: 'T-005', linked: true, done: 1, total: 3, finished: false, working: [], blockers: [] })
    expect(a.tickets).toEqual(['T-001', 'T-002', 'T-003', 'T-005'])
    expect(a.next).toEqual(['T-003'])
    const t = run(['schedule'])
    expect(t.out).toMatch(/^lane A 1\/3 \| next T-003 \(developer\)$/m)
    expect(t.out).toMatch(/^lane 기본 레인 0\/1 \| next T-006 \(developer\)$/m)
    expect(t.out).not.toContain('outside the lanes')
    expect(t.out).not.toContain('dispatch next')
    expect(t.out).toMatch(/^lanes done: \(none\)$/m)
    expect(t.out).toMatch(/^total 1\/4 = lanes 1\/4 · impl 1\/4$/m)
    expect(t.out).toMatch(/^critical path \(2\): T-003 → T-005$/m) // F1 (T-1184 QA): lane mode prints it too
  })

  test('F3 (QA): a row whose text after 레인 starts with `·` has no name — falls back to A/B/C with the note', () => {
    writePrd([`| **합격선** | **레인 · \`${GATE_A}\` 가 있다 · 둘째 조건** |`])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    const [a] = lanes()
    expect(a.name).toBe('A')
    expect(a.unnamed).toBe(true)
    expect(run(['schedule']).out).toMatch(/^note: lane A has no name$/m)
  })

  test('F1 (QA): lane mode prints the global first pick and the critical path before the lane blocks', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    writeTicket('v0.1', 'T-002', { gate: GATE_B })
    writeTicket('v0.1', 'T-003', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-004', { deps: '[T-003]' })
    const out = run(['schedule']).out.split('\n')
    const fp = out.findIndex((l) => /^first pick: T-002  slack 0  developer  blocks 2$/.test(l))
    expect(fp).toBeGreaterThan(0)
    const cp = out.findIndex((l) => /^critical path \(\d+\): T-002/.test(l))
    expect(cp).toBeGreaterThan(fp)
    expect(out.findIndex((l) => l.startsWith('lane '))).toBeGreaterThan(cp)
  })

  test('two gates: lanes follow table order, a named lane keeps its name, a row with no path is not linked, a second row on the same ticket is not linked with a warning', () => {
    writePrd([rowA, rowB, `| **합격선** | **경로 없는 행** |`, `| **합격선** | **\`${GATE_A}\` 와 같은 티켓** |`])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    writeTicket('v0.1', 'T-002', { gate: GATE_B, deps: '[T-001]' })
    const ls = lanes()
    expect(ls.map((l: any) => [l.name, l.gate_ticket, l.linked])).toEqual([['A', 'T-001', true], ['B', 'T-002', true], ['C', null, false], ['D', null, false]])
    expect(ls[1]).toMatchObject({ done: 0, total: 1, tickets: ['T-002'] }) // R8: T-001 counts once, in the earlier row's lane
    expect(ls[0]).toMatchObject({ done: 0, total: 1, tickets: ['T-001'] })
    expect(ls.map((l: any) => l.unnamed)).toEqual([false, false, true, true])
    expect(ls[3].warning).toMatch(/T-001/)
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane C not linked$/m)
    expect(t).toMatch(/^note: lane D: /m)
    expect(t).toMatch(/^note: lane C has no name$/m)
    expect(t).toMatch(/^note: lane D has no name$/m)
    expect(t).not.toMatch(/^note: lane A has no name$/m)
  })

  test('R11: a multi-word lane name is read whole', () => {
    writePrd([`| **합격선** | **레인 여러 제품 관측 · \`${GATE_A}\` 가 있다** |`, `| **합격선** | **레인  도구 개선  ·  \`${GATE_B}\` 가 있다** |`])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    writeTicket('v0.1', 'T-002', { gate: GATE_B })
    expect(lanes().map((l: any) => [l.name, l.unnamed])).toEqual([['여러 제품 관측', false], ['도구 개선', false]])
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane 여러 제품 관측 0\/1 \| next T-001 \(developer\)$/m)
    expect(t).toMatch(/^lane 도구 개선 0\/1 \| next T-002 \(developer\)$/m)
    expect(t).not.toMatch(/has no name/)
  })

  test('R7/R8/R10 (T-1514): 기본 레인 = this version\'s open+done tickets in no gate lane and no 자투리 record; the lane sums equal the version total', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { status: 'done' })
    writeTicket('v0.1', 'T-002', { gate: GATE_A, deps: '[T-001]' })
    writeTicket('v0.1', 'T-003', { status: 'done', gate: GATE_B, deps: '[T-001]' }) // T-001 already in A
    writeTicket('v0.1', 'T-004', { status: 'done' })
    writeTicket('v0.1', 'T-005', { type: 'design', assignee: 'designer' })
    writeTicket('v0.1', 'T-006', { status: 'dropped' })
    writeTicket('v0.0', 'T-007', {}) // another version: never 기본 레인
    const ls = lanes()
    expect(ls.map((l: any) => [l.name, l.done, l.total, l.finished])).toEqual([['A', 1, 2, false], ['B', 1, 1, true], ['기본 레인', 1, 2, false]])
    expect(ls[2].tickets).toEqual(['T-004', 'T-005'])
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane B 1\/1 \| done$/m)
    expect(t).toMatch(/^lanes done: B 1\/1$/m)
    expect(t).toMatch(/^total 3\/5 = lanes 3\/5 · impl 3\/4$/m)
  })

  test('R7: every version ticket in a gate lane → no 기본 레인, no 자투리 lane', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    expect(lanes().map((l: any) => l.name)).toEqual(['A'])
    const t = run(['schedule']).out
    expect(t).not.toContain('자투리')
    expect(t).not.toContain('기본 레인')
  })

  test('R10: two finished lanes on one `lanes done:` line, table order, joined with ` · `', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { status: 'done', gate: GATE_A })
    writeTicket('v0.1', 'T-002', { status: 'done', gate: GATE_B })
    expect(run(['schedule']).out).toMatch(/^lanes done: A 1\/1 · B 1\/1$/m)
  })

  test('R12: a lane queue is `prdt schedule` order (slack, then blocks), not ticket-number order; same-owner runs share one owner tag', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-002', {})
    writeTicket('v0.1', 'T-003', {})
    writeTicket('v0.1', 'T-005', { deps: '[T-003]' })
    writeTicket('v0.1', 'T-010', { gate: GATE_A, deps: '[T-002, T-003, T-005]' })
    const [a] = lanes()
    expect(a.ready).toEqual(['T-003', 'T-002'])
    expect(a.next).toEqual(['T-003', 'T-002'])
    expect(run(['schedule']).out).toMatch(/^lane A 0\/4 \| next T-003 T-002 \(developer\)$/m)
  })

  test('R6: blocked rows name their lane', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002]' })
    writeTicket('v0.1', 'T-002', {})
    writeTicket('v0.1', 'T-003', {})
    writeTicket('v0.1', 'T-004', { deps: '[T-003]' })
    const t = run(['schedule']).out
    expect(t).toMatch(/^blocked \(deps open\):\n\s+T-001  A  waits T-002\n\s+T-004  기본 레인  waits T-003$/m)
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

  // T-1387: SubagentStop stamps `stopped_at` even when another Stop hook blocks that
  // stop (measured 2026-11-03: the worker kept running). The worker's own transcript
  // tells: an assistant record after the stop second means it is still at work.
  const iso = (ms: number) => new Date(ms).toISOString()
  const sec = (ms: number) => iso(ms).replace(/\.\d{3}Z$/, 'Z')
  function stoppedMarker(ticket: string, stoppedMs: number, records: string[]) {
    const md = path.join(prdtHome, 'run', 'dispatches')
    fs.mkdirSync(md, { recursive: true })
    const transcript = path.join(tmpRoot, `agent-${ticket}.jsonl`)
    fs.writeFileSync(transcript, records.join('\n') + '\n')
    fs.writeFileSync(path.join(md, `${ticket}.json`), JSON.stringify({
      agent_id: `a-${ticket}`, persona: 'developer', ticket_id: ticket, dispatch_id: `d-${ticket}`,
      project_root: fs.realpathSync(projectDir), since: sec(stoppedMs - 20 * 60 * 1000), transcript,
      stopped_at: sec(stoppedMs),
    }))
  }
  const rec = (type: string, ms: number) => JSON.stringify({ type, timestamp: iso(ms), message: { model: 'claude-x' } })

  test('T-1387: a stopped marker whose worker wrote an assistant record after the stop is `working`', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002]' })
    writeTicket('v0.1', 'T-002', {})
    const stop = Date.now() - 60 * 1000
    stoppedMarker('T-002', stop, [rec('assistant', stop - 900), rec('user', stop + 800), rec('assistant', stop + 3000), rec('attachment', stop + 4000)])
    const [a] = lanes()
    expect(a.working).toEqual(['T-002'])
    expect(run(['schedule']).out).toMatch(/^lane A 0\/2 \| working T-002 \(developer\)$/m)
  })

  test('T-1387: a worker that truly finished (records after the stop are not assistant turns) leaves `working`', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002]' })
    writeTicket('v0.1', 'T-002', {})
    const stop = Date.now() - 60 * 1000
    // the final assistant record lands inside the stop's own second (stopped_at is second-truncated)
    stoppedMarker('T-002', stop, [rec('assistant', stop - 5000), rec('assistant', Math.floor(stop / 1000) * 1000 + 900), rec('attachment', stop + 2000), rec('user', stop + 2500)])
    const [a] = lanes()
    expect(a.working).toEqual([])
  })

  test('no 합격선 table, no record: one 기본 레인 line, the rank list and critical path stay', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', {})
    // T-1513: the default lane is the only lane — `besteffort` + `default`, every open+done ticket
    expect(lanes()).toMatchObject([{ name: '기본 레인', besteffort: true, default: true, done: 0, total: 1, tickets: ['T-001'] }])
    const t = run(['schedule']).out
    expect(t).toContain('critical path (1): T-001')
    expect(t).toMatch(/^lane 기본 레인 0\/1 — no lane record in v0\.1$/m)
    expect(t.match(/^lane /gm)).toHaveLength(1)
    expect(t).not.toContain('outside the lanes')
  })

  describe('T-1145 QA fail rows (R6 / R3 / T-1158 = B)', () => {
    test('lane mode: no separate `PO work:` line; an out-of-lane PO ticket is in the 기본 레인 queue with its owner', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A })
      writeTicket('v0.1', 'T-002', { assignee: 'po' })
      writeTicket('v0.1', 'T-003', {})
      writeTicket('v0.1', 'T-004', {})
      const t = run(['schedule']).out
      expect(t).not.toMatch(/^PO work:/m)
      expect(t).toMatch(/^lane 기본 레인 0\/3 \| next T-002 \(po\) T-003 T-004 \(developer\)$/m)
      expect(t).toMatch(/^waiting on user:/m)
      expect(t).toMatch(/^in flight:/m)
    })

    test('no lanes: the old `PO work:` line stays', () => {
      writePrd([])
      writeTicket('v0.1', 'T-001', { assignee: 'po' })
      const t = run(['schedule']).out
      expect(t).toMatch(/^PO work: T-001$/m)
    })

    test('working shows the persona of the running dispatch', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002]' })
      writeTicket('v0.1', 'T-002', {})
      liveMarker('T-002', 'developer')
      const [a] = lanes()
      expect(a.working_owner).toEqual({ 'T-002': 'developer' })
      expect(run(['schedule']).out).toMatch(/^lane A 0\/2 \| working T-002 \(developer\)$/m)
    })

    test('T-1158: ready tickets shown while working (text + JSON `ready`), statusline `next` stays empty', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-002, T-003, T-004]' })
      writeTicket('v0.1', 'T-002', {})
      writeTicket('v0.1', 'T-003', {})
      writeTicket('v0.1', 'T-004', { deps: '[T-002]' })
      liveMarker('T-002', 'developer')
      const [a] = lanes()
      expect(a.working).toEqual(['T-002'])
      expect(a.next).toEqual([])
      expect(a.ready).toEqual(['T-003'])
      expect(a.ready_owner).toEqual({ 'T-003': 'developer' })
      expect(run(['schedule']).out).toMatch(/^lane A 0\/4 \| working T-002 \(developer\) \| ready T-003 \(developer\)$/m)
    })

    test('T-1158: idle lane — `ready` equals `next` in JSON, text unchanged', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A })
      const [a] = lanes()
      expect(a.ready).toEqual(['T-001'])
      expect(a.next).toEqual(['T-001'])
      expect(run(['schedule']).out).toMatch(/^lane A 0\/1 \| next T-001 \(developer\)$/m)
    })
  })

  describe('dispatch gate warning (R6)', () => {
    function record(ticketSlug: string) {
      const ctx = { slug: ticketSlug, goal: 'g', change_meta: { files: [], user_facing: false, risk_flags: [], stage: 'build' }, acceptance: 'a', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/prd/PRD.md#v0.1', dispatch_id: 'd-9' }
      const ev = { cwd: projectDir, session_id: 's', tool_use_id: 'toolu_1', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer', prompt: `[ctx] ${JSON.stringify(ctx)}\n\nx` } }
      return run(['schedule', 'record'], JSON.stringify(ev)).out
    }
    test('a 기본 레인 dispatch while a gate lane has next and nothing running warns with lane name and next ticket (R9)', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A })
      writeTicket('v0.1', 'T-002', {})
      const out = record('s-t-002')
      expect(out).toMatch(/outside the lanes/)
      expect(out).toMatch(/lane A next T-001/)
      expect(out).not.toMatch(/lane 자투리 next/)
    })
    test('an idle 기본 레인 never triggers the warning', () => {
      writePrd([rowA])
      writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-003]' })
      writeTicket('v0.1', 'T-002', {})
      writeTicket('v0.1', 'T-003', {})
      liveMarker('T-003')
      expect(record('s-t-002')).toBe('')
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

// T-1359 (v1.16 L4, design docs/productune/artifacts/v1.16/lane-records-design.md §1–§3): a lane is
// a gate ticket's `lane:` frontmatter record; the PRD 합격선 table is read only when the
// version holds no record.
describe.skipIf(!PYTHON3)('prdt schedule lanes from lane records (T-1359)', () => {
  const rec = (name: string, gate?: string) => [`lane: ${name}`, ...(gate ? [`gate: ${gate}`] : [])]

  test('records with no 합격선 table: one lane per record, gate-ticket number order, `gate:` is gate_path', () => {
    writePrd([])
    writeTicket('v0.1', 'T-010', { type: 'ops', assignee: 'po', deps: '[T-011]', extra: rec('L1 결정/승인', GATE_A) })
    writeTicket('v0.1', 'T-002', { type: 'ops', assignee: 'po', deps: '[T-003]', extra: rec('L9 뒤 이름') })
    writeTicket('v0.1', 'T-003', { status: 'done' })
    writeTicket('v0.1', 'T-011', {})
    writeTicket('v0.1', 'T-020', {})
    const ls = lanes()
    expect(ls.map((l) => l.name)).toEqual(['L9 뒤 이름', 'L1 결정/승인', '기본 레인'])
    expect(ls[0]).toMatchObject({ gate_ticket: 'T-002', gate_path: null, linked: true, unnamed: false, tickets: ['T-002', 'T-003'], done: 1, total: 2 })
    expect(ls[1]).toMatchObject({ gate_ticket: 'T-010', gate_path: GATE_A, linked: true, tickets: ['T-010', 'T-011'] })
    expect(ls[2].tickets).toEqual(['T-020'])
  })

  test('records win over the 합격선 table; a body naming the gate path is no gate', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { type: 'decision', assignee: 'po', status: 'done', gate: GATE_A })
    writeTicket('v0.1', 'T-002', { type: 'ops', assignee: 'po', deps: '[T-003]', extra: rec('R1', GATE_A) })
    writeTicket('v0.1', 'T-003', {})
    const ls = lanes()
    expect(ls.map((l) => l.name)).toEqual(['R1', '기본 레인'])
    expect(ls[0]).toMatchObject({ gate_ticket: 'T-002', gate_path: GATE_A, tickets: ['T-002', 'T-003'] })
    expect(ls[1].tickets).toEqual(['T-001'])
  })

  test('a dropped gate ticket takes its lane away; a record in another version is not this version\'s lane', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { type: 'ops', assignee: 'po', status: 'dropped', deps: '[T-002]', extra: rec('gone') })
    writeTicket('v0.1', 'T-002', {})
    writeTicket('v0.0', 'T-000', { type: 'ops', assignee: 'po', status: 'done', extra: rec('old') })
    writeTicket('v0.1', 'T-003', { gate: GATE_A })
    // no live record in v0.1 → the table is read exactly as before
    const ls = lanes()
    expect(ls.map((l) => l.name)).toEqual(['A', '기본 레인'])
    expect(ls[0].gate_ticket).toBe('T-003')
  })

  test('two records with one name: the later lane carries a warning', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', { type: 'ops', assignee: 'po', extra: rec('same') })
    writeTicket('v0.1', 'T-002', { type: 'ops', assignee: 'po', extra: rec('same') })
    const ls = lanes()
    expect(ls.map((l) => l.name)).toEqual(['same', 'same'])
    expect(ls[0].warning).toBeNull()
    expect(ls[1].warning).toMatch(/same/)
  })

  // T-1365 (approved wording A, docs/productune/artifacts/v1.16/lane-records-build-entry-step.md §A-2)
  const NUDGE = 'lanes: from the PRD 합격선 table, no `lane:` record in v0.1 — write the records (build-entry step 4)'
  const setStage = (stage: string) => {
    const p = path.join(projectDir, '.prdt', 'po-state.json')
    fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf-8')), stage }))
  }

  test('T-1365: build stage, 합격선 rows, no record → the nudge line right below `lanes done:`', () => {
    setStage('build')
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    const out = run(['schedule']).out.split('\n')
    const i = out.findIndex((l) => l.startsWith('lanes done: '))
    expect(i).toBeGreaterThan(-1)
    expect(out[i + 1]).toBe(NUDGE)
    expect(out.filter((l) => l === NUDGE)).toHaveLength(1)
    const j = JSON.parse(run(['schedule', '--json']).out)
    expect(JSON.stringify(j)).not.toContain('build-entry step 4')
  })

  test('T-1365: no nudge once a record exists, outside build, or with no 합격선 row', () => {
    setStage('build')
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A })
    writeTicket('v0.1', 'T-002', { type: 'ops', assignee: 'po', status: 'done', extra: rec('R1', GATE_A) })
    expect(run(['schedule']).out).not.toContain('build-entry step 4')
    fs.rmSync(path.join(projectDir, 'docs', 'tickets', 'v0.1', 'T-002.md'))
    setStage('define')
    expect(run(['schedule']).out).not.toContain('build-entry step 4')
    setStage('build')
    writePrd([])
    expect(run(['schedule']).out).not.toContain('build-entry step 4')
    writePrd([rowA])
    expect(run(['schedule']).out).toContain(NUDGE) // control: the same fixture prints it
  })

  test('a lane ticket inside an earlier lane belongs to the earlier lane (R8)', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', { type: 'ops', assignee: 'po', deps: '[T-003]', extra: rec('one') })
    writeTicket('v0.1', 'T-002', { type: 'ops', assignee: 'po', deps: '[T-003, T-004]', extra: rec('two') })
    writeTicket('v0.1', 'T-003', {})
    writeTicket('v0.1', 'T-004', {})
    const ls = lanes()
    expect(ls[0].tickets).toEqual(['T-001', 'T-003'])
    expect(ls[1].tickets).toEqual(['T-002', 'T-004'])
  })
})

// T-1514 (T-1508 = C, docs/productune/artifacts/v1.16.4/default-lane-options.md §(a′) · §(b)): 자투리 is a
// `lane: 자투리` record whose deps the user chose; a version with lane records shows every ticket in no
// record as 기본 레인, last. The record ticket itself is no work: no row, no lane cell, no total.
describe.skipIf(!PYTHON3)('자투리 record and the 기본 레인 rest (T-1514)', () => {
  const rec = (name: string) => [`lane: ${name}`]
  const NOTE = /^note: 기본 레인 \d+ open ticket\(s\) in no lane record and not in 자투리: /m
  function gate() {
    writeTicket('v0.1', 'T-010', { type: 'ops', assignee: 'po', deps: '[T-011]', extra: rec('L1 묶음') })
    writeTicket('v0.1', 'T-011', {})
  }
  function jat(id = 'T-020', deps = '[T-021, T-022]') {
    writeTicket('v0.1', id, { type: 'ops', assignee: 'po', deps, extra: rec('자투리') })
  }
  function chosenAndRest() {
    writeTicket('v0.1', 'T-021', {})
    writeTicket('v0.1', 'T-022', { status: 'done' })
    writeTicket('v0.1', 'T-030', {})
    writeTicket('v0.1', 'T-031', { status: 'done' })
  }
  const sched = () => JSON.parse(run(['schedule', '--json']).out)

  test('both: gate lanes, then 자투리 = the record\'s deps, then 기본 레인 last; the record is in no row, cell or total', () => {
    writePrd([])
    gate(); jat(); chosenAndRest()
    const s = sched()
    expect(s.lanes.map((l: any) => [l.name, l.done, l.total, l.besteffort, l.default === true])).toEqual([
      ['L1 묶음', 0, 2, false, false], ['자투리', 1, 2, true, false], ['기본 레인', 1, 2, true, true]])
    expect(s.lanes[1]).toMatchObject({ tickets: ['T-021', 'T-022'], gate_ticket: null, linked: true, next: ['T-021'] })
    expect(s.lanes[2].tickets).toEqual(['T-030', 'T-031'])
    expect(s.lanes_from).toBe('records')
    expect(s.totals).toMatchObject({ done: 2, total: 6 })
    expect(s.rows.map((r: any) => r.id)).not.toContain('T-020')
    const t = run(['schedule']).out
    const ls = t.split('\n').filter((l) => l.startsWith('lane '))
    expect(ls).toEqual(['lane L1 묶음 0/2 | next T-011 (developer)', 'lane 자투리 1/2 | next T-021 (developer)',
      'lane 기본 레인 1/2 | next T-030 (developer)'])
    expect(t).toMatch(/^note: 기본 레인 1 open ticket\(s\) in no lane record and not in 자투리: T-030$/m)
    expect(t).toMatch(/^total 2\/6 = lanes 2\/6 · impl 2\/5$/m)
    expect(t).not.toContain('T-020')
  })

  test('records, no 자투리 record: every ticket in no record is 기본 레인 (never named 자투리), with the note', () => {
    writePrd([])
    gate(); chosenAndRest()
    const s = sched()
    expect(s.lanes.map((l: any) => [l.name, l.done, l.total])).toEqual([['L1 묶음', 0, 2], ['기본 레인', 2, 4]])
    expect(s.lanes[1]).toMatchObject({ besteffort: true, default: true, tickets: ['T-021', 'T-022', 'T-030', 'T-031'] })
    const t = run(['schedule']).out
    expect(t).not.toContain('자투리 ')
    expect(t).toMatch(/^lane 기본 레인 2\/4 \| next T-021 T-030 \(developer\)$/m)
    expect(t).toMatch(/^note: 기본 레인 2 open ticket\(s\) in no lane record and not in 자투리: T-021 T-030$/m)
    expect(t).toMatch(/^total 2\/6 = lanes 2\/6 · impl 2\/5$/m)
  })

  test('a 자투리 record and nothing outside: no 기본 레인, no note', () => {
    writePrd([])
    gate(); jat()
    writeTicket('v0.1', 'T-021', {})
    writeTicket('v0.1', 'T-022', { status: 'done' })
    const s = sched()
    expect(s.lanes.map((l: any) => l.name)).toEqual(['L1 묶음', '자투리'])
    expect(s.totals).toMatchObject({ done: 1, total: 4 })
    const t = run(['schedule']).out
    expect(t).not.toContain('기본 레인')
    expect(t).not.toMatch(NOTE)
    expect(t).toMatch(/^total 1\/4 = lanes 1\/4 · impl 1\/3$/m)
  })

  test('a 자투리 record alone (no gate record, no table): lane mode over 자투리 + 기본 레인, from `records`', () => {
    writePrd([])
    jat(); chosenAndRest()
    const s = sched()
    expect(s.lanes.map((l: any) => [l.name, l.done, l.total])).toEqual([['자투리', 1, 2], ['기본 레인', 1, 2]])
    expect(s.lanes_from).toBe('records')
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane 자투리 1\/2 \| next T-021 \(developer\)$/m)
    expect(t).not.toMatch(/^dispatch next:/m)
    expect(t).not.toContain('no lane record in v0.1')
  })

  test('a 자투리 record leaves the 합격선 table in charge (`table`), and a ticket the gate holds stays in the gate lane', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { gate: GATE_A, deps: '[T-021]' })
    jat(); chosenAndRest()
    const s = sched()
    expect(s.lanes.map((l: any) => [l.name, l.tickets])).toEqual([
      ['A', ['T-001', 'T-021']], ['자투리', ['T-022']], ['기본 레인', ['T-030', 'T-031']]])
    expect(s.lanes_from).toBe('table')
  })

  test('no record at all: T-1513\'s one 기본 레인 line, no note, rank list kept', () => {
    writePrd([])
    chosenAndRest()
    const t = run(['schedule']).out
    expect(t).toMatch(/^lane 기본 레인 2\/4 — no lane record in v0\.1$/m)
    expect(t).not.toMatch(NOTE)
    expect(t).toMatch(/^dispatch next:/m)
  })

  test('a ticket depending on the 자투리 record does not wait on it', () => {
    writePrd([])
    jat('T-020', '[T-021]')
    writeTicket('v0.1', 'T-021', {})
    writeTicket('v0.1', 'T-040', { deps: '[T-020]' })
    const s = sched()
    expect(s.rows.find((r: any) => r.id === 'T-040')).toMatchObject({ state: 'ready', waits_on: [] })
    expect(s.lanes.find((l: any) => l.name === '기본 레인').next).toEqual(['T-040'])
  })

  test('two 자투리 records in one version: one 자투리 lane over both, a warning; `prdt doctor` names them', () => {
    writePrd([])
    jat('T-020', '[T-021]')
    jat('T-025', '[T-022]')
    writeTicket('v0.1', 'T-021', {})
    writeTicket('v0.1', 'T-022', {})
    const s = sched()
    expect(s.lanes.map((l: any) => [l.name, l.tickets])).toEqual([['자투리', ['T-021', 'T-022']]])
    expect(s.lanes[0].warning).toMatch(/2 자투리 records in v0\.1 \(T-020, T-025\)/)
    expect(run(['schedule']).out).toMatch(/^note: lane 자투리: 2 자투리 records/m)
    const d = run(['doctor'])
    expect(d.out + d.err).toContain('lane: v0.1 has 2 자투리 lane records (T-020, T-025)')
    fs.rmSync(path.join(projectDir, 'docs', 'tickets', 'v0.1', 'T-025.md'))
    const d1 = run(['doctor'])
    expect(d1.out + d1.err).not.toContain('자투리 lane records')
  })

  describe('off-lane dispatch warning: 기본 레인 is treated as 자투리 — never a gate', () => {
    function record(ticketSlug: string) {
      const ctx = { slug: ticketSlug, goal: 'g', change_meta: { files: [], user_facing: false, risk_flags: [], stage: 'build' }, acceptance: 'a', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/prd/PRD.md#v0.1', dispatch_id: 'd-9' }
      const ev = { cwd: projectDir, session_id: 's', tool_use_id: 'toolu_1', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer', prompt: `[ctx] ${JSON.stringify(ctx)}\n\nx` } }
      return run(['schedule', 'record'], JSON.stringify(ev)).out
    }
    test('a 자투리 ticket and a 기본 레인 ticket warn alike, naming only the idle gate lane; a gate lane ticket does not', () => {
      writePrd([])
      gate(); jat(); chosenAndRest()
      const j = record('s-t-021')
      const d = record('s-t-030')
      for (const out of [j, d]) {
        expect(out).toMatch(/outside the lanes/)
        expect(out).toMatch(/lane L1 묶음 next T-011/)
        expect(out).not.toMatch(/lane (자투리|기본 레인) next/)
      }
      expect(j.replace('T-021', 'X')).toBe(d.replace('T-030', 'X'))
      expect(record('s-t-011')).toBe('')
    })
    test('only 자투리 and 기본 레인 (no gate lane): no lane warning', () => {
      writePrd([])
      jat(); chosenAndRest()
      expect(record('s-t-030')).not.toMatch(/outside the lanes/)
      expect(record('s-t-021')).not.toMatch(/outside the lanes/)
    })
  })
})
