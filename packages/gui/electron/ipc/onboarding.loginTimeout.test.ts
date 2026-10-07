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
 *
 * T-790: the URL-wait timer runs on a FAKE clock (only setTimeout/clearTimeout
 * are faked); the child process and its pipes stay real. The earlier form armed
 * a real 150 ms timer and read the events after a fixed 600/700 ms window, so the
 * outcome depended on how fast the host started bash and `sleep 0.3`: under host
 * load 41-57 (2026-10-07) the child had not exited when the window closed and
 * `exits` was empty. Reproduced by stretching the child's post-echo sleep to
 * 0.8 s — tests 2 and 3 fail exactly that way. Now the test decides WHEN the
 * timer is due (advanceTimersByTime) and when the child exits (a release file),
 * and every wait is "until the event arrives", bounded by a generous deadline.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { startHiddenLogin } from './onboarding'

interface Emitted { channel: string; payload: any }

// captured before any test fakes the clock — the polling below must stay real
const realSetTimeout = globalThis.setTimeout
const realSleep = (ms: number) => new Promise<void>((r) => realSetTimeout(r, ms))

/** Poll (on the REAL clock) until `pred` holds; false after `deadlineMs`. */
async function until(pred: () => boolean, deadlineMs = 20_000): Promise<boolean> {
  const end = Date.now() + deadlineMs
  while (Date.now() < end) {
    if (pred()) return true
    await realSleep(20)
  }
  return pred()
}

const URL_WAIT_MS = 150
const dirs: string[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** A fake CLI that prints `line`, writes its pid, then stays alive until the test
 *  creates the release file (capped at ~30 s so a failed test never strands it). */
function fakeCli(line: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t790-login-'))
  dirs.push(dir)
  const release = path.join(dir, 'release')
  const pidFile = path.join(dir, 'pid')
  const script = [
    `echo "${line}"`,
    `echo $$ > "${pidFile}"`,
    `i=0; while [ ! -e "${release}" ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done`,
  ].join('\n')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const emitted: Emitted[] = []
  const res = startHiddenLogin('claude', {
    cmd: '/bin/bash',
    args: ['-c', script],
    urlWaitMs: URL_WAIT_MS,
    emit: (channel, payload) => emitted.push({ channel, payload }),
  })
  expect(res.ok).toBe(true)
  const exits = () => emitted.filter((e) => e.channel === 'onboarding:login-exit')
  const pid = () => { try { return Number(fs.readFileSync(pidFile, 'utf8').trim()) || 0 } catch { return 0 } }
  const alive = (p: number) => { try { process.kill(p, 0); return true } catch { return false } }
  return { emitted, exits, release: () => fs.writeFileSync(release, ''), pid, alive }
}

describe('startHiddenLogin bounded URL wait', () => {
  it('kills the child and emits a single auth-url-timeout exit when no URL is recognized', async () => {
    const cli = fakeCli('Signing you in...')
    // the child is up and has printed its (unrecognized) line
    expect(await until(() => cli.pid() > 0)).toBe(true)
    vi.advanceTimersByTime(URL_WAIT_MS + 1)
    const exits = cli.exits()
    expect(exits).toHaveLength(1)
    expect(exits[0].payload).toMatchObject({ engine: 'claude', error: 'auth-url-timeout' })
    // the kill took effect: the child is gone (reaped) ...
    const pid = cli.pid()
    expect(await until(() => !cli.alive(pid))).toBe(true)
    // ... and its own 'exit' event — delivered in the same loop turn as the reap,
    // so a few real ticks later — did not emit a second login-exit
    await realSleep(200)
    expect(cli.exits()).toHaveLength(1)
    expect(cli.emitted.some((e) => e.channel === 'onboarding:login-url')).toBe(false)
  })

  it('a URL in time disarms the timer — natural exit, no timeout error', async () => {
    const cli = fakeCli('open https://example.com/oauth?x=1')
    expect(await until(() => cli.emitted.some((e) => e.channel === 'onboarding:login-url'))).toBe(true)
    expect(cli.emitted.find((e) => e.channel === 'onboarding:login-url')!.payload.url)
      .toBe('https://example.com/oauth?x=1')
    // the bounded wait is now overdue while the child is still alive — disarmed, it never fires
    vi.advanceTimersByTime(URL_WAIT_MS * 10)
    expect(cli.exits()).toHaveLength(0)
    cli.release()
    expect(await until(() => cli.exits().length > 0)).toBe(true)
    const exits = cli.exits()
    expect(exits).toHaveLength(1)
    expect(exits[0].payload.error).toBeUndefined()
    expect(exits[0].payload.code).toBe(0)
  })

  it('a paste-code prompt (URL-less flow) also disarms the timer', async () => {
    const cli = fakeCli('Paste code here if prompted >')
    expect(await until(() => cli.emitted.some((e) => e.channel === 'onboarding:login-needs-code'))).toBe(true)
    vi.advanceTimersByTime(URL_WAIT_MS * 10)
    expect(cli.exits()).toHaveLength(0)
    cli.release()
    expect(await until(() => cli.exits().length > 0)).toBe(true)
    const exits = cli.exits()
    expect(exits).toHaveLength(1)
    expect(exits[0].payload.error).toBeUndefined()
  })
})
