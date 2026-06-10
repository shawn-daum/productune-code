import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { PoState, Ticket, Status } from '../../lib/types'
import { useTicketScan, normalizeStatus } from '../../lib/useTicketScan'
import { useWorkspace } from '../../store/workspace'

interface Props {
  poState: PoState | null
  versionFilter?: string
}

// blocked=urgent-attention left / abandoned=terminal-archive right / workflow natural middle (T-P4-138)
const STATUS_ORDER: Status[] = ['blocked', 'todo', 'in-progress', 'review', 'user-verify', 'done', 'abandoned']
/** Set derived from STATUS_ORDER — single source of truth for known status strings. */
const KNOWN_STATUS_SET = new Set<string>(STATUS_ORDER)

export default function TicketDashboardView({ poState, versionFilter }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const { tickets: scannedTickets, loading } = useTicketScan(project?.projectDir ?? null)

  const allTickets = useMemo(() => {
    const raw = collectAllTickets(poState, scannedTickets)
    if (!versionFilter) return raw
    return raw.filter((t) => t.version === versionFilter)
  }, [poState, scannedTickets, versionFilter])
  const { byStatus, unknownCount } = useMemo(() => groupByStatus(allTickets), [allTickets])

  return (
    <div style={wrap}>
      <header style={header}>
        <h2 style={title}>{t('workspace.tickets.title')}</h2>
      </header>

      {unknownCount > 0 && (
        <SchemaMismatchBanner count={unknownCount} />
      )}

      {loading && allTickets.length === 0 ? (
        /* §1.5.4: pending state — Loader2 spinner (T-P4-069 fix C-2) */
        <div style={loadingWrap} role="status" aria-label={t('workspace.tickets.loading')}>
          <Loader2 size={20} color="#505050" className="pdt-spin" />
        </div>
      ) : allTickets.length === 0 ? (
        /* §1.5.3: empty state — distinct from loading (T-P4-069 fix C-2) */
        <div style={empty}>
          <span>{t('workspace.tickets.noTickets')}</span>
          <button style={noTicketsCta}>
            {t('workspace.tickets.noTicketsCta')}
          </button>
        </div>
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

function collectAllTickets(poState: PoState | null, scanned: Ticket[]): Ticket[] {
  const list: Ticket[] = []
  const ct = poState?.current_task
  const ctId = ct?.ticket_id
  if (ctId) {
    list.push({
      ticket_id: ctId,
      version: poState?.current_version,
      slug: ct?.slug,
      title: ct?.title,
      type: ct?.type ?? ct?.stage,
      // T-PATCH-011: normalise current_task.status through the same synonym map
      // used for scanned tickets — po-state may carry project-specific values
      // (e.g. "design-proposal") that are not canonical 7-status strings.
      status: normalizeStatus(ct?.status),
      qa_status: ct?.qa_status,
      qa_loops: ct?.qa_loops,
      assignee: ct?.assignee_persona,
    })
  }
  for (const t of scanned) {
    if (ctId && t.ticket_id === ctId) continue   // current_task takes precedence
    list.push(t)
  }
  return list
}

interface GroupByStatusResult {
  byStatus: Record<string, Ticket[]>
  /** Number of tickets whose status was not in STATUS_ORDER and was silently mapped to 'todo'. */
  unknownCount: number
}

function groupByStatus(tickets: Ticket[]): GroupByStatusResult {
  const byStatus: Record<string, Ticket[]> = {}
  let unknownCount = 0
  for (const t of tickets) {
    const raw = (t.status as string) ?? 'todo'
    const known = KNOWN_STATUS_SET.has(raw)
    // Unknown status → 'todo' fallback. Only count as unknown when status was
    // explicitly set to a non-standard value (not null/undefined).
    if (!known && t.status != null) unknownCount++
    const k: Status = known ? (raw as Status) : 'todo'
    if (!byStatus[k]) byStatus[k] = []
    byStatus[k].push(t)
  }
  return { byStatus, unknownCount }
}

// ── sub-components ─────────────────────────────────────────────────────────────

/** Thin warning banner — shown when ≥1 ticket has an unknown status value. */
function SchemaMismatchBanner({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <div style={mismatchBannerWrap} role="status" aria-live="polite">
      <span style={mismatchIconWrap}>
        <AlertTriangle size={12} color="#A08050" />
      </span>
      <span style={mismatchMsg}>
        {t('workspace.tickets.schemaMismatchBanner', { count })}
      </span>
    </div>
  )
}

function Column({ status, tickets }: { status: Status; tickets: Ticket[] }) {
  const { t } = useTranslation()
  return (
    <div style={column}>
      <div style={columnHeader(status)}>
        <span style={columnLabel}>{t(`workspace.tickets.status.${status}`, { defaultValue: status })}</span>
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

/** Resolve assignee for display. Falls back to 'user' for deploy-type tickets (user-step). */
function resolveAssignee(ticket: Ticket): string | null {
  if (ticket.assignee) return ticket.assignee
  const type = ticket.type ?? ticket.stage
  if (type === 'deploy') return 'user'
  return null
}

function Card({ ticket }: { ticket: Ticket }) {
  const assignee = resolveAssignee(ticket)
  const openTab = useWorkspace((s) => s.openTab)
  return (
    <div
      style={card}
      onClick={() => openTab(
        'ticket-detail:' + ticket.ticket_id,
        'ticket-detail',
        { ticketId: ticket.ticket_id },
        ticket.ticket_id,
      )}
    >
      <div style={cardTopRow}>
        <span style={cardId}>{ticket.ticket_id}</span>
        {/* B: version span removed */}
      </div>
      <div style={cardTitle}>{ticket.title ?? ticket.slug ?? '(no title)'}</div>
      <div style={cardBottomRow}>
        {/* C: assignee chip — hide when no assignee */}
        {assignee && (
          <span style={assigneeChip(assignee)}>{assigneeLabel(assignee)}</span>
        )}
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

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
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

const loadingWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const empty: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  color: '#3A3A3A',
  fontSize: 13,
}

const noTicketsCta: React.CSSProperties = {
  height: 28,
  padding: '0 14px',
  background: '#8B5CF6',
  color: '#0F0F0F',
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const mismatchBannerWrap: React.CSSProperties = {
  height: 32,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  background: '#161610',
  borderLeft: '3px solid #706030',
  borderBottom: '1px solid #262410',
}

const mismatchIconWrap: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
}

const mismatchMsg: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A080',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const kanban: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))',
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
    'todo':         '#505050',
    'in-progress':  '#38BDF8',
    'review':       '#F59E0B',
    'user-verify':  '#FB923C',
    'done':         '#34D399',
    'blocked':      '#EF4444',
    'abandoned':    '#3A3A3A',
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
  padding: '8px 0',     // A: 좌우 0 → card 자체 margin으로 균등 처리 (overflow:hidden 우측 클리핑 방지)
  overflowY: 'auto',
  overflowX: 'hidden',   // T-P4-144: 컬럼 경계 밖 카드 노출 차단
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
  minWidth: 0,                  // T-P4-144: flex item min-width:auto 재정의 → 컬럼 너비 초과 방지
  flexShrink: 0,                // B: flex column 안에서 압축 차단 → height = content-fit 보장
  minHeight: 80,                // content 없는 카드 최소 높이 floor
  width: 'calc(100% - 16px)',   // C: columnBody 좌우 padding 0 기준 → 8px 양쪽 균등 margin
  margin: '0 auto',             // C: 좌우 균등 센터링
  cursor: 'pointer',
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

// B: cardVersion removed — version no longer shown on cards

const cardTitle: React.CSSProperties = {
  fontSize: 12,
  color: '#E0E0E0',
  lineHeight: 1.4,
  wordBreak: 'break-word',    // A: line-clamp 제거 → title 전체 노출. 긴 단어 줄바꿈 유지.
}

const cardBottomRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 4,
}

// C: typeChip removed — replaced by assigneeChip

const ASSIGNEE_COLORS: Record<string, { fg: string; bg: string; label: string }> = {
  'pdt-po':        { fg: '#8B5CF6', bg: '#120A2A', label: 'PO' },
  'pdt-designer':  { fg: '#FB923C', bg: '#261008', label: 'Des' },
  'pdt-developer': { fg: '#38BDF8', bg: '#0A1828', label: 'Dev' },
  'pdt-qa':        { fg: '#34D399', bg: '#0A2A1A', label: 'QA' },
  'user':          { fg: '#707070', bg: '#1A1A1A', label: 'User' },
}

function assigneeLabel(assignee: string): string {
  return ASSIGNEE_COLORS[assignee]?.label ?? assignee
}

function assigneeChip(assignee: string): React.CSSProperties {
  const c = ASSIGNEE_COLORS[assignee] ?? { fg: '#707070', bg: '#1A1A1A' }
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

function qaChip(qa: 'pass' | 'fail' | 'pending'): React.CSSProperties {
  const c = qa === 'pass' ? { fg: '#34D399', bg: '#0A2A1A' } : qa === 'fail' ? { fg: '#E04040', bg: '#2A0808' } : { fg: '#707070', bg: '#1A1A1A' }
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
