/**
 * ImageTab — T-022
 *
 * Large-image viewer with explicit +/−/reset zoom controls in the header.
 * Zoom is implemented via CSS transform (same pattern as ArtifactMdTab).
 * Default/reset = fit-to-viewport (scale 1.0 = objectFit:contain behaviour).
 * Bounds: 0.4–2.5 (matching ArtifactMdTab).
 */

import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import ZoomControls, { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './ZoomControls'

interface Props {
  props?: Record<string, unknown>
}

export default function ImageTab({ props }: Props) {
  const absPath = props?.path as string | undefined
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)

  const zoomIn = useCallback(() =>
    setZoom(z => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2)))), [])
  const zoomOut = useCallback(() =>
    setZoom(z => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2)))), [])
  const zoomReset = useCallback(() => setZoom(ZOOM_DEFAULT), [])

  // Build breadcrumb from the filename portion of the path
  const fileName = absPath ? absPath.split('/').pop() ?? absPath : ''

  if (!absPath) {
    return (
      <div style={wrap}>
        <span style={muted}>No path provided.</span>
      </div>
    )
  }

  const src = `file://${absPath}`

  return (
    <div style={outerWrap}>
      {/* Header bar: filename + zoom controls */}
      <div style={headerBar}>
        <div style={breadcrumbRow}>
          <span style={crumbLast}>{fileName}</span>
        </div>
        <div style={headerRight}>
          <ZoomControls
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={zoomReset}
          />
        </div>
      </div>

      {/* Scrollable image area */}
      <div style={wrap}>
        <div style={zoomOuter}>
          <img
            src={src}
            alt={fileName}
            style={{
              ...imgStyle,
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const outerWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0e0e0e',
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

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
  padding: 24,
}

const zoomOuter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const imgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: 4,
  transition: 'transform 0.1s ease',
}

const muted: React.CSSProperties = {
  fontSize: 13,
  color: '#505050',
}
