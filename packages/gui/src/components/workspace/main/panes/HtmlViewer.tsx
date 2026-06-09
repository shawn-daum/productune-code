/**
 * HtmlViewer — T-PATCH-032
 *
 * Resolves the previously-dangling `'preview'` TabType. Two branches keyed off
 * the tab props:
 *
 *   - http(s) `url`  → delegates to BrowserTab (the established Electron
 *                      <webview> + nav path); no local-file logic runs.
 *   - local `path` + `projectDir` → renders the local .html / .htm file:
 *       · Preview (DEFAULT) — the raw HTML is read via the project-scoped
 *         `html:readFile` IPC and rendered in a SANDBOXED <iframe srcdoc>.
 *       · Edit toggle — a raw-source <textarea> mirroring the doctrine/md
 *         editable pattern (Eye / Pencil lucide toggle).
 *       · Save — writes the edited source back via the conflict-aware,
 *         path-guarded `html:writeFile` IPC; on success the Preview reloads.
 *
 * Render-target choice — sandboxed <iframe srcdoc> over Electron <webview>:
 * the source is already in memory (we read it for the editor), so srcdoc needs
 * no real `file://` navigation and no file-access plumbing. The iframe sandbox
 * is empty (no `allow-scripts`, no `allow-same-origin`), so artifact scripts
 * cannot run and the frame has no origin / node access — the safest local
 * render. http(s) inputs keep going through <webview> via BrowserTab.
 *
 * Dirty / save / conflict flow is modeled on DoctrineFileTabHost: a tab
 * close-guard surfaces GenericDirtyModal on unsaved edits, and an mtime
 * conflict on save is surfaced (not silently overwritten) — here as an inline
 * banner offering reload, consistent with the MarkdownViewer conflict copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eye,
  Pencil,
  Save,
  X,
  RefreshCw,
  AlertOctagon,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { registerTabCloseGuard } from '../../../../store/tabCloseGuard'
import { useWorkspace } from '../../../../store/workspace'
import GenericDirtyModal from '../../GenericDirtyModal'
import BrowserTab from './BrowserTab'
import ZoomControls, { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './ZoomControls'

interface Props {
  tabId: string
  props?: Record<string, unknown>
  // T-PATCH-067 R4: iframe-internal find bridge (preview / local HTML artifact tabs)
  findQuery?: string
  findNavRef?: MutableRefObject<((forward: boolean) => void) | null>
  onFindResult?: (info: { total: number; current: number }) => void
}

interface ToastItem {
  id: string
  msg: string
  ok: boolean
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

type HtmlReadResult = {
  ok: boolean
  content?: string
  exists?: boolean
  mtimeMs?: number | null
  error?: string
}

type HtmlWriteResult = {
  ok: boolean
  mtimeMs?: number
  conflict?: boolean
  currentMtimeMs?: number
  error?: string
}

export default function HtmlViewer({ tabId, props: tabProps, findQuery, findNavRef, onFindResult }: Props) {
  const url = typeof tabProps?.url === 'string' ? tabProps.url : ''
  const isHttp = /^https?:\/\//i.test(url)
  // ── http(s) branch — delegate to the existing webview path ─────────────────
  if (isHttp) {
    return <BrowserTab tabId={tabId} props={tabProps} />
  }

  return (
    <LocalHtmlViewer
      tabId={tabId}
      props={tabProps}
      findQuery={findQuery}
      findNavRef={findNavRef}
      onFindResult={onFindResult}
    />
  )
}

// ── Local-file viewer ─────────────────────────────────────────────────────────

function LocalHtmlViewer({ tabId, props: tabProps, findQuery, findNavRef, onFindResult }: Props) {
  const { t } = useTranslation()
  const absPath = typeof tabProps?.path === 'string' ? tabProps.path : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const closeTabAction = useWorkspace((s) => s.closeTab)

  // On-disk content (Preview source + textarea seed).
  const [content, setContent] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('idle')

  // mtime snapshot captured at read/write — drives the conflict guard.
  const snapshotMtimeRef = useRef<number | null>(null)

  // T-PATCH-067 R4: ref to the preview <iframe> for postMessage find bridge.
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // T-PATCH-067 R5: track latest findQuery for the iframe onLoad resend (avoids stale closure).
  const findQueryRef = useRef<string>('')

  // Edit-mode UI state (mirrors MarkdownViewer).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  const [dirtyModalOpen, setDirtyModalOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Bumped after a successful save so the Preview <iframe> remounts with the
  // new srcdoc (AC-4 "Preview reflects the new content").
  const [previewKey, setPreviewKey] = useState(0)

  // T-PATCH-066 D1 + T-PATCH-067 R4: inject into iframe srcdoc:
  //   • focus bridge  — first mousedown/focus → parent.postMessage({type:"iframe-focus"})
  //     so the parent promotes this pane to activePaneId (cmd+F / accelerators land here).
  //   • find bridge   — respond to find-query / find-nav postMessages; CSS Custom Highlight
  //     inside the iframe; report find-result back to parent.
  //   • ::highlight styles injected so they apply within the iframe document.
  // Keep sandbox="allow-scripts", NO allow-same-origin.
  const srcDocWithFocusBridge = useMemo(() => {
    const injection = [
      // Highlight styles for matches inside the iframe
      '<style>',
      '::highlight(find){background-color:#FFE066;color:#1A1A1A;}',
      '::highlight(find-active){background-color:#FF9900;color:#1A1A1A;}',
      '<\/style>',
      '<script>',
      '(function(){',
      // ── D1: iframe-focus bridge ──────────────────────────────────────────
      'var sent=false;',
      'function sig(){if(!sent){sent=true;parent.postMessage({type:"iframe-focus"},"*");}}',
      'window.addEventListener("focus",sig);',
      'document.addEventListener("mousedown",sig,{once:true});',
      // ── B1: iframe-internal find bridge ─────────────────────────────────
      'var fr=[];',   // find ranges
      'var fc=-1;',  // find current index
      'function wt(root,q){',
        'var found=[];var lower=q.toLowerCase();',
        'var walker=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,null);',
        'var n;while((n=walker.nextNode())){',
          'var v=n.nodeValue||"";var lv=v.toLowerCase();',
          'var i=0,p;while((p=lv.indexOf(lower,i))!==-1){',
            'var r=document.createRange();r.setStart(n,p);r.setEnd(n,p+q.length);',
            'found.push(r);i=p+lower.length;',
          '}',
        '}',
        'return found;',
      '}',
      'function paint(){',
        'if(typeof CSS==="undefined"||!CSS.highlights||typeof Highlight==="undefined")return;',
        'CSS.highlights.delete("find");CSS.highlights.delete("find-active");',
        'if(fr.length===0)return;',
        'CSS.highlights.set("find",new Highlight(...fr));',
        'if(fr[fc]){',
          'CSS.highlights.set("find-active",new Highlight(fr[fc]));',
          'var sc=fr[fc].startContainer;',
          'var el=sc.nodeType===1?sc:sc.parentElement;',
          'if(el)el.scrollIntoView({block:"nearest",behavior:"smooth"});',
        '}',
      '}',
      'window.addEventListener("message",function(e){',
        'if(!e.data)return;',
        'if(e.data.type==="find-query"){',
          'var q=e.data.q||"";var tid=e.data.tabId||"";',
          'if(!q){fr=[];fc=-1;paint();parent.postMessage({type:"find-result",total:0,current:0,tabId:tid},"*");return;}',
          'fr=wt(document.body,q);',
          'fc=fr.length>0?0:-1;',
          'paint();',
          'parent.postMessage({type:"find-result",total:fr.length,current:fr.length>0?1:0,tabId:tid},"*");',
        '}else if(e.data.type==="find-nav"){',
          'if(fr.length===0)return;',
          'fc=e.data.forward?(fc+1)%fr.length:(fc-1+fr.length)%fr.length;',
          'paint();',
          'parent.postMessage({type:"find-result",total:fr.length,current:fc+1,tabId:e.data.tabId||""},"*");',
        '}',
      '});',
      '})();',
      '<\/script>',
    ].join('')
    return content.includes('</head>')
      ? content.replace('</head>', injection + '</head>')
      : injection + content
  }, [content])

  // T-PATCH-066 D1 + T-PATCH-067 R4: unified iframe message listener.
  // Handles two message types from the injected iframe bridge:
  //   {type:"iframe-focus"} — first click inside iframe → promote pane to activePaneId
  //   {type:"find-result", total, current} — find result → propagate to FindBar
  // Discriminate by e.source to avoid leaking cross-tab find results in split panes.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data) return
      if (e.data.type === 'iframe-focus') {
        const { panes, setActivePane } = useWorkspace.getState()
        const walk = (n: any): string | null => {
          if (n.type === 'leaf') return n.tabs.some((x: any) => x.id === tabId) ? n.paneId : null
          for (const c of n.children ?? []) {
            const r = walk(c)
            if (r) return r
          }
          return null
        }
        const paneId = walk(panes)
        if (paneId) setActivePane(paneId)
      } else if (e.data.type === 'find-result') {
        // Guard: match tabId echoed by the iframe instead of e.source identity —
        // sandboxed opaque-origin iframes make contentWindow identity unreliable,
        // which is why the source-guard was silently dropping all find-results.
        const matched = e.data.tabId === tabId
        if (!matched) return
        onFindResult?.({ total: e.data.total ?? 0, current: e.data.current ?? 0 })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [tabId, onFindResult])

  // T-PATCH-067 R5: live find-query → postMessage into iframe on each keystroke.
  // Also keeps findQueryRef current so the iframe onLoad handler resends the latest query.
  // Empty string clears highlights in the iframe.
  useEffect(() => {
    findQueryRef.current = findQuery ?? ''
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage({ type: 'find-query', q: findQuery ?? '', tabId }, '*')
  }, [findQuery, tabId])

  // T-PATCH-067 R4: assign nav fn to findNavRef so LeafPane can trigger navigation.
  // Stable across renders — only depends on the ref objects themselves.
  useEffect(() => {
    if (!findNavRef) return
    findNavRef.current = (forward: boolean) => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'find-nav', forward, tabId }, '*')
    }
    return () => {
      if (findNavRef) findNavRef.current = null
    }
  // findNavRef is a stable ref object — its identity doesn't change across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zoom state (T-PATCH-045): scales iframe via CSS zoom property.
  // Range 0.5–3.0 (AC-3), step 0.1 (AC-2).
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const IFRAME_ZOOM_MIN = 0.5
  const IFRAME_ZOOM_MAX = 3.0
  const IFRAME_ZOOM_STEP = 0.1
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(IFRAME_ZOOM_MAX, parseFloat((z + IFRAME_ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(IFRAME_ZOOM_MIN, parseFloat((z - IFRAME_ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT), [])

  // Live dirty flag for the close-guard (read inside the guard closure).
  const dirty = editing && draft !== content
  const dirtyFlagRef = useRef(false)
  useEffect(() => {
    dirtyFlagRef.current = dirty
  }, [dirty])

  const addToast = useCallback((msg: string, ok: boolean) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, msg, ok }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  // ── Load via project-scoped IPC ────────────────────────────────────────────
  const runLoad = useCallback(() => {
    if (!absPath || !projectDir) {
      setLoadState('error')
      return
    }
    const api = (window as any).api
    if (!api?.htmlReadFile) {
      setLoadState('error')
      return
    }
    setLoadState('loading')
    api
      .htmlReadFile(projectDir, absPath)
      .then((res: HtmlReadResult) => {
        if (res?.ok) {
          setContent(res.content ?? '')
          snapshotMtimeRef.current = res.mtimeMs ?? null
          setLoadState('done')
          setPreviewKey((k) => k + 1)
        } else {
          setLoadState('error')
        }
      })
      .catch(() => setLoadState('error'))
  }, [absPath, projectDir])

  useEffect(() => {
    runLoad()
  }, [runLoad])

  // ── Dirty-close guard (AC-5) ───────────────────────────────────────────────
  useEffect(() => {
    const unregister = registerTabCloseGuard(tabId, () => {
      if (!dirtyFlagRef.current) return true
      setDirtyModalOpen(true)
      return false
    })
    return () => unregister()
  }, [tabId])

  // ── Edit / Save ────────────────────────────────────────────────────────────
  const enterEdit = useCallback(() => {
    setDraft(content)
    setEditing(true)
    setConflict(false)
  }, [content])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraft('')
    setConflict(false)
  }, [])

  const handleSave = useCallback(async () => {
    const api = (window as any).api
    if (!api?.htmlWriteFile) return
    setSaving(true)
    setConflict(false)
    try {
      const res: HtmlWriteResult = await api.htmlWriteFile(
        projectDir,
        absPath,
        draft,
        snapshotMtimeRef.current,
      )
      if (res?.ok) {
        setContent(draft)
        if (typeof res.mtimeMs === 'number') snapshotMtimeRef.current = res.mtimeMs
        setEditing(false)
        setPreviewKey((k) => k + 1) // reload Preview with the saved content (AC-4)
        addToast(t('workspace.htmlViewer.savedToast'), true)
      } else if (res?.conflict) {
        // mtime drift — surface, do not overwrite (AC-5).
        setConflict(true)
      } else {
        addToast(t('workspace.htmlViewer.writeError', { error: res?.error ?? '' }), false)
      }
    } catch (e: any) {
      addToast(t('workspace.htmlViewer.writeError', { error: e?.message ?? '' }), false)
    } finally {
      setSaving(false)
    }
  }, [absPath, projectDir, draft, addToast, t])

  // Conflict reload: drop the stale draft, re-read on-disk content (AC-5).
  const handleConflictReload = useCallback(() => {
    setConflict(false)
    setEditing(false)
    setDraft('')
    runLoad()
  }, [runLoad])

  // ── Dirty modal handlers (AC-5) ────────────────────────────────────────────
  const handleDirtyCancel = useCallback(() => setDirtyModalOpen(false), [])

  const handleDirtyDiscard = useCallback(() => {
    setDirtyModalOpen(false)
    dirtyFlagRef.current = false // allow the re-issued close to pass the guard
    const active = useWorkspace.getState()
    const findPane = (nodes: any): string | null => {
      const walk = (n: any): string | null => {
        if (n.type === 'leaf') return n.tabs.some((x: any) => x.id === tabId) ? n.paneId : null
        for (const c of n.children ?? []) {
          const r = walk(c)
          if (r) return r
        }
        return null
      }
      return walk(nodes)
    }
    const paneId = findPane(active.panes)
    if (paneId) closeTabAction(paneId, tabId)
  }, [closeTabAction, tabId])

  const handleDirtySave = useCallback(() => {
    setDirtyModalOpen(false)
    void handleSave()
  }, [handleSave])

  // ── Breadcrumb (relative to projectDir when possible) ──────────────────────
  const relPath =
    projectDir && absPath.startsWith(projectDir)
      ? absPath.slice(projectDir.length).replace(/^\//, '')
      : absPath

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={headerBar}>
        <span style={crumb} title={absPath}>
          {relPath}
        </span>
        <div style={headerRight}>
          {!editing ? (
            <>
              {/* T-PATCH-045: zoom controls in preview mode (AC-1) */}
              <ZoomControls
                zoom={zoom}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onReset={zoomReset}
                min={IFRAME_ZOOM_MIN}
                max={IFRAME_ZOOM_MAX}
              />
              <button
                style={actionBtn}
                onClick={runLoad}
                title={t('workspace.htmlViewer.reload')}
                aria-label={t('workspace.htmlViewer.reload')}
                disabled={loadState === 'loading'}
              >
                <RefreshCw size={11} color="#909090" />
              </button>
              <button
                style={actionBtn}
                onClick={enterEdit}
                disabled={loadState !== 'done'}
              >
                <Pencil size={11} color="#909090" />
                <span>{t('workspace.htmlViewer.edit')}</span>
              </button>
            </>
          ) : (
            <div style={btnGroup}>
              <button style={actionBtn} onClick={handleSave} disabled={saving}>
                <Save size={11} color="#34D399" />
                <span>{saving ? t('common.loading') : t('workspace.htmlViewer.save')}</span>
              </button>
              <button style={actionBtn} onClick={cancelEdit} disabled={saving}>
                <X size={11} color="#909090" />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={body}>
        {loadState === 'loading' && (
          <div style={centerState}>
            <Loader2 size={20} style={{ color: '#505050' }} className="pdt-spin" />
          </div>
        )}

        {loadState === 'error' && (
          <div style={errorBanner}>
            <AlertOctagon size={14} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={errorText}>{t('workspace.htmlViewer.loadError')}</div>
              <button style={retryBtn} onClick={runLoad}>
                {t('common.retry')}
              </button>
            </div>
          </div>
        )}

        {loadState === 'done' && (
          <>
            {editing ? (
              <div style={editWrap}>
                <div style={modeHint}>
                  <Pencil size={11} color="#505050" />
                  <span>{t('workspace.htmlViewer.editHint')}</span>
                </div>
                <textarea
                  style={textarea}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {conflict && (
                  <div style={conflictRow}>
                    <AlertOctagon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ flex: 1 }}>{t('workspace.htmlViewer.conflict')}</span>
                    <button style={conflictBtn} onClick={handleConflictReload}>
                      {t('workspace.htmlViewer.reloadFromDisk')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={previewWrap}>
                <div style={modeHint}>
                  <Eye size={11} color="#505050" />
                  <span>{t('workspace.htmlViewer.preview')}</span>
                </div>
                {/* T-PATCH-066: allow-scripts enables the iframe-focus bridge (D1). */}
                {/* T-PATCH-067 R4: same sandbox; find bridge runs inside iframe via postMessage. */}
                {/* No allow-same-origin — iframe scripts cannot access parent DOM. */}
                {/* T-PATCH-045: CSS zoom scales iframe content (AC-2, AC-3) */}
                <iframe
                  key={previewKey}
                  ref={iframeRef}
                  title={t('workspace.htmlViewer.previewFrameTitle')}
                  srcDoc={srcDocWithFocusBridge}
                  sandbox="allow-scripts"
                  style={{ ...iframeEl, zoom: zoom }}
                  onLoad={() => {
                    // T-PATCH-067 R5: resend current query after iframe loads/reloads so a
                    // query typed before the iframe was ready still reaches the injected listener.
                    const win = iframeRef.current?.contentWindow
                    if (!win) return
                    win.postMessage({ type: 'find-query', q: findQueryRef.current, tabId }, '*')
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {dirtyModalOpen && (
        <GenericDirtyModal
          onCancel={handleDirtyCancel}
          onDiscard={handleDirtyDiscard}
          onSave={handleDirtySave}
        />
      )}

      {/* Toasts (pattern from DoctrineFileTabHost) */}
      {toasts.length > 0 && (
        <div style={toastStack}>
          {toasts.map((toast) => (
            <div key={toast.id} style={toastStyle(toast.ok)}>
              {toast.ok ? (
                <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
              ) : (
                <AlertOctagon size={13} style={{ flexShrink: 0 }} />
              )}
              <span style={toastMsg}>{toast.msg}</span>
              <button
                style={toastCloseBtn}
                onClick={() => dismissToast(toast.id)}
                aria-label={t('common.cancel')}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles (lifted from MarkdownViewer / CodeViewTab) ───────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
  position: 'relative',
}

const headerBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 16px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
  minHeight: 32,
}

const crumb: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}

const headerRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const btnGroup: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const actionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#A0A0A0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 10,
  padding: '2px 8px',
}

const body: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

const centerState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 48,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #EF4444',
  borderRadius: 4,
  padding: '10px 12px',
  margin: 24,
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8CC',
  lineHeight: 1.5,
}

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const previewWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

const iframeEl: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: '#FFFFFF',
  minHeight: 0,
  width: '100%',
}

const editWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  flex: 1,
  minHeight: 0,
  boxSizing: 'border-box',
}

const textarea: React.CSSProperties = {
  background: '#0A0A0A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.5,
  flex: 1,
  minHeight: 320,
  outline: 'none',
  padding: '10px 12px',
  resize: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const modeHint: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  fontSize: 10,
  color: '#606060',
  flexShrink: 0,
}

const conflictRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 11,
  color: '#E0A030',
  lineHeight: 1.5,
}

const conflictBtn: React.CSSProperties = {
  flexShrink: 0,
  background: 'transparent',
  border: '1px solid #3A2E12',
  borderRadius: 4,
  color: '#E0A030',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 10,
  padding: '2px 8px',
}

const toastStack: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  bottom: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 9999,
  maxWidth: 360,
}

function toastStyle(ok: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px 6px 12px',
    fontSize: 11,
    color: ok ? '#34D399' : '#E04040',
    background: ok ? '#0A2A1A' : '#2A0808',
    border: `1px solid ${ok ? '#1A3A1A' : '#3A1A1A'}`,
    borderRadius: 4,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  }
}

const toastMsg: React.CSSProperties = {
  flex: 1,
}

const toastCloseBtn: React.CSSProperties = {
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  lineHeight: 1,
  padding: '0 2px',
  opacity: 0.7,
  display: 'inline-flex',
  alignItems: 'center',
}
