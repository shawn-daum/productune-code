import { useMemo, useState } from 'react'
import type { PoState, Ticket, Stage, Status } from '../../lib/types'

interface Props {
  poState: PoState | null
}

const STATUS_ORDER: Status[] = ['todo', 'in-progress', 'review', 'done', 'blocked', 'abandoned']
const STAGE_ORDER: Stage[] = ['design', 'impl', 'refactor', 'test', 'qa', 'deploy']
const VERSION_ALL = '__all__'

export default function TicketDashboardView({ poState }: Props) {
  const [versionFilter, setVersionFilter] = useState<string>(VERSION_ALL)
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')

  const allTickets = useMemo(() => collectAllTickets(poState), [poState])
  const versionIds = useMemo(() => uniqueVersions(allTickets), [allTickets])

  const filtered = useMemo(() => {
    return allTickets.filter((t) => {
      if (versionFilter !== VERSION_ALL && t.version !== versionFilter) return false
      if (stageFilter !== 'all' && t.stage !== stageFilter) return false
      return true
    })
  }, [allTickets, versionFilter, stageFilter])

  const byStatus = useMemo(() => groupByStatus(filtered), [filtered])

  return (
    <div style={wrap}>
      <header style={header}>
        <h2 style={title}>Tickets</h2>
        <div style={filters}>
          <FilterSelect
            label="Version"
            value={versionFilter}
            options={[{ value: VERSION_ALL, label: 'all' }, ...versionIds.map((v) => ({ value: v, label: v }))]}
            onChange={setVersionFilter}
          />
          <FilterSelect
            label="Stage"
            value={stageFilter}
            options={[{ value: 'all', label: 'all' }, ...STAGE_ORDER.map((s) => ({ value: s, label: s }))]}
            onChange={(v) => setStageFilter(v as Stage | 'all')}
          />
          <span style={count}>{filtered.length} ticket{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div style={empty}>No tickets match this filter.</div>
      ) : (
        <div style={kanban}>
          {STATUS_ORDER.map((s) => (
            <Column key={s} status={s} tickets={byStatus[s] ?? []} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function collectAllTickets(poState: PoState | null): Ticket[] {
  const list: Ticket[] = []
  const ct = poState?.current_task
  if (ct?.ticket_id) {
    list.push({
      ticket_id: ct.ticket_id ?? '?',
      version: poState?.current_version,
      slug: ct.slug,
      title: ct.title,
      stage: ct.stage,
      status: ct.status,
      qa_status: ct.qa_status,
      qa_loops: ct.qa_loops,
    })
  }
  for (const t of poState?.past_tickets ?? []) list.push(t)
  return list
}

function uniqueVersions(tickets: Ticket[]): string[] {
  const set = new Set<string>()
  for (const t of tickets) if (t.version) set.add(t.version)
  return Array.from(set).sort()
}

function groupByStatus(tickets: Ticket[]): Record<string, Ticket[]> {
  const out: Record<string, Ticket[]> = {}
  for (const t of tickets) {
    const k = (t.status as Status) ?? 'todo'
    if (!out[k]) out[k] = []
    out[k].push(t)
  }
  return out
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Column({ status, tickets }: { status: Status; tickets: Ticket[] }) {
  return (
    <div style={column}>
      <div style={columnHeader(status)}>
        <span style={columnLabel}>{status}</span>
        <span style={columnCount}>{tickets.length}</span>
      </div>
      <div style={columnBody}>
        {tickets.length === 0 ? (
          <div style={columnEmpty}>—</div>
        ) : (
          tickets.map((t) => <Card key={t.ticket_id} ticket={t} />)
        )}
      </div>
    </div>
  )
}

function Card({ ticket }: { ticket: Ticket }) {
  return (
    <div style={card}>
      <div style={cardTopRow}>
        <span style={cardId}>{ticket.ticket_id}</span>
        {ticket.version && <span style={cardVersion}>{ticket.version}</span>}
      </div>
      <div style={cardTitle}>{ticket.title ?? ticket.slug ?? '(no title)'}</div>
      <div style={cardBottomRow}>
        {ticket.stage && <span style={stageChip(ticket.stage)}>{ticket.stage}</span>}
        {ticket.qa_status && ticket.qa_status !== 'pending' && (
          <span style={qaChip(ticket.qa_status)}>qa:{ticket.qa_status}</span>
        )}
        {typeof ticket.qa_loops === 'number' && ticket.qa_loops > 0 && (
          <span style={loopChip}>loops {ticket.qa_loops}</span>
        )}
      </div>
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label style={filterLabel}>
      <span style={filterLabelText}>{label}</span>
      <select style={filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'center',
  background: '#0F0F0F',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderBottom: '1px solid #1A1A1A',
  flexShrink: 0,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: '#F0F0F0',
}

const filters: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
}

const filterLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const filterLabelText: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const filterSelect: React.CSSProperties = {
  background: '#161616',
  color: '#E0E0E0',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
}

const count: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  marginLeft: 4,
}

const empty: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#3A3A3A',
  fontSize: 13,
}

const kanban: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(180px, 1fr))',
  gap: 8,
  padding: 16,
  overflowX: 'auto',
  overflowY: 'hidden',
}

const column: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: '#0A0A0A',
  border: '1px solid #1A1A1A',
  borderRadius: 6,
  overflow: 'hidden',
  minWidth: 180,
}

function columnHeader(status: Status): React.CSSProperties {
  const colors: Record<Status, string> = {
    'todo':        '#505050',
    'in-progress': '#FF6B2B',
    'review':      '#E0B040',
    'done':        '#60B860',
    'blocked':     '#E04040',
    'abandoned':   '#3A3A3A',
  }
  const c = colors[status] ?? '#505050'
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: `2px solid ${c}`,
    background: '#0F0F0F',
    flexShrink: 0,
  }
}

const columnLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#E0E0E0',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const columnCount: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
}

const columnBody: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  overflowY: 'auto',
}

const columnEmpty: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  textAlign: 'center',
  padding: '12px 0',
}

const card: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const cardTopRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const cardId: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'monospace',
}

const cardVersion: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  fontFamily: 'monospace',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
}

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  color: '#E0E0E0',
  lineHeight: 1.4,
}

const cardBottomRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 4,
}

function stageChip(stage: Stage): React.CSSProperties {
  const colors: Record<Stage, { fg: string; bg: string }> = {
    design:   { fg: '#A878E0', bg: '#1A1228' },
    impl:     { fg: '#60B860', bg: '#0A2A0A' },
    refactor: { fg: '#60B0E0', bg: '#0A1828' },
    test:     { fg: '#E0B040', bg: '#2A2008' },
    qa:       { fg: '#E07060', bg: '#2A0808' },
    deploy:   { fg: '#FF6B2B', bg: '#2A1808' },
  }
  const c = colors[stage]
  return {
    fontSize: 9,
    color: c.fg,
    background: c.bg,
    padding: '1px 6px',
    borderRadius: 2,
    fontWeight: 600,
    fontFamily: 'monospace',
    textTransform: 'lowercase',
  }
}

function qaChip(qa: 'pass' | 'fail' | 'pending'): React.CSSProperties {
  const c = qa === 'pass' ? { fg: '#60B860', bg: '#0A2A0A' } : qa === 'fail' ? { fg: '#E04040', bg: '#2A0808' } : { fg: '#707070', bg: '#1A1A1A' }
  return {
    fontSize: 9,
    color: c.fg,
    background: c.bg,
    padding: '1px 6px',
    borderRadius: 2,
    fontWeight: 600,
    fontFamily: 'monospace',
  }
}

const loopChip: React.CSSProperties = {
  fontSize: 9,
  color: '#E04040',
  background: '#2A0808',
  padding: '1px 6px',
  borderRadius: 2,
  fontWeight: 600,
  fontFamily: 'monospace',
}
