/**
 * VersionHistoryTab — thin wrapper that mounts VersionHistoryView inside the
 * tab pane system (T-P4-023).
 *
 * No props needed: view subscribes to useWorkspace.selectedVersionId directly.
 */

import VersionHistoryView from '../../../../views/VersionHistoryView'

export default function VersionHistoryTab() {
  return <VersionHistoryView />
}
