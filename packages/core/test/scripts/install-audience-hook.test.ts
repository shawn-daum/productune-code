/**
 * install.sh registers prdt-audience-inject.sh — T-326.
 *
 * The audience hook must ride the SAME matcher as prdt-session-start.sh on
 * both SessionStart (startup|resume|clear) and SubagentStart (^prdt-), as a
 * DISTINCT hook command entry (T-358 small-payload pattern), ordered BEFORE
 * prdt-overrides-inject.sh so machine overrides stay last-wins over the
 * audience-mode register block. It must be mirrored executable, and the
 * discipline mirror must carry register/audience-planner.md (the injected body).
 * Re-running install.sh must stay idempotent.
 *
 * Drives the REAL install.sh under a sandboxed HOME / PRDT_HOME / CLAUDE_DIR
 * via the shared fixture (T-536: installed-state assertions share ONE install
 * for this file; only the idempotency test runs its own installs, because its
 * subject is the re-RUN).
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

test.skipIf(!hasJq())('mirrors prdt-audience-inject.sh executable + register/audience-planner.md body', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', 'prdt-audience-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
  // The register bodies ship inside the discipline mirror (cp -R discipline) — T-586.
  for (const b of ['audience-planner.md', 'form-outline.md', 'structure-planner-tables.md']) {
    expect(fs.existsSync(path.join(prdtHome, 'discipline', 'register', b)), b).toBe(true)
  }
})

for (const [event, matcher] of [
  ['SessionStart', 'startup|resume|clear'],
  ['SubagentStart', '^prdt-'],
] as const) {
  test.skipIf(!hasJq())(`${event}: audience hook rides the ${matcher} matcher, between session-start and overrides (overrides last-wins)`, () => {
    const { settings } = installedMachine()
    const block = (settings.hooks[event] as any[]).find((e) => e.matcher === matcher)
    const commands: string[] = block.hooks.map((h: any) => h.command)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx('prdt-audience-inject.sh')).toBeGreaterThan(idx('prdt-session-start.sh'))
    expect(idx('prdt-audience-inject.sh')).toBeLessThan(idx('prdt-overrides-inject.sh'))
    // T-423: prdt-plan-tier-inject.sh joined the same roster (see
    // install-plan-tier-hook.test.ts for its own ordering assertions); T-445:
    // prdt-project-overrides-inject.sh joined it as the new last entry (see
    // install-project-overrides-hook.test.ts).
    expect(commands.length).toBe(16) // T-577: + the eleven discipline part slots prdt-session-start-p2..p12.sh
  })
}

test.skipIf(!hasJq())('re-running install.sh is idempotent (single audience entry)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const entries = block.hooks.filter((h: any) => h.command.includes('prdt-audience-inject.sh'))
  expect(entries.length).toBe(1)
})
