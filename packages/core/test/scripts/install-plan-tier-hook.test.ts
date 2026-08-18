/**
 * install.sh registers prdt-plan-tier-inject.sh — T-423.
 *
 * The plan-tier hook must ride the SAME matcher as prdt-session-start.sh on
 * both SessionStart (startup|resume|clear) and SubagentStart (^prdt-), as a
 * DISTINCT hook command entry (T-358 small-payload pattern), ordered AFTER
 * prdt-audience-inject.sh and BEFORE prdt-overrides-inject.sh so machine
 * overrides stay last-wins over the plan-tier register block. It must be
 * mirrored executable. Re-running install.sh must stay idempotent.
 *
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR,
 * mirroring install-audience-hook.test.ts (T-326 precedent) — required
 * isolation: a subprocess install.sh run against the real $HOME has broken the
 * developer's own CLI before (install-audience-hook.test.ts:36 precedent).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function sandbox(): { env: NodeJS.ProcessEnv; prdtHome: string; claudeDir: string } {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t423-'))
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

test.skipIf(!hasJq())('mirrors prdt-plan-tier-inject.sh executable', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', 'prdt-plan-tier-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

for (const [event, matcher] of [
  ['SessionStart', 'startup|resume|clear'],
  ['SubagentStart', '^prdt-'],
] as const) {
  test.skipIf(!hasJq())(`${event}: plan-tier hook rides the ${matcher} matcher, between audience and overrides (overrides last-wins)`, () => {
    const { settings } = runInstall()
    const block = (settings.hooks[event] as any[]).find((e) => e.matcher === matcher)
    const commands: string[] = block.hooks.map((h: any) => h.command)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx('prdt-plan-tier-inject.sh')).toBeGreaterThan(idx('prdt-audience-inject.sh'))
    expect(idx('prdt-plan-tier-inject.sh')).toBeLessThan(idx('prdt-overrides-inject.sh'))
  })
}

test.skipIf(!hasJq())('re-running install.sh is idempotent (single plan-tier entry)', () => {
  const { env, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const entries = block.hooks.filter((h: any) => h.command.includes('prdt-plan-tier-inject.sh'))
  expect(entries.length).toBe(1)
})
