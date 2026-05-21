import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoPopover } from '../../components/shared/InfoPopover'
import type { Ticket } from '../../lib/types'
import type { CommitLine } from './types'
import { parsePersonaActivity, commitSummaryLine } from './helpers'
import {
  cardWrap, cardHeader, cardTicketId, cardTitle, cardMeta, metaItem,
  activityList, activityRow, activityPersona, activityResult,
  expandBtn, commitList, commitRow, commitDate, commitSummary, statusPill,
} from './styles'

export interface TicketCardProps {
  ticket: Ticket
  commits: CommitLine[]
}

export default function TicketCard({ ticket, commits }: TicketCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const status = ticket.status ?? 'todo'
  const assignee = (ticket as any).assignee as string | undefined
  const durationMin = (ticket as any).duration_min as number | null | undefined
  const qaStatus = (ticket as any).qa_status as string | undefined
  const personaActivityRaw = (ticket as any)._rawContent as string | undefined

  const activityRows = useMemo(() => {
    if (!personaActivityRaw) return []
    return parsePersonaActivity(personaActivityRaw).slice(0, 3)  // body 3 lines max
  }, [personaActivityRaw])

  const durationLabel = durationMin != null
    ? `${Math.round(durationMin / 60 * 10) / 10}h`
    : null

  return (
    <div style={cardWrap}>
      {/* Card header */}
      <div style={cardHeader}>
        <span style={cardTicketId}>{ticket.ticket_id}</span>
        {ticket.title && (
          <>
            <span style={cardTitle}>{ticket.title}</span>
            <InfoPopover text={ticket.title} />
          </>
        )}
        <span style={statusPill(status)}>{t('workspace.tickets.status.' + status, { defaultValue: status })}</span>
      </div>

      {/* Card meta line */}
      <div style={cardMeta}>
        {assignee && <span style={metaItem}>{assignee}</span>}
        {qaStatus && <span style={metaItem}>QA {qaStatus}</span>}
        {durationLabel && <span style={metaItem}>{durationLabel}</span>}
      </div>

      {/* Body: persona activity rows (3 lines max) */}
      {activityRows.length > 0 && (
        <div style={activityList}>
          {activityRows.map((row, i) => (
            <div key={i} style={activityRow}>
              <span style={activityPersona}>{row.persona}</span>
              <span style={activityResult}>{row.result}</span>
              <InfoPopover text={row.result} threshold={40} />
            </div>
          ))}
        </div>
      )}

      {/* Expand trigger — explicit click only (§1.5.3 Predictability) */}
      {commits.length > 0 && (
        <button
          style={expandBtn}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? '▲ 접기' : `▼ 자동저장 기록 ${commits.length}건`}
        </button>
      )}

      {/* Expanded: autosave commit sequence */}
      {expanded && (
        <div style={commitList}>
          {commits.map((c) => (
            <div key={c.sha} style={commitRow}>
              <span style={commitDate}>{c.authorDate.slice(0, 10)}</span>
              <span style={commitSummary}>{commitSummaryLine(c.subject)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
