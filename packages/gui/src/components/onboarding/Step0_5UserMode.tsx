import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code2, UserCog } from 'lucide-react'
import { useUserMode } from '../../store/useUserMode'
import type { UserMode } from '../../store/useUserMode'

interface Props {
  onNext: () => void
  onSkip: () => void
}

export default function Step0_5UserMode({ onNext, onSkip }: Props) {
  const { t } = useTranslation()
  const setMode = useUserMode((s) => s.setMode)
  const [selected, setSelected] = useState<UserMode>(null)

  async function handleSelect() {
    if (!selected) return
    await setMode(selected)
    onNext()
  }

  async function handleSkip() {
    await setMode(null)
    onSkip()
  }

  return (
    <>
      <div style={body}>
        <div style={stepLabel}>{t('onboarding.step0_5.label')}</div>
        <div style={stepIntro}>{t('onboarding.step0_5.subtitle')}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <ModeCard
            value="developer"
            selected={selected === 'developer'}
            icon={<Code2 size={20} strokeWidth={1.75} color="#FF6B2B" />}
            title={t('onboarding.step0_5.card.developer.title')}
            body={t('onboarding.step0_5.card.developer.body')}
            onSelect={setSelected}
          />
          <ModeCard
            value="planner"
            selected={selected === 'planner'}
            icon={<UserCog size={20} strokeWidth={1.75} color="#FF6B2B" />}
            title={t('onboarding.step0_5.card.planner.title')}
            body={t('onboarding.step0_5.card.planner.body')}
            onSelect={setSelected}
          />
        </div>
      </div>

      <div style={footer}>
        <button style={btnSkip} onClick={handleSkip}>
          {t('onboarding.step0_5.cta.skip')}
        </button>
        <button
          style={{
            ...btnPrimary,
            opacity: selected ? 1 : 0.4,
            cursor: selected ? 'pointer' : 'not-allowed',
            pointerEvents: selected ? 'auto' : 'none',
          }}
          onClick={handleSelect}
          disabled={!selected}
        >
          {t('onboarding.step0_5.cta.select')}
        </button>
      </div>
    </>
  )
}

function ModeCard({
  value,
  selected,
  icon,
  title,
  body,
  onSelect,
}: {
  value: UserMode
  selected: boolean
  icon: React.ReactNode
  title: string
  body: string
  onSelect: (v: UserMode) => void
}) {
  return (
    <div
      style={{
        ...card,
        borderColor: selected ? '#FF6B2B' : '#2A2A2A',
        background: selected ? '#1E1108' : '#161616',
      }}
      onClick={() => onSelect(value)}
    >
      <div style={cardTop}>
        <div style={{ ...radio, background: selected ? '#FF6B2B' : 'transparent' }} />
        <span style={cardIcon}>{icon}</span>
        <span style={cardTitle}>{title}</span>
      </div>
      <div style={cardBody}>{body}</div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  padding: '20px 20px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 200,
}

const footer: React.CSSProperties = {
  padding: '12px 20px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const stepLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
}

const stepIntro: React.CSSProperties = {
  fontSize: 12.5,
  color: '#B0B0B0',
  lineHeight: 1.55,
  marginBottom: 12,
}

const card: React.CSSProperties = {
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
}

const cardTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const radio: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 9999,
  border: '2px solid #FF6B2B',
  flexShrink: 0,
  transition: 'background 0.15s',
}

const cardIcon: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

const cardTitle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: '#F0F0F0',
}

const cardBody: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',
  paddingLeft: 22,
  lineHeight: 1.45,
}

const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSkip: React.CSSProperties = {
  background: 'transparent',
  color: '#606060',
  border: 'none',
  fontSize: 12,
  cursor: 'pointer',
  padding: '8px 10px',
}
