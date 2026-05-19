import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const POPOVER_WIDTH = 300
const POPOVER_MAX_HEIGHT = 200

// ── Component ─────────────────────────────────────────────────────────────────

interface InfoPopoverProps {
  /** Full text to display in the popover. */
  text: string
  /** Minimum char length to render the button. Default: 50. */
  threshold?: number
  /** aria-label on the ⓘ button. Default: t('workspace.common.viewFullText') */
  ariaLabel?: string
}

/**
 * Expand-on-demand ⓘ button + position:fixed popover for truncated text.
 * Returns null when text.length <= threshold (fits inline; no button needed).
 * Each instance owns local open/pos state — effective mutex via outside-click.
 */
export function InfoPopover({ text, threshold = 50, ariaLabel }: InfoPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Close on Esc or outside-click
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setPos(null)
      }
    }
    const onMouse = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPos(null)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouse)
    }
  }, [open])

  // Guard: text fits inline — render nothing
  if (text.length <= threshold) return null

  const label = ariaLabel ?? t('workspace.common.viewFullText')

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Toggle: if already open, close
    if (open) {
      setOpen(false)
      setPos(null)
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()

    // Default: appear below-left aligned to the button
    let left = rect.left
    let top = rect.bottom + 4

    // Flip left if popover would overflow right viewport edge
    if (left + POPOVER_WIDTH > window.innerWidth - 8) {
      left = rect.right - POPOVER_WIDTH
    }
    // Clamp left to viewport
    left = Math.max(8, left)

    // Flip above if popover would overflow bottom viewport edge
    if (top + POPOVER_MAX_HEIGHT > window.innerHeight - 8) {
      top = rect.top - POPOVER_MAX_HEIGHT - 4
    }

    setPos({ top, left })
    setOpen(true)
  }

  return (
    <>
      <button
        style={btnStyle(open)}
        aria-label={label}
        aria-expanded={open}
        onClick={handleClick}
      >
        <Info size={11} />
      </button>

      {open && pos && (
        <div
          ref={popoverRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: POPOVER_WIDTH,
            maxHeight: POPOVER_MAX_HEIGHT,
            overflowY: 'auto',
            background: '#1E1E1E',
            border: '1px solid #333333',
            borderRadius: 6,
            padding: '10px 12px',
            zIndex: 9999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div style={popoverText}>{text}</div>
        </div>
      )}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function btnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 3,
    border: 'none',
    background: active ? '#2A3A5A' : 'transparent',
    color: active ? '#60A5FA' : '#404040',
    cursor: 'pointer',
    padding: 0,
    verticalAlign: 'middle',
    flexShrink: 0,
  }
}

const popoverText: React.CSSProperties = {
  fontSize: 11,
  color: '#B0B0B0',
  lineHeight: '1.55',
}
