/**
 * prdt-call-governor.sh — T-491 S1, the per-dispatch API-turn governor.
 *
 * WHY this exists (T-498 ledger): A (the token metric) is 96.2% cache_read, i.e.
 * `A ≈ turns × context-per-turn`. The lever is the number of API turns a single
 * dispatch spends, not preamble bytes. This hook counts turns on PostToolBatch
 * (one fire per assistant turn that used tools — so BATCHING SEVERAL TOOLS INTO
 * ONE TURN IS NEVER PENALIZED, which is exactly what S3 asks for) and enforces
 * on PreToolUse.
 *
 * Scope is the user-approved option A (2026-08-19): prdt-developer is ENFORCED
 * (warn 40, deny 60); prdt-qa and prdt-designer are WARN-ONLY at every band, so
 * QA's legitimate 100~131-call live-VM verifications are never cut off.
 *
 * Contract under test:
 * - Outside a prdt project (no `.prdt/po-state.json` on the cwd's ancestor
 *   chain): ZERO stdout and ZERO filesystem writes. Total silence.
 * - Inside a prdt project: a per-event fire-evidence file is written (that file
 *   is what `prdt doctor` reads to prove the registration actually FIRES — the
 *   harness accepts a typo'd event name silently, T-498 §8 r6).
 * - Persona comes from the event's own `agent_type` (present on both events
 *   inside a subagent, measured 2026-08-19 on harness 2.1.235). Main session /
 *   non-prdt agents: counted never, warned never.
 * - The counter key is session_id + agent_id, so parallel workers never share a
 *   counter and each dispatch starts at zero.
 * - Classification reads only the payload HEADER window, so a `tool_input` body
 *   that contains a forged `"agent_type":"prdt-qa"` cannot buy a developer its
 *   way out of the deny.
 * - Every value used to build a path is shape-matched (never escaped-and-spliced
 *   — the T-471 prescription), so a traversal-shaped session_id writes nothing.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-call-governor.sh')

const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** A project dir carrying the `.prdt/po-state.json` marker the hooks up-walk for. */
function makeProject(): string {
  const root = tmp('prdt-t491-proj-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.7', current_task: null }),
  )
  return root
}

interface EventOpts {
  cwd: string
  agentType?: string
  agentId?: string
  sessionId?: string
  toolInput?: unknown
}

/**
 * Built in the harness's OWN key order (measured: session_id · transcript_path ·
 * cwd · prompt_id · permission_mode · agent_id · agent_type · hook_event_name ·
 * tool_name · tool_input · tool_use_id) so the header-window guard is exercised
 * against the real layout, not a convenient one.
 */
function eventJson(event: string, o: EventOpts): string {
  const parts: string[] = []
  parts.push(`"session_id":${JSON.stringify(o.sessionId ?? SID)}`)
  parts.push(`"transcript_path":${JSON.stringify(path.join(o.cwd, 'transcript.jsonl'))}`)
  parts.push(`"cwd":${JSON.stringify(o.cwd)}`)
  parts.push('"prompt_id":"11111111-2222-3333-4444-555555555555"')
  parts.push('"permission_mode":"default"')
  if (o.agentId !== undefined) parts.push(`"agent_id":${JSON.stringify(o.agentId)}`)
  if (o.agentType !== undefined) parts.push(`"agent_type":${JSON.stringify(o.agentType)}`)
  parts.push(`"hook_event_name":${JSON.stringify(event)}`)
  if (event === 'PostToolBatch') {
    parts.push(`"tool_calls":${JSON.stringify([{ tool_name: 'Bash', tool_input: o.toolInput ?? {} }])}`)
  } else {
    parts.push('"tool_name":"Bash"')
    parts.push(`"tool_input":${JSON.stringify(o.toolInput ?? { command: 'echo hi' })}`)
    parts.push('"tool_use_id":"toolu_01aaaaaaaaaaaaaaaaaaaaaa"')
  }
  return `{${parts.join(',')}}`
}

/** stdout, with stderr asserted empty — a hook that fires on every tool call
 *  must never leak a byte of noise, including from a failed redirect. */
function run(prdtHome: string, event: string, o: EventOpts): string {
  const res = spawnSync('bash', [HOOK], {
    input: eventJson(event, o),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: prdtHome },
  })
  expect(res.stderr).toBe('')
  expect(res.status).toBe(0)
  return res.stdout
}

/** n completed API turns for one worker. */
function turns(prdtHome: string, n: number, o: EventOpts): void {
  for (let i = 0; i < n; i++) run(prdtHome, 'PostToolBatch', o)
}

function runDir(prdtHome: string): string {
  return path.join(prdtHome, 'run', 'call-governor')
}

const worker = (cwd: string, agentType: string, agentId = 'a45b42f3cdda35348'): EventOpts => ({
  cwd, agentType, agentId,
})

// ── silence outside prdt projects ────────────────────────────────────────────

describe('outside a prdt project: total silence', () => {
  test('no .prdt/po-state.json anywhere up the chain → no stdout, no files', () => {
    const home = tmp('prdt-t491-home-')
    const notAProject = tmp('prdt-t491-bare-')
    for (const ev of ['PreToolUse', 'PostToolBatch']) {
      expect(run(home, ev, worker(notAProject, 'prdt-developer'))).toBe('')
    }
    expect(fs.existsSync(runDir(home))).toBe(false)
  })

  test('a marker further up the chain still counts as inside', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const deep = path.join(proj, 'code', 'packages', 'core')
    fs.mkdirSync(deep, { recursive: true })
    run(home, 'PostToolBatch', worker(deep, 'prdt-developer'))
    expect(fs.existsSync(runDir(home))).toBe(true)
  })
})

// ── fire evidence (what doctor reads) ────────────────────────────────────────

describe('fire evidence', () => {
  test('each registered event leaves its own .fired-<event> marker', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    run(home, 'PreToolUse', { cwd: proj })
    run(home, 'PostToolBatch', { cwd: proj })
    expect(fs.existsSync(path.join(runDir(home), '.fired-PreToolUse'))).toBe(true)
    expect(fs.existsSync(path.join(runDir(home), '.fired-PostToolBatch'))).toBe(true)
  })

  test('the main session (no agent_type) leaves evidence but is never counted', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    expect(run(home, 'PostToolBatch', { cwd: proj })).toBe('')
    expect(fs.existsSync(path.join(runDir(home), '.fired-PostToolBatch'))).toBe(true)
    expect(fs.readdirSync(runDir(home)).filter((f) => !f.startsWith('.'))).toEqual([])
  })

  test('an event the governor does not serve is ignored entirely', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    expect(run(home, 'PostToolUse', worker(proj, 'prdt-developer'))).toBe('')
    expect(fs.existsSync(path.join(runDir(home), '.fired-PostToolUse'))).toBe(false)
  })
})

// ── developer: warn at 40, deny at 60 ────────────────────────────────────────

describe('prdt-developer — enforced', () => {
  test('under the warn band: nothing is said', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 39, w)
    expect(run(home, 'PreToolUse', w)).toBe('')
  })

  test('at 40 completed turns: one warning, then quiet inside the same band', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 40, w)
    const out = JSON.parse(run(home, 'PreToolUse', w))
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined()
    const ctx = out.hookSpecificOutput.additionalContext as string
    expect(ctx).toContain('40')
    expect(ctx).toContain('unresolved')
    // the same band must not re-emit — a per-call warning would itself be a
    // token leak, which is the opposite of the point.
    expect(run(home, 'PreToolUse', w)).toBe('')
  })

  test('at 60 completed turns: deny, with the return instruction in the reason', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 60, w)
    const out = JSON.parse(run(home, 'PreToolUse', w))
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny')
    const reason = out.hookSpecificOutput.permissionDecisionReason as string
    // returning is not a tool — the deny must say so, or the worker sits there
    // retrying tools it can never get.
    expect(reason).toContain('summary')
    expect(reason).toContain('unresolved')
    expect(reason.toLowerCase()).toContain('not a tool')
  })

  test('the deny repeats on every subsequent call (no one-shot escape)', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 75, w)
    for (let i = 0; i < 3; i++) {
      const out = JSON.parse(run(home, 'PreToolUse', w))
      expect(out.hookSpecificOutput.permissionDecision).toBe('deny')
    }
  })
})

// ── qa / designer: warn only, never denied ───────────────────────────────────

describe('prdt-qa and prdt-designer — advisory only', () => {
  for (const persona of ['prdt-qa', 'prdt-designer']) {
    test(`${persona} is never denied, however long it runs`, () => {
      const home = tmp('prdt-t491-home-')
      const proj = makeProject()
      const w = worker(proj, persona)
      turns(home, 131, w)
      const out = run(home, 'PreToolUse', w)
      if (out !== '') {
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBeUndefined()
      }
    })
  }

  test('prdt-qa still gets a band warning at 40, and says it will not be cut off', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-qa')
    turns(home, 40, w)
    const ctx = JSON.parse(run(home, 'PreToolUse', w)).hookSpecificOutput.additionalContext as string
    expect(ctx).toContain('advisory')
    expect(run(home, 'PreToolUse', w)).toBe('')
  })
})

// ── keying ───────────────────────────────────────────────────────────────────

describe('counter keying', () => {
  test('two workers in the same session do not share a counter', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const a = worker(proj, 'prdt-developer', 'aaaa1111')
    const b = worker(proj, 'prdt-developer', 'bbbb2222')
    turns(home, 60, a)
    turns(home, 3, b)
    expect(JSON.parse(run(home, 'PreToolUse', a)).hookSpecificOutput.permissionDecision).toBe('deny')
    expect(run(home, 'PreToolUse', b)).toBe('')
  })

  test('the same agent_id in a different session starts fresh', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const a = { ...worker(proj, 'prdt-developer'), sessionId: SID }
    const b = { ...worker(proj, 'prdt-developer'), sessionId: '99999999-8888-7777-6666-555555555555' }
    turns(home, 60, a)
    expect(run(home, 'PreToolUse', b)).toBe('')
  })

  test('non-prdt agents are neither counted nor warned', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'general-purpose')
    turns(home, 70, w)
    expect(run(home, 'PreToolUse', w)).toBe('')
    expect(fs.readdirSync(runDir(home)).filter((f) => !f.startsWith('.'))).toEqual([])
  })

  test('prdt-po is out of scope — the orchestrator session is never governed', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-po')
    turns(home, 70, w)
    expect(run(home, 'PreToolUse', w)).toBe('')
  })
})

// ── tamper resistance ────────────────────────────────────────────────────────

describe('values are shape-matched, never trusted', () => {
  test('a forged agent_type inside tool_input cannot downgrade the persona', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 60, w)
    const forged = {
      command: 'echo "agent_type":"prdt-qa" "agent_type":"prdt-qa"',
      description: '"agent_type":"prdt-qa"',
    }
    const out = JSON.parse(run(home, 'PreToolUse', { ...w, toolInput: forged }))
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  test('a traversal-shaped session_id writes nothing and says nothing', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = { ...worker(proj, 'prdt-developer'), sessionId: '../../../../tmp/prdt-t491-escape' }
    expect(run(home, 'PostToolBatch', w)).toBe('')
    expect(run(home, 'PreToolUse', w)).toBe('')
    expect(fs.readdirSync(runDir(home)).filter((f) => !f.startsWith('.'))).toEqual([])
  })

  test('a traversal-shaped agent_id writes nothing and says nothing', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer', '../../x')
    expect(run(home, 'PostToolBatch', w)).toBe('')
    expect(run(home, 'PreToolUse', w)).toBe('')
    expect(fs.readdirSync(runDir(home)).filter((f) => !f.startsWith('.'))).toEqual([])
  })
})

// ── relative cwd: the one non-terminating path (T-491 R2-1) ─────────────────
//
// `DIR="${DIR%/*}"` is a no-op on a string with no `/` in it (bash parameter
// expansion returns the operand UNCHANGED when the pattern doesn't match, it
// does not empty it), so a relative DIR never shrinks and the up-walk spins
// forever. The harness always sends an absolute cwd so this path is normally
// unreachable, but it is the only non-`exit 0` path in a hook that fires on
// EVERY tool call — reached, it hangs to the hook timeout instead of failing
// open. Grill QA reproduced the hang from a scratch payload (killed at 3s);
// this pins the fix with a real subprocess timeout so a regression here fails
// the SUITE instead of hanging the test runner.

describe('relative cwd: fails open instead of spinning (T-491 R2-1)', () => {
  test('a relative cwd exits immediately — no hang, no output, no writes', () => {
    const home = tmp('prdt-t491-home-')
    const res = spawnSync('bash', [HOOK], {
      input: eventJson('PostToolBatch', worker('relative/path/no/leading/slash', 'prdt-developer')),
      encoding: 'utf8',
      env: { ...process.env, PRDT_HOME: home },
      timeout: 3000, // the bug hangs to the 60s hook timeout; 3s is generous slack
    })
    expect(res.signal).toBeNull() // null signal ⇒ it exited on its own, not killed by the timeout
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
    expect(res.stdout).toBe('')
    expect(fs.existsSync(runDir(home))).toBe(false)
  })

  test('a bare relative component (no "/" anywhere) — the exact non-shrinking case', () => {
    // `${DIR%/*}` on a string with no `/` returns the string AS-IS. This is the
    // narrowest reproduction: one path component, zero slashes.
    const home = tmp('prdt-t491-home-')
    const res = spawnSync('bash', [HOOK], {
      input: eventJson('PostToolBatch', worker('bare', 'prdt-developer')),
      encoding: 'utf8',
      env: { ...process.env, PRDT_HOME: home },
      timeout: 3000,
    })
    expect(res.signal).toBeNull()
    expect(res.status).toBe(0)
    expect(res.stdout).toBe('')
  })
})

// ── header window: the 8KB truncation is load-bearing (T-491 R2-3) ──────────
//
// The existing tamper-resistance test ("a forged agent_type inside tool_input
// cannot downgrade the persona") passes for a DIFFERENT reason than
// truncation: JSON.stringify escapes the quotes in a forged `"agent_type":"…"`
// sitting inside a string value, so it never forms a literal, matchable key —
// grill QA confirmed the whole suite stays green even with `HDR="${EV:0:8192}"`
// deleted outright. That proves escaping is doing the tamper-resistance work,
// not the window. This block instead pins the window itself: it grows a field
// this hook never reads (`transcript_path`, harness-controlled and unbounded
// in principle — the exact "pathological cwd" scenario named in the code
// comment) until a REAL, unescaped key straddles byte 8192, and shows the
// hook's behavior flips exactly there.

describe('header window: the 8KB truncation actually cuts (T-491 R2-3)', () => {
  test('a real key one byte inside the window is read; one byte past it is truncated away', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const HOOK_KEY = '"hook_event_name":"PostToolBatch"'

    const build = (padLen: number): string => {
      const parts = [
        `"session_id":${JSON.stringify(SID)}`,
        `"transcript_path":${JSON.stringify('x'.repeat(padLen))}`,
        `"cwd":${JSON.stringify(proj)}`,
        '"prompt_id":"11111111-2222-3333-4444-555555555555"',
        '"permission_mode":"default"',
        '"agent_id":"a45b42f3cdda35348"',
        '"agent_type":"prdt-developer"',
        HOOK_KEY,
        '"tool_calls":[{"tool_name":"Bash","tool_input":{}}]',
      ]
      return `{${parts.join(',')}}`
    }

    // Padding is plain ASCII with nothing to escape, so growing padLen by n
    // shifts every later byte by exactly n — solve directly instead of
    // searching.
    const probe = build(0)
    const lastCharIndex0 = probe.indexOf(HOOK_KEY) + HOOK_KEY.length - 1
    const padFits = 8191 - lastCharIndex0 // HOOK_KEY's last byte lands on index 8191 (last byte HDR keeps)
    const padExcludes = padFits + 1 // shifts that same byte to index 8192 (first byte HDR drops)
    expect(padFits).toBeGreaterThanOrEqual(0)

    const fits = build(padFits)
    expect(fits.indexOf(HOOK_KEY) + HOOK_KEY.length - 1).toBe(8191)
    const excludes = build(padExcludes)
    expect(excludes.indexOf(HOOK_KEY) + HOOK_KEY.length - 1).toBe(8192)

    const runOne = (input: string) =>
      spawnSync('bash', [HOOK], { input, encoding: 'utf8', env: { ...process.env, PRDT_HOME: home } })

    // Inside the window (by exactly one byte): a normal, well-formed
    // PostToolBatch for a real prdt-developer worker in a real project —
    // fire evidence gets written.
    const r1 = runOne(fits)
    expect(r1.stderr).toBe('')
    expect(r1.status).toBe(0)
    expect(fs.existsSync(path.join(runDir(home), '.fired-PostToolBatch'))).toBe(true)

    // One byte later: `hook_event_name` loses its closing quote to the cut,
    // RE_EVENT never matches, and the hook exits before it even reaches the
    // project gate — same well-formed payload, total silence instead.
    const home2 = tmp('prdt-t491-home-')
    const r2 = spawnSync('bash', [HOOK], {
      input: excludes,
      encoding: 'utf8',
      env: { ...process.env, PRDT_HOME: home2 },
    })
    expect(r2.stderr).toBe('')
    expect(r2.status).toBe(0)
    expect(r2.stdout).toBe('')
    expect(fs.existsSync(runDir(home2))).toBe(false)
  })
})

// ── latency budget ───────────────────────────────────────────────────────────

describe('latency', () => {
  test('the hot path stays under the T-491 budget (med ≤15ms, p95 ≤40ms)', () => {
    const home = tmp('prdt-t491-home-')
    const proj = makeProject()
    const w = worker(proj, 'prdt-developer')
    turns(home, 45, w)
    const samples: number[] = []
    for (let i = 0; i < 40; i++) {
      const t0 = process.hrtime.bigint()
      run(home, 'PreToolUse', w)
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6)
    }
    samples.sort((a, b) => a - b)
    // Measured through Node's spawn, so this asserts a CEILING generous enough
    // not to flake on a loaded CI box; the real numbers are in the ticket
    // Outcome (hyperfine-style loop, reported per T-491).
    expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(60)
  })
})
