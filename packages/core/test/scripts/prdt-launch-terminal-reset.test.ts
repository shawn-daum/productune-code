/**
 * prdt-launch-terminal-reset.test.ts — T-799.
 *
 * As-is (ticket `problem`, user screenshot 2026-09-29): `prdt` sometimes hands
 * Claude Code a terminal with mouse tracking / focus reporting still ON —
 * some earlier program enabled one of these modes and never sent the
 * matching disable, so every mouse move or focus change then lands as raw
 * escape bytes (`^[[O^[[I…`, `^[[<35;8;1M…`) in Claude Code's own input.
 *
 * Reproduced (2026-09-29, see `reset_terminal_input_modes`'s docstring in
 * `scripts/prdt`): a pty capture of `select_choice`'s `fzf` branch (the
 * arrow-key first-version prompt) killed abruptly mid-render shows it
 * enabling `\x1b[?1000h\x1b[?1002h\x1b[?1006h` on start and never writing the
 * disable — exactly the dangling-mode shape this ticket fixes, regardless of
 * which past or future program is the actual culprit on a given machine.
 *
 * To-be: right before `cmd_po` hands the tty to Claude Code (`os.execvp`),
 * it writes the disable sequences for mouse tracking (1000/1002/1003/1006/
 * 1015) and focus reporting (1004) — only when stdout is a real tty.
 *
 * Coverage:
 *   - non-tty launch (piped stdout, mirrors prdt-trust-accept.test.ts's
 *     stub-`claude` shim): no reset bytes appear anywhere in the output.
 *   - tty launch (real pty via `expect`, same tool prdt-init-version-
 *     select.test.ts uses for its own tty-gated case): the reset bytes are
 *     written before the stub `claude` runs.
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
/** The exact disable-sequence bytes `reset_terminal_input_modes` writes. */
const RESET_BYTES = [1000, 1002, 1003, 1006, 1015, 1004].map((m) => `${ESC}[?${m}l`).join('')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const EXPECT = which('expect')

let projectDir: string
let fakeHome: string
let shimDir: string

/** A `claude` stub that proves execvp reached it, without a real session. */
function writeClaudeShim(marker: string): void {
  shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t799-shim-'))
  fs.writeFileSync(path.join(shimDir, 'claude'), `#!/bin/sh\necho "${marker}"\nexit 0\n`, { mode: 0o755 })
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t799-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t799-home-'))
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj'], {
    cwd: projectDir,
    stdio: ['ignore', 'ignore', 'ignore'],
    timeout: subprocessTimeout('cli'),
    env: { ...process.env, HOME: fakeHome },
  })
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
  if (shimDir) fs.rmSync(shimDir, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('bare `prdt` launch — terminal mode reset (T-799)', () => {
  test('non-tty: no reset bytes written', () => {
    writeClaudeShim('STUB-CLAUDE-RAN')
    const out = execFileSync('python3', [PRDT_CLI], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: subprocessTimeout('cli'),
      env: { ...process.env, HOME: fakeHome, PATH: `${shimDir}:${process.env.PATH ?? ''}` },
    })
    expect(out).toContain('STUB-CLAUDE-RAN')
    expect(out).not.toContain(RESET_BYTES)
    for (const mode of [1000, 1002, 1003, 1006, 1015, 1004]) {
      expect(out).not.toContain(`${ESC}[?${mode}l`)
    }
  }, 20000)

  test.skipIf(!EXPECT)('tty: reset bytes written before Claude Code takes the tty', () => {
    writeClaudeShim('STUB-CLAUDE-RAN')
    const pathVal = `${shimDir}:${process.env.PATH ?? ''}`
    const exp = path.join(fakeHome, 'run.exp')
    // `-ex` (exact, not glob/regexp) so the literal ESC/`[`/`?` bytes in
    // RESET_BYTES are matched as-is; `{...}` brace-quotes them so Tcl does
    // no substitution (a bare `[` would otherwise start command substitution).
    fs.writeFileSync(exp, [
      'set timeout 10',
      `set env(PATH) "${pathVal}"`,
      `set env(HOME) "${fakeHome}"`,
      `spawn python3 "${PRDT_CLI}"`,
      `expect -ex {${RESET_BYTES}} {} timeout { puts "TIMEOUT waiting for reset bytes"; exit 1 }`,
      'expect -ex {STUB-CLAUDE-RAN} {} timeout { puts "TIMEOUT waiting for stub marker"; exit 1 }',
      'expect eof',
    ].join('\n'))
    execFileSync('expect', [exp], { cwd: projectDir, stdio: 'ignore', timeout: subprocessTimeout('cli') })
  }, 20000)
})
