/**
 * prdt-atomic-write-mode.test.ts — T-715 ②.
 *
 * `atomic_write_text(path, text, mode=...)`'s docstring said a caller passing
 * an explicit `mode` gets that exact bit pattern "regardless of umask" (e.g.
 * `ensure_prepush_hook`'s `mode=0o755` for an executable git hook), but the
 * code only ever passed `mode` to `os.open()`'s O_CREAT argument — which the
 * calling process's umask still masks, same as `Path.write_text()`. Under a
 * restrictive umask (0o077, PO-observed) a `mode=0o755` hook landed as
 * `0o700`, contradicting the doc's own promise. Fixed by an `fchmod` right
 * after `os.open()` that re-asserts the exact requested bits.
 *
 * Loads scripts/prdt as a module (precedent: prdt-update-nudge-direction.test.ts
 * `py()`) so the real function runs, under a umask this test sets and restores.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let dir: string

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

/** Runs `prdt`'s `atomic_write_text(target, "…", mode=mode)` in a FRESH python3
 *  subprocess launched under a shell that sets `umask` first — `process.umask()`
 *  changing the test runner's own umask is unreliable across platforms/workers,
 *  a plain `umask` shell builtin ahead of the exec is not. */
function writeUnderUmask(umaskOctal: string, target: string, mode: number): void {
  const script = `
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
m.atomic_write_text(${JSON.stringify(target)}, "echo hi\\n", mode=${mode})
`
  // The script goes to a FILE, not an inline `-c` string: bash's double
  // quotes do not turn a literal `\n` back into a real newline, so an
  // inline multi-line script arrived at python3 as one line and failed to
  // parse. A file path has no such quoting hazard.
  const scriptPath = path.join(dir, `write-${mode.toString(8)}.py`)
  fs.writeFileSync(scriptPath, script, 'utf-8')
  const shellCmd = `umask ${umaskOctal} && "${PYTHON3}" "${scriptPath}"`
  execFileSync('bash', ['-c', shellCmd], { encoding: 'utf-8', timeout: subprocessTimeout('cli') })
}

describe.skipIf(!PYTHON3)('atomic_write_text mode vs. umask (T-715 ②)', () => {
  test('an explicit mode=0o755 (executable hook shape) lands exactly 0o755 under umask 0o077', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-atomic-mode-'))
    const target = path.join(dir, 'pre-push')
    writeUnderUmask('077', target, 0o755)
    expect(fs.statSync(target).mode & 0o777).toBe(0o755)
  })

  test('an explicit mode=0o600 (secret-bearing shape) lands exactly 0o600 under umask 0o077', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-atomic-mode-'))
    const target = path.join(dir, 'config.json')
    writeUnderUmask('077', target, 0o600)
    expect(fs.statSync(target).mode & 0o777).toBe(0o600)
  })

  test('the default mode (0o644, no caller override) also lands exactly under umask 0o077', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-atomic-mode-'))
    const target = path.join(dir, 'plain.json')
    writeUnderUmask('077', target, 0o644)
    expect(fs.statSync(target).mode & 0o777).toBe(0o644)
  })
})
