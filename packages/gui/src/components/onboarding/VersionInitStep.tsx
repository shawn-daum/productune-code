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
  /**
   * T-439 (QA HIGH): message from a failed `onNext`. This step OWNS the Next
   * that triggers project creation, so it must own the failure surface too —
   * NewProjectModal used to render its error only inside its step-1 block while
   * the create ran at step 1.5, leaving setError with no render site at all and
   * the participant looking at a button that "did nothing".
   */
  error?: string
  /** Disables Next and labels it, so a multi-second create isn't silent either. */
  busy?: boolean
  /** Label for the Next button while `busy` (defaults to `common.loading`). */
  busyLabel?: string
}

export default function VersionInitStep({ value, onChange, onNext, onPrev, stepLabel, error, busy, busyLabel }: Props) {
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
        {error && <div data-testid="version-init-error" style={errStyle}>{error}</div>}
      </div>
      <div style={footer}>
        {onPrev ? (
          <button style={btnSecondary} onClick={onPrev} disabled={busy}>{t('common.prev')}</button>
        ) : (
          <div />
        )}
        <button
          style={busy ? { ...btnPrimary, opacity: 0.5, cursor: 'default' } : btnPrimary}
          onClick={onNext}
          disabled={busy}
        >
          {busy ? (busyLabel ?? t('common.loading')) : t('common.next')}
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
  color: 'var(--text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

const intro: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--text-tertiary)',
  lineHeight: 1.55,
  marginBottom: 4,
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--text-static-white)',
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const errStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--health-error)',
  lineHeight: 1.5,
  marginTop: 4,
}

const btnSecondary: React.CSSProperties = {
  background: 'var(--bg-surface-onlayer)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-inline)',
  borderRadius: 4,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
}
