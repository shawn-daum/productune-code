/**
 * webview-nav-guard.test.ts — T-434
 *
 * The R-34 kill, reproduced and pinned: a participant inside the in-app browser
 * navigating to GitHub's login. This asserts that the navigation is CANCELLED
 * (so the pane keeps the page it was on) and that the URL is handed to the
 * system browser — the actual call, not a claim.
 *
 * The three interception points are exercised separately because a page reaches
 * an IdP three different ways, and a fix that only covers popups would still
 * leave R-34 broken (R-34 was a same-tab navigation).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  attachWebviewNavigationGuards,
  type GuardableWebContents,
  type NavigationDetails,
} from './webview-nav-guard'

type NavListener = (details: NavigationDetails, ...rest: any[]) => void
type WindowOpenHandler = (d: { url: string }) => { action: 'deny' } | { action: 'allow' }

function harness() {
  const external: string[] = []
  const internal: string[] = []
  const navListeners: Record<string, NavListener[]> = {}
  let windowOpen: WindowOpenHandler | null = null

  const contents: GuardableWebContents = {
    setWindowOpenHandler: (h) => { windowOpen = h },
    on: (event, listener) => {
      ;(navListeners[event] ??= []).push(listener)
      return contents
    },
  }

  attachWebviewNavigationGuards(contents, {
    openExternal: (u) => external.push(u),
    openInternalPane: (u) => internal.push(u),
  })

  /** Fire a navigation event; returns whether the guard cancelled it. */
  const navigate = (
    event: 'will-navigate' | 'will-redirect',
    url: string,
    isMainFrame = true,
  ): boolean => {
    let prevented = false
    for (const l of navListeners[event] ?? []) {
      l({ url, isMainFrame, preventDefault: () => { prevented = true } })
    }
    return prevented
  }

  return { external, internal, navigate, openPopup: (url: string) => windowOpen?.({ url }) }
}

describe('will-navigate — R-34: same-tab navigation into a login', () => {
  it('GitHub login is cancelled and handed to the system browser', () => {
    const h = harness()
    const cancelled = h.navigate('will-navigate', 'https://github.com/login?return_to=%2Fshawn%2Frepo')
    // Cancelled → the webview stays on the page the user was reading, which is
    // what they come back to after finishing in the browser.
    expect(cancelled).toBe(true)
    expect(h.external).toEqual(['https://github.com/login?return_to=%2Fshawn%2Frepo'])
    expect(h.internal).toEqual([])
  })

  it('ordinary in-app navigation is left completely alone', () => {
    const h = harness()
    for (const url of [
      'https://github.com/shawn-kim-axz/productune/blob/main/README.md',
      'https://enneagram-mentor.vercel.app/quiz',
      'http://localhost:5173/',
    ]) {
      expect(h.navigate('will-navigate', url), url).toBe(false)
    }
    expect(h.external).toEqual([])
  })

  it('an unknown self-hosted IdP is still caught (path sub-net)', () => {
    const h = harness()
    expect(h.navigate('will-navigate', 'https://sso.acme.example/oauth/authorize?client_id=x')).toBe(true)
    expect(h.external).toEqual(['https://sso.acme.example/oauth/authorize?client_id=x'])
  })

  it('a SUB-FRAME navigation is never intercepted', () => {
    // An ad slot or embedded widget must not be able to yank the user's default
    // browser open with no click of theirs behind it.
    const h = harness()
    expect(h.navigate('will-navigate', 'https://accounts.google.com/gsi/iframe', false)).toBe(false)
    expect(h.external).toEqual([])
  })
})

describe('will-redirect — a 3xx into a login page', () => {
  it('a dashboard redirecting to /login hands off instead of dead-ending', () => {
    const h = harness()
    expect(h.navigate('will-redirect', 'https://vercel.com/login')).toBe(true)
    expect(h.external).toEqual(['https://vercel.com/login'])
  })

  it('a redirect between ordinary pages is untouched', () => {
    const h = harness()
    expect(h.navigate('will-redirect', 'https://vercel.com/docs/functions')).toBe(false)
    expect(h.external).toEqual([])
  })
})

describe('setWindowOpenHandler — the OAuth popup', () => {
  it('an auth popup goes to the system browser, never to an in-app tab', () => {
    const h = harness()
    const res = h.openPopup('https://accounts.google.com/o/oauth2/v2/auth?scope=email')
    expect(res).toEqual({ action: 'deny' })
    expect(h.external).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?scope=email'])
    expect(h.internal).toEqual([])
  })

  it('a non-auth popup keeps the T-PATCH-191 behavior: a new in-app tab', () => {
    const h = harness()
    const res = h.openPopup('https://shopping.naver.com/home')
    expect(res).toEqual({ action: 'deny' })
    expect(h.internal).toEqual(['https://shopping.naver.com/home'])
    expect(h.external).toEqual([])
  })

  it('a non-http popup is denied and routed nowhere', () => {
    const h = harness()
    const spy = vi.fn()
    expect(h.openPopup('mailto:someone@example.com')).toEqual({ action: 'deny' })
    expect(h.external).toEqual([])
    expect(h.internal).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
