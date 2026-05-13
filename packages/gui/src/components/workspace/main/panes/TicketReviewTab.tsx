import { useWorkspace } from '../../../../store/workspace'
import TicketDashboardView from '../../TicketDashboardView'

/**
 * Tab body for `ticket-review` tabs. With no ticketId, renders the global
 * board (TicketDashboardView). When `props.ticketId` is set, future ticket
 * (T-P4-048) will swap in a single-ticket review surface; for now, board
 * fallback keeps the round 4 acceptance gate green.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function TicketReviewTab({ props: tabProps }: Props) {
  const poState = useWorkspace((s) => s.poState)
  const versionFilter = tabProps?.versionFilter as string | undefined
  return <TicketDashboardView poState={poState} versionFilter={versionFilter} />
}
