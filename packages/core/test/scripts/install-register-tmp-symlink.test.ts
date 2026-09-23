/**
 * T-656 slice D4 — symlink-attack regression for install.sh's register
 * migration (the `audience-mode` → `register` branch), the one shell site that
 * slice C (054fe17) moved from a fixed `$PRDT_HOME/register.tmp` onto
 * `mktemp "$PRDT_HOME/register.XXXXXX"`.
 *
 * The attack: the pre-fix body did `printf … > "$PRDT_HOME/register.tmp"`, and
 * a shell redirect follows a symlink. A `register.tmp` planted as a link to a
 * file this uid owns gets that file truncated with `audience=<mode>` (and
 * chmod'd 0600). Each half plants that link at a victim, seeds the branch's
 * trigger (an `audience-mode` file, no `register`), runs the installer for
 * real, and checks the victim:
 *   pre-fix — test/fixtures/pre-t656-install.sh (taken from
 *             `git show 71ef974:packages/core/scripts/install.sh`, the parent of
 *             054fe17, never HEAD) MUST clobber the victim. If it does not, the
 *             run never reached the branch and the half fails.
 *   live    — scripts/install.sh MUST leave the victim byte-identical AND must
 *             have written `register` as a regular file carrying the migrated
 *             value, so "untouched" never means "the branch did not run".
 *
 * Setup is reused from the existing migration test
 * (uninstall-keeps-register.test.ts): the same makeSandbox() sandbox — HOME /
 * PRDT_HOME / CLAUDE_DIR all under one fresh tmpdir, never the real ~/.prdt or
 * ~/.claude — and the same `audience-mode=developer` seed. The only addition is
 * the pre-fix run: install.sh resolves ROOT as `$(dirname "$0")/..`, so the
 * pinned body runs from a shadow tree inside the sandbox whose other entries
 * point back at the live package (discipline/ is copied, because `cp -R` of a
 * symlinked operand would copy the link).
 */

import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { describe, test, expect } from 'vitest'
import { makeSandbox, hasJq, CORE_ROOT, INSTALL_SH, type InstallSandbox } from '../helpers/install-fixture'

const PRE_FIX = path.join(CORE_ROOT, 'test', 'fixtures', 'pre-t656-install.sh')
const VICTIM_BODY = 'VICTIM — must survive\n'
const MIGRATED = 'audience=developer\n'

/** A package root inside the sandbox whose scripts/install.sh is the pinned
 *  pre-fix body; everything else install.sh reads resolves to the live tree. */
function shadowRootWithPreFix(sb: InstallSandbox): string {
  const shadow = path.join(sb.root, 'pre-fix-core')
  const scripts = path.join(shadow, 'scripts')
  fs.mkdirSync(scripts, { recursive: true })
  for (const name of fs.readdirSync(path.join(CORE_ROOT, 'scripts'))) {
    if (name === 'install.sh') continue
    fs.symlinkSync(path.join(CORE_ROOT, 'scripts', name), path.join(scripts, name))
  }
  fs.copyFileSync(PRE_FIX, path.join(scripts, 'install.sh'))
  fs.cpSync(path.join(CORE_ROOT, 'discipline'), path.join(shadow, 'discipline'), { recursive: true })
  for (const name of ['doctrine.md', 'agents']) {
    fs.symlinkSync(path.join(CORE_ROOT, name), path.join(shadow, name))
  }
  return path.join(scripts, 'install.sh')
}

interface Attack { victim: string; tmpLink: string; register: string }

/** The branch trigger (audience-mode present, no register) + the planted link. */
function plant(sb: InstallSandbox): Attack {
  const victim = path.join(sb.root, 'victim.txt')
  fs.writeFileSync(victim, VICTIM_BODY)
  fs.chmodSync(victim, 0o644)
  fs.writeFileSync(path.join(sb.prdtHome, 'audience-mode'), 'developer\n')
  const tmpLink = path.join(sb.prdtHome, 'register.tmp')
  fs.symlinkSync(victim, tmpLink)
  const register = path.join(sb.prdtHome, 'register')
  expect(fs.existsSync(register)).toBe(false)
  return { victim, tmpLink, register }
}

function run(script: string, sb: InstallSandbox): void {
  execFileSync('bash', [script], { env: sb.env, stdio: 'ignore' })
}

describe.skipIf(!hasJq())('install.sh register migration vs a symlink planted at register.tmp', () => {
  test('pre-fix body follows the link and clobbers the victim', () => {
    const sb = makeSandbox('t656-d4-pre-')
    const a = plant(sb)
    run(shadowRootWithPreFix(sb), sb)
    // the branch ran: the legacy file is consumed
    expect(fs.existsSync(path.join(sb.prdtHome, 'audience-mode'))).toBe(false)
    // …and wrote THROUGH the link: the victim now holds the migrated payload, 0600
    expect(fs.readFileSync(a.victim, 'utf8')).toBe(MIGRATED)
    expect(fs.statSync(a.victim).mode & 0o777).toBe(0o600)
    // `mv` then renamed the link itself into place — register is the attacker's link
    expect(fs.lstatSync(a.register).isSymbolicLink()).toBe(true)
  }, 60_000)

  test('live body leaves the victim untouched and writes register as a regular file', () => {
    const sb = makeSandbox('t656-d4-live-')
    const a = plant(sb)
    run(INSTALL_SH, sb)
    expect(fs.existsSync(path.join(sb.prdtHome, 'audience-mode'))).toBe(false)
    expect(fs.readFileSync(a.victim, 'utf8')).toBe(VICTIM_BODY)
    expect(fs.statSync(a.victim).mode & 0o777).toBe(0o644)
    const st = fs.lstatSync(a.register)
    expect(st.isFile()).toBe(true)
    expect(fs.readFileSync(a.register, 'utf8')).toBe(MIGRATED)
    expect(st.mode & 0o777).toBe(0o600)
    // the planted link is not the live site's name: left where it was, still pointing at the victim
    expect(fs.readlinkSync(a.tmpLink)).toBe(a.victim)
    // no mktemp leftover beside register
    expect(fs.readdirSync(sb.prdtHome).filter(n => /^register\.[A-Za-z0-9]{6}$/.test(n))).toEqual([])
  }, 60_000)
})
