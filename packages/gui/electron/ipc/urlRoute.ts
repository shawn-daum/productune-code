/**
 * ipc/urlRoute.ts — T-434
 *
 * The renderer's door to the 3-tier routing in `../auth-route`. One channel,
 * one authority: the renderer NEVER decides where a URL opens, it asks.
 *
 * Why an invoke that both decides AND performs the external open: the caller
 * needs to know whether to create a pane, and the `shell.openExternal` half has
 * to happen in main anyway. Returning the decision lets a call site do
 * `if (target === 'internal-pane') openTab(...)` with no second round trip and
 * no duplicated rule table in the renderer.
 *
 * NOT this channel's job: the tier-③ escape hatch. That control must open the
 * system browser UNCONDITIONALLY — it exists precisely for when this routing was
 * wrong — so it keeps calling `shell:openExternal` directly.
 */

import { ipcMain, shell } from 'electron'
import { routeUrl, type RouteDecision } from '../auth-route'

export interface RouteRequest {
  url: string
  /** Tier ① — the producer asserts this URL requires the user to authenticate. */
  authIntent?: boolean
}

/**
 * Route `url` in the main process and perform the system-browser half.
 * Exported (not just registered) so main-process callers — the <webview>
 * navigation guards — share the exact same path as the renderer's.
 */
export function routeAndOpenExternal(req: RouteRequest): RouteDecision {
  const url = typeof req?.url === 'string' ? req.url : ''
  const decision = routeUrl(url, { authIntent: req?.authIntent === true })
  if (decision.target === 'system-browser') {
    // `routeUrl` has already proven the scheme is http(s) — nothing else can
    // reach the OS handler from here.
    void shell.openExternal(url)
    // What goes in the line is the GROUNDS for the verdict, not the input that
    // was judged: `reason` is a fixed enum and `matched` is rule-table material
    // by `RouteDecision.matched`'s invariant. The URL itself is deliberately
    // absent — it is caller-supplied and can carry a session identifier in the
    // path (QA finding F10 caught exactly that leaking through `matched`).
    console.log(`[url-route] → system browser (${decision.reason}${decision.matched ? `: ${decision.matched}` : ''})`)
  }
  return decision
}

export function register(): void {
  ipcMain.handle('url:route', (_event, req: RouteRequest): RouteDecision =>
    routeAndOpenExternal(req),
  )
}
