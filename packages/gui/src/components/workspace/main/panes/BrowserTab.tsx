/**
 * BrowserTab — T-P4-114 §D
 *
 * Electron <webview> + nav bar (← → ↺ URL ⧉).
 * On mount → window.api.browserOpened({ url, tabId }) IPC (T-P4-115 stub).
 *
 * Requires webviewTag: true in BrowserWindow webPreferences (main.ts).
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'
import { routeThenOpen } from '../../../../lib/routeUrl'
import ZoomControls, { ZOOM_DEFAULT, ZOOM_STEP } from './ZoomControls'
import { normalizeBrowserUrl } from './browserUrl'

// T-PATCH-046: FindHandle — exposed to LeafPane via forwardRef / useImperativeHandle
export interface BrowserFindHandle {
  findInPage: (text: string, opts?: { forward?: boolean; findNext?: boolean }) => void
  stopFindInPage: () => void
  /** Subscribe to found-in-page result events (returns an unsubscribe fn). */
  onFoundInPage: (cb: (result: { activeMatchOrdinal: number; matches: number }) => void) => () => void
}

// ── Electron webview JSX type ─────────────────────────────────────────────────
// Note: @types/react 19+ provides WebViewHTMLAttributes<HTMLWebViewElement>
// for the intrinsic 'webview' element — no augmentation needed.

interface ElectronWebview extends HTMLElement {
  src: string
  goBack: () => void
  goForward: () => void
  reload: () => void
  loadURL: (url: string) => void
  // T-PATCH-067 R7: find moved to MAIN process. We no longer call findInPage /
  // stopFindInPage on the <webview> element (the DOM find path is broken — see
  // electron/ipc/browserFind.ts). Instead we resolve the underlying webContents
  // id and drive webContents.findInPage from main via IPC.
  getWebContentsId: () => number
  // T-PATCH-057: zoom
  setZoomFactor: (factor: number) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  tabId: string
  props?: Record<string, unknown>
}

// T-PATCH-046: forwardRef so LeafPane can obtain the BrowserFindHandle.
// Typed as BrowserFindHandle | null to match useRef<BrowserFindHandle | null>(null).
const BrowserTab = forwardRef<BrowserFindHandle | null, Props>(function BrowserTab({ tabId, props: tabProps }, findRef) {
  const { t } = useTranslation()
  const initialUrl =
    typeof tabProps?.url === 'string' && tabProps.url
      ? tabProps.url
      : 'about:blank'

  // T-PATCH-188: a blank tab loads about:blank but the URL bar shows empty (with
  // its placeholder) rather than the literal "about:blank".
  const [inputUrl, setInputUrl] = useState(initialUrl === 'about:blank' ? '' : initialUrl)
  const [loadFailed, setLoadFailed] = useState(false)
  // T-434: the page the webview is ACTUALLY showing, tracked separately from the
  // address input. `inputUrl` is an editable text field — it holds whatever the
  // user has half-typed — so handing it to the escape hatch could open a
  // different page than the one they are stuck on. The escape hatch has to be
  // right on the first click: it is the recovery path for a routing misjudgment.
  const [currentUrl, setCurrentUrl] = useState(initialUrl === 'about:blank' ? '' : initialUrl)
  // T-PATCH-057: zoom state — range 0.5–3.0, step 0.1 (AC-3, AC-4)
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const webviewRef = useRef<ElectronWebview | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  // #4c (T-023): while a tab drag is active, drop pointer events on the webview
  // so the pane's drop-zone overlay receives dragover/drop instead of the
  // webview swallowing them.
  const tabDragActive = useWorkspace((s) => s.tabDragActive)
  // T-PATCH-074: suppress webview pointer events during column/pane resize drags
  const resizeDragActive = useWorkspace((s) => s.resizeDragActive)
  const setTabMeta = useWorkspace((s) => s.setTabMeta)

  // T-PATCH-067 R7: id of the underlying webContents (the find target in main).
  // Resolved lazily via webview.getWebContentsId() — available after dom-ready.
  // Lazy resolution (vs a dom-ready useEffect) sidesteps the file:// race where
  // dom-ready fires before any listener registers: the find bar only opens on a
  // loaded tab, so by the time findInPage runs the id resolves on first call.
  const webContentsIdRef = useRef<number | null>(null)

  // T-PATCH-067 R8: PUSH-DRIVEN latest requestId. findNext:false finds are now issued
  // on a LATER tick in main (stop-then-next-tick), so the browserFind invoke can NO
  // LONGER return the real requestId — it resolves to -1 before the find runs. So the
  // "latest" is driven ENTIRELY by the found-in-page PUSH: we track the MAX requestId
  // seen across pushes (monotonically increasing per webContents). A push is dropped
  // only if its requestId is BELOW the max already seen (a stale "zo" update arriving
  // after "zone"); the newest query always carries the highest requestId, so this
  // never hides the latest result.
  const latestRequestIdRef = useRef<number>(-1)

  // Lazily resolve the webContents id (throws before dom-ready → null + retry).
  const getWebContentsId = useCallback((): number | null => {
    if (webContentsIdRef.current != null) return webContentsIdRef.current
    const wv = webviewRef.current
    if (!wv) return null
    try {
      const id = wv.getWebContentsId()
      webContentsIdRef.current = id
      return id
    } catch {
      return null // not ready yet — caller retries on next keystroke
    }
  }, [])

  // T-PATCH-067 R7: find handle now routes through MAIN-process IPC.
  useImperativeHandle(findRef, () => ({
    findInPage: (text: string, opts) => {
      const id = getWebContentsId()
      const api = (window as any).api
      if (id == null || !api?.browserFind) {
        return
      }
      api
        .browserFind({ webContentsId: id, text, options: opts })
        .then(() => {
          // T-PATCH-067 R8: do NOT bump latestRequestIdRef from the invoke return.
          // For findNext:false res.requestId is -1 (find deferred to a later tick in
          // main); the ref is now driven solely by found-in-page pushes (see below).
        })
    },
    stopFindInPage: () => {
      const id = getWebContentsId()
      const api = (window as any).api
      if (id == null || !api?.browserStopFind) return
      api.browserStopFind({ webContentsId: id })
    },
    onFoundInPage: (cb: (result: { activeMatchOrdinal: number; matches: number }) => void) => {
      const api = (window as any).api
      if (!api?.onBrowserFoundInPage) return () => {}
      return api.onBrowserFoundInPage(
        (payload: {
          webContentsId: number
          requestId: number
          activeMatchOrdinal: number
          matches: number
          finalUpdate: boolean
        }) => {
          // Filter to THIS webview's webContents.
          if (payload.webContentsId !== webContentsIdRef.current) return
          const willDrop = payload.requestId < latestRequestIdRef.current
          // Push-driven latest-wins: drop only STALE pushes (requestId below the max
          // already seen). Newest query always carries the highest requestId.
          if (willDrop) return
          latestRequestIdRef.current = payload.requestId
          cb({ activeMatchOrdinal: payload.activeMatchOrdinal, matches: payload.matches })
        },
      )
    },
  }), [getWebContentsId])

  // On mount: notify main process — noop until T-P4-115 fills the handler
  useEffect(() => {
    const api = (window as any).api
    api?.browserOpened?.({ url: initialUrl, tabId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // T-PATCH-047: forward app-level shortcuts from webview to renderer window.
  // When webview has keyboard focus it swallows key events; window.keydown never
  // fires. `before-input-event` fires on the webview element itself — intercept
  // cmd+T / cmd+W / cmd+1-9 and re-dispatch them on the window so
  // useKeyboardShortcuts picks them up (AC-1, AC-3).
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onBeforeInput = (e: any) => {
      // `input` payload from the webview's before-input-event.
      const input = e as { key: string; modifiers: string[]; type: string }
      if (input.type !== 'keyDown') return
      const meta = input.modifiers?.includes('meta') || input.modifiers?.includes('control')
      if (!meta) return
      const key = input.key?.toLowerCase()
      const isAppShortcut =
        key === 't' || key === 'w' || key === '\\' || key === 'f' ||
        key === '[' || key === ']' ||
        (key >= '1' && key <= '9')
      if (!isAppShortcut) return
      // Re-dispatch as a real KeyboardEvent on window so useKeyboardShortcuts
      // handles it identically to non-webview focus (AC-2: form inputs inside
      // webview are unaffected — webview's own bubbling is separate).
      const synth = new KeyboardEvent('keydown', {
        key: input.key,
        metaKey: input.modifiers?.includes('meta'),
        ctrlKey: input.modifiers?.includes('control'),
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(synth)
    }

    wv.addEventListener('before-input-event', onBeforeInput)
    return () => {
      wv.removeEventListener('before-input-event', onBeforeInput)
    }
  }, [])

  // T-PATCH-191: a blank tab (no initial URL — e.g. Cmd+T) auto-focuses the URL
  // bar and selects it so the user can type immediately. A tab opened WITH a URL
  // (e.g. a Run Preview) leaves focus on the page. Runs once on mount.
  useEffect(() => {
    if (initialUrl === 'about:blank') {
      const id = requestAnimationFrame(() => urlInputRef.current?.select())
      return () => cancelAnimationFrame(id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // T-PATCH-196: subscribe to menu accelerator IPC for ⌘L, ⌘[, ⌘].
  // Subscribed here (where urlInputRef / webviewRef live) so the handler is only
  // active while this BrowserTab is mounted — natural no-op for non-browser tabs.
  useEffect(() => {
    const api = (window as any).api
    if (!api) return
    const subs: Array<(() => void) | undefined> = []

    if (api.onMenuFocusUrl) {
      subs.push(
        api.onMenuFocusUrl(() => {
          urlInputRef.current?.select()
        }),
      )
    }
    if (api.onMenuNavBack) {
      subs.push(
        api.onMenuNavBack(() => {
          webviewRef.current?.goBack()
        }),
      )
    }
    if (api.onMenuNavForward) {
      subs.push(
        api.onMenuNavForward(() => {
          webviewRef.current?.goForward()
        }),
      )
    }

    return () => subs.forEach((fn) => fn?.())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire webview navigation events to keep URL bar in sync
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onNavigate = (e: any) => {
      // T-PATCH-189: only reflect MAIN-frame navigations in the URL bar.
      // `did-navigate-in-page` also fires for sub-frames (iframes) — e.g. Naver's
      // home embeds shopsquare.naver.com in an iframe whose in-page nav would
      // otherwise overwrite the bar while the top page is still naver.com.
      // (`did-navigate` is main-frame only → isMainFrame is undefined there.)
      if (e?.isMainFrame === false) return
      const navUrl: string = e?.url ?? ''
      if (navUrl && navUrl !== 'about:blank') {
        setInputUrl(navUrl)
        setCurrentUrl(navUrl)   // T-434: escape-hatch source of truth
        setLoadFailed(false)
        // T-PATCH-192: persist the current URL into the tab's props so an app
        // reload (Cmd+R) restores where the user navigated to, not the blank/
        // original URL the tab was opened with.
        setTabMeta(tabId, { url: navUrl })
      }
    }
    // T-PATCH-192: reflect the page's document title as the browser tab title,
    // updating as the user navigates.
    const onTitle = (e: any) => {
      const title: string = e?.title ?? ''
      if (title) setTabMeta(tabId, { title })
    }
    const onFailLoad = (e: any) => {
      // Sub-frame (iframe) failures must not flag the whole page as failed.
      if (e?.isMainFrame === false) return
      // errorCode -3 = ERR_ABORTED (user-initiated navigation, not a real failure)
      if (e?.errorCode !== -3) setLoadFailed(true)
    }
    const onStartLoad = () => setLoadFailed(false)

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('page-title-updated', onTitle)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('did-start-loading', onStartLoad)

    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('page-title-updated', onTitle)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('did-start-loading', onStartLoad)
    }
  }, [tabId, setTabMeta])

  // T-PATCH-057: zoom handlers — clamp to [0.5, 3.0], step 0.1
  const BROWSER_ZOOM_MIN = 0.5
  const BROWSER_ZOOM_MAX = 3.0
  const BROWSER_ZOOM_STEP = ZOOM_STEP
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const next = parseFloat(Math.min(BROWSER_ZOOM_MAX, z + BROWSER_ZOOM_STEP).toFixed(2))
      webviewRef.current?.setZoomFactor(next)
      return next
    })
  }, [])
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = parseFloat(Math.max(BROWSER_ZOOM_MIN, z - BROWSER_ZOOM_STEP).toFixed(2))
      webviewRef.current?.setZoomFactor(next)
      return next
    })
  }, [])
  const zoomReset = useCallback(() => {
    setZoom(ZOOM_DEFAULT)
    webviewRef.current?.setZoomFactor(ZOOM_DEFAULT)
  }, [])

  const navigate = useCallback((target: string) => {
    const wv = webviewRef.current
    if (!wv) return
    // T-328: any already-qualified scheme (file://, http://, https://, …)
    // loads as-is; only a bare, scheme-less input gets https:// prepended.
    const normalized = normalizeBrowserUrl(target)
    // T-434: the URL bar is the one navigation main's will-navigate guard cannot
    // see — `webview.loadURL` is a programmatic navigation and does not emit
    // will-navigate. So a participant typing `github.com/login` here would land
    // on a passkey prompt this webview cannot serve. Route it the same way.
    void routeThenOpen(normalized, undefined, () => {
      setInputUrl(normalized)
      setCurrentUrl(normalized)
      setLoadFailed(false)
      wv.loadURL(normalized)
    })
  }, [])

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl)
  }

  // Tier ③ — the standing escape hatch. UNCONDITIONAL: it never consults the
  // router, because it exists for the case where the router was wrong.
  const handleOpenExternal = () => {
    const api = (window as any).api
    api?.openExternal?.(currentUrl || inputUrl)
  }

  return (
    <div style={wrap}>
      {/* ── Nav bar (32px) ────────────────────────────────────────────────── */}
      <div style={navBar}>
        <button
          style={navBtn}
          onClick={() => webviewRef.current?.goBack()}
          title={t('workspace.browser.back')}
          aria-label={t('workspace.browser.back')}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          style={navBtn}
          onClick={() => webviewRef.current?.goForward()}
          title={t('workspace.browser.forward')}
          aria-label={t('workspace.browser.forward')}
        >
          <ChevronRight size={14} />
        </button>
        <button
          style={navBtn}
          onClick={() => webviewRef.current?.reload()}
          title={t('workspace.browser.reload')}
          aria-label={t('workspace.browser.reload')}
        >
          <RefreshCw size={13} />
        </button>

        <input
          ref={urlInputRef}
          style={urlInput}
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder={t('workspace.browser.addressPlaceholder')}
          spellCheck={false}
          aria-label="URL"
        />

        {/* T-434 tier ③ — the standing escape hatch. `data-escape-hatch` is the
            marker the pane-coverage test asserts on, so "every internal pane
            that can host a URL has one" is checked, not claimed. */}
        <button
          style={navBtn}
          data-escape-hatch="system-browser"
          onClick={handleOpenExternal}
          title={t('workspace.browser.popout')}
          aria-label={t('workspace.browser.popout')}
        >
          <ExternalLink size={13} />
        </button>

        {/* T-PATCH-057: zoom controls (AC-3) */}
        <ZoomControls
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={zoomReset}
          min={BROWSER_ZOOM_MIN}
          max={BROWSER_ZOOM_MAX}
        />
      </div>

      {/* ── Webview area ──────────────────────────────────────────────────── */}
      <div style={contentWrap}>
        {loadFailed && (
          <div style={errorOverlay}>
            <span style={errorText}>{t('workspace.browser.loadError')}</span>
          </div>
        )}
        <webview
          ref={webviewRef as any}
          src={initialUrl}
          // T-PATCH-191: MUST be the string "true" — React 19 drops a boolean
          // `true` on this custom element, leaving the webview WITHOUT the
          // allowpopups attribute → window.open is blocked and the new-tab
          // window-open handler never fires (clicks appear dead).
          {...({ allowpopups: 'true' } as any)}
          partition="persist:browser-tab"
          style={(tabDragActive || resizeDragActive) ? { ...webviewEl, pointerEvents: 'none' } : webviewEl}
        />
      </div>
    </div>
  )
})

export default BrowserTab

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: 'var(--bg-surface-base)',
}

const navBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: 32,
  padding: '0 6px',
  background: 'var(--bg-surface-onlayer)',
  borderBottom: '1px solid var(--border-inline)',
  flexShrink: 0,
}

const navBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'none',
  border: 'none',
  borderRadius: 4,
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
}

const urlInput: React.CSSProperties = {
  flex: 1,
  height: 22,
  background: 'var(--bg-surface-base)',
  border: '1px solid var(--border-inline)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 11,
  padding: '0 8px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  outline: 'none',
}

const contentWrap: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}

const webviewEl: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'var(--bg-surface-base)',
  minHeight: 0,
  display: 'flex',
}

const errorOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-surface-onlayer)',
  zIndex: 1,
}

const errorText: React.CSSProperties = {
  color: 'var(--text-quaternary)',
  fontSize: 13,
}
