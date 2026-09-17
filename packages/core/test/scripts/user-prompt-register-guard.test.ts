/**
 * prdt-user-prompt.sh — register-resolver discard guard (T-627 round 3, repair
 * 1 of 2).
 *
 * THE FAULT: this hook calls its own register resolver (`prdt-audience-inject.sh
 * --binding`) with a hardcoded 5 s limit. When that limit is exceeded — measured
 * on this machine (1 run in 10 at 6.22 s under load 13–15, live markers showing
 * `dur_ms 5011`/`5019`) — the call was simply swallowed: `except Exception: pass`.
 * The `[prdt register] …` line and a FAILED-to-produce-one line look byte-for-byte
 * identical (both are "no register line"), so the PO cannot tell a default-valued
 * register from a lost one. 87 of 1,084 state deliveries since 2026-09-15 carried
 * no register line although the register has been non-default since 2026-09-08.
 *
 * THE REPAIR does not touch the 5 s limit (no measurement justifies a new
 * number) and does not know anything about what the line would have said — the
 * resolver stays the SOLE authority on which register values are legal
 * (contracts §Fixed paths). It only turns silent failure into a fixed,
 * resolver-domain-free notice: "the binding could not be confirmed this turn",
 * never a guess at audience/form/structure/address.
 *
 * Every mode below is produced by a REAL stub resolver under the hook's own
 * subprocess call — a real `sleep` past the real 5 s limit, a real non-zero
 * exit, a real "prints nothing" default, a real passthrough line — not a
 * fixture asserting what "would" happen.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-user-prompt.sh')
const REGISTER_GUARD = '[prdt register guard]'
const BUILD_STATE = { schema_version: 1, stage: 'build', version: 'v1', current_task: null }

/** Throwaway project + its own sandbox PRDT_HOME (never the real ~/.prdt). */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t627r-'))
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), JSON.stringify(BUILD_STATE))
  const prdtHome = path.join(root, 'prdthome')
  fs.mkdirSync(prdtHome, { recursive: true })
  return { root, proj, prdtHome }
}

/**
 * A copy of the REAL hook beside a STUB `prdt-audience-inject.sh` whose whole
 * body is `script` — the hook resolves its resolver from its own BASH_SOURCE
 * dir, so this exercises the actual subprocess.run call site with no edit to
 * the hook and no injected test-only branch.
 */
function makeStubResolverHookDir(root: string, name: string, script: string): string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  const hook = path.join(dir, 'prdt-user-prompt.sh')
  fs.copyFileSync(HOOK, hook)
  fs.writeFileSync(path.join(dir, 'prdt-audience-inject.sh'), script)
  return hook
}

function event(cwd: string, sid: string, prompt = 'hello') {
  return JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sid, cwd, prompt })
}

/** Run the hook to completion; returns its additionalContext. */
function run(hook: string, cwd: string, sid: string, env: NodeJS.ProcessEnv = {}): string {
  const out = execFileSync('bash', [hook], {
    input: event(cwd, sid), encoding: 'utf8', env: { ...process.env, ...env },
  })
  const parsed = JSON.parse(out)
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
  return parsed.hookSpecificOutput.additionalContext as string
}

describe('resolver call really times out — the drop is no longer silent', () => {
  test('a resolver that really sleeps past the real 5s limit is reported, not swallowed', () => {
    const sb = makeSandbox()
    const hook = makeStubResolverHookDir(sb.root, 'slow-resolver',
      '#!/usr/bin/env bash\nsleep 6\necho "[prdt register] audience=developer"\n')

    const ctx = run(hook, sb.proj, 'sess-reg-timeout', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')                 // state line is unaffected
    expect(ctx).toContain(REGISTER_GUARD)
    expect(ctx).toContain('exceeded its 5s limit')
    expect(ctx).toContain('NOT the same as a default register')
    expect(ctx).toContain('UNKNOWN')
    // no [prdt register] line was produced — the call never got to answer
    expect(ctx).not.toMatch(/^\[prdt register\] /m)
    // the notice must not smuggle in register DOMAIN knowledge (T-627 condition:
    // the resolver stays the sole authority on legal values — saying the line is
    // unavailable is fine, saying what it would have contained is not)
    expect(ctx).not.toMatch(/audience=|form=|structure=|address=/)
  }, 20000)
})

describe('resolver call really fails — the drop is no longer silent', () => {
  test('a resolver that really exits non-zero is reported, not swallowed', () => {
    const sb = makeSandbox()
    const hook = makeStubResolverHookDir(sb.root, 'failing-resolver',
      '#!/usr/bin/env bash\nexit 3\n')

    const ctx = run(hook, sb.proj, 'sess-reg-fail', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).toContain(REGISTER_GUARD)
    expect(ctx).toContain('resolver exited non-zero')
    expect(ctx).toContain('NOT the same as a default register')
    expect(ctx).not.toMatch(/^\[prdt register\] /m)
  })
})

describe('the repair changes nothing about a healthy call', () => {
  test('a resolver that legitimately prints a binding still passes it through untouched', () => {
    const sb = makeSandbox()
    const hook = makeStubResolverHookDir(sb.root, 'ok-resolver',
      '#!/usr/bin/env bash\necho "[prdt register] audience=developer"\n')

    const ctx = run(hook, sb.proj, 'sess-reg-ok', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).toContain('[prdt register] audience=developer')
    expect(ctx).not.toContain(REGISTER_GUARD)
  })

  test('a resolver that legitimately prints nothing (default register) stays silent — no accusation', () => {
    const sb = makeSandbox()
    const hook = makeStubResolverHookDir(sb.root, 'default-resolver',
      '#!/usr/bin/env bash\nexit 0\n')

    const ctx = run(hook, sb.proj, 'sess-reg-default', { PRDT_HOME: sb.prdtHome })
    expect(ctx).toContain('stage=build')
    expect(ctx).not.toMatch(/^\[prdt register\] /m)
    expect(ctx).not.toContain(REGISTER_GUARD)
  })
})
