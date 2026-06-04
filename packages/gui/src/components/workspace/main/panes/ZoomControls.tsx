/**
 * ZoomControls — T-022 shared component
 *
 * Consistent +/−/reset zoom control group used by ArtifactMdTab,
 * ArtifactMermaidTab, and ImageTab. Mirrors the button row originally
 * inlined in ArtifactMdTab.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut } from 'lucide-react'

export const ZOOM_STEP = 0.15
export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.5
export const ZOOM_DEFAULT = 1.0

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  min?: number
  max?: number
}

export default function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
}: ZoomControlsProps) {
  const { t } = useTranslation()
  return (
    <div style={zoomGroup}>
      <button
        style={zoomBtn}
        onClick={onZoomOut}
        disabled={zoom <= min}
        title={t('workspace.zoom.out')}
        aria-label={t('workspace.zoom.out')}
      >
        <ZoomOut size={12} />
      </button>
      <button
        style={zoomResetBtn}
        onClick={onReset}
        title={t('workspace.zoom.reset')}
        aria-label={t('workspace.zoom.reset')}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        style={zoomBtn}
        onClick={onZoomIn}
        disabled={zoom >= max}
        title={t('workspace.zoom.in')}
        aria-label={t('workspace.zoom.in')}
      >
        <ZoomIn size={12} />
      </button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const zoomGroup: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0,
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  overflow: 'hidden',
}

const zoomBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1A1A1A',
  color: '#A0A0A0',
  border: 'none',
  borderRadius: 0,
  padding: '3px 6px',
  cursor: 'pointer',
  lineHeight: 1,
}

const zoomResetBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1A1A1A',
  color: '#707070',
  border: 'none',
  borderLeft: '1px solid #1F1F1F',
  borderRight: '1px solid #1F1F1F',
  borderRadius: 0,
  padding: '3px 6px',
  fontSize: 10,
  cursor: 'pointer',
  minWidth: 36,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lineHeight: 1,
}
