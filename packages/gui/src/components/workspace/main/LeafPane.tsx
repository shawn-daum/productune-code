import { useRef } from 'react'
import type { LeafPaneNode } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'
import TabBar from './TabBar'
import TabContent from './TabContent'
import EmptyPane from './EmptyPane'

const DRAG_MIME = 'application/x-productune-tab'

interface Props {
  leaf: LeafPaneNode
}

type Zone = 'top' | 'right' | 'bottom' | 'left' | 'center'

export default function LeafPane({ leaf }: Props) {
  const activePaneId = useWorkspace((s) => s.activePaneId)
  const setActivePane = useWorkspace((s) => s.setActivePane)
  const moveTab = useWorkspace((s) => s.moveTab)
  const setDragHint = useWorkspace((s) => s.setDragHint)
  const dragHint = useWorkspace((s) => s.dragHint)
  const isActive = leaf.paneId === activePaneId

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId) ?? null

  const computeZone = (e: React.DragEvent): Zone | null => {
    const el = bodyRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
    const fx = x / rect.width
    const fy = y / rect.height
    // 25% margin frames; whichever margin the cursor sits in wins; if cursor
    // is in two margins, pick the closer edge (smaller relative distance).
    const distTop = fy
    const distBottom = 1 - fy
    const distLeft = fx
    const distRight = 1 - fx
    const min = Math.min(distTop, distBottom, distLeft, distRight)
    if (min >= 0.25) return 'center'
    if (min === distTop) return 'top'
    if (min === distBottom) return 'bottom'
    if (min === distLeft) return 'left'
    return 'right'
  }

  const onBodyDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const zone = computeZone(e)
    if (!zone) return
    setDragHint({ kind: 'pane-zone', paneId: leaf.paneId, zone })
  }

  const onBodyDragLeave = () => {
    setDragHint(null)
  }

  const onBodyDrop = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes(DRAG_MIME)) return
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    let payload: { fromPaneId: string; tabId: string }
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    const zone = computeZone(e) ?? 'center'
    moveTab(payload.fromPaneId, payload.tabId, { kind: 'pane-zone', paneId: leaf.paneId, zone })
  }

  const overlay = dragHint?.kind === 'pane-zone' && dragHint.paneId === leaf.paneId
    ? zoneOverlayStyle(dragHint.zone)
    : null

  return (
    <div
      style={wrap(isActive)}
      onMouseDown={() => setActivePane(leaf.paneId)}
      data-pane-id={leaf.paneId}
    >
      <TabBar leaf={leaf} isActivePane={isActive} />
      <div
        style={body}
        ref={bodyRef}
        onDragOver={onBodyDragOver}
        onDragLeave={onBodyDragLeave}
        onDrop={onBodyDrop}
      >
        {activeTab ? <TabContent tab={activeTab} /> : <EmptyPane />}
        {overlay && <div style={overlay} />}
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

function wrap(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 150,
    minHeight: 100,
    background: '#0F0F0F',
    border: `1px solid ${isActive ? '#FF6B2B66' : '#1A1A1A'}`,
    boxShadow: isActive ? '0 0 0 1px #FF6B2B33 inset' : 'none',
    overflow: 'hidden',
  }
}

const body: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

function zoneOverlayStyle(zone: Zone): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    background: '#FF6B2B22',
    border: '1px dashed #FF6B2B',
    pointerEvents: 'none',
    transition: 'all 0.08s',
    zIndex: 5,
  }
  switch (zone) {
    case 'top':    return { ...base, top: 0, left: 0, right: 0, height: '50%' }
    case 'bottom': return { ...base, bottom: 0, left: 0, right: 0, height: '50%' }
    case 'left':   return { ...base, top: 0, bottom: 0, left: 0, width: '50%' }
    case 'right':  return { ...base, top: 0, bottom: 0, right: 0, width: '50%' }
    case 'center':
    default:       return { ...base, top: 0, left: 0, right: 0, bottom: 0 }
  }
}
