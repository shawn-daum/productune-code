import type { Stage } from '../../lib/types'

const STAGES: Stage[] = ['PRD', 'Design', 'Build', 'QA', 'Deploy', 'Operate']

interface Props {
  stage: Stage
}

export default function StageBreadcrumb({ stage }: Props) {
  return (
    <div style={wrap}>
      {STAGES.map((s, i) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {i > 0 && <span style={chevron}>›</span>}
          <span style={s === stage ? activeNode : inactiveNode}>{s}</span>
        </span>
      ))}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  padding: '0 20px',
  height: '100%',
  background: '#151515',
  borderBottom: '1px solid #2A2A2A',
  userSelect: 'none',
}

const baseNode: React.CSSProperties = {
  fontSize: 12,
  padding: '3px 10px',
  borderRadius: 4,
  cursor: 'default',
  whiteSpace: 'nowrap',
}

const activeNode: React.CSSProperties = {
  ...baseNode,
  background: '#2A1808',
  color: '#FF6B2B',
  fontWeight: 600,
}

const inactiveNode: React.CSSProperties = {
  ...baseNode,
  color: '#707070',
  background: 'transparent',
}

const chevron: React.CSSProperties = {
  color: '#3A3A3A',
  fontSize: 14,
  margin: '0 2px',
  lineHeight: 1,
}
