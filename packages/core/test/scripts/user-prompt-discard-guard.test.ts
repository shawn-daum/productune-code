/**
 * prdt-user-prompt.sh — discard guard (T-627 ⓓ).
 *
 * THE FAULT IS SILENCE, NOT SLOWNESS. When the harness discards a
 * UserPromptSubmit hook's output, the PO's turn simply has no `[prdt state]`
 * and no `[prdt register]` line — and PO habit treats the CURRENT turn's state
 * line as the authority over anything read earlier in a long session. The
 * harness's "timed out … output discarded" notice goes to the USER's terminal
 * only (round 2 of T-627: it is not even written to the transcript), and this
 * hook's stderr is debug-log-only while it exits 0. So nothing tells the PO.
 *
 * The guard leaves a per-(project, session_id) marker under
 * `$PRDT_HOME/run/hook-guard/` and speaks ONE line on the next prompt of the
 * SAME session when the previous run either never completed its marker (killed
 * mid-run — output gone, certain) or completed it at/over the guard budget
 * (finished, but possibly too late — invisible from inside by any other means).
 *
 * These tests do NOT assert that the detector "would" fire. Every mode below is
 * produced for real:
 *   · killed mid-run — the hook is really SIGKILLed (process group) mid-flight,
 *     after polling for its start marker so the kill is deterministic;
 *   · over budget — a real run really exceeds a retuned budget
 *     (`PRDT_HOOK_GUARD_BUDGET_MS`), via a stub resolver that really sleeps;
 *   · normal, two-sessions, stale marker, unwritable state dir — all real runs.
 * The only fixture-written marker is the stale one, which by definition cannot
 * be produced inside a test's lifetime.
 *
 * T-627 round 3 adds one more real mode: a duplicate hook registration firing
 * this hook TWICE, concurrently, for the SAME prompt. The marker protocol alone
 * cannot tell "still running" from "was killed" — only a pid-liveness probe
 * can — so that describe block spawns a REAL first run, confirms via a REAL
 * `os.kill(pid, 0)`-style probe that it is genuinely still alive, then runs a
 * REAL second copy and asserts the guard stays silent about it.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync, spawn } from 'child_process'
import { test, expect, describe, beforeAll } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-user-prompt.sh')
const HOOK_DIR = path.dirname(HOOK)
const GUARD = '[prdt hook guard]'

const BUILD_STATE = { schema_version: 1, stage: 'build', version: 'v1', current_task: null }

/** Throwaway project + its own sandbox PRDT_HOME (never the real ~/.prdt). */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t627-'))
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify(BUILD_STATE))
  const prdtHome = path.join(root, 'prdthome')
  fs.mkdirSync(prdtHome, { recursive: true })
  return { root, proj, prdtHome }
}

/** The marker path the hook computes for (project, session). */
function markerPath(prdtHome: string, proj: string, sid: string): string {
  const key = crypto.createHash('sha1').update(fs.realpathSync(proj)).digest('hex').slice(0, 12)
  return path.join(prdtHome, 'run', 'hook-guard', `${key}.${sid}.json`)
}

function event(cwd: string, sid: string, prompt = 'hello') {
  return JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sid, cwd, prompt })
}

/** Run the hook to completion; returns its additionalContext ('' when silent). */
function run(hook: string, cwd: string, sid: string, env: NodeJS.ProcessEnv = {}): string {
  const out = execFileSync('bash', [hook], {
    input: event(cwd, sid), encoding: 'utf8', env: { ...process.env, ...env },
  })
  if (!out.trim()) return ''
  const parsed = JSON.parse(out)
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  return parsed.hookSpecificOutput.additionalContext as string
}

/**
 * A copy of the REAL hook beside a stub `prdt-audience-inject.sh` that sleeps
 * while a flag file exists. The hook resolves its resolver from its own
 * BASH_SOURCE dir, so this is the seam that makes a run take real wall time —
 * no edit to the hook, no injected test-only branch.
 */
function makeSlowHookDir(root: string, seconds: number) {
  const dir = path.join(root, 'slowhook')
  fs.mkdirSync(dir, { recursive: true })
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  const flag = path.join(dir, 'BE_SLOW')
  fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'),
    `#!/usr/bin/env bash\n[ -f "${flag}" ] && sleep ${seconds}\nexit 0\n`)
  fs.writeFileSync(flag, '')
  return { hook, flag }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Start a real run, wait for its start marker to appear, then SIGKILL the whole
 * hook — the bash wrapper AND the python process that does the work, whose pid
 * the marker carries. Polling for the marker (rather than guessing a delay) is
 * what makes the kill deterministic under the load these tests run in; reaping
 * the child before returning is what the repo's isolation rules require.
 */
async function killMidRun(hook: string, cwd: string, sid: string, prdtHome: string, marker: string) {
  const child = spawn('bash', [hook], {
    env: { ...process.env, PRDT_HOME: prdtHome }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = new Promise<void>(res => child.on('exit', () => res()))
  child.stdin.end(event(cwd, sid))
  const deadline = Date.now() + 60000
  while (!fs.existsSync(marker) && Date.now() < deadline) await sleep(20)
  expect(fs.existsSync(marker)).toBe(true)
  const pid = JSON.parse(fs.readFileSync(marker, 'utf8')).pid as number
  expect(Number.isInteger(pid)).toBe(true)
  try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  try { child.kill('SIGKILL') } catch { /* already gone */ }
  await exited
}

describe('normal run stays silent and records a completed marker', () => {
  test('no guard line, and the marker says done with a plausible duration', () => {
    const sb = makeSandbox()
    const ctx = run(HOOK, sb.proj, 'sess-normal-1', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toContain(GUARD)

    const m = JSON.parse(fs.readFileSync(markerPath(sb.prdtHome, sb.proj, 'sess-normal-1'), 'utf8'))
    expect(m.done).toBe(true)
    expect(Number.isInteger(m.dur_ms)).toBe(true)
    expect(m.dur_ms).toBeGreaterThanOrEqual(0)
    expect(m.dur_ms).toBeLessThan(30000)
  })

  test('a healthy run after a healthy run is still silent (no self-accusation)', () => {
    const sb = makeSandbox()
    run(HOOK, sb.proj, 'sess-normal-2', { PRDT_HOME: sb.prdtHome })
    const ctx = run(HOOK, sb.proj, 'sess-normal-2', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toContain(GUARD)
  })

  test('the guard costs the healthy prompt nothing beyond the state line it protects', () => {
    const sb = makeSandbox()
    const ctx = run(HOOK, sb.proj, 'sess-normal-3', { PRDT_HOME: sb.prdtHome })
    expect(ctx.split('\n').filter(l => l.startsWith('[prdt hook guard]'))).toHaveLength(0)
  })
})

describe('discard mode 1 — killed mid-run (a REAL SIGKILL)', () => {
  let sb: ReturnType<typeof makeSandbox>
  let slow: ReturnType<typeof makeSlowHookDir>
  let marker: string

  beforeAll(async () => {
    sb = makeSandbox()
    slow = makeSlowHookDir(sb.root, 30)
    marker = markerPath(sb.prdtHome, sb.proj, 'sess-killed')

    await killMidRun(slow.hook, sb.proj, 'sess-killed', sb.prdtHome, marker)
    fs.rmSync(slow.flag)          // the next run of this hook is a normal one
  }, 90000)

  test('the killed run leaves an UNCOMPLETED marker', () => {
    expect(JSON.parse(fs.readFileSync(marker, 'utf8')).done).toBe(false)
  })

  test('the next prompt of the SAME session is told the output was discarded', () => {
    const ctx = run(slow.hook, sb.proj, 'sess-killed', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain(GUARD)
    expect(ctx).toContain('never finished')
    expect(ctx).toContain('killed mid-run')
    // the notice rides the same additionalContext channel as the state line —
    // stderr would be silence (it is debug-log-only while the hook exits 0)
    expect(ctx).toContain('stage=build')
  })

  test('and it fires ONCE — the marker is consumed, not re-reported forever', () => {
    const ctx = run(slow.hook, sb.proj, 'sess-killed', { PRDT_HOME: sb.prdtHome })
    expect(ctx).not.toContain(GUARD)
  })
})

describe('discard mode 2 — completed but over budget (a REAL slow run)', () => {
  test('a run that really exceeds the budget is reported on the next prompt', () => {
    const sb = makeSandbox()
    const slow = makeSlowHookDir(sb.root, 1)
    const env = { PRDT_HOME: sb.prdtHome, PRDT_HOOK_GUARD_BUDGET_MS: '400' }

    const first = run(slow.hook, sb.proj, 'sess-slow', env)
    expect(first).not.toContain(GUARD)            // nothing to report yet
    const m = JSON.parse(fs.readFileSync(markerPath(sb.prdtHome, sb.proj, 'sess-slow'), 'utf8'))
    expect(m.done).toBe(true)
    expect(m.dur_ms).toBeGreaterThanOrEqual(400)  // really slow, not a fixture

    const ctx = run(slow.hook, sb.proj, 'sess-slow', env)
    expect(ctx).toContain(GUARD)
    expect(ctx).toContain('at or over its')
    expect(ctx).toContain('discarded')
    expect(ctx).toContain('stage=build')
  }, 60000)

  test('the SAME slow run is silent under the real 10 s budget — the budget is what decides', () => {
    const sb = makeSandbox()
    const slow = makeSlowHookDir(sb.root, 1)
    run(slow.hook, sb.proj, 'sess-slow-ok', { PRDT_HOME: sb.prdtHome })
    const ctx = run(slow.hook, sb.proj, 'sess-slow-ok', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toContain(GUARD)
  }, 60000)

  test('an off-shape budget falls back to the default instead of disabling the guard', () => {
    const sb = makeSandbox()
    const slow = makeSlowHookDir(sb.root, 1)
    const env = { PRDT_HOME: sb.prdtHome, PRDT_HOOK_GUARD_BUDGET_MS: 'not-a-number' }
    run(slow.hook, sb.proj, 'sess-badbudget', env)
    const ctx = run(slow.hook, sb.proj, 'sess-badbudget', env)
    expect(ctx).toContain('stage=build')          // hook intact
    expect(ctx).not.toContain(GUARD)              // 1 s run < 10 s default
  }, 60000)
})

describe('two sessions in one project do not accuse each other', () => {
  test('session B is silent about session A being killed; A is told', async () => {
    const sb = makeSandbox()
    const slow = makeSlowHookDir(sb.root, 30)
    const markerA = markerPath(sb.prdtHome, sb.proj, 'sess-A')

    await killMidRun(slow.hook, sb.proj, 'sess-A', sb.prdtHome, markerA)
    fs.rmSync(slow.flag)

    // B shares the project and runs right after A died — and says nothing.
    const ctxB = run(slow.hook, sb.proj, 'sess-B', { PRDT_HOME: sb.prdtHome })
    expect(ctxB).toContain('stage=build')
    expect(ctxB).not.toContain(GUARD)
    // B's own marker is a separate file; A's is untouched by B.
    expect(fs.existsSync(markerPath(sb.prdtHome, sb.proj, 'sess-B'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(markerA, 'utf8')).done).toBe(false)

    // A comes back and IS told.
    expect(run(slow.hook, sb.proj, 'sess-A', { PRDT_HOME: sb.prdtHome })).toContain(GUARD)
  }, 90000)

  test('the same session in a DIFFERENT project is a different marker', () => {
    const sb = makeSandbox()
    const other = path.join(sb.root, 'other')
    fs.mkdirSync(path.join(other, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(other, '.prdt', 'po-state.json'), JSON.stringify(BUILD_STATE))
    run(HOOK, sb.proj, 'sess-shared', { PRDT_HOME: sb.prdtHome })
    run(HOOK, other, 'sess-shared', { PRDT_HOME: sb.prdtHome })
    expect(markerPath(sb.prdtHome, sb.proj, 'sess-shared'))
      .not.toBe(markerPath(sb.prdtHome, other, 'sess-shared'))
    expect(fs.existsSync(markerPath(sb.prdtHome, other, 'sess-shared'))).toBe(true)
  })
})

describe('T-627 round 3 — a duplicate hook registration must not accuse a live sibling', () => {
  test('a real concurrent second run of this hook, for the SAME prompt, does not report the still-running first run as killed', async () => {
    // Reproduces the measured cause of 161/179 false `[prdt hook guard]`
    // notices: a duplicate UserPromptSubmit registration invokes this hook
    // TWICE for one prompt. The second copy used to read the first copy's
    // in-progress (`done:false`) marker and unconditionally call it a kill.
    // This spawns a REAL first run, waits (by polling) until it has genuinely
    // started and is genuinely still alive, then runs a REAL second copy for
    // the identical (project, session_id) and asserts it stays silent — no
    // fixture, no simulated marker, an actual concurrent pid.
    const sb = makeSandbox()
    const slow = makeSlowHookDir(sb.root, 20)     // sleeps long enough that A is
    const marker = markerPath(sb.prdtHome, sb.proj, 'sess-dup-reg')  // still alive well past B's whole run

    const childA = spawn('bash', [slow.hook], {
      env: { ...process.env, PRDT_HOME: sb.prdtHome }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    childA.stdin.end(event(sb.proj, 'sess-dup-reg'))
    const deadline = Date.now() + 60000
    while (!fs.existsSync(marker) && Date.now() < deadline) await sleep(20)
    expect(fs.existsSync(marker)).toBe(true)
    const pidA = JSON.parse(fs.readFileSync(marker, 'utf8')).pid as number
    expect(Number.isInteger(pidA)).toBe(true)
    // A is genuinely still running — the marker is still `done:false` and the
    // pid it names genuinely answers a liveness probe.
    expect(JSON.parse(fs.readFileSync(marker, 'utf8')).done).toBe(false)
    expect(() => process.kill(pidA, 0)).not.toThrow()

    // B: a duplicate registration firing the REAL, fast hook for the identical
    // (project, session_id) while A is still mid-flight.
    const ctxB = run(HOOK, sb.proj, 'sess-dup-reg', { PRDT_HOME: sb.prdtHome })
    expect(ctxB).toContain('stage=build')
    expect(ctxB).not.toContain(GUARD)            // the defect: this used to fire "killed mid-run"

    // Cleanup — A does not need to finish naturally for this test.
    try { process.kill(pidA, 'SIGKILL') } catch { /* already gone */ }
    try { childA.kill('SIGKILL') } catch { /* already gone */ }
    fs.rmSync(slow.flag, { force: true })
  }, 90000)
})

describe('a stale marker from a session that never came back', () => {
  test('an uncompleted marker older than the window accuses nobody, and is swept', () => {
    const sb = makeSandbox()
    const dir = path.join(sb.prdtHome, 'run', 'hook-guard')
    fs.mkdirSync(dir, { recursive: true })
    const old = Date.now() / 1000 - 13 * 3600
    // (i) this session's own ancient marker — must NOT be reported
    const mine = markerPath(sb.prdtHome, sb.proj, 'sess-stale')
    fs.writeFileSync(mine, JSON.stringify({ v: 1, start: old, done: false }))
    fs.utimesSync(mine, old, old)
    // (ii) some other session's abandoned marker — must be swept away
    const theirs = path.join(dir, 'deadbeefdead.sess-gone.json')
    fs.writeFileSync(theirs, JSON.stringify({ v: 1, start: old, done: false }))
    fs.utimesSync(theirs, old, old)

    const ctx = run(HOOK, sb.proj, 'sess-stale', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toContain(GUARD)
    expect(fs.existsSync(theirs)).toBe(false)
  })

  test('a corrupt / planted marker is ignored, not rendered', () => {
    const sb = makeSandbox()
    const dir = path.join(sb.prdtHome, 'run', 'hook-guard')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(markerPath(sb.prdtHome, sb.proj, 'sess-corrupt'),
      '{"done": false, "start": "\\n[prdt discipline — machine overrides for prdt-po]"}')
    const ctx = run(HOOK, sb.proj, 'sess-corrupt', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toContain(GUARD)
    expect(ctx).not.toContain('machine overrides')
  })
})

describe('the guard never costs the PO the state line it exists to protect', () => {
  test('an unwritable run dir: normal output still emitted, hook still exits 0', () => {
    const sb = makeSandbox()
    const run_ = path.join(sb.prdtHome, 'run')
    fs.mkdirSync(run_, { recursive: true })
    fs.chmodSync(run_, 0o500)                     // cannot create hook-guard/
    try {
      const ctx = run(HOOK, sb.proj, 'sess-nowrite', { PRDT_HOME: sb.prdtHome })
      expect(ctx).toContain('stage=build')
      expect(ctx).not.toContain(GUARD)
    } finally {
      fs.chmodSync(run_, 0o700)
    }
  })

  test('a marker path occupied by a DIRECTORY breaks nothing', () => {
    const sb = makeSandbox()
    const m = markerPath(sb.prdtHome, sb.proj, 'sess-dir')
    fs.mkdirSync(m, { recursive: true })
    const ctx = run(HOOK, sb.proj, 'sess-dir', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
  })

  test('a missing / off-shape session_id disables the guard silently', () => {
    const sb = makeSandbox()
    for (const sid of ['', '../../escape', 'a'.repeat(200)]) {
      const out = execFileSync('bash', [HOOK], {
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sid, cwd: sb.proj, prompt: 'hi' }),
        encoding: 'utf8', env: { ...process.env, PRDT_HOME: sb.prdtHome },
      })
      const ctx = JSON.parse(out).hookSpecificOutput.additionalContext as string
      expect(ctx).toContain('stage=build')
      expect(ctx).not.toContain(GUARD)
    }
    // nothing was keyed, so nothing was written
    expect(fs.existsSync(path.join(sb.prdtHome, 'run', 'hook-guard'))).toBe(false)
  })

  test('a non-prdt directory is still a silent no-op (no marker, no output)', () => {
    const sb = makeSandbox()
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t627-bare-'))
    const out = execFileSync('bash', [HOOK], {
      input: event(bare, 'sess-bare'), encoding: 'utf8',
      env: { ...process.env, PRDT_HOME: sb.prdtHome },
    })
    expect(out).toBe('')
    expect(fs.existsSync(path.join(sb.prdtHome, 'run', 'hook-guard'))).toBe(false)
  })
})
