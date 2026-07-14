import { useWorkspace } from '../../../../store/workspace'
import TicketDashboardView from '../../TicketDashboardView'

/**
 * Tab body for `ticket-review` tabs. With no ticketId, renders the global
 * board (TicketDashboardView). When `props.ticketId` is set, future ticket
 * (T-P4-048) will swap in a single-ticket review surface; for now, board
 * fallback keeps the round 4 acceptance gate green.
 *
 * T-349 (spec §3.1): the PRD section was removed from this pane — PRD now lives
 * in the Project tab (current version) and the Project History tab (closed
 * versions). The version tab is a single content type (kanban) again.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function TicketReviewTab({ props: tabProps }: Props) {
  const poState = useWorkspace((s) => s.poState)
  const versionFilter = tabProps?.versionFilter as string | undefined
  return (
    <div style={wrap}>
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
