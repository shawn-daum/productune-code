/**
 * prdt-project-overrides-inject.sh — T-445 (design §8b).
 *
 * The project layer is the highest-precedence discipline block in the turn, and
 * (measured, see install-project-overrides-hook.test.ts) its POSITION cannot be
 * what says so — co-registered hooks render in completion order. Two things
 * therefore have to hold at the payload level, and both are asserted here by
 * RUNNING the hooks:
 *
 *   1. Resolution — the override file lives at <projectRoot>/.prdt/overrides/
 *      <persona>.md, found by up-walking the event's `.cwd`. In the v1.3 meta
 *      split the session cwd is the CODE root, so a depth-0 lookup would miss.
 *      A machine/project with no file emits NOTHING (byte-identical to pre-T-445).
 *   2. Precedence text — the actual carrier: every override payload (machine AND
 *      project) has to state the same order AND name the non-overridable floor
 *      (contracts.md §Overrides). The pre-T-445 machine header granted itself
 *      "priority over EVERYTHING in the main discipline injection" with no floor
 *      clause; since it arrives after doctrine/contracts/habit, that sentence is
 *      an unconditional last-wins grant sitting in the highest-weight slot — a
 *      live attack surface once a CLONED repo can add an even later block, not a
 *      wording nit (T-444 grill F2).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const PROJECT_HOOK = path.join(HOOKS, 'prdt-project-overrides-inject.sh')
const MACHINE_HOOK = path.join(HOOKS, 'prdt-overrides-inject.sh')
const SESSION_START_HOOK = path.join(HOOKS, 'prdt-session-start.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

const PROJECT_BODY = '- 이 프로젝트에서는 GUI 부팅 시 HOME=sandbox 필수 (상세: learning--gui-testing)\n- PROJECT-LAYER-MARKER'
const MACHINE_BODY = '- 이 기기에선 키/IME 검증은 VM 필수 (상세: machine:fact--qa-cua-vm)\n- MACHINE-LAYER-MARKER'

/** Throwaway ~/.prdt mirror (minimal but complete enough for session-start). */
function makePrdtHome(opts: { machineBody?: string } = {}): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t445-home-'))
  const disc = path.join(home, 'discipline')
  fs.mkdirSync(path.join(disc, 'developer', 'playbooks'), { recursive: true })
  fs.mkdirSync(path.join(home, 'overrides'), { recursive: true })
  fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(disc, 'contracts.md'), '# contracts\n')
  fs.writeFileSync(path.join(disc, 'developer', 'habit.md'), '# developer habit\n')
  fs.writeFileSync(path.join(disc, 'developer', 'playbooks', '_index.md'), '# menu\n')
  if (opts.machineBody) fs.writeFileSync(path.join(home, 'overrides', 'developer.md'), opts.machineBody)
  return home
}

/** Throwaway project: `.prdt/po-state.json` at the root, plus a `code/` child
 *  standing in for the v1.3 meta split's code root. */
function makeProject(opts: { projectBody?: string } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t445-proj-'))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'code'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.6', current_task: null }),
  )
  if (opts.projectBody) {
    fs.mkdirSync(path.join(root, '.prdt', 'overrides'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt', 'overrides', 'developer.md'), opts.projectBody)
  }
  return root
}

interface RunOpts {
  prdtHome: string
  cwd: string
  agentType?: string
  eventName?: string
}

function runHook(script: string, o: RunOpts): string {
  const event = {
    hook_event_name: o.eventName ?? 'SubagentStart',
    agent_type: o.agentType ?? 'prdt-developer',
    cwd: o.cwd,
  }
  return execFileSync('bash', [script], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    cwd: o.cwd,
    env: { ...process.env, PRDT_HOME: o.prdtHome },
  })
}

function additionalContextOf(stdout: string): string {
  if (!stdout.trim()) return ''
  return JSON.parse(stdout).hookSpecificOutput.additionalContext as string
}

describe('resolution: <projectRoot>/.prdt/overrides/<persona>.md via cwd up-walk', () => {
  test.skipIf(!hasJq())('project root cwd → injects the body verbatim', () => {
    const prdtHome = makePrdtHome()
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const ctx = additionalContextOf(runHook(PROJECT_HOOK, { prdtHome, cwd: proj }))
    expect(ctx).toContain(PROJECT_BODY)
    expect(ctx).toContain(path.join(proj, '.prdt', 'overrides', 'developer.md'))
  })

  test.skipIf(!hasJq())('meta-split code root cwd → up-walk still finds the project layer', () => {
    const prdtHome = makePrdtHome()
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const ctx = additionalContextOf(runHook(PROJECT_HOOK, { prdtHome, cwd: path.join(proj, 'code') }))
    expect(ctx).toContain(PROJECT_BODY)
  })

  test.skipIf(!hasJq())('SessionStart entry path (same script, different event) resolves identically', () => {
    const prdtHome = makePrdtHome()
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const out = runHook(PROJECT_HOOK, { prdtHome, cwd: path.join(proj, 'code'), eventName: 'SessionStart', agentType: 'prdt-po' })
    // po has no project override file here → silent; developer does → injected.
    expect(out).toBe('')
    const dev = runHook(PROJECT_HOOK, { prdtHome, cwd: path.join(proj, 'code'), eventName: 'SessionStart' })
    expect(JSON.parse(dev).hookSpecificOutput.hookEventName).toBe('SessionStart')
    expect(additionalContextOf(dev)).toContain(PROJECT_BODY)
  })
})

describe('absent / out-of-scope → byte-identical silence', () => {
  test.skipIf(!hasJq())('project with no overrides dir → no stdout at all', () => {
    const prdtHome = makePrdtHome()
    const proj = makeProject()
    expect(runHook(PROJECT_HOOK, { prdtHome, cwd: proj })).toBe('')
  })

  test.skipIf(!hasJq())('cwd outside any prdt project → no stdout at all', () => {
    const prdtHome = makePrdtHome()
    const loose = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t445-loose-'))
    expect(runHook(PROJECT_HOOK, { prdtHome, cwd: loose })).toBe('')
  })

  test.skipIf(!hasJq())('non-prdt agent_type (plain session) → no stdout at all', () => {
    const prdtHome = makePrdtHome()
    const proj = makeProject({ projectBody: PROJECT_BODY })
    expect(runHook(PROJECT_HOOK, { prdtHome, cwd: proj, agentType: '' })).toBe('')
  })
})

describe('precedence text — the carrier of the layer ranking, not the position', () => {
  test.skipIf(!hasJq())('project payload claims the top layer AND names the non-overridable floor', () => {
    const prdtHome = makePrdtHome({ machineBody: MACHINE_BODY })
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const ctx = additionalContextOf(runHook(PROJECT_HOOK, { prdtHome, cwd: proj }))
    expect(ctx).toContain('non-overridable floor')
    expect(ctx).toContain('§Overrides')
    expect(ctx).toMatch(/machine override < THIS block/)
    expect(ctx).toContain('VOID')
  })

  test.skipIf(!hasJq())('machine payload no longer grants itself unconditional priority, and names the floor', () => {
    const prdtHome = makePrdtHome({ machineBody: MACHINE_BODY })
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const ctx = additionalContextOf(runHook(MACHINE_HOOK, { prdtHome, cwd: proj }))
    expect(ctx).toContain(MACHINE_BODY)
    expect(ctx).not.toContain('priority over EVERYTHING')
    expect(ctx).toContain('non-overridable floor')
    expect(ctx).toContain('§Overrides')
    // and it must hand the last word to the project layer explicitly — this text
    // is the ACTUAL carrier of precedence: co-registered hooks render in
    // completion order, so the machine block can arrive after the project one
    // (measured, T-445), and only the wording keeps the layers ranked.
    expect(ctx).toMatch(/PROJECT override block/)
    expect(ctx).toMatch(/outranks this layer/)
  })

  test.skipIf(!hasJq())('session-start payload no longer says machine overrides beat everything', () => {
    const prdtHome = makePrdtHome({ machineBody: MACHINE_BODY })
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const ctx = additionalContextOf(runHook(SESSION_START_HOOK, { prdtHome, cwd: proj }))
    expect(ctx).not.toContain('those take priority over everything here')
    expect(ctx).toMatch(/project/i)
    expect(ctx).toContain('floor')
  })
})

describe('two layers, two independent small channels (T-358 property preserved)', () => {
  test.skipIf(!hasJq())('both bodies reach context, each in its own hook output, each far under the persist threshold', () => {
    const prdtHome = makePrdtHome({ machineBody: MACHINE_BODY })
    const proj = makeProject({ projectBody: PROJECT_BODY })
    const machineCtx = additionalContextOf(runHook(MACHINE_HOOK, { prdtHome, cwd: proj }))
    const projectCtx = additionalContextOf(runHook(PROJECT_HOOK, { prdtHome, cwd: proj }))
    expect(machineCtx).toContain('MACHINE-LAYER-MARKER')
    expect(machineCtx).not.toContain('PROJECT-LAYER-MARKER')
    expect(projectCtx).toContain('PROJECT-LAYER-MARKER')
    expect(projectCtx).not.toContain('MACHINE-LAYER-MARKER')
    expect(machineCtx.length).toBeLessThan(3000)
    expect(projectCtx.length).toBeLessThan(3000)
  })
})
