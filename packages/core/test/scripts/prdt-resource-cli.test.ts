/**
 * `prdt resource up|down|ls|register-stop` (T-591/T-680) — the CLI the
 * stop-what-you-started rule names (qa/habit.md §Working rules, po/habit.md
 * §Returns). Markers live under `~/.prdt/run/resources/<name>/<dispatch>.json`.
 *
 * T-680: the stop command is a machine fact the TOOL holds, not shared
 * discipline text. `register-stop` writes it into a machine-scope registry
 * (`~/.prdt/resource-stop.json` — config, beside `~/.prdt/register`, never
 * under `run/`); `down` never touches another dispatch's marker, but when
 * removing ITS OWN marker brings the held count to zero, it resolves the
 * stop command from the LIVE registry at that moment (never a marker's own
 * content — QA grill S5) under a per-resource lock (S1) and reports the
 * result; a failed stop stays visible for retry until it succeeds (S4).
 * Tests here use a scratch `PRDT_HOME` and fake stop commands only
 * (`touch`/`exit N`) — never a real machine resource.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawn } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let projectDir: string

function run(args: string[], env: Record<string, string> = {}): { out: string; code: number } {
  try {
    const out = execFileSync(PYTHON3 as string, [PRDT_CLI, ...args], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, ...env },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
    })
    return { out, code: 0 }
  } catch (e: any) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status ?? 1 }
  }
}

function markerPath(name: string, dispatch: string): string {
  return path.join(machineHome, 'run', 'resources', name, `${dispatch}.json`)
}

function runAsync(args: string[], env: Record<string, string> = {}): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON3 as string, [PRDT_CLI, ...args], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('close', (code) => resolve({ out, code: code ?? 1 }))
  })
}

function _resourceHasAnyMarker(): boolean {
  const base = path.join(machineHome, 'run', 'resources')
  if (!fs.existsSync(base)) return false
  return fs.readdirSync(base).some((name) => {
    const dir = path.join(base, name)
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0
  })
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-resource-cli-'))
  machineHome = path.join(sandbox, 'home')
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync(PYTHON3 as string, [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

function registerStop(name: string, cmd: string) {
  return run(['resource', 'register-stop', name, cmd])
}

describe.skipIf(!PYTHON3)('prdt resource up|down|ls|register-stop (T-591/T-680)', () => {
  test('the CLI section never hardcodes a kill/shutdown verb or removes anything but its own marker file: the one subprocess call in it runs the resolved `cmd` variable, never a literal string', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    const start = src.indexOf('# ── resource ownership markers (T-591/T-680)')
    const end = src.indexOf('# ── resident machine resources')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = src.slice(start, end)
    expect(section).not.toMatch(/\bos\.kill\b/)
    expect(section).not.toMatch(/shutil\.rmtree|\bshutdown\b|\bquit\b/i)
    // The only filesystem removal in this section is `p.unlink()` — a marker
    // file, never a directory tree, never anything resembling a resource.
    const rmCalls = [...section.matchAll(/\.unlink\(/g)]
    expect(rmCalls.length).toBeGreaterThan(0)
    // The only subprocess call runs the variable holding the REGISTERED
    // command, never a hardcoded verb baked into this shared script.
    const subprocessCalls = [...section.matchAll(/subprocess\.(run|call|Popen|check_call|check_output)\(([^)]*)/g)]
    expect(subprocessCalls.length).toBe(1)
    expect(subprocessCalls[0][2]).toMatch(/^cmd,/)
  })

  test('up writes a marker with resource · dispatch · project · since, and reports the held count', () => {
    const { out, code } = run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    expect(code).toBe(0)
    expect(out).toContain('cua')
    expect(out).toContain('marker=d1')
    expect(out).toContain('project=proj')
    expect(out).toContain('held=1')
    const p = markerPath('cua', 'd1')
    expect(fs.existsSync(p)).toBe(true)
    const marker = JSON.parse(fs.readFileSync(p, 'utf-8'))
    expect(marker).toMatchObject({ resource: 'cua', dispatch: 'd1', project: 'proj' })
    expect(typeof marker.since).toBe('string')
  })

  test('up is idempotent for the same dispatch: re-running never doubles the held count', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    const { out } = run(['resource', 'up', 'cua', '--dispatch', 'd1'])
    expect(out).toContain('held=1')
  })

  test('two dispatches marking the same resource both count, and neither down orphans the other (A boots, B joins, A leaves first — B stays marked, resource stays up per the count)', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    run(['resource', 'up', 'cua', '--dispatch', 'B'])
    const downA = run(['resource', 'down', 'cua', '--dispatch', 'A'])
    expect(downA.out).toContain('left: 1')
    expect(fs.existsSync(markerPath('cua', 'B'))).toBe(true)
    const downB = run(['resource', 'down', 'cua', '--dispatch', 'B'])
    expect(downB.out).toContain('left: 0')
  })

  test('register-stop writes the command into the machine-scope registry, keyed by resource name — beside ~/.prdt/register, never under run/ (T-680 S3: config, not runtime state)', () => {
    const { out, code } = registerStop('fake-vm', 'true')
    expect(code).toBe(0)
    expect(out).toContain('fake-vm')
    const regPath = path.join(machineHome, 'resource-stop.json')
    expect(fs.existsSync(regPath)).toBe(true)
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8'))
    expect(reg).toMatchObject({ 'fake-vm': 'true' })
    // never lands under the tooling-owned run/ carve-out — that's runtime
    // state (turn counters, latches, ownership markers), this is a fact a
    // person put there on purpose.
    expect(fs.existsSync(path.join(machineHome, 'run', 'resource-stop.json'))).toBe(false)
  })

  test('up reports whether a stop command is registered but never writes it onto its own marker — a marker is bookkeeping only, never an executable source (T-680 S5)', () => {
    registerStop('fake-vm', 'true')
    const { out } = run(['resource', 'up', 'fake-vm', '--dispatch', 'd1'])
    expect(out).toContain('stop=registered')
    const marker = JSON.parse(fs.readFileSync(markerPath('fake-vm', 'd1'), 'utf-8'))
    expect(marker.stop_cmd).toBeUndefined()
  })

  test('down resolves the stop command from the LIVE registry at down time, never a value cached at up time — registering AFTER up still runs (T-680 S5)', () => {
    const marker = path.join(sandbox, 'late-register.marker')
    run(['resource', 'up', 'late-reg', '--dispatch', 'A']) // nothing registered yet
    registerStop('late-reg', `touch ${marker}`) // registered AFTER up
    const { out, code } = run(['resource', 'down', 'late-reg', '--dispatch', 'A'])
    expect(code).toBe(0)
    expect(out).toContain('stop=ok')
    expect(fs.existsSync(marker)).toBe(true)
  })

  test("a marker's own stop_cmd field is never the executed source: hand-planting one does nothing, only the live registry's command runs (T-680 S5)", () => {
    const planted = path.join(sandbox, 'planted.marker')
    const real = path.join(sandbox, 'real.marker')
    registerStop('tamper', `touch ${real}`)
    run(['resource', 'up', 'tamper', '--dispatch', 'A'])
    const p = markerPath('tamper', 'A')
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    data.stop_cmd = `touch ${planted}`
    fs.writeFileSync(p, JSON.stringify(data))
    const { out, code } = run(['resource', 'down', 'tamper', '--dispatch', 'A'])
    expect(code).toBe(0)
    expect(out).toContain('stop=ok')
    expect(fs.existsSync(planted)).toBe(false)
    expect(fs.existsSync(real)).toBe(true)
  })

  test('down does not run the stop command while another marker still holds the resource', () => {
    const marker = path.join(sandbox, 'stop-ran.marker')
    registerStop('fake-vm', `touch ${marker}`)
    run(['resource', 'up', 'fake-vm', '--dispatch', 'A'])
    run(['resource', 'up', 'fake-vm', '--dispatch', 'B'])
    const { out } = run(['resource', 'down', 'fake-vm', '--dispatch', 'A'])
    expect(out).toContain('left: 1')
    expect(out).not.toMatch(/\bstop=/)
    expect(fs.existsSync(marker)).toBe(false)
  })

  test('down runs the registered stop command when its own removal brings the held count to zero, and reports success', () => {
    const marker = path.join(sandbox, 'stop-ran.marker')
    registerStop('fake-vm', `touch ${marker}`)
    run(['resource', 'up', 'fake-vm', '--dispatch', 'A'])
    const { out, code } = run(['resource', 'down', 'fake-vm', '--dispatch', 'A'])
    expect(code).toBe(0)
    expect(out).toContain('left: 0')
    expect(out).toContain('stop=ok')
    expect(fs.existsSync(marker)).toBe(true)
  })

  test('down at zero with no registered stop command says so and names where to register one — it never guesses', () => {
    run(['resource', 'up', 'no-command-registered', '--dispatch', 'A'])
    const { out, code } = run(['resource', 'down', 'no-command-registered', '--dispatch', 'A'])
    expect(code).toBe(0)
    expect(out).toContain('left: 0')
    expect(out).toContain('stop=none-registered')
    expect(out).toMatch(/register-stop no-command-registered/)
  })

  test('a failed stop command is reported, never swallowed: down exits non-zero and the output names the failure', () => {
    registerStop('fake-vm', 'sh -c "exit 7"')
    run(['resource', 'up', 'fake-vm', '--dispatch', 'A'])
    const { out, code } = run(['resource', 'down', 'fake-vm', '--dispatch', 'A'])
    expect(code).not.toBe(0)
    expect(out).toContain('left: 0')
    expect(out).toMatch(/stop=FAILED/)
  })

  test('down on a marker that is not there reports removed=false and never throws', () => {
    const { out, code } = run(['resource', 'down', 'cua', '--dispatch', 'ghost'])
    expect(code).toBe(0)
    expect(out).toContain('removed=false')
    expect(out).toContain('left: 0')
  })

  test('up with no --dispatch is refused, not defaulted to session identity (T-644): no marker is written, exit is non-zero, and the message names [ctx].dispatch_id', () => {
    const { out, code } = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'abc12345' })
    expect(code).not.toBe(0)
    expect(out).toMatch(/--dispatch/)
    expect(out).toMatch(/\[ctx\]\.dispatch_id/)
    expect(fs.existsSync(markerPath('cua', 'abc12345'))).toBe(false)
    expect(fs.existsSync(path.join(machineHome, 'run', 'resources', 'cua'))).toBe(false)
  })

  test('down with no --dispatch is refused, not defaulted to a "local" fallback (T-644): no session env, still a hard failure', () => {
    const cleanEnv: Record<string, string> = { CLAUDE_CODE_SESSION_ID: '' }
    const { out, code } = run(['resource', 'down', 'daum-mini-games'], cleanEnv)
    expect(code).not.toBe(0)
    expect(out).toMatch(/--dispatch/)
    expect(out).toMatch(/\[ctx\]\.dispatch_id/)
  })

  test('two parallel dispatches in one session no longer collide on a shared "local"/session marker: each must carry its own --dispatch', () => {
    // Before T-644 both of these bare calls resolved to the SAME marker file
    // (session id, or "local" with no session env) — the first `down` would
    // have stopped a resource the second dispatch still held. Now both are
    // refused outright: there is no shared default left to collide on.
    const a = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'shared-session' })
    const b = run(['resource', 'up', 'cua'], { CLAUDE_CODE_SESSION_ID: 'shared-session' })
    expect(a.code).not.toBe(0)
    expect(b.code).not.toBe(0)
    expect(_resourceHasAnyMarker()).toBe(false)
  })

  test('ls reports nothing when no markers exist, and groups multiple dispatches under one resource once they do', () => {
    const empty = run(['resource', 'ls'])
    expect(empty.out.trim()).toBe('no resource markers')
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    run(['resource', 'up', 'cua', '--dispatch', 'B'])
    const { out } = run(['resource', 'ls'])
    expect(out).toContain('cua: 2 held')
    expect(out).toContain('dispatch=A')
    expect(out).toContain('dispatch=B')
  })

  test('ls --json emits machine-readable records', () => {
    run(['resource', 'up', 'cua', '--dispatch', 'A'])
    const { out } = run(['resource', 'ls', '--json'])
    const rows = JSON.parse(out)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0]).toMatchObject({ resource: 'cua', dispatch: 'A', project: 'proj' })
  })

  test('a resource name outside the machine-hostname-safe charset is refused, never written as a path', () => {
    const { out, code } = run(['resource', 'up', '../escape'])
    expect(code).not.toBe(0)
    expect(out).toMatch(/must match/)
    expect(fs.existsSync(path.join(machineHome, 'run', 'resources', '..'))).toBe(false)
  })

  test('the source carries no session-keyed or "local" default, and no comment claiming qa/habit.md skips --dispatch (T-644)', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    expect(src).not.toMatch(/_resource_default_dispatch_id/)
    expect(src).not.toMatch(/qa\/habit\.md never passes/)
    expect(src).not.toMatch(/default is this session/)
  })

  test('top-level --help states --dispatch is required for up/down, not optional, and per-flag help matches contracts §Dispatch language', () => {
    const top = run(['--help']).out
    expect(top).toMatch(/up <name> --dispatch <id>/)
    expect(top).toMatch(/down <name>\s+--dispatch <id>/)
    expect(top).not.toMatch(/\[--dispatch <id>\]/)
    const flag = run(['resource', '--help']).out
    expect(flag).toMatch(/required, the PO's/)
    expect(flag).not.toMatch(/default is this session/)
  })

  test('two concurrent downs that together reach 0 run the stop command exactly once — proven over repeated trials, not one run (T-680 S1)', async () => {
    const TRIALS = 20
    for (let i = 0; i < TRIALS; i++) {
      const name = `race-${i}`
      const counter = path.join(sandbox, `counter-${i}`)
      registerStop(name, `sh -c "printf x >> ${counter}"`)
      run(['resource', 'up', name, '--dispatch', 'A'])
      run(['resource', 'up', name, '--dispatch', 'B'])
      const [a, b] = await Promise.all([
        runAsync(['resource', 'down', name, '--dispatch', 'A']),
        runAsync(['resource', 'down', name, '--dispatch', 'B']),
      ])
      const okCount = [a.out, b.out].filter((o) => /\bstop=ok\b/.test(o)).length
      expect(okCount).toBe(1)
      const bytes = fs.existsSync(counter) ? fs.readFileSync(counter, 'utf-8').length : 0
      expect(bytes).toBe(1)
    }
  }, 60000)

  test('a failed stop leaves the resource visible as prdt-owned in ls with the failure surfaced, and doctor reports it too (T-680 S4)', () => {
    registerStop('flaky', 'sh -c "exit 3"')
    run(['resource', 'up', 'flaky', '--dispatch', 'A'])
    const down1 = run(['resource', 'down', 'flaky', '--dispatch', 'A'])
    expect(down1.code).not.toBe(0)
    expect(down1.out).toMatch(/stop=FAILED/)
    // the marker itself is gone — down still only ever unlinks its own marker
    expect(fs.existsSync(markerPath('flaky', 'A'))).toBe(false)
    // … but ls still shows the resource, not silently forgotten
    const ls = run(['resource', 'ls'])
    expect(ls.out).toContain('flaky')
    expect(ls.out).toMatch(/FAILED/)
    // … and `prdt doctor` names it too, not only `ls`
    const doctor = run(['doctor'])
    expect(doctor.out).toContain('flaky')
    expect(doctor.out).toMatch(/FAILED to stop/)
  })

  test('retrying after a failed stop clears the failure once a later down succeeds (T-680 S4)', () => {
    registerStop('flaky2', 'sh -c "exit 3"')
    run(['resource', 'up', 'flaky2', '--dispatch', 'A'])
    run(['resource', 'down', 'flaky2', '--dispatch', 'A']) // fails, stays visible
    registerStop('flaky2', 'true') // operator fixes the registration
    const retry = run(['resource', 'down', 'flaky2', '--dispatch', 'retry-1'])
    expect(retry.code).toBe(0)
    expect(retry.out).toMatch(/stop=ok/)
    const ls = run(['resource', 'ls'])
    expect(ls.out.trim()).toBe('no resource markers')
  })

  test('ls shows the stop command down would run, with a long command ending in an ellipsis (T-680 S6/S7)', () => {
    const longCmd = `sh -c "echo ${'x'.repeat(200)}"`
    registerStop('long-cmd', longCmd)
    run(['resource', 'up', 'long-cmd', '--dispatch', 'A'])
    const { out } = run(['resource', 'ls'])
    expect(out).toContain('long-cmd')
    expect(out).toMatch(/stop: sh -c/)
    expect(out).toMatch(/…/)
    expect(out).not.toContain(longCmd) // the full, untruncated string never appears
  })

  test('ls names none-registered for a resource with no stop command (T-680 S7)', () => {
    run(['resource', 'up', 'unregistered-vm', '--dispatch', 'A'])
    const { out } = run(['resource', 'ls'])
    expect(out).toMatch(/stop: none-registered/)
    expect(out).toMatch(/register-stop unregistered-vm/)
  })

  test('a corrupt marker file on disk is skipped by ls, never crashes the read', () => {
    const dir = path.join(machineHome, 'run', 'resources', 'cua')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json')
    const { out, code } = run(['resource', 'ls'])
    expect(code).toBe(0)
    expect(out.trim()).toBe('no resource markers')
  })
})
