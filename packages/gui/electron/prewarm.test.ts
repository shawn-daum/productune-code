/**
 * prewarm.test.ts — the onboarding Playwright-MCP prewarm must never fail
 * silently again (T-440): it resolves with an explicit state, and its child
 * runs under the toolchain-augmented PATH (asserted via an env-echo command).
 */

import { describe, it, expect } from 'vitest'
import { prewarmPlaywrightMcp } from './prewarm'
import { toolchainBinDir } from './toolchain'

describe('prewarmPlaywrightMcp', () => {
  it('exit 0 → ready', async () => {
    const res = await prewarmPlaywrightMcp({ command: 'exit 0' })
    expect(res.state).toBe('ready')
  })

  it('non-zero exit → failed, with an output tail as detail', async () => {
    const res = await prewarmPlaywrightMcp({ command: 'echo boom-detail 1>&2; exit 3' })
    expect(res.state).toBe('failed')
    expect(res.detail).toContain('boom-detail')
  })

  it('missing command (the fresh-Mac npx case) → failed, not a silent resolve', async () => {
    const res = await prewarmPlaywrightMcp({
      command: 'definitely-not-a-real-cli-t440 --help',
      env: { PATH: '/usr/bin:/bin' },
    })
    expect(res.state).toBe('failed')
  })

  it('hang → timeout state (child killed)', async () => {
    const res = await prewarmPlaywrightMcp({ command: 'sleep 30', timeoutMs: 200 })
    expect(res.state).toBe('timeout')
  })

  it('child PATH carries the app toolchain bin dir (last), so npx resolves on a fresh Mac', async () => {
    const res = await prewarmPlaywrightMcp({ command: 'echo "$PATH"' })
    expect(res.state).toBe('ready')
    const last = (res.detail ?? '').trim().split(':').pop()
    expect(last).toBe(toolchainBinDir())
  })
})
