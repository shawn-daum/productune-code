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

  // T-577: the pad is 120 SEPARATE lines, not one 18KB line. A real discipline
  // document is many lines (the largest line in the shipped tree measures 1,682 B),
  // and the part renderer packs by line — a single line larger than a whole part
  // is a different case with its own withheld-with-a-notice path, covered in
  // session-start-parts.test.ts. Padding on one line tested that path by accident
  // and never exercised the split this fixture exists to size.
  const pad = opts.oversized
    ? Array.from({ length: 120 }, (_, i) => `- ${i}: 이 줄은 실측 인시던트 규모(약 16.6KB)를 재현하기 위한 채움 텍스트입니다.`).join('\n')
    : ''

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

/** T-483: hook renders every body line behind the `| ` gutter. */
const gutter = (b: string) => b.split('\n').map((l) => '| ' + l).join('\n')


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
  // T-445 replaced the bare "LAST-WINS" title: the machine layer outranks the
  // canonical set but is itself outranked by the project layer, and both are
  // bounded by the non-overridable floor. The precedence wording is asserted in
  // project-overrides-inject-hook.test.ts; here we only pin that the block still
  // states it outranks the main discipline injection and carries the body.
  test.skipIf(!hasJq())('emits an outranking block carrying the whole body behind the T-483 gutter', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY })
    const ctx = additionalContextOf(runHook(OVERRIDES_HOOK, home))
    expect(ctx).toContain('machine overrides')
    expect(ctx).toMatch(/outrank/)
    expect(ctx).toContain(gutter(OVERRIDE_BODY))
  })

  test.skipIf(!hasJq())('main hook payload no longer duplicates the overrides block', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY })
    const ctx = additionalContextOf(runHook(SESSION_START_HOOK, home))
    expect(ctx).not.toContain(OVERRIDE_BODY)
    expect(ctx).not.toContain('BEGIN overrides')
  })
})

describe('realistic oversized fixture (~18KB discipline payload, incident-scale)', () => {
  /** T-577: the main hook now delivers the set in PARTS (one hook command each),
   *  every part under the measured 10,000-char persistence threshold. The
   *  fixture is still incident-sized in TOTAL — that is what proves the split
   *  is doing work — but no single output is over the threshold any more. */
  function allParts(home: string): string[] {
    const parts: string[] = []
    for (let n = 1; n <= 12; n++) {
      const out = execFileSync('bash', [SESSION_START_HOOK, '--part', String(n)], {
        input: JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'prdt-developer', cwd: os.tmpdir() }),
        encoding: 'utf8', env: { ...process.env, PRDT_HOME: home },
      })
      const ctx = additionalContextOf(out)
      if (ctx) parts.push(ctx)
    }
    return parts
  }

  test.skipIf(!hasJq())('the fixture is incident-scale in total, yet no single hook output crosses the 10,000-char persist threshold', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY, oversized: true })
    const parts = allParts(home)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.reduce((n, p) => n + p.length, 0)).toBeGreaterThan(12000)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(10000)
  })

  test.skipIf(!hasJq())('overrides hook output stays small and independent of main payload size', () => {
    const home = makePrdtHome({ overrideBody: OVERRIDE_BODY, oversized: true })
    const overridesCtx = additionalContextOf(runHook(OVERRIDES_HOOK, home))
    const parts = allParts(home)

    // The overrides channel is the ONLY place the body appears, and it is far
    // below the persist threshold even though the main set (same fixture, same
    // turn) is oversized in total — proving the two are size-independent.
    expect(overridesCtx).toContain(gutter(OVERRIDE_BODY))
    // The bound is about ORDER OF MAGNITUDE, not a byte count: the measured
    // persist threshold is 10,000 chars (T-577), and this channel must stay far
    // under it no matter how large the main payload grows. T-493 added ~450 chars
    // of payload prose, taking this block from ~2.0KB to ~2.4KB measured.
    expect(overridesCtx.length).toBeLessThan(4000)
    expect(parts.reduce((n, p) => n + p.length, 0)).toBeGreaterThan(12000)
    for (const p of parts) expect(p).not.toContain(OVERRIDE_BODY)
  })
})
