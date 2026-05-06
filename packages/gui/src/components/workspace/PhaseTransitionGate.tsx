import type { PendingGate } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'

interface Props {
  gate: PendingGate
  onApprove?: () => void
  onModify?: () => void
}

/**
 * Top-pinned banner shown when po-state.json has a non-null `pending_gate`.
 * Rendered above the breadcrumb so it's always visible regardless of which
 * sidebar tab the user is on. Doctrine: stages.md "Uniform phase-transition gate".
 *
 * The Approve / Modify buttons are visual only in this slice — clicking emits
 * the chosen intent into the chat (handled by parent / chat panel), and PO
 * clears `pending_gate` after acting on the user reply.
 */
export default function PhaseTransitionGate({ gate, onApprove, onModify }: Props) {
  const fromName = PHASE_NAMES[gate.from_phase] ?? `Phase ${gate.from_phase}`
  const toName = gate.to_phase ? PHASE_NAMES[gate.to_phase] : null

  return (
    <div style={banner}>
      <div style={left}>
        <span style={badge}>Phase Gate</span>
        <div style={textBlock}>
          <div style={transitionLine}>
            <span style={phaseFrom}>{fromName}</span>
            <span style={arrow}>→</span>
            <span style={phaseTo}>{toName ?? 'Version close'}</span>
          </div>
          <div style={summaryLine}>{gate.summary}</div>
          <div style={promptLine}>{gate.prompt}</div>
        </div>
      </div>
      <div style={actions}>
        <button style={modifyBtn} onClick={onModify}>Modify…</button>
        <button style={approveBtn} onClick={onApprove}>Approve →</button>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const banner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '12px 20px',
  background: '#1F1408',
  borderBottom: '1px solid #FF6B2B66',
  borderTop: '2px solid #FF6B2B',
}

const left: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flex: 1,
  minWidth: 0,
}

const badge: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 10px',
  background: '#FF6B2B',
  color: '#0A0A0A',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const textBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
}

const transitionLine: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
}

const phaseFrom: React.CSSProperties = {
  color: '#A0A0A0',
}

const phaseTo: React.CSSProperties = {
  color: '#FF6B2B',
}

const arrow: React.CSSProperties = {
  color: '#707070',
  fontSize: 14,
}

const summaryLine: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const promptLine: React.CSSProperties = {
  fontSize: 12,
  color: '#E0E0E0',
  fontStyle: 'italic',
}

const actions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const modifyBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#A0A0A0',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const approveBtn: React.CSSProperties = {
  background: '#FF6B2B',
  color: '#0A0A0A',
  border: 'none',
  borderRadius: 4,
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
