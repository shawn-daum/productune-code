/**
 * SessionHealthSegment — StatusBar left-cluster chip showing PO session health.
 *
 * Mounted in StatusBar; only visible when state !== 'healthy'.
 * Shows: 8px dot + label + optional inline CTA + hover tooltip.
 *
 * Color tokens:
 *   info  → #38BDF8 (delegating, compacting)
 *   warn  → #FBBF24 (rate-limited)
 *   error → #EF4444 (permission-blocked, error-other)
 */

import { useTranslation } from 'react-i18next'
import {
  Loader2,
  Database,
  Hourglass,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react'
import { useSessionHealth, severityOf, type PoHealthState, type PoHealthDetail } from '../../store/sessionHealth'

// ── Color tokens ──────────────────────────────────────────────────────────────

const HEALTH_INFO  = '#38BDF8'
const HEALTH_WARN  = '#FBBF24'
const HEALTH_ERROR = '#EF4444'

function stateColor(state: PoHealthState): string {
  const sev = severityOf(state)
  if (sev === 'info')  return HEALTH_INFO
  if (sev === 'warn')  return HEALTH_WARN
  if (sev === 'error') return HEALTH_ERROR
  return '#22C55E'   // healthy — not shown normally
}

// ── Animations (injected once into <head>) ────────────────────────────────────

let animationsInjected = false
function ensureAnimations(): void {
  if (animationsInjected) return
  animationsInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes sh-spin   { to { transform: rotate(360deg); } }
    @keyframes sh-pulse  { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    @keyframes sh-pulse-ring {
      0%   { transform: scale(1);    opacity:0.6; }
      100% { transform: scale(1.8);  opacity:0; }
    }
  `
  document.head.appendChild(style)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StateIcon({ state }: { state: PoHealthState }) {
  const color = stateColor(state)
  const sz = 11

  switch (state) {
    case 'delegating':
      return (
        <Loader2
          size={sz}
          color={color}
          style={{ animation: 'sh-spin 1.2s linear infinite' }}
        />
      )
    case 'compacting':
      return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Database size={sz} color={color} />
          <span style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: `1px solid ${color}`,
            animation: 'sh-pulse-ring 1.5s ease infinite',
            pointerEvents: 'none',
          }} />
        </span>
      )
    case 'rate-limited':
      return <Hourglass size={sz} color={color} />
    case 'permission-blocked':
      return <ShieldAlert size={sz} color={color} />
    case 'error-other':
      return <AlertTriangle size={sz} color={color} />
    default:
      return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
  }
}

function buildLabel(state: PoHealthState, detail: PoHealthDetail, t: (k: string, opts?: any) => string): string {
  switch (state) {
    case 'delegating':
      return t('workspace.sessionHealth.delegating.label', { persona: detail.persona ?? '…' })
    case 'compacting':
      return t('workspace.sessionHealth.compacting.label')
    case 'rate-limited':
      return t('workspace.sessionHealth.rateLimited.label')
    case 'permission-blocked':
      return t('workspace.sessionHealth.permissionBlocked.label')
    case 'error-other':
      return t('workspace.sessionHealth.errorOther.label')
    default:
      return t('workspace.sessionHealth.healthy.label')
  }
}

function buildHint(state: PoHealthState, detail: PoHealthDetail, t: (k: string, opts?: any) => string): string {
  switch (state) {
    case 'delegating':
      return t('workspace.sessionHealth.delegating.hint')
    case 'compacting':
      return t('workspace.sessionHealth.compacting.hint')
    case 'rate-limited':
      return detail.resetAt
        ? t('workspace.sessionHealth.rateLimited.hintWithReset', { time: detail.resetAt })
        : t('workspace.sessionHealth.rateLimited.hintNoReset')
    case 'permission-blocked':
      return t('workspace.sessionHealth.permissionBlocked.hint')
    case 'error-other':
      return t('workspace.sessionHealth.errorOther.hint')
    default:
      return ''
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onOpenBanner?: () => void
}

export default function SessionHealthSegment({ onOpenBanner }: Props) {
  const { t } = useTranslation()
  const state   = useSessionHealth((s) => s.state)
  const detail  = useSessionHealth((s) => s.detail)

  // Inject CSS animations once on first render.
  ensureAnimations()

  // Don't render when healthy.
  if (state === 'healthy') return null

  const color = stateColor(state)
  const label = buildLabel(state, detail, t)
  const hint  = buildHint(state, detail, t)

  const hasErrorCta = state === 'permission-blocked' || state === 'error-other'

  return (
    <span
      style={segmentWrap}
      title={hint}
      className="sb-segment session-health"
    >
      {/* dot */}
      <span style={{ ...dot, background: color }} />

      {/* icon */}
      <StateIcon state={state} />

      {/* label */}
      <span style={{ ...segLabel, color }}>
        {label}
      </span>

      {/* inline CTA for error states */}
      {hasErrorCta && onOpenBanner && (
        <button
          style={ctaBtn}
          onClick={onOpenBanner}
          aria-label={state === 'permission-blocked'
            ? t('workspace.sessionHealth.permissionBlocked.cta')
            : t('workspace.sessionHealth.errorOther.cta')}
        >
          {state === 'permission-blocked'
            ? t('workspace.sessionHealth.permissionBlocked.cta')
            : t('workspace.sessionHealth.errorOther.cta')}
        </button>
      )}
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const segmentWrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 6px',
  cursor: 'default',
  userSelect: 'none',
  flexShrink: 0,
}

const dot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
}

const segLabel: React.CSSProperties = {
  fontSize: 10,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 180,
}

const ctaBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#38BDF8',
  fontSize: 10,
  cursor: 'pointer',
  padding: '0 2px',
  textDecoration: 'underline',
  fontFamily: 'inherit',
  flexShrink: 0,
}
