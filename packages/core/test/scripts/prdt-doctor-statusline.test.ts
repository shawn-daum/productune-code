/**
 * prdt doctor — statusline registration (T-500).
 *
 * install.sh §6 preserves any existing `statusLine` (ours or someone else's)
 * by default and only ever logs one install-time line about it — nothing
 * re-checks afterward, so a machine that diverged once (something else was
 * already registered when install.sh first ran) stays diverged forever with
 * zero ongoing signal. Repro measured live on a real machine 2026-08-31:
 * re-running install.sh against a pre-existing custom statusLine printed
 * `6) Statusline NOT registered (existing statusLine preserved) — force with:
 * install.sh --statusline` and nothing else ever mentioned it again.
 *
 * Four states, each asserted here, plus the project-level override the
 * ticket calls out by name (`.claude/settings.json` / `settings.local.json`
 * in the project silently outrank the user-level registration — a check that
 * only reads the user level is narrower than the thing it reports on, the
 * exact defect the two prior tickets this round shipped once each and had to
 * fix). `prdt init` physically splits a fresh project by default
 * (`code.dir` = "code", no pre-existing `.git`), so the project fixture here
 * already exercises the dual projectRoot/codeRoot check with no extra setup.
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
let claudeDir: string
let projectDir: string
let disciplineDir: string

/** The prdt statusline path a HEALTHY registration must point at. */
function prdtStatuslinePath(): string {
  return path.join(machineHome, 'bin', 'statusline-prdt.sh')
}

/** Install a real, executable prdt statusline script into the machine mirror
 *  (content irrelevant — doctor only checks existence + the executable bit),
 *  plus a prdt.env carrying PRDT_REPO so repair lines get a real path. */
function seedMachine() {
  fs.mkdirSync(path.join(machineHome, 'bin'), { recursive: true })
  // statusline_warnings() early-outs when hooks/ is absent (T-500 fix for a
  // vitest-suite-wide regression: "no install mirror at all" must stay
  // silent, same idiom hook_registration_warnings already uses) — an
  // installed machine always has this dir (install.sh §1 mkdir -p), so a
  // fixture claiming to BE an installed machine must have it too.
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  fs.writeFileSync(prdtStatuslinePath(), '#!/usr/bin/env bash\necho ok\n', { mode: 0o755 })
  fs.writeFileSync(path.join(machineHome, 'prdt.env'), `PRDT_REPO=${CORE_ROOT}\n`)
}

/** Write a bare (no quote-wrapping — how a hand-edited custom entry usually
 *  looks) statusLine command into a settings file, creating parent dirs. */
function writeStatusline(file: string, command: string | undefined) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  if (command === undefined) delete existing.statusLine
  else existing.statusLine = { type: 'command', command }
  fs.writeFileSync(file, JSON.stringify(existing, null, 2))
}

function userSettingsPath(): string { return path.join(claudeDir, 'settings.json') }
function codeRoot(): string { return path.join(projectDir, 'code') }

function doctorStatuslineLines(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir, CLAUDE_DIR: claudeDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  return out.split('\n').filter((l) => l.includes('statusline:'))
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-statusline-'))
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  machineHome = path.join(sandbox, 'prdt-home')
  claudeDir = path.join(sandbox, 'claude')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  seedMachine()
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
})

afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt doctor — statusline registration states', () => {
  test('positive control: healthy (registered at the prdt path, executable) is silent', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    expect(doctorStatuslineLines()).toEqual([])
  })

  test('not registered anywhere is reported, naming the exact repair command', () => {
    // no statusLine written at all — user settings.json doesn't even exist
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('not registered anywhere')
    expect(lines[0]).toContain(path.join(CORE_ROOT, 'scripts', 'install.sh') + ' --statusline')
  })

  test('registered but pointing at something that is not the prdt statusline is reported', () => {
    writeStatusline(userSettingsPath(), '/usr/bin/echo hi')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('/usr/bin/echo')
    expect(lines[0]).toContain('not the prdt statusline')
    expect(lines[0]).toContain('--statusline')
  })

  test('registered at the prdt path but the file is missing is reported as broken', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    fs.rmSync(prdtStatuslinePath())
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('missing')
    expect(lines[0]).toContain(path.join(CORE_ROOT, 'scripts', 'install.sh'))
  })

  test('registered at the prdt path but the file is not executable is reported as broken', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    fs.chmodSync(prdtStatuslinePath(), 0o644)
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('not executable')
  })

  test('a repaired machine (following only the printed command) goes healthy — full loop', () => {
    writeStatusline(userSettingsPath(), '/usr/bin/echo hi') // the T-500 repro fixture
    const before = doctorStatuslineLines()
    expect(before.length).toBe(1)
    execFileSync('bash', [path.join(CORE_ROOT, 'scripts', 'install.sh'), '--statusline'], {
      env: { ...process.env, HOME: sandbox, PRDT_HOME: machineHome, CLAUDE_DIR: claudeDir },
      stdio: 'ignore',
    })
    expect(doctorStatuslineLines()).toEqual([])
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — statusline: project-level override coverage', () => {
  test('a project-level settings.json statusLine silently shadowing a healthy user-level one is reported', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // user-level: healthy
    writeStatusline(path.join(projectDir, '.claude', 'settings.json'), '/usr/bin/echo project')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('silently wins')
    expect(lines[0]).toContain('jq')
  })

  test('settings.local.json outranks settings.json at the same root', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    writeStatusline(path.join(projectDir, '.claude', 'settings.json'), prdtStatuslinePath()) // healthy
    writeStatusline(path.join(projectDir, '.claude', 'settings.local.json'), '/usr/bin/echo local') // wins, unhealthy
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('settings.local.json')
  })

  test('the codeRoot (physical split default) is checked independently of the project root', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // user-level: healthy
    writeStatusline(path.join(codeRoot(), '.claude', 'settings.json'), '/usr/bin/echo codeside')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(codeRoot(), '.claude', 'settings.json'))
  })

  test('a healthy project-level override at every reachable root clears the check, unhealthy user level included', () => {
    writeStatusline(userSettingsPath(), '/usr/bin/echo unhealthy-user') // would be unhealthy alone
    // both projectRoot and codeRoot (the two real dev cwds under the v1.3
    // physical split) declare a healthy override, so the bad user-level entry
    // is unreachable from either — this is the ONE way to fully shadow it,
    // proving the win is per-root, not a single global flag.
    writeStatusline(path.join(projectDir, '.claude', 'settings.json'), prdtStatuslinePath())
    writeStatusline(path.join(codeRoot(), '.claude', 'settings.json'), prdtStatuslinePath())
    expect(doctorStatuslineLines()).toEqual([])
  })

  test('doctor never writes to any settings file (report-only, no clobber)', () => {
    writeStatusline(userSettingsPath(), '/usr/bin/echo hi')
    const before = fs.readFileSync(userSettingsPath(), 'utf8')
    doctorStatuslineLines()
    expect(fs.readFileSync(userSettingsPath(), 'utf8')).toBe(before)
  })
})
