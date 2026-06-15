import {
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  Circle,
  FileText,
  FileCode,
  GitBranch,
  BookOpen,
  Image as ImageIcon,
  Terminal,
  Globe,
  Settings,
  Workflow,
  Server,
  Webhook,
  Rocket,
  Network,
  Braces,
  Box,
  LayoutGrid,
  GitCompare,
  ScrollText,
  KeyRound,
  Coins,
  type LucideIcon,
} from 'lucide-react'
import type { LeafPaneNode, Pane, Tab, TabType } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'

// ── Tab density tiers (T-023 #4a) ────────────────────────────────────────────
// Driven by measured per-tab width. comfortable: icon+title+×; tight: hide
// inactive × ; min: also hide the leading icon. Active tab is always exempt and
// keeps title + ×.
type Density = 'comfortable' | 'tight' | 'min'
const TAB_MIN = 34
const TAB_MAX = 200
const TIGHT_BELOW = 120
const MIN_AT_OR_BELOW = 56

// Per-type leading icon (lucide only; no color emoji per house style).
const TAB_ICONS: Record<TabType, LucideIcon> = {
  markdown: FileText,
  'version-detail': GitCompare,
  'version-history': GitBranch,
  'ticket-review': ScrollText,
  'ticket-detail': ScrollText,
  'design-gate': LayoutGrid,
  'qa-result': LayoutGrid,
  'persona-def': BookOpen,
  'env-view': Settings,
  'skill-matrix': LayoutGrid,
  preview: Globe,
  terminal: Terminal,
  browser: Globe,
  image: ImageIcon,
  deploy: Rocket,
  'general-settings': Settings,
  'workflow-settings': Workflow,
  'mcp-servers': Server,
  hooks: Webhook,
  'artifact-md': FileText,
  'artifact-mermaid': Network,
  'artifact-json': Braces,
  'code-search': FileCode,
  'code-view': FileCode,
  'doctrine-file': BookOpen,
  'project-env': KeyRound,
  'cost-archive': Coins,
}

function iconFor(type: TabType): LucideIcon {
  return TAB_ICONS[type] ?? Box
}

const DRAG_MIME = 'application/x-productune-tab'

interface TooltipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

function TooltipButton({ label, children, style, ...rest }: TooltipButtonProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)

  const onEnter = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top - 4, left: r.left + r.width / 2 })
  }
  const onLeave = () => setPos(null)

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        style={style}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        {...rest}
      >
        {children}
      </button>
      {pos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
              background: '#1E1E1E',
              border: '1px solid #2A2A2A',
              color: '#E0E0E0',
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}

interface Props {
  leaf: LeafPaneNode
  isActivePane: boolean
}

interface DragPayload {
  fromPaneId: string
  tabId: string
}

export default function TabBar({ leaf, isActivePane }: Props) {
  const { t } = useTranslation()
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const setActivePane = useWorkspace((s) => s.setActivePane)
  const closeTab = useWorkspace((s) => s.closeTab)
  const moveTab = useWorkspace((s) => s.moveTab)
  const setDragHint = useWorkspace((s) => s.setDragHint)
  const dragHint = useWorkspace((s) => s.dragHint)
  const setTabDragActive = useWorkspace((s) => s.setTabDragActive)
  const splitRight = useWorkspace((s) => s.splitRight)
  const splitDown = useWorkspace((s) => s.splitDown)
  const closePane = useWorkspace((s) => s.closePane)
  // T-PATCH-072: pane-close × only renders when >1 leaf; lone pane cannot be closed.
  // Selector returns a number → Zustand compares by value → no spurious re-renders.
  const totalLeafCount = useWorkspace((s) => countLeaves(s.panes))
  // #4a: measure the tab strip to derive per-tab width → density tier + scroll
  // fallback. The strip flexes; controls are a protected flex-shrink:0 sibling.
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [stripWidth, setStripWidth] = useState(0)
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) return
    const update = () => setStripWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // T-PATCH-044 AC-5: scroll active tab into view when activeTabId changes
  const activeTabRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', behavior: 'smooth', block: 'nearest' })
  }, [leaf.activeTabId])

  const tabCount = leaf.tabs.length
  const overflow = computeOverflow(stripWidth, tabCount)

  const onSplitRight = () => {
    setActivePane(leaf.paneId)
    splitRight(leaf.paneId)
  }
  const onSplitDown = () => {
    setActivePane(leaf.paneId)
    splitDown(leaf.paneId)
  }
  const onClosePane = () => {
    closePane(leaf.paneId)
  }

  const splitRightLabel = `${t('workspace.tab.splitRight')} (⌘\\)`
  const splitDownLabel = `${t('workspace.tab.splitDown')} (⌘K ⌘\\)`
  const closePaneLabel = `${t('workspace.tab.closePane')} (⌘W)`

  const splitButtons = (
    <div style={splitGroup}>
      <TooltipButton label={splitRightLabel} style={splitBtn} onClick={onSplitRight}>
        <SplitSquareHorizontal size={14} strokeWidth={1.75} />
      </TooltipButton>
      <TooltipButton label={splitDownLabel} style={splitBtn} onClick={onSplitDown}>
        <SplitSquareVertical size={14} strokeWidth={1.75} />
      </TooltipButton>
      {/* T-PATCH-072: hide × when lone pane — closing the last pane is a no-op / UX dead end. */}
      {totalLeafCount > 1 && (
        <TooltipButton label={closePaneLabel} style={splitBtn} onClick={onClosePane}>
          <X size={14} strokeWidth={1.75} />
        </TooltipButton>
      )}
    </div>
  )

  if (leaf.tabs.length === 0) {
    return (
      <div style={emptyBar(isActivePane)}>
        <span style={emptyHint}>{t('workspace.tab.barEmpty')}</span>
        <div style={{ flex: 1 }} />
        {splitButtons}
      </div>
    )
  }

  const onTabDragStart = (e: React.DragEvent, tab: Tab) => {
    const payload: DragPayload = { fromPaneId: leaf.paneId, tabId: tab.id }
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
    // #4c: flag the global drag so panes mount a capture layer + webviews stop
    // intercepting pointer/drag events, keeping drop-zones hit-testable.
    setTabDragActive(true)
  }

  const onTabDragOver = (e: React.DragEvent, tab: Tab) => {
    if (!hasTabDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    setDragHint({
      kind: before ? 'tab-before' : 'tab-after',
      paneId: leaf.paneId,
      tabId: tab.id,
    })
  }

  const onTabDrop = (e: React.DragEvent, tab: Tab) => {
    if (!hasTabDrag(e)) return
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const payload = parsePayload(raw)
    if (!payload) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    moveTab(payload.fromPaneId, payload.tabId, {
      kind: before ? 'tab-before' : 'tab-after',
      paneId: leaf.paneId,
      refTabId: tab.id,
    })
  }

  const onBarEndDragOver = (e: React.DragEvent) => {
    if (!hasTabDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragHint({ kind: 'bar-end', paneId: leaf.paneId })
  }

  const onBarEndDrop = (e: React.DragEvent) => {
    if (!hasTabDrag(e)) return
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const payload = parsePayload(raw)
    if (!payload) return
    moveTab(payload.fromPaneId, payload.tabId, { kind: 'bar-end', paneId: leaf.paneId })
  }

  const onDragLeaveBar = () => setDragHint(null)
  const onDragEnd = () => {
    setDragHint(null)
    setTabDragActive(false)
  }

  return (
    <div
      style={bar(isActivePane)}
      onDragLeave={onDragLeaveBar}
      onMouseDown={() => setActivePane(leaf.paneId)}
    >
      {/* Flexing tab strip — shrinks tabs Chrome-style; scrolls when even
          min-width can't fit. Never encroaches the protected control cluster. */}
      <div ref={stripRef} className="tab-strip-scroll" style={tabStrip(overflow.scroll)}>
        {leaf.tabs.map((tab) => {
          const isActive = leaf.activeTabId === tab.id
          const indicator = dragHintMatch(dragHint, leaf.paneId, tab.id)
          // Active tab is exempt from density hiding (always title + ×).
          const showIcon = isActive || overflow.density !== 'min'
          const showClose = (isActive || overflow.density === 'comfortable') && tabCount > 1
          const Icon = iconFor(tab.type)
          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              style={tabWrap(overflow)}
              onClick={() => setActiveTab(leaf.paneId, tab.id)}
              draggable
              onDragStart={(e) => onTabDragStart(e, tab)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onTabDragOver(e, tab)}
              onDrop={(e) => onTabDrop(e, tab)}
            >
              {indicator === 'before' && <div style={tabInsertLineLeft} />}
              <button type="button" style={tabBtn(isActive)} title={tab.title}>
                {showIcon && (
                  <Icon size={13} strokeWidth={1.75} style={tabIcon} aria-hidden />
                )}
                <span style={tabTitle}>{tab.title}</span>
                {tab.needsReview && (
                  <Circle
                    size={6}
                    fill="var(--health-warn, #F59E0B)"
                    color="var(--health-warn, #F59E0B)"
                    aria-label={t('workspace.artifacts.needsReview')}
                    style={{ flexShrink: 0 }}
                  />
                )}
                {showClose && (
                  <span
                    role="button"
                    aria-label={`${t('workspace.tab.close')} (⌘W)`}
                    title={`${t('workspace.tab.close')} (⌘W)`}
                    style={closeBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(leaf.paneId, tab.id)
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
              {indicator === 'after' && <div style={tabInsertLineRight} />}
            </div>
          )
        })}
        {/* bar-end drop target. In scroll mode it has no flex-grow (the strip
            scrolls); otherwise it absorbs slack so tabs sit flush-left. */}
        <div
          style={barEnd(
            dragHint?.kind === 'bar-end' && dragHint.paneId === leaf.paneId,
            overflow.scroll,
          )}
          onDragOver={onBarEndDragOver}
          onDrop={onBarEndDrop}
        />
      </div>
      {splitButtons}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * T-PATCH-072: count leaf panes in the pane tree.
 * Used to gate the pane-close × button (only shown when >1 leaf exists).
 */
function countLeaves(p: Pane): number {
  if (p.type === 'leaf') return 1
  return countLeaves(p.children[0]) + countLeaves(p.children[1])
}

function hasTabDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DRAG_MIME)
}

function parsePayload(raw: string): DragPayload | null {
  try {
    const v = JSON.parse(raw)
    if (typeof v?.fromPaneId === 'string' && typeof v?.tabId === 'string') return v
  } catch { /* ignore */ }
  return null
}

interface Overflow {
  density: Density
  perTab: number
  scroll: boolean
}

/**
 * #4a: derive per-tab width + density tier from the measured strip width.
 * - basis = stripWidth / N, clamped to [TAB_MIN .. TAB_MAX]
 * - density: comfortable ≥120 · tight <120 · min ≤56
 * - scroll fallback: even at TAB_MIN all tabs don't fit (TAB_MIN·N > strip)
 */
function computeOverflow(stripWidth: number, count: number): Overflow {
  if (count === 0 || stripWidth === 0) {
    return { density: 'comfortable', perTab: TAB_MAX, scroll: false }
  }
  const raw = stripWidth / count
  const perTab = Math.max(TAB_MIN, Math.min(TAB_MAX, raw))
  let density: Density = 'comfortable'
  if (perTab <= MIN_AT_OR_BELOW) density = 'min'
  else if (perTab < TIGHT_BELOW) density = 'tight'
  // If TAB_MIN-wide tabs still overflow the strip, scroll instead of overlap.
  const scroll = TAB_MIN * count > stripWidth + 1
  return { density, perTab, scroll }
}

function dragHintMatch(
  hint: ReturnType<typeof useWorkspace.getState>['dragHint'],
  paneId: string,
  tabId: string,
): 'before' | 'after' | null {
  if (!hint) return null
  if (hint.kind === 'tab-before' && hint.paneId === paneId && hint.tabId === tabId) return 'before'
  if (hint.kind === 'tab-after' && hint.paneId === paneId && hint.tabId === tabId) return 'after'
  return null
}

// ── styles ────────────────────────────────────────────────────────────────────

function bar(isActivePane: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'stretch',
    height: 32,
    background: '#0A0A0A',
    borderBottom: `1px solid ${isActivePane ? '#8B5CF633' : '#1A1A1A'}`,
    flexShrink: 0,
    position: 'relative',
  }
}

function emptyBar(isActivePane: boolean): React.CSSProperties {
  return {
    ...bar(isActivePane),
    alignItems: 'center',
    paddingLeft: 12,
    color: '#3A3A3A',
  }
}

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  fontStyle: 'italic',
  userSelect: 'none',
}

/** Flexing strip that holds the tabs. Protected controls are a sibling. */
function tabStrip(_scroll: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'stretch',
    flex: '1 1 auto',
    minWidth: 0,
    // T-PATCH-044: always allow horizontal scroll; thin overlay scrollbar
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
    // T-PATCH-056: transparent scrollbar track (Firefox)
    scrollbarColor: 'transparent transparent',
  }
}

function tabWrap(o: Overflow): React.CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    // T-PATCH-044: fit-content width — no grow, no shrink; strip scrolls on overflow
    flexShrink: 0,
    flexGrow: 0,
    width: 'fit-content',
    minWidth: TAB_MIN,
    maxWidth: o.scroll ? undefined : TAB_MAX,
  }
}

function tabBtn(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    height: '100%',
    padding: '0 10px',
    background: isActive ? '#0F0F0F' : 'transparent',
    border: 'none',
    borderRight: '1px solid #1A1A1A',
    borderTop: isActive ? '2px solid #8B5CF6' : '2px solid transparent',
    color: isActive ? '#F0F0F0' : '#A0A0A0',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    minWidth: 0,
    overflow: 'hidden',
  }
}

const tabIcon: React.CSSProperties = {
  flexShrink: 0,
  opacity: 0.8,
}

const tabTitle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  flex: '1 1 auto',
}

const closeBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  borderRadius: 3,
  color: '#707070',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
  userSelect: 'none',
}

const tabInsertLineBase: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  background: '#8B5CF6',
  zIndex: 2,
  pointerEvents: 'none',
}

const tabInsertLineLeft: React.CSSProperties = { ...tabInsertLineBase, left: -1 }
const tabInsertLineRight: React.CSSProperties = { ...tabInsertLineBase, right: -1 }

function barEnd(hot: boolean, scroll: boolean): React.CSSProperties {
  return {
    // In scroll mode it must not grow (the strip scrolls instead); otherwise it
    // absorbs slack so tabs sit flush-left when there are only a few.
    flex: scroll ? '0 0 8px' : '1 1 auto',
    minWidth: scroll ? 8 : 24,
    background: hot ? '#1A1208' : 'transparent',
    transition: 'background 0.08s',
  }
}

const splitGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 6px',
  flexShrink: 0,
}


const splitBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: 'none',
  background: 'transparent',
  color: '#707070',
  borderRadius: 4,
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
}
