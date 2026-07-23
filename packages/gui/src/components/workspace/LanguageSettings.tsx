import { useTranslation } from 'react-i18next'
import i18next from '../../i18n'

type Lang = 'en' | 'ko'

export default function LanguageSettings() {
  const { t, i18n } = useTranslation()
  const current = i18n.language as Lang

  async function handleChange(lng: Lang) {
    // Change UI immediately
    await i18next.changeLanguage(lng)
    // Persist via IPC (best-effort — no await on error)
    try {
      await (window as any).api.setUiLanguage(lng)
    } catch { /* IPC unavailable in browser dev mode */ }
  }

  return (
    <div style={wrap}>
      <div style={sectionTitle}>{t('settings.language.title')}</div>
      <div style={description}>{t('settings.language.descriptionEn')}</div>

      <div style={options}>
        <LanguageOption
          value="en"
          label={t('settings.language.optionEn')}
          desc={t('settings.language.optionEnDesc')}
          selected={current === 'en'}
          onSelect={handleChange}
        />
        <LanguageOption
          value="ko"
          label={t('settings.language.optionKo')}
          desc={t('settings.language.optionKoDesc')}
          selected={current === 'ko'}
          onSelect={handleChange}
        />
      </div>

      <div style={noteText}>{t('settings.language.immediateNote')}</div>
    </div>
  )
}

function LanguageOption({
  value,
  label,
  desc,
  selected,
  onSelect,
}: {
  value: Lang
  label: string
  desc: string
  selected: boolean
  onSelect: (v: Lang) => void
}) {
  return (
    <div
      style={{
        ...optionCard,
        borderColor: selected ? 'var(--accent)' : 'var(--text-ghost)',
        background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-on)',
      }}
      onClick={() => onSelect(value)}
    >
      <div style={optionTop}>
        <div style={{ ...radio, background: selected ? 'var(--accent)' : 'transparent' }} />
        <span style={optionLabel}>{label}</span>
      </div>
      <div style={optionDesc}>{desc}</div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 14px',
  gap: 12,
  overflowY: 'auto',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-quaternary)',
  lineHeight: 1.5,
}

const options: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const optionCard: React.CSSProperties = {
  border: '1px solid var(--border-inline)',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
}

const optionTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
}

const radio: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 9999,
  border: '2px solid var(--accent)',
  flexShrink: 0,
  transition: 'background 0.15s',
}

const optionLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const optionDesc: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  paddingLeft: 22,
  lineHeight: 1.4,
}

const noteText: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
  lineHeight: 1.5,
  marginTop: 4,
}
