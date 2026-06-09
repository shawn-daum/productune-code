import { useWorkspace } from '../../../../store/workspace'
import TicketDashboardView from '../../TicketDashboardView'
import PrdSection from '../../PrdSection'

/**
 * Tab body for `ticket-review` tabs. With no ticketId, renders the global
 * board (TicketDashboardView). When `props.ticketId` is set, future ticket
 * (T-P4-048) will swap in a single-ticket review surface; for now, board
 * fallback keeps the round 4 acceptance gate green.
 *
 * T-PATCH-078: PrdSection rendered above kanban when versionFilter is set.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function TicketReviewTab({ props: tabProps }: Props) {
  const poState = useWorkspace((s) => s.poState)
  const versionFilter = tabProps?.versionFilter as string | undefined
  return (
    <div style={wrap}>
      {versionFilter ? (
        <div style={prdSectionWrap}>
          <PrdSection versionId={versionFilter} />
        </div>
      ) : null}
      <TicketDashboardView poState={poState} versionFilter={versionFilter} />
    </div>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
}

const prdSectionWrap: React.CSSProperties = {
  padding: '16px 20px 0',
  flexShrink: 0,
}
