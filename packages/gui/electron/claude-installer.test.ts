/**
 * claude-installer — in-app engine CLI provisioning (T-439).
 *
 * Proves the install decision + verification pipeline entirely against
 * injected deps and fixture dirs (mkdtemp HOME) — no network, no real
 * installer run, the developer's real ~/.local is NEVER touched:
 *   1. CLI already resolvable (Homebrew / npm-global / manual / prior run)
 *      → no-op: nothing downloaded, nothing executed, existing install intact.
 *   2. Network unreachable → { code: 'network' }, nothing executed.
 *   3. Downloaded script fails validation (HTML error page, empty body,
 *      missing shebang) → { code: 'script-invalid' }, never executed.
 *   4. Installer exits non-zero → { code: 'install-failed' }.
 *   5. Success → performed:true + version, progress phases in order
 *      download → install → verify.
 *   6. Post-install binary verification fails → { code: 'binary-verify-failed' }
 *      AND the just-provisioned files are removed (documented native-uninstall
 *      paths), so an unverified binary is never left as the live launcher.
 *   7. Unsupported platform → { code: 'unsupported-platform' }, no download.
 *
 * Mirrors the framework-free case-list + vitest driver idiom of
 * onboarding.hooks.test.ts / prdt-bootstrap.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { installClaudeCli, validateInstallerScript } from './claude-installer'
import type { InstallDeps, InstallPhase } from './claude-installer'

// A structurally-valid stand-in for the official install.sh (real one is ~7 KB;
// validation requires shebang + claude marker + non-trivial length).
const VALID_SCRIPT =
  '#!/bin/bash\nset -e\n# claude code native installer stand-in\n' +
  '# checksum verification happens against the release manifest before exec\n' +
  'x'.repeat(600) + '\n'

let fixtureHome: string
let fixtureTmp: string

beforeEach(() => {
  fixtureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-home-'))
  fixtureTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-tmp-'))
})

afterEach(() => {
  fs.rmSync(fixtureHome, { recursive: true, force: true })
  fs.rmSync(fixtureTmp, { recursive: true, force: true })
})

/** Deps for the happy path; individual cases override the failing leg. */
function makeDeps(overrides: Partial<InstallDeps> = {}): InstallDeps & {
  phases: InstallPhase[]
  fetchSpy: ReturnType<typeof vi.fn>
  runSpy: ReturnType<typeof vi.fn>
} {
  const phases: InstallPhase[] = []
  const fetchSpy = vi.fn(async () => VALID_SCRIPT)
  const runSpy = vi.fn(async (scriptPath: string) => {
    // The real script places the launcher at ~/.local/bin/claude — simulate.
    expect(fs.existsSync(scriptPath)).toBe(true)
    const bin = path.join(fixtureHome, '.local', 'bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(path.join(fixtureHome, '.local', 'share', 'claude', 'versions'), { recursive: true })
    const versioned = path.join(fixtureHome, '.local', 'share', 'claude', 'versions', '2.1.211')
    fs.writeFileSync(versioned, '#!/bin/true\n', { mode: 0o755 })
    fs.symlinkSync(versioned, path.join(bin, 'claude'))
    return { code: 0 as number | null, tail: 'Installation complete!' }
  })
  return {
    platform: 'darwin',
    homeDir: fixtureHome,
    tmpDir: fixtureTmp,
    whichClaude: async () => null,
    fetchScript: fetchSpy,
    runScript: runSpy,
    codesignVerify: async () => { /* signed */ },
    probeVersion: async () => '2.1.211 (Claude Code)\n',
    onProgress: (p: InstallPhase) => { phases.push(p) },
    phases,
    fetchSpy,
    runSpy,
    ...overrides,
  }
}

describe('validateInstallerScript', () => {
  it('accepts a bash script with shebang + claude marker', () => {
    expect(validateInstallerScript(VALID_SCRIPT).ok).toBe(true)
  })
  it('rejects an empty / trivially short body', () => {
    expect(validateInstallerScript('').ok).toBe(false)
    expect(validateInstallerScript('#!/bin/bash\n').ok).toBe(false)
  })
  it('rejects an HTML error page (the documented curl-failure class)', () => {
    const html = '<!DOCTYPE html><html><body>403</body></html>' + 'x'.repeat(600)
    expect(validateInstallerScript(html).ok).toBe(false)
  })
  it('rejects a body without a shebang', () => {
    expect(validateInstallerScript('echo claude\n' + 'x'.repeat(600)).ok).toBe(false)
  })
})

describe('installClaudeCli', () => {
  it('no-ops when a CLI already resolves — nothing downloaded or executed', async () => {
    const deps = makeDeps({ whichClaude: async () => '/opt/homebrew/bin/claude' })
    const res = await installClaudeCli(deps)
    expect(res).toMatchObject({ ok: true, performed: false, alreadyInstalled: true })
    expect(deps.fetchSpy).not.toHaveBeenCalled()
    expect(deps.runSpy).not.toHaveBeenCalled()
  })

  it('maps a download failure to code network, nothing executed', async () => {
    const deps = makeDeps({ fetchScript: async () => { throw new Error('getaddrinfo ENOTFOUND claude.ai') } })
    const res = await installClaudeCli(deps)
    expect(res.ok).toBe(false)
    expect(res.performed).toBe(false)
    expect(res.code).toBe('network')
    expect(deps.runSpy).not.toHaveBeenCalled()
  })

  it('rejects an invalid script before execution (script-invalid)', async () => {
    const deps = makeDeps({ fetchScript: async () => '<!DOCTYPE html><html>oops</html>' + 'x'.repeat(600) })
    const res = await installClaudeCli(deps)
    expect(res.code).toBe('script-invalid')
    expect(deps.runSpy).not.toHaveBeenCalled()
  })

  it('maps a non-zero installer exit to install-failed with output tail', async () => {
    const deps = makeDeps({
      runScript: async () => ({ code: 1, tail: 'Checksum verification failed' }),
    })
    const res = await installClaudeCli(deps)
    expect(res).toMatchObject({ ok: false, performed: true, code: 'install-failed' })
    expect(res.error).toContain('Checksum verification failed')
  })

  it('succeeds end-to-end with phases download → install → verify', async () => {
    const deps = makeDeps()
    const res = await installClaudeCli(deps)
    expect(res).toMatchObject({ ok: true, performed: true })
    expect(res.version).toContain('2.1.211')
    expect(deps.phases).toEqual(['download', 'install', 'verify'])
  })

  it('binary verification failure removes the just-provisioned install', async () => {
    const deps = makeDeps({ codesignVerify: async () => { throw new Error('code object is not signed at all') } })
    const res = await installClaudeCli(deps)
    expect(res).toMatchObject({ ok: false, performed: true, code: 'binary-verify-failed' })
    // launcher + versions dir gone — an unverified binary is never left live
    expect(fs.existsSync(path.join(fixtureHome, '.local', 'bin', 'claude'))).toBe(false)
    expect(fs.existsSync(path.join(fixtureHome, '.local', 'share', 'claude'))).toBe(false)
  })

  it('reports binary-verify-failed when the launcher never appeared', async () => {
    const deps = makeDeps({ runScript: async () => ({ code: 0, tail: 'done' }) })
    const res = await installClaudeCli(deps)
    expect(res.code).toBe('binary-verify-failed')
  })

  it('refuses on a platform without a wired installer path', async () => {
    const deps = makeDeps({ platform: 'win32' })
    const res = await installClaudeCli(deps)
    expect(res.code).toBe('unsupported-platform')
    expect(deps.fetchSpy).not.toHaveBeenCalled()
  })
})
