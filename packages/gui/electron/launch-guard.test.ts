/**
 * launch-guard.test.ts — T-442 GUI-boot misfire detection.
 *
 * The 2026-07-30 runaway: a toolchain shim exec'd the app binary with
 * ELECTRON_RUN_AS_NODE=1 exported, but the binary's RunAsNode fuse was
 * disabled, so the env var was INERT and a full GUI booted — whose startup
 * spawned more copies of itself, one generation at a time, until the machine
 * hung. The invariant this module pins: if GUI main-process code is executing
 * AT ALL while ELECTRON_RUN_AS_NODE is set in the environment, the launch is a
 * misfire (something intended node semantics and got a GUI) and the only safe
 * move is to exit before any window, IPC, or provisioning side effect.
 */

import { describe, it, expect } from 'vitest'
import { isShimMisfire } from './launch-guard'

describe('isShimMisfire (T-442)', () => {
  it('any non-empty ELECTRON_RUN_AS_NODE seen from GUI code is a misfire', () => {
    expect(isShimMisfire({ ELECTRON_RUN_AS_NODE: '1' })).toBe(true)
    // Electron treats ANY non-empty value as truthy for this var — mirror that.
    expect(isShimMisfire({ ELECTRON_RUN_AS_NODE: 'true' })).toBe(true)
    expect(isShimMisfire({ ELECTRON_RUN_AS_NODE: '0' })).toBe(true)
  })

  it('a normal GUI launch is not a misfire', () => {
    expect(isShimMisfire({})).toBe(false)
    expect(isShimMisfire({ ELECTRON_RUN_AS_NODE: '' })).toBe(false)
    expect(isShimMisfire({ PATH: '/usr/bin' })).toBe(false)
  })
})
