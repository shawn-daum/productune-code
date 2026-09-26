/**
 * install.sh registers prdt-return-check.sh on SubagentStop with the `^prdt-`
 * matcher — T-553, the worker return-envelope gate.
 *
 * T-445's lesson: a roster change is itself a defect source — the SoT
 * (hook-manifest.json), the mirror copy and the settings.json registration must
 * move in ONE diff. This file is the install half, driving the REAL install.sh
 * under a sandboxed HOME/PRDT_HOME/CLAUDE_DIR via the shared fixture (T-536).
 *
 * The point of interest is COHABITATION on SubagentStop: prdt-post-dispatch.sh
 * (state recording, prints nothing) and prdt-return-check.sh (the gate, prints
 * `decision:block` once) share the entry and run in parallel. A machine that has
 * never run this installer has neither the new basename nor the moved detector —
 * its mirrored prdt-post-dispatch.sh still carries the advisory-only detector, so
 * it degrades to the pre-gate behaviour, never to silence.
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { CORE_ROOT, installedMachine, hasJq } from '../helpers/install-fixture'

const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const CHECK = 'prdt-return-check.sh'
const STATE = 'prdt-post-dispatch.sh'

function entryFor(settings: any, basename: string): any {
  return (settings.hooks?.SubagentStop ?? []).find((e: any) =>
    (e.hooks ?? []).some((h: any) => (h.command as string).includes(basename)))
}

test('the manifest — the SoT both derivations reduce over — carries the gate on SubagentStop ^prdt-', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  expect(manifest.basenames).toContain(CHECK)
  const regs = manifest.registrations.filter((r: any) => (r.hooks ?? []).includes(CHECK))
  // T-688 개정 1: the gate judges what the PO receives — a SubagentHandback
  // `message` at PreToolUse (delivered at call time, unrepeatable), and
  // `last_assistant_message` at SubagentStop for a worker that did not hand back.
  expect(regs.map((r: any) => r.event).sort(), 'the gate reads the handback at PreToolUse and last_assistant_message at SubagentStop — nothing else')
    .toEqual(['PreToolUse', 'SubagentStop'])
  const stop = regs.find((r: any) => r.event === 'SubagentStop')
  expect(stop.matcher).toBe('^prdt-')
  expect(stop.hooks, 'state recorder and gate share the one SubagentStop entry').toContain(STATE)
  const pre = regs.find((r: any) => r.event === 'PreToolUse')
  expect(pre.matcher, 'the PreToolUse half is matched to the one tool that delivers a return').toBe('SubagentHandback')
  expect(pre.hooks).toEqual([CHECK])
})

test.skipIf(!hasJq())('mirrors prdt-return-check.sh executable', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', CHECK)
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

test.skipIf(!hasJq())('registers the gate on SubagentStop ^prdt- at the mirrored path, next to the state hook', () => {
  const { settings, prdtHome } = installedMachine()
  const entry = entryFor(settings, CHECK)
  expect(entry, 'gate not registered on SubagentStop').toBeTruthy()
  expect(entry.matcher).toBe('^prdt-')
  const commands = (entry.hooks as any[]).map((h) => (h.command as string).replace(/"/g, ''))
  expect(commands).toContain(path.join(prdtHome, 'hooks', CHECK))
  expect(commands).toContain(path.join(prdtHome, 'hooks', STATE))
  for (const c of commands) expect(fs.existsSync(c), `registered but not mirrored: ${c}`).toBe(true)
  // the only other event that registers the gate is PreToolUse, matched to SubagentHandback (T-688 개정 1)
  for (const [ev, entries] of Object.entries(settings.hooks as Record<string, any[]>)) {
    if (ev === 'SubagentStop') continue
    for (const e of entries) for (const h of e.hooks ?? []) {
      if (ev === 'PreToolUse' && e.matcher === 'SubagentHandback') continue
      expect(h.command, `${ev}/${e.matcher}: the gate belongs on SubagentStop and PreToolUse/SubagentHandback only`).not.toContain(CHECK)
    }
  }
  const pre = (settings.hooks?.PreToolUse ?? []).find((e: any) => e.matcher === 'SubagentHandback')
  expect(pre, 'gate not registered on PreToolUse/SubagentHandback').toBeTruthy()
  expect((pre.hooks as any[]).map((h) => (h.command as string).replace(/"/g, ''))).toEqual([path.join(prdtHome, 'hooks', CHECK)])
})
