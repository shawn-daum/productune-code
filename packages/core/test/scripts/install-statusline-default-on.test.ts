/**
 * install.sh statusline default-on — T-330.
 *
 * Repro: install.sh only registered the statusline behind an opt-in
 * `--statusline` flag, so a fresh install on a second machine (run without the
 * flag, because the user didn't know it existed) ended up with no statusline
 * at all. Fixed by registering the statusline by default when nothing is
 * registered yet, while never clobbering an existing statusLine (ours or a
 * custom one) and offering an explicit `--no-statusline` opt-out.
 *
 * Drives the REAL install.sh end-to-end under a fully sandboxed HOME / PRDT_HOME
 * / CLAUDE_DIR (the developer's real ~/.claude / ~/.prdt are never touched).
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

/** Run install.sh in a throwaway sandbox, optionally seeding settings.json and passing args. */
function runInstall(settings: unknown | undefined, args: string[] = []): any {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t330-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  if (settings !== undefined) {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2))
  }
  execFileSync('bash', [INSTALL_SH, ...args], {
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir },
    stdio: 'ignore',
  })
  return {
    settings: JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8')),
    env: fs.readFileSync(path.join(prdtHome, 'prdt.env'), 'utf8'),
  }
}

test.skipIf(!hasJq())('fresh install (no settings.json, no flags) registers the statusline by default', () => {
  const { settings, env } = runInstall(undefined)
  expect(settings.statusLine?.command).toContain('statusline-prdt.sh')
  expect(env).toContain('PRDT_STATUSLINE_INSTALLED=true')
})

test.skipIf(!hasJq())('fresh install with an empty settings.json registers the statusline by default', () => {
  const { settings } = runInstall({})
  expect(settings.statusLine?.command).toContain('statusline-prdt.sh')
})

test.skipIf(!hasJq())('--no-statusline opts out even on a fresh install', () => {
  const { settings, env } = runInstall(undefined, ['--no-statusline'])
  expect(settings.statusLine).toBeUndefined()
  expect(env).toContain('PRDT_STATUSLINE_INSTALLED=false')
})

test.skipIf(!hasJq())('an existing custom statusLine is preserved without any flag (no clobber)', () => {
  const { settings } = runInstall({ statusLine: { type: 'command', command: '/Users/me/mystatusline.sh' } })
  expect(settings.statusLine?.command).toBe('/Users/me/mystatusline.sh')
})

test.skipIf(!hasJq())('--statusline still force-registers ours over an existing custom statusLine', () => {
  const { settings } = runInstall(
    { statusLine: { type: 'command', command: '/Users/me/mystatusline.sh' } },
    ['--statusline'],
  )
  expect(settings.statusLine?.command).toContain('statusline-prdt.sh')
})
