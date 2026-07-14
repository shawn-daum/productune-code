import HistoryDetailView from '../../HistoryDetailView'

/**
 * Tab body for `history-detail` tabs (T-349). Thin wrapper — resolves the
 * versionId (+ closed date) from the tab props and mounts HistoryDetailView.
 * Mirrors VersionDetailTab's pattern.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function HistoryDetailTab({ props }: Props) {
  const versionId = (props?.versionId as string) ?? ''
  const closedDate = props?.closedDate as string | undefined
  if (!versionId) {
    return <div style={empty}>missing versionId</div>
  }
  return <HistoryDetailView versionId={versionId} closedDate={closedDate} />
}

const empty: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#505050',
  fontSize: 13,
}
