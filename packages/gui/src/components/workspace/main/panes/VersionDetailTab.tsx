import { useWorkspace } from '../../../../store/workspace'
import VersionDetailView from '../../VersionDetailView'

/**
 * Tab body for `version-detail` tabs. Wraps the existing VersionDetailView,
 * pulling poState fresh from the store and resolving the versionId from the
 * tab's `props.versionId`.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function VersionDetailTab({ props }: Props) {
  const poState = useWorkspace((s) => s.poState)
  const versionId = (props?.versionId as string) ?? ''
  if (!versionId) {
    return <div style={empty}>missing versionId</div>
  }
  return <VersionDetailView versionId={versionId} poState={poState} />
}

const empty: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#505050',
  fontSize: 13,
}
