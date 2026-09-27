/**
 * install-builds-meta-bridge.test.ts — T-731.
 *
 * WHY: `dist/bin/meta-cli.cjs` is a BUILD ARTIFACT of `packages/core/src`
 * (tsc + esbuild), `dist/` is gitignored, and install.sh used to have no
 * build step — a fix committed to core/src bound nothing until someone ran
 * `npm run build` by hand (T-686's lock fix landed 2026-09-26, the bug it
 * fixed recurred 2026-09-27 because the running bridge was still a
 * 2026-09-22 build). This asserts the REAL install.sh (run against the real
 * repo checkout — same shape every `install-fixture.ts` test already uses;
 * only HOME/PRDT_HOME/CLAUDE_DIR are sandboxed) now rebuilds the bridge from
 * a stale state, and leaves it untouched when it is already current.
 *
 * dist/ is a derived, gitignored build output — rebuilding it here is the
 * same side effect `npm run build` already has; nothing about the repo's
 * tracked content changes.
 */

import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { CORE_ROOT, makeSandbox, runInstall, hasJq } from '../helpers/install-fixture'

const BRIDGE = path.join(CORE_ROOT, 'dist', 'bin', 'meta-cli.cjs')
const SRC_ENTRY = path.join(CORE_ROOT, 'src', 'bin', 'meta-cli.ts')

function hasNpm(): boolean {
  try { execFileSync('npm', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

describe.skipIf(!hasJq() || !hasNpm())('install.sh rebuilds the node bridge (T-731)', () => {
  test('a bridge older than the newest src file is rebuilt newer by install', () => {
    // Bring the bridge to a KNOWN-fresh state first (skip if this machine
    // cannot build at all — same posture as the rest of this suite: a
    // missing prerequisite is silence, never a false failure).
    const sb0 = makeSandbox('core-install-bridge-prime-')
    runInstall(sb0)
    fs.rmSync(sb0.root, { recursive: true, force: true })
    expect(fs.existsSync(BRIDGE), 'priming install did not produce a bridge').toBe(true)

    const beforeMtime = fs.statSync(BRIDGE).mtimeMs
    // age the bridge behind the source entry without touching its bytes —
    // reproduces "src changed after the last build" without requiring an
    // actual source EDIT (which would dirty the developer's tree).
    const past = (Date.now() - 60_000) / 1000
    fs.utimesSync(BRIDGE, past, past)
    const now = Date.now() / 1000
    fs.utimesSync(SRC_ENTRY, now, now)

    const sb = makeSandbox('core-install-bridge-')
    const r = execFileSync('bash', [path.join(CORE_ROOT, 'scripts', 'install.sh')], {
      env: sb.env, encoding: 'utf8',
    })
    fs.rmSync(sb.root, { recursive: true, force: true })

    // CORE_ROOT (and its dist/.build.lock) is the real repo checkout, shared
    // by every install.sh invocation across the whole suite — including
    // other test FILES' own `runInstall()` calls, running concurrently in
    // their own worker under the full parallel run. Whichever one wins the
    // mkdir-lock race rebuilds the bridge and the others print "already up
    // to date (built by another install while this one waited)" on the
    // guaranteed re-check — a correct outcome install.sh's own mutex exists
    // to produce, not a failure of THIS call to build. "Building node
    // bridge" pins the happy, uncontended path; the mtime assertions below
    // are what actually pins the behavior under test — the bridge ends up
    // rebuilt after the source touch regardless of which install did it.
    expect(r).toMatch(/Building node bridge|node bridge already up to date \(built by another install/)
    const afterMtime = fs.statSync(BRIDGE).mtimeMs
    expect(afterMtime).toBeGreaterThan(beforeMtime)
    expect(afterMtime / 1000).toBeGreaterThanOrEqual(now - 1)
  }, 60000)

  test('a bridge already newer than every src file is left untouched (no rebuild)', () => {
    const sb0 = makeSandbox('core-install-bridge-prime2-')
    runInstall(sb0)
    fs.rmSync(sb0.root, { recursive: true, force: true })
    expect(fs.existsSync(BRIDGE)).toBe(true)

    const beforeMtime = fs.statSync(BRIDGE).mtimeMs
    const sb = makeSandbox('core-install-bridge-clean-')
    const r = execFileSync('bash', [path.join(CORE_ROOT, 'scripts', 'install.sh')], {
      env: sb.env, encoding: 'utf8',
    })
    fs.rmSync(sb.root, { recursive: true, force: true })

    expect(r).not.toMatch(/Building node bridge/)
    expect(fs.statSync(BRIDGE).mtimeMs).toBe(beforeMtime)
  }, 60000)
})
