import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menu = (
    <div
      ref={menuRef}
      style={menuStyle(x, y)}
      role="menu"
      aria-label="context menu"
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          disabled={item.disabled}
          style={itemStyle(!!item.disabled)}
          onClick={item.onClick}
          onMouseEnter={(e) => {
            if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )

  return createPortal(menu, document.body)
}

function menuStyle(x: number, y: number): React.CSSProperties {
  return {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
    background: '#1c1c1c',
    border: '1px solid #333',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    padding: '4px 0',
    minWidth: 180,
  }
}

function itemStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    padding: '5px 14px',
    fontSize: 13,
    color: disabled ? '#404040' : '#C8C8C8',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
