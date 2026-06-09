import { ipcMain, webContents, type WebContents } from 'electron'

// ── Browser-tab find — MAIN PROCESS (T-PATCH-067 R7) ──────────────────────────
//
// WHY MAIN: the renderer <webview> DOM find path is definitively broken on this
// Electron build (6 prior renderer-side attempts failed):
//   (1) the <webview> `found-in-page` DOM event NEVER fires → our match count is
//       dead, and
//   (2) once a find session is active, subsequent findInPage(findNext:false)
//       calls are IGNORED (no new highlight) until stopFindInPage ends the
//       session — which is why pressing Enter "primed" it.
//
// `webContents.findInPage` + the `found-in-page` event ON the webContents (main
// process) is the well-tested API the <webview> merely wraps. Driving it
// directly from main fixes BOTH problems:
//   • highlight  → stop-before-new-query session mgmt (below) ends the prior
//                  session so a NEW query actually searches + highlights.
//   • count      → the main-side `found-in-page` event is reliable and we push
//                  it back to the renderer.

interface BrowserFindArgs {
  webContentsId: number
  text: string
  options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }
}

interface BrowserStopFindArgs {
  webContentsId: number
}

// webContentsIds that already have a `found-in-page` listener attached. The
// listener is wired exactly once per target webContents (see register()).
const attached = new Set<number>()

export function register(): void {
  // ── Find (live typing + nav) ────────────────────────────────────────────────
  ipcMain.handle('browser:find', (event, args: BrowserFindArgs) => {
    const { webContentsId, text, options } = args ?? ({} as BrowserFindArgs)
    const wc = webContents.fromId(webContentsId)
    if (!wc || wc.isDestroyed()) {
      return { ok: false, error: 'webContents not found' }
    }

    // Empty query → end the session (clear highlight). No find issued.
    if (!text) {
      try { wc.stopFindInPage('clearSelection') } catch { /* not ready — ignore */ }
      return { ok: true, requestId: -1 }
    }

    // Attach the found-in-page listener ONCE per webContents. Forward every
    // result to the renderer window that hosts the <webview> (event.sender).
    // The renderer filters by webContentsId + latest requestId.
    if (!attached.has(webContentsId)) {
      attached.add(webContentsId)
      const host = event.sender // the renderer window hosting this <webview>
      const onFound = (_e: Electron.Event, result: Electron.Result) => {
        if (host.isDestroyed()) return
        host.send('browser:found-in-page', {
          webContentsId,
          requestId: result.requestId,
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
          finalUpdate: result.finalUpdate,
        })
      }
      wc.on('found-in-page', onFound as (e: Electron.Event, r: Electron.Result) => void)
      // Tab close cleanup: the listener lives on wc and dies with it; we only
      // need to forget the id so a recycled id re-attaches cleanly.
      wc.once('destroyed', () => { attached.delete(webContentsId) })
    }

    const findNext = options?.findNext ?? false

    // SESSION MGMT (T-PATCH-067 R8) ─────────────────────────────────────────────
    // findNext:true (Enter / Shift+Enter nav): CONTINUE the active session,
    // synchronously, NO stop → advances to the next/prev match. requestId is known
    // sync; return it (informational — renderer is push-driven, see below).
    if (findNext) {
      let requestId = -1
      try {
        requestId = wc.findInPage(text, {
          forward: options?.forward ?? true,
          findNext: true,
          matchCase: options?.matchCase ?? false,
        })
      } catch (err) {
        return { ok: false, error: String(err) }
      }
      return { ok: true, requestId }
    }

    // findNext:false (live query change): the PRIOR session must be ENDED first or
    // Electron keeps the old highlight ("zo") and emits NO found-in-page for the new
    // query ("zone"). But stopFindInPage + findInPage on the SAME tick RACES — the
    // stop's async teardown cancels the just-issued find (found-in-page never fires;
    // that was the R7 failure). FIX: stop now, issue findInPage on the NEXT tick
    // (setImmediate) so the stop fully completes first. The find is therefore
    // deferred → requestId is NOT known synchronously, so the renderer is PUSH-DRIVEN
    // (tracks max requestId from found-in-page events). Returning -1 here is fine.
    try { wc.stopFindInPage('clearSelection') } catch { /* not ready — ignore */ }
    setImmediate(() => {
      if (wc.isDestroyed()) return
      try {
        wc.findInPage(text, {
          forward: options?.forward ?? true,
          findNext: false,
          matchCase: options?.matchCase ?? false,
        })
      } catch { /* tab navigated away mid-tick — ignore */ }
    })
    return { ok: true, requestId: -1 } // deferred; renderer is push-driven
  })

  // ── Stop find (clear / close) ─────────────────────────────────────────────────
  ipcMain.handle('browser:stop-find', (_event, args: BrowserStopFindArgs) => {
    const wc: WebContents | undefined = webContents.fromId(args?.webContentsId)
    if (wc && !wc.isDestroyed()) {
      try { wc.stopFindInPage('clearSelection') } catch { /* ignore */ }
    }
    return { ok: true }
  })
}
