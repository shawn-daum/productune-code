/**
 * HistoryPane — Project History tab sidebar (T-349, spec §2.2).
 *
 * The activity-bar's 2nd slot (formerly Artifacts) now hosts the closed-version
 * timeline. "Closed" SoT = a git tag exists (spec §2.4) — retro/ticket status
 * are secondary. Rows are a compressed list; clicking one opens a
 * `history-detail:<v>` tab in the main pane (same interaction model as the
 * legacy past-versions list).
 *
 * In-progress (current) version is NOT listed — it shows as a faint banner that
 * routes to the Project tab, so "closed" keeps a single meaning.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, RefreshCw, AlertTriangle } from 'lucide-react'
import type { Project, PoState } from '../../lib/types'
import { useWorkspace, paneTreeUtil } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'
import { isPrdtPoState } from '../../lib/phase-mapping'
import { VERSION_RE, countTicketStatuses } from '../../lib/historyData'
import MetaTrackSection from './MetaTrackSection'

interface Props {
  project: Project
  poState: PoState | null
}

interface ClosedVersion {
  version: string
  date: string
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

export default function HistoryPane({ project, poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const panes = useWorkspace((s) => s.panes)
  const activePaneId = useWorkspace((s) => s.activePaneId)
  const activeTabId = useMemo(
    () => paneTreeUtil.findLeaf(panes, activePaneId)?.activeTabId ?? null,
    [panes, activePaneId],
  )
  const { tickets } = useTicketScan(project.projectDir)

  const [closed, setClosed] = useState<ClosedVersion[]>([])
  const [loadState, setLoadState] = useState<LoadState>('idle')

  // Current (in-progress) version: prdt bridges it into `version`; legacy uses
  // `current_version`.
  const currentVersion = isPrdtPoState(poState)
    ? poState?.version ?? null
    : poState?.current_version ?? null

  const load = useCallback(() => {
    const api = (window as any).api
    if (!api?.gitListTags) { setLoadState('error'); return }
    setLoadState('loading')
    api
      .gitListTags(project.projectDir)
      .then((tags: Array<{ name: string; date: string }>) => {
        const versions = (tags ?? [])
          .filter((tg) => VERSION_RE.test(tg.name))
          .map((tg) => ({ version: tg.name, date: tg.date }))
        setClosed(versions)
        setLoadState('done')
      })
      .catch(() => setLoadState('error'))
  }, [project.projectDir])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('history:reload', handler)
    return () => window.removeEventListener('history:reload', handler)
  }, [load])

  // Ticket counts per version (from the fs scan). v1.0-style commit-only
  // versions simply have no entry → treated as 0.
  const countsByVersion = useMemo(() => {
    const map = new Map<string, ReturnType<typeof countTicketStatuses>>()
    const byVersion = new Map<string, Array<string | undefined>>()
    for (const tk of tickets) {
      const v = tk.version ?? ''
      if (!v) continue
      if (!byVersion.has(v)) byVersion.set(v, [])
      byVersion.get(v)!.push(tk.status as string | undefined)
    }
    for (const [v, statuses] of byVersion) map.set(v, countTicketStatuses(statuses))
    return map
  }, [tickets])

  const showBanner =
    currentVersion && !closed.some((c) => c.version === currentVersion)

  const goProject = () =>
    window.dispatchEvent(new CustomEvent('activity:select', { detail: { icon: 'project' } }))

  const openDetail = (cv: ClosedVersion) => {
    openTab(
      `history-detail:${cv.version}`,
      'history-detail',
      { versionId: cv.version, closedDate: cv.date },
      cv.version,
    )
  }

  // ── Error — git unreadable (non-git project / IPC failure) ──────────────────
  if (loadState === 'error') {
    return (
      <div style={errorWrap}>
        <div style={errorBanner}>
          <AlertTriangle size={13} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={errorText}>{t('workspace.history.gitTagLoadError')}</div>
            <button style={retryBtn} onClick={load}>
              <RefreshCw size={11} />
              {t('common.retry')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {showBanner && (
        <button style={banner} onClick={goProject} type="button">
          <span style={bannerLabel}>
            {t('workspace.history.inProgressBanner', { version: currentVersion })}
          </span>
          <span style={bannerGo}>→</span>
        </button>
      )}

      {/* Empty — no closed versions yet (first version in progress). §2.5 */}
      {loadState === 'done' && closed.length === 0 ? (
        <div style={emptyPane}>
          <History size={32} style={{ color: '#505050', marginBottom: 12 }} strokeWidth={1.5} />
          <div style={emptyHeadline}>{t('workspace.history.emptyHeadline')}</div>
          <div style={emptyHelper}>{t('workspace.history.emptyHelper')}</div>
          <button style={emptyCta} onClick={goProject} type="button">
            {t('workspace.history.emptyCta')}
          </button>
        </div>
      ) : (
        <div style={list}>
          {closed.map((cv) => {
            const counts = countsByVersion.get(cv.version)
            const isSelected = activeTabId === `history-detail:${cv.version}`
            return (
              <HistoryRow
                key={cv.version}
                cv={cv}
                counts={counts}
                selected={isSelected}
                ticketsLabel={ticketCountLabel(t, counts)}
                onClick={() => openDetail(cv)}
              />
            )
          })}
        </div>
      )}

      {/* Meta commit timeline (T-367) — same core API as `prdt meta log`;
          self-hides when the project has no meta split. prdt projects only
          (T-370 C1): the meta track is a prdt institution — a legacy project
          must not surface (or invite) any meta-split state. */}
      {isPrdtPoState(poState) && <MetaTrackSection projectDir={project.projectDir} />}
    </div>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

function ticketCountLabel(
  t: (k: string, o?: Record<string, unknown>) => string,
  counts: ReturnType<typeof countTicketStatuses> | undefined,
): string {
  if (!counts || counts.total === 0) return t('workspace.history.noTicketsShort')
  return t('workspace.history.ticketCount', { count: counts.total })
}

interface RowProps {
  cv: { version: string; date: string }
  counts: ReturnType<typeof countTicketStatuses> | undefined
  selected: boolean
  ticketsLabel: string
  onClick: () => void
}

function HistoryRow({ cv, selected, ticketsLabel, onClick }: RowProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      style={rowStyle(selected, hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      type="button"
      aria-current={selected ? 'true' : undefined}
    >
      <div style={rowTop}>
        <span style={vidPill}>{cv.version}</span>
        <span style={closedPill}>closed</span>
      </div>
      <div style={rowSub}>
        {(cv.date || '—')} · {ticketsLabel}
      </div>
    </button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const banner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  margin: '8px 8px 4px',
  padding: '8px 10px',
  fontSize: 11,
  color: '#707070',
  border: '1px dashed #2A2A2A',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  width: 'calc(100% - 16px)',
}

const bannerLabel: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const bannerGo: React.CSSProperties = {
  color: '#8B5CF6',
  fontSize: 11,
  flexShrink: 0,
}

const list: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

function rowStyle(selected: boolean, hovered: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 12px',
    paddingLeft: selected ? 10 : 12,
    borderBottom: '1px solid #1A1A1A',
    borderLeft: selected ? '2px solid #8B5CF6' : '2px solid transparent',
    background: selected ? '#120A2A' : hovered ? '#1A1A1A' : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.1s',
  }
}

const rowTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const vidPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#F0F0F0',
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  padding: '1px 6px',
}

const closedPill: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#34D399',
  border: '1px solid #34D39959',
  borderRadius: 3,
  padding: '1px 5px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const rowSub: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  paddingLeft: 2,
}

const emptyPane: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '32px 20px',
}

const emptyHeadline: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#C8C8CC',
  marginBottom: 6,
}

const emptyHelper: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  lineHeight: 1.4,
  marginBottom: 16,
}

const emptyCta: React.CSSProperties = {
  fontSize: 12,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  padding: '7px 16px',
  cursor: 'pointer',
}

const errorWrap: React.CSSProperties = {
  flex: 1,
  padding: 16,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #FBBF24',
  borderRadius: 4,
  padding: '10px 12px',
}

const errorText: React.CSSProperties = {
  fontSize: 12,
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
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
