import { useCallback } from 'react'
import { useWorkspace } from '../../../store/workspace'
import PhaseTransitionGate from '../PhaseTransitionGate'
import PaneNode from './PaneNode'

/**
 * Root of the workspace main area (T-P4-046). Renders the recursive pane tree
 * with a sticky PhaseTransitionGate banner above when po-state has a pending
 * gate.
 *
 * T-P4-115: onApprove wires gate approval → phase:approve IPC → po-state re-read.
 *           onModify is a minimal stub (chat-inject path not yet spec'd).
 */
export default function MainPanel() {
  const panes = useWorkspace((s) => s.panes)
  const poState = useWorkspace((s) => s.poState)
  const project = useWorkspace((s) => s.project)
  const setPoState = useWorkspace((s) => s.setPoState)
  const gate = poState?.pending_gate ?? null

  const onApprove = useCallback(async () => {
    if (!gate || !project) return
    const api = (window as any).api
    const result: { ok: boolean; error?: string } = await api.approvePhase({
      projectDir: project.projectDir,
      fromPhase: gate.from_phase,
      toPhase: gate.to_phase,
      summary: gate.summary,
      userApprovedAt: new Date().toISOString(),
    })
    if (result.ok) {
      // Re-read po-state to reflect the new phase in the store
      api.readPoState(project.projectDir)
        .then((s: unknown) => setPoState(s as any))
        .catch(() => {/* keep existing state on read failure */})
    } else {
      console.error('[PhaseGate] approvePhase failed:', result.error)
    }
  }, [gate, project, setPoState])

  const onModify = useCallback(() => {
    // Minimal stub: log intent; detailed chat-inject is out of scope for T-P4-115.
    console.log('[PhaseGate] modify intent — staying in current phase')
  }, [])

  return (
    <div style={wrap}>
      {gate && (
        <div style={gateSticky}>
          <PhaseTransitionGate gate={gate} onApprove={onApprove} onModify={onModify} />
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
