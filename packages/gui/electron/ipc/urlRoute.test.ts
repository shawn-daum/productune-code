/**
 * urlRoute.test.ts — T-434
 *
 * The question the acceptance actually asks: does the system browser call
 * HAPPEN? Everything above this file works with injected sinks, which proves the
 * decision but not the wiring. This one mocks `electron` and asserts on the real
 * `shell.openExternal`, through the same `url:route` channel the renderer calls.
 *
 * File-level vi.mock overrides vitest.setup's electron stub (which has no
 * `shell`) — the spy has to be reachable from the assertions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const openExternal = vi.fn()
const handlers = new Map<string, (event: unknown, ...args: any[]) => unknown>()

vi.mock('electron', () => ({
  shell: { openExternal: (url: string) => openExternal(url) },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => {
      handlers.set(channel, fn)
    },
    on: vi.fn(),
    off: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0' },
}))

import { register, routeAndOpenExternal } from './urlRoute'

/** Call the registered `url:route` handler the way the renderer's invoke would. */
function invokeChannel(req: { url: string; authIntent?: boolean }) {
  const fn = handlers.get('url:route')
  if (!fn) throw new Error('url:route was never registered')
  return fn(null, req) as { target: string; reason: string; matched?: string }
}

beforeEach(() => {
  openExternal.mockClear()
})

describe('register()', () => {
  it('registers exactly the url:route channel', () => {
    register()
    expect(handlers.has('url:route')).toBe(true)
  })
})

describe('the four acceptance variants, through the real IPC handler', () => {
  it('(1) PO-flagged auth URL → shell.openExternal is called', () => {
    register()
    const d = invokeChannel({ url: 'https://console.acme.example/app', authIntent: true })
    expect(d.target).toBe('system-browser')
    expect(d.reason).toBe('producer-intent')
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://console.acme.example/app')
  })

  it('(2) plain doc / deployed-site URL → openExternal NOT called, caller opens a pane', () => {
    register()
    const d = invokeChannel({ url: 'https://enneagram-mentor.vercel.app/' })
    expect(d.target).toBe('internal-pane')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('(3) unflagged IdP-allowlist URL → shell.openExternal is called', () => {
    register()
    const d = invokeChannel({ url: 'https://github.com/login/device' })
    expect(d).toMatchObject({ target: 'system-browser', reason: 'idp-allowlist' })
    expect(openExternal).toHaveBeenCalledWith('https://github.com/login/device')
  })

  it('(4) a misrouted URL reaches the OS through the escape hatch path', () => {
    // The escape hatch does NOT go through url:route — it calls
    // shell:openExternal directly and unconditionally, precisely because this
    // routing may have been wrong. What is pinned here is that a URL this router
    // classified INTERNAL is still openable externally: nothing in the routing
    // marks it, rewrites it, or blocks the second path.
    register()
    const misrouted = 'https://intranet.acme.example/sso-portal'
    expect(invokeChannel({ url: misrouted }).target).toBe('internal-pane')
    expect(openExternal).not.toHaveBeenCalled()
    // …and the same string, sent the way BrowserTab's ⧉ button sends it:
    routeAndOpenExternal({ url: misrouted, authIntent: true })
    expect(openExternal).toHaveBeenCalledWith(misrouted)
  })
})

describe('the handler is defensive about its payload', () => {
  it('a malformed request never reaches the OS', () => {
    register()
    for (const bad of [{}, { url: null }, { url: 42 }, { url: '' }] as any[]) {
      expect(invokeChannel(bad).target).toBe('internal-pane')
    }
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('a non-http scheme never reaches the OS even when flagged', () => {
    register()
    invokeChannel({ url: 'file:///Users/dev/proj/docs/artifacts/a.html', authIntent: true })
    invokeChannel({ url: 'javascript:alert(1)', authIntent: true })
    expect(openExternal).not.toHaveBeenCalled()
  })
})
