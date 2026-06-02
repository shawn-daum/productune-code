import type { Phase } from '../../lib/types'

const PHASES: Phase[] = ['PRD', 'Design', 'Build', 'Deploy', 'Close']

interface Props {
  phase: Phase
}

export default function PhaseBreadcrumb({ phase }: Props) {
  return (
    <div style={wrap}>
      {PHASES.map((p, i) => (
        <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {i > 0 && <span style={chevron}>›</span>}
          <span style={p === phase ? activeNode : inactiveNode}>{p}</span>
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
  background: '#1A1030',
  color: '#8B5CF6',
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
