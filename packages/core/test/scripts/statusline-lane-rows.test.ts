/**
 * statusline-lane-rows.test.ts — T-1147 (v1.14 `lanes`): in stage build the
 * statusline prints one lane row under each product row, read from
 * `prdt schedule --json` `lanes` (T-1145) — never re-computed here.
 *
 * Design SoT: docs/artifacts/v1.14/lanes-design.html — R3 (cells), R4 (byte
 * identity outside the new rows), width folding, label keys; rev3 tab
 * 「T-1178 · 레인 = 합격선 + 자투리」 (T-1184): R7 자투리 row, R10 one finished
 * row, R11 multi-word names, R12 head-of-queue `next`, no row cap / folding.
 * Drives the REAL statusline-prdt.sh next to the REAL prdt CLI.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE = path.resolve(__dirname, '..', '..')
const STATUSLINE_SH = path.join(CORE, 'scripts', 'statusline-prdt.sh')
const PRDT_CLI = path.join(CORE, 'scripts', 'prdt')
const PYTHON3 = (() => { try { return execFileSync('which', ['python3'], { encoding: 'utf8' }).trim() || null } catch { return null } })()

let tmpRoot: string
let root: string
let prdtHome: string

const OSC8_RE = /\x1b\]8;;[^\x1b]*\x1b\\([^\x1b]*)\x1b\]8;;\x1b\\/g
const unwrap = (s: string) => s.replace(OSC8_RE, '$1')

function cli(args: string[]): void {
  execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
    env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' },
  })
}

function statusline(env: Record<string, string | undefined> = {}): string {
  const e: Record<string, string | undefined> = { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', COLUMNS: undefined, ...env }
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k]
  return unwrap(execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8', env: e as NodeJS.ProcessEnv,
    timeout: subprocessTimeout('cli'),
  })).replace(/\n$/, '')
}
const rows = (env?: Record<string, string | undefined>) => statusline(env).split('\n')

const GATE_A = 'docs/artifacts/v0.1/a.md'
const GATE_B = 'docs/artifacts/v0.1/b.md'
const rowA = `| **합격선** | **레인 A · \`${GATE_A}\` 가 있다** |`
const rowB = `| **합격선** | **레인 B · \`${GATE_B}\` 가 있다** |`

function writePrd(gateRows: string[]) {
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  const table = gateRows.length === 0 ? [] : ['### 합격선', '', '| 항목 | 문언 |', '|:--|:--|', ...gateRows, '']
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), ['# PRD', '', '## v0.1 — test round', '', ...table, '#### alpha — item', '', 'a', ''].join('\n'))
}

function ticket(id: string, fm: { type?: string; status?: string; assignee?: string; deps?: string; gate?: string } = {}, version = 'v0.1') {
  const dir = path.join(root, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${fm.type ?? 'impl'}`,
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-10-15', '---', '', '## problem', '', fm.gate ? `Produces \`${fm.gate}\`.` : 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function setStage(stage: string) {
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, current_task: null, stage, version: 'v0.1' }))
}

function marker(ticketId: string, persona = 'developer') {
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const hex = crypto.createHash('sha256').update(`a-${ticketId}-${persona}`).digest('hex')
  fs.writeFileSync(path.join(dir, `${hex}.json`), JSON.stringify({
    agent_id: hex, persona, dispatch_id: 'd-x', ticket_id: ticketId, project_root: root,
    since: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }))
}

beforeEach(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1147-')))
  root = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  cli(['init', '--json', '--slug', 'proj', '--yes'])
  fs.rmSync(path.join(root, 'docs', 'tickets'), { recursive: true, force: true })
})
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('statusline lane rows (T-1147)', () => {
  test('R3/R7: a working lane and the 자투리 row — lane tickets leave the product `working`', () => {
    writePrd([rowA])
    ticket('T-001', { status: 'done' })
    ticket('T-002', { deps: '[T-001]', gate: GATE_A })
    ticket('T-003', { deps: '[T-002]' }) // depends on the gate ticket, not in its closure: 자투리
    ticket('T-009') // in no gate lane: 자투리
    setStage('build')
    marker('T-002', 'developer')
    marker('T-009', 'qa')
    const r = rows()
    expect(r).toHaveLength(4)
    expect(r[1]).toBe('lane: A  1/2 | working T-002(developer)')
    expect(r[2]).toBe('lane: 자투리  0/2 | working T-009(qa)')
    expect(r[3]).toBe('decision 0 | request 0')
    expect(r[0]).toContain('working 0')
    expect(r[0]).toContain('total tickets 1/4')
  })

  test('R11: a multi-word lane name is shown whole; 자투리 label is the same in ko and en', () => {
    writePrd([`| **합격선** | **레인 여러 제품 관측 · \`${GATE_A}\` 가 있다** |`])
    ticket('T-001', { gate: GATE_A })
    ticket('T-002')
    setStage('build')
    expect(rows().slice(1, 3)).toEqual(['lane: 여러 제품 관측  0/1 | next T-001(developer)', 'lane: 자투리  0/1 | next T-002(developer)'])
    expect(rows({ PRDT_LANG: 'ko' }).slice(1, 3)).toEqual(['레인: 여러 제품 관측  0/1 | 다음 T-001(developer)', '레인: 자투리  0/1 | 다음 T-002(developer)'])
  })

  test('R12: `next` is the head of the lane queue only (schedule order), shown beside `working`', () => {
    writePrd([rowA])
    ticket('T-002')
    ticket('T-003')
    ticket('T-004')
    ticket('T-005', { deps: '[T-004]' })
    ticket('T-010', { gate: GATE_A, deps: '[T-002, T-003, T-004, T-005]' })
    setStage('build')
    expect(rows()[1]).toBe('lane: A  0/5 | next T-004(developer)')
    marker('T-004', 'designer')
    expect(rows()[1]).toBe('lane: A  0/5 | working T-004(designer) | next T-002(developer)')
  })

  test('R3: nothing running — `next` (PO-owned tickets included, with owner); ko labels with the two-space gap', () => {
    writePrd([rowA])
    ticket('T-001', { status: 'done' })
    ticket('T-002', { assignee: 'po', deps: '[T-001]', gate: GATE_A })
    setStage('build')
    expect(rows()[1]).toBe('lane: A  1/2 | next T-002(po)')
    expect(rows({ PRDT_LANG: 'ko' })[1]).toBe('레인: A  1/2 | 다음 T-002(PO)')
  })

  test('R3: blocker kinds — decision and request, and the last row keeps the same ids', () => {
    writePrd([rowA])
    ticket('T-001', { type: 'decision', assignee: 'user' })
    ticket('T-002', { assignee: 'user' })
    ticket('T-003', { deps: '[T-001, T-002]', gate: GATE_A })
    setStage('build')
    marker('T-003')
    const r = rows()
    expect(r[1]).toBe('lane: A  0/3 | working T-003(developer) | blocker T-001(decision) T-002(request)')
    expect(r[r.length - 1]).toBe('decision T-001 | request T-002')
  })

  test('R3: blockers only — no working/next cell', () => {
    writePrd([rowA])
    ticket('T-001', { assignee: 'user' })
    ticket('T-002', { deps: '[T-001]', gate: GATE_A })
    setStage('build')
    expect(rows()[1]).toBe('lane: A  0/2 | blocker T-001(request)')
  })

  test('R10: finished lanes leave their rows for ONE `done:` row above the lanes, table order, ` · `-joined', () => {
    const rowC = `| **합격선** | **레인 C · \`docs/artifacts/v0.1/c.md\` 가 있다** |`
    writePrd([rowA, rowB, rowC])
    ticket('T-001', { status: 'done', gate: GATE_A })
    ticket('T-002', { gate: GATE_B })
    ticket('T-003', { status: 'done', gate: 'docs/artifacts/v0.1/c.md' })
    ticket('T-004', { status: 'done' }) // 자투리, finished too
    setStage('build')
    const r = rows()
    expect(r).toHaveLength(4)
    expect(r[1]).toBe('done: A 1/1 · C 1/1 · 자투리 1/1')
    expect(r[2]).toBe('lane: B  0/1 | next T-002(developer)')
    expect(rows({ PRDT_LANG: 'ko' })[1]).toBe('작업완료: A 1/1 · C 1/1 · 자투리 1/1')
  })

  test('F2 (QA): the finished row never truncates an entry — it continues on the next row (9 long names, COLUMNS=80)', () => {
    const gates = Array.from({ length: 9 }, (_, i) => `docs/artifacts/v0.1/g${i}.md`)
    writePrd(gates.map((g, i) => `| **합격선** | **레인 아주 긴 이름의 레인 번호 ${i} · \`${g}\` 가 있다** |`))
    gates.forEach((g, i) => ticket(`T-00${i + 1}`, { status: 'done', gate: g }))
    ticket('T-050')
    setStage('build')
    const r = rows({ COLUMNS: '80' })
    expect(r.join('\n')).not.toContain('…')
    const doneRows = r.filter((x, i) => i > 0 && (x.startsWith('done:') || /^\S.*\d+\/\d+$/.test(x) && !x.startsWith('lane')))
    expect(doneRows.length).toBeGreaterThan(1)
    for (let i = 0; i < 9; i++) expect(r.join('\n')).toContain(`아주 긴 이름의 레인 번호 ${i} 1/1`)
  })

  test('F2b (QA2): a lane name over 40 columns prints whole — finished row and unfinished lane row, COLUMNS 80/unset, en/ko', () => {
    const LONG = '아주아주 긴 이름을 가진 합격선 레인으로 사십칸을 넘는 경우'
    const gA = 'docs/artifacts/v0.1/a.md'
    const gB = 'docs/artifacts/v0.1/b.md'
    writePrd([`| **합격선** | **레인 ${LONG} · \`${gA}\` 가 있다** |`, `| **합격선** | **레인 ${LONG}둘 · \`${gB}\` 가 있다** |`])
    ticket('T-001', { status: 'done', gate: gA })
    ticket('T-002', { gate: gB })
    ticket('T-003', { gate: gB })
    marker('T-002')
    setStage('build')
    for (const COLUMNS of ['80', undefined]) {
      for (const PRDT_LANG of ['en', 'ko']) {
        const out = rows({ COLUMNS, PRDT_LANG }).join('\n')
        expect(out).not.toContain('…')
        expect(out).toContain(`${LONG} 1/1`)
        expect(out).toContain(`${LONG}둘  0/1`)
      }
    }
  })

  test('R3: a lane that is not linked reads `not linked`', () => {
    writePrd([rowA, rowB])
    ticket('T-001', { gate: GATE_A })
    setStage('build')
    const r = rows()
    expect(r[2]).toBe('lane: B  not linked')
  })

  test('R3: all three cells empty and not finished — `working 0`', () => {
    writePrd([rowA])
    ticket('T-001', { deps: '[T-002]', gate: GATE_A })
    ticket('T-002', { deps: '[T-001]' }) // cycle: nothing ready
    setStage('build')
    expect(rows()[1]).toBe('lane: A  0/2 | working 0')
  })

  test('R4: define · ship · retro · idle — output has no lane row (bytes equal the lane-less project)', () => {
    writePrd([rowA])
    ticket('T-001', { gate: GATE_A })
    const out: Record<string, string> = {}
    for (const s of ['define', 'ship', 'retro', 'idle']) { setStage(s); out[s] = statusline() }
    for (const s of Object.keys(out)) {
      expect(out[s]).not.toMatch(/lane/)
      expect(out[s].split('\n')).toHaveLength(2)
    }
    // the same project with the 합격선 table removed prints the same bytes
    writePrd([])
    for (const s of ['define', 'ship', 'retro', 'idle']) { setStage(s); expect(statusline()).toBe(out[s]) }
  })

  test('R4: build project with zero lane rows — bytes equal build before lanes existed (product row + last row only)', () => {
    writePrd([])
    ticket('T-001')
    setStage('build')
    marker('T-001')
    const out = statusline()
    expect(out.split('\n')).toHaveLength(2)
    expect(out.split('\n')[0]).toContain('working T-001(developer)')
    expect(out.split('\n')[1]).toBe('decision 0 | request 0')
  })

  test('R4: with lanes, only two things change — the lane rows and the lane tickets leaving `working`', () => {
    writePrd([rowA])
    ticket('T-001', { gate: GATE_A })
    setStage('build')
    const withLane = rows()
    writePrd([])
    const without = rows()
    expect(withLane).toHaveLength(without.length + 1)
    expect(withLane[0]).toBe(without[0])
    expect(withLane[withLane.length - 1]).toBe(without[without.length - 1])
  })

  test('R5: width folds 3 → 2 → 1 ids, then persona off, then ids as +N, then blocker 1 id + N; head never cut', () => {
    writePrd([rowA])
    ticket('T-001', { type: 'decision', assignee: 'user' })
    ticket('T-002', { assignee: 'user' })
    ticket('T-010', { deps: '[T-001, T-002]' })
    ticket('T-011', { deps: '[T-001, T-002]' })
    ticket('T-012', { deps: '[T-001, T-002]' })
    ticket('T-099', { deps: '[T-010, T-011, T-012]', gate: GATE_A })
    setStage('build')
    for (const t of ['T-010', 'T-011', 'T-012']) marker(t, 'designer')
    const full = 'lane: A  0/6 | working T-010(designer) T-011(designer) T-012(designer) | blocker T-001(decision) T-002(request)'
    expect(rows({ COLUMNS: '200' })[1]).toBe(full)
    const at = (c: number) => rows({ COLUMNS: String(c) })[1]
    expect(at(full.length - 1)).toBe('lane: A  0/6 | working T-010(designer) T-011(designer) +1 | blocker T-001(decision) T-002(request)')
    expect(at(95)).toBe('lane: A  0/6 | working T-010(designer) +2 | blocker T-001(decision) T-002(request)')
    expect(at(80)).toBe('lane: A  0/6 | working T-010 +2 | blocker T-001(decision) T-002(request)')
    const noIds = 'lane: A  0/6 | working +3 | blocker T-001(decision) T-002(request)'
    expect(at(noIds.length)).toBe(noIds)
    expect(at(noIds.length - 1)).toBe('lane: A  0/6 | working +3 | blocker T-001(decision) +1')
    const tiny = at(20)
    expect(tiny.startsWith('lane: A  0/6')).toBe(true)
    expect(tiny.length).toBeLessThanOrEqual(20)
    expect(tiny.endsWith('…')).toBe(true)
  })

  test('R12: no row cap and no folding — 20 lanes give 20 lane rows; the 자투리 row is never folded', () => {
    const more = Array.from({ length: 20 }, (_, i) => {
      const g = `docs/artifacts/v0.1/h${i}.md`
      return { g, row: `| **합격선** | **레인 H${i} · \`${g}\` 가 있다** |` }
    })
    writePrd(more.map((m) => m.row))
    more.forEach((m, i) => ticket(`T-${300 + i}`, { gate: m.g }))
    ticket('T-400')
    setStage('build')
    marker('T-305')
    const r = rows()
    expect(r).toHaveLength(23)
    expect(r.filter((x) => x.startsWith('lane: H'))).toHaveLength(20)
    expect(r[5]).toBe('lane: H4  0/1 | next T-304(developer)')
    expect(r[6]).toBe('lane: H5  0/1 | working T-305(developer)')
    expect(r[21]).toBe('lane: 자투리  0/1 | next T-400(developer)')
    expect(r.join('\n')).not.toMatch(/\+\d+/)
    expect(r[0]).toContain('working 0')
  })

  test('QA 1a: QA running on a done ticket of a finished lane stays on the product row `working`', () => {
    writePrd([rowA])
    ticket('T-001', { status: 'done', gate: GATE_A })
    setStage('build')
    marker('T-001', 'qa')
    const r = rows()
    expect(r[1]).toBe('done: A 1/1')
    expect(r[0]).toContain('working T-001(qa)')
  })

  test('QA 2: heading with extra spaces (`###  합격선`) — precheck and lane parser agree: lanes show', () => {
    writePrd([rowA])
    const f = path.join(root, 'docs', 'prd', 'PRD.md')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('### 합격선', '###  합격선'))
    ticket('T-001', { gate: GATE_A })
    setStage('build')
    expect(rows()[1]).toBe('lane: A  0/1 | next T-001(developer)')
    // a heading the lane regex rejects (`### 합격선표`) shows no lane row
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('###  합격선', '### 합격선표'))
    expect(rows()).toHaveLength(2)
  })

  test('QA 3: lane rendering that throws → no lane rows, rest of the statusline intact', () => {
    writePrd([rowA])
    ticket('T-001', { gate: GATE_A })
    ticket('T-009')
    setStage('build')
    marker('T-001')
    marker('T-009')
    const dir = path.join(tmpRoot, 'scripts-copy')
    fs.cpSync(path.join(CORE, 'scripts'), dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'prdt_lanes.py'),
      'def lanes_for(root, line=None):\n    return [{"name": "A", "linked": True, "done": "x", "total": 1}]\n')
    const out = unwrap(execFileSync('bash', [path.join(dir, 'statusline-prdt.sh')], {
      input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
      env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en' } as NodeJS.ProcessEnv, timeout: subprocessTimeout('cli'),
    })).replace(/\n$/, '').split('\n')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('working T-001(developer) T-009(developer)')
    expect(out[1]).toBe('decision 0 | request 0')
  })

  test('QA 4: doctor tracks prdt_lanes.py as a bin helper module', () => {
    expect(fs.readFileSync(PRDT_CLI, 'utf8')).toMatch(/BIN_HELPER_MODULES = \([^)]*"prdt_lanes\.py"/)
  })

  test('statusline reads prdt schedule --json: it makes no meta-backup / update-state write', () => {
    writePrd([rowA])
    ticket('T-001', { gate: GATE_A })
    setStage('build')
    statusline()
    expect(fs.existsSync(path.join(prdtHome, 'update-state.json'))).toBe(false)
  })
})
