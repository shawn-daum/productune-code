import { useWorkspace } from '../../store/workspace'
import VersionDetailView from './VersionDetailView'

export default function CenterPane() {
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const poState = useWorkspace((s) => s.poState)

  if (selectedVersionId) {
    return <VersionDetailView versionId={selectedVersionId} poState={poState} />
  }

  return (
    <div style={wrap}>
      <p style={placeholder}>Click a Version in the sidebar to see its detail · ticket board / design / deploy panels coming.</p>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'center',
  background: '#0F0F0F',
  overflow: 'hidden',
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
