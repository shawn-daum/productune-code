/**
 * prdt-overrides-inject.sh — T-358.
 *
 * Repro (2026-07-15): prdt-session-start.sh injects doctrine+contracts+habit+
 * overrides+menus as ONE additionalContext string. Once that string crosses
 * the harness's persist-truncation threshold (~10KB observed), the harness
 * writes it to a tool-results file and shows only a ~2KB PREVIEW in context.
 * The overrides block sat last in the string, past the preview cutoff, so a
 * whole PO session ran ignoring 3 machine overrides.
 *
 * Fix: overrides are injected by their OWN hook (this script), registered as
 * a separate hook command on the same SessionStart/SubagentStart events —
 * never merged into prdt-session-start.sh's additionalContext string. Its own
 * output is just the override file body, so it stays far under any persist
 * threshold regardless of how large the main discipline payload grows.
 *
 * This suite proves, with a realistic oversized discipline fixture (doctrine
 * + contracts + habit padded to ~18KB combined, matching the ~16.6KB observed
 * in the incident): (a) prdt-session-start.sh's own payload is large enough
 * to have tripped the incident, (b) it no longer carries the overrides text
 * at all, and (c) prdt-overrides-inject.sh's output — the ONLY channel that
 * now carries overrides — independently contains the override body in full
 * and stays small, so it cannot itself hit the persist/preview path.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const OVERRIDES_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-overrides-inject.sh')
const SESSION_START_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/** Build a minimal ~/.prdt mirror. `oversized` pads doctrine/contracts/habit to a
 *  realistic incident-sized payload (~18KB combined) to prove size independence. */
function makePrdtHome(opts: { overrideBody?: string; oversized?: boolean }): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t358-'))
  const disc = path.join(home, 'discipline')
  fs.mkdirSync(path.join(disc, 'developer', 'playbooks'), { recursive: true })
  fs.mkdirSync(path.join(home, 'overrides'), { recursive: true })

  const pad = opts.oversized ? '이 문단은 실측 인시던트 규모(약 16.6KB)를 재현하기 위한 채움 텍스트입니다. '.repeat(120) : ''

  fs.writeFileSync(path.join(home, 'doctrine.md'), `# doctrine\n${pad}\n`)
  fs.writeFileSync(path.join(disc, 'contracts.md'), `# contracts\n${pad}\n`)
  fs.writeFileSync(path.join(disc, 'developer', 'habit.md'), `# developer habit\n${pad}\n`)
  fs.writeFileSync(path.join(disc, 'developer', 'playbooks', '_index.md'), '# menu\n')

  if (opts.overrideBody) {
    fs.writeFileSync(path.join(home, 'overrides', 'developer.md'), opts.overrideBody)
  }
  return home
}

/** Run a hook script with a SubagentStart event; returns raw stdout. */
function runHook(script: string, prdtHome: string): string {
  const event = {
    hook_event_name: 'SubagentStart',
    agent_type: 'prdt-developer',
    cwd: os.tmpdir(),
  }
  return execFileSync('bash', [script], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: prdtHome },
  })
}

function additionalContextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  const parsed = JSON.parse(stdout)
  return parsed.hookSpecificOutput.additionalContext as string
}

const OVERRIDE_BODY = '- 개조식으로만 답하라 (금지: 서술형 문장)\n- 커밋 금지 — 항상 진단만\n- "당신" 대신 이름으로 호칭'

describe('overrides-absent machines: unchanged', () => {
  test.skipIf(!hasJq())('no override file → hook emits nothing at all', () => {
    const home = makePrdtHome({})
    const out = runHook(OVERRIDES_HOOK, home)
    expect(out).toBe('')
  })

  test.skipIf(!hasJq())('main hook payload is unaffected by the absence (no dangling overrides block)', () => {
    const home = makePrdtHome({})
    const ctx = additionalContextOf(runHook(SESSION_START_HOOK, home))
    expect(ctx).not.toContain('BEGIN overrides')
  })
})

describe('override present: reaches visible context via its own small channel', () => {
  test.skipIf(!hasJq())('emits a LAST-WINS block containing the override body verbatim', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY })
    const ctx = additionalContextOf(runHook(OVERRIDES_HOOK, home))
    expect(ctx).toContain('LAST-WINS')
    expect(ctx).toContain(OVERRIDE_BODY)
  })

  test.skipIf(!hasJq())('main hook payload no longer duplicates the overrides block', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY })
    const ctx = additionalContextOf(runHook(SESSION_START_HOOK, home))
    expect(ctx).not.toContain(OVERRIDE_BODY)
    expect(ctx).not.toContain('BEGIN overrides')
  })
})

describe('realistic oversized fixture (~18KB discipline payload, incident-scale)', () => {
  test.skipIf(!hasJq())('main payload alone is large enough to have tripped the observed ~10KB persist threshold', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY, oversized: true })
    const ctx = additionalContextOf(runHook(SESSION_START_HOOK, home))
    expect(ctx.length).toBeGreaterThan(12000)
  })

  test.skipIf(!hasJq())('overrides hook output stays small and independent of main payload size', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY, oversized: true })
    const overridesCtx = additionalContextOf(runHook(OVERRIDES_HOOK, home))
    const mainCtx = additionalContextOf(runHook(SESSION_START_HOOK, home))

    // The overrides channel is the ONLY place the body appears, and it is far
    // below the observed persist threshold even though the main payload (same
    // fixture, same turn) is oversized — proving the two are size-independent.
    expect(overridesCtx).toContain(OVERRIDE_BODY)
    expect(overridesCtx.length).toBeLessThan(2000)
    expect(mainCtx.length).toBeGreaterThan(12000)
    expect(mainCtx).not.toContain(OVERRIDE_BODY)
  })
})
