/**
 * install.sh registers prdt-audience-inject.sh — T-326.
 *
 * The audience hook must ride the SAME matcher as prdt-session-start.sh on
 * both SessionStart (startup|resume|clear) and SubagentStart (^prdt-), as a
 * DISTINCT hook command entry (T-358 small-payload pattern), ordered BEFORE
 * prdt-overrides-inject.sh so machine overrides stay last-wins over the
 * audience-mode register block. It must be mirrored executable, and the
 * discipline mirror must carry po/audience-planner.md (the injected body).
 * Re-running install.sh must stay idempotent.
 *
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR,
 * mirroring install-overrides-hook.test.ts.
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
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t326-'))
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

test.skipIf(!hasJq())('mirrors prdt-audience-inject.sh executable + po/audience-planner.md body', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', 'prdt-audience-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
  // The injected body ships inside the discipline mirror (cp -R discipline).
  expect(fs.existsSync(path.join(prdtHome, 'discipline', 'po', 'audience-planner.md'))).toBe(true)
})

for (const [event, matcher] of [
  ['SessionStart', 'startup|resume|clear'],
  ['SubagentStart', '^prdt-'],
] as const) {
  test.skipIf(!hasJq())(`${event}: audience hook rides the ${matcher} matcher, between session-start and overrides (overrides last-wins)`, () => {
    const { settings } = runInstall()
    const block = (settings.hooks[event] as any[]).find((e) => e.matcher === matcher)
    const commands: string[] = block.hooks.map((h: any) => h.command)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx('prdt-audience-inject.sh')).toBeGreaterThan(idx('prdt-session-start.sh'))
    expect(idx('prdt-audience-inject.sh')).toBeLessThan(idx('prdt-overrides-inject.sh'))
    // T-423: prdt-plan-tier-inject.sh joined the same roster (see
    // install-plan-tier-hook.test.ts for its own ordering assertions); T-445:
    // prdt-project-overrides-inject.sh joined it as the new last entry (see
    // install-project-overrides-hook.test.ts).
    expect(commands.length).toBe(5)
  })
}

test.skipIf(!hasJq())('re-running install.sh is idempotent (single audience entry)', () => {
  const { env, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const entries = block.hooks.filter((h: any) => h.command.includes('prdt-audience-inject.sh'))
  expect(entries.length).toBe(1)
})
