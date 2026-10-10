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
    'if mode == "die":',
    '    signal.signal(signal.SIGUSR1, signal.SIG_DFL); os.kill(os.getpid(), signal.SIGUSR1)',
    'time.sleep(10)',
  ].join('\n'), { mode: 0o755 })
}

interface Run { status: number; sig: number; out: string; marker: string }

/** Run `prdt` under a pty. `act`: how the harness-as-terminal reacts after READY. */
function runPrdt(mode: string, act: 'none' | 'ctrl-c' | 'term', env: Record<string, string> = {}): Run {
  const marker = path.join(shimDir, 'm')
  const harness = [
    'import os, pty, sys, select, time, json, signal',
    'pid, m = pty.fork()',
    'if pid == 0:',
    `    os.execvp(sys.executable, [sys.executable, ${JSON.stringify(PRDT_CLI)}])`,
    'buf = b""; acted = False; end = time.time() + 15',
    'while time.time() < end:',
    '    r, _, _ = select.select([m], [], [], 0.05)',
    '    if r:',
    '        try: d = os.read(m, 65536)',
    '        except OSError: break',
    '        if not d: break',
    '        buf += d',
    `    if not acted and b"READY" in buf and ${JSON.stringify(act)} != "none":`,
    '        acted = True; time.sleep(0.2)',
    `        if ${JSON.stringify(act)} == "ctrl-c": os.write(m, b"\\x03")`,
    '        else: os.kill(pid, signal.SIGTERM)',
    '        end = min(end, time.time() + 8)',
    '_, st = os.waitpid(pid, 0)',
    'print(json.dumps({"status": os.WEXITSTATUS(st) if os.WIFEXITED(st) else -1,',
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
