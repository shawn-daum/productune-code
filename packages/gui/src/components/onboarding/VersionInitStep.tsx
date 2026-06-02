/**
 * VersionInitStep — T-P4-095
 * Reusable version id input step with inline regex validation.
 *
 * Usage: embed in NewProjectModal (step 1.5) or any future version-create UI.
 */

import { useTranslation } from 'react-i18next'
import { isValidVersionId, VERSION_ID_HINT_KO } from '../../lib/version-id'

interface Props {
  value: string
  onChange: (v: string) => void
  onNext: () => void
  onPrev?: () => void
  stepLabel?: string
}

export default function VersionInitStep({ value, onChange, onNext, onPrev, stepLabel }: Props) {
  const { t, i18n } = useTranslation()
  const isKo = i18n.language === 'ko'
  const valid = isValidVersionId(value)
  const hint = isKo ? VERSION_ID_HINT_KO : t('onboarding.versionInit.hint')

  return (
    <>
      <div style={body}>
        <div style={stepLabelStyle}>
          {stepLabel ?? t('onboarding.versionInit.label')}
        </div>
        <div style={intro}>{t('onboarding.versionInit.intro')}</div>
        <input
          style={{ ...inputStyle, borderColor: value && !valid ? '#EF4444' : '#333' }}
          placeholder="v1"
          value={value}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onNext() }}
          spellCheck={false}
        />
        {value && !valid && (
          <div style={errorStyle}>{hint}</div>
        )}
        {!value && (
          <div style={hintStyle}>{hint}</div>
        )}
      </div>
      <div style={footer}>
        {onPrev ? (
          <button style={btnSecondary} onClick={onPrev}>{t('common.prev')}</button>
        ) : (
          <div />
        )}
        <button
          style={{
            ...btnPrimary,
            opacity: valid ? 1 : 0.4,
            cursor: valid ? 'pointer' : 'not-allowed',
            pointerEvents: valid ? 'auto' : 'none',
          }}
          onClick={onNext}
          disabled={!valid}
        >
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
  minHeight: 140,
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

const inputStyle: React.CSSProperties = {
  background: '#0F0F0F',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#F0F0F0',
  fontSize: 15,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontWeight: 600,
  padding: '8px 10px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
}

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#EF4444',
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
