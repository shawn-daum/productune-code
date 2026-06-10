/**
 * TicketDetailTab — T-016 · A7
 *
 * Main-pane peer tab (type: ticket-detail). Opens via ticket-open intent
 * (cmd+p or Tickets-tab row click). Read-only viewer — no edit affordance.
 *
 * Regions (per docs/designer/archive/v0.5/T-003-a7-flow.md §2):
 *   §2.0 Header  — breadcrumb + ticket ID + title + status pill + read-only marker
 *   §2a  KR body — md-* recipes via MdRenderer (## Request (KR) section)
 *   §2b  DispatchProgress — pipeline lane (po→designer→developer→qa→user, done/
 *        current/upcoming, derived from frontmatter) + derived next-action
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
  User,
  UserCheck,
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

// Pipeline stage — derived from ticket frontmatter (status/assignee/qa_status),
// NOT from runtime persona_sessions. The ticket-detail view shows ticket facts,
// not live session liveness.
type PipelineStage = 'done' | 'current' | 'upcoming' | 'blocked'

interface PipelineNode {
  // 'user' (idx 4) = the human reviewer stage — NOT a persona; rendered with a
  // lucide icon in a neutral accent instead of a persona-hued dot (§4.c).
  id: 'po' | 'designer' | 'developer' | 'qa' | 'user'
  label: string
  color: string   // CSS hex — matches --persona-* tokens (unused for 'user')
  stage: PipelineStage
  qaMeta?: string  // attached to qa node only (qa_status · loops N)
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

// §4.c: 5-node lane — po → designer → developer → qa → user. The four personas
// are agent-worked stages; 'user' is the human review stage (rendered distinctly).
const PIPELINE_ORDER: Array<{ id: PipelineNode['id']; label: string }> = [
  { id: 'po',         label: 'PO' },
  { id: 'designer',   label: 'designer' },
  { id: 'developer',  label: 'developer' },
  { id: 'qa',         label: 'qa' },
  { id: 'user',       label: 'user' },
]

const USER_IDX = 4        // user = idx 4 (human reviewer)
const QA_IDX = 3          // qa = idx 3
const DEVELOPER_IDX = 2

// Derive the 5-stage pipeline (po → designer → developer → qa → user) purely
// from ticket frontmatter. §4.c status→stage mapping (status evaluated BEFORE
// assignee; supersedes §4.b's single qaCurrent flag):
//   review      → qa CURRENT, developer done, user upcoming.
//   user-verify → qa DONE, user CURRENT (qa has handed off to the human reviewer).
//   done        → all 5 done.  abandoned → all ghosted.  blocked → current node
//   gets the blocked variant.  Otherwise current = assignee stage. The user node
//   stays upcoming until qa is done.
function buildPipeline(
  status: string | undefined,
  assignee: string | undefined,
  qaStatus: string | undefined,
  qaLoops: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): PipelineNode[] {
  const assigneePersona = assignee?.replace('pdt-', '')
  const assigneeIdx = PIPELINE_ORDER.findIndex((p) => p.id === assigneePersona)

  // ── Resolve current index + flags from status first, assignee second ──────
  const allDone = status === 'done'
  const abandoned = status === 'abandoned'
  const blocked = status === 'blocked'
  // §4.c: split §4.b's single qaCurrent into two branches.
  const reviewQa = status === 'review'        // under QA → qa current, user upcoming
  const userVerify = status === 'user-verify' // qa done → human reviewer current

  let currentIdx: number
  if (allDone) {
    currentIdx = PIPELINE_ORDER.length  // beyond user → every stage done
  } else if (reviewQa) {
    currentIdx = QA_IDX                  // qa current, developer done, user upcoming
  } else if (userVerify) {
    currentIdx = USER_IDX                // ★ §4.c: user current, qa done
  } else if (assigneeIdx >= 0) {
    currentIdx = assigneeIdx             // in-progress / blocked / todo w/ assignee
  } else if (status === 'in-progress') {
    currentIdx = DEVELOPER_IDX           // in-progress, assignee unknown → dev fallback
  } else {
    currentIdx = 0                       // todo / unassigned → po is current
  }

  const showQaMeta = !!qaStatus && qaStatus !== 'n/a'

  return PIPELINE_ORDER.map(({ id, label }, idx) => {
    let stage: PipelineStage
    if (abandoned) {
      stage = 'upcoming'  // visual ghost handled in the node view via abandoned flag
    } else if (idx < currentIdx) {
      stage = 'done'
    } else if (idx === currentIdx) {
      stage = blocked ? 'blocked' : 'current'
    } else {
      stage = 'upcoming'
    }

    // qa_status micro-label only when qa node is current/done (folded into the
    // qa node's label slot). review/user-verify naturally surface it.
    let qaMeta: string | undefined
    if (id === 'qa' && showQaMeta && (stage === 'current' || stage === 'done' || stage === 'blocked')) {
      qaMeta = t('workspace.ticketDetail.qaMeta', {
        status: qaStatus,
        loops: qaLoops ?? 0,
      })
    }

    return {
      id,
      label,
      color: PERSONA_COLORS[id] ?? '#505050',
      stage,
      qaMeta,
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TicketDetailTab({ props: tabProps }: Props) {
  const { t } = useTranslation()
  const ticketId = typeof tabProps?.ticketId === 'string' ? tabProps.ticketId : ''
  const project = useWorkspace((s) => s.project)

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
  // Pipeline stages are derived from ticket frontmatter only (no runtime
  // persona_sessions / current_task — those are session signals, out of scope
  // for a ticket-fact view).
  const pipeline = buildPipeline(status, assignee, qaStatus, qaLoops, t)
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

                {/* Pipeline lane — single non-redundant progress row.
                    po → designer → developer → qa → user with done/current/upcoming. */}
                <PipelineLane nodes={pipeline} abandoned={status === 'abandoned'} t={t} />

                {/* Next-action (derived, informational, no action button).
                    §4.b #5: space-between — left arrow + Next text, right pill. */}
                <div style={nextActionRow}>
                  <span style={naLeft}>
                    <span style={{ color: statusColor(status), flexShrink: 0, display: 'inline-flex' }}>
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                    <span style={naNextLabel}>{t('workspace.ticketDetail.nextLabel')}</span>
                    <span style={naText}>{nextAction}</span>
                  </span>
                  {status && (
                    <span style={naStatusPill}>status: {status}</span>
                  )}
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

// ── PipelineLane sub-component ────────────────────────────────────────────────
// Horizontal po → designer → developer → qa → user lane. Persona nodes are a dot
// + name + state label; the user node uses a lucide icon (§4.c). Connectors
// between nodes reflect the departing node's stage.

const STATUS_BLOCKED_COLOR = '#E04040'

// state label keys — bound to nodes only for current/blocked (see §4.b #3/#6).
// done/upcoming stay quiet visually but the keys feed the dot aria-label.
const STAGE_LABEL_KEY: Record<PipelineStage, string> = {
  done:     'workspace.ticketDetail.stageDone',
  current:  'workspace.ticketDetail.stageCurrent',
  upcoming: 'workspace.ticketDetail.stageUpcoming',
  blocked:  'workspace.ticketDetail.stageBlocked',
}

function PipelineLane({
  nodes,
  abandoned,
  t,
}: {
  nodes: PipelineNode[]
  abandoned: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div style={laneWrap} role="list" aria-label="pipeline progress">
      {nodes.map((node, idx) => {
        const isLast = idx === nodes.length - 1
        // The connector that LEAVES this node is solid persona-color only when
        // this node is done (we've moved past it). Otherwise dashed border.
        // Abandoned → always neutral dashed.
        const connectorDone = !abandoned && node.stage === 'done'
        return (
          <PipelineNodeView
            key={node.id}
            node={node}
            t={t}
            isLast={isLast}
            connectorDone={connectorDone}
            abandoned={abandoned}
          />
        )
      })}
    </div>
  )
}

function PipelineNodeView({
  node,
  t,
  isLast,
  connectorDone,
  abandoned,
}: {
  node: PipelineNode
  t: (key: string, options?: Record<string, unknown>) => string
  isLast: boolean
  connectorDone: boolean
  abandoned: boolean
}) {
  const { id, label, color, stage, qaMeta } = node
  const isUser = id === 'user'
  const isDone = stage === 'done'
  const isCurrent = stage === 'current'
  const isBlocked = stage === 'blocked'
  // §4.b #3/#6: state label shown on current/blocked only; done & upcoming quiet.
  const showStateLabel = isCurrent || isBlocked
  const ringColor = isBlocked ? STATUS_BLOCKED_COLOR : color

  // §4.b #2: 8px dot. filled persona color for done/current; filled blocked
  // color for blocked; outline empty circle for upcoming. current/blocked add
  // a 2px ring (color-mix 40%) — replaces the baseline-skewing underline.
  let dotStyle: React.CSSProperties
  if (abandoned) {
    dotStyle = {
      ...laneDot,
      background: 'transparent',
      border: '1.5px solid var(--text-disabled, #3A3A3A)',
    }
  } else if (isDone || isCurrent) {
    dotStyle = { ...laneDot, background: color, border: `1px solid ${color}` }
  } else if (isBlocked) {
    dotStyle = { ...laneDot, background: STATUS_BLOCKED_COLOR, border: `1px solid ${STATUS_BLOCKED_COLOR}` }
  } else {
    dotStyle = { ...laneDot, background: 'transparent', border: '1.5px solid var(--border-default, #2A2A2A)' }
  }
  if (!abandoned && (isCurrent || isBlocked)) {
    dotStyle.boxShadow = `0 0 0 2px color-mix(in oklab, ${ringColor} 40%, transparent)`
  }

  // §4.b #3: persona name — current semibold + emphasis; blocked semibold +
  // primary; done secondary medium; upcoming faint regular. (Protected literals.)
  const nameStyle: React.CSSProperties = {
    ...laneName,
    color: abandoned
      ? 'var(--text-disabled, #3A3A3A)'
      : isCurrent
        ? 'var(--text-emphasis, #F0F0F0)'
        : isBlocked
          ? 'var(--text-primary, #E8E8EA)'
          : isDone
            ? 'var(--text-secondary, #C8C8CC)'
            : 'var(--text-faint, #505050)',
    fontWeight: isCurrent || isBlocked ? 600 : isDone ? 500 : 400,
  }

  const stateStyle: React.CSSProperties = {
    ...laneState,
    color: isBlocked
      ? STATUS_BLOCKED_COLOR
      : 'var(--text-secondary, #A0A0A0)',
  }

  // qa micro-meta folds into the state-label slot of the qa node.
  const stateText = showStateLabel ? t(STAGE_LABEL_KEY[stage]) : undefined
  const ariaState = abandoned ? 'abandoned' : stage

  // §4.c: the user node is a human-reviewer stage — render a lucide icon in a
  // neutral accent (NOT a --persona-* hue), keeping the same blink convergence.
  // UserCheck for current/done, User for upcoming/abandoned.
  let marker: React.ReactNode
  if (isUser) {
    // Neutral accent — NOT a --persona-* hue. The project --accent currently
    // resolves to the po hue (#8B5CF6), so we use the --text-emphasis tone for
    // the current state to keep the user node visually distinct from personas
    // (§4.c #2: persona hue must not be reused for the human-reviewer node).
    const userColor = abandoned
      ? 'var(--text-disabled, #3A3A3A)'
      : isCurrent
        ? 'var(--text-emphasis, #F0F0F0)'
        : isDone
          ? 'var(--text-secondary, #C8C8CC)'
          : 'var(--border-default, #2A2A2A)'
    const UserIcon = (isCurrent || isDone) && !abandoned ? UserCheck : User
    marker = (
      <span
        style={{ ...laneIcon, color: userColor }}
        className={isCurrent && !abandoned ? 'pdt-persona-blink' : undefined}
        aria-label={`${label} ${ariaState}`}
      >
        <UserIcon size={14} strokeWidth={2} />
      </span>
    )
  } else {
    marker = (
      <span
        style={dotStyle}
        className={isCurrent && !abandoned ? 'pdt-persona-blink' : undefined}
        aria-label={`${label} ${ariaState}`}
      />
    )
  }

  return (
    <>
      <div style={laneNode} role="listitem">
        {marker}
        <span style={nameStyle}>{label}</span>
        {stateText && <span style={stateStyle}>{stateText}</span>}
        {qaMeta && <span style={qaMicro}>{qaMeta}</span>}
      </div>
      {!isLast && (
        <span
          style={{
            ...laneConnector,
            ...(connectorDone
              ? { borderTop: `1px solid ${color}` }
              : { borderTop: '1px dashed var(--border-default, #2A2A2A)' }),
          }}
          aria-hidden="true"
        />
      )}
    </>
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

// Pipeline lane — single horizontal progress row (po → designer → developer → qa)
const laneWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 4,
  paddingTop: 12,
  borderTop: '1px solid #1A1A1A',
}

const laneNode: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  minWidth: 64,
}

const laneDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 'var(--radius-full, 9999px)',
  boxSizing: 'border-box',
  flexShrink: 0,
}

// §4.c: user-node marker — lucide icon box. Sits in the same dot-row slot as the
// 8px persona dots (8px tall, icon overflows visible) so the connector that
// enters the user node stays aligned to the marker row.
const laneIcon: React.CSSProperties = {
  width: 14,
  height: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

// label recipe
const laneName: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.3,
}

// metadata recipe
const laneState: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.02em',
}

// qa_status micro-label, attached under qa node only
const qaMicro: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.02em',
  color: 'var(--text-muted, #707070)',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  textAlign: 'center',
}

// connector between nodes — aligned to the dot row (dot vertical center), not
// the label row, so node height differences never bend the line (§4.b #2).
// laneWrap aligns children flex-start; dot is 8px → its center is 4px down.
const laneConnector: React.CSSProperties = {
  flex: 1,
  alignSelf: 'flex-start',
  marginTop: 4,  // align with 8px dot center
  minWidth: 16,
}

// Next-action line (derived, informational — NO action button).
// §4.b #5: space-between — left = arrow + Next + derived text, right = status pill.
const nextActionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingTop: 12,
  borderTop: '1px solid #1A1A1A',
}

const naLeft: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

// "Next —" metadata recipe, muted
const naNextLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.02em',
  color: 'var(--text-muted, #707070)',
  flexShrink: 0,
}

// derived next-action text — label recipe, secondary, medium
const naText: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #C8C8CC)',
  fontWeight: 500,
  lineHeight: 1.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// neutral status pill (§8.2 neutral variant): subpanel bg, muted, uppercase
const naStatusPill: React.CSSProperties = {
  flexShrink: 0,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted, #707070)',
  background: 'var(--surface-subpanel, #1F1F1F)',
  border: '1px solid #242424',
  borderRadius: 20,
  padding: '2px 10px',
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
