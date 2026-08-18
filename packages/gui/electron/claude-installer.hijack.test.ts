/**
 * T-439 QA HIGH: the network-fetched installer script must not resolve its
 * helper binaries through a user-writable directory.
 *
 * QA's demonstrated attack: this app itself creates `~/.local/bin`
 * (prdt-bootstrap §5) and the official installer places `claude` there, so on a
 * participant machine that directory sits at the FRONT of the login-shell PATH.
 * The installer script's only integrity check is `shasum`. A file the user (or
 * anything running as the user) can write at `~/.local/bin/shasum` is therefore
 * what the checksum step executes — the check validates itself.
 *
 * This test does not assert that a constant has a certain value. It plants a
 * real shim, runs the REAL production spawn path (`installClaudeCli` with
 * `runScript` NOT injected, so `defaultRunScript` executes), and observes which
 * `shasum` binary the script actually got:
 *
 *   • under the OLD env (`withLoginShellPath`) the shim runs — hijack lands;
 *   • under the shipped code the script gets `/usr/bin/shasum` — hijack dead.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { installClaudeCli, installerScriptEnv, INSTALLER_SCRIPT_PATH } from './claude-installer'
import { withLoginShellPath, resetLoginShellPathCache } from './surface-runner'

let tmpHome = ''
let savedEnv: Record<string, string | undefined> = {}

/** Where the fake installer script reports the `shasum` it resolved. */
function witnessPath(): string {
  return path.join(tmpHome, 'resolved-shasum.txt')
}

/**
 * A stand-in installer that behaves like the real one's checksum step: it just
 * records which `shasum` the shell resolved. Padded past
 * validateInstallerScript's 500-char floor and carrying the required markers so
 * it travels the exact same code path a real install.sh does.
 */
function fakeInstallerScript(): string {
  return [
    '#!/bin/bash',
    '# Stand-in for the official claude installer (claude.ai/install.sh).',
    '# The real script verifies the downloaded claude binary with `shasum -a 256`;',
    '# all we need to observe is WHICH shasum executable the shell hands it,',
    '# because that is precisely what the local hijack replaces. Everything below',
    '# is padding so this body clears validateInstallerScript length floor while',
    '# still exercising the real defaultRunScript spawn, its env, and its PATH.',
    `command -v shasum > "${witnessPath()}" 2>&1 || echo "NO-SHASUM" > "${witnessPath()}"`,
    'echo "claude installer stand-in finished"',
    'exit 0',
  ].join('\n').padEnd(600, '\n# pad\n')
}

/** Plant a user-writable shasum shim in ~/.local/bin — QA's exact hijack. */
function plantShasumShim(): string {
  const binDir = path.join(tmpHome, '.local', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const shim = path.join(binDir, 'shasum')
  // A real attacker's shim prints whatever checksum makes the comparison pass.
  fs.writeFileSync(shim, '#!/bin/bash\necho "HIJACKED $*"\n', { mode: 0o755 })
  return shim
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 't439-hijack-'))
  // A login shell that puts ~/.local/bin FIRST — the participant machine QA
  // described, and what this app's own bootstrap encourages.
  const fakeShell = path.join(tmpHome, 'login-shell')
  fs.writeFileSync(
    fakeShell,
    `#!/bin/bash\nprintf '%s' '__PB_PATH__${tmpHome}/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin__PB_END__'\n`,
    { mode: 0o755 },
  )
  savedEnv = { HOME: process.env.HOME, PATH: process.env.PATH, SHELL: process.env.SHELL }
  process.env.HOME = tmpHome
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
  process.env.SHELL = fakeShell
  resetLoginShellPathCache()
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetLoginShellPathCache()
  try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('T-439: installer script PATH hijack', () => {
  it('THE ATTACK IS REAL — under the old login-shell PATH the planted shim wins', () => {
    const shim = plantShasumShim()
    const script = path.join(tmpHome, 'probe.sh')
    fs.writeFileSync(script, fakeInstallerScript(), { mode: 0o700 })

    // Exactly the env the code used to pass to spawn().
    execFileSync('/bin/bash', [script], { env: withLoginShellPath(process.env) as any })

    expect(fs.readFileSync(witnessPath(), 'utf-8').trim()).toBe(shim)
  })

  it('the shipped installer env pins shasum to /usr/bin — the shim is unreachable', async () => {
    const shim = plantShasumShim()
    expect(fs.existsSync(shim)).toBe(true)

    // Real pipeline: real defaultRunScript, real spawn, real env. Only the
    // network fetch is substituted — we are testing execution, not download.
    const res = await installClaudeCli({
      homeDir: tmpHome,
      tmpDir: tmpHome,
      whichClaude: async () => null,
      fetchScript: async () => fakeInstallerScript(),
    })

    const resolved = fs.readFileSync(witnessPath(), 'utf-8').trim()
    expect(resolved, 'installer must not resolve shasum from a user-writable dir').not.toBe(shim)
    expect(resolved).toBe('/usr/bin/shasum')
    expect(resolved.startsWith(os.homedir())).toBe(false)

    // The script ran and exited 0; the run then failed at OUR binary-verify leg
    // because this stand-in places no launcher — proving we got past execution.
    expect(res.performed).toBe(true)
    expect(res.code).toBe('binary-verify-failed')
  })

  it('pins PATH to system dirs and drops bash shell-injection hooks', () => {
    const env = installerScriptEnv({
      ...process.env,
      BASH_ENV: `${tmpHome}/evil.sh`,
      ENV: `${tmpHome}/evil.sh`,
      SHELLOPTS: 'xtrace',
    })
    expect(env.PATH).toBe(INSTALLER_SCRIPT_PATH)
    expect(env.BASH_ENV).toBeUndefined()
    expect(env.ENV).toBeUndefined()
    expect(env.SHELLOPTS).toBeUndefined()
    // Nothing user-writable under HOME may appear on that PATH.
    for (const p of String(env.PATH).split(path.delimiter)) {
      expect(p.startsWith(tmpHome), `${p} is under HOME`).toBe(false)
    }
  })
})
