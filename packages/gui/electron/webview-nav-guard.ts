/**
 * webview-nav-guard.ts — T-434
 *
 * The <webview> half of the routing, extracted from main.ts so it can be
 * unit tested. main.ts's module scope boots Electron (app.setName, the T-442
 * single-instance lock), so anything left inline there is unverifiable — and
 * this is the code path R-34 actually died on. "It should work" is not done
 * (doctrine #4), so it lives here behind an injected-sink seam.
 *
 * Three interception points, because a page reaches an IdP three ways:
 *
 *   setWindowOpenHandler  window.open / target=_blank — the OAuth popup.
 *   will-navigate         a same-tab link click or location assignment. THIS is
 *                         R-34: github.com → click "Sign in" → github.com/login
 *                         → a passkey prompt an embedded view cannot serve.
 *   will-redirect         a 3xx into a login page. A protected deployment or a
 *                         dashboard answering 302 → /login would otherwise
 *                         dead-end inside the pane with no page to go back to.
 *
 * NOT covered here, deliberately: `webview.loadURL`. Electron does not emit
 * will-navigate for a programmatic navigation, so the address bar routes itself
 * in the renderer (BrowserTab.navigate → api.routeUrl).
 *
 * preventDefault leaves the webview showing the page it was already on, which is
 * what lets the user finish in their browser and come back to an intact pane.
 */

import { dispatchUrl, routeUrl, type RouteSinks } from './auth-route'

/**
 * The event payload both navigation events carry. Read `details.url`, not the
 * positional `url` argument — Electron 36 deprecated the positional form.
 */
export interface NavigationDetails {
  url: string
  /** Undefined on older payload shapes; treated as main-frame when absent. */
  isMainFrame?: boolean
  preventDefault: () => void
}

/** The slice of Electron's WebContents this guard needs — keeps electron out. */
export interface GuardableWebContents {
  setWindowOpenHandler: (
    handler: (details: { url: string }) => { action: 'deny' } | { action: 'allow' },
  ) => void
  on(event: 'will-navigate', listener: (details: NavigationDetails, ...rest: any[]) => void): unknown
  on(event: 'will-redirect', listener: (details: NavigationDetails, ...rest: any[]) => void): unknown
}

export function attachWebviewNavigationGuards(
  contents: GuardableWebContents,
  sinks: RouteSinks,
): void {
  // T-PATCH-191 established this half: an unmanaged detached popup makes clicks
  // look dead, so deny it and re-home the URL. T-434 adds the routing in front:
  // an OAuth popup goes to the system browser, everything else to a new in-app tab.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) dispatchUrl(url, {}, sinks)
    return { action: 'deny' }
  })

  const handoffIfAuth = (details: NavigationDetails): void => {
    // Main frame only. A third-party sub-frame (an ad slot, an embedded widget)
    // navigating somewhere that happens to match the net would otherwise yank
    // the user's default browser open with no click of theirs behind it — and a
    // sub-frame login is unwinnable in an embedded view either way, so
    // intercepting it buys nothing. See unresolved[] on T-434.
    if (details.isMainFrame === false) return
    if (routeUrl(details.url).target !== 'system-browser') return
    details.preventDefault()
    sinks.openExternal(details.url)
  }

  contents.on('will-navigate', handoffIfAuth)
  contents.on('will-redirect', handoffIfAuth)
}
