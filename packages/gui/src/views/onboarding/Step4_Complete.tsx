import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, Check, Clock } from 'lucide-react'
import { body, btnSecondary, btnPrimary } from './styles'

/** T-440: the playwright completion step reports a real state now. */
const PREWARM_STEP_KEY = 'onboarding.completionSteps.playwright'

interface Step4Props {
  completing: boolean
  done: boolean
  completeError: string
  completionStepKeys: readonly string[]
  /** T-440: Playwright-MCP prewarm outcome — non-ready renders as deferred, never blocks. */
  prewarmState?: 'ready' | 'failed' | 'timeout' | null
  onPrev: () => void
  onDone: () => void
  onRetry: () => void
}

export default function Step4_Complete({ completing, done, completeError, completionStepKeys, prewarmState, onPrev, onDone, onRetry }: Step4Props) {
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
              {completionStepKeys.map(key => {
                // T-440: the prewarm step reflects its reported state — a green
                // check for a step that actually failed is a false confirmation
                // (same principle as the T-311 completion-list trim).
                const deferred = key === PREWARM_STEP_KEY && prewarmState != null && prewarmState !== 'ready'
                return (
                  <div key={key} style={{ fontSize: 12, color: deferred ? 'var(--health-warn)' : 'var(--health-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {deferred ? <Clock size={12} strokeWidth={2.5} /> : <Check size={12} strokeWidth={3} />}
                    {t(key)}{deferred ? ` — ${t('onboarding.completionSteps.playwrightDeferred')}` : ''}
                  </div>
                )
              })}
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
