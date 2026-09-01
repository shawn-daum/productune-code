/**
 * install.sh registers prdt-call-governor.sh on BOTH of its events — T-491 S1.
 *
 * T-445's lesson was that a roster change is itself a defect source: the SoT
 * (hook-manifest.json), the mirror copy, the settings.json registration and the
 * doctor verdict have to move in one diff. This file is the install half of
 * that — it drives the REAL install.sh under a sandboxed HOME/PRDT_HOME/
 * CLAUDE_DIR (never the developer's own, per install-audience-hook.test.ts
 * precedent) via the shared fixture (T-536: installed-state assertions share
 * ONE install for this file; the seeded-pre-state and idempotency tests run
 * their own installs, because their subject is the install RUN) and asserts
 * what the harness will actually read.
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
import { test, expect } from 'vitest'
import { CORE_ROOT, installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const GOVERNOR = 'prdt-call-governor.sh'
const EVENTS = ['PreToolUse', 'PostToolBatch'] as const

function commandsFor(settings: any, event: string): string[] {
  return (settings.hooks?.[event] ?? []).flatMap((e: any) => (e.hooks ?? []).map((h: any) => h.command as string))
}

test('the manifest — the SoT both derivations reduce over — carries the governor', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(GOVERNOR)
  for (const event of EVENTS) {
    // Select by HOOK, not by event alone: since T-490 the PreToolUse event also
    // carries prdt-dispatch-gate.sh (matcher `Agent`), so a find-by-event would
    // start asserting the wrong entry's matcher the moment the array is reordered.
    const reg = manifest.registrations.find(
      (r: any) => r.event === event && (r.hooks ?? []).includes(GOVERNOR))
    expect(reg, `${event} registration missing from hook-manifest.json`).toBeTruthy()
    expect(reg.hooks).toContain(GOVERNOR)
    expect(reg.matcher, `${event} must stay matcher-less`).toBeUndefined()
  }
})

test.skipIf(!hasJq())('mirrors prdt-call-governor.sh executable', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', GOVERNOR)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the counting half AND the enforcing half — the pair is atomic', () => {
  const { settings, prdtHome } = installedMachine()
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
  const { settings } = installedMachine()
  for (const event of EVENTS) {
    const entry = (settings.hooks[event] as any[]).find((e) =>
      (e.hooks ?? []).some((h: any) => (h.command as string).includes(GOVERNOR)))
    expect(entry.matcher).toBeUndefined()
  }
})

test.skipIf(!hasJq())('pre-existing foreign PreToolUse hooks survive the merge', () => {
  // its own install ON PURPOSE: the subject is an install over a SEEDED pre-state
  const { settings } = freshInstall({
    seedSettings: {
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/opt/someone-else/guard.sh' }] }] },
    },
  })
  const commands = commandsFor(settings, 'PreToolUse')
  expect(commands).toContain('/opt/someone-else/guard.sh')
  expect(commands.some((c) => c.includes(GOVERNOR))).toBe(true)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (one governor entry per event)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  for (const event of EVENTS) {
    expect(commandsFor(settings, event).filter((c) => c.includes(GOVERNOR))).toHaveLength(1)
  }
})
