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
            <Loader2 size={32} className="pdt-spin" color="#A0A0A0" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: '#A0A0A0' }}>{t('onboarding.step4.applying')}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%' }}>
              {completionStepKeys.map(key => (
                <div key={key} style={{ fontSize: 12, color: '#505050', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#505050' }}>◌</span>
                  {t(key)}
                </div>
              ))}
            </div>
          </>
        )}

        {!completing && done && (
          <>
            <CheckCircle2 size={48} color="#34D399" strokeWidth={1.75} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('onboarding.step4.done')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', width: '100%', marginBottom: 24 }}>
              {completionStepKeys.map(key => (
                <div key={key} style={{ fontSize: 12, color: '#34D399', display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <XCircle size={32} color="#EF4444" strokeWidth={1.75} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('onboarding.step4.failed')}</div>
            <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 24, wordBreak: 'break-all' }}>
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
