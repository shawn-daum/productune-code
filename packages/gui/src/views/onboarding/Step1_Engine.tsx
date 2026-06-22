import { useTranslation } from 'react-i18next'
import OptionCard from './OptionCard'
import { body, footer, stepLabel, stepIntro, btnSecondary, btnPrimary } from './styles'

interface Step1Props {
  onPrev: () => void
  onNext: () => void
}

export default function Step1_Engine({ onPrev, onNext }: Step1Props) {
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
          {/* codex폐기: claude only */}
          <OptionCard
            selected
            onClick={() => {}}
            label={t('onboarding.engines.claude.label')}
            badge={t('onboarding.step1.optionRecommended')}
            intro={t('onboarding.engines.claude.intro')}
            tech={t('onboarding.engines.claude.tech')}
          />
        </div>
      </div>
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        <button style={btnPrimary} onClick={onNext}>{t('common.next')}</button>
      </div>
    </>
  )
}
