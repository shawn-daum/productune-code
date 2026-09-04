/**
 * install.sh registers prdt-project-overrides-inject.sh — T-445 (design §8b).
 *
 * Registration ORDER expresses `canonical < machine override < project override`
 * and these tests assert it inside each matcher's hooks array, not just
 * membership — but it is intent, not enforcement. Measured live on Claude Code
 * 2.1.228 (2026-08-12): hooks sharing a matcher run in PARALLEL and the harness
 * appends their additionalContext in COMPLETION order — a 0.6s sleep planted in
 * the machine hook put its block AFTER the project block with this manifest
 * untouched. What actually settles a conflict is the precedence each payload
 * states in its own text; that text is pinned in
 * project-overrides-inject-hook.test.ts.
 *
 * They also close a gap found while wiring this up (design §8b "발견된 기존 배선
 * 구멍"): SessionStart(matcher: compact) carried ONLY prdt-post-compact.sh, so
 * after a compaction the discipline set came back but audience-mode, plan-tier
 * and the machine overrides did NOT — in a long PO session one compaction
 * silently dropped every machine override. The four small inject hooks now ride
 * the compact matcher too, in the same order as the startup matcher.
 *
 * Drives the REAL install.sh end-to-end under a sandboxed HOME / PRDT_HOME /
 * CLAUDE_DIR via the shared fixture (T-536: installed-state assertions share
 * ONE install for this file; only the idempotency test runs its own installs,
 * because its subject is the re-RUN).
 */

import path from 'path'
import fs from 'fs'
import { test, expect } from 'vitest'
import { installedMachine, freshInstall, hasJq } from '../helpers/install-fixture'

/** The ordered inject roster every discipline matcher must carry, most-general
 *  first, highest-precedence LAST. */
const INJECT_ORDER = [
  'prdt-audience-inject.sh',
  'prdt-plan-tier-inject.sh',
  'prdt-overrides-inject.sh',
  'prdt-project-overrides-inject.sh',
]

function commandsOf(settings: any, event: string, matcher: string): string[] {
  const block = (settings.hooks[event] as any[]).find((e) => e.matcher === matcher)
  expect(block, `${event}(${matcher}) not registered`).toBeTruthy()
  return block.hooks.map((h: any) => h.command)
}

test.skipIf(!hasJq())('mirrors prdt-project-overrides-inject.sh as an executable file', () => {
  const { prdtHome } = installedMachine()
  const script = path.join(prdtHome, 'hooks', 'prdt-project-overrides-inject.sh')
  expect(fs.existsSync(script)).toBe(true)
  expect(fs.statSync(script).mode & 0o111).not.toBe(0)
})

for (const [event, matcher, first] of [
  ['SessionStart', 'startup|resume|clear', 'prdt-session-start.sh'],
  ['SubagentStart', '^prdt-', 'prdt-session-start.sh'],
  // compact re-entry: post-compact.sh IS session-start (thin exec wrapper).
  ['SessionStart', 'compact', 'prdt-post-compact.sh'],
] as const) {
  test.skipIf(!hasJq())(`${event}(${matcher}): discipline block, then inject hooks in precedence order, project LAST`, () => {
    const commands = commandsOf(installedMachine().settings, event, matcher)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx(first)).toBe(0)
    const positions = INJECT_ORDER.map(idx)
    expect(positions, `missing inject hook in ${event}(${matcher}): ${JSON.stringify(commands)}`)
      .not.toContain(-1)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // project overrides are the LAST command in the whole entry — nothing may
    // render after them, or the precedence contract breaks.
    expect(idx('prdt-project-overrides-inject.sh')).toBe(commands.length - 1)
    expect(commands.length).toBe(16) // T-577: + the eleven discipline part slots prdt-session-start-p2..p12.sh
  })
}

test.skipIf(!hasJq())('re-running install.sh stays idempotent (single project-overrides entry per matcher)', () => {
  // its own installs ON PURPOSE: the subject is the second RUN, not the state
  // (keeps this file's historical --no-statusline flag for the re-run pair)
  const { settings } = freshInstall({ times: 2, args: ['--no-statusline'] })
  for (const [event, matcher] of [
    ['SessionStart', 'startup|resume|clear'],
    ['SessionStart', 'compact'],
    ['SubagentStart', '^prdt-'],
  ] as const) {
    const dupes = commandsOf(settings, event, matcher).filter((c) => c.includes('prdt-project-overrides-inject.sh'))
    expect(dupes.length, `${event}(${matcher})`).toBe(1)
  }
})
