import { useTranslation } from 'react-i18next'
import i18next from '../../i18n'
import { useUserMode } from '../../store/useUserMode'
import type { UserMode } from '../../store/useUserMode'

type Lang = 'en' | 'ko'

export default function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language as Lang
  const mode = useUserMode((s) => s.mode)
  const setMode = useUserMode((s) => s.setMode)

  async function handleLangChange(lng: Lang) {
    await i18next.changeLanguage(lng)
    try {
      await (window as any).api.setUiLanguage(lng)
    } catch { /* IPC unavailable in browser dev mode */ }
  }

  async function handleModeChange(m: UserMode) {
    await setMode(m)
  }

  return (
    <div style={wrap}>
      {/* UI Language */}
      <div style={sectionTitle}>{t('settings.language.title')}</div>
      <div style={description}>{t('settings.language.descriptionEn')}</div>
      <div style={options}>
        <RadioOption
          selected={currentLang === 'en'}
          label={t('settings.language.optionEn')}
          desc={t('settings.language.optionEnDesc')}
          onSelect={() => handleLangChange('en')}
        />
        <RadioOption
          selected={currentLang === 'ko'}
          label={t('settings.language.optionKo')}
          desc={t('settings.language.optionKoDesc')}
          onSelect={() => handleLangChange('ko')}
        />
      </div>

      <div style={divider} />

      {/* User mode */}
      <div style={sectionTitle}>{t('settings.general.userMode.title')}</div>
      <div style={description}>{t('settings.general.userMode.description')}</div>
      <div style={options}>
        <RadioOption
          selected={mode === 'developer'}
          label={t('settings.general.userMode.developer.label')}
          desc={t('settings.general.userMode.developer.desc')}
          onSelect={() => handleModeChange('developer')}
        />
        <RadioOption
          selected={mode === 'planner'}
          label={t('settings.general.userMode.planner.label')}
          desc={t('settings.general.userMode.planner.desc')}
          onSelect={() => handleModeChange('planner')}
        />
        <RadioOption
          selected={mode === null}
          label={t('settings.general.userMode.unset.label')}
          desc={t('settings.general.userMode.unset.desc')}
          onSelect={() => handleModeChange(null)}
        />
      </div>

      <div style={noteText}>{t('settings.language.immediateNote')}</div>
    </div>
  )
}

function RadioOption({
  selected,
  label,
  desc,
  onSelect,
}: {
  selected: boolean
  label: string
  desc: string
  onSelect: () => void
}) {
  return (
    <div
      style={{
        ...optionCard,
        borderColor: selected ? '#FF6B2B' : '#2A2A2A',
        background: selected ? '#1E1108' : '#161616',
      }}
      onClick={onSelect}
    >
      <div style={optionTop}>
        <div style={{ ...radio, background: selected ? '#FF6B2B' : 'transparent' }} />
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
  gap: 10,
  overflowY: 'auto',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const description: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.5,
}

const options: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const divider: React.CSSProperties = {
  height: 1,
  background: '#222',
  margin: '4px 0',
}

const optionCard: React.CSSProperties = {
  border: '1px solid #2A2A2A',
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
  border: '2px solid #FF6B2B',
  flexShrink: 0,
  transition: 'background 0.15s',
}

const optionLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
}

const optionDesc: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  paddingLeft: 22,
  lineHeight: 1.4,
}

const noteText: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  lineHeight: 1.5,
  marginTop: 4,
}
