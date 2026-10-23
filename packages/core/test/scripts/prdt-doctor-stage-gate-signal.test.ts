/**
 * prdt-doctor-stage-gate-signal.test.ts — T-1205: at stage=build the doctor's
 * Ship-entry signal reads the gate (every 합격선 lane finished; no gate line →
 * the build-entry slice all done/dropped), not "open tickets at 0".
 * The slice = version tickets created on or before the stage write to build,
 * read from the meta repo's history of .prdt/po-state.json; no such record →
 * every version ticket, said in doctor output.
 * Black-box over the REAL CLI. Other stages keep the open-tickets-0 rule.
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

function run(args: string[]): string {
  try {
    return execFileSync('python3', [PRDT_CLI, ...args], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'), env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' },
    })
  } catch (e: any) {
    return (e.stdout ?? '') + (e.stderr ?? '')
  }
}

const GATE_A = 'docs/artifacts/v0.1/a.md'
const GATE_B = 'docs/artifacts/v0.1/b.md'
const rowA = `| **합격선** | **레인 A · \`${GATE_A}\` 가 있다** |`
const rowB = `| **합격선** | **레인 B · \`${GATE_B}\` 가 있다** |`

function writeTicket(version: string, id: string, fm: { status?: string; deps?: string; gate?: string; created?: string } = {}) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, 'type: impl', `status: ${fm.status ?? 'open'}`, 'assignee: developer']
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push(`created: ${fm.created ?? '2026-10-15'}`, '---', '', '## problem', '', fm.gate ? `Produces \`${fm.gate}\`.` : 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function writePrd(gateRows: string[]) {
  const table = gateRows.length === 0 ? [] : ['### 합격선', '', '| 항목 | 문언 |', '|:--|:--|', ...gateRows, '']
  fs.writeFileSync(path.join(projectDir, 'docs', 'prd', 'PRD.md'), ['# PRD', '', '## v0.1 — test round', '', ...table, '#### alpha — item', '', 'a', ''].join('\n'))
}

function setStage(stage: string) {
  const p = path.join(projectDir, '.prdt', 'po-state.json')
  const st = JSON.parse(fs.readFileSync(p, 'utf-8'))
  st.stage = stage
  st.version = 'v0.1'
  fs.writeFileSync(p, JSON.stringify(st))
}

// Snapshot po-state into the meta repo the way the meta auto-save does, dated `day`.
function commitMeta(day: string) {
  const date = `${day}T12:00:00+09:00`
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid',
    '--git-dir', path.join(projectDir, '.prdt', 'meta.git'), '--work-tree', projectDir,
    'commit', '-q', '-m', 'meta auto-save', '--', '.prdt/po-state.json'],
  { cwd: projectDir, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
}

const SIGNAL = /consider Ship entry/
const FALLBACK_NOTE = /build-entry slice unreadable .* every v0\.1 ticket/
const SCRIPTS = path.dirname(PRDT_CLI)

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-stage-gate-'))
  projectDir = path.join(tmpRoot, 'proj')
  prdtHome = path.join(tmpRoot, 'home')
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  fs.mkdirSync(prdtHome, { recursive: true })
  run(['init', '--json', '--slug', 'proj', '--yes'])
  fs.rmSync(path.join(projectDir, 'docs', 'tickets'), { recursive: true, force: true })
})

afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt doctor — build stage signal reads the gate (T-1205)', () => {
  test('fires: every lane finished, a 자투리 ticket still open', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { status: 'done', gate: GATE_A })
    writeTicket('v0.1', 'T-002', { status: 'done', gate: GATE_B })
    writeTicket('v0.1', 'T-003', {}) // 자투리, open
    setStage('build')
    expect(run(['doctor'])).toMatch(SIGNAL)
  })

  test('silent: one lane unfinished, even though the other lane and 자투리 are closed', () => {
    writePrd([rowA, rowB])
    writeTicket('v0.1', 'T-001', { status: 'done', gate: GATE_A })
    writeTicket('v0.1', 'T-002', { gate: GATE_B })
    writeTicket('v0.1', 'T-003', { status: 'done' })
    setStage('build')
    expect(run(['doctor'])).not.toMatch(SIGNAL)
  })

  test('silent: gate not met with zero open tickets (an unlinked lane never finishes)', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { status: 'done' }) // no ticket names GATE_A: lane A not linked
    setStage('build')
    expect(run(['doctor'])).not.toMatch(SIGNAL)
  })

  test('no gate line: build-entry slice all done + an open 자투리 created after the build write → fires', () => {
    writePrd([])
    setStage('build')
    commitMeta('2026-10-15')
    writeTicket('v0.1', 'T-001', { status: 'done', created: '2026-10-15' })
    writeTicket('v0.1', 'T-002', { status: 'dropped', created: '2026-10-14' })
    writeTicket('v0.1', 'T-003', { status: 'open', created: '2026-10-16' }) // 자투리
    const out = run(['doctor'])
    expect(out).toMatch(SIGNAL)
    expect(out).not.toMatch(FALLBACK_NOTE)
  })

  test('no gate line: a build-entry slice ticket still open → silent', () => {
    writePrd([])
    setStage('build')
    commitMeta('2026-10-15')
    writeTicket('v0.1', 'T-001', { status: 'open', created: '2026-10-15' })
    writeTicket('v0.1', 'T-002', { status: 'done', created: '2026-10-16' })
    expect(run(['doctor'])).not.toMatch(SIGNAL)
  })

  test('no gate line, no meta record of the build write: every version ticket, and doctor says so', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', { status: 'done' })
    writeTicket('v0.1', 'T-002', { status: 'open', created: '2026-10-16' })
    setStage('build') // po-state written, never snapshotted: meta history still reads define
    const out = run(['doctor'])
    expect(out).not.toMatch(SIGNAL)
    expect(out).toMatch(FALLBACK_NOTE)
    writeTicket('v0.1', 'T-002', { status: 'dropped' })
    expect(run(['doctor'])).toMatch(SIGNAL)
  })

  test('a lane-read failure is a named warning, never read as "no gate"', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', { status: 'done' })
    setStage('build')
    const py = [
      'import sys, json',
      `sys.path.insert(0, ${JSON.stringify(SCRIPTS)})`,
      'import prdt_cli as c',
      'def boom(root, line=None): raise RuntimeError("lane boom")',
      'c.lanes_for = boom',
      'root = sys.argv[1]',
      'st = json.load(open(root + "/.prdt/po-state.json"))',
      'tickets = {"T-001": {"id": "T-001", "version": "v0.1", "status": "done", "created": "2026-10-15", "deps": []}}',
      'print("\\n".join(c.stage_signal_warnings(st, tickets, (), root)))',
    ].join('\n')
    const out = execFileSync('python3', ['-c', py, projectDir], { encoding: 'utf-8', timeout: subprocessTimeout('cli') })
    expect(out).toMatch(/stage: v0\.1 lane read failed \(RuntimeError: lane boom\)/)
    expect(out).not.toMatch(SIGNAL)
  })

  test('ship stage unchanged: no open tickets fires, an open one is silent', () => {
    writePrd([rowA])
    writeTicket('v0.1', 'T-001', { status: 'done', gate: GATE_A })
    setStage('ship')
    expect(run(['doctor'])).toMatch(/stage: v0\.1 has no open tickets at stage=ship — consider Retro entry/)
    writeTicket('v0.1', 'T-002', {})
    expect(run(['doctor'])).not.toMatch(/at stage=ship — consider Retro/)
  })
})
