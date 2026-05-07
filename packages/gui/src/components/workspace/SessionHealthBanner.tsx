/**
 * SessionHealthBanner — sticky error banner (T-P4-059).
 *
 * Mounted in WorkspaceShell above MainPanel/RightPanel.
 * Only visible when:
 *   - severity == 'error' (permission-blocked | error-other)
 *   - dismissed == false
 *
 * Contains:
 *   - Error icon + message + primary CTA (opens modal/retry)
 *   - Dismiss button (banner only — state persists in StatusBar)
 *
 * Transitions: slide-down 120ms ease-out.
 */

import { useTranslation } from 'react-i18next'
import { ShieldAlert, AlertTriangle } from 'lucide-react'
import { useSessionHealth, severityOf } from '../../store/sessionHealth'

interface Props {
  /** Called when "Restart session" CTA clicked. */
  onRestartSession?: () => void
  /** Called when "Retry" CTA clicked. */
  onRetry?: () => void
  /** Called when "View log" CTA clicked. */
  onViewLog?: () => void
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

export default function SessionHealthBanner({ onRestartSession, onRetry, onViewLog }: Props) {
  const { t } = useTranslation()
  const state      = useSessionHealth((s) => s.state)
  const dismissed  = useSessionHealth((s) => s.dismissed)
  const dismissBanner = useSessionHealth((s) => s.dismissBanner)

  ensureBannerAnim()

  const severity = severityOf(state)
  if (severity !== 'error' || dismissed) return null

  const isPermission = state === 'permission-blocked'

  const message = isPermission
    ? t('workspace.sessionHealth.permissionBlocked.hint')
    : t('workspace.sessionHealth.errorOther.hint')

  const ctaLabel = isPermission
    ? t('workspace.sessionHealth.permissionBlocked.cta')
    : t('workspace.sessionHealth.errorOther.cta')

  const Icon = isPermission ? ShieldAlert : AlertTriangle

  return (
    <div style={bannerWrap} role="alert" aria-live="assertive">
      <span style={iconWrap}>
        <Icon size={14} color="#EF4444" />
      </span>

      <span style={msgText}>{message}</span>

      <div style={actions}>
        {/* Primary CTA */}
        <button
          style={primaryCta}
          onClick={isPermission ? onRestartSession : onRetry}
        >
          {ctaLabel}
        </button>

        {/* Secondary: view log (error-other only) */}
        {!isPermission && (
          <button style={secondaryCta} onClick={onViewLog}>
            {t('workspace.sessionHealth.errorOther.logCta')}
          </button>
        )}

        {/* Dismiss */}
        <button
          style={dismissBtn}
          onClick={dismissBanner}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bannerWrap: React.CSSProperties = {
  height: 36,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  background: '#2A1414',
  borderLeft: '3px solid #EF4444',
  borderBottom: '1px solid #3A1818',
  animation: 'sh-slide-down 120ms ease-out',
  overflow: 'hidden',
}

const iconWrap: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
}

const msgText: React.CSSProperties = {
  fontSize: 11,
  color: '#E8E8EA',
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

const primaryCta: React.CSSProperties = {
  height: 22,
  padding: '0 10px',
  background: '#EF4444',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryCta: React.CSSProperties = {
  height: 22,
  padding: '0 8px',
  background: 'transparent',
  color: '#A0A0A0',
  border: '1px solid #3A3A3A',
  borderRadius: 3,
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const dismissBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  background: 'transparent',
  border: 'none',
  color: '#707070',
  fontSize: 14,
  cursor: 'pointer',
  borderRadius: 3,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
}
