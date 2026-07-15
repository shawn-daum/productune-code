/**
 * install.sh registers prdt-overrides-inject.sh — T-358.
 *
 * The overrides hook must ride the SAME matcher as prdt-session-start.sh on
 * both SessionStart (startup|resume|clear) and SubagentStart (^prdt-), as a
 * DISTINCT hook command entry within that matcher's `hooks` array — not
 * merged into prdt-session-start.sh's own additionalContext string. It must
 * also be copied into the mirror and be executable, and re-running install.sh
 * must stay idempotent (no duplicate entries).
 *
 * Drives the REAL install.sh end-to-end under a fully sandboxed HOME /
 * PRDT_HOME / CLAUDE_DIR, mirroring the pattern in install-legacy-cleanup.test.ts.
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

function runInstall(): { settings: any; prdtHome: string; claudeDir: string } {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t358-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  execFileSync('bash', [INSTALL_SH], {
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
    stdio: 'ignore',
  })
  return {
    settings: JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8')),
    prdtHome,
    claudeDir,
  }
}

test.skipIf(!hasJq())('mirrors prdt-overrides-inject.sh as an executable file', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', 'prdt-overrides-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  const mode = fs.statSync(script).mode
  expect(mode & 0o111).not.toBe(0) // some execute bit set
})

test.skipIf(!hasJq())('SessionStart: overrides hook rides the SAME matcher block as prdt-session-start.sh, as a distinct entry', () => {
  const { settings } = runInstall()
  const block = (settings.hooks.SessionStart as any[]).find((e) => e.matcher === 'startup|resume|clear')
  const commands = block.hooks.map((h: any) => h.command)
  expect(commands.some((c: string) => c.includes('prdt-session-start.sh'))).toBe(true)
  expect(commands.some((c: string) => c.includes('prdt-overrides-inject.sh'))).toBe(true)
  expect(commands.length).toBe(2) // two distinct entries, not merged into one
})

test.skipIf(!hasJq())('SubagentStart: overrides hook rides the SAME ^prdt- matcher, as a distinct entry', () => {
  const { settings } = runInstall()
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const commands = block.hooks.map((h: any) => h.command)
  expect(commands.some((c: string) => c.includes('prdt-session-start.sh'))).toBe(true)
  expect(commands.some((c: string) => c.includes('prdt-overrides-inject.sh'))).toBe(true)
  expect(commands.length).toBe(2)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (no duplicate hook entries)', () => {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t358-idem-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  const env = { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir }
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const overridesEntries = block.hooks.filter((h: any) => h.command.includes('prdt-overrides-inject.sh'))
  expect(overridesEntries.length).toBe(1)
})
