/**
 * startHiddenLogin bounded URL wait (T-439).
 *
 * The auth-URL detection is stdout string-matching against the CLI — when the
 * output format drifts and no URL / paste-code prompt is ever recognized, the
 * renderer used to spin forever. Proves, against a FAKE CLI (bash printing
 * controlled output — the acceptance's "CLI whose output carries no
 * recognizable URL"):
 *   1. no recognizable URL within the bounded wait → the child is killed and
 *      exactly ONE login-exit with error 'auth-url-timeout' is emitted
 *      (no double-emit from the kill's own exit event);
 *   2. a URL arriving in time disarms the timer — login-url is emitted and the
 *      natural exit carries no timeout error;
 *   3. a paste-code prompt (URL-less variant) also disarms the timer.
 *
 * Events are captured via the injectable `emit` — no BrowserWindow involved.
 */

import { describe, it, expect } from 'vitest'
import { startHiddenLogin } from './onboarding'

interface Emitted { channel: string; payload: any }

function collectFor(ms: number, emitted: Emitted[]): Promise<Emitted[]> {
  return new Promise((resolve) => setTimeout(() => resolve(emitted), ms))
}

function fakeCli(shellLine: string, urlWaitMs: number): Emitted[] {
  const emitted: Emitted[] = []
  const res = startHiddenLogin('claude', {
    cmd: '/bin/bash',
    args: ['-c', shellLine],
    urlWaitMs,
    emit: (channel, payload) => emitted.push({ channel, payload }),
  })
  expect(res.ok).toBe(true)
  return emitted
}

describe('startHiddenLogin bounded URL wait', () => {
  it('kills the child and emits a single auth-url-timeout exit when no URL is recognized', async () => {
    const emitted = fakeCli('echo "Signing you in..."; sleep 5', 150)
    await collectFor(600, emitted)
    const exits = emitted.filter((e) => e.channel === 'onboarding:login-exit')
    expect(exits).toHaveLength(1)
    expect(exits[0].payload).toMatchObject({ engine: 'claude', error: 'auth-url-timeout' })
    expect(emitted.some((e) => e.channel === 'onboarding:login-url')).toBe(false)
  })

  it('a URL in time disarms the timer — natural exit, no timeout error', async () => {
    const emitted = fakeCli('echo "open https://example.com/oauth?x=1"; sleep 0.3', 150)
    await collectFor(700, emitted)
    expect(emitted.some((e) => e.channel === 'onboarding:login-url'
      && e.payload.url === 'https://example.com/oauth?x=1')).toBe(true)
    const exits = emitted.filter((e) => e.channel === 'onboarding:login-exit')
    expect(exits).toHaveLength(1)
    expect(exits[0].payload.error).toBeUndefined()
    expect(exits[0].payload.code).toBe(0)
  })

  it('a paste-code prompt (URL-less flow) also disarms the timer', async () => {
    const emitted = fakeCli('echo "Paste code here if prompted >"; sleep 0.3', 150)
    await collectFor(700, emitted)
    expect(emitted.some((e) => e.channel === 'onboarding:login-needs-code')).toBe(true)
    const exits = emitted.filter((e) => e.channel === 'onboarding:login-exit')
    expect(exits).toHaveLength(1)
    expect(exits[0].payload.error).toBeUndefined()
  })
})
