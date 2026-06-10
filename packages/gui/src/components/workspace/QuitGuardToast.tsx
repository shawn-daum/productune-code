/**
 * QuitGuardToast — T-PATCH-086
 *
 * Fixed bottom-center overlay that appears when the first ⌘Q (or Ctrl+Q) press
 * is intercepted by the main-process quit guard. Shows a progress bar that
 * shrinks over `timeoutMs` ms; pressing ⌘Q a second time within that window
 * quits the app. Dismisses automatically when the guard window expires.
 *
 * Always rendered in the DOM (hidden by default); one instance mounted in
 * WorkspaceShell below the shell grid.
 */

import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Module-level constants — evaluated once at load time (stable in Electron).
// Hoisted out of the component body so they don't re-derive on every render.
const ANIMATION_NAME = 'quitGuardShrink'

// navigator.platform is stable for the lifetime of the renderer process.
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

// Inject the shrink keyframe once into the document head — avoids a CSS module
// or global stylesheet import just for this single animation.
let _animationInjected = false

function ensureAnimation(): void {
  if (_animationInjected) return
  _animationInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes ${ANIMATION_NAME} {
      from { width: 100%; }
      to   { width: 0%; }
    }
  `
  document.head.appendChild(style)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function QuitGuardToast() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [timeoutMs, setTimeoutMs] = useState(1500)
  // Incrementing key forces React to re-mount the progress bar div, restarting
  // the CSS animation from 100% even when a second ⌘Q arrives before expiry.
  const [animKey, setAnimKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard ref: prevents double-subscription in React StrictMode (dev double-fire
  // of useEffect) and any accidental re-mount scenario. ipcRenderer.on stacks
  // listeners on each call; this ensures exactly one listener pair is registered.
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (subscribedRef.current) return
    subscribedRef.current = true

    ensureAnimation()

    const api = (window as any).api
    if (!api) return

    // T-PATCH-086: subscribe to main-process quit guard events.
    // preload helpers use ipcRenderer.on (no unsubscribe fn returned per AC-9).
    // Component is always in the DOM for the WorkspaceShell lifetime, so no
    // explicit cleanup is needed for the IPC listeners.
    api.onQuitPending?.((data: { timeoutMs: number }) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setTimeoutMs(data.timeoutMs)
      setAnimKey((k) => k + 1)  // restart progress-bar animation
      setVisible(true)
      timerRef.current = setTimeout(() => {
        setVisible(false)
        timerRef.current = null
      }, data.timeoutMs)
    })

    api.onQuitCancelled?.(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      setVisible(false)
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!visible) return null

  const label = IS_MAC
    ? t('app.quitGuard.mac')
    : t('app.quitGuard.win')

  return (
    <div style={overlayStyle}>
      <div style={innerStyle}>
        <LogOut size={14} style={{ flexShrink: 0, color: '#E5E5E5' }} />
        <span style={labelStyle}>{label}</span>
      </div>
      {/* Progress bar: shrinks from full-width to 0 over timeoutMs ms */}
      <div style={progressTrackStyle}>
        <div
          key={animKey}
          style={{
            height: '100%',
            width: '100%',
            backgroundColor: '#EF4444',
            borderRadius: 'inherit',
            animation: `${ANIMATION_NAME} ${timeoutMs}ms linear forwards`,
          }}
        />
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 32,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9999,
  background: '#1A1A1A',
  border: '1px solid #333',
  borderRadius: 8,
  overflow: 'hidden',
  // min-width keeps the toast readable; not interactive (pointer-events:none
  // so it doesn't steal focus from the second ⌘Q keypress).
  minWidth: 260,
  pointerEvents: 'none',
}

const innerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#E5E5E5',
  userSelect: 'none',
}

const progressTrackStyle: React.CSSProperties = {
  height: 3,
  background: '#2A2A2A',
  // Rounded bottom so it matches the pill border-radius of the container.
  borderRadius: '0 0 8px 8px',
}
