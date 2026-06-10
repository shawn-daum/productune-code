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

  // ── T-PATCH-058: ref to the FindBar <input> for focus restoration ─────────
  const findInputRef = useRef<HTMLInputElement | null>(null)

  // ── T-PATCH-046: find bar state ───────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null)
  // Ref to browser tab find API (only populated when active tab is browser type)
  const browserFindRef = useRef<BrowserFindHandle | null>(null)
  // Track unsubscribe fn for found-in-page events
  const foundInPageUnsub = useRef<(() => void) | null>(null)
  // T-PATCH-067 R6: debounce timer for live browser-find (findNext:false) — see live useEffect.
  const liveBrowserFindTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const BROWSER_FIND_DEBOUNCE_MS = 150

  const isBrowserTab = activeTab?.type === 'browser'

  // T-PATCH-067: parent-side CSS Custom Highlight for these four tab types.
  const TEXT_TAB_TYPES = new Set(['markdown', 'artifact-md', 'code-view', 'doctrine-file'])
  const isTextTab = activeTab ? TEXT_TAB_TYPES.has(activeTab.type) : false

  // T-PATCH-067 R4: 'preview' (local HTML artifact) — find routed into the iframe
  // via postMessage bridge. HtmlViewer owns the iframe ref + highlight logic.
  const isPreviewTab = activeTab?.type === 'preview'

  // T-PATCH-094: 'artifact-json' — find routed into the JSON tree component, which
  // owns its own auto-expand + CSS-highlight logic (the tree is plain DOM, not an
  // iframe, but collapsed nodes aren't in the DOM so the generic text path can't
  // reach them). Mirrors the preview nav-ref + result-callback contract.
  const isJsonTab = activeTab?.type === 'artifact-json'

  // Nav callback ref: HtmlViewer assigns its postMessage fn here; LeafPane calls it.
  const htmlViewerNavRef = useRef<((forward: boolean) => void) | null>(null)
  // Nav callback ref: ArtifactJsonTab assigns its in-tree nav fn here.
  const jsonViewerNavRef = useRef<((forward: boolean) => void) | null>(null)

  // T-PATCH-067: CSS Custom Highlight API state for text-tab find.
  // Unique names per pane so concurrent find in split panes don't overwrite each other.
  const FIND_HL = `pdt-find-${leaf.paneId}`
  const FIND_HL_ACTIVE = `pdt-find-active-${leaf.paneId}`
  const matchRangesRef = useRef<Range[]>([])
  const currentMatchIdxRef = useRef<number>(-1)

  // Open find bar
  const openFind = useCallback(() => {
    setFindOpen(true)
  }, [])

  // T-PATCH-067: Inject per-pane ::highlight CSS rules once on mount.
  // Unique names (FIND_HL / FIND_HL_ACTIVE) scoped to this pane so concurrent
  // find in split panes don't overwrite each other's CSS.highlights entries.
  useEffect(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-pdt-find-pane', leaf.paneId)
    styleEl.textContent =
      `::highlight(${FIND_HL}){background-color:#FFE066;color:#1A1A1A;}` +
      `::highlight(${FIND_HL_ACTIVE}){background-color:#FF9900;color:#1A1A1A;}`
    document.head.appendChild(styleEl)
    return () => {
      styleEl.remove()
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        ;(CSS as any).highlights.delete(FIND_HL)
        ;(CSS as any).highlights.delete(FIND_HL_ACTIVE)
      }
    }
  // FIND_HL / FIND_HL_ACTIVE are derived from leaf.paneId which is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf.paneId])

  // T-PATCH-067: Clear CSS Highlight API state (does not affect matchInfo state).
  const clearHighlight = useCallback(() => {
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      ;(CSS as any).highlights.delete(FIND_HL)
      ;(CSS as any).highlights.delete(FIND_HL_ACTIVE)
    }
    matchRangesRef.current = []
    currentMatchIdxRef.current = -1
  }, [FIND_HL, FIND_HL_ACTIVE])

  // Close find bar — stop any running find
  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
    setMatchInfo(null)
    // R6: cancel any pending debounced live search so it can't fire after close.
    if (liveBrowserFindTimer.current) {
      clearTimeout(liveBrowserFindTimer.current)
      liveBrowserFindTimer.current = null
    }
    if (isBrowserTab && browserFindRef.current) {
      browserFindRef.current.stopFindInPage()
      foundInPageUnsub.current?.()
      foundInPageUnsub.current = null
    } else {
      clearHighlight()
    }
  }, [isBrowserTab, clearHighlight])

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
    // T-PATCH-067 R6: per-keystroke stopFindInPage() REMOVED (was the R2/R5 "fix").
    // ROOT CAUSE of the real bug is upstream of here: Chromium's find engine treats every
    // findInPage(findNext:false) as a NEW find session that ABORTS the previous in-flight
    // request. The scoping pass that produces found-in-page is async; one request per
    // keystroke means each new request cancels the prior before it emits its final event, so
    // only the first char + a settled/Enter request ever complete. stopFindInPage did NOT help
    // — it adds ANOTHER async cancellation into the same flooded pipe, making coalescing worse.
    // The fix is to stop flooding: the live useEffect now DEBOUNCES so exactly one clean
    // findInPage(findNext:false) is issued per typing pause. With a single request in flight
    // Chromium completes scoping and emits found-in-page. findInPage(findNext:false) already
    // starts a fresh session in Chromium, so an explicit stop before it is redundant.
    // stopFindInPage is now reserved for clear (empty query, above) and close (closeFind).
    // The R5 requestId latest-wins filter in BrowserTab is KEPT: found-in-page fires multiple
    // times per request (intermediate updates) and a debounced request can still supersede a
    // slow predecessor — the filter discards stale events defensively. Nav (findNext:true,
    // Enter/Shift+Enter) continues the active session and stays IMMEDIATE (not debounced).
    handle.findInPage(text, { forward, findNext })
  }, [])

  // T-PATCH-067: Replace window.find() with CSS Custom Highlight API.
  // Walks the pane body's text nodes, builds a Range per case-insensitive match,
  // paints via CSS.highlights — focus-independent so the find <input> keeps focus
  // and highlights persist while typing (fixes AC-1 / AC-2).
  // Also yields a real total count and scrolls the active match into view.
  const runTextFind = useCallback((text: string) => {
    // Always clear previous highlights before rebuilding
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      ;(CSS as any).highlights.delete(FIND_HL)
      ;(CSS as any).highlights.delete(FIND_HL_ACTIVE)
    }
    matchRangesRef.current = []
    currentMatchIdxRef.current = -1

    if (!text) {
      setMatchInfo(null)
      return
    }

    if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
      // CSS Custom Highlight API unavailable (old Electron build) — degrade gracefully
      setMatchInfo({ current: 0, total: 0 })
      return
    }

    const root = bodyRef.current
    if (!root) {
      setMatchInfo({ current: 0, total: 0 })
      return
    }

    const ranges: Range[] = []
    const query = text.toLowerCase()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    let node: Node | null
    while ((node = walker.nextNode()) !== null) {
      const textNode = node as Text
      const val = textNode.nodeValue ?? ''
      const lower = val.toLowerCase()
      let idx = 0
      let found: number
      while ((found = lower.indexOf(query, idx)) !== -1) {
        const range = document.createRange()
        range.setStart(textNode, found)
        range.setEnd(textNode, found + query.length)
        ranges.push(range)
        idx = found + query.length
      }
    }

    matchRangesRef.current = ranges

    if (ranges.length === 0) {
      setMatchInfo({ current: 0, total: 0 })
      return
    }

    const hl = (CSS as any).highlights
    // Paint all matches
    hl.set(FIND_HL, new (window as any).Highlight(...ranges))
    // First match is active
    currentMatchIdxRef.current = 0
    hl.set(FIND_HL_ACTIVE, new (window as any).Highlight(ranges[0]))
    ;(ranges[0].startContainer as Element).parentElement?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
    setMatchInfo({ current: 1, total: ranges.length })
  }, [FIND_HL, FIND_HL_ACTIVE])

  // Navigate within already-built ranges (Enter / Shift+Enter).
  const navigateTextFind = useCallback((forward: boolean) => {
    const ranges = matchRangesRef.current
    if (ranges.length === 0) return
    currentMatchIdxRef.current = forward
      ? (currentMatchIdxRef.current + 1) % ranges.length
      : (currentMatchIdxRef.current - 1 + ranges.length) % ranges.length
    const activeRange = ranges[currentMatchIdxRef.current]
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      ;(CSS as any).highlights.set(FIND_HL_ACTIVE, new (window as any).Highlight(activeRange))
    }
    ;(activeRange.startContainer as Element).parentElement?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
    setMatchInfo({ current: currentMatchIdxRef.current + 1, total: ranges.length })
  }, [FIND_HL_ACTIVE])

  // Handle query changes — state update only; live search is driven by useEffect below
  const handleQueryChange = useCallback((q: string) => {
    setFindQuery(q)
    setMatchInfo(null)
  }, [])

  // T-PATCH-067 R4: callback from HtmlViewer → update match count in FindBar.
  const handlePreviewFindResult = useCallback((info: { total: number; current: number }) => {
    setMatchInfo(info)
  }, [])

  // T-PATCH-094: callback from ArtifactJsonTab → update match count in FindBar.
  const handleJsonFindResult = useCallback((info: { total: number; current: number }) => {
    setMatchInfo(info)
  }, [])

  // Next match (Enter)
  const handleNext = useCallback(() => {
    if (isBrowserTab) {
      runBrowserFind(findQuery, true, true)
    } else if (isTextTab) {
      navigateTextFind(true)
    } else if (isPreviewTab) {
      htmlViewerNavRef.current?.(true)
    } else if (isJsonTab) {
      jsonViewerNavRef.current?.(true)
    }
  }, [isBrowserTab, isTextTab, isPreviewTab, isJsonTab, findQuery, runBrowserFind, navigateTextFind])

  // Prev match (Shift+Enter)
  const handlePrev = useCallback(() => {
    if (isBrowserTab) {
      runBrowserFind(findQuery, false, true)
    } else if (isTextTab) {
      navigateTextFind(false)
    } else if (isPreviewTab) {
      htmlViewerNavRef.current?.(false)
    } else if (isJsonTab) {
      jsonViewerNavRef.current?.(false)
    }
  }, [isBrowserTab, isTextTab, isPreviewTab, isJsonTab, findQuery, runBrowserFind, navigateTextFind])

  // T-PATCH-067: Live search — fires on every findQuery change while find bar is open.
  // Decoupled from handleQueryChange so React commit completes before searching.
  //
  // R6 — browser (<webview>) path is now DEBOUNCED. Chromium aborts an in-flight
  // findInPage(findNext:false) when a newer one arrives, so per-keystroke calls cancel each
  // other and only the first char + a settled request emit found-in-page. We wait
  // BROWSER_FIND_DEBOUNCE_MS (150ms) after the LAST keystroke, then issue exactly ONE
  // findInPage — a single in-flight request completes its scoping and emits the event.
  // The text-tab (CSS Custom Highlight) path is synchronous + local, so it stays immediate.
  useEffect(() => {
    if (!findOpen) return

    if (isBrowserTab) {
      // Reset any pending debounced search on each keystroke (clear-then-reschedule).
      if (liveBrowserFindTimer.current) {
        clearTimeout(liveBrowserFindTimer.current)
        liveBrowserFindTimer.current = null
      }
      if (!findQuery) {
        // Empty query → clear IMMEDIATELY (no debounce delay on clear).
        runBrowserFind('', true, false)
        return
      }
      const q = findQuery
      liveBrowserFindTimer.current = setTimeout(() => {
        runBrowserFind(q, true, false)
        liveBrowserFindTimer.current = null
      }, BROWSER_FIND_DEBOUNCE_MS)
      return () => {
        if (liveBrowserFindTimer.current) {
          clearTimeout(liveBrowserFindTimer.current)
          liveBrowserFindTimer.current = null
        }
      }
    }

    if (isTextTab) {
      runTextFind(findQuery)
    }
  }, [findQuery, findOpen, isBrowserTab, isTextTab, runBrowserFind, runTextFind])

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
        if (activeTab && (isBrowserTab || isTextTab || isPreviewTab || isJsonTab)) {
          e.preventDefault()
          openFind()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, activeTab, isBrowserTab, isTextTab, isPreviewTab, isJsonTab, openFind])

  // ── IPC: menu:find from Electron menu bar ─────────────────────────────────
  useEffect(() => {
    const api = (window as any).api
    if (!api?.onMenuFind) return
    const unsub = api.onMenuFind(() => {
      if (isActive && activeTab && (isBrowserTab || isTextTab || isPreviewTab || isJsonTab)) {
        openFind()
      }
    })
    return unsub
  }, [isActive, activeTab, isBrowserTab, isTextTab, isPreviewTab, isJsonTab, openFind])

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
            inputRef={findInputRef}
          />
        )}

        {activeTab
          ? <TabContent
              key={activeTab.id}
              tab={activeTab}
              browserFindRef={isBrowserTab ? browserFindRef : undefined}
              previewFindQuery={isPreviewTab ? findQuery : undefined}
              previewFindNavRef={isPreviewTab ? htmlViewerNavRef : undefined}
              onPreviewFindResult={isPreviewTab ? handlePreviewFindResult : undefined}
              jsonFindQuery={isJsonTab ? findQuery : undefined}
              jsonFindNavRef={isJsonTab ? jsonViewerNavRef : undefined}
              onJsonFindResult={isJsonTab ? handleJsonFindResult : undefined}
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
