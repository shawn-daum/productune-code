/**
 * prdt doctor — hook roster + FIRE evidence (T-445 lesson, T-491 S1).
 *
 * T-445: a roster change was itself the defect source, because "registered"
 * was only ever checked by reading the same file that wrote it. T-498 §8 r6
 * then measured the sharp edge: settings.json accepts a MISSPELLED event name
 * with no error, no warning, and no log line — a registration can be present,
 * well-formed, and completely dead.
 *
 * So doctor checks three things, all black-box over the REAL CLI:
 *   1. every hook in the install mirror is registered somewhere,
 *   2. every registered prdt hook still exists in the mirror,
 *   3. the call governor's two events have actually FIRED — proven by the
 *      per-event marker the hook itself stamps, not by re-reading settings.
 *
 * Only the governor is checked for (3) here, via filesystem evidence: it is
 * the only hook that stamps a fire marker, because it is the only hook whose
 * failure looks exactly like a quiet one — a registration can be present,
 * well-formed, and dead, and nothing short of a fire marker would tell doctor
 * apart from a session that simply never used the tool being watched.
 *
 * That is NOT the same as saying no other hook's failure is checkable. T-490's
 * prdt-dispatch-gate.sh (PreToolUse, matcher `Agent`) is checkable too, just not
 * by a filesystem marker: it is deny/warn-shaped, so its own OUTPUT is the
 * evidence. Dispatching a deliberately [ctx]-less canary and observing the
 * deny proves the gate fired, at the cost of zero dispatch tokens (the deny
 * happens before any worker spawns) — this is the check the PO runs by hand
 * right after `install.sh`, not a doctor check: doctor here stays limited to
 * what it can verify black-box over the CLI without spawning a real dispatch,
 * and adding a filesystem trip-wire for the gate would duplicate state the
 * gate's own contract (T-490, "no filesystem state") deliberately does not
 * carry.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const REPO_DISCIPLINE = path.join(CORE_ROOT, 'discipline')
const GOVERNOR = 'prdt-call-governor.sh'

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let claudeDir: string
let projectDir: string
let disciplineDir: string

function hooksDir(): string { return path.join(machineHome, 'hooks') }
function runDir(): string { return path.join(machineHome, 'run', 'call-governor') }

/** Populate the install mirror with hook files (content irrelevant — doctor reads names). */
function mirror(...basenames: string[]) {
  fs.mkdirSync(hooksDir(), { recursive: true })
  for (const b of basenames) fs.writeFileSync(path.join(hooksDir(), b), '#!/usr/bin/env bash\nexit 0\n')
}

/** Register hooks in the sandboxed settings.json: {event: [basename, …]}. */
function register(reg: Record<string, string[]>) {
  const hooks: any = {}
  for (const [event, basenames] of Object.entries(reg)) {
    hooks[event] = [{ hooks: basenames.map((b) => ({ type: 'command', command: `"${path.join(hooksDir(), b)}"` })) }]
  }
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks }, null, 2))
}

function fired(...events: string[]) {
  fs.mkdirSync(runDir(), { recursive: true })
  for (const e of events) fs.writeFileSync(path.join(runDir(), `.fired-${e}`), '')
}

/** Back-date a marker's mtime — the create-once marker never rewrites itself,
 *  so mtime is the only signal that distinguishes "fired once, long ago" from
 *  "fired recently" (T-491 R2-2). */
function ageMarker(event: string, daysAgo: number) {
  const p = path.join(runDir(), `.fired-${event}`)
  const t = Date.now() / 1000 - daysAgo * 86400
  fs.utimesSync(p, t, t)
}

function doctor(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir, CLAUDE_DIR: claudeDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  return out.split('\n').filter((l) => l.includes('hooks:'))
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-hooks-'))
  disciplineDir = path.join(sandbox, 'discipline')
  fs.cpSync(REPO_DISCIPLINE, disciplineDir, { recursive: true })
  machineHome = path.join(sandbox, 'prdt-home')
  claudeDir = path.join(sandbox, 'claude')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
})

afterEach(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3)('prdt doctor — hook roster', () => {
  test('a complete, fired install is silent', () => {
    mirror('prdt-session-start.sh', GOVERNOR)
    register({ SessionStart: ['prdt-session-start.sh'], PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
    expect(doctor()).toEqual([])
  })

  test('no install mirror on this machine → not doctor’s business', () => {
    expect(doctor()).toEqual([])
  })

  test('a mirrored hook registered nowhere is reported', () => {
    mirror('prdt-session-start.sh', 'prdt-auto-open.sh')
    register({ SessionStart: ['prdt-session-start.sh'] })
    const out = doctor().join('\n')
    expect(out).toContain('prdt-auto-open.sh')
    expect(out).toContain('install.sh')
  })

  test('a registered hook missing from the mirror is reported as stale', () => {
    mirror('prdt-session-start.sh')
    register({ SessionStart: ['prdt-session-start.sh'], PostToolUse: ['prdt-deleted-hook.sh'] })
    expect(doctor().join('\n')).toContain('prdt-deleted-hook.sh')
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — call governor fire evidence (the silent-typo class)', () => {
  test('registered but never fired → named, with the typo cause spelled out', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse')     // PostToolBatch registration is dead
    const out = doctor().join('\n')
    expect(out).toContain('PostToolBatch')
    expect(out).toContain('never fired')
    expect(out).not.toContain('.fired-PreToolUse')
  })

  test('half the pair registered → the enforcer would read a counter nothing increments', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR] })
    fired('PreToolUse')
    const out = doctor().join('\n')
    expect(out).toContain('PostToolBatch')
    expect(out).toMatch(/pair|counting/i)
  })

  test('governor absent from the mirror → no fire check at all (nothing to fire)', () => {
    mirror('prdt-session-start.sh')
    register({ SessionStart: ['prdt-session-start.sh'] })
    expect(doctor().join('\n')).not.toContain('governor')
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — call governor fire evidence goes STALE (T-491 R2-2)', () => {
  // The marker is create-once (the hook only ever `>`-truncates it), so once
  // it exists it exists forever — a harness upgrade that changes the payload
  // shape under this hook makes it fail open SILENTLY, and a marker stamped
  // once on day 1 would read as evergreen-green ever after. This is the exact
  // silent-death class T-445 already burned us on once (a typo'd event name
  // accepted with no warning at all).

  test('fired recently (inside the 7d window) is silent', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
    ageMarker('PreToolUse', 1)
    ageMarker('PostToolBatch', 1)
    expect(doctor()).toEqual([])
  })

  test('fired once, then silent for 8 days → flagged as stale, not as "never fired"', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
    ageMarker('PreToolUse', 1)
    ageMarker('PostToolBatch', 8) // past the 7d threshold
    const out = doctor().join('\n')
    expect(out).toContain('PostToolBatch')
    expect(out).not.toContain('never fired') // it DID fire — that message would be false
    // Actionable: says what to do, not just that something is wrong.
    expect(out.toLowerCase()).toMatch(/re-run|re-dispatch/i)
    expect(out).not.toContain('PreToolUse') // the fresh half stays silent
  })

  test('exactly at the threshold boundary is still fresh, one day past it is not', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
    ageMarker('PreToolUse', 7)
    ageMarker('PostToolBatch', 8)
    const out = doctor().join('\n')
    expect(out).not.toContain('PreToolUse')
    expect(out).toContain('PostToolBatch')
  })
})
