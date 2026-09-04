/**
 * install.sh registers prdt-dispatch-gate.sh on PreToolUse with the `Agent`
 * matcher — T-490 slice 2.
 *
 * T-445's lesson was that a roster change is itself a defect source: the SoT
 * (hook-manifest.json), the mirror copy, the settings.json registration and the
 * doctor verdict have to move in ONE diff. This file is the install half — it
 * drives the REAL install.sh under a sandboxed HOME/PRDT_HOME/CLAUDE_DIR (never
 * the developer's own, per install-audience-hook.test.ts precedent) via the
 * shared fixture (T-536: installed-state assertions share ONE install for this
 * file; the seeded-pre-state and idempotency tests run their own installs,
 * because their subject is the install RUN) and asserts what the harness will
 * actually read.
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
import { test, expect } from 'vitest'
import { CORE_ROOT, installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GATE = 'prdt-dispatch-gate.sh'
const GOVERNOR = 'prdt-call-governor.sh'

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
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', GATE)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the gate on PreToolUse with the Agent matcher, at the mirrored path', () => {
  const { settings, prdtHome } = installedMachine()
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
  const { settings } = installedMachine()
  const gate = entryFor(settings, GATE)
  const gov = entryFor(settings, GOVERNOR)
  expect(gov).toBeTruthy()
  expect(gov.matcher).toBeUndefined()
  expect(gate).not.toBe(gov)
})

test.skipIf(!hasJq())('pre-existing foreign PreToolUse hooks survive the merge', () => {
  // its own install ON PURPOSE: the subject is an install over a SEEDED pre-state
  const { settings } = freshInstall({
    seedSettings: {
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/opt/someone-else/guard.sh' }] }] },
    },
  })
  const commands = (settings.hooks.PreToolUse as any[])
    .flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string))
  expect(commands).toContain('/opt/someone-else/guard.sh')
  expect(commands.some((c) => c.includes(GATE))).toBe(true)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (one gate entry)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  const commands = (settings.hooks.PreToolUse as any[])
    .flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string))
  expect(commands.filter((c) => c.includes(GATE))).toHaveLength(1)
})
