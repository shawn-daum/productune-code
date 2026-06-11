import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoPopover } from '../../components/shared/InfoPopover'
import { useWorkspace } from '../../store/workspace'
import type { Ticket } from '../../lib/types'
import type { CommitLine } from './types'
import { parsePersonaActivity, commitSummaryLine } from './helpers'
import { ticketDetailTabId } from '../workspace/shell/helpers'
import {
  cardWrap, cardHeader, cardHeaderOpen, cardTicketId, cardTitle, cardMeta, metaItem,
  activityList, activityRow, activityPersona, activityResult,
  expandBtn, commitList, commitRow, commitDate, commitSummary, statusPill,
} from './styles'

/** Manifest-backed artifact entry (T-PATCH-121) — shape returned by the
 *  artifacts:listScoped IPC; `meta` mirrors docs/artifacts/<v>/manifest.json. */
export interface TicketArtifactEntry {
  relPath: string
  absPath: string
  ext: string
  meta?: { ticket: string | null; kind: string; status: string }
}

export interface TicketCardProps {
  ticket: Ticket
  commits: CommitLine[]
  /** Artifacts linked to this ticket via manifest `ticket:` (T-PATCH-121). */
  artifacts?: TicketArtifactEntry[]
}

export default function TicketCard({ ticket, commits, artifacts }: TicketCardProps) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const [expanded, setExpanded] = useState(false)

  // Canonical ticket-detail entry — same signature as TicketDashboardView Card
  // and command palette. Tab id is namespaced by (version, id) via the shared
  // ticketDetailTabId helper (T-PATCH-111), so openTab dedups per (version, id):
  // re-clicking the same ticket focuses the existing tab, while the same id in a
  // different version opens a distinct tab. Version-less tickets fall back to
  // the legacy `ticket-detail:<id>` form.
  const handleOpen = () =>
    openTab(
      ticketDetailTabId(ticket.version, ticket.ticket_id),
      'ticket-detail',
      { ticketId: ticket.ticket_id, version: ticket.version ?? null },
      ticket.ticket_id,
    )

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

  // Artifact badge count (T-PATCH-121) — archived manifest entries excluded.
  const artifactCount = useMemo(
    () => (artifacts ?? []).filter((a) => a.meta?.status !== 'archived').length,
    [artifacts],
  )

  return (
    <div style={cardWrap}>
      {/* Card header — id/title open the ticket-detail tab (T-PATCH-103) */}
      <div style={cardHeader}>
        <button
          type="button"
          style={cardHeaderOpen}
          onClick={handleOpen}
          title={t('workspace.versionHistory.ticketCard.openDetail', { id: ticket.ticket_id })}
          aria-label={t('workspace.versionHistory.ticketCard.openDetail', { id: ticket.ticket_id })}
        >
          <span style={cardTicketId}>{ticket.ticket_id}</span>
          {ticket.title && <span style={cardTitle}>{ticket.title}</span>}
        </button>
        {ticket.title && (
          <span onClick={(e) => e.stopPropagation()}>
            <InfoPopover text={ticket.title} />
          </span>
        )}
        <span style={statusPill(status)}>{t('workspace.tickets.status.' + status, { defaultValue: status })}</span>
      </div>

      {/* Card meta line */}
      <div style={cardMeta}>
        {assignee && <span style={metaItem}>{assignee}</span>}
        {qaStatus && <span style={metaItem}>QA {qaStatus}</span>}
        {durationLabel && <span style={metaItem}>{durationLabel}</span>}
        {/* Artifact badge (T-PATCH-121) — non-archived manifest entries only */}
        {artifactCount > 0 && (
          <span
            style={metaItem}
            title={t('workspace.versionHistory.ticketCard.artifactCountTitle', { n: artifactCount })}
          >
            {t('workspace.versionHistory.ticketCard.artifactCount', { n: artifactCount })}
          </span>
        )}
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
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          aria-expanded={expanded}
        >
          {expanded ? t('workspace.versionHistory.ticketCard.collapse') : t('workspace.versionHistory.ticketCard.autosaveCount', { n: commits.length })}
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
