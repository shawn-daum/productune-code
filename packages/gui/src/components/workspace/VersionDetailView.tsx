import type { PoState, Version, Ticket, Phase, Stage, Status } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'

interface Props {
  versionId: string
  poState: PoState | null
}

const PHASE_ORDER: Phase[] = ['PRD', 'Design', 'Build', 'Close']
const STAGE_ORDER: Stage[] = ['design', 'impl', 'refactor', 'test', 'qa', 'deploy']

export default function VersionDetailView({ versionId, poState }: Props) {
  const version = (poState?.versions ?? []).find((v) => v.id === versionId)
  if (!version) {
    return <div style={empty}>Version `{versionId}` not found in po-state.</div>
  }

  const isActive = poState?.current_version === versionId
  const currentPhase = isActive ? poState?.current_phase : version.ended_at ? 4 : undefined

  const tickets = collectTickets(poState, versionId, isActive)
  const ticketsByStage = groupByStage(tickets)

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={versionId_}>{version.id}</div>
        <div style={meta}>
          {version.started_at && <span>started {version.started_at.slice(0, 10)}</span>}
          {version.ended_at && <span> · closed {version.ended_at.slice(0, 10)}</span>}
          {!version.ended_at && isActive && <span style={activeBadge}>active</span>}
        </div>
      </header>

      <PhaseTimeline current={typeof currentPhase === 'number' ? currentPhase : undefined} ended={!!version.ended_at} />

      <OutcomeCard version={version} />

      <section style={section}>
        <h3 style={sectionTitle}>Tickets ({tickets.length})</h3>
        {tickets.length === 0 ? (
          <div style={emptyHint}>No tickets recorded for this Version yet.</div>
        ) : (
          STAGE_ORDER.filter((s) => ticketsByStage[s]?.length).map((s) => (
            <StageGroup key={s} stage={s} tickets={ticketsByStage[s] ?? []} />
          ))
        )}
      </section>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function collectTickets(poState: PoState | null, versionId: string, isActive: boolean): Ticket[] {
  const list: Ticket[] = []
  if (isActive && poState?.current_task?.ticket_id) {
    const ct = poState.current_task
    list.push({
      ticket_id: ct.ticket_id ?? '?',
      version: versionId,
      slug: ct.slug,
      title: ct.title,
      stage: ct.stage,
      status: ct.status,
      qa_status: ct.qa_status,
      qa_loops: ct.qa_loops,
    })
  }
  for (const t of poState?.past_tickets ?? []) {
    if (t.version === versionId) list.push(t)
  }
  return list
}

function groupByStage(tickets: Ticket[]): Record<string, Ticket[]> {
  const out: Record<string, Ticket[]> = {}
  for (const t of tickets) {
    const k = t.stage ?? 'unknown'
    if (!out[k]) out[k] = []
    out[k].push(t)
  }
  return out
}

// ── sub-components ─────────────────────────────────────────────────────────────

function PhaseTimeline({ current, ended }: { current: number | undefined; ended: boolean }) {
  return (
    <section style={section}>
      <h3 style={sectionTitle}>Phase</h3>
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
  const o = version.outcome
  if (!o) return null
  const hasContent = o.north_star || (o.input_metrics && o.input_metrics.length) || o.observed_result || o.retrospective_path
  if (!hasContent) return null

  return (
    <section style={section}>
      <h3 style={sectionTitle}>Outcome</h3>
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
            {o.observed_result ?? 'pending (lazy — fills at next Version Phase 1)'}
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

function StageGroup({ stage, tickets }: { stage: Stage; tickets: Ticket[] }) {
  return (
    <div style={stageGroup}>
      <div style={stageHeader}>
        <span style={stageLabel}>{stage}</span>
        <span style={stageCount}>{tickets.length}</span>
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
      <span style={statusBadge(status)}>{status}</span>
      {ticket.qa_status && ticket.qa_status !== 'pending' && (
        <span style={qaBadge(ticket.qa_status)}>qa:{ticket.qa_status}</span>
      )}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'center',
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
  background: '#FF6B2B22',
  color: '#FF6B2B',
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
    background: isCurrent ? '#2A1808' : isPast ? '#161616' : '#0F0F0F',
    border: `1px solid ${isCurrent ? '#FF6B2B' : isPast ? '#3A3A3A' : '#1A1A1A'}`,
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
  color: '#FF6B2B',
  cursor: 'pointer',
}

const stageGroup: React.CSSProperties = {
  marginBottom: 12,
}

const stageHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const stageLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#A0A0A0',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const stageCount: React.CSSProperties = {
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
    'todo':        { fg: '#707070', bg: '#1A1A1A' },
    'in-progress': { fg: '#FF6B2B', bg: '#2A1808' },
    'review':      { fg: '#E0B040', bg: '#2A2008' },
    'done':        { fg: '#60B860', bg: '#0A2A0A' },
    'blocked':     { fg: '#E04040', bg: '#2A0808' },
    'abandoned':   { fg: '#505050', bg: '#1A1A1A' },
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
  const c = qa === 'pass' ? { fg: '#60B860', bg: '#0A2A0A' } : qa === 'fail' ? { fg: '#E04040', bg: '#2A0808' } : { fg: '#707070', bg: '#1A1A1A' }
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
  gridArea: 'center',
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
