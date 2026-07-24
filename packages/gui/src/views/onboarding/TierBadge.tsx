import type { Tier } from './types'

export default function TierBadge({ tier }: { tier: Tier }) {
  const colors: Record<Tier, { bg: string; color: string; label: string }> = {
    S: { bg: 'var(--health-success-subtle)', color: 'var(--health-success)', label: 'Tier S' },
    A: { bg: 'var(--health-warn-subtle)', color: 'var(--health-warn)', label: 'Tier A' },
    B: { bg: 'var(--health-error-subtle)', color: 'var(--health-error)', label: 'Tier B' }, /* --health-error */
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
