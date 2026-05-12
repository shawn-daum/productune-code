/**
 * WorkflowSettingsTab — main pane wrapper for workflow-settings tab type (T-P4-099).
 *
 * Mirrors GeneralSettingsTab pattern: reads projectDir from store directly,
 * renders WorkflowRulesPanel inside main pane (replaces sidebar inline rendering).
 */

import WorkflowRulesPanel from '../../WorkflowRulesPanel'
import { useWorkspace } from '../../../../store/workspace'

interface Props {
  props?: Record<string, unknown>
}

export default function WorkflowSettingsTab(_: Props) {
  const project = useWorkspace((s) => s.project)

  if (!project) return null

  return (
    <div style={wrap}>
      <WorkflowRulesPanel projectDir={project.projectDir} />
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
