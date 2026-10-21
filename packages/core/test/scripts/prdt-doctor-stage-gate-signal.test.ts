/**
 * prdt-doctor-stage-gate-signal.test.ts — T-1205: at stage=build the doctor's
 * Ship-entry signal reads the gate (every 합격선 lane finished; no gate line →
 * the version's tickets all done/dropped), not "open tickets at 0".
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

function writeTicket(version: string, id: string, fm: { status?: string; deps?: string; gate?: string } = {}) {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`, 'type: impl', `status: ${fm.status ?? 'open'}`, 'assignee: developer']
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-10-15', '---', '', '## problem', '', fm.gate ? `Produces \`${fm.gate}\`.` : 'x', '', '## acceptance', '', '- x', '')
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

const SIGNAL = /consider Ship entry/

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

  test('no gate line: fires when every version ticket is done/dropped, silent while one is open', () => {
    writePrd([])
    writeTicket('v0.1', 'T-001', { status: 'done' })
    writeTicket('v0.1', 'T-002', { status: 'open' })
    setStage('build')
    expect(run(['doctor'])).not.toMatch(SIGNAL)
    writeTicket('v0.1', 'T-002', { status: 'dropped' })
    expect(run(['doctor'])).toMatch(SIGNAL)
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
