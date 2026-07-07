/**
 * VersionInitStep — T-P4-095 (guided choice: init-version-guided-choice)
 * Guided v0.1 / v1 selector for the first version id, each with a plain-language
 * description so non-technical users can pick without knowing version syntax.
 *
 * Usage: embed in NewProjectModal (step 1.5) or any future version-create UI.
 */

import { useTranslation } from 'react-i18next'
import OptionCard from '../../views/onboarding/OptionCard'

interface Props {
  value: string
  onChange: (v: string) => void
  onNext: () => void
  onPrev?: () => void
  stepLabel?: string
}

export default function VersionInitStep({ value, onChange, onNext, onPrev, stepLabel }: Props) {
  const { t } = useTranslation()

  return (
    <>
      <div style={body}>
        <div style={stepLabelStyle}>
          {stepLabel ?? t('onboarding.versionInit.label')}
        </div>
        <div style={intro}>{t('onboarding.versionInit.intro')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard
            selected={value === 'v0.1'}
            onClick={() => onChange('v0.1')}
            label={t('onboarding.versionInit.optionV01Label')}
            badge={t('onboarding.versionInit.recommended')}
            intro={t('onboarding.versionInit.optionV01Desc')}
            tech=""
          />
          <OptionCard
            selected={value === 'v1'}
            onClick={() => onChange('v1')}
            label={t('onboarding.versionInit.optionV1Label')}
            intro={t('onboarding.versionInit.optionV1Desc')}
            tech=""
          />
        </div>
      </div>
      <div style={footer}>
        {onPrev ? (
          <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        ) : (
          <div />
        )}
        <button style={btnPrimary} onClick={onNext}>
          {t('common.next')}
        </button>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  padding: '20px 20px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const footer: React.CSSProperties = {
  padding: '12px 20px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const stepLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

const intro: React.CSSProperties = {
  fontSize: 12.5,
  color: '#B0B0B0',
  lineHeight: 1.55,
  marginBottom: 4,
}

const btnPrimary: React.CSSProperties = {
  background: '#8B5CF6',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  background: '#242424',
  color: '#F0F0F0',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
}
