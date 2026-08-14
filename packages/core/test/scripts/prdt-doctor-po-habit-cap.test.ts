/**
 * prdt-doctor-po-habit-cap.test.ts — po_habit cap raised 60→64 (2026-08-14),
 * black-box over the REAL `prdt` CLI (mirrors prdt-doctor-override-caps.test.ts).
 *
 * po/habit.md sat at exactly 60/60 with two pending v1.6 rules (T-436, T-451)
 * each needing one new line, and T-447 had already spent the easy
 * duplicate-trims — the next trim would have deleted a real rule to fit the
 * cap, a priority inversion. worker_habit (40, shared by
 * designer/developer/qa) is a SEPARATE constant in CAPS and is not touched by
 * this change — the second describe block below pins that.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let disciplineDir: string
let machineHome: string
let projectDir: string

/** Overwrites `<persona>/habit.md` in the sandboxed discipline copy with exactly `lineCount` physical lines. */
function writeHabit(persona: string, lineCount: number) {
  const lines = [`# ${persona} habit fixture`]
  while (lines.length < lineCount) lines.push(`- fixture rule line ${lines.length}.`)
  fs.writeFileSync(path.join(disciplineDir, persona, 'habit.md'), lines.join('\n') + '\n')
}

function doctor(): string {
  try {
    return execFileSync('python3', [PRDT_CLI, 'doctor'], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
    })
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-po-habit-cap-'))
  // Real discipline tree copied into the sandbox — habit.md gets overwritten per
  // test, everything else (playbooks, menus, other personas) stays real so menu
  // drift checks stay quiet.
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  // PRDT_HOME pinned to a sandbox too — the real `~/.prdt` is never read or
  // written (T-450: a spec that skips this can mutate the developer's machine).
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — po habit cap raised to 64', () => {
  test('fires at 65 lines', () => {
    writeHabit('po', 65)
    expect(doctor()).toMatch(/discipline: po\/habit\.md exceeds 64 lines/)
  })

  test('silent at exactly 64 lines (the new cap)', () => {
    writeHabit('po', 64)
    expect(doctor()).not.toMatch(/discipline: po\/habit\.md exceeds/)
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — worker_habit stays an independent 40-line cap', () => {
  test('fires at 41 lines, still against 40 (not the raised po cap)', () => {
    writeHabit('developer', 41)
    const out = doctor()
    expect(out).toMatch(/discipline: developer\/habit\.md exceeds 40 lines/)
    expect(out).not.toMatch(/po\/habit\.md/)
  })

  test('silent at exactly 40 lines', () => {
    writeHabit('qa', 40)
    expect(doctor()).not.toMatch(/discipline: qa\/habit\.md exceeds/)
  })
})
