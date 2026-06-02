import { optionCard, radio } from './styles'

interface OptionCardProps {
  selected: boolean
  onClick: () => void
  label: string
  badge?: string
  intro: string
  tech: string
}

export default function OptionCard({ selected, onClick, label, badge, intro, tech }: OptionCardProps) {
  return (
    <div
      style={{
        ...optionCard,
        borderColor: selected ? '#8B5CF6' : '#2A2A2A',
        background: selected ? '#160F28' : '#161616',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...radio, background: selected ? '#8B5CF6' : 'transparent' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: '#F0F0F0' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 9999,
            background: '#120A2A', color: '#8B5CF6', border: '1px solid #8B5CF655',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: '#A0A0A0', marginTop: 5, paddingLeft: 24, lineHeight: 1.45 }}>{intro}</div>
      {tech && <div style={{ fontSize: 11, color: '#606060', marginTop: 2, paddingLeft: 24, lineHeight: 1.45 }}>{tech}</div>}
    </div>
  )
}
