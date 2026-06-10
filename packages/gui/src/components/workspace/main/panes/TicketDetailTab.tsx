/**
 * TicketDetailTab — T-016 · A7
 *
 * Main-pane peer tab (type: ticket-detail). Opens via ticket-open intent
 * (cmd+p or Tickets-tab row click). Read-only viewer — no edit affordance.
 *
 * Regions (per docs/designer/archive/v0.5/T-003-a7-flow.md §2):
 *   §2.0 Header  — breadcrumb + ticket ID + title + status pill + read-only marker
 *   §2a  KR body — md-* recipes via MdRenderer (## Request (KR) section)
 *   §2b  DispatchProgress — persona rail + derived next-action (informational)
 *
 * Design tokens: v0.4 design-system.md + T-006 Option B persona hues.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  ChevronLeft,
  Lock,
  Loader2,
  AlertOctagon,
  Activity,
  Info,
  ArrowRight,
} from 'lucide-react'
import MdRenderer from '../../chat/MdRenderer'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

interface TicketData {
  frontmatter: Record<string, unknown>
  body: string
  krBody: string | null
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// Persona session state from po-state.json persona_sessions (informational)
type PersonaRailState = 'active' | 'idle' | 'off'

interface PersonaRailEntry {
  id: 'po' | 'designer' | 'developer' | 'qa'
  label: string
  color: string   // CSS hex — T-006 Option B
  railState: PersonaRailState
  stateLabel: string
}

// ── Status pill helpers (§8.2 status variant) ────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'todo':         '#505050',
  'in-progress':  '#8B5CF6',
  'review':       '#E0B040',
  'user-verify':  '#38BDF8',
  'done':         '#34D399',
  'blocked':      '#E04040',
  'abandoned':    '#3A3A3A',
}

const STATUS_LABELS: Record<string, string> = {
  'todo':         'todo',
  'in-progress':  'in-progress',
  'review':       'review',
  'user-verify':  'user-verify',
  'done':         'done',
  'blocked':      'blocked',
  'abandoned':    'abandoned',
}

function statusColor(status: string | undefined): string {
  return STATUS_COLORS[status ?? ''] ?? '#505050'
}

// ── Next-action derivation (docs/designer/archive/v0.5/T-003-a7-flow.md §2b) ──

function deriveNextAction(
  status: string | undefined,
  assignee: string | undefined,
  qaStatus: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const personaName = assignee?.replace('pdt-', '') ?? t('workspace.ticketDetail.defaultAssignee')

  switch (status) {
    case 'blocked':
      return t('workspace.ticketDetail.statusBlocked')
    case 'review':
      return t('workspace.ticketDetail.statusReview', { persona: personaName })
    case 'user-verify':
      return t('workspace.ticketDetail.statusUserVerify')
    case 'in-progress':
      if (qaStatus && qaStatus !== 'n/a' && qaStatus === 'pending') {
        return t('workspace.ticketDetail.statusQaPending')
      }
      return t('workspace.ticketDetail.statusInProgress', { persona: personaName })
    case 'todo':
      return t('workspace.ticketDetail.statusTodo', { persona: personaName })
    case 'done':
      return t('workspace.ticketDetail.statusDone')
    case 'abandoned':
      return t('workspace.ticketDetail.statusAbandoned')
    default:
      return assignee
        ? t('workspace.ticketDetail.statusWaiting', { persona: personaName })
        : t('workspace.ticketDetail.unassigned')
  }
}

// ── Persona rail builder ──────────────────────────────────────────────────────

// T-006 Option B hex values
const PERSONA_COLORS: Record<string, string> = {
  po:         '#8B5CF6',
  designer:   '#FB923C',
  developer:  '#38BDF8',
  qa:         '#34D399',
}

function buildRail(
  assignee: string | undefined,
  personaSessions: Record<string, unknown> | null,
  t: (key: string, options?: Record<string, unknown>) => string,
  viewedTicketId: string,
  currentTaskTicketId: string | undefined,
  currentTaskAssignee: string | undefined,
): PersonaRailEntry[] {
  const personas: Array<{ id: 'po' | 'designer' | 'developer' | 'qa'; label: string }> = [
    { id: 'po',         label: 'PO' },
    { id: 'designer',   label: 'designer' },
    { id: 'developer',  label: 'developer' },
    { id: 'qa',         label: 'qa' },
  ]

  // Active = current_task matches this ticket AND this persona is the assignee
  const isCurrentTicket = !!viewedTicketId && viewedTicketId === currentTaskTicketId
  const isActivePersona = (id: string) =>
    isCurrentTicket && currentTaskAssignee?.replace('pdt-', '') === id

  return personas.map(({ id, label }) => {
    const hasSession = personaSessions
      ? Object.keys(personaSessions).some((k) => k.includes(id))
      : false

    let railState: PersonaRailState
    let stateLabel: string

    if (isActivePersona(id)) {
      railState = 'active'
      stateLabel = t('workspace.ticketDetail.railActive')
    } else if (hasSession) {
      railState = 'idle'
      stateLabel = t('workspace.ticketDetail.railIdle')
    } else {
      railState = 'off'
      stateLabel = '—'
    }

    return {
      id,
      label,
      color: PERSONA_COLORS[id] ?? '#505050',
      railState,
      stateLabel,
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TicketDetailTab({ props: tabProps }: Props) {
  const { t } = useTranslation()
  const ticketId = typeof tabProps?.ticketId === 'string' ? tabProps.ticketId : ''
  const project = useWorkspace((s) => s.project)
  const poState = useWorkspace((s) => s.poState)

  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [showFullSpec, setShowFullSpec] = useState(true)

  const load = useCallback(() => {
    if (!ticketId || !project?.projectDir) {
      setLoadState('error')
      return
    }
    setLoadState('loading')
    const api = (window as any).api
    api
      .ticketsRead(project.projectDir, ticketId)
      .then((data: TicketData | null) => {
        if (!data) {
          setLoadState('error')
          return
        }
        setTicket(data)
        setLoadState('done')
      })
      .catch(() => setLoadState('error'))
  }, [ticketId, project?.projectDir])

  useEffect(() => {
    load()
  }, [load])

  const fm = ticket?.frontmatter ?? {}
  const status = typeof fm.status === 'string' ? fm.status : undefined
  const assignee = typeof fm.assignee === 'string' ? fm.assignee : undefined
  const slug = typeof fm.slug === 'string' ? fm.slug : undefined
  const title = typeof fm.title === 'string' ? fm.title : ticketId
  const qaStatus = typeof fm.qa_status === 'string' ? fm.qa_status : undefined
  const qaLoops = typeof fm.qa_loops === 'number' ? fm.qa_loops : undefined
  const phase = fm.phase !== undefined ? String(fm.phase) : undefined
  const version = typeof fm.version === 'string' ? fm.version : undefined

  const sColor = statusColor(status)

  // ── DispatchProgress data ──────────────────────────────────────────────────
  // persona_sessions is not typed in PoState; read from raw poState safely
  const personaSessions = poState
    ? ((poState as any).persona_sessions as Record<string, unknown> | null | undefined) ?? null
    : null
  const rail = buildRail(
    assignee,
    personaSessions,
    t,
    ticketId,
    poState?.current_task?.ticket_id,
    poState?.current_task?.assignee_persona,
  )
  const nextAction = deriveNextAction(status, assignee, qaStatus, t)

  // ── Breadcrumb → open Tickets tab ─────────────────────────────────────────
  const openTab = useWorkspace((s) => s.openTab)
  const handleBreadcrumb = useCallback(() => {
    openTab('ticket-review', 'ticket-review', {}, 'Tickets')
  }, [openTab])

  // ── KR body: prefer krBody, fallback to full body if no KR section found ──
  const krContent = ticket?.krBody ?? null
  // Full spec = entire body, shown in collapsible (§2 "Show full spec")
  const fullBody = ticket?.body ?? ''

  return (
    <div style={wrap}>

      {/* ── Breadcrumb (§2.0 — §1.5.5 Escape) ─────────────────────────────── */}
      <div style={breadcrumbBar}>
        <button style={crumbBack} onClick={handleBreadcrumb} title={t('workspace.ticketDetail.crumbBack')}>
          <ChevronLeft size={14} style={{ color: '#A0A0A0', flexShrink: 0 }} />
          <span>{t('workspace.ticketDetail.crumbTickets')}</span>
        </button>
        <span style={crumbSep}>/</span>
        <span style={crumbCur}>{ticketId}</span>
      </div>

      {/* ── Scroll body ─────────────────────────────────────────────────────── */}
      <div style={scrollBody}>
        <div style={inner}>

          {/* Loading */}
          {loadState === 'loading' && (
            <div style={centerState}>
              <Loader2 size={20} style={{ color: '#505050' }} className="pdt-spin" />
            </div>
          )}

          {/* Error */}
          {loadState === 'error' && (
            <div style={errorBanner}>
              <AlertOctagon size={14} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={errorText}>
                  {t('workspace.ticketDetail.loadError')}
                </div>
                <button style={retryBtn} onClick={load}>{t('common.retry')}</button>
              </div>
            </div>
          )}

          {/* Done */}
          {loadState === 'done' && ticket && (
            <>
              {/* §2.0 Header region */}
              <header style={dhWrap}>
                <div style={dhTopRow}>
                  <span style={dhTitle}>
                    {ticketId}{title && title !== ticketId ? `: ${title}` : ''}
                  </span>
                  {status && (
                    <span style={{
                      ...pillBase,
                      background: `color-mix(in oklab, ${sColor} 12%, transparent)`,
                      color: sColor,
                    }}>
                      {STATUS_LABELS[status] ?? status}
                    </span>
                  )}
                </div>
                <div style={dhMetaRow}>
                  {slug && (
                    <span>
                      <span style={{ color: '#707070' }}>slug</span>{' '}
                      <code style={monoCode}>{slug}</code>
                    </span>
                  )}
                  {slug && (version || phase) && <span style={{ color: '#505050' }}>·</span>}
                  {(version || phase) && (
                    <span style={{ color: '#A0A0A0' }}>
                      {phase ? `Phase ${phase}` : ''}{phase && version ? ' · ' : ''}{version ?? ''}
                    </span>
                  )}
                  {(slug || version || phase) && (
                    <span style={{ color: '#505050' }}>·</span>
                  )}
                  <span style={roMarker}>
                    <Lock size={12} style={{ flexShrink: 0 }} />
                    <span>{t('workspace.common.readOnly')}</span>
                  </span>
                </div>
              </header>

              {/* §2a KR body via MdRenderer (md-* recipes) */}
              {krContent ? (
                <div style={mdWrap}>
                  <MdRenderer text={krContent} />
                </div>
              ) : (
                <div style={noKrHint}>
                  <Info size={13} style={{ color: '#505050', flexShrink: 0 }} />
                  <span style={{ color: '#707070', fontSize: 12 }}>
                    {t('workspace.ticketDetail.noKrBody')}
                  </span>
                </div>
              )}

              {/* §2b DispatchProgress */}
              <section style={dispatchWrap} aria-label="dispatch progress">
                {/* Section header */}
                <div style={dpHead}>
                  <Activity size={15} style={{ color: '#707070', flexShrink: 0 }} />
                  <span style={dpTitle}>{t('workspace.ticketDetail.dispatchProgress')}</span>
                  <span style={dpRo}>
                    <Info size={11} style={{ flexShrink: 0 }} />
                    {t('workspace.ticketDetail.derivedReadOnly')}
                  </span>
                </div>

                {/* Ticket meta orientation */}
                <div style={dpMeta}>
                  {status && (
                    <span>
                      <span style={dpKey}>status</span>
                      <span style={dpVal}>{status}</span>
                    </span>
                  )}
                  {assignee && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={dpKey}>assignee</span>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: PERSONA_COLORS[assignee.replace('pdt-', '')] ?? '#505050',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={dpVal}>{assignee}</span>
                    </span>
                  )}
                  {qaStatus && qaStatus !== 'n/a' && (
                    <span>
                      <span style={dpKey}>qa_status</span>
                      <span style={dpVal}>{qaStatus}</span>
                      {qaLoops !== undefined && (
                        <span style={{ ...dpVal, marginLeft: 4 }}>(loops: {qaLoops})</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Persona rail (§8.6 PersonaPresenceBar pattern) */}
                <div style={railGrid}>
                  {rail.map((entry) => (
                    <PersonaCard key={entry.id} entry={entry} />
                  ))}
                </div>

                {/* Next-action (derived, informational, no action button) */}
                <div style={nextActionRow}>
                  <span style={{ color: statusColor(status), flexShrink: 0 }}>
                    <ArrowRight size={15} />
                  </span>
                  <span style={naText}>
                    {t('workspace.ticketDetail.nextLabel')} <strong style={{ color: '#F0F0F0', fontWeight: 600 }}>
                      {nextAction}
                    </strong>
                    {status && (
                      <span style={naTag}> (status: {status})</span>
                    )}
                  </span>
                </div>
              </section>

              {/* Collapsible full spec (§2 spec intent — "Show full spec") */}
              <div style={fullSpecSection}>
                <button
                  style={fullSpecToggle}
                  onClick={() => setShowFullSpec((v) => !v)}
                  aria-expanded={showFullSpec}
                >
                  <ArrowRight
                    size={13}
                    style={{
                      color: '#707070',
                      flexShrink: 0,
                      transform: showFullSpec ? 'rotate(90deg)' : 'none',
                      transition: '120ms',
                    }}
                  />
                  <span>{showFullSpec ? t('workspace.ticketDetail.hideFullSpec') : t('workspace.ticketDetail.showFullSpec')}</span>
                </button>
                {showFullSpec && (
                  <div style={fullSpecBody}>
                    <MdRenderer text={fullBody} />
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ── PersonaCard sub-component ─────────────────────────────────────────────────

function PersonaCard({ entry }: { entry: PersonaRailEntry }) {
  const { label, color, railState, stateLabel } = entry
  const isActive = railState === 'active'
  const isOff = railState === 'off'

  return (
    <div style={{
      ...personaCard,
      borderColor: isActive ? '#2A2A2A' : '#1A1A1A',
    }}>
      <div style={pTop}>
        <span
          style={{
            ...pDot,
            background: isOff ? '#707070' : color,
            opacity: isOff ? 0.5 : 1,
            // blink handled via className
          }}
          className={isActive ? 'pdt-persona-blink' : undefined}
        />
        <span style={{
          ...pName,
          color: isActive ? '#F0F0F0' : isOff ? '#A0A0A0' : '#E8E8EA',
          fontWeight: isActive ? 600 : 500,
        }}>
          {label}
        </span>
      </div>
      <span style={{
        ...pState,
        color: isActive ? color : isOff ? '#505050' : '#A0A0A0',
      }}>
        {stateLabel}
      </span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#141414',
}

// §2.0 breadcrumb (§1.5.5 Escape back path)
const breadcrumbBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 20px',
  fontSize: 11,
  color: '#A0A0A0',
  letterSpacing: '0.02em',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
}

const crumbBack: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  color: '#A0A0A0',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: '1px 4px',
  borderRadius: 3,
  fontSize: 11,
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
}

const crumbSep: React.CSSProperties = { color: '#505050' }

const crumbCur: React.CSSProperties = {
  color: '#C8C8CC',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const scrollBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 32px',
}

const inner: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
}

// §2.0 Header region
const dhWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingBottom: 16,
  borderBottom: '1px solid #1F1F1F',
  marginBottom: 20,
}

const dhTopRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

// heading-pane recipe (§4.6 --text-xl semibold tight)
const dhTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1.3,
  color: '#F0F0F0',
}

// §8.2 status pill
const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  borderRadius: 20,
  padding: '2px 10px',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const dhMetaRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 12,
  color: '#A0A0A0',
  letterSpacing: '0.02em',
}

const monoCode: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  color: '#C8C8CC',
  background: '#1A1A1A',
  padding: '1px 4px',
  borderRadius: 3,
}

// Lock + "읽기 전용" (§1.5.3 read-only marker)
const roMarker: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  color: '#707070',
  fontSize: 12,
}

// §2a KR body wrapper
const mdWrap: React.CSSProperties = {
  marginTop: 4,
}

const noKrHint: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 6,
  marginTop: 4,
  marginBottom: 8,
}

// Collapsible full spec
const fullSpecSection: React.CSSProperties = {
  marginTop: 20,
  borderTop: '1px solid #1A1A1A',
  paddingTop: 12,
}

const fullSpecToggle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  color: '#A0A0A0',
  fontSize: 12,
  padding: '3px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
}

const fullSpecBody: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: '1px solid #1A1A1A',
}

// §2b DispatchProgress
const dispatchWrap: React.CSSProperties = {
  marginTop: 24,
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 8,
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const dpHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const dpTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#F0F0F0',
}

const dpRo: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: '#707070',
  letterSpacing: '0.02em',
}

const dpMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  fontSize: 12,
  color: '#A0A0A0',
  letterSpacing: '0.02em',
}

const dpKey: React.CSSProperties = {
  color: '#707070',
  marginRight: 6,
}

const dpVal: React.CSSProperties = {
  color: '#C8C8CC',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

// Persona rail — 4-column grid (§8.6 PersonaPresenceBar)
const railGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid #1A1A1A',
}

const personaCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  padding: '8px 10px',
  borderRadius: 6,
  background: '#0A0A0A',
  border: '1px solid #1A1A1A',
}

const pTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const pDot: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: '50%',
  flexShrink: 0,
}

const pName: React.CSSProperties = {
  fontSize: 14,
  color: '#E8E8EA',
}

const pState: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.02em',
  paddingLeft: 17,  // 9px dot + 8px gap
}

// Next-action line (derived, informational — NO action button)
const nextActionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid #1A1A1A',
}

const naText: React.CSSProperties = {
  fontSize: 14,
  color: '#E8E8EA',
  lineHeight: 1.5,
}

const naTag: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  color: '#A0A0A0',
}

// Loading / error shared states
const centerState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 48,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #EF4444',
  borderRadius: 4,
  padding: '10px 12px',
  margin: '24px 0',
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8CC',
  lineHeight: 1.5,
}

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
