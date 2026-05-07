/**
 * StatusBar — bottom 28px workspace chrome (T-P4-059 rewrite).
 *
 * Left cluster:  project name  •  SessionHealthSegment
 * Right cluster: placeholder (auto-save / run status — future slices)
 */

import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../store/workspace'
import SessionHealthSegment from './SessionHealthSegment'

interface Props {
  onOpenHealthBanner?: () => void
}

export default function StatusBar({ onOpenHealthBanner }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)

  return (
    <div style={wrap}>
      {/* Left cluster */}
      <div style={cluster}>
        {project && (
          <span style={projectName}>{project.slug}</span>
        )}
        {project && <span style={sep}>·</span>}
        <SessionHealthSegment onOpenBanner={onOpenHealthBanner} />
      </div>

      {/* Right cluster — future: auto-save / deploy status */}
      <span style={placeholder}>
        {t('workspace.statusBar.placeholder')}
      </span>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'status',
  background: '#111111',
  borderTop: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  overflow: 'hidden',
  height: 28,
  flexShrink: 0,
}

const cluster: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
}

const projectName: React.CSSProperties = {
  fontSize: 10,
  color: '#5A5A5A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const sep: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  flexShrink: 0,
}

const placeholder: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
  marginLeft: 8,
}
