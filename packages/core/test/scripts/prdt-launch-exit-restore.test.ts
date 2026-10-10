/**
 * prdt-launch-exit-restore.test.ts — T-957.
 *
 * As-is (user screenshot 2026-10-06): after `/exit` or ctrl+c of a
 * prdt-launched Claude Code, the shell prompt fills with `^[[<35;4;4M`
 * (SGR any-motion mouse), `^[[O^[[I` (focus) and `^[[99;5u` (kitty keyboard
 * ctrl+c). Claude Code turns those modes on for its UI and, on these exits,
 * leaves some on; `prdt` used to `execvp` it, so nothing of ours ran after.
 *
 * To-be: `prdt` runs Claude Code as a child and, once it ends, disables the
 * modes, pops the kitty keyboard stack and flushes queued input — while exit
 * status, signals and the tty handoff behave as under exec.
 *
 * The stub `claude` plays Claude Code: enables 1003/1006/1004 + kitty
 * keyboard (`CSI > 1 u`) + bracketed paste, then ends per STUB_MODE. A pty
 * harness (the terminal) records everything prdt/stub write and the final
 * wait status. A tiny mode tracker replays the bytes to get the end state.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const ESC = '\x1B'

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string
let fakeHome: string
let shimDir: string

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t957-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t957-home-'))
  shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t957-shim-'))
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj'], {
    cwd: projectDir, stdio: 'ignore', timeout: subprocessTimeout('cli'),
    env: { ...process.env, HOME: fakeHome },
  })
  writeStub()
})

afterEach(() => {
  for (const d of [projectDir, fakeHome, shimDir]) fs.rmSync(d, { recursive: true, force: true })
})

/** Stub Claude Code. Modes: exit (rc STUB_RC) · sigint (ctrl+c handled, rc 130) ·
 *  sigterm (SIGTERM handled, marker, rc 3) · die (kills itself with SIGUSR1). */
function writeStub(): void {
  fs.writeFileSync(path.join(shimDir, 'claude'), [
    `#!${PYTHON3}`,
    'import os, sys, signal, time',
    'mode = os.environ.get("STUB_MODE", "exit")',
    'marker = os.environ["STUB_MARKER"]',
    'fg = os.isatty(0) and os.tcgetpgrp(0) == os.getpgrp()',
    'open(marker + ".handoff", "w").write("fg" if fg else "notfg")',
    'open(marker + ".argv", "w").write(" ".join(sys.argv[1:]))',
    'try:',
    '    os.fstat(3); open(marker + ".fd3", "w").write("open")',
    'except OSError:',
    '    open(marker + ".fd3", "w").write("closed")',
    'os.write(1, b"\\x1b[?1003h\\x1b[?1006h\\x1b[?1004h\\x1b[?2004h\\x1b[>1u")',
    'def done(tag, rc):',
    '    def h(*_):',
    '        open(marker + ".sig", "w").write(tag)',
    '        os._exit(rc)',
    '    return h',
    'signal.signal(signal.SIGINT, done("INT", 130))',
    'signal.signal(signal.SIGTERM, done("TERM", 3))',
    'os.write(1, b"READY")',
    'if mode == "exit": os._exit(int(os.environ.get("STUB_RC", "0")))',
    'if mode == "tstp":',
    '    for _ in range(int(os.environ.get("STUB_STOPS", "1"))):',
    '        os.kill(os.getpid(), signal.SIGTSTP)',
    '    open(marker + ".resumed", "w").write("yes"); os._exit(0)',
    'if mode == "die9":',
    '    os.kill(os.getpid(), signal.SIGKILL)',
    'if mode == "die":',
    '    signal.signal(signal.SIGUSR1, signal.SIG_DFL); os.kill(os.getpid(), signal.SIGUSR1)',
    'time.sleep(10)',
  ].join('\n'), { mode: 0o755 })
}

interface Run { hung: boolean; status: number; sig: number; out: string; marker: string }

/** Run `prdt` under a pty. `act`: how the harness-as-terminal reacts after READY.
 *  `tstp` / `ctrl-z` run prdt as a foreground JOB of a mini shell (a real
 *  job-control layout: an orphaned process group would silently ignore
 *  SIGTSTP). The shell reports STOPPED when prdt is stopped, then SIGCONTs it. */
function runPrdt(mode: string, act: 'none' | 'ctrl-c' | 'term' | 'tstp' | 'ctrl-z', env: Record<string, string> = {}, stops = 1): Run {
  const marker = path.join(shimDir, 'm')
  const job = act === 'tstp' || act === 'ctrl-z'
  const exec = `os.execvp(sys.executable, [sys.executable, ${JSON.stringify(PRDT_CLI)}])`
  const harness = [
    'import os, pty, sys, select, time, json, signal',
    'pid, m = pty.fork()',
    'if pid == 0:',
    ...(job ? [
      '    signal.signal(signal.SIGTTOU, signal.SIG_IGN)',
      '    g = os.fork()',
      '    if g == 0:',
      '        os.setpgid(0, 0)',
      `        ${exec}`,
      '    os.setpgid(g, g); os.tcsetpgrp(0, g)',
      '    end = time.time() + 20',
      '    while True:',
      '        _, st = os.waitpid(g, os.WUNTRACED)',
      '        if os.WIFSTOPPED(st):',
      '            os.write(1, b"STOPPED"); time.sleep(0.3); os.killpg(g, signal.SIGCONT); continue',
      '        os._exit(os.WEXITSTATUS(st) if os.WIFEXITED(st) else 99)',
    ] : [`    ${exec}`]),
    'buf = b""; acted = False; handled = 0; end = time.time() + 15',
    'while time.time() < end:',
    '    r, _, _ = select.select([m], [], [], 0.05)',
    '    if r:',
    '        try: d = os.read(m, 65536)',
    '        except OSError: break',
    '        if not d: break',
    '        buf += d',
    `    a = ${JSON.stringify(act)}`,
    '    if not acted and b"READY" in buf and a != "none":',
    '        acted = True; t_act = time.time(); time.sleep(0.3)',
    '        if a in ("ctrl-c",): os.write(m, b"\\x03")',
    '        elif a == "term": os.kill(pid, signal.SIGTERM)',
    '        elif a == "ctrl-z": os.write(m, b"\\x1a")',
    '        end = min(end, time.time() + 10)',
    '    if a == "ctrl-z" and buf.count(b"STOPPED") > handled:',
    '        handled += 1; time.sleep(0.6)',
    `        os.write(m, b"\\x1a" if handled < ${stops} else b"\\x03")`,
    `hung = a in ("tstp", "ctrl-z") and buf.count(b"STOPPED") != ${stops}`,
    'os.close(m)',
    '_, st = os.waitpid(pid, 0)',
    'print(json.dumps({"hung": hung, "status": os.WEXITSTATUS(st) if os.WIFEXITED(st) else -1,',
    '                  "sig": os.WTERMSIG(st) if os.WIFSIGNALED(st) else 0,',
    '                  "out": buf.decode("latin1")}))',
  ].join('\n')
  const raw = execFileSync('python3', ['-c', harness], {
    cwd: projectDir, encoding: 'utf-8', timeout: subprocessTimeout('cli'),
    env: {
      ...process.env, HOME: fakeHome, PATH: `${shimDir}:${process.env.PATH ?? ''}`,
      STUB_MODE: mode, STUB_MARKER: marker, ...env,
    },
  })
  return { ...JSON.parse(raw), marker }
}

/** Replay CSI private-mode / keyboard-protocol bytes → end state. */
function endState(out: string): { modes: Set<number>; kitty: number } {
  const modes = new Set<number>()
  let kitty = 0
  const re = /\x1b\[(\?(\d+)([hl])|>(\d+)u|<(\d+)u)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(out))) {
    if (m[2]) { m[3] === 'h' ? modes.add(+m[2]) : modes.delete(+m[2]) }
    else if (m[4]) kitty += 1
    else if (m[5]) kitty = Math.max(0, kitty - +m[5])
  }
  return { modes, kitty }
}

describe.skipIf(!PYTHON3)('prdt launch — terminal restored after Claude Code exits (T-957)', () => {
  test('sanity: the stub really leaves every mode on (what the user saw)', () => {
    const stubOnly = `${ESC}[?1003h${ESC}[?1006h${ESC}[?1004h${ESC}[?2004h${ESC}[>1u`
    const s = endState(stubOnly)
    expect([...s.modes].sort()).toEqual([1003, 1004, 1006, 2004])
    expect(s.kitty).toBe(1)
  })

  test('/exit: modes + kitty keyboard + paste off at the end, rc 0, handoff intact', () => {
    const r = runPrdt('exit', 'none')
    expect(r.status).toBe(0)
    const s = endState(r.out)
    expect([...s.modes]).toEqual([])
    expect(s.kitty).toBe(0)
    expect(fs.readFileSync(`${r.marker}.handoff`, 'utf8')).toBe('fg')
    expect(fs.readFileSync(`${r.marker}.argv`, 'utf8')).toBe('--agent prdt-po')
    // reset comes AFTER the session's own enable bytes
    expect(r.out.lastIndexOf(`${ESC}[<99u`)).toBeGreaterThan(r.out.lastIndexOf(`${ESC}[>1u`))
  }, 20000)

  test('child exit code propagates', () => {
    const r = runPrdt('exit', 'none', { STUB_RC: '7' })
    expect(r.status).toBe(7)
    expect([...endState(r.out).modes]).toEqual([])
  }, 20000)

  test('ctrl+c: child alone ends, prdt survives to restore, rc 130', () => {
    const r = runPrdt('sigint', 'ctrl-c')
    expect(fs.readFileSync(`${r.marker}.sig`, 'utf8')).toBe('INT')
    expect(r.sig).toBe(0)
    expect(r.status).toBe(130)
    const s = endState(r.out)
    expect([...s.modes]).toEqual([])
    expect(s.kitty).toBe(0)
  }, 20000)

  test('SIGTERM to prdt alone is forwarded to the child', () => {
    const r = runPrdt('sigterm', 'term')
    expect(fs.readFileSync(`${r.marker}.sig`, 'utf8')).toBe('TERM')
    expect(r.status).toBe(3)
    expect([...endState(r.out).modes]).toEqual([])
  }, 20000)

  test('child killed by a signal: terminal restored, prdt dies by the same signal', () => {
    const r = runPrdt('die', 'none')
    expect(r.sig).toBe(os.constants.signals.SIGUSR1)
    expect([...endState(r.out).modes]).toEqual([])
  }, 20000)

  test('kill -9 of claude: prdt dies by SIGKILL, no traceback, terminal restored', () => {
    const r = runPrdt('die9', 'none')
    expect(r.out).not.toContain('Traceback')
    expect(r.sig).toBe(9)
    expect([...endState(r.out).modes]).toEqual([])
  }, 20000)

  test('fd 3 inherited by claude as under exec', () => {
    const marker = path.join(shimDir, 'm')
    execFileSync('python3', ['-c', [
      'import os, subprocess, sys',
      `f = open(${JSON.stringify(path.join(shimDir, 'fd3.txt'))}, "w")`,
      'os.dup2(f.fileno(), 3); os.set_inheritable(3, True)',
      `subprocess.run([sys.executable, ${JSON.stringify(PRDT_CLI)}], stdout=subprocess.DEVNULL, close_fds=False)`,
    ].join('\n')], {
      cwd: projectDir, timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: fakeHome, PATH: `${shimDir}:${process.env.PATH ?? ''}`,
             STUB_MODE: 'exit', STUB_MARKER: marker },
    })
    expect(fs.readFileSync(`${marker}.fd3`, 'utf8')).toBe('open')
  }, 20000)

  test('child suspends only itself (SIGTSTP): prdt stops too, resumes the child', () => {
    const r = runPrdt('tstp', 'tstp')
    expect(r.hung).toBe(false)
    expect(r.status).toBe(0)
    expect(fs.readFileSync(`${r.marker}.resumed`, 'utf8')).toBe('yes')
  }, 30000)

  test.each([2, 3])('child self-suspends %i times in a row: each stop returns the prompt, each resume continues', (n) => {
    const r = runPrdt('tstp', 'tstp', { STUB_STOPS: String(n) }, n)
    expect(r.hung).toBe(false)
    expect(r.status).toBe(0)
    expect(fs.readFileSync(`${r.marker}.resumed`, 'utf8')).toBe('yes')
  }, 40000)

  test('group ctrl+z twice, then ctrl+c ends rc 130', () => {
    const r = runPrdt('sigint', 'ctrl-z', {}, 2)
    expect(r.hung).toBe(false)
    expect(r.status).toBe(130)
  }, 40000)

  test('ctrl+z on the whole group: no double stop, resumes, ctrl+c then ends', () => {
    const r = runPrdt('sigint', 'ctrl-z')
    expect(r.hung).toBe(false)
    expect(r.status).toBe(130)
    expect([...endState(r.out).modes]).toEqual([])
  }, 30000)

  test('background `prdt &` (tostop off): no restore bytes written', () => {
    const marker = path.join(shimDir, 'm')
    const harness = [
      'import os, pty, sys, select, time, termios, json',
      'pid, m = pty.fork()',
      'if pid == 0:',
      '    a = termios.tcgetattr(0); a[3] &= ~termios.TOSTOP; termios.tcsetattr(0, termios.TCSANOW, a)',
      '    g = os.fork()',
      '    if g == 0:',
      '        os.setpgid(0, 0)',
      `        os.execvp(sys.executable, [sys.executable, ${JSON.stringify(PRDT_CLI)}])`,
      '    end = time.time() + 8',
      '    while time.time() < end:',
      '        p, st = os.waitpid(g, os.WNOHANG | os.WUNTRACED)',
      '        if p: os._exit(0 if os.WIFEXITED(st) and os.WEXITSTATUS(st) == 0 else 4)',
      '        time.sleep(0.02)',
      '    os.kill(g, 9); os._exit(3)',
      'buf = b""; end = time.time() + 15',
      'while time.time() < end:',
      '    r, _, _ = select.select([m], [], [], 0.05)',
      '    if r:',
      '        try: d = os.read(m, 65536)',
      '        except OSError: break',
      '        if not d: break',
      '        buf += d',
      'os.close(m)',
      '_, st = os.waitpid(pid, 0)',
      'print(json.dumps({"rc": os.WEXITSTATUS(st), "out": buf.decode("latin1")}))',
    ].join('\n')
    const res = JSON.parse(execFileSync('python3', ['-c', harness], {
      cwd: projectDir, encoding: 'utf-8', timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: fakeHome, PATH: `${shimDir}:${process.env.PATH ?? ''}`,
             STUB_MODE: 'exit', STUB_MARKER: marker },
    }))
    expect(res.rc).toBe(0)
    expect(res.out).toContain(`${ESC}[>1u`) // the stub did write
    expect(res.out).not.toContain(`${ESC}[<99u`)
    expect(res.out).not.toContain(`${ESC}[?2004l`)
  }, 30000)

  test('non-tty: no restore bytes, rc propagates', () => {
    const out = execFileSync('python3', ['-c', [
      'import subprocess, sys',
      `p = subprocess.run([sys.executable, ${JSON.stringify(PRDT_CLI)}], stdout=subprocess.PIPE)`,
      'sys.stdout.write(repr(p.returncode) + "|" + p.stdout.decode("latin1"))',
    ].join('\n')], {
      cwd: projectDir, encoding: 'latin1', timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: fakeHome, PATH: `${shimDir}:${process.env.PATH ?? ''}`,
             STUB_MODE: 'exit', STUB_RC: '5', STUB_MARKER: path.join(shimDir, 'm') },
    })
    expect(out.startsWith('5|')).toBe(true)
    expect(out).not.toContain(`${ESC}[<99u`)
    expect(out).not.toContain(`${ESC}[?2004l`)
  }, 20000)
})
