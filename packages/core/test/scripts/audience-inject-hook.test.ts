/**
 * prdt-audience-inject.sh — T-326 audience-mode injection (PO conversational
 * register).
 *
 * Contract under test:
 * - PO ONLY: any non-po prdt agent (or no agent) → zero stdout. Worker output
 *   register is out of scope in v1.5; workers are covered via PO relay.
 * - Mode source `$PRDT_HOME/audience-mode`: `developer` → zero stdout
 *   (current register, byte-identical behavior); `planner` OR missing OR
 *   invalid → inject discipline/register/audience-planner.md (default = planner,
 *   PRD v1.5 decision).
 * - Same T-358 wiring as prdt-overrides-inject.sh: its own small hook output,
 *   never part of prdt-session-start.sh's payload — so the main hook must not
 *   carry the audience body, and this hook's output must stay far below the
 *   ~10KB persist-truncation threshold.
 * - Machine overrides still win: the payload says so, and install.sh orders
 *   this hook BEFORE prdt-overrides-inject.sh (asserted in
 *   install-audience-hook.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const AUDIENCE_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-audience-inject.sh')
const SESSION_START_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

// A sentence that exists verbatim in discipline/register/audience-planner.md — the
// marker for "the planner register body reached the context".
const PLANNER_MARKER = 'The person reading you is a product planner, not a developer.'

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/** Minimal ~/.prdt mirror with the REAL audience-planner.md body. */
function makePrdtHome(opts: { mode?: string } = {}): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t326-'))
  const disc = path.join(home, 'discipline')
  fs.mkdirSync(path.join(disc, 'po', 'playbooks'), { recursive: true })
  fs.mkdirSync(path.join(disc, 'register'), { recursive: true })

  fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(disc, 'contracts.md'), '# contracts\n')
  fs.writeFileSync(path.join(disc, 'po', 'habit.md'), '# po habit\n')
  fs.writeFileSync(path.join(disc, 'po', 'playbooks', '_index.md'), '# menu\n')
  fs.copyFileSync(
    path.join(CORE_ROOT, 'discipline', 'register', 'audience-planner.md'),
    path.join(disc, 'register', 'audience-planner.md'),
  )

  if (opts.mode !== undefined) {
    fs.writeFileSync(path.join(home, 'audience-mode'), opts.mode)
  }
  return home
}

function runHook(script: string, prdtHome: string, agentType: string): string {
  const event = { hook_event_name: 'SessionStart', agent_type: agentType, cwd: os.tmpdir() }
  return execFileSync('bash', [script], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: prdtHome },
  })
}

function additionalContextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  return JSON.parse(stdout).hookSpecificOutput.additionalContext as string
}

describe('default = planner (PRD v1.5)', () => {
  test.skipIf(!hasJq())('no audience-mode file → planner body injected for the PO', () => {
    const home = makePrdtHome()
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('audience-mode: planner')
    expect(ctx).toContain(PLANNER_MARKER)
  })

  test.skipIf(!hasJq())('invalid mode value → planner (never crashes, never silent-drops to developer)', () => {
    const home = makePrdtHome({ mode: 'expert\n' })
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain(PLANNER_MARKER)
  })

  test.skipIf(!hasJq())('explicit planner → same injection (whitespace-tolerant)', () => {
    const home = makePrdtHome({ mode: 'planner\n' })
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx).toContain(PLANNER_MARKER)
  })
})

describe('developer mode = current behavior, unchanged', () => {
  test.skipIf(!hasJq())('developer → hook emits nothing at all', () => {
    const home = makePrdtHome({ mode: 'developer\n' })
    expect(runHook(AUDIENCE_HOOK, home, 'prdt-po')).toBe('')
  })
})

describe('PO-only scope (T-326: conversational output of the PO)', () => {
  for (const worker of ['prdt-designer', 'prdt-developer', 'prdt-qa']) {
    test.skipIf(!hasJq())(`${worker} → nothing, even in planner mode`, () => {
      const home = makePrdtHome({ mode: 'planner\n' })
      expect(runHook(AUDIENCE_HOOK, home, worker)).toBe('')
    })
  }

  test.skipIf(!hasJq())('plain session (no agent) → nothing', () => {
    const home = makePrdtHome({ mode: 'planner\n' })
    expect(runHook(AUDIENCE_HOOK, home, '')).toBe('')
  })
})

describe('T-358 channel separation', () => {
  test.skipIf(!hasJq())('main session-start payload does NOT carry the audience body', () => {
    const home = makePrdtHome({ mode: 'planner\n' })
    const mainCtx = additionalContextOf(runHook(SESSION_START_HOOK, home, 'prdt-po'))
    expect(mainCtx).not.toContain(PLANNER_MARKER)
    expect(mainCtx).not.toContain('BEGIN audience-planner')
  })

  test.skipIf(!hasJq())('audience hook output stays far below the ~10KB persist threshold', () => {
    const home = makePrdtHome({ mode: 'planner\n' })
    const ctx = additionalContextOf(runHook(AUDIENCE_HOOK, home, 'prdt-po'))
    expect(ctx.length).toBeGreaterThan(0)
    expect(ctx.length).toBeLessThan(4000)
  })

  test.skipIf(!hasJq())('stale mirror without audience-planner.md → degrades silently (no broken JSON)', () => {
    const home = makePrdtHome({ mode: 'planner\n' })
    fs.rmSync(path.join(home, 'discipline', 'register', 'audience-planner.md'))
    expect(runHook(AUDIENCE_HOOK, home, 'prdt-po')).toBe('')
  })
})
