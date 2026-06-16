import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { PoState, Ticket, Status } from '../../lib/types'
import { useTicketScan, normalizeStatus } from '../../lib/useTicketScan'
import { useWorkspace } from '../../store/workspace'
import { ticketDetailTabId } from '../../views/workspace/shell/helpers'

interface Props {
  poState: PoState | null
  versionFilter?: string
}

// blocked=urgent-attention left / abandoned=terminal-archive right / workflow natural middle (T-P4-138)
// T-PATCH-130: 'review'(QA) 컬럼 제거 → 'in-progress' 버킷으로 접음. 표시 컬럼 6개.
const STATUS_ORDER: Status[] = ['blocked', 'todo', 'in-progress', 'user-verify', 'done', 'abandoned']
/**
 * Set of known (valid) status strings. STATUS_ORDER drives the *display* columns,
 * but 'review' remains a valid ticket status (types.ts Status 7-status) — it is
 * folded into a display bucket, NOT treated as unknown. So we add it explicitly
 * here; otherwise review tickets would be counted as schema-mismatch and mapped
 * to 'todo' (T-PATCH-130 BDD-3).
 */
const KNOWN_STATUS_SET = new Set<string>([...STATUS_ORDER, 'review'])
/**
 * Display-bucket remap: a known status that has no dedicated column is folded
 * into the column listed here. 'review'(QA) → 'in-progress'(진행 중) (T-PATCH-130 BDD-2).
 */
const DISPLAY_BUCKET: Partial<Record<Status, Status>> = { review: 'in-progress' }

export default function TicketDashboardView({ poState, versionFilter }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const { tickets: scannedTickets, loading } = useTicketScan(project?.projectDir ?? null)

  const allTickets = useMemo(() => {
    const raw = collectAllTickets(poState, scannedTickets)
    if (!versionFilter) return raw
    return raw.filter((t) => t.version === versionFilter)
  }, [poState, scannedTickets, versionFilter])
  const { byStatus, unknownCount, unknownValues } = useMemo(() => groupByStatus(allTickets), [allTickets])

  return (
    <div style={wrap}>
      <header style={header}>
        <h2 style={title}>{t('workspace.tickets.title')}</h2>
      </header>

      {unknownCount > 0 && (
        <SchemaMismatchBanner count={unknownCount} values={unknownValues} />
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
  /** Distinct raw status strings that were unknown (T-PATCH-136 — surfaced in the banner for self-diagnosis). */
  unknownValues: string[]
}

function groupByStatus(tickets: Ticket[]): GroupByStatusResult {
  const byStatus: Record<string, Ticket[]> = {}
  let unknownCount = 0
  const unknownSet = new Set<string>()
  for (const t of tickets) {
    const raw = (t.status as string) ?? 'todo'
    const known = KNOWN_STATUS_SET.has(raw)
    // Unknown status → 'todo' fallback. Only count as unknown when status was
    // explicitly set to a non-standard value (not null/undefined).
    if (!known && t.status != null) {
      unknownCount++
      // Collect the distinct offending raw value so the banner can name it
      // (T-PATCH-136 AC-6). Same null/undefined gate as the count above.
      unknownSet.add(raw)
    }
    // Known status → its column, but fold any display-bucketed status (e.g. 'review' → 'in-progress').
    // Unknown status → 'todo' fallback.
    const resolved: Status = known ? (raw as Status) : 'todo'
    const k: Status = DISPLAY_BUCKET[resolved] ?? resolved
    if (!byStatus[k]) byStatus[k] = []
    byStatus[k].push(t)
  }
  return { byStatus, unknownCount, unknownValues: [...unknownSet] }
}

// ── sort (T-PATCH-162) ──────────────────────────────────────────────────────────

/**
 * Natural/numeric-aware ticket_id comparison so T-002 < T-010 (lexical would
 * order T-010 < T-002). `numeric: true` makes embedded digit runs compare by
 * value; falls back to lexical for the non-numeric prefix.
 */
const TICKET_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compareTicketId(a: Ticket, b: Ticket): number {
  return TICKET_ID_COLLATOR.compare(a.ticket_id ?? '', b.ticket_id ?? '')
}

/** desc string compare (ISO timestamps sort correctly lexically); nulls sink to bottom. */
function compareDateDesc(a?: string | null, b?: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? 1 : a > b ? -1 : 0
}

/** desc number compare; undefined sinks to bottom. */
function compareMtimeDesc(a?: number, b?: number): number {
  const av = a ?? -Infinity
  const bv = b ?? -Infinity
  return bv - av
}

/**
 * Per-status comparator (T-PATCH-162):
 *  - todo        → ticket_id ascending (next-up on top; natural/numeric-aware).
 *  - done        → completed_at descending (most-recently completed on top).
 *  - everything else (in-progress incl. folded review / user-verify / blocked /
 *    abandoned) → file mtime descending = "last touched" on top, falling back to
 *    started_at desc then ticket_id when mtime is absent.
 * Comparators are total (ties broken by ticket_id) so Array.sort is effectively
 * stable for our purposes regardless of engine.
 */
function ticketComparator(status: Status): (a: Ticket, b: Ticket) => number {
  if (status === 'todo') {
    return compareTicketId
  }
  if (status === 'done') {
    return (a, b) => {
      const d = compareDateDesc(a.completed_at, b.completed_at)
      return d !== 0 ? d : compareTicketId(a, b)
    }
  }
  return (a, b) => {
    const m = compareMtimeDesc(a.mtime, b.mtime)
    if (m !== 0) return m
    const s = compareDateDesc(a.started_at, b.started_at)
    return s !== 0 ? s : compareTicketId(a, b)
  }
}

// ── sub-components ─────────────────────────────────────────────────────────────

/** Cap on distinct unknown-status values listed inline before collapsing to "+N more". */
const UNKNOWN_VALUES_CAP = 3

/** Thin warning banner — shown when ≥1 ticket has an unknown status value. */
function SchemaMismatchBanner({ count, values }: { count: number; values: string[] }) {
  const { t } = useTranslation()
  // Cap the listed distinct raw values at 3 + "+N more" so the single-line
  // banner never overflows (T-PATCH-136 AC-6, PO decision). Raw status strings
  // are NOT translated — they are interpolated as-is, keeping protected tokens intact.
  const shown = values.slice(0, UNKNOWN_VALUES_CAP)
  const remainder = values.length - shown.length
  const valuesLabel = remainder > 0
    ? t('workspace.tickets.schemaMismatchMore', { values: shown.join(', '), more: remainder })
    : shown.join(', ')
  return (
    <div style={mismatchBannerWrap} role="status" aria-live="polite">
      <span style={mismatchIconWrap}>
        <AlertTriangle size={12} color="#A08050" />
      </span>
      <span style={mismatchMsg}>
        {t('workspace.tickets.schemaMismatchBanner', { count, values: valuesLabel })}
      </span>
    </div>
  )
}

function Column({ status, tickets }: { status: Status; tickets: Ticket[] }) {
  const { t } = useTranslation()
  // T-PATCH-162: status-specific sort, memoised on the (column) status + list
  // identity. Copy before sorting to avoid mutating the byStatus bucket in place.
  const sorted = useMemo(
    () => [...tickets].sort(ticketComparator(status)),
    [tickets, status],
  )
  return (
    <div style={column}>
      <div style={columnHeader(status)}>
        <span style={columnLabel}>{t(`workspace.tickets.status.${status}`, { defaultValue: status })}</span>
        <span style={columnCount}>{sorted.length}</span>
      </div>
      <div style={columnBody}>
        {sorted.length === 0 ? (
          <div style={columnEmpty}>—</div>
        ) : (
          sorted.map((t) => <Card key={t.ticket_id} ticket={t} />)
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
        // (version, id)-namespaced tab id via shared helper (T-PATCH-111).
        ticketDetailTabId(ticket.version, ticket.ticket_id),
        'ticket-detail',
        { ticketId: ticket.ticket_id, version: ticket.version ?? null },
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
  // T-PATCH-130: column count derives from STATUS_ORDER (now 6) — no hardcoded 7.
  gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(160px, 1fr))`,
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
