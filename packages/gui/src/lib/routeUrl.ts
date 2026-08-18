/**
 * routeUrl.ts — T-434 (renderer side)
 *
 * Every renderer path that would put a URL into an internal pane goes through
 * here first. The rule table lives in the main process (`electron/auth-route.ts`)
 * — duplicating it here would guarantee the two drift, and a drifted router is
 * exactly the leak the 3-tier design exists to prevent.
 *
 * Tier recap (see electron/auth-route.ts for the full why):
 *   ① `authIntent` — the producer of the URL knows a login is in the way.
 *   ② IdP net      — main matches known auth endpoints on unflagged URLs.
 *   ③ escape hatch — the pane's standing "open in default browser" control,
 *                    which is why defaulting to the pane here is safe.
 */

export type RouteTargetName = 'system-browser' | 'internal-pane'

/**
 * Ask main where `url` belongs. If it belongs in the app, run `openInPane`.
 * If it belongs in the system browser, main has already opened it — we do
 * nothing, deliberately: opening a pane too would leave a dead login page
 * behind the browser window.
 *
 * Returns the target so a caller can add its own feedback (none needs to today).
 *
 * Fallback when the bridge is unavailable (test render, stale preload): open the
 * pane. That is the pre-T-434 behavior, and tier ③ makes it recoverable.
 */
export async function routeThenOpen(
  url: string,
  authIntent: boolean | undefined,
  openInPane: () => void,
): Promise<RouteTargetName> {
  const api = (window as any)?.api
  if (!api?.routeUrl) {
    openInPane()
    return 'internal-pane'
  }
  try {
    const decision = await api.routeUrl({ url, authIntent: authIntent === true })
    if (decision?.target === 'system-browser') return 'system-browser'
  } catch {
    // IPC failure must never swallow the user's click.
  }
  openInPane()
  return 'internal-pane'
}
