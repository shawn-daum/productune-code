/**
 * Banner — shared sticky top-of-shell banner shell (T-317 code-review #5).
 *
 * PrdtHookInstallBanner (info severity) hand-mirrored SessionHealthBanner's
 * error-severity structure (icon + message + actions row + dismiss button,
 * same layout constants) instead of sharing a component. This is that shared
 * shell: layout/dismiss/icon/message are common; per-severity color, the
 * optional slide-down animation, and the action buttons themselves (which
 * differ enough in intent — CTA vs instruction-only vs secondary — to stay
 * caller-defined) are left to the two call sites. No visual change at either
 * call site.
 */

import type { ReactNode } from 'react'

export interface BannerProps {
  /** 'status' (info, non-interruptive) or 'alert' (error, assertive). */
  role: 'status' | 'alert'
  /** Only SessionHealthBanner's error banner sets this (matches prior behavior). */
  ariaLive?: 'assertive'
  icon: ReactNode
  message: ReactNode
  /** Action buttons/labels, rendered before the dismiss button, caller-owned. */
  children?: ReactNode
  onDismiss: () => void
  dismissLabel: string
  background: string
  borderLeftColor: string
  /** Defaults to 3 (SessionHealthBanner's width); PrdtHookInstallBanner passes 4. */
  borderLeftWidth?: number
  borderBottomColor: string
  /** Slide-down keyframe on mount — SessionHealthBanner only. */
  animate?: boolean
}

let bannerAnimInjected = false
function ensureBannerAnim(): void {
  if (bannerAnimInjected) return
  bannerAnimInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes sh-slide-down {
      from { transform: translateY(-36px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `
  document.head.appendChild(style)
}

export default function Banner({
  role,
  ariaLive,
  icon,
  message,
  children,
  onDismiss,
  dismissLabel,
  background,
  borderLeftColor,
  borderLeftWidth = 3,
  borderBottomColor,
  animate = false,
}: BannerProps) {
  if (animate) ensureBannerAnim()

  const wrap: React.CSSProperties = {
    height: 36,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 16px',
    background,
    borderLeft: `${borderLeftWidth}px solid ${borderLeftColor}`,
    borderBottom: `1px solid ${borderBottomColor}`,
    overflow: 'hidden',
    ...(animate ? { animation: 'sh-slide-down 120ms ease-out' } : {}),
  }

  return (
    <div style={wrap} role={role} aria-live={ariaLive}>
      <span style={iconWrap}>{icon}</span>
      <span style={msgText}>{message}</span>
      <div style={actions}>
        {children}
        <button style={dismissBtn} onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel}>
          ×
        </button>
      </div>
    </div>
  )
}

// ── Shared styles (byte-identical across both prior implementations) ─────────

const iconWrap: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
}

const msgText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-primary)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const actions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const dismissBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-quaternary)',
  fontSize: 14,
  cursor: 'pointer',
  borderRadius: 3,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
}
