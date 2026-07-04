/**
 * PrdtHookInstallBanner — surfaces the A6 (T-289) prdt hook install path that
 * had no call site (T-305). Mounted in WorkspaceShell, prdt projects only
 * (isPrdtPoState gate — same signal every other prdt-adapter surface uses).
 *
 * On mount / project switch, asks main whether this machine's ~/.claude/settings.json
 * already has the 3 prdt discipline hooks registered (`onboarding:checkPrdtHooks`).
 * Renders nothing once installed, or once dismissed for this session. Otherwise:
 *   - mirror present  → "install now" CTA → `onboarding:installPrdtHooksAt(projectDir)`
 *     (the SAME installClaudeHooks prdt branch prdt-install.sh's CLI path uses).
 *   - mirror absent   → honest "can't install yet, run prdt-install.sh first" notice,
 *     no CTA (A6's own warn-skip behavior — never writes settings that point at a
 *     nonexistent mirror).
 *
 * Never installs without an explicit click — no settings.json write on mount.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { usePrdtHookInstall } from '../../store/prdtHookInstall'

interface Props {
  projectDir: string
}

type Status =
  | { phase: 'checking' }
  | { phase: 'installed' }
  | { phase: 'needs-install' }
  | { phase: 'mirror-absent' }
  | { phase: 'installing' }
  | { phase: 'failed'; error: string }

export default function PrdtHookInstallBanner({ projectDir }: Props) {
  const { t } = useTranslation()
  const dismissed = usePrdtHookInstall((s) => s.dismissed)
  const dismiss = usePrdtHookInstall((s) => s.dismiss)
  const [status, setStatus] = useState<Status>({ phase: 'checking' })

  useEffect(() => {
    let cancelled = false
    const api = (window as any).api
    if (!api?.checkPrdtHooks) return
    setStatus({ phase: 'checking' })
    api.checkPrdtHooks()
      .then((r: { mirrorPresent: boolean; installed: boolean }) => {
        if (cancelled) return
        setStatus(r.installed ? { phase: 'installed' } : r.mirrorPresent ? { phase: 'needs-install' } : { phase: 'mirror-absent' })
      })
      .catch(() => { if (!cancelled) setStatus({ phase: 'installed' } /* fail-quiet: never nag on a check error */) })
    return () => { cancelled = true }
  }, [projectDir])

  const handleInstall = () => {
    const api = (window as any).api
    if (!api?.installPrdtHooksAt) return
    setStatus({ phase: 'installing' })
    api.installPrdtHooksAt(projectDir)
      .then((r: { ok: boolean; installed: boolean; error?: string }) => {
        if (r.ok && r.installed) setStatus({ phase: 'installed' })
        else setStatus({ phase: 'failed', error: r.error ?? 'unknown error' })
      })
      .catch((e: any) => setStatus({ phase: 'failed', error: e?.message ?? 'unknown error' }))
  }

  if (dismissed) return null
  if (status.phase === 'checking' || status.phase === 'installed') return null

  const message =
    status.phase === 'mirror-absent'
      ? t('workspace.prdtHooks.mirrorAbsent')
      : status.phase === 'failed'
        ? t('workspace.prdtHooks.failed', { error: status.error })
        : t('workspace.prdtHooks.hint')

  return (
    <div style={bannerWrap} role="status">
      <span style={iconWrap}>
        <ShieldCheck size={14} color="#38BDF8" />
      </span>
      <span style={msgText}>{message}</span>
      <div style={actions}>
        {(status.phase === 'needs-install' || status.phase === 'failed') && (
          <button style={primaryCta} onClick={handleInstall}>
            {t('workspace.prdtHooks.cta')}
          </button>
        )}
        {status.phase === 'installing' && (
          <span style={instructionLabel}>{t('workspace.prdtHooks.installing')}</span>
        )}
        <button style={dismissBtn} onClick={dismiss} aria-label={t('common.dismiss')} title={t('common.dismiss')}>
          ×
        </button>
      </div>
    </div>
  )
}

// ── Styles (mirrors SessionHealthBanner's info-severity variant) ──────────────

const bannerWrap: React.CSSProperties = {
  height: 36,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  background: '#14232A',
  borderLeft: '3px solid #38BDF8',
  borderBottom: '1px solid #1A2A32',
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
  background: '#38BDF8',
  color: '#0A1520',
  border: 'none',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const instructionLabel: React.CSSProperties = {
  height: 22,
  padding: '0 10px',
  background: 'transparent',
  color: '#A0A0A0',
  border: '1px solid #2A3A42',
  borderRadius: 3,
  fontSize: 10,
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
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
