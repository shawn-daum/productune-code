import { useTranslation } from 'react-i18next'
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import type { EngineStatus } from './types'
import { engineRow, btnEngineAction, btnRedetect } from './styles'

// T-439: install progress/failure state owned by Step2 (which subscribes to
// the onboarding:install-progress push events) and rendered here in place.
export type InstallUi =
  | { running: true; phase: 'download' | 'install' | 'verify' }
  | { running: false; errorKey: string | null }

interface EngineStatusRowProps {
  name: string
  status: EngineStatus | null
  install: InstallUi
  /** Docs fallback, shown only in the install-error state — never a command. */
  installGuideUrl: string
  onInstall: () => void
  onLogin: () => void
  onRecheck: () => void
}

export default function EngineStatusRow({
  name, status, install, installGuideUrl, onInstall, onLogin, onRecheck,
}: EngineStatusRowProps) {
  const { t } = useTranslation()
  const isReady = status?.installed && status?.authed

  // T-439 (AC-2): the not-installed branch used to render a literal
  // `npm install -g …` hint + an external guide link as the ONLY path — a
  // terminal instruction the north-star participant cannot follow. It is now
  // a single in-app install control; no user-facing string names a package
  // manager, script path, or shell invocation.
  const phaseKey: Record<'download' | 'install' | 'verify', string> = {
    download: 'onboarding.step2.install.phaseDownload',
    install: 'onboarding.step2.install.phaseInstall',
    verify: 'onboarding.step2.install.phaseVerify',
  }

  return (
    <div style={engineRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {isReady
          ? <Check size={15} style={{ color: 'var(--health-success)' }} strokeWidth={3} />
          : status?.installed
            ? <AlertTriangle size={15} style={{ color: 'var(--health-warn)' }} strokeWidth={2} />
            : <X size={15} style={{ color: 'var(--health-error)' }} strokeWidth={3} />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-disabled)', marginLeft: 'auto' }}>
          {status === null
            ? t('onboarding.step2.statusChecking')
            : isReady
              ? t('onboarding.step2.statusReady')
              : status.installed
                ? t('onboarding.step2.statusInstalledNoAuth')
                : t('onboarding.step2.statusNotInstalled')}
        </span>
      </div>

      {status && !status.installed && (
        <div style={{ paddingLeft: 24 }}>
          {install.running ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
              <Loader2 size={13} className="pdt-spin" />
              {t(phaseKey[install.phase])}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: 8 }}>
                {t('onboarding.step2.install.desc')}
              </div>
              <button style={btnEngineAction} onClick={onInstall}>
                {t('onboarding.step2.install.button')}
              </button>
              {install.errorKey && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--health-error)', lineHeight: 1.5, marginBottom: 6 }}>
                    {t(install.errorKey)}
                  </div>
                  <button
                    style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }}
                    onClick={() => (window as any).api.openExternal(installGuideUrl)}
                  >
                    {t('onboarding.step2.installGuide')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {status && status.installed && !status.authed && (
        <div style={{ paddingLeft: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnEngineAction} onClick={onLogin}>
            {t('onboarding.step2.login.start')}
          </button>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            {t('onboarding.step2.recheck')}
          </button>
        </div>
      )}

      {isReady && (
        <div style={{ paddingLeft: 24 }}>
          <button style={{ ...btnRedetect, fontSize: 11, padding: '4px 10px' }} onClick={onRecheck}>
            {t('onboarding.step2.recheck')}
          </button>
        </div>
      )}
    </div>
  )
}
