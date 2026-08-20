/**
 * install.sh registers prdt-call-governor.sh on BOTH of its events — T-491 S1.
 *
 * T-445's lesson was that a roster change is itself a defect source: the SoT
 * (hook-manifest.json), the mirror copy, the settings.json registration and the
 * doctor verdict have to move in one diff. This file is the install half of
 * that — it drives the REAL install.sh under a sandboxed HOME/PRDT_HOME/
 * CLAUDE_DIR (never the developer's own, per install-audience-hook.test.ts:36)
 * and asserts what the harness will actually read.
 *
 * The PreToolUse + PostToolBatch pair is ATOMIC: PostToolBatch counts the API
 * turns, PreToolUse enforces the count. Registering only the enforcer leaves it
 * reading a counter nothing increments — silent non-enforcement, which looks
 * exactly like a governor that is working.
 *
 * Both registrations are deliberately MATCHER-LESS: a tool matcher would make
 * the turn count depend on which tools a worker happened to reach for.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GOVERNOR = 'prdt-call-governor.sh'
const EVENTS = ['PreToolUse', 'PostToolBatch'] as const

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function sandbox(): { env: NodeJS.ProcessEnv; prdtHome: string; claudeDir: string } {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t491-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  return { env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir }, prdtHome, claudeDir }
}

function runInstall(): { settings: any; prdtHome: string } {
  const { env, prdtHome, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  return { settings: JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8')), prdtHome }
}

function commandsFor(settings: any, event: string): string[] {
  return (settings.hooks?.[event] ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => h.command as string))
}

test('the manifest — the SoT both derivations reduce over — carries the governor', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(GOVERNOR)
  for (const event of EVENTS) {
    const reg = manifest.registrations.find((r: any) => r.event === event)
    expect(reg, `${event} registration missing from hook-manifest.json`).toBeTruthy()
    expect(reg.hooks).toContain(GOVERNOR)
    expect(reg.matcher, `${event} must stay matcher-less`).toBeUndefined()
  }
})

test.skipIf(!hasJq())('mirrors prdt-call-governor.sh executable', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', GOVERNOR)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the counting half AND the enforcing half — the pair is atomic', () => {
  const { settings, prdtHome } = runInstall()
  for (const event of EVENTS) {
    const commands = commandsFor(settings, event)
    expect(commands.some((c) => c.includes(GOVERNOR)), `${event} not registered`).toBe(true)
    // registered command must be the mirrored, executable file — never a path
    // that only exists in the repo checkout
    const registered = commands.find((c) => c.includes(GOVERNOR))!.replace(/"/g, '')
    expect(registered).toBe(path.join(prdtHome, 'hooks', GOVERNOR))
    expect(fs.existsSync(registered)).toBe(true)
  }
})

test.skipIf(!hasJq())('the governor entries carry no matcher (every tool is counted)', () => {
  const { settings } = runInstall()
  for (const event of EVENTS) {
    const entry = (settings.hooks[event] as any[]).find((e) =>
      (e.hooks ?? []).some((h: any) => (h.command as string).includes(GOVERNOR)))
    expect(entry.matcher).toBeUndefined()
  }
})

test.skipIf(!hasJq())('pre-existing foreign PreToolUse hooks survive the merge', () => {
  const { env, claudeDir } = sandbox()
  const settingsPath = path.join(claudeDir, 'settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/opt/someone-else/guard.sh' }] }] },
  }))
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  const commands = commandsFor(settings, 'PreToolUse')
  expect(commands).toContain('/opt/someone-else/guard.sh')
  expect(commands.some((c) => c.includes(GOVERNOR))).toBe(true)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (one governor entry per event)', () => {
  const { env, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  for (const event of EVENTS) {
    expect(commandsFor(settings, event).filter((c) => c.includes(GOVERNOR))).toHaveLength(1)
  }
})
