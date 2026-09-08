import { useTranslation } from 'react-i18next'
import type { AudienceMode } from './types'
import OptionCard from './OptionCard'
import { body, footer, stepLabel, stepIntro, btnSecondary, btnPrimary } from './styles'

/**
 * Onboarding — audience mode (T-326). Named after the v0.4 reference
 * (T-P4-084 Step0_5UserMode): sits between Language and Engine.
 *
 * Picks the PO's conversational register per USER: `planner` (default —
 * plain vocabulary, conclusion first, progressive disclosure) or `developer`
 * (current register). The choice is persisted to ~/.prdt/register (its
 * `audience` key) at onboarding completion and injected into the PO context by
 * prdt-audience-inject.sh — the prose path. THIS component's own strings are
 * the other path: fixed UI copy via i18n.
 */
interface Step0_5Props {
  audienceMode: AudienceMode
  onSelect: (mode: AudienceMode) => void
  onPrev: () => void
  onNext: () => void
}

export default function Step0_5_Audience({ audienceMode, onSelect, onPrev, onNext }: Step0_5Props) {
  const { t } = useTranslation()
  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step0_5.label')}</div>
        <div style={stepIntro}>{t('onboarding.step0_5.description')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard
            selected={audienceMode === 'planner'}
            onClick={() => onSelect('planner')}
            label={t('onboarding.step0_5.optionPlanner')}
            badge={t('onboarding.step0_5.recommended')}
            intro={t('onboarding.step0_5.optionPlannerDesc')}
            tech=""
          />
          <OptionCard
            selected={audienceMode === 'developer'}
            onClick={() => onSelect('developer')}
            label={t('onboarding.step0_5.optionDeveloper')}
            intro={t('onboarding.step0_5.optionDeveloperDesc')}
            tech=""
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 10, lineHeight: 1.5 }}>
          {t('onboarding.step0_5.changeLaterNote')}
        </div>
      </div>
      <div style={footer}>
        <button style={btnSecondary} onClick={onPrev}>
          {t('common.prev')}
        </button>
        <button style={btnPrimary} onClick={onNext}>
          {t('common.next')}
        </button>
      </div>
    </>
  )
}
