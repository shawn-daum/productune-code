import { useWorkspace } from '../../../store/workspace'
import PhaseTransitionGate from '../PhaseTransitionGate'
import PaneNode from './PaneNode'

/**
 * Root of the workspace main area (T-P4-046). Renders the recursive pane tree
 * with a sticky PhaseTransitionGate banner above when po-state has a pending
 * gate.
 */
export default function MainPanel() {
  const panes = useWorkspace((s) => s.panes)
  const poState = useWorkspace((s) => s.poState)
  const gate = poState?.pending_gate ?? null

  return (
    <div style={wrap}>
      {gate && (
        <div style={gateSticky}>
          <PhaseTransitionGate gate={gate} />
        </div>
      )}
      <div style={paneTreeWrap}>
        <PaneNode pane={panes} path={[]} />
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  gridArea: 'center',
  display: 'flex',
  flexDirection: 'column',
  background: '#0F0F0F',
  overflow: 'hidden',
  minWidth: 0,
  minHeight: 0,
}

const gateSticky: React.CSSProperties = {
  flexShrink: 0,
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const paneTreeWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
}
