import { useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react'
import type { LeafPaneNode, Tab } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'

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
  const splitRight = useWorkspace((s) => s.splitRight)
  const splitDown = useWorkspace((s) => s.splitDown)
  const closePane = useWorkspace((s) => s.closePane)

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
      <TooltipButton label={closePaneLabel} style={splitBtn} onClick={onClosePane}>
        <X size={14} strokeWidth={1.75} />
      </TooltipButton>
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
  const onDragEnd = () => setDragHint(null)

  return (
    <div
      style={bar(isActivePane)}
      onDragLeave={onDragLeaveBar}
      onMouseDown={() => setActivePane(leaf.paneId)}
    >
      {leaf.tabs.map((tab) => {
        const isActive = leaf.activeTabId === tab.id
        const indicator = dragHintMatch(dragHint, leaf.paneId, tab.id)
        return (
          <div
            key={tab.id}
            style={tabWrap}
            onClick={() => setActiveTab(leaf.paneId, tab.id)}
            draggable
            onDragStart={(e) => onTabDragStart(e, tab)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onTabDragOver(e, tab)}
            onDrop={(e) => onTabDrop(e, tab)}
          >
            {indicator === 'before' && <div style={tabInsertLineLeft} />}
            <button
              type="button"
              style={tabBtn(isActive)}
              title={tab.title}
            >
              <span style={tabTitle}>{tab.title}</span>
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
            </button>
            {indicator === 'after' && <div style={tabInsertLineRight} />}
          </div>
        )
      })}
      <div
        style={barEnd(dragHint?.kind === 'bar-end' && dragHint.paneId === leaf.paneId)}
        onDragOver={onBarEndDragOver}
        onDrop={onBarEndDrop}
      />
      {splitButtons}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

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

const tabWrap: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
}

function tabBtn(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
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
    maxWidth: 200,
  }
}

const tabTitle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 160,
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

function barEnd(hot: boolean): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 24,
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
