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

/** Plant a FIFO at `p` (T-519 round 2 — a non-directory shape the hook's own
 *  `[ -e "$KEY" ] && [ ! -f "$KEY" ]` guard also denies on). */
function mkfifoAt(p: string) {
  execFileSync('python3', ['-c', 'import os,sys\nos.mkfifo(sys.argv[1])\n', p])
}

/** Plant a unix domain socket at `p`. AF_UNIX bind() is subject to the kernel's
 *  short sun_path limit (~104 bytes on macOS), which a tmpdir-nested sandbox
 *  path can easily exceed — so bind at a short path under /tmp and rename into
 *  place; rename has no such length limit. */
function mkSocketAt(p: string) {
  const script = [
    'import socket, tempfile, os, sys',
    'target = sys.argv[1]',
    'd = tempfile.mkdtemp(dir="/tmp")',
    'tmp_sock = os.path.join(d, "s")',
    's = socket.socket(socket.AF_UNIX)',
    's.bind(tmp_sock)',
    's.close()',
    'os.rename(tmp_sock, target)',
    'os.rmdir(d)',
  ].join('\n')
  execFileSync('python3', ['-c', script, p])
}

function doctor(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome, PRDT_DISCIPLINE: disciplineDir, CLAUDE_DIR: claudeDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  // Excludes `hooks: mirror …` lines (T-532's hook_mirror_drift_warnings):
  // this file's synthetic mirror content/roster never matches the REAL repo
  // checkout this in-place CLI resolves `_hooks_repo_path()` against, so
  // that check would otherwise fire spuriously here — it is not what this
  // file tests, and (T-532 QA G4) PRDT_DISCIPLINE no longer silences it the
  // way it silences the discipline-tree check this file also sets it for.
  return out.split('\n').filter((l) => l.includes('hooks:') && !l.includes('hooks: mirror '))
}

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-hooks-')))
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

describe.skipIf(!PYTHON3)('prdt doctor — a poisoned counter path is caught (T-519 vector 2)', () => {
  // `mkdir "$run/<sid>.<aid>"` pins a worker's turn count at 0 (append + read
  // both fail forever) while the .fired-* markers stay green, so the governor
  // LOOKS healthy but enforces nothing for that worker. doctor must surface it.
  const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const AID = 'a45b42f3cdda35348'

  /** Positive control: the check is proven to FIRE, not just be silently absent
   *  (a clean pass on its own proves nothing — machine-wiki fact--discipline-editing). */
  test('a directory planted at a counter path is reported as a poisoned counter', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch') // markers green — the silent-death shape
    fs.mkdirSync(path.join(runDir(), `${SID}.${AID}`), { recursive: true })
    const out = doctor().join('\n')
    expect(out).toMatch(/DIRECTORY|counter/i)
    expect(out).toContain(`${SID}.${AID}`)
  })

  test('a clean run dir (only fire markers + real counter files) stays silent', () => {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
    // a genuine counter file must NOT be mistaken for tamper
    fs.writeFileSync(path.join(runDir(), `${SID}.${AID}`), '....')
    fs.writeFileSync(path.join(runDir(), `${SID}.${AID}.w40`), '')
    expect(doctor()).toEqual([])
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — every shape the hook denies on is caught, not just directories (T-519 round 2)', () => {
  // The hook's tamper guard is `[ -e "$KEY" ] && [ ! -f "$KEY" ]` — it denies on
  // ANY non-regular-file shape at a counter path, not only directories. Round 1
  // of this check tested `entry.is_dir()`, which is narrower than the hook: a
  // FIFO, a unix socket, or a symlink to either made the hook DENY the worker
  // while doctor stayed silent and reported the governor healthy. Each shape
  // below gets its own positive control — a clean pass alone proves nothing
  // (machine-wiki fact--discipline-editing) — proving doctor now reports what
  // the hook enforces on, for every shape, not only the one the ticket named.
  const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const AID = 'a45b42f3cdda35348'

  function setUpHealthyGovernor() {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch') // markers green — the silent-death shape
  }

  test('a FIFO planted at a counter path is reported as a poisoned counter', () => {
    setUpHealthyGovernor()
    mkfifoAt(path.join(runDir(), `${SID}.${AID}`))
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/not a regular file|counter/i)
  })

  test('a unix domain socket planted at a counter path is reported as a poisoned counter', () => {
    setUpHealthyGovernor()
    mkSocketAt(path.join(runDir(), `${SID}.${AID}`))
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/not a regular file|counter/i)
  })

  test('a symlink to a non-regular file (/dev/null) is reported as a poisoned counter', () => {
    setUpHealthyGovernor()
    fs.symlinkSync('/dev/null', path.join(runDir(), `${SID}.${AID}`))
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/not a regular file|counter/i)
  })

  test('a symlink to a directory is reported as a poisoned counter', () => {
    setUpHealthyGovernor()
    const targetDir = path.join(runDir(), 'a-real-dir')
    fs.mkdirSync(targetDir)
    fs.symlinkSync(targetDir, path.join(runDir(), `${SID}.${AID}`))
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
  })

  // T-567 REVERSED this one. It used to assert that a DANGLING symlink is not
  // tamper, on the reasoning that `-e "$KEY"` is false on it so the hook treats
  // it as an absent counter. The reasoning was wrong about the filesystem:
  // `printf . >> <dangling link>` CREATES the file the link names (measured), so
  // a dangling link at a counter path is the arbitrary-file primitive in create
  // form, not unwritten space. The hook now denies on `-L` whatever the target
  // is, and doctor reports the same.
  test('a dangling symlink at a counter path IS reported — appending through it creates the target', () => {
    setUpHealthyGovernor()
    fs.symlinkSync(path.join(runDir(), 'nonexistent-target-xyz'), path.join(runDir(), `${SID}.${AID}`))
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/symlink/i)
  })

  test('genuine governor state (counter, .fired-*, .w* markers) stays unreported', () => {
    setUpHealthyGovernor()
    fs.writeFileSync(path.join(runDir(), `${SID}.${AID}`), '....')
    fs.writeFileSync(path.join(runDir(), `${SID}.${AID}.w40`), '')
    expect(doctor()).toEqual([])
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

// ── T-567: the four states, not one ──────────────────────────────────────────
//
// T-519's check asked `exists() and not is_file()`, which mirrored the hook's
// guard exactly — and the hook's guard was itself too narrow. Two of the three
// reproduced evasions (`rm -f`, `: > `) leave a state that predicate calls
// HEALTHY: nothing there, or a 0-byte regular file. The third (`ln -s` at a
// regular file) is is_file()==True through the link, so it was healthy too. A
// reporter can only be as wide as the question it asks, so the question changed
// in both places at once — witness comparison for the reset shapes, `-L`/
// is_symlink() for the aimed ones.
describe.skipIf(!PYTHON3)('prdt doctor — missing / truncated / symlinked counters (T-567)', () => {
  const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const AID = 'a45b42f3cdda35348'
  const key = () => path.join(runDir(), `${SID}.${AID}`)
  /** The hook's witness file: one byte per counted turn, `.hw-` + the key name. */
  const witness = (bytes: number) =>
    fs.writeFileSync(path.join(runDir(), `.hw-${SID}.${AID}`), '.'.repeat(bytes))

  function setUpHealthyGovernor() {
    mirror(GOVERNOR)
    register({ PreToolUse: [GOVERNOR], PostToolBatch: [GOVERNOR] })
    fired('PreToolUse', 'PostToolBatch')
  }

  test('a DELETED counter whose witness still stands is reported', () => {
    setUpHealthyGovernor()
    witness(60)
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/deleted|missing/i)
  })

  test('a TRUNCATED counter is reported, with both numbers', () => {
    setUpHealthyGovernor()
    witness(60)
    fs.writeFileSync(key(), '')
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/truncat|shorter/i)
    expect(out).toContain('60')
  })

  test('a counter symlinked at a REGULAR file — the append primitive — is reported', () => {
    setUpHealthyGovernor()
    const victim = path.join(sandbox, 'settings.json')
    fs.writeFileSync(victim, '{}\n')
    fs.symlinkSync(victim, key())
    const out = doctor().join('\n')
    expect(out).toContain(`${SID}.${AID}`)
    expect(out).toMatch(/symlink/i)
    // and it must name where the write would have landed
    expect(out).toContain(victim)
  })

  test('a symlinked .fired-* marker is reported too — that write is a TRUNCATE', () => {
    setUpHealthyGovernor()
    const victim = path.join(sandbox, 'prdt.env')
    fs.writeFileSync(victim, 'KEEP=1\n')
    fs.rmSync(path.join(runDir(), '.fired-PreToolUse'))
    fs.symlinkSync(victim, path.join(runDir(), '.fired-PreToolUse'))
    const out = doctor().join('\n')
    expect(out).toMatch(/symlink/i)
  })

  test('a counter that matches its witness stays unreported', () => {
    setUpHealthyGovernor()
    witness(41)
    fs.writeFileSync(key(), '.'.repeat(41))
    fs.writeFileSync(`${key()}.w40`, '')
    expect(doctor()).toEqual([])
  })

  test('a counter AHEAD of its witness is normal, not tamper — the witness lags by design', () => {
    // The hook appends the counter first and the witness second, so a crash
    // between the two leaves the counter one byte ahead. Reporting that would
    // page on an ordinary interrupted turn.
    setUpHealthyGovernor()
    witness(40)
    fs.writeFileSync(key(), '.'.repeat(41))
    expect(doctor()).toEqual([])
  })

  test('a witness-less counter (predating the check) stays unreported', () => {
    setUpHealthyGovernor()
    fs.writeFileSync(key(), '.'.repeat(12))
    expect(doctor()).toEqual([])
  })

  // Drift guard: doctor's witness prefix is a COPY of a name the hook owns, and
  // the whole T-445 class is "two files hold the same fact and one moves". A
  // rename in the hook with doctor left behind would make every reset silently
  // unreportable again — the exact defect T-567 is closing.
  test("doctor's witness prefix is the one the hook actually writes", () => {
    const hook = fs.readFileSync(path.join(CORE_ROOT, 'scripts', 'hooks', GOVERNOR), 'utf8')
    expect(hook).toContain('WIT="$RUN/.hw-$SID.$AID"')
    const cli = fs.readFileSync(PRDT_CLI, 'utf8')
    expect(cli).toContain('".hw-"')
  })
})

describe.skipIf(!PYTHON3)('prdt doctor — a hook registration pointing at a path that does not exist (T-640)', () => {
  /** The PO's incident shape: a scratch-home install registered the whole roster
   *  under /private/tmp/…, then the scratch dirs were deleted. Every such entry
   *  runs a file that is not there, once per event, forever — and the basename
   *  check above does not see it (the basename IS in the mirror). */
  function registerRaw(commands: Record<string, string[]>) {
    const hooks: any = {}
    for (const [event, cmds] of Object.entries(commands)) {
      hooks[event] = [{ hooks: cmds.map((c) => ({ type: 'command', command: c })) }]
    }
    fs.mkdirSync(claudeDir, { recursive: true })
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks }, null, 2))
  }

  test('a prdt hook registered from a deleted scratch home is reported by its full path, once per entry', () => {
    mirror('prdt-session-start.sh', GOVERNOR)
    fired('PreToolUse', 'PostToolBatch')
    const gone = path.join(sandbox, 'prdt-injPO', 'hooks', 'prdt-session-start.sh')
    registerRaw({
      SessionStart: [`"${path.join(hooksDir(), 'prdt-session-start.sh')}"`, `"${gone}"`],
      SubagentStart: [`"${gone}"`],
      PreToolUse: [`"${path.join(hooksDir(), GOVERNOR)}"`],
      PostToolBatch: [`"${path.join(hooksDir(), GOVERNOR)}"`],
    })
    const lines = doctor().filter((l) => l.includes(gone))
    expect(lines.length).toBe(2)
    expect(lines.join('\n')).toContain('SessionStart')
    expect(lines.join('\n')).toContain('SubagentStart')
    // report only — settings.json is not edited
    const after = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
    expect(after.hooks.SessionStart[0].hooks.length).toBe(2)
  })

  test('a non-prdt hook whose absolute path is missing is reported too — the harness runs it just the same', () => {
    mirror('prdt-session-start.sh')
    registerRaw({ SessionStart: [`"${path.join(hooksDir(), 'prdt-session-start.sh')}"`, '/opt/gone/some-other-tool-hook.sh --flag'] })
    expect(doctor().join('\n')).toContain('/opt/gone/some-other-tool-hook.sh')
  })

  test('a command that is not an absolute path (a PATH lookup, an inline shell) is not judged', () => {
    mirror('prdt-session-start.sh')
    registerRaw({ SessionStart: [`"${path.join(hooksDir(), 'prdt-session-start.sh')}"`, 'jq -n 1', 'echo hi && true'] })
    expect(doctor().filter((l) => l.includes('does not exist') || l.includes('not exist'))).toEqual([])
  })
})
