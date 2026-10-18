/**
 * statusline-lane-rows.test.ts — T-1147 (v1.14 `lanes`): in stage build the
 * statusline prints one lane row under each product row, read from
 * `prdt schedule --json` `lanes` (T-1145) — never re-computed here.
 *
 * Design SoT: docs/artifacts/v1.14/lanes-design.html — R3 (cells), R4 (byte
 * identity outside the new rows), R5 (width folding, 17-row cap), label keys.
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
  test('R3: a working lane — lane row under the product row, lane ticket leaves the product `working`', () => {
    writePrd([rowA])
    ticket('T-001', { status: 'done' })
    ticket('T-002', { deps: '[T-001]', gate: GATE_A })
    ticket('T-003', { deps: '[T-002]' })
    ticket('T-009') // outside the lane
    setStage('build')
    marker('T-002', 'developer')
    marker('T-009', 'qa')
    const r = rows()
    expect(r).toHaveLength(3)
    expect(r[1]).toBe('lane: A  1/2 | working T-002(developer)')
    expect(r[2]).toBe('decision 0 | request 0')
    expect(r[0]).toContain('working T-009(qa)')
    expect(r[0]).not.toContain('T-002')
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

  test('R3: lane done — that one cell only, even with a blocker-free finished lane', () => {
    writePrd([rowA, rowB])
    ticket('T-001', { status: 'done', gate: GATE_A })
    ticket('T-002', { gate: GATE_B })
    setStage('build')
    const r = rows()
    expect(r[1]).toBe('lane: A  1/1 | done')
    expect(r[2]).toBe('lane: B  0/1 | next T-002(developer)')
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
    ticket('T-002')
    setStage('build')
    marker('T-002')
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

  test('R5: more than 17 rows — finished lane rows go first, then each product folds its lanes into `lanes +N`; product rows and last row stay', () => {
    const many = Array.from({ length: 18 }, (_, i) => {
      const g = `docs/artifacts/v0.1/g${i}.md`
      return { g, row: `| **합격선** | **레인 L${i} · \`${g}\` 가 있다** |` }
    })
    writePrd(many.map((m) => m.row))
    many.forEach((m, i) => ticket(`T-${100 + i}`, { gate: m.g, status: i < 4 ? 'done' : 'open' }))
    setStage('build')
    const r = rows()
    expect(r.length).toBeLessThanOrEqual(17)
    // 18 lanes + product row + last row = 20 > 17: finished lanes drop from the bottom, only as many as needed (3 of 4)
    expect(r).toHaveLength(17)
    expect(r.filter((x) => x.includes('| done'))).toEqual(['lane: L0  1/1 | done'])
    expect(r.filter((x) => x.startsWith('lane: ')).length).toBe(15)
    expect(r[0]).toContain('proj v0.1')
    expect(r[r.length - 1]).toBe('decision 0 | request 0')

    // 20 unfinished lanes: nothing finished to drop -> folded into one `lanes +N` row
    const more = Array.from({ length: 20 }, (_, i) => {
      const g = `docs/artifacts/v0.1/h${i}.md`
      return { g, row: `| **합격선** | **레인 H${i} · \`${g}\` 가 있다** |` }
    })
    fs.rmSync(path.join(root, 'docs', 'tickets'), { recursive: true, force: true })
    writePrd(more.map((m) => m.row))
    more.forEach((m, i) => ticket(`T-${300 + i}`, { gate: m.g }))
    const r2 = rows()
    expect(r2).toHaveLength(3)
    expect(r2[1]).toBe('lanes +20')
    expect(r2[2]).toBe('decision 0 | request 0')
  })

  test('statusline reads prdt schedule --json: it makes no meta-backup / update-state write', () => {
    writePrd([rowA])
    ticket('T-001', { gate: GATE_A })
    setStage('build')
    statusline()
    expect(fs.existsSync(path.join(prdtHome, 'update-state.json'))).toBe(false)
  })
})
