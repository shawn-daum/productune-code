/**
 * BrowserTab — T-P4-114 §D
 *
 * Electron <webview> + nav bar (← → ↺ URL ⧉).
 * On mount → window.api.browserOpened({ url, tabId }) IPC (T-P4-115 stub).
 *
 * Requires webviewTag: true in BrowserWindow webPreferences (main.ts).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ── Electron webview JSX type ─────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string
        allowpopups?: string
        partition?: string
      }
    }
  }
}

interface ElectronWebview extends HTMLElement {
  src: string
  goBack: () => void
  goForward: () => void
  reload: () => void
  loadURL: (url: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  tabId: string
  props?: Record<string, unknown>
}

export default function BrowserTab({ tabId, props: tabProps }: Props) {
  const { t } = useTranslation()
  const initialUrl =
    typeof tabProps?.url === 'string' && tabProps.url
      ? tabProps.url
      : 'about:blank'

  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [loadFailed, setLoadFailed] = useState(false)
  const webviewRef = useRef<ElectronWebview | null>(null)

  // On mount: notify main process — noop until T-P4-115 fills the handler
  useEffect(() => {
    const api = (window as any).api
    api?.browserOpened?.({ url: initialUrl, tabId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          style={navBtn}
          onClick={() => webviewRef.current?.goForward()}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight size={14} />
        </button>
        <button
          style={navBtn}
          onClick={() => webviewRef.current?.reload()}
          title={t('workspace.browser.refresh')}
          aria-label={t('workspace.browser.refresh')}
        >
          <RefreshCw size={13} />
        </button>

        <input
          style={urlInput}
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder={t('workspace.browser.navPlaceholder')}
          spellCheck={false}
          aria-label="URL"
        />

        <button
          style={navBtn}
          onClick={handleOpenExternal}
          title={t('workspace.browser.openExternal')}
          aria-label={t('workspace.browser.openExternal')}
        >
          <ExternalLink size={13} />
        </button>
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
          allowpopups="true"
          partition="persist:browser-tab"
          style={webviewEl}
        />
      </div>
    </div>
  )
}

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
