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
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const PERSONAS = ['po', 'designer', 'developer', 'qa'] as const
type Persona = (typeof PERSONAS)[number]

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

/** `prdt doctor` with PRDT_HOME pointed at `home` and NO PRDT_DISCIPLINE override —
 *  the shape a real machine has, so the hook commands below see exactly what doctor saw. */
function doctorAtHome(home: string): string {
  const env = { ...process.env, PRDT_HOME: home }
  delete (env as any).PRDT_DISCIPLINE
  try {
    return execFileSync('python3', [PRDT_CLI, 'doctor'], {
      cwd: projectDir, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    })
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

/** The registered part slots, in part order: prdt-session-start.sh is part 1, the
 *  p<k>.sh siblings are parts 2..K. Read from the hooks dir — the same roster
 *  hook-manifest.json registers — never from the plan doctor is being checked against. */
function slotCommands(): string[] {
  return fs.readdirSync(HOOKS)
    .filter((f) => /^prdt-session-start(-p\d+)?\.sh$/.test(f))
    .sort((a, b) => slotNumber(a) - slotNumber(b))
    .map((f) => path.join(HOOKS, f))
}
function slotNumber(f: string): number {
  const m = f.match(/-p(\d+)\.sh$/)
  return m ? Number(m[1]) : 1
}

/** One slot command run exactly as the harness runs it: the SubagentStart event on
 *  stdin, PRDT_HOME as the machine's. Returns the additionalContext string — the
 *  thing the harness measures — or '' when the slot printed nothing. */
function emitPart(home: string, cmd: string, persona: Persona): string {
  const env = { ...process.env, PRDT_HOME: home }
  delete (env as any).PRDT_DISCIPLINE
  const out = execFileSync('bash', [cmd], {
    input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: `prdt-${persona}`, cwd: projectDir }),
    encoding: 'utf8', env, timeout: 30000,
  })
  if (!out.trim()) return ''
  return JSON.parse(out).hookSpecificOutput.additionalContext as string
}

function deliveryLine(out: string): string {
  const line = out.split('\n').find((l) => l.startsWith('doctor: discipline delivery — '))
  expect(line, 'delivery summary line').toBeDefined()
  return line!
}

/** The four numbers doctor prints for one persona. */
function cell(line: string, persona: Persona): { wire: number; docs: number; parts: number; largest: number } {
  const m = line.match(new RegExp(`${persona} ([\\d,]+) B wire \\(([\\d,]+) B docs\\) → (\\d+) parts \\(largest ([\\d,]+) B\\)`))
  expect(m, `${persona} cell in: ${line}`).not.toBeNull()
  const n = (t: string) => Number(t.replace(/,/g, ''))
  return { wire: n(m![1]), docs: n(m![2]), parts: Number(m![3]), largest: n(m![4]) }
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
    for (const persona of PERSONAS) {
      const c = cell(line, persona)
      // the wire carries the documents plus a header/delimiters/footer per part, so it
      // is the larger figure — printing the documents as if they shipped was T-580's defect
      expect(c.wire).toBeGreaterThan(c.docs)
      expect(c.largest).toBeLessThanOrEqual(8000)
    }
    expect(line).toMatch(/budget ≤8,000 B\/part, gated on the wire/)
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
    expect(out).toMatch(/doctor: discipline delivery — po [\d,]+ B wire \([\d,]+ B docs\) → \d+ parts/)
    // an over-cap habit that still DELIVERS moves no mismatch count on its own:
    // the only violations in this sandbox must come from something else, so
    // compare against the same sandbox with the habit under the cap.
    const withCap = Number(familyLine(out).match(/violations=(\d+)/)![1])
    fs.writeFileSync(path.join(disciplineDir, 'po', 'habit.md'), lines.slice(0, 60).join('\n') + '\n')
    const withoutCap = Number(familyLine(doctor()).match(/violations=(\d+)/)![1])
    expect(withCap).toBe(withoutCap)
  })
})

// ── T-580: the number doctor prints IS the number that ships ──────────────────
// Measured 2026-09-04 (QA, live-verify): doctor printed qa 26,296 B while the five
// registered SessionStart commands emitted 34,021 B between them — the summary's
// total was the DOCUMENTS' size while `largest` was a rendered part (which is why
// `largest` agreed and the total did not). The tests below do not assert two
// numbers that happen to agree today: they run the real slot commands the way the
// harness does and require doctor's printed figures to equal what came out.
describe.skipIf(!READY)('doctor prints what the hook commands emit (T-580)', () => {
  test('per persona: wire bytes == Σ additionalContext of the slot commands, parts == slots that spoke, largest == the biggest of them', () => {
    // The sandbox IS laid out like a PRDT_HOME (discipline/ + doctrine.md), so doctor
    // and the hooks can share one PRDT_HOME with no PRDT_DISCIPLINE override in play.
    fs.mkdirSync(path.join(sandbox, 'wiki'), { recursive: true })
    const line = deliveryLine(doctorAtHome(sandbox))
    const commands = slotCommands()
    expect(line).toContain(`${commands.length} part slots`)
    for (const persona of PERSONAS) {
      const emitted = commands.map((c) => emitPart(sandbox, c, persona)).filter((s) => s !== '')
      const sizes = emitted.map((s) => Buffer.byteLength(s, 'utf8'))
      const c = cell(line, persona)
      expect(c.parts, `${persona}: parts that emitted`).toBe(emitted.length)
      expect(c.wire, `${persona}: bytes on the wire`).toBe(sizes.reduce((a, b) => a + b, 0))
      expect(c.largest, `${persona}: largest part`).toBe(Math.max(...sizes))
      // every emitted part is under the budget — the gate the wire figure exists for
      for (const [i, n] of sizes.entries()) expect(n, `${persona} part ${i + 1}`).toBeLessThanOrEqual(8000)
      // and the documents figure is exactly the set the parts carry: doctrine,
      // contracts, the persona's habit, its menu(s) — each without its trailing newlines
      const menus = persona === 'po' ? PERSONAS : [persona]
      const docs = [
        path.join(sandbox, 'doctrine.md'),
        path.join(disciplineDir, 'contracts.md'),
        path.join(disciplineDir, persona, 'habit.md'),
        ...menus.map((m) => path.join(disciplineDir, m, 'playbooks', '_index.md')),
      ]
      const docBytes = docs.reduce((a, f) => a + Buffer.byteLength(fs.readFileSync(f, 'utf8').replace(/\n+$/, ''), 'utf8'), 0)
      expect(c.docs, `${persona}: documents carried`).toBe(docBytes)
    }
    // one doctor run + every registered slot × four personas (48 real hook launches):
    // measured 212 s at load average 12, so this test carries its own budget
  }, 600_000)

  test('a delivered part larger on the wire than its limit is a VIOLATION — doctor gates on the rendered size, not the documents', () => {
    // The real hook re-splits until every part fits, so the over-limit case is
    // driven through the plan seam: a bound (mirror) hook whose plan reports one
    // part at 8,120 B against an 8,000 B limit while the documents total looks small.
    const hooksDir = path.join(machineHome, 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })
    const plan = {
      persona: 'qa', agent: 'prdt-qa', threshold_chars: 10000, budget_bytes: 8000, slots: 12,
      docs_bytes: 6000, wire_bytes: 12120, parts_needed: 2,
      parts: [
        { n: 1, bytes: 8120, limit: 8000, pieces: [] },
        { n: 2, bytes: 4000, limit: 8000, pieces: [] },
      ],
      undelivered: [], oversized: [],
    }
    // the same plan for every persona doctor asks about — the point is the gate, not the split
    fs.writeFileSync(path.join(hooksDir, 'prdt-session-start.sh'),
      `#!/usr/bin/env bash\n[ "$1" = "--plan" ] || exit 0\ncat <<'JSON'\n${JSON.stringify(plan)}\nJSON\n`)
    const out = doctor()
    expect(out).toMatch(/⚠ discipline delivery: prdt-po part 1\/2 is 8,120 B on the wire — over the 8,000 B this slot may emit/)
    expect(out).toMatch(/doctor: discipline delivery — po 12,120 B wire \(6,000 B docs\) → 2 parts \(largest 8,120 B\)/)
    expect(Number(familyLine(out).match(/violations=(\d+)/)![1])).toBeGreaterThan(0)
  })
})
