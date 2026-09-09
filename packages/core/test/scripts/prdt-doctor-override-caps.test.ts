/**
 * prdt-doctor-override-caps.test.ts — T-446 CAPS additions in `prdt doctor`
 * (design §8b · §11), black-box over the REAL CLI.
 *
 * Three checks, all warning-only (doctor is a non-blocking lint):
 *  - override ≤20 lines PER PERSONA PER LAYER — override text is the only thing
 *    injected on every single turn, so it is the one budget that compounds.
 *  - machine wiki page count vs the ~15 budget.
 *  - the same rule present in BOTH override layers, differing only by
 *    normalization — the machine half of the Retro align step. It must not fire
 *    on two lines that merely cover the same topic, or the signal is noise.
 *
 * `PRDT_HOME` points the machine layer at a sandbox; the real `~/.prdt` is never
 * read or written.
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
let machineHome: string
let projectDir: string

function doctor(): string {
  try {
    return execFileSync('python3', [PRDT_CLI, 'doctor'], {
      cwd: projectDir,
      // pin the discipline scope to the repo checkout so the caps this test does
      // NOT assert about stay deterministic
      env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: REPO_DISCIPLINE },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
    })
  } catch (e: any) {
    throw new Error(`prdt doctor failed: ${e.stderr || e.message}`)
  }
}

/** Writes an override file with `count` distinct rule lines under a heading. */
function overrideOfLength(layerDir: string, persona: string, count: number) {
  const lines = [`# ${persona} overrides`, '']
  for (let i = 1; i <= count; i++) lines.push(`- distinct rule number ${i} about its own subject.`)
  fs.mkdirSync(layerDir, { recursive: true })
  fs.writeFileSync(path.join(layerDir, `${persona}.md`), lines.join('\n') + '\n')
  return lines.length + 1 // trailing newline yields no extra physical line
}

function machineLayer() { return path.join(machineHome, 'overrides') }
function projectLayer() { return path.join(projectDir, '.prdt', 'overrides') }

function writeOverride(layerDir: string, persona: string, lines: string[]) {
  fs.mkdirSync(layerDir, { recursive: true })
  fs.writeFileSync(path.join(layerDir, `${persona}.md`), lines.join('\n') + '\n')
}

function writeMachinePages(n: number) {
  const wdir = path.join(machineHome, 'wiki')
  fs.mkdirSync(wdir, { recursive: true })
  for (let i = 1; i <= n; i++) {
    fs.writeFileSync(path.join(wdir, `fact--page-${i}.md`),
      `---\ntitle: page ${i}\ntype: fact\n---\nbody ${i}\n`)
  }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-override-caps-'))
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir, env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — override cap ≤20 per layer (T-446)', () => {
  test('fires on the machine layer over cap, naming the layer and the count', () => {
    overrideOfLength(machineLayer(), 'developer', 19) // 19 rules + heading + blank = 21 lines
    expect(doctor()).toMatch(/override: machine developer\.md is 21 lines \(cap 20\)/)
  })

  test('fires on the project layer over cap', () => {
    overrideOfLength(projectLayer(), 'qa', 19)
    expect(doctor()).toMatch(/override: project qa\.md is 21 lines \(cap 20\)/)
  })

  test('silent at exactly the cap, in both layers', () => {
    overrideOfLength(machineLayer(), 'developer', 18) // = 20 lines
    overrideOfLength(projectLayer(), 'qa', 18)
    expect(doctor()).not.toMatch(/override: \w+ \w+\.md is \d+ lines/)
  })

  test('over cap is a warning, never a failure — doctor still exits 0', () => {
    overrideOfLength(machineLayer(), 'po', 40)
    const out = doctor() // execFileSync would have thrown on a non-zero exit
    expect(out).toMatch(/override: machine po\.md is \d+ lines/)
    expect(out).toMatch(/warning\(s\)\) \(non-blocking\)|\(non-blocking\)/)
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — duplicate rule across override layers (T-446)', () => {
  const RULE = 'GUI focus / synthetic-key / IME checks on this machine REQUIRE the lume VM (상세: machine:fact--qa-cua-vm).'

  test('fires when the two layers hold the same rule differing only by normalization', () => {
    writeOverride(machineLayer(), 'developer', ['# developer', '', `- ${RULE}`])
    // same rule: bullet char, case, emphasis, doubled space, em dash, trailing period
    writeOverride(projectLayer(), 'developer', ['# developer', '',
      '* gui focus / synthetic-key / ime checks on this machine **require** the lume  VM (상세: machine:fact--qa-cua-vm)'])
    const out = doctor()
    expect(out).toMatch(/override: developer — machine L3 and project L3 are the same rule after normalization/)
  })

  test('silent on two lines that merely cover the same topic in different words', () => {
    writeOverride(machineLayer(), 'developer', ['# developer', '', `- ${RULE}`])
    writeOverride(projectLayer(), 'developer', ['# developer', '',
      '- Window-focus verification for this repo runs inside the VM, and the QA playbook owns the checklist.'])
    expect(doctor()).not.toMatch(/are the same rule after normalization/)
  })

  test('silent on structure that legitimately repeats — headings and blank lines', () => {
    writeOverride(machineLayer(), 'qa', ['# qa overrides', '', '- machine-only rule about the VM lifecycle.'])
    writeOverride(projectLayer(), 'qa', ['# qa overrides', '', '- project-only rule about this repo fixtures.'])
    expect(doctor()).not.toMatch(/are the same rule after normalization/)
  })

  test('a rule repeated inside ONE layer is not a cross-layer duplicate', () => {
    writeOverride(machineLayer(), 'designer', ['# designer', '', `- ${RULE}`, `- ${RULE}`])
    expect(doctor()).not.toMatch(/are the same rule after normalization/)
  })

  test('personas are independent — the same line under two different personas is not a duplicate', () => {
    writeOverride(machineLayer(), 'developer', ['# developer', '', `- ${RULE}`])
    writeOverride(projectLayer(), 'qa', ['# qa', '', `- ${RULE}`])
    expect(doctor()).not.toMatch(/are the same rule after normalization/)
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — machine wiki page budget (T-446)', () => {
  test('fires past the ~15 page budget', () => {
    writeMachinePages(16)
    expect(doctor()).toMatch(/machine wiki: 16 pages \(budget ~15\)/)
  })

  test('silent at the budget', () => {
    writeMachinePages(15)
    expect(doctor()).not.toMatch(/machine wiki: \d+ pages/)
  })

  test('flags a machine index that no longer matches its pages, and stays quiet once regenerated', () => {
    writeMachinePages(2)
    expect(doctor()).toMatch(/machine wiki: index\.md missing — run `prdt wiki reindex`/)
    execFileSync('python3', [PRDT_CLI, 'wiki', 'reindex'], {
      cwd: projectDir, env: { ...process.env, PRDT_HOME: machineHome },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
    })
    expect(doctor()).not.toMatch(/machine wiki: index\.md/)
    writeMachinePages(3)
    expect(doctor()).toMatch(/machine wiki: index\.md stale vs pages/)
  })

  test('an empty machine store says nothing at all', () => {
    expect(doctor()).not.toMatch(/machine wiki:/)
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — playbook-scoped machine store (T-586)', () => {
  function writePlaybookOverride(name: string, lines: string[]) {
    const d = path.join(machineLayer(), 'playbooks')
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, `${name}.md`), lines.join('\n') + '\n')
  }

  test("a name that is no persona's playbook is named — it binds nobody", () => {
    writePlaybookOverride('implemnt', ['- typo'])
    expect(doctor()).toMatch(/override: playbooks\/implemnt\.md names no playbook of any persona/)
  })

  test('the same ≤20-line cap applies, naming the store', () => {
    writePlaybookOverride('grill', Array.from({ length: 21 }, (_, i) => `- distinct rule number ${i + 1} about its own subject.`))
    expect(doctor()).toMatch(/override: machine playbooks\/grill\.md is 21 lines \(cap 20\)/)
  })

  test('silent on a legal name at the cap; an empty store directory says nothing', () => {
    fs.mkdirSync(path.join(machineLayer(), 'playbooks'), { recursive: true })
    expect(doctor()).not.toMatch(/override: .*playbooks\//)
    writePlaybookOverride('grill', Array.from({ length: 20 }, (_, i) => `- rule ${i + 1}.`))
    expect(doctor()).not.toMatch(/override: .*playbooks\//)
  })
})
