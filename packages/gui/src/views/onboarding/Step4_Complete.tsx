import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, Check } from 'lucide-react'
import { body, btnSecondary, btnPrimary } from './styles'

interface Step4Props {
  completing: boolean
  done: boolean
  completeError: string
  completionStepKeys: readonly string[]
  onPrev: () => void
  onDone: () => void
  onRetry: () => void
}

export default function Step4_Complete({ completing, done, completeError, completionStepKeys, onPrev, onDone, onRetry }: Step4Props) {
  const { t } = useTranslation()
  return (
    <>
      <div style={{ ...body, alignItems: 'center', textAlign: 'center', paddingTop: 32, paddingBottom: 32 }}>
        {completing && (
          <>
            <Loader2 size={32} className="pdt-spin" style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{t('onboarding.step4.applying')}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%' }}>
              {completionStepKeys.map(key => (
                <div key={key} style={{ fontSize: 12, color: 'var(--text-disabled)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-disabled)' }}>◌</span>
                  {t(key)}
                </div>
              ))}
            </div>
          </>
        )}

        {!completing && done && (
          <>
            <CheckCircle2 size={48} strokeWidth={1.75} style={{ color: 'var(--health-success)', marginBottom: 12 }} />
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('onboarding.step4.done')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%', marginBottom: 24 }}>
              {completionStepKeys.map(key => (
                <div key={key} style={{ fontSize: 12, color: 'var(--health-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={12} strokeWidth={3} />
                  {t(key)}
                </div>
              ))}
            </div>
            <button style={{ ...btnPrimary, padding: '12px 32px', fontSize: 14 }} onClick={onDone}>
              {t('onboarding.step4.start')}
            </button>
          </>
        )}

        {!completing && !done && completeError && (
          <>
            <XCircle size={32} strokeWidth={1.75} style={{ color: 'var(--health-error)', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('onboarding.step4.failed')}</div>
            <div style={{ fontSize: 12, color: 'var(--health-error)', marginBottom: 24, wordBreak: 'break-all' }}>
              {completeError}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
              <button style={btnPrimary} onClick={onRetry}>{t('common.retry')}</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
