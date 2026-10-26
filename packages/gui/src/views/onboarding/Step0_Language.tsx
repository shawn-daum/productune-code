import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import type { UiLang } from './types'
import OptionCard from './OptionCard'
import { body, footer, stepLabel, stepIntro, btnReset, btnPrimary } from './styles'

interface Step0Props {
  uiLang: UiLang
  chatLang: UiLang
  askChat: boolean
  onSelectChatLang: (lng: UiLang) => void
  resetFeedback: boolean
  onSelectLang: (lng: UiLang) => void
  onReset: () => void
  onNext: () => void
}

export default function Step0_Language({ uiLang, chatLang, askChat, onSelectChatLang, resetFeedback, onSelectLang, onReset, onNext }: Step0Props) {
  const { t } = useTranslation()
  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step0.label')}</div>
        <div style={stepIntro}>
          {t('onboarding.step0.description')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard
            selected={uiLang === 'en'}
            onClick={() => onSelectLang('en')}
            label={t('onboarding.step0.optionEn')}
            intro=""
            tech=""
          />
          <OptionCard
            selected={uiLang === 'ko'}
            onClick={() => onSelectLang('ko')}
            label={t('onboarding.step0.optionKo')}
            intro=""
            tech=""
          />
        </div>
        {askChat && <>
        <div style={{ ...stepIntro, marginTop: 16 }}>
          {t('onboarding.step0.chatDescription')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard
            selected={chatLang === 'en'}
            onClick={() => onSelectChatLang('en')}
            label={t('onboarding.step0.optionEn')}
            intro=""
            tech=""
          />
          <OptionCard
            selected={chatLang === 'ko'}
            onClick={() => onSelectChatLang('ko')}
            label={t('onboarding.step0.optionKo')}
            intro=""
            tech=""
          />
        </div>
        </>}
      </div>
      <div style={footer}>
        {resetFeedback ? (
          <span style={{ fontSize: 11, color: 'var(--health-success)' }}>
            {t('onboarding.step0.resetToast')}
          </span>
        ) : (
          <button style={btnReset} onClick={onReset}>
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            {t('onboarding.step0.resetCta')}
          </button>
        )}
        <button style={btnPrimary} onClick={onNext}>
          {t('common.next')}
        </button>
      </div>
    </>
  )
}
