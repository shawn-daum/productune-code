/**
 * T-439 QA BLOCKER: "the install must be visible to the app that performed it."
 *
 * QA's fresh-VM finding: `installClaudeCli` confirms `~/.local/bin/claude` by
 * ABSOLUTE path and returns ok, while `onboarding:checkClaude` only ever asked
 * `which claude` under the login-shell PATH. The official non-interactive
 * installer writes NO shell integration (QA observed `~/.zprofile` still 0 bytes
 * and `~/.zshrc` absent afterwards), and a fresh Mac has no `~/.local/bin` on
 * PATH — so the engine row reverted to "not installed" forever and every retry
 * silently reinstalled. Infinite loop at onboarding step 3/5.
 *
 * This test reproduces that machine faithfully and then observes the OBSERVABLE
 * THE RENDERER ACTUALLY CONSUMES — the real `onboarding:checkClaude` IPC handler
 * captured off `ipcMain.handle` — not an internal code path:
 *
 *   • HOME = a fresh temp dir with NO shell profile of any kind
 *     (.zprofile / .zshrc / .zshenv / .profile / .bash_profile all absent),
 *   • the login shell reports the stock macOS PATH (`/usr/bin:/bin:/usr/sbin:/sbin`)
 *     — path_helper's floor, exactly what an untouched profile yields,
 *   • `~/.local/bin/claude` present and executable, as the installer leaves it.
 *
 * Every test asserts the DISCRIMINATING PRECONDITION first — that `which claude`
 * genuinely CANNOT resolve under this PATH — so a passing result can never come
 * from the dev machine's own globally-installed claude leaking in.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { register } from './onboarding'
import { resetLoginShellPathCache, loginShellPath } from '../surface-runner'

const execFileAsync = promisify(execFile)

/** The stock macOS PATH a login shell yields when no profile was ever written. */
const STOCK_MAC_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'

let tmpHome = ''
let savedEnv: Record<string, string | undefined> = {}

/** Grab the real handler the renderer invokes, straight off the ipcMain stub. */
function handlerFor(channel: string): (...args: any[]) => any {
  register()
  const calls = vi.mocked(ipcMain.handle).mock.calls as unknown as [string, any][]
  const hit = calls.filter((c) => c[0] === channel).pop()
  if (!hit) throw new Error(`no handler registered for ${channel}`)
  return hit[1]
}

/** Write a working stand-in for the installed CLI at the official launcher path
 *  — the post-install disk state `installClaudeCli` verifies and returns ok on. */
function placeInstalledCli(home: string): string {
  const binDir = path.join(home, '.local', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const launcher = path.join(binDir, 'claude')
  fs.writeFileSync(
    launcher,
    '#!/bin/bash\n' +
      'if [ "$1" = "--version" ]; then echo "2.1.211 (Claude Code)"; exit 0; fi\n' +
      'if [ "$1" = "auth" ]; then echo \'{"loggedIn":false}\'; exit 0; fi\n' +
      'exit 0\n',
    { mode: 0o755 },
  )
  return launcher
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 't439-fresh-home-'))

  // A login shell that reports the stock PATH — the fresh-Mac condition, made
  // deterministic so this test can never inherit the dev box's own PATH.
  const fakeShell = path.join(tmpHome, 'stock-login-shell')
  fs.writeFileSync(
    fakeShell,
    `#!/bin/bash\nprintf '%s' '__PB_PATH__${STOCK_MAC_PATH}__PB_END__'\n`,
    { mode: 0o755 },
  )

  savedEnv = { HOME: process.env.HOME, PATH: process.env.PATH, SHELL: process.env.SHELL }
  process.env.HOME = tmpHome
  process.env.PATH = STOCK_MAC_PATH
  process.env.SHELL = fakeShell
  resetLoginShellPathCache()
  vi.mocked(ipcMain.handle).mockClear()
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetLoginShellPathCache()
  try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch { /* best-effort */ }
})

/** Fails the test unless PATH-based lookup genuinely cannot see the CLI. */
async function assertPathLookupCannotSeeIt() {
  await expect(
    execFileAsync('which', ['claude'], { env: { ...process.env, PATH: STOCK_MAC_PATH } }),
  ).rejects.toThrow()
}

describe('T-439 BLOCKER: engine detection on a shell-profile-untouched HOME', () => {
  it('reports installed after the official installer placed ~/.local/bin/claude and touched no profile', async () => {
    // The machine QA had: nothing on PATH, no profile files at all.
    for (const f of ['.zprofile', '.zshrc', '.zshenv', '.profile', '.bash_profile']) {
      expect(fs.existsSync(path.join(tmpHome, f)), `${f} must be absent`).toBe(false)
    }
    await assertPathLookupCannotSeeIt()

    // ...and then the installer runs, leaving exactly this on disk.
    const launcher = placeInstalledCli(tmpHome)
    expect(fs.existsSync(launcher)).toBe(true)
    // Still no shell integration written — the whole point of the bug.
    for (const f of ['.zprofile', '.zshrc', '.zshenv', '.profile', '.bash_profile']) {
      expect(fs.existsSync(path.join(tmpHome, f)), `${f} must still be absent`).toBe(false)
    }
    await assertPathLookupCannotSeeIt()

    const checkClaude = handlerFor('onboarding:checkClaude')
    const res = await checkClaude()

    // The renderer's EngineStatusRow gates on exactly this field.
    expect(res.installed).toBe(true)
  })

  it('still reports NOT installed when nothing was ever installed (no false positive)', async () => {
    await assertPathLookupCannotSeeIt()
    const checkClaude = handlerFor('onboarding:checkClaude')
    expect((await checkClaude()).installed).toBe(false)
  })

  it('does not report installed for a non-executable file squatting the launcher path', async () => {
    const binDir = path.join(tmpHome, '.local', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(binDir, 'claude'), 'not a program', { mode: 0o644 })

    const checkClaude = handlerFor('onboarding:checkClaude')
    expect((await checkClaude()).installed).toBe(false)
  })

  it('drops the memoized login-shell PATH after an install, in the same run', async () => {
    // The cache is warmed on entry to step 3 (pre-install). If it is never
    // dropped, an install that DOES write shell integration stays invisible for
    // the rest of the app run. Observable: loginShellPath() must report the
    // shell's NEW answer after the install handler resolves, without a restart.
    placeInstalledCli(tmpHome)
    const checkClaude = handlerFor('onboarding:checkClaude')
    await checkClaude()
    const warmed = loginShellPath()
    expect(warmed).toBe(STOCK_MAC_PATH)

    // The shell's answer changes (what a profile-writing installer causes)...
    const grown = `${tmpHome}/.local/bin:${STOCK_MAC_PATH}`
    fs.writeFileSync(
      process.env.SHELL as string,
      `#!/bin/bash\nprintf '%s' '__PB_PATH__${grown}__PB_END__'\n`,
      { mode: 0o755 },
    )
    // ...and is still masked by the cache until the install handler runs.
    expect(loginShellPath()).toBe(warmed)

    const installClaude = handlerFor('onboarding:installClaude')
    await installClaude()

    expect(loginShellPath(), 'install must invalidate the memoized PATH').toBe(grown)
  })

  it('detects within the SAME process run that memoized the pre-install PATH', async () => {
    // QA's second defect: loginShellPath() is memoized per process and
    // checkClaude populates that cache on entry to step 3 — BEFORE the install.
    // A first check warms the cache with the pre-install PATH...
    const checkClaude = handlerFor('onboarding:checkClaude')
    expect((await checkClaude()).installed).toBe(false)

    // ...the install then happens inside that same app run...
    placeInstalledCli(tmpHome)

    // ...and detection must still succeed without an app restart.
    expect((await checkClaude()).installed).toBe(true)
  })
})
