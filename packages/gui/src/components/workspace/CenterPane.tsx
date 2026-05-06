import type { ActivityIcon } from './ActivityBar'
import { useWorkspace } from '../../store/workspace'
import VersionDetailView from './VersionDetailView'
import TicketDashboardView from './TicketDashboardView'
import PhaseTransitionGate from './PhaseTransitionGate'

interface Props {
  activeIcon: ActivityIcon
}

export default function CenterPane({ activeIcon }: Props) {
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const poState = useWorkspace((s) => s.poState)

  const gate = poState?.pending_gate ?? null

  let body: React.ReactNode
  if (selectedVersionId) {
    body = <VersionDetailView versionId={selectedVersionId} poState={poState} />
  } else if (activeIcon === 'tickets') {
    body = <TicketDashboardView poState={poState} />
  } else {
    body = (
      <div style={placeholderWrap}>
        <p style={placeholder}>
          Click a Version in the sidebar to see its detail · or open the Tickets dashboard for a cross-Version board.
        </p>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {gate && <PhaseTransitionGate gate={gate} />}
      <div style={bodyWrap}>{body}</div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'center',
  background: '#0F0F0F',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const bodyWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const placeholderWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 40px',
}

const placeholder: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#3A3A3A',
  userSelect: 'none',
  textAlign: 'center',
  maxWidth: 480,
  lineHeight: 1.6,
}
