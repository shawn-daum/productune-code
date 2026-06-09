import { useMemo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PoState, Version, Ticket, Phase, TaskType, Status, PendingPromotion } from '../../lib/types'
import { TYPE_ORDER } from '../../lib/types'
import { useTicketScan } from '../../lib/useTicketScan'
import { useWorkspace } from '../../store/workspace'
import { InfoPopover } from '../shared/InfoPopover'
import PrdSection from './PrdSection'

interface Props {
  versionId: string
  poState: PoState | null
}

const PHASE_ORDER: Phase[] = ['PRD', 'Design', 'Build', 'Deploy', 'Close']

export default function VersionDetailView({ versionId, poState }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const { tickets: scannedTickets } = useTicketScan(project?.projectDir ?? null)
  const version = (poState?.versions ?? []).find((v) => v.id === versionId)
  const [approvedPromotions, setApprovedPromotions] = useState<PendingPromotion[]>([])

  // Load approved promotions for this version's date range (D — retrospective read)
  useEffect(() => {
    if (!project?.projectDir || !version) return
    let cancelled = false
    const api = (window as any).api
    api.listAllPromotions?.(project.projectDir).then((all: PendingPromotion[]) => {
      if (cancelled) return
      const start = version.started_at ? new Date(version.started_at).getTime() : 0
      const end = version.ended_at ? new Date(version.ended_at).getTime() : Date.now()
      const filtered = all.filter((p) => {
        if (p.status !== 'approved' && p.status !== 'edited') return false
        if (!p.decided_at) return false
        const decided = new Date(p.decided_at).getTime()
        return decided >= start && decided <= end
      })
      setApprovedPromotions(filtered)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [project?.projectDir, version])

  if (!version) {
    return <div style={empty}>{t('workspace.versionDetail.notFound', { id: versionId })}</div>
  }

  const isActive = poState?.current_version === versionId
  const currentPhase = isActive ? poState?.current_phase : version.ended_at ? 5 : undefined

  const tickets = useMemo(
    () => collectTickets(poState, scannedTickets, versionId, isActive),
    [poState, scannedTickets, versionId, isActive],
  )
  const ticketsByType = useMemo(() => groupByType(tickets), [tickets])

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={versionId_}>{version.id}</div>
        <div style={meta}>
          {version.started_at && <span>{t('workspace.versionDetail.started', { date: version.started_at.slice(0, 10) })}</span>}
          {version.ended_at && <span> · {t('workspace.versionDetail.ended', { date: version.ended_at.slice(0, 10) })}</span>}
          {!version.ended_at && isActive && <span style={activeBadge}>{t('workspace.versionDetail.active')}</span>}
        </div>
      </header>

      <PhaseTimeline current={typeof currentPhase === 'number' ? currentPhase : undefined} ended={!!version.ended_at} />

      <OutcomeCard version={version} />

      {approvedPromotions.length > 0 && (
        <ApprovedPromotionsCard promotions={approvedPromotions} />
      )}

      <PrdSection versionId={versionId} />

      <section style={section}>
        <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionTickets', { count: tickets.length })}</h3>
        {tickets.length === 0 ? (
          <div style={emptyHint}>{t('workspace.versionDetail.noTickets')}</div>
        ) : (
          TYPE_ORDER.filter((s) => ticketsByType[s]?.length).map((s) => (
            <TypeGroup key={s} type={s} tickets={ticketsByType[s] ?? []} />
          ))
        )}
      </section>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function collectTickets(
  poState: PoState | null,
  scanned: Ticket[],
  versionId: string,
  isActive: boolean,
): Ticket[] {
  const list: Ticket[] = []
  if (isActive && poState?.current_task?.ticket_id) {
    const ct = poState.current_task
    list.push({
      ticket_id: ct.ticket_id ?? '?',
      version: versionId,
      slug: ct.slug,
      title: ct.title,
      type: ct.type ?? ct.stage,
      status: ct.status,
      qa_status: ct.qa_status,
      qa_loops: ct.qa_loops,
    })
  }
  // fs-scanned tickets — filter to this version, exclude the one already
  // pulled in from current_task to avoid duplicates.
  const ctId = poState?.current_task?.ticket_id
  for (const t of scanned) {
    if (t.version !== versionId) continue
    if (isActive && t.ticket_id === ctId) continue
    list.push(t)
  }
  return list
}

function groupByType(tickets: Ticket[]): Record<string, Ticket[]> {
  const out: Record<string, Ticket[]> = {}
  for (const t of tickets) {
    const k = (t.type ?? t.stage ?? 'unknown') as string
    if (!out[k]) out[k] = []
    out[k].push(t)
  }
  return out
}

// ── sub-components ─────────────────────────────────────────────────────────────

function PhaseTimeline({ current, ended }: { current: number | undefined; ended: boolean }) {
  const { t } = useTranslation()
  return (
    <section style={section}>
      <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionPhase')}</h3>
      <div style={timelineWrap}>
        {PHASE_ORDER.map((p, i) => {
          const num = i + 1
          const isCurrent = !ended && current === num
          const isPast = ended || (typeof current === 'number' && current > num)
          return (
            <div key={p} style={timelineNodeWrap}>
              <div style={timelineNode(isCurrent, isPast)}>
                <span style={timelineNum}>{num}</span>
                <span style={timelineLabel}>{p}</span>
              </div>
              {i < PHASE_ORDER.length - 1 && <div style={timelineLine(isPast)} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function OutcomeCard({ version }: { version: Version }) {
  const { t } = useTranslation()
  const o = version.outcome
  if (!o) return null
  const hasContent = o.north_star || (o.input_metrics && o.input_metrics.length) || o.observed_result || o.retrospective_path
  if (!hasContent) return null

  return (
    <section style={section}>
      <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionOutcome')}</h3>
      <div style={outcomeCard}>
        {o.north_star && (
          <div style={outcomeRow}>
            <span style={outcomeKey}>north_star</span>
            <span style={outcomeVal}>{o.north_star}</span>
          </div>
        )}
        {o.input_metrics && o.input_metrics.length > 0 && (
          <div style={outcomeRow}>
            <span style={outcomeKey}>input metrics</span>
            <span style={outcomeVal}>{o.input_metrics.join(' · ')}</span>
          </div>
        )}
        {o.validation_method && (
          <div style={outcomeRow}>
            <span style={outcomeKey}>validation</span>
            <span style={outcomeValMuted}>{o.validation_method}</span>
          </div>
        )}
        <div style={outcomeRow}>
          <span style={outcomeKey}>observed</span>
          <span style={o.observed_result ? outcomeVal : outcomeValMuted}>
            {o.observed_result ?? t('workspace.versionDetail.observedPending')}
          </span>
        </div>
        {o.retrospective_path && (
          <div style={outcomeRow}>
            <span style={outcomeKey}>retrospective</span>
            <span style={outcomeLink} title={o.retrospective_path}>{o.retrospective_path} ↗</span>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Display label for a promotion's classification (v0.5 B1 / T-017): canonical
 * scope×kind, derived from the target path for legacy entries so it never blanks.
 */
function promotionTierLabel(p: PendingPromotion): string {
  if (p.scope && p.kind) return `${p.scope}/${p.kind}`
  const target = p.final_target ?? p.target ?? ''
  if (target) {
    const scope = target.startsWith('~') || target.includes('.productune') ? 'global' : 'project'
    const kind = /(^|\/)bookshelf(\/|$)/.test(target) ? 'bookshelf' : 'habit'
    return `${scope}/${kind}`
  }
  return p.tier ?? '—'
}

function ApprovedPromotionsCard({ promotions }: { promotions: PendingPromotion[] }) {
  const { t } = useTranslation()
  return (
    <section style={section}>
      <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionApprovedPromotions', { count: promotions.length })}</h3>
      <div style={promoList}>
        {promotions.map((p) => (
          <div key={p.id} style={promoRow}>
            <span style={personaBadge}>{p.persona}</span>
            <span style={tierBadge}>{promotionTierLabel(p)}</span>
            <span style={promoTarget} title={p.target}>{p.target}</span>
            <span style={promoDelta}>
              {p.final_target ?? p.delta}
            </span>
            <InfoPopover text={p.final_target ?? p.delta} threshold={80} />
            {p.decided_at && (
              <span style={promoDate}>{p.decided_at.slice(0, 10)}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function TypeGroup({ type, tickets }: { type: TaskType; tickets: Ticket[] }) {
  return (
    <div style={typeGroup}>
      <div style={typeHeader}>
        <span style={typeLabel}>{type}</span>
        <span style={typeCount}>{tickets.length}</span>
      </div>
      <div style={ticketList}>
        {tickets.map((t) => (
          <TicketRow key={t.ticket_id} ticket={t} />
        ))}
      </div>
    </div>
  )
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const status: Status = (ticket.status as Status) ?? 'todo'
  return (
    <div style={ticketRow}>
      <span style={ticketId}>{ticket.ticket_id}</span>
      <span style={ticketTitle}>{ticket.title ?? ticket.slug ?? '(no title)'}</span>
      <InfoPopover text={ticket.title ?? ticket.slug ?? ''} />
      <span style={statusBadge(status)}>{status}</span>
      {ticket.qa_status && ticket.qa_status !== 'pending' && (
        <span style={qaBadge(ticket.qa_status)}>qa:{ticket.qa_status}</span>
      )}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  background: '#0F0F0F',
  overflow: 'auto',
  padding: '20px 28px',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 16,
  marginBottom: 24,
  paddingBottom: 12,
  borderBottom: '1px solid #1A1A1A',
}

const versionId_: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#F0F0F0',
}

const meta: React.CSSProperties = {
  fontSize: 12,
  color: '#707070',
}

const activeBadge: React.CSSProperties = {
  marginLeft: 12,
  padding: '2px 8px',
  background: '#8B5CF622',
  color: '#8B5CF6',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const section: React.CSSProperties = {
  marginBottom: 28,
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#505050',
}

const timelineWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const timelineNodeWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flex: 1,
}

function timelineNode(isCurrent: boolean, isPast: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 6,
    background: isCurrent ? '#1A1228' : isPast ? '#161616' : '#0F0F0F',
    border: `1px solid ${isCurrent ? '#8B5CF6' : isPast ? '#3A3A3A' : '#1A1A1A'}`,
  }
}

const timelineNum: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#707070',
  width: 18,
  textAlign: 'center',
}

const timelineLabel: React.CSSProperties = {
  fontSize: 13,
  color: '#E0E0E0',
}

function timelineLine(isPast: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 1,
    background: isPast ? '#3A3A3A' : '#1A1A1A',
    margin: '0 4px',
  }
}

const outcomeCard: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 6,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const outcomeRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  fontSize: 12,
  alignItems: 'baseline',
}

const outcomeKey: React.CSSProperties = {
  width: 110,
  color: '#707070',
  textTransform: 'lowercase',
  flexShrink: 0,
}

const outcomeVal: React.CSSProperties = {
  color: '#E0E0E0',
}

const outcomeValMuted: React.CSSProperties = {
  color: '#505050',
  fontStyle: 'italic',
}

const outcomeLink: React.CSSProperties = {
  color: '#8B5CF6',
  cursor: 'pointer',
}

const typeGroup: React.CSSProperties = {
  marginBottom: 12,
}

const typeHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const typeLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#A0A0A0',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const typeCount: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
}

const ticketList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginLeft: 8,
}

const ticketRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px',
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  fontSize: 12,
}

const ticketId: React.CSSProperties = {
  color: '#707070',
  fontFamily: 'monospace',
  fontSize: 11,
  flexShrink: 0,
  minWidth: 56,
}

const ticketTitle: React.CSSProperties = {
  color: '#E0E0E0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function statusBadge(status: Status): React.CSSProperties {
  const colors: Record<Status, { fg: string; bg: string }> = {
    'todo':         { fg: '#707070', bg: '#1A1A1A' },
    'in-progress':  { fg: '#38BDF8', bg: '#082028' },
    'review':       { fg: '#F59E0B', bg: '#2A2008' },
    'user-verify':  { fg: '#FB923C', bg: '#261008' },
    'done':         { fg: '#34D399', bg: '#0A2A1A' },
    'blocked':      { fg: '#EF4444', bg: '#2A0808' },
    'abandoned':    { fg: '#505050', bg: '#1A1A1A' },
  }
  const c = colors[status] ?? colors['todo']
  return {
    fontSize: 10,
    color: c.fg,
    background: c.bg,
    padding: '2px 8px',
    borderRadius: 3,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
}

function qaBadge(qa: 'pass' | 'fail' | 'pending'): React.CSSProperties {
  const c = qa === 'pass' ? { fg: '#34D399', bg: '#0A2A1A' } : qa === 'fail' ? { fg: '#E04040', bg: '#2A0808' } : { fg: '#707070', bg: '#1A1A1A' }
  return {
    fontSize: 10,
    color: c.fg,
    background: c.bg,
    padding: '2px 6px',
    borderRadius: 3,
    fontWeight: 600,
    fontFamily: 'monospace',
  }
}

const empty: React.CSSProperties = {
  flex: 1,
  background: '#0F0F0F',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#505050',
  fontSize: 13,
}

const emptyHint: React.CSSProperties = {
  fontSize: 12,
  color: '#3A3A3A',
  marginLeft: 8,
}

// Approved promotions styles
const promoList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const promoRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 10px',
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  fontSize: 11,
  flexWrap: 'wrap',
}

const personaBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#8B5CF6',
  background: '#120A2A',
  padding: '1px 5px',
  borderRadius: 3,
  fontFamily: 'monospace',
  flexShrink: 0,
}

const tierBadge: React.CSSProperties = {
  fontSize: 10,
  color: '#A0A0A0',
  background: '#1A1A1A',
  padding: '1px 5px',
  borderRadius: 3,
  fontFamily: 'monospace',
  flexShrink: 0,
}

const promoTarget: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'monospace',
  flexShrink: 0,
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const promoDelta: React.CSSProperties = {
  flex: 1,
  color: '#C0C0C0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const promoDate: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  fontFamily: 'monospace',
  flexShrink: 0,
}
