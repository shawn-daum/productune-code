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
import ZoomControls, { ZOOM_DEFAULT, ZOOM_STEP } from './ZoomControls'

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
  // T-PATCH-057: zoom state — range 0.5–3.0, step 0.1 (AC-3, AC-4)
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const webviewRef = useRef<ElectronWebview | null>(null)
  // #4c (T-023): while a tab drag is active, drop pointer events on the webview
  // so the pane's drop-zone overlay receives dragover/drop instead of the
  // webview swallowing them.
  const tabDragActive = useWorkspace((s) => s.tabDragActive)
  // T-PATCH-074: suppress webview pointer events during column/pane resize drags
  const resizeDragActive = useWorkspace((s) => s.resizeDragActive)

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

  // Wire webview navigation events to keep URL bar in sync
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onNavigate = (e: any) => {
      const navUrl: string = e?.url ?? ''
      if (navUrl && navUrl !== 'about:blank') {
        setInputUrl(navUrl)
        setLoadFailed(false)
      }
    }
    const onFailLoad = (e: any) => {
      // errorCode -3 = ERR_ABORTED (user-initiated navigation, not a real failure)
      if (e?.errorCode !== -3) setLoadFailed(true)
    }
    const onStartLoad = () => setLoadFailed(false)

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('did-fail-load', onFailLoad)
    wv.addEventListener('did-start-loading', onStartLoad)

    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('did-fail-load', onFailLoad)
      wv.removeEventListener('did-start-loading', onStartLoad)
    }
  }, [])

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
    const normalized =
      target.startsWith('http://') || target.startsWith('https://')
        ? target
        : `https://${target}`
    setInputUrl(normalized)
    setLoadFailed(false)
    wv.loadURL(normalized)
  }, [])

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl)
  }

  const handleOpenExternal = () => {
    const api = (window as any).api
    api?.openExternal?.(inputUrl)
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
          style={urlInput}
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder={t('workspace.browser.addressPlaceholder')}
          spellCheck={false}
          aria-label="URL"
        />

        <button
          style={navBtn}
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
          allowpopups={true}
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
  background: '#0F0F0F',
}

const navBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: 32,
  padding: '0 6px',
  background: '#1A1A1A',
  borderBottom: '1px solid #2A2A2A',
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
  color: '#A0A0A0',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
}

const urlInput: React.CSSProperties = {
  flex: 1,
  height: 22,
  background: '#0F0F0F',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E5E5E5',
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
  background: '#0F0F0F',
  minHeight: 0,
  display: 'flex',
}

const errorOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1A1A1A',
  zIndex: 1,
}

const errorText: React.CSSProperties = {
  color: '#707070',
  fontSize: 13,
}
