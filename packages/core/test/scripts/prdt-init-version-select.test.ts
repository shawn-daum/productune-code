/**
 * `prdt init` first-version prompt — arrow-key select via gum/fzf, graceful
 * text-input fallback when neither is installed (T-332).
 *
 * The interactive branch is gated by `sys.stdin.isatty()` (T-331 finding), so
 * a piped-stdin execFileSync black-box test never reaches it — a real pty is
 * required. `expect` provides one and is available on macOS (T-331 wiki
 * note); this test drives the REAL `prdt` CLI end-to-end through it.
 *
 * Coverage:
 *   - neither gum nor fzf on PATH -> original text input() path (unaffected)
 *   - fzf on PATH -> arrow-key selection collects the same value as text input
 *   - gum on PATH (when both present) -> gum takes priority, same result
 *   - fzf "other" choice -> falls through to the text prompt for a custom version
 *
 * Tool-driven cases are skipped when gum/fzf aren't actually installed on the
 * machine running the suite — the graceful-fallback design means CI without
 * either tool still gets full coverage of the case that matters most there.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}

function hasExpect(): boolean { return which('expect') !== null }

const PYTHON3 = which('python3')
const GUM = which('gum')
const FZF = which('fzf')

/** A PATH containing ONLY python3 (via a private symlink) + /usr/bin:/bin — guarantees
 * gum/fzf are unreachable even when they live alongside the real python3 binary. */
function fallbackOnlyPath(sandbox: string): string {
  const binDir = path.join(sandbox, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.symlinkSync(fs.realpathSync(PYTHON3!), path.join(binDir, 'python3'))
  return `${binDir}:/usr/bin:/bin`
}

/** Run an expect script (already written to `expFile`) with cwd = the sandbox project dir. */
function runExpect(expFile: string, projectDir: string): void {
  execFileSync('expect', [expFile], { cwd: projectDir, stdio: 'ignore' })
}

function readVersion(projectDir: string): string {
  const st = JSON.parse(fs.readFileSync(path.join(projectDir, '.prdt', 'po-state.json'), 'utf8'))
  return st.version
}

function mkProject(prefix: string): string {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  return projectDir
}

describe.skipIf(!hasExpect() || !PYTHON3)('prdt init — first-version prompt (T-332)', () => {
  test('neither gum nor fzf on PATH -> text input() fallback, default accepted', () => {
    const projectDir = mkProject('core-init-t332-fallback-')
    const pathVal = fallbackOnlyPath(path.dirname(projectDir))
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set env(PATH) "${pathVal}"
spawn python3 "${PRDT_CLI}" init
expect "project slug"
send "\\r"
expect "first version"
expect "or type your own"
send "\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v0.1')
  }, 20000)

  test.skipIf(!FZF)('fzf on PATH -> arrow-down selects v1', () => {
    const projectDir = mkProject('core-init-t332-fzf-')
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${process.env.PATH}"
spawn python3 "${PRDT_CLI}" init
expect "project slug"
send "\\r"
expect "first version>"
after 200
send "\\033\\[B"
after 200
send "\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v1')
  }, 20000)

  test.skipIf(!FZF)('fzf "other" choice falls through to the text prompt for a custom version', () => {
    const projectDir = mkProject('core-init-t332-fzf-other-')
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${process.env.PATH}"
spawn python3 "${PRDT_CLI}" init
expect "project slug"
send "\\r"
expect "first version>"
after 200
send "\\033\\[B"
after 100
send "\\033\\[B"
after 200
send "\\r"
expect "or type your own"
send "v2.custom\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v2.custom')
  }, 20000)

  test.skipIf(!GUM)('gum on PATH (priority over fzf) -> arrow-down selects v1', () => {
    const projectDir = mkProject('core-init-t332-gum-')
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${process.env.PATH}"
spawn python3 "${PRDT_CLI}" init
expect "project slug"
send "\\r"
expect "ship a solid idea with a launch plan"
after 300
send "\\033\\[B"
after 200
send "\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v1')
  }, 20000)
})
