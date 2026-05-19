/**
 * VersionHistoryView — Main pane tab body for "버전 히스토리" (T-P4-023).
 *
 * Renders ticket-cards and deploy-cards for the selectedVersionId.
 * Subscribes to useWorkspace.selectedVersionId.
 *
 * Scope (2nd PR — T-P4-023 deferred items):
 *  - Filter toolbar (past/unassigned path): persona chip × 4 + date range.
 *    localStorage persist per `workspace.versionHistory.filter.persona`.
 *  - Unassigned bucket: selectedVersionId === '__unassigned__' → version=null tickets.
 *  - Vercel REST deploy event fetch (IPC deploy:fetch-events) on past version select.
 *    Loading skeleton + DeployCard with includedTickets chips.
 *
 * Scope (1st PR):
 *  - ticket-card: persona activity table inline + autosave commit sequence.
 *  - empty state when selectedVersionId === null.
 *
 * Scope (1.5 PR — bifurcation, T-P4-023 §2.2.3):
 *  - isCurrentVersion = selectedVersionId === poState.current_version.
 *  - current → kanban board (4 columns: todo/in-progress/review/done). Read-only.
 *  - past  → existing linear card list.
 */

import { useState, useMemo, useEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoPopover } from '../components/shared/InfoPopover'
// ── Filter state (T-P4-023 sub-a) ─────────────────────────────────────────────

type PersonaKey = 'po' | 'designer' | 'developer' | 'qa'
const ALL_PERSONAS: PersonaKey[] = ['po', 'designer', 'developer', 'qa']

const LS_PERSONA_KEY = 'workspace.versionHistory.filter.persona'

function loadPersonaFilter(): Set<PersonaKey> {
  try {
    const raw = localStorage.getItem(LS_PERSONA_KEY)
    if (!raw) return new Set(ALL_PERSONAS)
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed) || parsed.length === 0) return new Set(ALL_PERSONAS)
    return new Set(parsed.filter((p): p is PersonaKey => ALL_PERSONAS.includes(p as PersonaKey)))
  } catch {
    return new Set(ALL_PERSONAS)
  }
}

function savePersonaFilter(active: Set<PersonaKey>): void {
  try {
    localStorage.setItem(LS_PERSONA_KEY, JSON.stringify([...active]))
  } catch { /* storage unavailable — silently ignore */ }
}

interface FilterState {
  /** Active persona keys — chip toggled on. */
  personas: Set<PersonaKey>
  /** ISO date string (YYYY-MM-DD) or empty. */
  dateFrom: string
  dateTo: string
}

type FilterAction =
  | { type: 'toggle-persona'; key: PersonaKey }
  | { type: 'set-date-from'; value: string }
  | { type: 'set-date-to'; value: string }
  | { type: 'reset-dates'; from: string; to: string }

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'toggle-persona': {
      const next = new Set(state.personas)
      if (next.has(action.key)) {
        next.delete(action.key)
        // Always keep at least 1 persona active
        if (next.size === 0) return state
      } else {
        next.add(action.key)
      }
      savePersonaFilter(next)
      return { ...state, personas: next }
    }
    case 'set-date-from':
      return { ...state, dateFrom: action.value }
    case 'set-date-to':
      return { ...state, dateTo: action.value }
    case 'reset-dates':
      return { ...state, dateFrom: action.from, dateTo: action.to }
    default:
      return state
  }
}

// ── Vercel deploy event type (inlined — @productune/core value import unsafe in Vite) ──

interface FetchedDeployEvent {
  deploymentId: string
  url: string
  createdAt: string
  readyAt: string | null
  state: string
  gitRef: string | null
  includedTickets: string[]
  mergedShaSet: string[]
}

// ── naturalizeCommit (inlined) ─────────────────────────────────────────────────

// naturalizeCommit is duplicated here from packages/core/src/history/naturalize.ts
// because @productune/core imports Node.js builtins (child_process, util) which
// Vite cannot bundle for the renderer process. The pure string-transform
// functions are safe to inline.
function naturalizeCommit(msg: string): { summary: string } {
  const trimmed = msg.trim()
  const m = /^(T-[A-Z0-9-]+)\s+\[([^\]]+)\]\s*(.*)/.exec(trimmed)
  if (!m) return { summary: trimmed }
  const summary = m[3].trim() || m[2].trim()
  return { summary }
}
import type { Ticket } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import { useTicketScan } from '../lib/useTicketScan'

// ── Persona activity row type (from ticket ## Persona Activity table) ─────────

interface PersonaActivityRow {
  when: string
  persona: string
  model: string
  effort: string
  turn: string
  result: string
}

/** Extract rows from the ## Persona Activity table in ticket markdown body. */
function parsePersonaActivity(raw: string): PersonaActivityRow[] {
  const lines = raw.split('\n')
  let inTable = false
  const rows: PersonaActivityRow[] = []
  for (const line of lines) {
    if (/^\|\s*When\s*\|/.test(line)) { inTable = true; continue }
    if (!inTable) continue
    if (/^\|[-\s|]+\|/.test(line)) continue
    if (!line.startsWith('|')) { inTable = false; continue }
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cols.length >= 5) {
      rows.push({
        when: cols[0] ?? '',
        persona: cols[1] ?? '',
        model: cols[2] ?? '',
        effort: cols[3] ?? '',
        turn: '',
        result: cols[4] ?? '',
      })
    }
  }
  return rows
}

// ── Autosave commit line (from history entries stored in ticket via IPC) ──────

interface CommitLine {
  sha: string
  subject: string
  authorDate: string
}

/** Parse the commit subject to a user-visible one-liner (naturalize → summary). */
function commitSummaryLine(subject: string): string {
  const n = naturalizeCommit(subject)
  return n.summary || subject
}

// ── Ticket card component ──────────────────────────────────────────────────────

interface TicketCardProps {
  ticket: Ticket
  commits: CommitLine[]
}

function TicketCard({ ticket, commits }: TicketCardProps) {
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

// Deploy card stub removed — replaced by RichDeployCard (T-P4-023 2nd PR, sub-c).
// RichDeployCard uses FetchedDeployEvent with Vercel REST cross-ref data.

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div style={emptyWrap}>
      <div style={emptyIcon}>◎</div>
      <div style={emptyText}>{message}</div>
    </div>
  )
}

// ── Filter toolbar component ──────────────────────────────────────────────────

const PERSONA_COLORS: Record<PersonaKey, string> = {
  po:        '#FF6B2B',
  designer:  '#9B7FD4',
  developer: '#60B860',
  qa:        '#E07060',
}

interface FilterToolbarProps {
  filter: FilterState
  dispatch: React.Dispatch<FilterAction>
  defaultFrom: string
  defaultTo: string
}

function FilterToolbar({ filter, dispatch, defaultFrom, defaultTo }: FilterToolbarProps) {
  const { t } = useTranslation()
  return (
    <div style={filterBar}>
      {/* Persona chips */}
      <div style={filterGroup}>
        {ALL_PERSONAS.map((key) => {
          const active = filter.personas.has(key)
          const color = PERSONA_COLORS[key]
          return (
            <button
              key={key}
              style={personaChipBtn(active, color)}
              onClick={() => dispatch({ type: 'toggle-persona', key })}
              aria-pressed={active}
              title={t(`workspace.versionHistory.filter.persona.${key}`)}
            >
              {t(`workspace.versionHistory.filter.persona.${key}`)}
            </button>
          )
        })}
      </div>

      {/* Date range */}
      <div style={filterGroup}>
        <label style={dateLabel}>{t('workspace.versionHistory.filter.dateRange.start')}</label>
        <input
          type="date"
          style={dateInput}
          value={filter.dateFrom}
          onChange={(e) => dispatch({ type: 'set-date-from', value: e.target.value })}
        />
        <label style={dateLabel}>{t('workspace.versionHistory.filter.dateRange.end')}</label>
        <input
          type="date"
          style={dateInput}
          value={filter.dateTo}
          onChange={(e) => dispatch({ type: 'set-date-to', value: e.target.value })}
        />
        <button
          style={resetBtn}
          onClick={() => dispatch({ type: 'reset-dates', from: defaultFrom, to: defaultTo })}
        >
          {t('workspace.versionHistory.filter.dateRange.reset')}
        </button>
      </div>
    </div>
  )
}

// ── Deploy loading skeleton ────────────────────────────────────────────────────

function DeployLoadingSkeleton() {
  const { t } = useTranslation()
  return (
    <div style={{ ...cardWrap, borderLeft: '2px solid #22C55E20', opacity: 0.5 }}>
      <div style={cardHeader}>
        <span style={deployPill}>{t('workspace.versionHistory.deploy.loading')}</span>
      </div>
    </div>
  )
}

// ── Deploy card (enriched with includedTickets chips) ─────────────────────────

interface RichDeployCardProps {
  deploy: FetchedDeployEvent
}

function RichDeployCard({ deploy }: RichDeployCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()

  const durationLabel = useMemo(() => {
    if (!deploy.readyAt || !deploy.createdAt) return null
    const start = new Date(deploy.createdAt)
    const end = new Date(deploy.readyAt)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    const diffMs = end.getTime() - start.getTime()
    const mins = Math.floor(diffMs / (1000 * 60))
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000)
    if (mins > 0) return `${mins}분 ${secs}초`
    return `${secs}초`
  }, [deploy.createdAt, deploy.readyAt])

  return (
    <div style={{ ...cardWrap, borderLeft: '2px solid #22C55E40' }}>
      <div style={cardHeader}>
        <span style={deployPill}>배포</span>
        <span style={cardTitle}>{deploy.createdAt.slice(0, 10)}</span>
        <span style={{ ...deployPill, background: deploy.state === 'READY' ? '#0A2A0A' : '#1A0808', color: deploy.state === 'READY' ? '#22C55E' : '#E04040' }}>
          {deploy.state}
        </span>
        {durationLabel && <span style={metaItem}>{durationLabel} 소요</span>}
      </div>

      {deploy.includedTickets.length > 0 && (
        <div style={cardMeta}>
          {deploy.includedTickets.map((tid) => (
            <span key={tid} style={cardTicketId}>{tid}</span>
          ))}
        </div>
      )}

      {deploy.includedTickets.length === 0 && (
        <div style={cardMeta}>
          <span style={metaItem}>{t('workspace.versionHistory.deploy.empty')}</span>
        </div>
      )}

      <button
        style={expandBtn}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? '▲ 접기' : `▼ 배포 URL`}
      </button>

      {expanded && (
        <div style={commitList}>
          <div style={commitRow}>
            <span style={commitSummary}>{deploy.url}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Date boundary helpers ─────────────────────────────────────────────────────

function toDateStr(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
}

function ticketDateKey(ticket: Ticket): string {
  return (ticket as any).completed_at ?? (ticket as any).created_at ?? ''
}

function dateInRange(dateStr: string, from: string, to: string): boolean {
  if (!dateStr) return true
  const d = dateStr.slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function personaMatchesFilter(ticket: Ticket, activePersonas: Set<PersonaKey>): boolean {
  const assignee = ((ticket as any).assignee as string | undefined) ?? ''
  // assignee is like "pdt-designer" — strip prefix
  const key = assignee.replace('pdt-', '') as PersonaKey
  if (ALL_PERSONAS.includes(key)) return activePersonas.has(key)
  // Unknown persona — show by default
  return true
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function VersionHistoryView() {
  const { t } = useTranslation()
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const poState = useWorkspace((s) => s.poState)
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  // ── Filter state (useReducer, localStorage persist) ────────────────────────
  const [filter, dispatch] = useReducer(filterReducer, undefined, () => {
    const personas = loadPersonaFilter()
    return { personas, dateFrom: '', dateTo: '' }
  })

  // ── Deploy events state (T-P4-023 sub-c) ──────────────────────────────────
  const [deployEvents, setDeployEvents] = useState<FetchedDeployEvent[]>([])
  const [deployLoading, setDeployLoading] = useState(false)
  // Track last fetched versionId to avoid redundant fetches
  const lastFetchedVersionRef = useRef<string | null>(null)

  // Empty state: no version selected
  if (!selectedVersionId) {
    return <EmptyState message={t('workspace.versionHistory.empty')} />
  }

  // Branch logic:
  const isUnassigned = selectedVersionId === '__unassigned__'

  // Find version metadata (not applicable for unassigned)
  const versions = poState?.versions ?? []
  const version = isUnassigned ? null : versions.find((v) => v.id === selectedVersionId)
  const versionLabel = isUnassigned
    ? t('workspace.versionHistory.unassigned.label')
    : (version?.id ?? selectedVersionId)

  // Filter tickets for this path
  const versionTickets = useMemo(() => {
    if (isUnassigned) {
      // Unassigned: version=null tickets only. No deploy cards.
      return tickets.filter((tk) => !tk.version)
    }
    return tickets.filter((tk) => tk.version === selectedVersionId)
  }, [tickets, selectedVersionId, isUnassigned])

  // Compute default date range from version first~last activity
  const defaultFrom = useMemo(() => {
    if (isUnassigned) return ''
    return toDateStr(version?.started_at)
  }, [version, isUnassigned])

  const defaultTo = useMemo(() => {
    if (isUnassigned) return ''
    return toDateStr(version?.ended_at ?? null)
  }, [version, isUnassigned])

  // Reset filter dates when version changes
  useEffect(() => {
    dispatch({ type: 'reset-dates', from: defaultFrom, to: defaultTo })
  }, [selectedVersionId, defaultFrom, defaultTo])

  // Fetch Vercel deploy events on past-version select (not unassigned)
  useEffect(() => {
    if (isUnassigned || !selectedVersionId) {
      setDeployEvents([])
      setDeployLoading(false)
      lastFetchedVersionRef.current = null
      return
    }
    if (lastFetchedVersionRef.current === selectedVersionId) return

    lastFetchedVersionRef.current = selectedVersionId
    const projectDir = project?.projectDir ?? ''
    const projectName = project?.slug ?? ''
    const sinceIso = version?.started_at ?? new Date(0).toISOString()
    const untilIso = version?.ended_at ?? new Date().toISOString()

    if (!projectName) return

    setDeployLoading(true)
    setDeployEvents([])

    const api = (window as any).api
    // Prefer deploy.fetchEvents (T-P4-022 3rd PR preload, parallel) or
    // fetchDeployEvents (T-P4-023 standalone preload entry).
    const fetchFn = api?.deploy?.fetchEvents ?? api?.fetchDeployEvents
    if (fetchFn) {
      fetchFn({ projectDir, projectName, sinceIso, untilIso })
        .then((res: { ok: boolean; events: FetchedDeployEvent[]; error?: string }) => {
          if (res.ok) {
            setDeployEvents(res.events)
          }
        })
        .catch(() => { /* graceful — no events */ })
        .finally(() => setDeployLoading(false))
    } else {
      setDeployLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, isUnassigned])

  // Subtitle counts
  const ticketCount = versionTickets.length
  const deployCount = deployEvents.length

  // Duration label
  const durationLabel = useMemo(() => {
    if (!version?.started_at) return null
    const start = new Date(version.started_at)
    const end = version.ended_at ? new Date(version.ended_at) : new Date()
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    const diffMs = end.getTime() - start.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }, [version])

  const subtitle = t('workspace.versionHistory.subtitle', {
    count: ticketCount,
    deploys: deployCount,
    duration: durationLabel ?? '—',
  })

  // ── Past / Unassigned → linear card list + filter toolbar ─────────────────

  // Apply persona + date filter to tickets
  const filteredTickets = versionTickets.filter((tk) => {
    if (!personaMatchesFilter(tk, filter.personas)) return false
    const d = ticketDateKey(tk)
    return dateInRange(d, filter.dateFrom, filter.dateTo)
  })

  // Sort: latest activity first
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const ta = ticketDateKey(a)
    const tb = ticketDateKey(b)
    return tb.localeCompare(ta)
  })

  // Merge ticket + deploy cards into a single time-ordered list
  type CardItem =
    | { kind: 'ticket'; ticket: Ticket; key: string; date: string }
    | { kind: 'deploy'; deploy: FetchedDeployEvent; key: string; date: string }

  const allCards: CardItem[] = [
    ...sortedTickets.map((ticket) => ({
      kind: 'ticket' as const,
      ticket,
      key: ticket.ticket_id,
      date: ticketDateKey(ticket),
    })),
    ...deployEvents.map((deploy) => ({
      kind: 'deploy' as const,
      deploy,
      key: deploy.deploymentId,
      date: deploy.createdAt,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={viewWrap}>
      {/* Header */}
      <div style={headerWrap}>
        <div style={headerTitle}>
          {t('workspace.versionHistory.title')} — {versionLabel}
        </div>
        <div style={headerSubtitle}>{subtitle}</div>
      </div>

      {/* Filter toolbar — past & unassigned paths */}
      <FilterToolbar
        filter={filter}
        dispatch={dispatch}
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
      />

      {/* Card list */}
      <div style={cardListWrap}>
        {deployLoading && <DeployLoadingSkeleton />}
        {allCards.length === 0 && !deployLoading && (
          <EmptyState message={t('workspace.versionHistory.empty')} />
        )}
        {allCards.map((item) =>
          item.kind === 'ticket' ? (
            <TicketCard
              key={item.key}
              ticket={item.ticket}
              commits={[]}
            />
          ) : (
            <RichDeployCard key={item.key} deploy={item.deploy} />
          ),
        )}
      </div>
    </div>
  )
}

// ── Status helpers ─────────────────────────────────────────────────────────────

type StatusKey = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked' | 'abandoned' | string

function statusPill(status: StatusKey): React.CSSProperties {
  const palette: Record<string, { fg: string; bg: string }> = {
    'todo':        { fg: '#707070', bg: '#1A1A1A' },
    'in-progress': { fg: '#60A8E0', bg: '#0A1828' },
    'review':      { fg: '#E0B040', bg: '#2A2008' },
    'done':        { fg: '#60B860', bg: '#0A2A0A' },
    'blocked':     { fg: '#E04040', bg: '#2A0808' },
    'abandoned':   { fg: '#505050', bg: '#141414' },
  }
  const p = palette[status] ?? palette['todo']
  return {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: 'monospace',
    color: p.fg,
    background: p.bg,
    padding: '1px 5px',
    borderRadius: 2,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  }
}

// ── Filter bar styles (T-P4-023 sub-a) ───────────────────────────────────────

const filterBar: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 16px',
  borderBottom: '1px solid #1A1A1A',
  flexWrap: 'wrap',
}

const filterGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

function personaChipBtn(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 3,
    border: `1px solid ${active ? color + '80' : '#2A2A2A'}`,
    background: active ? color + '18' : 'transparent',
    color: active ? color : '#505050',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as const,
  }
}

const dateLabel: React.CSSProperties = {
  fontSize: 9,
  color: '#505050',
  fontFamily: 'monospace',
  flexShrink: 0,
}

const dateInput: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  color: '#C0C0C0',
  fontSize: 10,
  fontFamily: 'monospace',
  padding: '2px 4px',
  cursor: 'pointer',
}

const resetBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  color: '#505050',
  fontSize: 9,
  fontFamily: 'monospace',
  padding: '2px 6px',
  cursor: 'pointer',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const viewWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
}

const headerWrap: React.CSSProperties = {
  flexShrink: 0,
  padding: '14px 16px 10px',
  borderBottom: '1px solid #1E1E1E',
}

const headerTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#F0F0F0',
  marginBottom: 4,
}

const headerSubtitle: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
}

const cardListWrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const cardWrap: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #1F1F1F',
  borderLeft: '2px solid #FF6B2B30',
  borderRadius: 6,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

const cardTicketId: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#FF6B2B',
  flexShrink: 0,
}

const cardTitle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#E0E0E0',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cardMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const metaItem: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#606060',
}

const activityList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginTop: 2,
}

const activityRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 10,
}

const activityPersona: React.CSSProperties = {
  color: '#9B7FD4',
  fontFamily: 'monospace',
  flexShrink: 0,
  minWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const activityResult: React.CSSProperties = {
  color: '#A0A0A0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

const expandBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 10,
  color: '#505050',
  textAlign: 'left',
  padding: '2px 0',
  marginTop: 2,
}

const commitList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginTop: 4,
  padding: '6px 8px',
  background: '#0A0A0A',
  borderRadius: 4,
}

const commitRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 10,
}

const commitDate: React.CSSProperties = {
  color: '#505050',
  fontFamily: 'monospace',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const commitSummary: React.CSSProperties = {
  color: '#C0C0C0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const deployPill: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#22C55E',
  background: '#0A2A0A',
  border: '1px solid #22C55E30',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const emptyWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  color: '#3A3A3A',
  padding: '40px 20px',
}

const emptyIcon: React.CSSProperties = {
  fontSize: 32,
  color: '#2A2A2A',
}

const emptyText: React.CSSProperties = {
  fontSize: 13,
  color: '#505050',
  textAlign: 'center',
  lineHeight: 1.5,
}

