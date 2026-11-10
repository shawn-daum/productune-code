/**
 * prdt-work-ticket-options.test.ts — T-1491: a work ticket (design|impl|qa) with a
 * filled `## options` table and no user quote under `### 확인` waits on the user
 * (schedule state `waiting-user`, `prdt tickets --waiting`), and `prdt tickets
 * options <id>` / `tickets new --options` put the options table frame in.
 * Black-box over the real `prdt` CLI (idiom: prdt-schedule.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'
import { buildHomeGraph, waitLists, ticketBodyWaitsOnOptions } from '../../../viewer/lib/home-graph.mjs'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let tmpRoot: string
let projectDir: string
let prdtHome: string

function run(args: string[]): { out: string; err: string; status: number } {
  try {
    const out = execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'),
      env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en' },
    })
    return { out, err: '', status: 0 }
  } catch (e: any) {
    return { out: e.stdout ?? '', err: e.stderr ?? '', status: e.status ?? 1 }
  }
}

function states(): Record<string, string> {
  const r = run(['schedule', '--json'])
  expect(r.status).toBe(0)
  return Object.fromEntries(JSON.parse(r.out).rows.map((x: any) => [x.id, x.state]))
}

const FILLED = '| 선택지 | pros | cons | trade-off | recommend |\n|---|---|---|---|---|\n| A | 빠름 | 거침 | - | yes |\n| | | | | |\n'
const EMPTY = '| 선택지 | pros | cons | trade-off | recommend |\n|---|---|---|---|---|\n| | | | | |\n| | | | | |\n'

// `confirm` = the user's quote under `## problem` → `### 확인` (the request read-back);
// `optConfirm` = a `### 확인` slice INSIDE `## options` (the fork's answer, T-1491).
function writeTicket(id: string, o: { type?: string; assignee?: string; options?: string; confirm?: string; confirmHeading?: string; optConfirm?: string; optConfirmHeading?: string }) {
  const dir = path.join(projectDir, 'docs', 'tickets', 'v0.1')
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${o.type ?? 'impl'}`,
    'status: open', `assignee: ${o.assignee ?? 'developer'}`, 'created: 2026-11-10', '---', '', '## problem', '', 'x', '']
  if (o.confirm !== undefined) lines.push(`### ${o.confirmHeading ?? '확인'}`, '', o.confirm, '')
  if (o.options !== undefined) {
    lines.push('## options', '', o.options)
    if (o.optConfirm !== undefined) lines.push(`### ${o.optConfirmHeading ?? '확인'}`, '', o.optConfirm, '')
  }
  lines.push('## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-wt-options-'))
  projectDir = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(projectDir, { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  expect(run(['init', '--json', '--slug', 'proj', '--yes']).status).toBe(0)
  fs.rmSync(path.join(projectDir, 'docs', 'tickets'), { recursive: true, force: true })
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), '# PRD\n\n## v0.1 — test round\n\n#### a — x\n\nx\n')
})

afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('work ticket options waits on the user (T-1491)', () => {
  test('filled options + no quote in the options section → waiting-user for design|impl|qa; listed in schedule text and --waiting', () => {
    writeTicket('T-001', { type: 'impl', options: FILLED, confirm: '' })
    writeTicket('T-002', { type: 'design', options: FILLED })
    writeTicket('T-003', { type: 'qa', options: FILLED, optConfirm: '', optConfirmHeading: 'confirm' })
    const st = states()
    expect(st).toEqual({ 'T-001': 'waiting-user', 'T-002': 'waiting-user', 'T-003': 'waiting-user' })
    expect(run(['schedule']).out).toMatch(/^waiting on user: T-001 T-002 T-003$/m)
    expect(run(['schedule']).out).toMatch(/^dispatch next: \(none\)$/m)
  })

  test('a user quote in the options section\'s own ### 확인 releases the ticket (all quote shapes, label note allowed)', () => {
    writeTicket('T-001', { options: FILLED, optConfirm: '*"A로 가"* (2026-11-10)' })
    writeTicket('T-002', { options: FILLED, optConfirm: '“B 로 해”', optConfirmHeading: '확인 (바로 진행)' })
    writeTicket('T-003', { options: FILLED, optConfirm: '「C」' })
    // a PO line with no quote does not release it
    writeTicket('T-004', { options: FILLED, optConfirm: 'PO 가 A 로 읽음' })
    const st = states()
    expect(st['T-001']).toBe('ready')
    expect(st['T-002']).toBe('ready')
    expect(st['T-003']).toBe('ready')
    expect(st['T-004']).toBe('waiting-user')
  })

  test('T-1491 shape: a quote under problem ### 확인 (filled before the table existed) does not release a filled options table', () => {
    writeTicket('T-001', { options: FILLED, confirm: '*"바로 진행"* (2026-11-10)' })
    // the same ticket answered inside options leaves the state
    writeTicket('T-002', { options: FILLED, confirm: '*"바로 진행"*', optConfirm: '*"A"*' })
    const st = states()
    expect(st['T-001']).toBe('waiting-user')
    expect(st['T-002']).toBe('ready')
    const w = run(['tickets', '--waiting']).out
    expect(w).toContain('T-001')
    expect(w).not.toContain('T-002')
  })

  test('no options, or only empty scaffold rows → classified as today', () => {
    writeTicket('T-001', {})
    writeTicket('T-002', { options: EMPTY })
    writeTicket('T-003', { type: 'ops', options: FILLED })
    const st = states()
    expect(st['T-001']).toBe('ready')
    expect(st['T-002']).toBe('ready')
    expect(st['T-003']).toBe('ready')
  })

  test('decision and assignee:user tickets behave as today', () => {
    writeTicket('T-001', { type: 'decision', assignee: 'user', options: EMPTY })
    writeTicket('T-002', { type: 'ops', assignee: 'user' })
    writeTicket('T-003', { type: 'decision', assignee: 'user', options: FILLED, optConfirm: '*"A"*' })
    const st = states()
    expect(st).toEqual({ 'T-001': 'waiting-user', 'T-002': 'waiting-user', 'T-003': 'waiting-user' })
  })

  test('prdt tickets --waiting lists work, decision and assignee:user tickets together; --assignee user unchanged', () => {
    writeTicket('T-001', { options: FILLED })
    writeTicket('T-002', { type: 'decision', assignee: 'user', options: EMPTY })
    writeTicket('T-003', { type: 'ops', assignee: 'user' })
    writeTicket('T-004', {})
    writeTicket('T-005', { options: FILLED, optConfirm: '*"A"*' })
    const w = run(['tickets', '--waiting']).out
    expect(w).toContain('T-001')
    expect(w).toContain('T-002')
    expect(w).toContain('T-003')
    expect(w).not.toContain('T-004')
    expect(w).not.toContain('T-005')
    const u = run(['tickets', '--assignee', 'user']).out
    expect(u).toContain('T-002')
    expect(u).toContain('T-003')
    expect(u).not.toContain('T-001')
  })
})

describe.skipIf(!PYTHON3)('options table frame for a work ticket (T-1491)', () => {
  test('tickets new --options seeds the table on an impl ticket; fmt --check passes; default stays bare', () => {
    const plain = run(['tickets', 'new', '--type', 'impl', '--slug', 'plain-one', '--version', 'v0.1'])
    expect(plain.status).toBe(0)
    const withOpt = run(['tickets', 'new', '--type', 'impl', '--slug', 'with-options', '--version', 'v0.1', '--options'])
    expect(withOpt.status).toBe(0)
    const dir = path.join(projectDir, 'docs', 'tickets', 'v0.1')
    const files = fs.readdirSync(dir).sort()
    const bodies = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    expect(bodies[0]).not.toContain('## options')
    expect(bodies[1]).toContain('## options')
    expect(bodies[1]).toContain('| 선택지 | pros | cons | trade-off | recommend |')
    expect(run(['tickets', 'fmt', files[1].replace('.md', ''), '--check']).out).toMatch(/: ok/)
  })

  test('tickets options <id> inserts the frame after problem on an existing ticket, once; fmt --check ok', () => {
    writeTicket('T-001', {})
    const r = run(['tickets', 'options', 'T-001'])
    expect(r.status).toBe(0)
    const p = path.join(projectDir, 'docs', 'tickets', 'v0.1', 'T-001.md')
    const text = fs.readFileSync(p, 'utf8')
    expect(text.indexOf('## problem')).toBeLessThan(text.indexOf('## options'))
    expect(text.indexOf('## options')).toBeLessThan(text.indexOf('## acceptance'))
    expect(text).toContain('| 선택지 | pros | cons | trade-off | recommend |')
    expect(run(['tickets', 'fmt', 'T-001', '--check']).out).toMatch(/T-001: ok/)
    // idempotent: a second run changes nothing
    const again = run(['tickets', 'options', 'T-001'])
    expect(again.status).toBe(0)
    expect(fs.readFileSync(p, 'utf8')).toBe(text)
    // empty scaffold rows do not make it wait
    expect(states()['T-001']).toBe('ready')
  })
})

// The viewer home: the same rule as a JS twin (T-1491) — waiting lists and the graph's waiting mark.
describe('viewer home counts work tickets waiting on options (T-1491)', () => {
  const body = (opts: string, confirm = '') => `## problem\n\n### 확인\n\n*"진행"*\n\n## options\n\n${opts}${confirm}`
  const fm = (id: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, type: 'impl', status: 'open', assignee: 'developer', ...extra })

  test('ticketBodyWaitsOnOptions follows the python rule', () => {
    expect(ticketBodyWaitsOnOptions(body(FILLED))).toBe(true)
    expect(ticketBodyWaitsOnOptions(body(FILLED, '### 확인\n\n*"A"*\n'))).toBe(false)
    expect(ticketBodyWaitsOnOptions(body(EMPTY))).toBe(false)
    expect(ticketBodyWaitsOnOptions('## problem\n\nx')).toBe(false)
  })

  test('waitLists: req holds the waiting work ticket beside assignee:user; dec and others unchanged', () => {
    const rows = [
      { bucket: 'v1', fm: fm('T-1'), body: body(FILLED) },
      { bucket: 'v1', fm: fm('T-2'), body: body(FILLED, '### 확인\n\n*"A"*\n') },
      { bucket: 'v1', fm: fm('T-3', { type: 'decision', assignee: 'user' }), body: body(FILLED) },
      { bucket: 'v1', fm: fm('T-4', { assignee: 'user' }), body: body(FILLED) },
      { bucket: 'v1', fm: fm('T-5', { type: 'ops' }), body: body(FILLED) },
      { bucket: 'backlog', fm: fm('T-6'), body: body(FILLED) },
      { bucket: 'v1', fm: fm('T-7') }, // no body read → never waits
    ]
    const { dec, req } = waitLists(rows)
    expect(dec.map((f: any) => f.id)).toEqual(['T-3'])
    expect(req.map((f: any) => f.id)).toEqual(['T-1', 'T-4'])
  })

  test('graph waits mark includes the waiting work ticket', () => {
    const waiting = buildHomeGraph({ tickets: [{ frontmatter: fm('T-1'), body: body(FILLED) }] })
    expect(waiting.nodes.map((n: any) => [n.id, n.waits])).toEqual([['T-1', true]])
    const answered = buildHomeGraph({ tickets: [{ frontmatter: fm('T-2'), body: body(FILLED, '### 확인\n\n*"A"*\n') }] })
    expect(answered.nodes.map((n: any) => [n.id, n.waits])).toEqual([['T-2', false]])
    const scaffold = buildHomeGraph({ tickets: [{ frontmatter: fm('T-3'), body: body(EMPTY) }] })
    expect(scaffold.nodes.map((n: any) => [n.id, n.waits])).toEqual([['T-3', false]])
  })
})

// T-1491 round 4: the lane line, the lane hooks' inputs and the PO's per-turn list read the same rule.
describe.skipIf(!PYTHON3)('work ticket options in a version with lanes (T-1491)', () => {
  const GATE = 'docs/artifacts/v0.1/g.md'
  function laneProject(t1: { assignee?: string; options?: string; optConfirm?: string }) {
    fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'),
      `# PRD\n\n## v0.1 — r\n\n### 합격선\n\n| 항목 | 문언 |\n|:--|:--|\n| **합격선** | **레인 A · \`${GATE}\` 있다** |\n`)
    writeTicket('T-001', { assignee: t1.assignee, options: t1.options, optConfirm: t1.optConfirm })
    const dir = path.join(projectDir, 'docs', 'tickets', 'v0.1')
    fs.writeFileSync(path.join(dir, 'T-002.md'), ['---', 'id: T-002', 'slug: s-t-002', 'type: impl', 'status: open',
      'assignee: developer', 'deps: [T-001]', 'created: 2026-11-10', '---', '', `\`${GATE}\``, ''].join('\n'))
  }
  const lane = () => JSON.parse(run(['schedule', '--json']).out).lanes[0]

  test('a waiting work ticket is a lane blocker, not ready / next; the lane line names it as a request', () => {
    laneProject({ options: FILLED })
    const l = lane()
    expect(l.ready).toEqual([])
    expect(l.next).toEqual([])
    expect(l.blockers).toEqual([{ id: 'T-001', kind: 'request' }])
    const out = run(['schedule']).out
    expect(out).not.toMatch(/next T-001/)
    expect(out).toMatch(/lane A 0\/2 \| working 0 \| blocker T-001 \(request\)/)
  })

  test('the same ticket answered inside options is lane-ready again; assignee:user keeps its blocker', () => {
    laneProject({ options: FILLED, optConfirm: '*"A"*' })
    expect(lane().next).toEqual(['T-001'])
    expect(lane().blockers).toEqual([])
    laneProject({ assignee: 'user', options: FILLED, optConfirm: '*"A"*' })
    expect(lane().next).toEqual([])
    expect(lane().blockers).toEqual([{ id: 'T-001', kind: 'request' }])
  })

  test('the PO per-turn [prdt state] dec / req names the waiting work ticket', () => {
    laneProject({ options: FILLED })
    fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
    const hook = (): string => {
      const out = execFileSync('bash', [path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-user-prompt.sh')], {
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 't1491', cwd: projectDir, prompt: 'hi' }),
        encoding: 'utf8', env: { ...process.env, PRDT_HOME: prdtHome, PRDT_HOOK_DIR: path.join(CORE_ROOT, 'scripts', 'hooks') },
      })
      return (JSON.parse(out).hookSpecificOutput.additionalContext as string).split('\n').find((l) => l.startsWith('[prdt state] ')) as string
    }
    expect(hook()).toMatch(/ · dec=none · req=T-001/)
    writeTicket('T-001', { options: FILLED, optConfirm: '*"A"*' })
    expect(hook()).toMatch(/ · dec=none · req=none/)
  })

  test('an empty scaffold followed by a second table header is not filled (python and viewer twin)', () => {
    const two = `${EMPTY}\n| 이름 | 값 |\n|---|---|\n`
    writeTicket('T-001', { options: two })
    expect(states()['T-001']).toBe('ready')
    expect(ticketBodyWaitsOnOptions(`## options\n\n${two}`)).toBe(false)
    expect(ticketBodyWaitsOnOptions(`## options\n\n${FILLED}`)).toBe(true)
  })
})
