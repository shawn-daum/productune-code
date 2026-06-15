import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ── CardActionMenu (T-PATCH-134) ───────────────────────────────────────────────
//
// Lightweight portal popover menu — no external lib. Used by ProjectCard's ⋯
// button and right-click context menu. Closes on Esc, outside-click, and item
// activation. Keyboard nav: ↑/↓ move focus, Enter/Space activate, Esc closes.
//
// Anchor is a viewport coordinate ({ x, y }); the menu clamps itself inside the
// viewport (flips left/up near the right/bottom edges).

export interface CardActionMenuItem {
  key: string
  label: string
  onSelect: () => void
  /** Render in a danger (red) color — destructive disk delete. */
  danger?: boolean
  /** Draw a separator line above this item. */
  separatorBefore?: boolean
}

interface Props {
  anchor: { x: number; y: number }
  items: CardActionMenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 184
const ITEM_HEIGHT = 32

export function CardActionMenu({ anchor, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [active, setActive] = useState(0)

  // Clamp position inside the viewport.
  const estHeight = items.length * ITEM_HEIGHT + 8
  let left = anchor.x
  let top = anchor.y
  if (left + MENU_WIDTH > window.innerWidth - 8) left = window.innerWidth - MENU_WIDTH - 8
  if (top + estHeight > window.innerHeight - 8) top = Math.max(8, anchor.y - estHeight)
  left = Math.max(8, left)
  top = Math.max(8, top)

  // Focus the active item whenever it changes (keyboard nav).
  useEffect(() => {
    itemRefs.current[active]?.focus()
  }, [active])

  // Esc / outside-click close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(items.length - 1)
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ ...menuStyle, top, left }}
      onKeyDown={handleListKey}
      // Stop card-level click/contextmenu from bubbling.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {items.map((item, idx) => (
        <div key={item.key}>
          {item.separatorBefore && <div style={separatorStyle} />}
          <button
            ref={(el) => { itemRefs.current[idx] = el }}
            role="menuitem"
            style={itemStyle(idx === active, item.danger)}
            onMouseEnter={() => setActive(idx)}
            onClick={() => { item.onSelect(); onClose() }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  width: MENU_WIDTH,
  background: '#1E1E1E',
  border: '1px solid #333',
  borderRadius: 6,
  padding: 4,
  zIndex: 10001,
  boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'inherit',
  userSelect: 'none',
}

function itemStyle(activeRow: boolean, danger?: boolean): React.CSSProperties {
  return {
    width: '100%',
    textAlign: 'left',
    background: activeRow ? (danger ? 'rgba(239,68,68,0.14)' : '#2A2A2A') : 'transparent',
    color: danger ? '#F87171' : '#E0E0E0',
    border: 'none',
    borderRadius: 4,
    padding: '7px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
    display: 'block',
  }
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: '#2E2E2E',
  margin: '4px 2px',
}
