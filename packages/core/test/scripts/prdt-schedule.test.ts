/**
 * prdt-schedule.test.ts — `prdt schedule` (T-772, T-681 slice S1), black-box
 * over the REAL `prdt` CLI (idiom: prdt-tickets-frame.test.ts).
 *
 * Design SoT: docs/artifacts/v1.11/critical-path.html §1 — nodes are the open
 * tickets of po-state's version plus the open tickets they depend on; edges
 * come from `deps` only (T-763); every ticket weighs 1 (T-764); slack =
 * LS − ES; rows rank slack asc → blocked-count desc → PRD H4 order → id.
 * Reads md frontmatter in memory — never writes `.prdt/index.db`.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

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

function schedJson(): any {
  const r = run(['schedule', '--json'])
  expect(r.status).toBe(0)
  return JSON.parse(r.out)
}

function writeTicket(version: string, id: string, fm: Record<string, string | undefined>) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, `type: ${fm.type ?? 'impl'}`,
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.prd_item) lines.push(`prd_item: ${fm.prd_item}`)
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-09-28', '---', '', '## problem', '', 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function writePrd() {
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), [
    '# PRD', '', '## v0.1 — test round', '',
    '#### beta — second in file order? no: first', '', 'b', '',
    '#### alpha — comes after beta', '', 'a', '',
  ].join('\n'))
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-schedule-'))
  projectDir = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(projectDir, { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  const r = run(['init', '--json', '--slug', 'proj', '--yes'])
  expect(r.status).toBe(0)
  fs.rmSync(path.join(projectDir, 'docs', 'tickets'), { recursive: true, force: true })
  writePrd()
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt schedule', () => {
  test('ranks by slack, then blocked count, PRD H4 order, id; critical path first', () => {
    // A → B → C is the longest chain (3). D blocks E (2 long, slack 1).
    // F, G, H are singletons (slack 2): G carries prd_item beta (H4 #1),
    // F carries alpha (H4 #2), H none → G, F, H.
    writeTicket('v0.1', 'T-001', {})
    writeTicket('v0.1', 'T-002', { deps: '[T-001]' })
    writeTicket('v0.1', 'T-003', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-004', {})
    writeTicket('v0.1', 'T-005', { deps: '[T-004]' })
    writeTicket('v0.1', 'T-006', { prd_item: 'v0.1#alpha' })
    writeTicket('v0.1', 'T-007', { prd_item: 'v0.1#beta' })
    writeTicket('v0.1', 'T-008', {})
    // done / dropped work is not a node and its edges count as satisfied
    writeTicket('v0.1', 'T-009', { status: 'done' })
    writeTicket('v0.1', 'T-010', { status: 'dropped' })
    writeTicket('v0.1', 'T-011', { deps: '[T-009, T-010]', prd_item: 'v0.1#beta' })

    const j = schedJson()
    expect(j.cycle).toBeNull()
    expect(j.critical_path).toEqual(['T-001', 'T-002', 'T-003'])
    expect(j.cp_length).toBe(3)
    const ready = j.rows.filter((r: any) => r.state === 'ready').map((r: any) => r.id)
    // slack 0: T-001 · slack 1: T-004 · slack 2: T-007, T-011 (beta, id), T-006 (alpha), T-008
    expect(ready).toEqual(['T-001', 'T-004', 'T-007', 'T-011', 'T-006', 'T-008'])
    const byId = Object.fromEntries(j.rows.map((r: any) => [r.id, r]))
    expect(byId['T-001']).toMatchObject({ slack: 0, blocks: 2, state: 'ready' })
    expect(byId['T-002']).toMatchObject({ slack: 0, blocks: 1, state: 'blocked', waits_on: ['T-001'] })
    expect(byId['T-005']).toMatchObject({ slack: 1, state: 'blocked' })
    expect(byId['T-009']).toBeUndefined()
    expect(byId['T-011']).toMatchObject({ state: 'ready', slack: 2 })

    const t = run(['schedule'])
    expect(t.status).toBe(0)
    expect(t.out).toContain('critical path (3): T-001 → T-002 → T-003')
    const lines = t.out.split('\n')
    const first = lines.findIndex((l) => /^\s+1\s+T-/.test(l))
    expect(lines[first]).toMatch(/^\s+1\s+T-001\s+slack 0\s+developer\s+blocks 2/)
    expect(lines[first + 1]).toMatch(/^\s+2\s+T-004\s+slack 1/)
  })

  test('blocked-count breaks a slack tie', () => {
    // T-001 and T-002 both head a 2-chain (slack 0); T-001 has two dependents.
    writeTicket('v0.1', 'T-002', {})
    writeTicket('v0.1', 'T-001', {})
    writeTicket('v0.1', 'T-003', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-004', { deps: '[T-001]' })
    writeTicket('v0.1', 'T-005', { deps: '[T-001]' })
    writeTicket('v0.1', 'T-006', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-007', { deps: '[T-001]' })
    const ready = schedJson().rows.filter((r: any) => r.state === 'ready').map((r: any) => r.id)
    expect(ready).toEqual(['T-001', 'T-002'])
  })

  test('a dependency cycle is reported by name, not crashed on', () => {
    writeTicket('v0.1', 'T-001', { deps: '[T-003]' })
    writeTicket('v0.1', 'T-002', { deps: '[T-001]' })
    writeTicket('v0.1', 'T-003', { deps: '[T-002]' })
    writeTicket('v0.1', 'T-004', {})
    const t = run(['schedule'])
    expect(t.status).toBe(1)
    expect(t.err).not.toMatch(/Traceback/)
    expect(t.out).toMatch(/dependency cycle: (T-00\d → ){3}T-00\d/)
    for (const id of ['T-001', 'T-002', 'T-003']) expect(t.out).toContain(id)
    expect(t.out).not.toContain('dispatch next')
    const j = run(['schedule', '--json'])
    expect(j.status).toBe(1)
    const parsed = JSON.parse(j.out)
    expect(parsed.rows).toEqual([])
    expect(new Set(parsed.cycle)).toEqual(new Set(['T-001', 'T-002', 'T-003']))
  })

  test('user-owned work shows as waiting rows, PO work as its own rows', () => {
    writeTicket('v0.1', 'T-001', { type: 'decision', assignee: 'user' })
    writeTicket('v0.1', 'T-002', { assignee: 'user', type: 'ops' })
    // a decision the PO forgot to hand to the user still waits on the user
    writeTicket('v0.1', 'T-003', { type: 'decision', assignee: 'po' })
    writeTicket('v0.1', 'T-004', { assignee: 'po' })
    writeTicket('v0.1', 'T-005', { deps: '[T-001]' })
    const j = schedJson()
    const st = Object.fromEntries(j.rows.map((r: any) => [r.id, r.state]))
    expect(st).toEqual({ 'T-001': 'waiting-user', 'T-002': 'waiting-user', 'T-003': 'waiting-user',
      'T-004': 'po', 'T-005': 'blocked' })
    expect(j.critical_path).toEqual(['T-001', 'T-005'])
    const t = run(['schedule'])
    expect(t.out).toMatch(/^waiting on user: T-001 T-002 T-003$/m)
    expect(t.out).toMatch(/^PO work: T-004$/m)
    expect(t.out).toMatch(/^dispatch next: \(none\)$/m)
  })

  test('open deps in another dir join the graph; a missing dep is ignored with one line', () => {
    writeTicket('backlog', 'T-001', {})
    writeTicket('backlog', 'T-009', {}) // not depended on — stays out
    writeTicket('v0.1', 'T-002', { deps: '[T-001, T-404]' })
    const j = schedJson()
    expect(j.rows.map((r: any) => r.id).sort()).toEqual(['T-001', 'T-002'])
    expect(j.rows.find((r: any) => r.id === 'T-001')).toMatchObject({ version: 'backlog', state: 'ready' })
    expect(j.missing_deps).toEqual([{ ticket: 'T-002', dep: 'T-404' }])
    const t = run(['schedule'])
    expect(t.out).toMatch(/^note: T-002 deps on missing T-404 — ignored$/m)
  })

  test('a live dispatch marker for this project moves its ticket to in flight', () => {
    writeTicket('v0.1', 'T-001', {})
    writeTicket('v0.1', 'T-002', {})
    const md = path.join(prdtHome, 'run', 'dispatches')
    fs.mkdirSync(md, { recursive: true })
    const transcript = path.join(tmpRoot, 'agent.jsonl')
    fs.writeFileSync(transcript, '{"type":"assistant","message":{"model":"claude-x"}}\n')
    const since = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    fs.writeFileSync(path.join(md, 'a.json'), JSON.stringify({
      agent_id: 'a1', persona: 'developer', ticket_id: 'T-001', dispatch_id: 'd-1',
      project_root: fs.realpathSync(projectDir), since, transcript,
    }))
    // another project's marker for the same id never counts here
    fs.writeFileSync(path.join(md, 'b.json'), JSON.stringify({
      agent_id: 'b1', persona: 'developer', ticket_id: 'T-002', dispatch_id: 'd-2',
      project_root: '/nowhere/else', since, transcript,
    }))
    const st = Object.fromEntries(schedJson().rows.map((r: any) => [r.id, r.state]))
    expect(st).toEqual({ 'T-001': 'in-flight', 'T-002': 'ready' })
    expect(run(['schedule']).out).toMatch(/^in flight: T-001$/m)
  })

  test('reads md only — never writes .prdt/index.db', () => {
    writeTicket('v0.1', 'T-001', {})
    const db = path.join(projectDir, '.prdt', 'index.db')
    fs.rmSync(db, { force: true })
    expect(run(['schedule']).status).toBe(0)
    expect(run(['schedule', '--json']).status).toBe(0)
    expect(fs.existsSync(db)).toBe(false)
  })
})
