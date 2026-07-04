import { useWorkspace } from '../../../store/workspace'
import type { Pane } from '../../../store/workspace'
import PaneNode from './PaneNode'
import WelcomePanel from '../WelcomePanel'
import { isPrdtPoState, getActiveStageIndex } from '../../../lib/phase-mapping'

/**
 * Root of the workspace main area (T-P4-046). Renders the recursive pane tree.
 *
 * T-PATCH-275 (#18 correction): the shell is ALWAYS the full 4-region layout
 * (no chat-only collapse). When there's no current_version yet (PRD interview in
 * progress) AND no tab is open, the MainPanel shows the WelcomePanel intro instead
 * of an empty pane — pointing the user at the PO chat on the right. Once a version
 * exists (or any tab is opened — e.g. #14 PRD auto-open), the pane tree renders.
 *
 * Phase transition is chat-driven (T-P4-139): no gate banner is rendered here.
 */
function isEmptyPaneTree(root: Pane): boolean {
  if (root.type === 'leaf') return root.tabs.length === 0
  return isEmptyPaneTree(root.children[0]) && isEmptyPaneTree(root.children[1])
}

export default function MainPanel() {
  const panes = useWorkspace((s) => s.panes)
  const poState = useWorkspace((s) => s.poState)

  // T-291 (adapter A8, QA fix): a prdt po-state NEVER has current_version — it has
  // the flat `version`. Keying only on current_version made the welcome show for
  // every prdt project with no open tab (even mid-version), with the legacy 5-phase
  // step row. Branch on the existing discriminator: prdt gates on `version` and
  // renders the 4-stage variant; legacy is unchanged.
  const isPrdt = isPrdtPoState(poState)
  const version = isPrdt ? (poState?.version ?? null) : (poState?.current_version ?? null)

  // Empty-state intro: no version AND nothing open in the pane tree.
  const showWelcome = version == null && isEmptyPaneTree(panes)

  return (
    <div style={wrap}>
      <div style={paneTreeWrap}>
        {showWelcome ? (
          <WelcomePanel
            variant={isPrdt ? 'prdt' : 'legacy'}
            activeIndex={isPrdt ? getActiveStageIndex(poState) : 0}
          />
        ) : (
          <PaneNode pane={panes} path={[]} />
        )}
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
