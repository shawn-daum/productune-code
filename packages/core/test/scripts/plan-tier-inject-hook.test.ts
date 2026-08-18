/**
 * prdt-plan-tier-inject.sh — T-423 fable plan-gate injection (device-scoped
 * "ask once, remember forever" instead of T-391's "ask once per session").
 *
 * Contract under test:
 * - PO ONLY: any non-po prdt agent (or no agent) → zero stdout. Plan-tier
 *   shapes the PO's own model-routing decisions; workers never route models.
 * - Value source `$PRDT_HOME/plan-tier`: `max-x20` / `team-premium` → inject
 *   the stored, fable-eligible value (no question). `other` → inject the
 *   stored, NOT-eligible value (no question). missing/invalid → inject the
 *   "unset" payload instructing a one-time ask + persist, never a per-session
 *   default value.
 * - Same T-358 wiring as prdt-audience-inject.sh: its own small hook output,
 *   never part of prdt-session-start.sh's payload.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PLAN_TIER_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-plan-tier-inject.sh')
const SESSION_START_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function makePrdtHome(opts: { tier?: string } = {}): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t423-'))
  if (opts.tier !== undefined) {
    fs.writeFileSync(path.join(home, 'plan-tier'), opts.tier)
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

describe('unset (no stored answer) → ask-once instruction, never a silent default', () => {
  test.skipIf(!hasJq())('no plan-tier file → unset payload, no eligibility claimed', () => {
    const home = makePrdtHome()
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('plan-tier: unset')
    expect(ctx).toContain('Ask the user ONCE')
    expect(ctx).toContain('do not ask again')
  })

  test.skipIf(!hasJq())('corrupt content → same unset payload (never crashes)', () => {
    const home = makePrdtHome({ tier: 'pro\n' })
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('plan-tier: unset')
  })
})

describe('stored answer → injected silently, no re-ask instruction', () => {
  test.skipIf(!hasJq())('max-x20 → fable-eligible, no ask', () => {
    const home = makePrdtHome({ tier: 'max-x20\n' })
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('plan-tier: max-x20')
    expect(ctx).toContain('fable-eligible')
    expect(ctx).not.toContain('Ask the user')
  })

  test.skipIf(!hasJq())('team-premium → fable-eligible, no ask', () => {
    const home = makePrdtHome({ tier: 'team-premium\n' })
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('plan-tier: team-premium')
    expect(ctx).toContain('fable-eligible')
    expect(ctx).not.toContain('Ask the user')
  })

  test.skipIf(!hasJq())('other → NOT eligible, still no ask (a real recorded answer)', () => {
    const home = makePrdtHome({ tier: 'other\n' })
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx).toContain('plan-tier: other')
    expect(ctx).toContain('NOT fable-eligible')
    expect(ctx).not.toContain('Ask the user')
  })
})

describe('PO-only scope (T-423: only the PO routes models)', () => {
  for (const worker of ['prdt-designer', 'prdt-developer', 'prdt-qa']) {
    test.skipIf(!hasJq())(`${worker} → nothing, even when a tier is stored`, () => {
      const home = makePrdtHome({ tier: 'max-x20\n' })
      expect(runHook(PLAN_TIER_HOOK, home, worker)).toBe('')
    })
  }

  test.skipIf(!hasJq())('plain session (no agent) → nothing', () => {
    const home = makePrdtHome({ tier: 'max-x20\n' })
    expect(runHook(PLAN_TIER_HOOK, home, '')).toBe('')
  })
})

describe('T-358 channel separation', () => {
  test.skipIf(!hasJq())('main session-start payload does NOT carry the plan-tier body', () => {
    const home = makePrdtHome({ tier: 'max-x20\n' })
    // A minimal mirror is enough since we only assert absence in the main hook's output.
    fs.mkdirSync(path.join(home, 'discipline', 'po', 'playbooks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
    fs.writeFileSync(path.join(home, 'discipline', 'contracts.md'), '# contracts\n')
    fs.writeFileSync(path.join(home, 'discipline', 'po', 'habit.md'), '# po habit\n')
    fs.writeFileSync(path.join(home, 'discipline', 'po', 'playbooks', '_index.md'), '# menu\n')
    const mainCtx = additionalContextOf(runHook(SESSION_START_HOOK, home, 'prdt-po'))
    expect(mainCtx).not.toContain('plan-tier')
  })

  test.skipIf(!hasJq())('plan-tier hook output stays far below the ~10KB persist threshold', () => {
    const home = makePrdtHome({ tier: 'max-x20\n' })
    const ctx = additionalContextOf(runHook(PLAN_TIER_HOOK, home, 'prdt-po'))
    expect(ctx.length).toBeGreaterThan(0)
    expect(ctx.length).toBeLessThan(4000)
  })
})
