/**
 * CostArchiveTab — main pane wrapper for cost-archive tab type (T-028 R1).
 *
 * Mirrors WorkflowSettingsTab pattern: reads projectDir from store directly,
 * renders CostArchivePanel inside the main pane (relocated from the activity-bar
 * sidebar slot; the panel body itself is unchanged).
 */

import CostArchivePanel from '../../CostArchivePanel'
import { useWorkspace } from '../../../../store/workspace'

interface Props {
  props?: Record<string, unknown>
}

export default function CostArchiveTab(_: Props) {
  const project = useWorkspace((s) => s.project)

  if (!project) return null

  return (
    <div style={wrap}>
      <CostArchivePanel projectDir={project.projectDir} />
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-base, #0F0F0F)',
  overflowY: 'auto',
}
