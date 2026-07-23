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
        borderColor: selected ? 'var(--accent)' : 'var(--text-ghost)',
        background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface-on)',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...radio, background: selected ? 'var(--accent)' : 'transparent' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 9999,
            background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent)',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 5, paddingLeft: 24, lineHeight: 1.45 }}>{intro}</div>
      {tech && <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2, paddingLeft: 24, lineHeight: 1.45 }}>{tech}</div>}
    </div>
  )
}
