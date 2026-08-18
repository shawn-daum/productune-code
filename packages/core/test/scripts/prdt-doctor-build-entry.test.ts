/**
 * prdt-doctor-build-entry.test.ts — T-430 build-entry doctor signal,
 * black-box over the REAL `prdt` CLI (mirrors prdt-doctor-meta-drift.test.ts).
 *
 * Root cause (T-430, dogfood 관찰): PO's don't slice the approved Build-scope
 * into tickets at Build entry — they cut tickets ad-hoc as work happens.
 * `prdt doctor` is the one signal point in prdt's design, so a stage=build
 * version sitting with zero open+done tickets must surface here,
 * warning-only, never a gate (mirrors the existing "stage exhausted, consider
 * next-stage entry" signal, but for the OPPOSITE corner: scope never sliced).
 *
 * Acceptance (docs/tickets/v1.6/T-430.md item 3): fire + silent, covered.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  })
}

function runInit(): any {
  return JSON.parse(runPrdt(['init', '--json', '--slug', 'proj', '--yes']))
}

function doctor(): string {
  try {
    return runPrdt(['doctor'])
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

function setStage(stage: string, version: string) {
  const p = path.join(projectDir, '.prdt', 'po-state.json')
  const st = JSON.parse(fs.readFileSync(p, 'utf-8'))
  st.stage = stage
  st.version = version
  fs.writeFileSync(p, JSON.stringify(st))
}

function writeTicket(version: string, id: string, status: 'open' | 'done' | 'dropped') {
  const dir = path.join(projectDir, 'docs', 'tickets', version)
  fs.mkdirSync(dir, { recursive: true })
  const fm = [
    '---',
    `id: ${id}`,
    `slug: fixture-${id.toLowerCase()}`,
    'type: impl',
    `status: ${status}`,
    'assignee: developer',
    'created: 2026-07-27',
    '---',
    '',
    '## Request',
    'fixture',
    '',
    '## Acceptance',
    '1. fixture',
    '',
    '## Outcome',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`), fm)
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-build-entry-')), 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — build-entry scope-slicing signal (T-430)', () => {
  test('fires: stage=build, version has zero tickets at all', () => {
    const res = runInit()
    setStage('build', res.version)
    const out = doctor()
    expect(out).toMatch(new RegExp(`stage: ${res.version} has 0 open\\+done tickets at stage=build`))
    expect(out).toMatch(/consider build-entry scope slicing/)
  })

  test('fires: stage=build, version has tickets but every one is dropped', () => {
    const res = runInit()
    setStage('build', res.version)
    writeTicket(res.version, 'T-901', 'dropped')
    const out = doctor()
    expect(out).toMatch(/consider build-entry scope slicing/)
  })

  test('silent: stage=build, version already has an open ticket', () => {
    const res = runInit()
    setStage('build', res.version)
    writeTicket(res.version, 'T-902', 'open')
    const out = doctor()
    expect(out).not.toMatch(/consider build-entry scope slicing/)
  })

  test('silent: stage=build, version already has a done ticket (even with none open)', () => {
    const res = runInit()
    setStage('build', res.version)
    writeTicket(res.version, 'T-903', 'done')
    const out = doctor()
    expect(out).not.toMatch(/consider build-entry scope slicing/)
  })

  test('silent: stage=define with zero tickets (signal is build-only)', () => {
    const res = runInit()
    setStage('define', res.version)
    const out = doctor()
    expect(out).not.toMatch(/consider build-entry scope slicing/)
  })

  test('silent: stage=ship with zero tickets at that version (different signal owns ship)', () => {
    const res = runInit()
    setStage('ship', res.version)
    const out = doctor()
    expect(out).not.toMatch(/consider build-entry scope slicing/)
  })
})
