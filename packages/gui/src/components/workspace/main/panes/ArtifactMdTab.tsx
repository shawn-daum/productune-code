/**
 * ArtifactMdTab — T-014
 *
 * Read-only markdown viewer for artifact files.
 * Uses MdRenderer (T-013) for rich rendering.
 * No edit affordance — read-only invariant.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, Loader2, Lock, ChevronRight } from 'lucide-react'
import MdRenderer from '../../chat/MdRenderer'
import ZoomControls, { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from './ZoomControls'

interface Props {
  props?: Record<string, unknown>
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// Base font-size (px) at zoom = 1.0 — matches md-recipes --text-base (13px).
// Zoom scales this via CSS font-size so layout reflows (no transform:scale clipping).
const BASE_FONT_PX = 13

export default function ArtifactMdTab({ props: tabProps }: Props) {
  const { t } = useTranslation()
  const absPath = typeof tabProps?.absPath === 'string' ? tabProps.absPath : ''
  const relPath = typeof tabProps?.relPath === 'string' ? tabProps.relPath : ''
  const projectDir = typeof tabProps?.projectDir === 'string' ? tabProps.projectDir : ''

  const [content, setContent] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)

  const zoomIn = useCallback(() =>
    setZoom(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2)))), [])
  const zoomOut = useCallback(() =>
    setZoom(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2)))), [])
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT), [])

  const load = useCallback(() => {
    if (!absPath || !projectDir) {
      setLoadState('error')
      return
    }
    setLoadState('loading')
    const api = (window as any).api
    api
      .artifactsReadFile(projectDir, absPath)
      .then((text: string) => {
        setContent(text)
        setLoadState('done')
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [absPath, projectDir])

  useEffect(() => {
    load()
  }, [load])

  // ── Breadcrumb segments ────────────────────────────────────────────────────
  const crumbParts = relPath ? relPath.split('/') : []

  return (
    <div style={wrap}>
      {/* Header bar: breadcrumb + read-only badge */}
      <div style={headerBar}>
        <div style={breadcrumbRow}>
          {crumbParts.map((part, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {idx > 0 && <ChevronRight size={10} style={{ color: '#3A3A3A', flexShrink: 0 }} />}
              <span style={idx === crumbParts.length - 1 ? crumbLast : crumbSeg}>
                {part}
              </span>
            </span>
          ))}
          {crumbParts.length === 0 && (
            <span style={crumbSeg}>{absPath || 'artifact'}</span>
          )}
        </div>
        <div style={headerRight}>
          {/* Zoom controls */}
          <ZoomControls
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={zoomReset}
          />
          <div style={roBadge}>
            <Lock size={11} style={{ flexShrink: 0 }} />
            <span>{t('workspace.common.readOnly')}</span>
          </div>
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
              <div style={errorText}>
                {t('workspace.common.fileLoadError')}
              </div>
              <button style={retryBtn} onClick={load}>
                {t('common.retry')}
              </button>
            </div>
          </div>
        )}

        {loadState === 'done' && content !== null && (
          <div
            className="artifact-md-zoom"
            style={{ ...viewerWrap, fontSize: `${(zoom * BASE_FONT_PX).toFixed(2)}px` }}
          >
            <MdRenderer text={content} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
}
