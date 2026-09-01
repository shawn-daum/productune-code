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
 * PRDT_HOME / CLAUDE_DIR via the shared fixture (T-536: installed-state
 * assertions share ONE install for this file; only the idempotency test runs
 * its own installs, because its subject is the re-RUN).
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

test.skipIf(!hasJq())('mirrors prdt-overrides-inject.sh as an executable file', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', 'prdt-overrides-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  const mode = fs.statSync(script).mode
  expect(mode & 0o111).not.toBe(0) // some execute bit set
})

test.skipIf(!hasJq())('SessionStart: overrides hook rides the SAME matcher block as prdt-session-start.sh, as a distinct entry', () => {
  const { settings } = installedMachine()
  const block = (settings.hooks.SessionStart as any[]).find((e) => e.matcher === 'startup|resume|clear')
  const commands = block.hooks.map((h: any) => h.command)
  expect(commands.some((c: string) => c.includes('prdt-session-start.sh'))).toBe(true)
  expect(commands.some((c: string) => c.includes('prdt-overrides-inject.sh'))).toBe(true)
  expect(commands.length).toBe(5) // distinct entries, not merged into one (+ audience T-326, + plan-tier T-423, + project overrides T-445)
})

test.skipIf(!hasJq())('SubagentStart: overrides hook rides the SAME ^prdt- matcher, as a distinct entry', () => {
  const { settings } = installedMachine()
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const commands = block.hooks.map((h: any) => h.command)
  expect(commands.some((c: string) => c.includes('prdt-session-start.sh'))).toBe(true)
  expect(commands.some((c: string) => c.includes('prdt-overrides-inject.sh'))).toBe(true)
  expect(commands.length).toBe(5) // + audience (T-326) + plan-tier (T-423) + project overrides (T-445)
})

test.skipIf(!hasJq())('re-running install.sh is idempotent (no duplicate hook entries)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  const { settings } = freshInstall({ times: 2 })
  const block = (settings.hooks.SubagentStart as any[]).find((e) => e.matcher === '^prdt-')
  const overridesEntries = block.hooks.filter((h: any) => h.command.includes('prdt-overrides-inject.sh'))
  expect(overridesEntries.length).toBe(1)
})
