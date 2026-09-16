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

/** Write an arbitrary raw `statusLine` value — a bare string, `{}`, a
 *  `command` that isn't a string, etc. — the shapes D1 covers (key present,
 *  value malformed), which `writeStatusline` above can't produce since it
 *  always emits a well-formed `{type, command}` object. */
function writeRawStatusline(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  existing.statusLine = value
  fs.writeFileSync(file, JSON.stringify(existing, null, 2))
}

/** Write literally-invalid JSON to a settings file (D2: corrupt, not absent). */
function writeCorruptJson(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ this is not valid json,,, ')
}

function userSettingsPath(): string { return path.join(claudeDir, 'settings.json') }
function codeRoot(): string { return path.join(projectDir, 'code') }

function doctorStatuslineLines(cwd: string = projectDir, home: string = machineHome): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'], {
    cwd,
    env: { ...process.env, PRDT_HOME: home, PRDT_DISCIPLINE: disciplineDir, CLAUDE_DIR: claudeDir },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  return out.split('\n').filter((l) => l.includes('statusline:'))
}

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-statusline-')))
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
    // Take the command out of doctor's own printed text — not a hand-written
    // equivalent — so this proves the PRINTED repair converges, not merely
    // that install.sh --statusline happens to.
    const match = before[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    execFileSync('bash', ['-c', match![1]], {
      cwd: projectDir,
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

// D1 — a present-but-malformed `statusLine` key must still shadow (and warn
// about) a healthy lower-priority registration, never fall through silently.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: D1 malformed key presence', () => {
  test('a bare-string statusLine at the project level hides a healthy user-level one — reported, not silent', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy, would otherwise be silent
    writeRawStatusline(path.join(projectDir, '.claude', 'settings.json'), '/some/bare/string')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('statusLine')
    expect(lines[0]).toContain('malformed')
  })

  test('an object with no `command` key is malformed, same as a bare string', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    writeRawStatusline(path.join(projectDir, '.claude', 'settings.json'), {})
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('malformed')
  })

  test('a non-string `command` value is malformed', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    writeRawStatusline(path.join(projectDir, '.claude', 'settings.json'), { command: 12345 })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('malformed')
  })

  test('a malformed statusLine at the user level (nothing below it) is reported malformed, not absent', () => {
    writeRawStatusline(userSettingsPath(), '/bare/string')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(userSettingsPath())
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })
})

// D2 — corrupt (unparseable) settings JSON must be reported as its own
// state, with a repair that actually converges, not misdiagnosed as "absent".
describe.skipIf(!PYTHON3)('prdt doctor — statusline: D2 corrupt settings JSON', () => {
  test('invalid JSON at the user level is reported as corrupt, not "not registered anywhere"', () => {
    writeCorruptJson(userSettingsPath())
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('not valid JSON')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('the printed repair for corrupt user-level JSON actually converges to healthy', () => {
    writeCorruptJson(userSettingsPath())
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    // Take the composite (reset + register) command out of doctor's own
    // printed text and run exactly that — not a hand-written equivalent —
    // so this is the D2 acceptance: the machine reaches healthy by following
    // only what doctor prints. The OLD repair (`install.sh --statusline`
    // alone) dies on this exact fixture (jq can't parse it) and never
    // converges; this composite one must.
    const match = lines[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    execFileSync('bash', ['-c', match![1]], {
      cwd: projectDir,
      env: { ...process.env, HOME: sandbox, PRDT_HOME: machineHome, CLAUDE_DIR: claudeDir },
      stdio: 'ignore',
    })
    expect(doctorStatuslineLines()).toEqual([])
  })

  test('the OLD repair alone (install.sh --statusline against still-corrupt JSON) does not converge — proves D2 was real', () => {
    writeCorruptJson(userSettingsPath())
    expect(() => execFileSync('bash', [path.join(CORE_ROOT, 'scripts', 'install.sh'), '--statusline'], {
      env: { ...process.env, HOME: sandbox, PRDT_HOME: machineHome, CLAUDE_DIR: claudeDir },
      stdio: 'ignore',
    })).toThrow()
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1) // still broken, still reported
    // The name's claim is specifically that it is STILL classified corrupt,
    // not merely that some warning fired — a count-only assertion would stay
    // green even if the OLD repair's failed jq write left the file in a
    // state doctor misclassifies as "absent" instead.
    expect(lines[0]).toContain('not valid JSON')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('invalid JSON at the project level is reported as corrupt', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy — would be silent without this
    writeCorruptJson(path.join(projectDir, '.claude', 'settings.json'))
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('not valid JSON')
  })
})

// D3 — a PRDT_HOME containing a space must not make a correctly-registered
// machine judge itself not-prdt forever.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: D3 PRDT_HOME with a space', () => {
  test('a healthy registration under a PRDT_HOME containing a space is judged healthy, not not-prdt', () => {
    const spacedHome = path.join(sandbox, 'prdt home')
    fs.mkdirSync(path.join(spacedHome, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(spacedHome, 'hooks'), { recursive: true })
    const exe = path.join(spacedHome, 'bin', 'statusline-prdt.sh')
    fs.writeFileSync(exe, '#!/usr/bin/env bash\necho ok\n', { mode: 0o755 })
    fs.writeFileSync(path.join(spacedHome, 'prdt.env'), `PRDT_REPO=${CORE_ROOT}\n`)
    // install.sh's own quoting convention (module comment above
    // `_statusline_command_exe`): the executable wrapped in a literal pair of
    // escaped quotes baked into the JSON string.
    writeStatusline(userSettingsPath(), `"${exe}"`)
    expect(doctorStatuslineLines(projectDir, spacedHome)).toEqual([])
  })
})

// D4 — ~/... and $VAR/... registrations must be recognized as the prdt path,
// and a relative-path registration must be judged the same regardless of
// doctor's own invocation cwd.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: D4 var/user expansion + relative-path anchor', () => {
  test('a $PRDT_HOME/... registration is recognized as healthy', () => {
    writeStatusline(userSettingsPath(), '$PRDT_HOME/bin/statusline-prdt.sh')
    expect(doctorStatuslineLines(projectDir, machineHome)).toEqual([])
  })

  test('a ~/-rooted registration pointing at the real prdt path is recognized as healthy', () => {
    // The module-level `sandbox` sits under os.tmpdir(), which on macOS is
    // $TMPDIR — NOT under $HOME — so a `~/`-rooted path built from it never
    // actually exercises os.path.expanduser() here; the guard this replaced
    // silently returned before the assertion ever ran. Build a SEPARATE
    // machine mirror genuinely rooted under the real $HOME instead (no
    // installer involved — doctor only reads it) so `~/...` resolution is
    // for real exercised on every platform, this one included.
    const homeRootedHome = fs.mkdtempSync(path.join(os.homedir(), '.prdt-doctor-statusline-test-'))
    try {
      fs.mkdirSync(path.join(homeRootedHome, 'bin'), { recursive: true })
      fs.mkdirSync(path.join(homeRootedHome, 'hooks'), { recursive: true })
      const exe = path.join(homeRootedHome, 'bin', 'statusline-prdt.sh')
      fs.writeFileSync(exe, '#!/usr/bin/env bash\necho ok\n', { mode: 0o755 })
      fs.writeFileSync(path.join(homeRootedHome, 'prdt.env'), `PRDT_REPO=${CORE_ROOT}\n`)
      const rel = path.relative(os.homedir(), exe)
      // This must never be true by construction (homeRootedHome is a child
      // of os.homedir()) — assert it loudly rather than silently skipping,
      // so a future platform where mkdtemp itself resolves outside $HOME
      // fails the test instead of passing empty.
      expect(rel.startsWith('..')).toBe(false)
      writeStatusline(userSettingsPath(), `~/${rel}`)
      expect(doctorStatuslineLines(projectDir, homeRootedHome)).toEqual([])
    } finally {
      fs.rmSync(homeRootedHome, { recursive: true, force: true })
    }
  })

  test('a relative-path registration is judged the same from the project root and from a nested subdirectory', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy fallback for codeRoot, which has no override
    const rel = path.relative(projectDir, prdtStatuslinePath())
    writeStatusline(path.join(projectDir, '.claude', 'settings.json'), rel)
    const nested = path.join(projectDir, 'docs', 'wiki')
    fs.mkdirSync(nested, { recursive: true })
    expect(doctorStatuslineLines(projectDir)).toEqual([])
    expect(doctorStatuslineLines(nested)).toEqual([])
  })
})

// D5 — the "no install on this machine" silence gate needs its own
// assertions on both edges: silent when truly not installed, but never
// silent for a real absent-registration defect on a machine that IS
// installed.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: D5 install-gate coverage', () => {
  test('no $PRDT_HOME/hooks at all — silent even with an unhealthy statusLine registered', () => {
    fs.rmSync(path.join(machineHome, 'hooks'), { recursive: true, force: true })
    writeStatusline(userSettingsPath(), '/usr/bin/echo hi') // would otherwise be "not-prdt"
    expect(doctorStatuslineLines()).toEqual([])
  })

  test('an installed machine ($PRDT_HOME/hooks present) with no statusline registered still warns', () => {
    // seedMachine() in beforeEach already created hooks/ — this is the gate's
    // OTHER edge: presence of hooks/ must never itself suppress a real defect.
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('not registered anywhere')
  })
})

// N1 — a present-but-blank `statusLine.command` is a malformed value (the
// key IS there), not "absent". The old `isinstance(cmd, str)`-only check let
// "" / "   " through as a usable command, which tokenizes to nothing and gets
// misreported "no statusLine in {source}" — false, and at the project level
// the "absent" repair (install.sh --statusline) never touches project files
// by the code's own documented premise, so it can never converge from there.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: N1 blank command is malformed, not absent', () => {
  test('an empty-string command at the user level is reported malformed, not "not registered anywhere"', () => {
    writeRawStatusline(userSettingsPath(), { type: 'command', command: '' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(userSettingsPath())
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('a whitespace-only command at the user level is reported malformed, not "not registered anywhere"', () => {
    writeRawStatusline(userSettingsPath(), { type: 'command', command: '   ' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('a blank command at the project level still hides a healthy user-level one, reported not silent', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy, would otherwise be silent
    writeRawStatusline(path.join(projectDir, '.claude', 'settings.json'), { type: 'command', command: '' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('malformed')
  })

  test('the printed repair for a blank project-level command actually converges (jq del, not install.sh)', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy fallback once the override is gone
    const projectSettings = path.join(projectDir, '.claude', 'settings.json')
    writeRawStatusline(projectSettings, { type: 'command', command: '' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    const match = lines[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    execFileSync('bash', ['-c', match![1]], { cwd: projectDir, stdio: 'ignore' })
    expect(doctorStatuslineLines()).toEqual([])
  })
})

// N2 — when shlex cannot tokenize the raw command at all (unbalanced
// quoting), doctor must never guess a token out of the damaged string. The
// old fallback (`cmd_raw.strip().strip('"').split()`) could accidentally
// recover the real prdt path as its first token on natural damage shapes,
// making a broken registration read as silently healthy — the exact
// inversion this whole check exists to prevent.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: N2 unparseable command is never silently healthy', () => {
  test('a trailing unterminated quote after the real path is reported, not silently healthy', () => {
    const exe = prdtStatuslinePath()
    writeStatusline(userSettingsPath(), `${exe} "`) // unbalanced: real path + stray trailing quote
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not be parsed')
  })

  test('a leading quote with the closing one truncated is reported, not silently healthy', () => {
    const exe = prdtStatuslinePath()
    writeStatusline(userSettingsPath(), `"${exe}`) // unbalanced: opening quote never closed
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not be parsed')
  })

  test('an unparseable command at the project level is reported with the explicit jq repair, not install.sh', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy, would otherwise be silent
    const exe = prdtStatuslinePath()
    writeStatusline(path.join(projectDir, '.claude', 'settings.json'), `"${exe}`)
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('could not be parsed')
    expect(lines[0]).toContain('jq')
  })
})

// N3 — the D2 corrupt-JSON repair must not destroy a pre-existing backup: a
// plain `cp {source} {source}.bak` silently overwrites whatever was already
// at that name. The corrupt file itself survives either way; a prior backup
// must too.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: N3 corrupt-JSON repair must not clobber an existing backup', () => {
  test('a pre-existing .bak file survives the printed repair command untouched', () => {
    writeCorruptJson(userSettingsPath())
    const staleBackupPath = `${userSettingsPath()}.bak`
    const staleContent = '{"precious": "do-not-lose-me"}'
    fs.writeFileSync(staleBackupPath, staleContent)
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    const match = lines[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    execFileSync('bash', ['-c', match![1]], {
      cwd: projectDir,
      env: { ...process.env, HOME: sandbox, PRDT_HOME: machineHome, CLAUDE_DIR: claudeDir },
      stdio: 'ignore',
    })
    // The stale backup must be byte-for-byte untouched.
    expect(fs.readFileSync(staleBackupPath, 'utf8')).toBe(staleContent)
    // A second backup was made under a name that didn't collide.
    expect(fs.existsSync(`${userSettingsPath()}.bak.1`)).toBe(true)
    // The corrupt file itself was reset and re-registered — now healthy.
    expect(doctorStatuslineLines()).toEqual([])
  })
})

// B1 — the classification boundary itself: a present, non-blank `command`
// that still tokenizes (via shlex) to no real executable is a malformed
// VALUE, not an absent key. QA's surviving repro after N1/N2/D1 each closed
// one input shape: a bare quote pair, which passes the raw-string blank
// check (N1) and parses cleanly (no unbalanced quoting, so N2 doesn't fire)
// but tokenizes to a single empty-string token — the shape none of the
// earlier rounds blocked, because they each guarded one INPUT SHAPE instead
// of fixing the boundary that turns "no executable extracted" into "absent".
describe.skipIf(!PYTHON3)('prdt doctor — statusline: B1 a present value with no extractable executable is malformed, not absent', () => {
  test('a bare double-quote pair command at the user level is reported malformed, not "not registered anywhere"', () => {
    writeRawStatusline(userSettingsPath(), { type: 'command', command: '""' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(userSettingsPath())
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('a bare single-quote pair command at the user level is reported malformed, not "not registered anywhere"', () => {
    writeRawStatusline(userSettingsPath(), { type: 'command', command: "''" })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('a bare quote-pair command at the project level still hides a healthy user-level one, reported not silent, not absent', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy, would otherwise be silent
    writeRawStatusline(path.join(projectDir, '.claude', 'settings.json'), { type: 'command', command: '""' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain(path.join(projectDir, '.claude', 'settings.json'))
    expect(lines[0]).toContain('malformed')
    expect(lines[0]).not.toContain('not registered anywhere')
  })

  test('the printed repair for a quote-pair project-level command actually converges (jq del, not install.sh)', () => {
    writeStatusline(userSettingsPath(), prdtStatuslinePath()) // healthy fallback once the override is gone
    const projectSettings = path.join(projectDir, '.claude', 'settings.json')
    writeRawStatusline(projectSettings, { type: 'command', command: '""' })
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    const match = lines[0].match(/`([^`]+)`\s*$/)
    expect(match).not.toBeNull()
    execFileSync('bash', ['-c', match![1]], { cwd: projectDir, stdio: 'ignore' })
    expect(doctorStatuslineLines()).toEqual([])
  })
})

// B2 — `_statusline_install_cmd`'s PRDT_REPO-not-found fallback must never
// print something shaped like a runnable command that a real shell chokes
// on. This path is unreachable through `doctorStatuslineLines()` because
// `seedMachine()` always writes PRDT_REPO into prdt.env — exercise it
// directly by removing that line so PRDT_REPO genuinely cannot be found.
describe.skipIf(!PYTHON3)('prdt doctor — statusline: B2 repair line when PRDT_REPO cannot be determined', () => {
  function stripPrdtRepo() {
    fs.writeFileSync(path.join(machineHome, 'prdt.env'), '')
  }

  test('the "not registered anywhere" repair line states plainly it could not be determined, not a broken command', () => {
    stripPrdtRepo()
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not determine')
    // The OLD fallback baked "(PRDT_REPO not found ...)" INSIDE backticks
    // alongside the command name — a real shell raises a syntax error on
    // the literal `(` there. Assert no backtick-quoted span contains one.
    const backtickSpans = [...lines[0].matchAll(/`([^`]*)`/g)].map((m) => m[1])
    for (const span of backtickSpans) expect(span).not.toContain('PRDT_REPO not found')
  })

  test('the not-prdt repair line states plainly it could not be determined, not a broken command', () => {
    stripPrdtRepo()
    writeStatusline(userSettingsPath(), '/usr/bin/echo hi')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not determine')
    const backtickSpans = [...lines[0].matchAll(/`([^`]*)`/g)].map((m) => m[1])
    for (const span of backtickSpans) expect(span).not.toContain('PRDT_REPO not found')
  })

  test('the broken (missing statusline file) repair line states plainly it could not be determined, not a broken command', () => {
    stripPrdtRepo()
    writeStatusline(userSettingsPath(), prdtStatuslinePath())
    fs.rmSync(prdtStatuslinePath())
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not determine')
    const backtickSpans = [...lines[0].matchAll(/`([^`]*)`/g)].map((m) => m[1])
    for (const span of backtickSpans) expect(span).not.toContain('PRDT_REPO not found')
  })

  test('the corrupt-JSON repair line still hands over a runnable reset-and-backup command, and states plainly it could not determine the register step', () => {
    stripPrdtRepo()
    writeCorruptJson(userSettingsPath())
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not determine')
    const backtickSpans = [...lines[0].matchAll(/`([^`]*)`/g)].map((m) => m[1])
    expect(backtickSpans.length).toBeGreaterThan(0)
    // The old bug embedded the human-readable explanation itself inside a
    // backtick span (shaped like a command) — assert that text never lands
    // inside backticks, not that no backtick span contains any '(' at all
    // (the legit reset command below has a benign `$((n+1))`).
    for (const span of backtickSpans) expect(span).not.toContain('PRDT_REPO not found')
    // The runnable half (reset + backup) is still a real, executable command.
    execFileSync('bash', ['-c', backtickSpans[0]], { cwd: projectDir, stdio: 'ignore' })
  })

  test('the malformed-key repair line states plainly it could not be determined, not a broken command', () => {
    stripPrdtRepo()
    writeRawStatusline(userSettingsPath(), '/bare/string')
    const lines = doctorStatuslineLines()
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('could not determine')
    const backtickSpans = [...lines[0].matchAll(/`([^`]*)`/g)].map((m) => m[1])
    for (const span of backtickSpans) expect(span).not.toContain('PRDT_REPO not found')
  })
})
