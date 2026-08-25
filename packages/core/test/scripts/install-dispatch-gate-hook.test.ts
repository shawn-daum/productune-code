/**
 * install.sh registers prdt-dispatch-gate.sh on PreToolUse with the `Agent`
 * matcher — T-490 slice 2.
 *
 * T-445's lesson was that a roster change is itself a defect source: the SoT
 * (hook-manifest.json), the mirror copy, the settings.json registration and the
 * doctor verdict have to move in ONE diff. This file is the install half — it
 * drives the REAL install.sh under a sandboxed HOME/PRDT_HOME/CLAUDE_DIR (never
 * the developer's own, per install-audience-hook.test.ts:36) and asserts what
 * the harness will actually read.
 *
 * The point of interest here is COHABITATION: PreToolUse now carries two prdt
 * hooks whose registrations are not interchangeable —
 *   prdt-call-governor.sh  matcher-less, so the API-turn count cannot depend on
 *                          which tools a worker happened to reach for (T-491);
 *   prdt-dispatch-gate.sh  matched to `Agent`, because it parses a dispatch
 *                          prompt, which only the Agent tool has. The matcher is
 *                          also what keeps it off SendMessage — a resumed worker
 *                          carries no `[ctx]` line by design, so a matcher-less
 *                          gate would deny every resume.
 * Swapping either one's matcher silently breaks the other's contract, which is
 * why both are asserted here rather than only the new one.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const INSTALL_SH = path.join(CORE_ROOT, 'scripts', 'install.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GATE = 'prdt-dispatch-gate.sh'
const GOVERNOR = 'prdt-call-governor.sh'

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function sandbox(): { env: NodeJS.ProcessEnv; prdtHome: string; claudeDir: string } {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t490-'))
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

/** The settings.json PreToolUse entry that registers `basename`, if any. */
function entryFor(settings: any, basename: string): any {
  return (settings.hooks?.PreToolUse ?? []).find((e: any) =>
    (e.hooks ?? []).some((h: any) => (h.command as string).includes(basename)))
}

test('the manifest — the SoT both derivations reduce over — carries the gate', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(GATE)
  const reg = manifest.registrations.find(
    (r: any) => r.event === 'PreToolUse' && (r.hooks ?? []).includes(GATE))
  expect(reg, 'PreToolUse/Agent registration missing from hook-manifest.json').toBeTruthy()
  expect(reg.matcher, 'the gate must stay matched to Agent — matcher-less would deny every resume')
    .toBe('Agent')
})

test('the gate and the governor share PreToolUse as SEPARATE, differently-matched entries', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const pre = manifest.registrations.filter((r: any) => r.event === 'PreToolUse')
  const gate = pre.find((r: any) => (r.hooks ?? []).includes(GATE))
  const gov = pre.find((r: any) => (r.hooks ?? []).includes(GOVERNOR))
  expect(gate).not.toBe(gov)
  expect(gate.hooks).not.toContain(GOVERNOR)
  expect(gov.matcher, 'the governor must stay matcher-less — it counts turns across all tools')
    .toBeUndefined()
})

test.skipIf(!hasJq())('mirrors prdt-dispatch-gate.sh executable', () => {
  const { prdtHome } = runInstall()
  const script = path.join(prdtHome, 'hooks', GATE)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the gate on PreToolUse with the Agent matcher, at the mirrored path', () => {
  const { settings, prdtHome } = runInstall()
  const entry = entryFor(settings, GATE)
  expect(entry, 'gate not registered on PreToolUse').toBeTruthy()
  expect(entry.matcher).toBe('Agent')
  // the registered command must be the mirrored, executable file — never a path
  // that only exists in the repo checkout
  const registered = (entry.hooks[0].command as string).replace(/"/g, '')
  expect(registered).toBe(path.join(prdtHome, 'hooks', GATE))
  expect(fs.existsSync(registered)).toBe(true)
})

test.skipIf(!hasJq())('the governor keeps its matcher-less entry alongside the gate', () => {
  const { settings } = runInstall()
  const gate = entryFor(settings, GATE)
  const gov = entryFor(settings, GOVERNOR)
  expect(gov).toBeTruthy()
  expect(gov.matcher).toBeUndefined()
  expect(gate).not.toBe(gov)
})

test.skipIf(!hasJq())('pre-existing foreign PreToolUse hooks survive the merge', () => {
  const { env, claudeDir } = sandbox()
  const settingsPath = path.join(claudeDir, 'settings.json')
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/opt/someone-else/guard.sh' }] }] },
  }))
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  const commands = (settings.hooks.PreToolUse as any[])
    .flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string))
  expect(commands).toContain('/opt/someone-else/guard.sh')
  expect(commands.some((c) => c.includes(GATE))).toBe(true)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (one gate entry)', () => {
  const { env, claudeDir } = sandbox()
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  execFileSync('bash', [INSTALL_SH], { env, stdio: 'ignore' })
  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'))
  const commands = (settings.hooks.PreToolUse as any[])
    .flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string))
  expect(commands.filter((c) => c.includes(GATE))).toHaveLength(1)
})
