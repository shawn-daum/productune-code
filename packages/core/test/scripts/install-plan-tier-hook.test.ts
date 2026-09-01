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
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR
 * via the shared fixture (T-536: installed-state assertions share ONE install
 * for this file; only the idempotency test runs its own installs, because its
 * subject is the re-RUN) — required isolation: a subprocess install.sh run
 * against the real $HOME has broken the developer's own CLI before
 * (install-audience-hook.test.ts precedent).
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

test.skipIf(!hasJq())('mirrors prdt-plan-tier-inject.sh executable', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', 'prdt-plan-tier-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

for (const [event, matcher] of [
  ['SessionStart', 'startup|resume|clear'],
  ['SubagentStart', '^prdt-'],
] as const) {
  test.skipIf(!hasJq())(`${event}: plan-tier hook rides the ${matcher} matcher, between audience and overrides (overrides last-wins)`, () => {
    const { settings } = installedMachine()
    const block = (settings.hooks[event] as any[]).find((e) => e.matcher === matcher)
    const commands: string[] = block.hooks.map((h: any) => h.command)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx('prdt-plan-tier-inject.sh')).toBeGreaterThan(idx('prdt-audience-inject.sh'))
    expect(idx('prdt-plan-tier-inject.sh')).toBeLessThan(idx('prdt-overrides-inject.sh'))
  })
}

test.skipIf(!hasJq())('re-running install.sh is idempotent (single plan-tier entry)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const entries = block.hooks.filter((h: any) => h.command.includes('prdt-plan-tier-inject.sh'))
  expect(entries.length).toBe(1)
})
