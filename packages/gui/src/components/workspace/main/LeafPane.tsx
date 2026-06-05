import { useRef, useState, useEffect, useCallback } from 'react'
import type { LeafPaneNode, PaneZone } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'
import TabBar from './TabBar'
import TabContent from './TabContent'
import EmptyPane from './EmptyPane'
import FindBar from './FindBar'
import type { BrowserFindHandle } from './panes/BrowserTab'

const DRAG_MIME = 'application/x-productune-tab'

interface Props {
  leaf: LeafPaneNode
}

export default function LeafPane({ leaf }: Props) {
  const activePaneId = useWorkspace((s) => s.activePaneId)
  const setActivePane = useWorkspace((s) => s.setActivePane)
  const moveTab = useWorkspace((s) => s.moveTab)
  const setDragHint = useWorkspace((s) => s.setDragHint)
  const dragHint = useWorkspace((s) => s.dragHint)
  const tabDragActive = useWorkspace((s) => s.tabDragActive)
  const isActive = leaf.paneId === activePaneId

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId) ?? null

  // ── T-PATCH-046: find bar state ───────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null)
  // Ref to browser tab find API (only populated when active tab is browser type)
  const browserFindRef = useRef<BrowserFindHandle | null>(null)
  // Track unsubscribe fn for found-in-page events
  const foundInPageUnsub = useRef<(() => void) | null>(null)

  const isBrowserTab = activeTab?.type === 'browser'

  const TEXT_TAB_TYPES = new Set(['markdown', 'artifact-md', 'code-view', 'doctrine-file'])
  const isTextTab = activeTab ? TEXT_TAB_TYPES.has(activeTab.type) : false

  // Open find bar
  const openFind = useCallback(() => {
    setFindOpen(true)
  }, [])

  // Close find bar — stop any running find
  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
    setMatchInfo(null)
    if (isBrowserTab && browserFindRef.current) {
      browserFindRef.current.stopFindInPage()
      foundInPageUnsub.current?.()
      foundInPageUnsub.current = null
    } else {
      // Clear window.find selection
      window.getSelection()?.removeAllRanges()
    }
  }, [isBrowserTab])

  // Run find in browser tab
  const runBrowserFind = useCallback((text: string, forward: boolean, findNext: boolean) => {
    const handle = browserFindRef.current
    if (!handle) return
    if (!text) {
      handle.stopFindInPage()
      setMatchInfo(null)
      return
    }
    // Subscribe to found-in-page result (once per session)
    if (!foundInPageUnsub.current) {
      foundInPageUnsub.current = handle.onFoundInPage((result) => {
        setMatchInfo({ current: result.activeMatchOrdinal, total: result.matches })
      })
    }
    handle.findInPage(text, { forward, findNext })
  }, [])

  // Run find in text (DOM) tab using window.find()
  const runTextFind = useCallback((text: string, forward: boolean) => {
    if (!text) {
      window.getSelection()?.removeAllRanges()
      setMatchInfo(null)
      return
    }
    const found = (window as any).find(
      text,
      /* caseSensitive */ false,
      /* backwards */ !forward,
      /* wrapAround */ true,
    ) as boolean
    // window.find() doesn't give a match count — show minimal feedback only
    setMatchInfo(found ? { current: 1, total: 1 } : { current: 0, total: 0 })
  }, [])

  // Handle query changes
  const handleQueryChange = useCallback((q: string) => {
    setFindQuery(q)
    setMatchInfo(null)
    if (isBrowserTab) {
      runBrowserFind(q, true, false)
    } else if (isTextTab) {
      runTextFind(q, true)
    }
  }, [isBrowserTab, isTextTab, runBrowserFind, runTextFind])

  // Next match
  const handleNext = useCallback(() => {
    if (isBrowserTab) {
      runBrowserFind(findQuery, true, true)
    } else if (isTextTab) {
      runTextFind(findQuery, true)
    }
  }, [isBrowserTab, isTextTab, findQuery, runBrowserFind, runTextFind])

  // Prev match
  const handlePrev = useCallback(() => {
    if (isBrowserTab) {
      runBrowserFind(findQuery, false, true)
    } else if (isTextTab) {
      runTextFind(findQuery, false)
    }
  }, [isBrowserTab, isTextTab, findQuery, runBrowserFind, runTextFind])

  // Close find when active tab changes
  useEffect(() => {
    if (findOpen) closeFind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id])

  // ── Keyboard shortcut: cmd+F / ctrl+F opens find bar ─────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.key === 'f' && isActive) {
        // Only handle if a supported tab is active
        if (activeTab && (isBrowserTab || isTextTab)) {
          e.preventDefault()
          openFind()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, activeTab, isBrowserTab, isTextTab, openFind])

  // ── IPC: menu:find from Electron menu bar ─────────────────────────────────
  useEffect(() => {
    const api = (window as any).api
    if (!api?.onMenuFind) return
    const unsub = api.onMenuFind(() => {
      if (isActive && activeTab && (isBrowserTab || isTextTab)) {
        openFind()
      }
    })
    return unsub
  }, [isActive, activeTab, isBrowserTab, isTextTab, openFind])

  const computeZone = (e: React.DragEvent): PaneZone | null => {
    const el = bodyRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
    const fx = x / rect.width
    const fy = y / rect.height

    // Corner quarters win first: the cursor sits in a corner box that overlaps
    // two edge bands (mockup: quarters sit above the half bands). A corner is
    // the intersection of a horizontal edge band and a vertical edge band.
    const inLeft = fx < CORNER_X
    const inRight = fx > 1 - CORNER_X
    const inTop = fy < CORNER_Y
    const inBottom = fy > 1 - CORNER_Y
    if (inTop && inLeft) return 'q-tl'
    if (inTop && inRight) return 'q-tr'
    if (inBottom && inLeft) return 'q-bl'
    if (inBottom && inRight) return 'q-br'

    // Half-edge bands: 30% margin frames (mockup). Whichever margin the cursor
    // sits in wins; ties resolve to the closer edge. Center is the inner box.
    const distTop = fy
    const distBottom = 1 - fy
    const distLeft = fx
    const distRight = 1 - fx
    const min = Math.min(distTop, distBottom, distLeft, distRight)
    if (min >= EDGE_BAND) return 'center'
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

  const activeZone =
    dragHint?.kind === 'pane-zone' && dragHint.paneId === leaf.paneId ? dragHint.zone : null

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
        {/* T-PATCH-046: find bar overlay (absolute, z-index 20) */}
        {findOpen && (
          <FindBar
            query={findQuery}
            onQueryChange={handleQueryChange}
            onNext={handleNext}
            onPrev={handlePrev}
            onClose={closeFind}
            matchInfo={matchInfo}
          />
        )}

        {activeTab
          ? <TabContent
              key={activeTab.id}
              tab={activeTab}
              browserFindRef={isBrowserTab ? browserFindRef : undefined}
            />
          : <EmptyPane />}

        {/* #4c — transparent capture layer over the body while a tab drag is in
            progress. A <webview>/iframe would otherwise swallow the drag events
            and the drop-zones below would never see them. This layer sits above
            the content but below the drop-zone overlay, and forwards the same
            DnD events to the body handlers. */}
        {tabDragActive && (
          <div
            style={dragCaptureLayer}
            onDragOver={onBodyDragOver}
            onDragLeave={onBodyDragLeave}
            onDrop={onBodyDrop}
          />
        )}

        {/* #4b — preview ghost of the resulting split/join layout. */}
        {activeZone && <div style={previewStyle(activeZone)} />}
      </div>
    </div>
  )
}

// ── geometry constants ──────────────────────────────────────────────────────────
// Corner quarter box reaches CORNER_X across / CORNER_Y down from each corner.
// Edge bands occupy the outer EDGE_BAND fraction; the inner box is the center.
const CORNER_X = 0.22
const CORNER_Y = 0.34
const EDGE_BAND = 0.3

// ── styles ────────────────────────────────────────────────────────────────────

function wrap(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 150,
    minHeight: 100,
    background: '#0F0F0F',
    border: `1px solid ${isActive ? '#8B5CF666' : '#1A1A1A'}`,
    boxShadow: isActive ? '0 0 0 1px #8B5CF633 inset' : 'none',
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

const dragCaptureLayer: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 4,
  // transparent — purely to intercept drag events away from a webview/iframe.
  background: 'transparent',
}

/** The filled translucent preview rectangle of where the dragged tab lands. */
function previewStyle(zone: PaneZone): React.CSSProperties {
  const isCenter = zone === 'center'
  const base: React.CSSProperties = {
    position: 'absolute',
    background: isCenter ? 'rgba(56,189,248,0.12)' : '#8B5CF61f',
    border: `1.5px solid ${isCenter ? 'rgba(56,189,248,0.55)' : '#8B5CF68c'}`,
    borderRadius: 4,
    pointerEvents: 'none',
    transition: 'all 0.12s cubic-bezier(0.2,0,0,1)',
    zIndex: 6,
    boxShadow: isCenter
      ? 'inset 0 0 0 1px rgba(56,189,248,0.3)'
      : 'inset 0 0 0 1px #8B5CF633, 0 8px 24px rgba(139,92,246,0.18)',
  }
  return { ...base, ...zoneRect(zone) }
}

/** Resulting-layout rectangle per zone, as a fraction of the pane body. */
function zoneRect(zone: PaneZone): React.CSSProperties {
  switch (zone) {
    case 'left':   return { left: 0, top: 0, width: '50%', height: '100%' }
    case 'right':  return { left: '50%', top: 0, width: '50%', height: '100%' }
    case 'top':    return { left: 0, top: 0, width: '100%', height: '50%' }
    case 'bottom': return { left: 0, top: '50%', width: '100%', height: '50%' }
    case 'q-tl':   return { left: 0, top: 0, width: '50%', height: '50%' }
    case 'q-tr':   return { left: '50%', top: 0, width: '50%', height: '50%' }
    case 'q-bl':   return { left: 0, top: '50%', width: '50%', height: '50%' }
    case 'q-br':   return { left: '50%', top: '50%', width: '50%', height: '50%' }
    case 'center':
    default:       return { left: 0, top: 0, width: '100%', height: '100%' }
  }
}
