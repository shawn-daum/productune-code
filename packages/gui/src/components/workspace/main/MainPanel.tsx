import { useWorkspace } from '../../../store/workspace'
import PaneNode from './PaneNode'

/**
 * Root of the workspace main area (T-P4-046). Renders the recursive pane tree.
 *
 * Phase transition is chat-driven (T-P4-139): no gate banner is rendered here.
 * PhaseTransitionGate component file retained; phase:approve IPC retained as
 * legacy fallback. `pending_gate` in po-state.json is deprecated — field
 * preserved for schema compatibility only.
 */
export default function MainPanel() {
  const panes = useWorkspace((s) => s.panes)

  return (
    <div style={wrap}>
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

const paneTreeWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
}
