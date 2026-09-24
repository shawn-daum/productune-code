/**
 * install.sh registers prdt-secret-guard.sh on PreToolUse with the `Read|Bash`
 * matcher — T-677 slice S3.
 *
 * Same T-445 lesson install-dispatch-gate-hook.test.ts already documents: a
 * roster change is itself a defect source, so the SoT (hook-manifest.json),
 * the mirror copy, and the settings.json registration have to move in ONE
 * diff and be asserted against the REAL install.sh, not a hand-typed
 * "expected" literal. This file is the install half for the new hook — it
 * drives install.sh under a sandboxed HOME/PRDT_HOME/CLAUDE_DIR (never the
 * developer's own) via the shared fixture (T-536: installed-state assertions
 * share ONE install for this file; the idempotency test runs its own install,
 * because its subject is the install RUN).
 *
 * The point of interest here is COHABITATION, same as the gate's file:
 * PreToolUse now carries THREE prdt hooks whose registrations are not
 * interchangeable —
 *   prdt-call-governor.sh  matcher-less (T-491, counts turns across all tools)
 *   prdt-dispatch-gate.sh  matcher `Agent` (T-490, only the Agent tool carries
 *                          a dispatch prompt to parse)
 *   prdt-secret-guard.sh   matcher `Read|Bash` (T-677 — the two tool shapes
 *                          that can print a credential file's bytes to the
 *                          screen and into the session record; `Edit`/`Write`/
 *                          `Grep` never reach it, so writing a target file is
 *                          never denied by matcher alone)
 * so all three are asserted here, not only the new one.
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { CORE_ROOT, installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GUARD = 'prdt-secret-guard.sh'
const GATE = 'prdt-dispatch-gate.sh'
const GOVERNOR = 'prdt-call-governor.sh'

/** The settings.json PreToolUse entry that registers `basename`, if any. */
function entryFor(settings: any, basename: string): any {
  return (settings.hooks?.PreToolUse ?? []).find((e: any) =>
    (e.hooks ?? []).some((h: any) => (h.command as string).includes(basename)))
}

test('the manifest — the SoT both derivations reduce over — carries the guard', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(GUARD)
  const reg = manifest.registrations.find(
    (r: any) => r.event === 'PreToolUse' && (r.hooks ?? []).includes(GUARD))
  expect(reg, 'PreToolUse/Read|Bash registration missing from hook-manifest.json').toBeTruthy()
  expect(reg.matcher, 'the guard must stay matched to Read|Bash — matcher-less would also gate Edit/Write/Grep')
    .toBe('Read|Bash')
})

test('the guard, the gate and the governor share PreToolUse as THREE separate, differently-matched entries', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const pre = manifest.registrations.filter((r: any) => r.event === 'PreToolUse')
  const guard = pre.find((r: any) => (r.hooks ?? []).includes(GUARD))
  const gate = pre.find((r: any) => (r.hooks ?? []).includes(GATE))
  const gov = pre.find((r: any) => (r.hooks ?? []).includes(GOVERNOR))
  expect(guard).not.toBe(gate)
  expect(guard).not.toBe(gov)
  expect(guard.hooks).not.toContain(GATE)
  expect(guard.hooks).not.toContain(GOVERNOR)
  expect(gov.matcher, 'the governor must stay matcher-less — it counts turns across all tools')
    .toBeUndefined()
  expect(gate.matcher).toBe('Agent')
})

test.skipIf(!hasJq())('mirrors prdt-secret-guard.sh executable', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', GUARD)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the guard on PreToolUse with the Read|Bash matcher, at the mirrored path', () => {
  const { settings, prdtHome } = installedMachine()
  const entry = entryFor(settings, GUARD)
  expect(entry, 'guard not registered on PreToolUse').toBeTruthy()
  expect(entry.matcher).toBe('Read|Bash')
  // the registered command must be the mirrored, executable file — never a path
  // that only exists in the repo checkout
  const registered = (entry.hooks[0].command as string).replace(/"/g, '')
  expect(registered).toBe(path.join(prdtHome, 'hooks', GUARD))
  expect(fs.existsSync(registered)).toBe(true)
})

test.skipIf(!hasJq())('the gate and governor keep their own entries alongside the guard', () => {
  const { settings } = installedMachine()
  const guard = entryFor(settings, GUARD)
  const gate = entryFor(settings, GATE)
  const gov = entryFor(settings, GOVERNOR)
  expect(gate).toBeTruthy()
  expect(gov).toBeTruthy()
  expect(gate.matcher).toBe('Agent')
  expect(gov.matcher).toBeUndefined()
  expect(guard).not.toBe(gate)
  expect(guard).not.toBe(gov)
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
  expect(commands.some((c) => c.includes(GUARD))).toBe(true)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (one guard entry)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  const commands = (settings.hooks.PreToolUse as any[])
    .flatMap((e) => (e.hooks ?? []).map((h: any) => h.command as string))
  expect(commands.filter((c) => c.includes(GUARD))).toHaveLength(1)
})
