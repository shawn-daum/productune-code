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
 * CLAUDE_DIR (idiom: install-overrides-hook.test.ts).
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

function sandbox() {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-t445-'))
  const home = path.join(sb, 'home')
  const prdtHome = path.join(sb, 'prdt')
  const claudeDir = path.join(sb, 'claude')
  for (const d of [home, prdtHome, claudeDir]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}')
  return { env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claudeDir }, prdtHome, claudeDir }
}

function runInstall(times = 1): { settings: any; prdtHome: string } {
  const { env, prdtHome, claudeDir } = sandbox()
  for (let i = 0; i < times; i++) execFileSync('bash', [INSTALL_SH, '--no-statusline'], { env, stdio: 'ignore' })
  return { settings: JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8')), prdtHome }
}

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
  const { prdtHome } = runInstall()
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
    const commands = commandsOf(runInstall().settings, event, matcher)
    const idx = (needle: string) => commands.findIndex((c) => c.includes(needle))
    expect(idx(first)).toBe(0)
    const positions = INJECT_ORDER.map(idx)
    expect(positions, `missing inject hook in ${event}(${matcher}): ${JSON.stringify(commands)}`)
      .not.toContain(-1)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // project overrides are the LAST command in the whole entry — nothing may
    // render after them, or the precedence contract breaks.
    expect(idx('prdt-project-overrides-inject.sh')).toBe(commands.length - 1)
    expect(commands.length).toBe(5)
  })
}

test.skipIf(!hasJq())('re-running install.sh stays idempotent (single project-overrides entry per matcher)', () => {
  const { settings } = runInstall(2)
  for (const [event, matcher] of [
    ['SessionStart', 'startup|resume|clear'],
    ['SessionStart', 'compact'],
    ['SubagentStart', '^prdt-'],
  ] as const) {
    const dupes = commandsOf(settings, event, matcher).filter((c) => c.includes('prdt-project-overrides-inject.sh'))
    expect(dupes.length, `${event}(${matcher})`).toBe(1)
  }
})
