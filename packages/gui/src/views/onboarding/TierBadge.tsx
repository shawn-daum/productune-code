import type { Tier } from './types'

export default function TierBadge({ tier }: { tier: Tier }) {
  const colors: Record<Tier, { bg: string; color: string; label: string }> = {
    S: { bg: '#0D2A1A', color: '#34D399', label: 'Tier S' },
    A: { bg: '#2A2000', color: '#FBBF24', label: 'Tier A' },
    B: { bg: '#1A1010', color: '#F87171', label: 'Tier B' },
  }
  const c = colors[tier]
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 9999,
      background: c.bg, color: c.color, fontWeight: 600,
    }}>
      {c.label}
    </span>
  )
}
