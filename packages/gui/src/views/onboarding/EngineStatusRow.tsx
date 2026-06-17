import { useTranslation } from 'react-i18next'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { EngineStatus } from './types'
import { engineRow, btnEngineAction, btnRedetect } from './styles'

interface EngineStatusRowProps {
  name: string
  status: EngineStatus | null
  installUrl: string
  installHint: string
  onLogin: () => void
  onRecheck: () => void
}

export default function EngineStatusRow({ name, status, installUrl, installHint, onLogin, onRecheck }: EngineStatusRowProps) {
  const { t } = useTranslation()
  const isReady = status?.installed && status?.authed

  return (
    <div style={engineRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {isReady
          ? <Check size={15} color="#34D399" strokeWidth={3} />
          : status?.installed
            ? <AlertTriangle size={15} color="#FBBF24" strokeWidth={2} />
            : <X size={15} color="#EF4444" strokeWidth={3} />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 11, color: '#505050', marginLeft: 'auto' }}>
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
          <div style={{ fontSize: 11, color: '#505050', fontFamily: 'monospace', marginBottom: 6 }}>
            {installHint}
          </div>
          <button
            style={btnEngineAction}
            onClick={() => (window as any).api.openExternal(installUrl)}
          >
            {t('onboarding.step2.installGuide')}
          </button>
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
