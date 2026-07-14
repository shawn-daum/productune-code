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
 *   - fzf on PATH -> menu RENDERS + arrow-key selection collects the same value
 *   - gum on PATH (when both present) -> gum takes priority, menu RENDERS, same result
 *   - fzf "other" choice -> falls through to the text prompt for a custom version
 *
 * UI-visibility regression (post-ship real-terminal bug): gum prints the
 * selection on stdout but DRAWS its menu on STDERR (fzf draws on the tty) —
 * capturing stderr too (capture_output=True) produced an invisible "blind
 * menu" that still ate keystrokes. The first version of this suite sent
 * arrows blind (a bare `expect "..."` silently falls through on timeout) and
 * passed anyway, so every tool-driven case below now ASSERTS the menu's own
 * option label is rendered to the pty BEFORE sending keys, via an expect
 * block whose timeout arm exits non-zero. The asserted label
 * "validate an idea (default)" is menu-only — the print() intro line says
 * "validating an idea", so it can't satisfy the match.
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

/** Menu-only option label used to assert the selector UI actually rendered. */
const MENU_LABEL = 'validate an idea (default)'

/** expect block that REQUIRES `pattern` to appear on the pty, else exits 1
 * (a bare `expect "..."` would silently continue on timeout — that's exactly
 * how the blind-menu bug slipped through the first version of this suite). */
function mustSee(pattern: string): string {
  return `expect {
  "${pattern}" {}
  timeout { puts "TIMEOUT waiting for: ${pattern}"; exit 1 }
}`
}

/** A PATH exposing ONLY the given binaries (via private symlinks) + /usr/bin:/bin.
 * Lets each case pin exactly which selector tools are reachable: python3 alone
 * for the text fallback, python3+fzf to force the fzf path even on a machine
 * that also has gum (gum outranks fzf, so an unfiltered PATH would test gum —
 * which is exactly how the first version of the fzf cases silently drifted). */
function pathWithOnly(sandbox: string, bins: string[]): string {
  const binDir = path.join(sandbox, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  for (const bin of bins) {
    fs.symlinkSync(fs.realpathSync(which(bin)!), path.join(binDir, bin))
  }
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
    const pathVal = pathWithOnly(path.dirname(projectDir), ['python3'])
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set env(PATH) "${pathVal}"
spawn python3 "${PRDT_CLI}" init
${mustSee('project slug')}
send "\\r"
${mustSee('or type your own')}
send "\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v0.1')
  }, 20000)

  test.skipIf(!FZF)('fzf on PATH (no gum) -> menu renders, arrow-down selects v1', () => {
    const projectDir = mkProject('core-init-t332-fzf-')
    const pathVal = pathWithOnly(path.dirname(projectDir), ['python3', 'fzf'])
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${pathVal}"
spawn python3 "${PRDT_CLI}" init
${mustSee('project slug')}
send "\\r"
${mustSee('first version>')}
${mustSee(MENU_LABEL)}
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
    const pathVal = pathWithOnly(path.dirname(projectDir), ['python3', 'fzf'])
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${pathVal}"
spawn python3 "${PRDT_CLI}" init
${mustSee('project slug')}
send "\\r"
${mustSee('first version>')}
${mustSee(MENU_LABEL)}
after 200
send "\\033\\[B"
after 100
send "\\033\\[B"
after 200
send "\\r"
${mustSee('or type your own')}
send "v2.custom\\r"
expect eof
`)
    runExpect(exp, projectDir)
    expect(readVersion(projectDir)).toBe('v2.custom')
  }, 20000)

  test.skipIf(!GUM)('gum on PATH (priority over fzf when both present) -> menu renders, arrow-down selects v1', () => {
    const projectDir = mkProject('core-init-t332-gum-')
    const pathVal = pathWithOnly(path.dirname(projectDir), ['python3', 'gum', ...(FZF ? ['fzf'] : [])])
    const exp = path.join(path.dirname(projectDir), 'run.exp')
    fs.writeFileSync(exp, `
set timeout 10
set stty_init "rows 40 columns 100"
set env(PATH) "${pathVal}"
spawn python3 "${PRDT_CLI}" init
${mustSee('project slug')}
send "\\r"
${mustSee(MENU_LABEL)}
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
