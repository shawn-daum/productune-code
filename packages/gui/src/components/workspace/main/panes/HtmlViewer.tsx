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

import { useCallback, useEffect, useRef, useState } from 'react'
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

interface Props {
  tabId: string
  props?: Record<string, unknown>
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

export default function HtmlViewer({ tabId, props: tabProps }: Props) {
  const url = typeof tabProps?.url === 'string' ? tabProps.url : ''
  const isHttp = /^https?:\/\//i.test(url)

  // ── http(s) branch — delegate to the existing webview path ─────────────────
  if (isHttp) {
    return <BrowserTab tabId={tabId} props={tabProps} />
  }

  return <LocalHtmlViewer tabId={tabId} props={tabProps} />
}

// ── Local-file viewer ─────────────────────────────────────────────────────────

function LocalHtmlViewer({ tabId, props: tabProps }: Props) {
  const { t } = useTranslation()
  const absPath = typeof tabProps?.path === 'string' ? tabProps.path : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const closeTabAction = useWorkspace((s) => s.closeTab)

  // On-disk content (Preview source + textarea seed).
  const [content, setContent] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('idle')

  // mtime snapshot captured at read/write — drives the conflict guard.
  const snapshotMtimeRef = useRef<number | null>(null)

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
                {/* Sandboxed: empty sandbox => no scripts, no same-origin. */}
                <iframe
                  key={previewKey}
                  title={t('workspace.htmlViewer.previewFrameTitle')}
                  srcDoc={content}
                  sandbox=""
                  style={iframeEl}
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
