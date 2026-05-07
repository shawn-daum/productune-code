/**
 * PoFab — bottom-right floating button shown when the PO chat panel is
 * minimized/closed (T-P4-041). Click → restore panel.
 *
 * T-P4-059: health badge dot on top-right corner when state !== healthy.
 *   info  → #38BDF8, slow pulse
 *   warn  → #FBBF24, static
 *   error → #EF4444, subtle blink (1s, opacity 1↔0.4)
 */

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import { usePoChat } from '../../../store/poChat'
import { useSessionHealth, severityOf } from '../../../store/sessionHealth'

let fabAnimInjected = false
function ensureFabAnims(): void {
  if (fabAnimInjected) return
  fabAnimInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes fab-pulse   { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(1.15);} }
    @keyframes fab-blink   { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
  `
  document.head.appendChild(style)
}

export default function PoFab() {
  const { t } = useTranslation()
  const setPanelVisible = usePoChat((s) => s.setPanelVisible)
  const visible         = usePoChat((s) => s.panelVisible)
  const healthState     = useSessionHealth((s) => s.state)

  useEffect(() => { ensureFabAnims() }, [])

  if (visible) return null

  const severity = severityOf(healthState)
  const hasBadge = severity !== 'none'

  let badgeColor = '#38BDF8'
  let badgeAnim  = 'fab-pulse 2s ease infinite'
  if (severity === 'warn') {
    badgeColor = '#FBBF24'
    badgeAnim  = 'none'
  } else if (severity === 'error') {
    badgeColor = '#EF4444'
    badgeAnim  = 'fab-blink 1s ease infinite'
  }

  return (
    <button
      style={fabStyle}
      onClick={() => setPanelVisible(true)}
      aria-label={t('workspace.chat.restore')}
      title={t('workspace.chat.restore')}
    >
      <MessageSquare size={16} strokeWidth={2} />
      <span style={fabLabel}>PO</span>

      {hasBadge && (
        <span
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: severity === 'error' ? 10 : 8,
            height: severity === 'error' ? 10 : 8,
            borderRadius: '50%',
            background: badgeColor,
            border: '1.5px solid #0F0F0F',
            animation: badgeAnim,
          }}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

const fabStyle: React.CSSProperties = {
  position: 'fixed',
  right: 18,
  bottom: 18,
  zIndex: 9999,
  height: 40,
  padding: '0 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#FF6B2B',
  color: '#0F0F0F',
  border: 'none',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
}

const fabLabel: React.CSSProperties = {
  letterSpacing: 0.3,
}
