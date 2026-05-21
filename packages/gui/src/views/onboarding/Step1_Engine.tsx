import { useTranslation } from 'react-i18next'
import type { Engine } from './types'
import OptionCard from './OptionCard'
import { body, footer, stepLabel, stepIntro, btnSecondary, btnPrimary } from './styles'

interface Step1Props {
  engine: Engine
  onSelectEngine: (val: Engine) => void
  onPrev: () => void
  onNext: () => void
}

export default function Step1_Engine({ engine, onSelectEngine, onPrev, onNext }: Step1Props) {
  const { t } = useTranslation()
  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step1.label')}</div>
        <div style={stepIntro}>
          {t('onboarding.step1.intro').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 ? <br /> : null}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {(['claude', 'codex', 'both'] as Engine[]).map(val => (
            <OptionCard
              key={val}
              selected={engine === val}
              onClick={() => onSelectEngine(val)}
              label={t(`onboarding.engines.${val}.label`)}
              badge={val === 'claude' ? t('onboarding.step1.optionRecommended') : undefined}
              intro={t(`onboarding.engines.${val}.intro`)}
              tech={t(`onboarding.engines.${val}.tech`)}
            />
          ))}
        </div>
      </div>
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        <button style={btnPrimary} onClick={onNext}>{t('common.next')}</button>
      </div>
    </>
  )
}
