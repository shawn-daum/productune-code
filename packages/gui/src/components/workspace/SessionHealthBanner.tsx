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
import type { SmokeResult } from '../../store/sessionHealth'
import Banner from '../shared/Banner'

interface Props {
  /** Called when "Restart session" CTA clicked. */
  onRestartSession?: () => void
  /** Called when "Retry" CTA clicked. */
  onRetry?: () => void
  /** Called when "View log" CTA clicked. */
  onViewLog?: () => void
}

// ── Smoke-result copy helpers (T-PATCH-231) ───────────────────────────────────

function smokeMessage(smoke: SmokeResult, t: (k: string) => string): string {
  switch (smoke.classification) {
    case 'auth':
      return t('workspace.sessionHealth.smoke.auth.hint')
    case 'not-installed':
      return t('workspace.sessionHealth.smoke.notInstalled.hint')
    case 'incompatible':
      return smoke.rawError
        ? `${t('workspace.sessionHealth.smoke.incompatible.hint')} — ${smoke.rawError}`
        : t('workspace.sessionHealth.smoke.incompatible.hint')
    default:
      return ''
  }
}

function smokeCtaLabel(smoke: SmokeResult, t: (k: string) => string): string {
  switch (smoke.classification) {
    case 'auth':         return t('workspace.sessionHealth.smoke.auth.cta')
    case 'not-installed': return t('workspace.sessionHealth.smoke.notInstalled.cta')
    case 'incompatible': return t('workspace.sessionHealth.smoke.incompatible.cta')
    default:             return ''
  }
}

export default function SessionHealthBanner({ onRestartSession, onRetry, onViewLog }: Props) {
  const { t } = useTranslation()
  const state         = useSessionHealth((s) => s.state)
  const dismissed     = useSessionHealth((s) => s.dismissed)
  const smokeResult   = useSessionHealth((s) => s.smokeResult)
  const dismissBanner = useSessionHealth((s) => s.dismissBanner)

  const severity = severityOf(state)
  if (severity !== 'error' || dismissed) return null

  const isPermission = state === 'permission-blocked'

  // T-PATCH-231: when a smoke result is available and classified (not 'ok'),
  // override the generic error-other copy with the actionable smoke message.
  const hasSmokeDetail = smokeResult && smokeResult.classification !== 'ok'

  const message = isPermission
    ? t('workspace.sessionHealth.permissionBlocked.hint')
    : hasSmokeDetail
      ? smokeMessage(smokeResult, t)
      : t('workspace.sessionHealth.errorOther.hint')

  const ctaLabel = isPermission
    ? t('workspace.sessionHealth.permissionBlocked.cta')
    : hasSmokeDetail
      ? smokeCtaLabel(smokeResult, t)
      : t('workspace.sessionHealth.errorOther.cta')

  const Icon = isPermission ? ShieldAlert : AlertTriangle

  // For 'auth' smoke: primary CTA opens a terminal (external) rather than restarting.
  // We reuse onRetry as a generic "action" slot — the WorkspaceShell wires it to
  // retry the last message; auth/not-installed need external actions so we fall
  // back to showing the label without a click handler (user reads + acts manually).
  // The dismiss button is always present so the user can clear the banner.
  const primaryAction = isPermission
    ? onRestartSession
    : hasSmokeDetail && smokeResult.classification === 'incompatible'
      ? onRetry
      : undefined   // auth / not-installed: label is the instruction, no in-app action

  return (
    <Banner
      role="alert"
      ariaLive="assertive"
      icon={<Icon size={14} style={{ color: 'var(--health-error)' }} />}
      message={message}
      onDismiss={dismissBanner}
      dismissLabel={t('common.dismiss')}
      background="var(--health-error-subtle)"
      borderLeftColor="var(--health-error)"
      borderBottomColor="var(--health-error)"
      animate
    >
      {/* Primary CTA — only render when there is an in-app action */}
      {ctaLabel && (primaryAction || (!isPermission && !hasSmokeDetail)) && (
        <button
          style={primaryCta}
          onClick={primaryAction ?? onRetry}
        >
          {ctaLabel}
        </button>
      )}

      {/* Instruction-only label for auth / not-installed (no clickable action) */}
      {hasSmokeDetail && !primaryAction && (smokeResult.classification === 'auth' || smokeResult.classification === 'not-installed') && (
        <span style={instructionLabel}>{ctaLabel}</span>
      )}

      {/* Secondary: view log (error-other / no smoke detail only).
          T-304: onViewLog is omitted entirely for a prdt project (no
          po-session.log equivalent under .prdt/) — hide the CTA rather
          than wire it to a path that can never resolve. */}
      {!isPermission && !hasSmokeDetail && onViewLog && (
        <button style={secondaryCta} onClick={onViewLog}>
          {t('workspace.sessionHealth.errorOther.logCta')}
        </button>
      )}
    </Banner>
  )
}

// ── Styles (T-317 #5: shared shell moved to components/shared/Banner — bg/
// border colors + the slide-down animation are passed as props above; only
// the action-button styles below are call-site-specific) ────────────────────

const primaryCta: React.CSSProperties = {
  height: 22,
  padding: '0 10px',
  background: 'var(--health-error)',
  color: 'var(--text-static-white)',
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
  color: 'var(--text-tertiary)',
  border: '1px solid var(--border-hover)',
  borderRadius: 3,
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// T-PATCH-231: smoke auth / not-installed instruction text — no button, just a label
const instructionLabel: React.CSSProperties = {
  height: 22,
  padding: '0 10px',
  background: 'var(--health-success)',
  color: 'var(--health-success)',
  border: '1px solid var(--health-success)',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  userSelect: 'all',   // allow copy-paste for terminal commands
}
