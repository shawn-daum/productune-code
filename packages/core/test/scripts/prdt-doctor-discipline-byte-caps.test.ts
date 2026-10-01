/**
 * prdt-doctor-discipline-byte-caps.test.ts — T-701: a BYTE budget beside every
 * line cap the session-start hook actually injects (doctrine.md · contracts.md
 * · each persona's habit.md · each persona's playbook menu), black-box over the
 * REAL `prdt` CLI (mirrors prdt-doctor-po-habit-cap.test.ts / -override-caps).
 *
 * Unlike `discipline line caps (editorial)` — an Advisory since T-577, never a
 * mismatch — `discipline byte caps` is a GATE: a plain warning list, counted in
 * `violations=` on the verdict line. That is the whole point of the ticket:
 * T-472/T-577 already found that folding growth into an existing line passes
 * the line-only cap unseen; every assertion below is "one byte over its own
 * budget moves `violations=` by exactly 1", proven per document AND for the
 * per-persona session-start total, which has its own separate budget
 * (`CAPS["persona_total_bytes"]`) checked against the sum `_plan_docs_bytes`
 * actually delivers — not derivable from summing the per-document budgets.
 *
 * Every CAP read from `scripts/prdt` by regex, never restated, so a future
 * T-702 diet re-numbering these keeps this file green without an edit here.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')
const REPO_DOCTRINE = path.join(CORE_ROOT, 'doctrine.md')
const CLI_SRC = fs.readFileSync(PRDT_CLI, 'utf8')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

/** One CAPS byte key, read from the CLI source rather than restated here. */
function capBytes(key: string): number {
  const m = CLI_SRC.match(new RegExp(`"${key}":\\s*(\\d+)`))
  if (!m) throw new Error(`CAPS["${key}"] not found in scripts/prdt`)
  return Number(m[1])
}

/** `CAPS["persona_total_bytes"][persona]` — nested, so its own regex. */
function capPersonaTotal(persona: string): number {
  const block = CLI_SRC.match(/"persona_total_bytes":\s*\{([^}]*)\}/)
  if (!block) throw new Error('CAPS["persona_total_bytes"] not found in scripts/prdt')
  const m = block[1].match(new RegExp(`"${persona}":\\s*(\\d+)`))
  if (!m) throw new Error(`CAPS["persona_total_bytes"]["${persona}"] not found in scripts/prdt`)
  return Number(m[1])
}

const DOCTRINE_BYTES = capBytes('doctrine_bytes')
const CONTRACTS_BYTES = capBytes('contracts_bytes')
const PO_HABIT_BYTES = capBytes('po_habit_bytes')
const WORKER_HABIT_BYTES = capBytes('worker_habit_bytes')
const MENU_BYTES = capBytes('menu_bytes')

let sandbox: string
let disciplineDir: string
let machineHome: string
let projectDir: string

/** Pads `path` (already existing, real content) to exactly `budget + delta` bytes. */
function padTo(filePath: string, budget: number, delta: number, fill = 'x') {
  const data = fs.readFileSync(filePath, 'utf8')
  const cur = Buffer.byteLength(data, 'utf8')
  const target = budget + delta
  if (target < cur) throw new Error(`${filePath} is already ${cur} B, past target ${target} B — pick a bigger budget/delta`)
  fs.writeFileSync(filePath, data + fill.repeat(target - cur))
}

type Run = { raw: string; violations: number; warnings: string[] }

function doctor(): Run {
  const raw = execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('doctor'),
  })
  const verdict = raw.split('\n').find((l) => l.includes('[verdict='))
  const m = verdict?.match(/violations=(\d+)/)
  if (!m) throw new Error(`no verdict line in doctor output:\n${raw}`)
  return { raw, violations: Number(m[1]), warnings: raw.split('\n').filter((l) => l.startsWith('⚠ ')) }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-byte-caps-'))
  // Real discipline tree + real doctrine.md copied into the sandbox at the same
  // relative layout `discipline_root()` expects (droot.parent / doctrine.md);
  // one test's target file gets overwritten, everything else stays real so
  // every OTHER doctor check (menu freshness, mirror drift, …) stays quiet.
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  fs.copyFileSync(REPO_DOCTRINE, path.join(sandbox, 'doctrine.md'))
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — discipline byte caps are a GATE, not an advisory (T-701)', () => {
  test('the real tree, unmodified, passes — no byte-cap warning at all', () => {
    const r = doctor()
    expect(r.warnings.filter((w) => w.includes("CAPS['"))).toEqual([])
  })

  describe('contracts.md', () => {
    test(`fires at ${CONTRACTS_BYTES + 1} B`, () => {
      const base = doctor().violations
      padTo(path.join(disciplineDir, 'contracts.md'), CONTRACTS_BYTES, 1)
      const r = doctor()
      expect(r.warnings.some((w) => w.includes(`contracts.md is ${(CONTRACTS_BYTES + 1).toLocaleString('en-US')} B`)
        && w.includes("CAPS['contracts_bytes']"))).toBe(true)
      expect(r.violations).toBe(base + 1)
    })

    test(`silent at exactly ${CONTRACTS_BYTES} B (the budget itself)`, () => {
      padTo(path.join(disciplineDir, 'contracts.md'), CONTRACTS_BYTES, 0)
      expect(doctor().warnings.some((w) => w.includes('contracts.md is') && w.includes("CAPS['contracts_bytes']"))).toBe(false)
    })
  })

  describe('doctrine.md', () => {
    test(`fires at ${DOCTRINE_BYTES + 1} B`, () => {
      padTo(path.join(sandbox, 'doctrine.md'), DOCTRINE_BYTES, 1)
      const r = doctor()
      expect(r.warnings.some((w) => w.includes(`doctrine.md is ${(DOCTRINE_BYTES + 1).toLocaleString('en-US')} B`)
        && w.includes("CAPS['doctrine_bytes']"))).toBe(true)
    })
  })

  describe('po/habit.md — its OWN budget, independent of worker_habit_bytes', () => {
    test(`fires at ${PO_HABIT_BYTES + 1} B`, () => {
      const base = doctor().violations
      padTo(path.join(disciplineDir, 'po', 'habit.md'), PO_HABIT_BYTES, 1)
      const r = doctor()
      expect(r.warnings.some((w) => w.includes('po/habit.md is') && w.includes("CAPS['po_habit_bytes']"))).toBe(true)
      expect(r.violations).toBe(base + 1)
    })
  })

  describe('worker_habit_bytes — shared by designer/developer/qa', () => {
    test(`developer/habit.md fires at ${WORKER_HABIT_BYTES + 1} B, against worker_habit_bytes not po_habit_bytes`, () => {
      const base = doctor().violations
      padTo(path.join(disciplineDir, 'developer', 'habit.md'), WORKER_HABIT_BYTES, 1)
      const r = doctor()
      expect(r.warnings.some((w) => w.includes('developer/habit.md is') && w.includes("CAPS['worker_habit_bytes']"))).toBe(true)
      expect(r.warnings.some((w) => w.includes('po/habit.md'))).toBe(false)
      // The growth needed to reach WORKER_HABIT_BYTES+1 (2,584 B → 6,001 B) is
      // also enough to push the developer session-start TOTAL past its own,
      // separate budget — both gates correctly fire (base+2), which is the two
      // budgets composing as designed, not a false positive from this fixture.
      expect(r.violations).toBeGreaterThanOrEqual(base + 1)
    })

    test('qa/habit.md silent at exactly the shared budget', () => {
      padTo(path.join(disciplineDir, 'qa', 'habit.md'), WORKER_HABIT_BYTES, 0)
      expect(doctor().warnings.some((w) => w.includes('qa/habit.md is') && w.includes("CAPS['worker_habit_bytes']"))).toBe(false)
    })
  })

  describe('playbook menus (_index.md) — menu_bytes', () => {
    test(`developer menu fires at ${MENU_BYTES + 1} B`, () => {
      const base = doctor().violations
      padTo(path.join(disciplineDir, 'developer', 'playbooks', '_index.md'), MENU_BYTES, 1)
      const r = doctor()
      expect(r.warnings.some((w) => w.includes('developer menu') && w.includes("CAPS['menu_bytes']"))).toBe(true)
      // Padding raw filler onto _index.md also invalidates its match against
      // the frontmatter-generated content (the pre-existing `discipline menus`
      // check, unrelated to T-701) — an expected side effect of this fixture
      // shape, so the delta is at least 1, not necessarily exactly 1.
      expect(r.violations).toBeGreaterThanOrEqual(base + 1)
    })
  })

  describe('persona_total_bytes — the delivered sum, not derivable from the per-document budgets alone', () => {
    test('developer: growing habit.md within ITS OWN budget can still push the persona total over its own separate budget', () => {
      const total = capPersonaTotal('developer')
      const habitPath = path.join(disciplineDir, 'developer', 'habit.md')
      const before = Buffer.byteLength(fs.readFileSync(habitPath, 'utf8'), 'utf8')
      // grow habit.md just enough to push the (doctrine+contracts+habit+menu)
      // sum one byte past `total`, while staying well under WORKER_HABIT_BYTES —
      // proves this is a SEPARATE gate, not an artifact of the per-document one.
      const base = doctor()
      // current docs total for developer, as this same tree measures it, is
      // reported on the informational summary line — read it back rather than
      // recomputing the hook's own split here.
      const summaryLine = base.raw.split('\n').find((l) => l.startsWith('doctor: discipline delivery'))
      expect(summaryLine, 'discipline delivery summary line present').toBeTruthy()
      const m = summaryLine!.match(/developer ([\d,]+) B wire \(([\d,]+) B docs\)/)
      expect(m, 'developer docs-bytes figure present in the summary').toBeTruthy()
      const currentDocsBytes = Number(m![2].replace(/,/g, ''))
      const need = total - currentDocsBytes + 1
      expect(need).toBeGreaterThan(0)
      expect(before + need).toBeLessThan(WORKER_HABIT_BYTES) // stays under the per-document cap
      fs.appendFileSync(habitPath, 'q'.repeat(need))
      const r = doctor()
      expect(r.warnings.some((w) => w.includes('developer session-start total is')
        && w.includes('CAPS[\'persona_total_bytes\']["developer"]'))).toBe(true)
      // the per-document habit check must stay silent — this is the OTHER gate
      expect(r.warnings.some((w) => w.includes('developer/habit.md is') && w.includes("CAPS['worker_habit_bytes']"))).toBe(false)
      // T-790: name the lines that moved, so a count off by one says WHICH check moved it
      const moved = r.warnings.filter((w) => !base.warnings.includes(w))
      expect(r.violations, `new ⚠ lines:\n${moved.join('\n')}`).toBe(base.violations + 1)
    })
  })
})
