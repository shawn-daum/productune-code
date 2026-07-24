/**
 * install.sh registers prdt-auto-open.sh — T-409.
 *
 * Unlike prdt-audience-inject.sh/prdt-plan-tier-inject.sh/prdt-overrides-
 * inject.sh (which ride SessionStart/SubagentStart alongside prdt-session-
 * start.sh), prdt-auto-open.sh rides its OWN PostToolUse registration with
 * matcher "Write" — a distinct event/matcher pair from the existing
 * PostToolUse:Agent entry (prdt-post-dispatch.sh), so both must coexist as
 * separate {matcher, hooks[]} entries under the same "PostToolUse" key. It
 * must be mirrored executable. Re-running install.sh must stay idempotent.
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
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t409-'))
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

test.skipIf(!hasJq())('mirrors prdt-auto-open.sh executable', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', 'prdt-auto-open.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('PostToolUse carries BOTH the pre-existing Agent entry and the new Write entry', () => {
  const { settings } = runInstall()
  const entries = settings.hooks.PostToolUse as any[]
  const agentEntry = entries.find((e) => e.matcher === 'Agent')
  const writeEntry = entries.find((e) => e.matcher === 'Write')
  expect(agentEntry?.hooks?.[0]?.command).toContain('prdt-post-dispatch.sh')
  expect(writeEntry?.hooks?.[0]?.command).toContain('prdt-auto-open.sh')
  expect(entries.length).toBe(2)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (single auto-open entry, single command)', () => {
  const { env, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const entries = (settings.hooks.PostToolUse as any[]).filter((e) => e.matcher === 'Write')
  expect(entries.length).toBe(1)
  expect(entries[0].hooks.length).toBe(1)
})
