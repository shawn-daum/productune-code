/**
 * prdt-preflight-canary.test.ts — T-525 model availability preflight, black-box
 * over the REAL `prdt` CLI (mirrors prdt-tickets-assignee.test.ts).
 *
 * Root cause (T-525, five occurrences): a dispatch is spawned onto a model whose
 * account window has closed, and dies at the execution layer with half its work
 * on disk — or none, indistinguishable from the return alone. The probe that
 * would have prevented it costs seconds and cents.
 *
 * THE RISK THIS CHANGE ITSELF CREATES is a FALSE UNAVAILABLE, and most of the
 * cases below exist to pin the failure DIRECTION rather than the feature: a
 * probe that cannot tell must report `inconclusive` and leave the tier exactly
 * where the menu put it. A silent downgrade is the loss the ticket records the
 * PO making by hand on T-536, and building a machine that repeats it would be
 * worse than shipping nothing.
 *
 * The `claude` executable is replaced by a shim (`PRDT_CANARY_BIN`) so both
 * verdicts are observable without an actually-limited account. A preflight
 * never seen say "no" is not verified.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

let sandbox: string
let prdtHome: string
let shim: string

/** The observed limit reply, verbatim (T-525 §실측) — curly apostrophe included. */
const OBSERVED_LIMIT =
  'You’ve reached your Fable 5 limit. Switch to another model to continue.'

/**
 * Stand-in for `claude -p`. FAKE_MODE picks the envelope shape, FAKE_MSG the
 * text. Written in python for the same reason the CLI is: quoting a message
 * that contains an apostrophe through a bash shim is how the first draft of
 * this fixture silently produced an exit-2 no-op on every case.
 */
const SHIM = `#!/usr/bin/env python3
import json, os, sys, time
msg = os.environ.get("FAKE_MSG") or ${JSON.stringify(OBSERVED_LIMIT)}
mode = os.environ.get("FAKE_MODE", "success")
def emit(d): print(json.dumps(d))
if mode == "success":
    emit({"type":"result","subtype":"success","is_error":False,"api_error_status":None,
          "total_cost_usd":0.0005,"duration_ms":900,
          "usage":{"input_tokens":2,"output_tokens":18},"result":msg})
elif mode == "ok":
    emit({"type":"result","subtype":"success","is_error":False,"api_error_status":None,
          "total_cost_usd":0.0005,"duration_ms":800,
          "usage":{"input_tokens":2,"output_tokens":4},"result":"OK"})
elif mode == "http429":
    emit({"type":"result","subtype":"error_during_execution","is_error":True,
          "api_error_status":429,"total_cost_usd":0,"duration_ms":120,"result":"opaque"})
elif mode == "authfail":
    emit({"type":"result","subtype":"error_during_execution","is_error":True,
          "api_error_status":401,"total_cost_usd":0,"duration_ms":80,
          "result":"Invalid API key. Please run /login."})
elif mode == "neterr":
    sys.stderr.write("fetch failed: ECONNREFUSED\\n"); sys.exit(1)
elif mode == "plain":
    print(msg)
elif mode == "optionerror":
    if "--agents" in sys.argv:
        sys.stderr.write("error: unknown option '--agents'\\n"); sys.exit(1)
    emit({"type":"result","subtype":"success","is_error":False,"api_error_status":None,
          "total_cost_usd":0.03,"duration_ms":800,
          "usage":{"input_tokens":2,"output_tokens":4},"result":"OK"})
elif mode == "hang":
    time.sleep(30)
`

type Verdict = {
  model: string
  fallback: string | null
  status: 'available' | 'unavailable' | 'inconclusive' | 'cleared'
  reason: string
  route: string | null
  downgraded: boolean
  latch: { state: string; ttl_min?: number }
  probe: { ran: boolean; wall_ms?: number; cost_usd?: number; retried_bare?: boolean }
  note: string
}

function preflight(args: string[], env: Record<string, string> = {}): Verdict {
  const out = execFileSync('python3', [PRDT_CLI, 'preflight', ...args], {
    cwd: sandbox,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
    env: {
      ...process.env,
      PRDT_HOME: prdtHome,
      PRDT_CANARY_BIN: shim,
      CLAUDE_CODE_SESSION_ID: 'sess-aaaaaaaa',
      ...env,
    },
  })
  // The stdout contract: one JSON object, nothing else. A caller that has to
  // pick JSON out of chatter is a caller that will eventually mis-parse a
  // verdict, and the only direction that mis-parses dangerously is "no".
  return JSON.parse(out) as Verdict
}

function latchFile(model: string, session = 'sess-aaaaaaaa'): string {
  return path.join(prdtHome, 'run', 'preflight', `${session}.${model}.json`)
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-preflight-'))
  prdtHome = path.join(sandbox, 'prdt-home')
  shim = path.join(sandbox, 'fake-claude')
  fs.writeFileSync(shim, SHIM, { mode: 0o755 })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('verdict: unavailable', () => {
  test('the observed limit reply, verbatim, routes to the fallback tier', () => {
    const v = preflight(['fable'])
    expect(v.status).toBe('unavailable')
    expect(v.route).toBe('opus')          // habit's ladder, same effort
    expect(v.downgraded).toBe(true)
    expect(v.latch.state).toBe('set')
  })

  test.each([
    ['reworded, different clock', 'Fable 5 usage limit reached. Try again after 8:00 PM.'],
    ['different noun + recovery', 'You have exceeded your quota for this model; it resets at midnight UTC.'],
    ['status code only', '429 Too Many Requests'],
    ['localized (ko)', 'Opus 5 한도를 모두 소진했습니다. 다른 모델로 전환하세요.'],
    ['different period + remedy', 'Your weekly allowance is exhausted — upgrade to continue.'],
    ['terse', 'Rate limited. Please retry later.'],
    ['reordered clauses', 'Model temporarily unavailable until 20:00 — your limit has been reached.'],
  ])('detector still fires when the message text is altered: %s', (_label, msg) => {
    // The acceptance clause: match the FAILURE MODE, not the current sentence.
    const v = preflight(['sonnet', '--fallback', 'haiku'], { FAKE_MSG: msg })
    expect(v.status).toBe('unavailable')
    expect(v.route).toBe('haiku')
  })

  test('a transport 429 with no prose at all is caught', () => {
    const v = preflight(['fable'], { FAKE_MODE: 'http429' })
    expect(v.status).toBe('unavailable')
    expect(v.reason).toBe('transport-429')
  })

  test('a limit printed with no JSON envelope is caught', () => {
    const v = preflight(['fable'], { FAKE_MODE: 'plain' })
    expect(v.status).toBe('unavailable')
    expect(v.reason).toBe('plain-limit-shape')
  })
})

describe('verdict: available', () => {
  test('a healthy model keeps its tier and writes no latch', () => {
    const v = preflight(['fable'], { FAKE_MODE: 'ok' })
    expect(v.status).toBe('available')
    expect(v.route).toBe('fable')
    expect(v.downgraded).toBe(false)
    expect(fs.existsSync(latchFile('fable'))).toBe(false)
  })
})

describe('failure direction: an inconclusive probe NEVER downgrades a tier', () => {
  // Each case is a way the probe can fail that is NOT a closed window. Reporting
  // any of them as `unavailable` would strand a healthy model on the fallback
  // tier — the exact silent downgrade this ticket exists to stop.
  test.each([
    ['auth error inside an error envelope', { FAKE_MODE: 'authfail' }, 'probe-error-envelope'],
    ['network error, non-zero exit', { FAKE_MODE: 'neterr' }, 'no-envelope'],
    ['unparseable output', { FAKE_MODE: 'plain', FAKE_MSG: 'garbage' }, 'no-envelope'],
    ['a reply that is neither the sentinel nor a limit', { FAKE_MSG: 'Sure, happy to help!' }, 'unexpected-reply'],
  ])('%s', (_label, env, reason) => {
    const v = preflight(['fable'], env as Record<string, string>)
    expect(v.status).toBe('inconclusive')
    expect(v.reason).toBe(reason)
    expect(v.route).toBe('fable')       // NOT the fallback
    expect(v.downgraded).toBe(false)
    expect(fs.existsSync(latchFile('fable'))).toBe(false)
    expect(v.note).toMatch(/NOT a limit/)
  })

  test('a timeout is inconclusive, not a limit', () => {
    const v = preflight(['fable', '--timeout', '2'], { FAKE_MODE: 'hang' })
    expect(v.status).toBe('inconclusive')
    expect(v.reason).toBe('probe-timeout')
    expect(v.route).toBe('fable')
  })

  test('a missing claude binary is inconclusive, not a limit', () => {
    const v = preflight(['fable'], { PRDT_CANARY_BIN: path.join(sandbox, 'nope') })
    expect(v.status).toBe('inconclusive')
    expect(v.reason).toBe('probe-binary-missing')
    expect(v.route).toBe('fable')
  })

  test('a long reply that merely mentions limits is not a limit notice', () => {
    // The reply-length cap. A model rambling about limits is a model doing
    // something else, not a window closing.
    const v = preflight(['fable'], {
      FAKE_MSG:
        'Here is a long essay about rate limits and quotas. '.repeat(12) +
        'They are reached when usage is exceeded and reset later.',
    })
    expect(v.status).toBe('inconclusive')
    expect(v.downgraded).toBe(false)
  })

  test('a renamed CLI flag self-heals to a bare probe instead of becoming a no-op', () => {
    const v = preflight(['fable'], { FAKE_MODE: 'optionerror' })
    expect(v.status).toBe('available')
    expect(v.probe.retried_bare).toBe(true)
  })
})

describe('session latch', () => {
  test('a second dispatch at that tier routes to the fallback with NO second probe', () => {
    expect(preflight(['fable']).latch.state).toBe('set')
    // The binary is removed for the second call: if anything probed, the verdict
    // would be `inconclusive`/probe-binary-missing rather than a latch hit.
    const v = preflight(['fable'], { PRDT_CANARY_BIN: path.join(sandbox, 'nope') })
    expect(v.status).toBe('unavailable')
    expect(v.reason).toBe('latch')
    expect(v.probe.ran).toBe(false)
    expect(v.route).toBe('opus')
  })

  test('the latch is per-MODEL: a fable latch does not silence opus', () => {
    preflight(['fable'])
    const v = preflight(['opus'], { FAKE_MODE: 'ok' })
    expect(v.status).toBe('available')
    expect(v.route).toBe('opus')
  })

  test('the latch is session-scoped: another session probes fresh', () => {
    preflight(['fable'])
    const v = preflight(['fable'], { FAKE_MODE: 'ok', CLAUDE_CODE_SESSION_ID: 'sess-bbbbbbbb' })
    expect(v.status).toBe('available')
  })

  test('an expired latch is dropped and the model is probed again', () => {
    preflight(['fable'])
    const f = latchFile('fable')
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'))
    d.at = '2020-01-01T00:00:00Z'
    fs.writeFileSync(f, JSON.stringify(d))
    const v = preflight(['fable'], { FAKE_MODE: 'ok' })
    expect(v.status).toBe('available')
    expect(fs.existsSync(f)).toBe(false)
  })

  test('--clear drops the latch without probing', () => {
    preflight(['fable'])
    const v = preflight(['fable', '--clear'], { PRDT_CANARY_BIN: path.join(sandbox, 'nope') })
    expect(v.latch.state).toBe('cleared')
    expect(v.probe.ran).toBe(false)
    expect(fs.existsSync(latchFile('fable'))).toBe(false)
  })
})

describe('quota kill is not task failure', () => {
  // The written-rule defect T-525 records: a dispatch killed by the account
  // window was answered by dropping the tier, on the assumption the window was
  // still closed. It had already reopened. These are the two paths, separately.
  test('window has reopened -> --recheck routes BACK to the model and clears the latch', () => {
    preflight(['fable'])                                    // window closed, latch set
    const v = preflight(['fable', '--recheck'], { FAKE_MODE: 'ok' })
    expect(v.status).toBe('available')
    expect(v.route).toBe('fable')
    expect(v.downgraded).toBe(false)
    expect(v.latch.state).toBe('cleared')
    expect(fs.existsSync(latchFile('fable'))).toBe(false)
  })

  test('window is still closed -> --recheck confirms the fallback', () => {
    preflight(['fable'])
    const v = preflight(['fable', '--recheck'])
    expect(v.status).toBe('unavailable')
    expect(v.route).toBe('opus')
    expect(v.probe.ran).toBe(true)                          // it re-probed, it did not assume
  })
})

describe('contract', () => {
  test('the probe reports its own cost and latency', () => {
    // "placing it before every floor dispatch is justified rather than assumed"
    // — the numbers have to come back with the verdict or nobody can check.
    const v = preflight(['fable'], { FAKE_MODE: 'ok' })
    expect(typeof v.probe.wall_ms).toBe('number')
    expect(typeof v.probe.cost_usd).toBe('number')
  })

  test('no remaining-quota or window field is ever claimed', () => {
    // T-525: those are confirmed NOT machine-readable. A field named for one
    // would be a fabrication the PO would route on.
    const raw = JSON.stringify(preflight(['fable'], { FAKE_MODE: 'ok' }))
    expect(raw).not.toMatch(/remaining|resets_at|window_|quota_left|percent/i)
  })

  test('a traversal-shaped model argument writes nothing', () => {
    expect(() => preflight(['../../../etc/passwd'])).toThrow()
    expect(fs.existsSync(path.join(prdtHome, 'run'))).toBe(false)
  })
})
