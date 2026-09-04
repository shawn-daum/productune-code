/**
 * prdt doctor — discipline DELIVERY, in the discipline↔execution family (T-577).
 *
 * The family's largest member was invisible to it: every line cap read green
 * while the session-start payload (44,915 B in one hook output) was being
 * persisted by the harness past 10,000 chars and injected as a 2 KB preview —
 * contracts.md and po/habit.md reached no persona on this machine. Doctor now
 * asks the hook for its own split (`--plan`) and reports what the plan says:
 * delivered bytes per persona against the per-part budget, parts needed vs hook
 * slots registered, and the two ways a part can still fail to arrive (more parts
 * than slots; one line larger than a whole part). Black-box over the REAL CLI
 * and the REAL hook, sandboxed PRDT_HOME (never the developer's ~/.prdt).
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
const READY = which('python3') && which('jq')

let sandbox: string
let disciplineDir: string
let machineHome: string
let projectDir: string

function doctor(): string {
  try {
    return execFileSync('python3', [PRDT_CLI, 'doctor'], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    })
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

function familyLine(out: string): string {
  const line = out.split('\n').find((l) => l.startsWith('doctor: discipline↔execution — '))
  expect(line, 'family verdict line').toBeDefined()
  return line!
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-delivery-'))
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  fs.copyFileSync(path.join(CORE_ROOT, 'doctrine.md'), path.join(sandbox, 'doctrine.md'))
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

describe.skipIf(!READY)('doctor reports delivered size against the budget (T-577)', () => {
  test('every run prints one delivery line: bytes → parts per persona, the budget, the threshold, the slots', () => {
    const out = doctor()
    const line = out.split('\n').find((l) => l.startsWith('doctor: discipline delivery — '))
    expect(line, 'delivery summary line').toBeDefined()
    for (const persona of ['po', 'designer', 'developer', 'qa']) {
      expect(line).toMatch(new RegExp(`${persona} [\\d,]+ B → \\d+ parts \\(largest [\\d,]+ B\\)`))
    }
    expect(line).toMatch(/budget ≤8,000 B\/part/)
    expect(line).toMatch(/over 10,000 chars/)
    expect(line).toMatch(/\d+ part slots/)
    // the real set fits today — no delivery violation, and the family sees the check
    expect(out).not.toMatch(/⚠ discipline delivery: prdt-\w+ needs/)
  })

  test('a set that needs more parts than there are slots is a discipline↔execution VIOLATION naming what is lost', () => {
    const fat = Array.from({ length: 60 }, (_, i) => `## Section ${i}\n- rule ${i} ${'x'.repeat(1900)}\n`).join('\n')
    fs.writeFileSync(path.join(disciplineDir, 'contracts.md'), `# Contracts\n\n${fat}`)
    const out = doctor()
    expect(out).toMatch(/⚠ discipline delivery: prdt-po needs \d+ parts of ≤8000 B but only \d+ hook slot\(s\) exist — .*never reach the session/)
    const fam = familyLine(out)
    const violations = Number(fam.match(/violations=(\d+)/)![1])
    expect(violations).toBeGreaterThan(0)
  })

  test('one line larger than a whole part is a violation too — it is withheld from injection', () => {
    fs.writeFileSync(path.join(disciplineDir, 'qa', 'habit.md'), `# QA habit\n\n- ${'y'.repeat(9000)}\n- fine\n`)
    const out = doctor()
    expect(out).toMatch(/⚠ discipline delivery: qa habit line 3 is 9002 B — larger than one 8000-byte part/)
  })

  test('line caps are an editorial advisory now: printed, but not a mismatch', () => {
    const lines = ['# po habit fixture']
    while (lines.length < 70) lines.push(`- fixture rule line ${lines.length}.`)
    fs.writeFileSync(path.join(disciplineDir, 'po', 'habit.md'), lines.join('\n') + '\n')
    const out = doctor()
    expect(out).toMatch(/⚠ discipline: po\/habit\.md exceeds 64 lines/)
    // …and the delivery line still shows the (small) set fitting comfortably
    expect(out).toMatch(/doctor: discipline delivery — po [\d,]+ B → \d+ parts/)
    // an over-cap habit that still DELIVERS moves no mismatch count on its own:
    // the only violations in this sandbox must come from something else, so
    // compare against the same sandbox with the habit under the cap.
    const withCap = Number(familyLine(out).match(/violations=(\d+)/)![1])
    fs.writeFileSync(path.join(disciplineDir, 'po', 'habit.md'), lines.slice(0, 60).join('\n') + '\n')
    const withoutCap = Number(familyLine(doctor()).match(/violations=(\d+)/)![1])
    expect(withCap).toBe(withoutCap)
  })
})
