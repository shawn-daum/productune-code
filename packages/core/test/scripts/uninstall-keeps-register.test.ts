/**
 * uninstall.sh keep-list + install.sh audience-mode absorption — T-586.
 *
 * - A non-purge uninstall keeps the operator's own state: `register` (the PO's
 *   conversational register) alongside overrides/, wiki/ and prdt.env — without
 *   this, a reinstall silently reset the operator's tone. `--purge` removes it.
 * - install.sh migrates a legacy `~/.prdt/audience-mode` ONCE into `register`
 *   (`audience=<value>`) and removes the old file; an existing register wins;
 *   an off-domain legacy value is dropped, not carried.
 *
 * Drives the REAL install.sh / uninstall.sh under a sandboxed HOME / PRDT_HOME /
 * CLAUDE_DIR (T-536 fresh lane — the subject here is the run itself).
 */

import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { makeSandbox, runInstall, hasJq, CORE_ROOT } from '../helpers/install-fixture'

const UNINSTALL_SH = path.join(CORE_ROOT, 'scripts', 'uninstall.sh')

function runUninstall(sb: ReturnType<typeof makeSandbox>, args: string[] = []): string {
  return execFileSync('bash', [UNINSTALL_SH, ...args], { env: sb.env, encoding: 'utf8' })
}

describe.skipIf(!hasJq())('uninstall keep-list', () => {
  test('non-purge uninstall keeps register (+ overrides/, wiki/, prdt.env) and removes the mirror', () => {
    const sb = makeSandbox('t586-uninstall-')
    runInstall(sb)
    fs.writeFileSync(path.join(sb.prdtHome, 'register'), 'form=outline\naddress=션님\n')
    fs.writeFileSync(path.join(sb.prdtHome, 'overrides', 'po.md'), '# po\n')
    const out = runUninstall(sb)
    expect(out).toContain('keeping overrides/ + wiki/ + register + prdt.env')
    expect(fs.readFileSync(path.join(sb.prdtHome, 'register'), 'utf8')).toBe('form=outline\naddress=션님\n')
    expect(fs.existsSync(path.join(sb.prdtHome, 'overrides', 'po.md'))).toBe(true)
    expect(fs.existsSync(path.join(sb.prdtHome, 'wiki'))).toBe(true)
    expect(fs.existsSync(path.join(sb.prdtHome, 'prdt.env'))).toBe(true)
    expect(fs.existsSync(path.join(sb.prdtHome, 'discipline'))).toBe(false)
    expect(fs.existsSync(path.join(sb.prdtHome, 'hooks'))).toBe(false)
  }, 60_000)

  test('--purge removes register too', () => {
    const sb = makeSandbox('t586-purge-')
    runInstall(sb)
    fs.writeFileSync(path.join(sb.prdtHome, 'register'), 'form=outline\n')
    runUninstall(sb, ['--purge'])
    expect(fs.existsSync(sb.prdtHome)).toBe(false)
  }, 60_000)

  test('a reinstall after a non-purge uninstall sees the same register', () => {
    const sb = makeSandbox('t586-reinstall-')
    runInstall(sb)
    fs.writeFileSync(path.join(sb.prdtHome, 'register'), 'structure=planner-tables\n')
    runUninstall(sb)
    runInstall(sb)
    expect(fs.readFileSync(path.join(sb.prdtHome, 'register'), 'utf8')).toBe('structure=planner-tables\n')
  }, 60_000)
})

describe.skipIf(!hasJq())('install.sh absorbs the legacy audience-mode file into register', () => {
  test('audience-mode=developer, no register → register carries audience=developer, old file gone', () => {
    const sb = makeSandbox('t586-migrate-')
    fs.writeFileSync(path.join(sb.prdtHome, 'audience-mode'), 'developer\n')
    runInstall(sb)
    expect(fs.readFileSync(path.join(sb.prdtHome, 'register'), 'utf8')).toBe('audience=developer\n')
    expect(fs.existsSync(path.join(sb.prdtHome, 'audience-mode'))).toBe(false)
  }, 60_000)
  test('an existing register wins; the legacy file is still removed', () => {
    const sb = makeSandbox('t586-migrate-keep-')
    fs.writeFileSync(path.join(sb.prdtHome, 'audience-mode'), 'developer\n')
    fs.writeFileSync(path.join(sb.prdtHome, 'register'), 'audience=planner\nform=outline\n')
    runInstall(sb)
    expect(fs.readFileSync(path.join(sb.prdtHome, 'register'), 'utf8')).toBe('audience=planner\nform=outline\n')
    expect(fs.existsSync(path.join(sb.prdtHome, 'audience-mode'))).toBe(false)
  }, 60_000)
  test('an off-domain legacy value is dropped, never carried into the register', () => {
    const sb = makeSandbox('t586-migrate-bad-')
    fs.writeFileSync(path.join(sb.prdtHome, 'audience-mode'), 'expert\n')
    runInstall(sb)
    expect(fs.existsSync(path.join(sb.prdtHome, 'register'))).toBe(false)
    expect(fs.existsSync(path.join(sb.prdtHome, 'audience-mode'))).toBe(false)
  }, 60_000)
  test('a machine with neither file gets neither (no empty register is created)', () => {
    const sb = makeSandbox('t586-migrate-none-')
    runInstall(sb)
    expect(fs.existsSync(path.join(sb.prdtHome, 'register'))).toBe(false)
  }, 60_000)
})
