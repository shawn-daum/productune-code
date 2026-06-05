/**
 * MarkdownViewer — T-PATCH-028
 *
 * Shared markdown surface primitive, generalized from DoctrineFileTab
 * (T-PATCH-020). Three near-identical markdown tabs (ArtifactMdTab,
 * MarkdownTab, DoctrineFileTab) had drifted; this primitive carries the one
 * canonical implementation. Preview ALWAYS renders via MdRenderer (the
 * T-PATCH-027 invariant) — there is no raw <pre> fallback for the markdown body.
 *
 * Source-agnostic by design:
 *   - `load` is an injected fetch (memory / artifacts / doctrine IPC, or an
 *     inline string). The primitive imports NO specific IPC channel.
 *   - `editable` is a plain boolean. When false → Preview-only + Lock badge,
 *     no Edit / Save / Cancel, no textarea, no line-cap badge. When true →
 *     the full Preview ⇄ Edit flow (textarea, line-cap badge, Save/Cancel,
 *     inline saved / conflict / error states).
 *   - `zoom` is opt-in. When enabled the ZoomControls group renders in the
 *     header-right and scales the Preview font size (reflow via font-size, NOT
 *     transform: scale — matching ArtifactMdTab's BASE_FONT_PX approach).
 *
 * The save/conflict seam (onSave / DoctrineSaveResult / DoctrineDirtyState /
 * onDirtyChange) is preserved unchanged in shape so DoctrineFileTabHost keeps
 * working without edits. The Doctrine* type names are kept this round.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, Loader2, Lock, ChevronRight, Eye, Pencil, Save, X } from 'lucide-react'
import MdRenderer from '../../chat/MdRenderer'
import ZoomControls, { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from './ZoomControls'

// ── Seam types (preserved from DoctrineFileTab; re-exported for the host) ───────

/** Save seam result shape (mirrors doctrineWriteFile's resolved value). */
export interface DoctrineSaveResult {
  ok: boolean
  conflict?: boolean
  error?: string
  mtimeMs?: number
}

export type DoctrineOnSave = (
  absPath: string,
  content: string,
  expectedMtimeMs: number | null,
) => Promise<DoctrineSaveResult>

/**
 * Live dirty-state report for the host (T-PATCH-022 AC-4). Emitted whenever the
 * editor's dirty status or draft text changes so the host can register a
 * close-guard and re-drive the save flow from the dirty-confirm modal's "저장".
 */
export interface DoctrineDirtyState {
  dirty: boolean
  draft: string
}

// ── Loader contract (injected — the primitive owns no IPC channel) ──────────────

export interface MarkdownLoadResult {
  ok: boolean
  content?: string
  mtimeMs?: number | null
  error?: string
}

export type MarkdownLoad = () => Promise<MarkdownLoadResult>

interface MarkdownViewerProps {
  /** Injected content fetch. Replaces any inlined IPC read. */
  load: MarkdownLoad
  /** Path passed to onSave; also the breadcrumb fallback. */
  absPath?: string
  /** Slash-delimited breadcrumb label; falls back to absPath. */
  relName?: string
  /**
   * Editable flag (plain boolean — tier mapping stays in callers). false →
   * Preview-only + Lock badge, no edit affordances. true → full Preview ⇄ Edit.
   */
  editable: boolean
  /** Save seam. Required when editable; ignored when read-only. */
  onSave?: DoctrineOnSave
  /** Live dirty report for a host close-guard. Additive — no-op when absent. */
  onDirtyChange?: (state: DoctrineDirtyState) => void
  /** Opt-in zoom. When true, ZoomControls render and scale Preview font size. */
  zoomEnabled?: boolean
  /** Advisory line cap for the editable header badge. */
  lineCap?: number
  /** Breadcrumb fallback label when neither relName nor absPath is present. */
  emptyCrumb?: string
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// Base font-size (px) at zoom = 1.0 — matches md-recipes --text-base (13px).
// Zoom scales this via CSS font-size so layout reflows (no transform:scale clipping).
const BASE_FONT_PX = 13

// Advisory line-cap default for persona habit.md / bookshelf files. The 50-line
// common-habit cap is out of scope (carried as-is from DoctrineFileTab).
const DEFAULT_LINE_CAP = 100

export default function MarkdownViewer({
  load,
  absPath = '',
  relName = '',
  editable,
  onSave,
  onDirtyChange,
  zoomEnabled = false,
  lineCap = DEFAULT_LINE_CAP,
  emptyCrumb = 'doctrine',
}: MarkdownViewerProps) {
  const { t } = useTranslation()

  // Loaded on-disk content (source of truth for Preview + textarea seed).
  const [content, setContent] = useState<string>('')
  const [loadState, setLoadState] = useState<LoadState>('idle')

  // Conflict-detection snapshot: the mtime at the moment we last read/wrote.
  const snapshotMtimeRef = useRef<number | null>(null)

  // Editable-mode UI state (PersonaDefTab pattern).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)

  // Zoom state (only meaningful when zoomEnabled).
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2)))),
    [],
  )
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT), [])

  const runLoad = useCallback(() => {
    setLoadState('loading')
    load()
      .then((res) => {
        if (res?.ok) {
          setContent(res.content ?? '')
          snapshotMtimeRef.current = res.mtimeMs ?? null
          setLoadState('done')
        } else {
          setLoadState('error')
        }
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [load])

  useEffect(() => {
    runLoad()
  }, [runLoad])

  const enterEdit = useCallback(() => {
    setDraft(content)
    setEditing(true)
    setError(null)
    setConflict(false)
    setSaved(false)
  }, [content])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraft('')
    setError(null)
    setConflict(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!onSave) return
    setSaving(true)
    setError(null)
    setConflict(false)
    setSaved(false)
    try {
      const res = await onSave(absPath, draft, snapshotMtimeRef.current)
      if (res?.ok) {
        setContent(draft)
        if (typeof res.mtimeMs === 'number') snapshotMtimeRef.current = res.mtimeMs
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else if (res?.conflict) {
        setConflict(true)
      } else {
        setError(res?.error ?? 'write failed')
      }
    } catch (e: any) {
      setError(e?.message ?? 'write failed')
    } finally {
      setSaving(false)
    }
  }, [onSave, absPath, draft])

  // T-PATCH-022 AC-4: report dirty state + current draft so the host can guard
  // tab close and re-drive the save-choice dialog from "저장". Additive — a no-op
  // when no host injects onDirtyChange (default render path).
  const dirty = editing && draft !== content
  useEffect(() => {
    onDirtyChange?.({ dirty, draft: dirty ? draft : content })
  }, [onDirtyChange, dirty, draft, content])

  // ── Breadcrumb segments (split relName, fall back to absPath) ───────────────
  const crumbSource = relName || absPath
  const crumbParts = crumbSource ? crumbSource.split('/') : []

  // Advisory line count for the editable header badge.
  const liveText = editing ? draft : content
  const lineCount = liveText === '' ? 0 : liveText.split('\n').length
  const overCap = lineCount > lineCap

  return (
    <div style={wrap}>
      {/* Header bar */}
      <div style={headerBar}>
        <div style={breadcrumbRow}>
          {crumbParts.map((part, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {idx > 0 && <ChevronRight size={10} style={{ color: '#3A3A3A', flexShrink: 0 }} />}
              <span style={idx === crumbParts.length - 1 ? crumbLast : crumbSeg}>{part}</span>
            </span>
          ))}
          {crumbParts.length === 0 && <span style={crumbSeg}>{emptyCrumb}</span>}
        </div>

        <div style={headerRight}>
          {zoomEnabled && (
            <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={zoomReset} />
          )}
          {editable ? (
            <>
              {/* Advisory line-cap badge — never disables Save. */}
              <span
                style={overCap ? lineCapBadgeOver : lineCapBadge}
                title={t('workspace.doctrineFile.lineCapTooltip', { count: lineCount, cap: lineCap })}
              >
                {lineCount}/{lineCap}
              </span>
              {!editing ? (
                <button style={actionBtn} onClick={enterEdit} disabled={loadState !== 'done'}>
                  <Pencil size={11} color="#909090" />
                  <span>{t('workspace.doctrineFile.edit')}</span>
                </button>
              ) : (
                <div style={btnGroup}>
                  <button style={actionBtn} onClick={handleSave} disabled={saving}>
                    <Save size={11} color="#34D399" />
                    <span>{saving ? t('common.loading') : t('workspace.doctrineFile.save')}</span>
                  </button>
                  <button style={actionBtn} onClick={cancelEdit} disabled={saving}>
                    <X size={11} color="#909090" />
                    <span>{t('common.cancel')}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={roBadge}>
              <Lock size={11} style={{ flexShrink: 0 }} />
              <span>{t('workspace.common.readOnly')}</span>
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
              <div style={errorText}>{t('workspace.common.fileLoadError')}</div>
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
                <textarea
                  style={textarea}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {conflict && (
                  <div style={conflictText}>
                    <AlertOctagon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{t('workspace.doctrineFile.conflict')}</span>
                  </div>
                )}
                {error && <div style={errorInline}>{error}</div>}
              </div>
            ) : (
              <>
                {/* Read-only state hint for editable files (Preview mode) */}
                {editable && (
                  <div style={modeHint}>
                    <Eye size={11} color="#505050" />
                    <span>{t('workspace.doctrineFile.preview')}</span>
                    {saved && <span style={savedText}>{t('workspace.doctrineFile.saved')}</span>}
                  </div>
                )}
                <div
                  style={
                    zoomEnabled
                      ? { ...viewerWrap, fontSize: `${(zoom * BASE_FONT_PX).toFixed(2)}px` }
                      : viewerWrap
                  }
                >
                  <MdRenderer text={content} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles (lifted from DoctrineFileTab / ArtifactMdTab) ────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
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

const breadcrumbRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flex: 1,
  overflow: 'hidden',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 11,
  color: '#A0A0A0',
  minWidth: 0,
}

const crumbSeg: React.CSSProperties = {
  color: '#707070',
  whiteSpace: 'nowrap',
}

const crumbLast: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const headerRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const roBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const lineCapBadge: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const lineCapBadgeOver: React.CSSProperties = {
  ...lineCapBadge,
  color: '#E0A030',
  borderColor: '#3A2E12',
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
  overflow: 'auto',
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

const viewerWrap: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: 780,
  lineHeight: 1.65,
  fontSize: 13,
}

const editWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  height: '100%',
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
  padding: '6px 16px 0',
  fontSize: 10,
  color: '#606060',
}

const savedText: React.CSSProperties = {
  color: '#34D399',
  marginLeft: 4,
}

const conflictText: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 11,
  color: '#E0A030',
  lineHeight: 1.5,
}

const errorInline: React.CSSProperties = {
  fontSize: 11,
  color: '#E04040',
}
