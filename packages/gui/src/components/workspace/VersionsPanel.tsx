import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import type { PoState, Version, Phase } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'
import { useWorkspace, paneTreeUtil } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'

interface Props {
  poState: PoState | null
}

function tabIdForVersion(id: string): string {
  return `version-detail:${id}`
}

export default function VersionsPanel({ poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const project = useWorkspace((s) => s.project)
  const { tickets: scannedTickets } = useTicketScan(project?.projectDir ?? null)
  // Highlight any version whose detail tab exists in any pane (T-P4-046:
  // sidebar selection is derived from open tabs rather than a separate slice).
  const openTabIds = useWorkspace((s) => {
    const ids = new Set<string>()
    for (const pid of paneTreeUtil.collectLeafIds(s.panes)) {
      const leaf = paneTreeUtil.findLeaf(s.panes, pid)
      if (leaf) for (const tab of leaf.tabs) ids.add(tab.id)
    }
    return ids
  })

  const currentVersionId = poState?.current_version
  const currentPhaseNum = poState?.current_phase
  const versions = poState?.versions ?? []
  const versionsCapped = versions.length >= 5

  const active = versions.find((v) => v.id === currentVersionId) ?? null
  const past = versions
    .filter((v) => v.id !== currentVersionId)
    .slice()
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''))

  const ticketsByVersion = useMemo(() => {
    const map = new Map<string, number>()
    // v2: derive from fs-scan instead of past_tickets[]. count current_task once.
    const ctVer = poState?.current_version
    const ctId = poState?.current_task?.ticket_id
    if (ctId && ctVer) map.set(ctVer, (map.get(ctVer) ?? 0) + 1)
    for (const tk of scannedTickets) {
      if (!tk.version) continue
      if (ctId && tk.ticket_id === ctId) continue
      map.set(tk.version, (map.get(tk.version) ?? 0) + 1)
    }
    return map
  }, [scannedTickets, poState])

  // Tickets with no version assignment (T-P4-086 sub-e)
  const unassignedCount = useMemo(
    () => scannedTickets.filter((tk) => !tk.version).length,
    [scannedTickets],
  )

  const onClick = (id: string) => {
    openTab(tabIdForVersion(id), 'version-detail', { versionId: id }, id)
  }
  const isSelected = (id: string) => openTabIds.has(tabIdForVersion(id))

  return (
    <div style={panel}>
      <div style={sectionLabel}>{t('workspace.versions.current')}</div>
      {active ? (
        <ActiveVersionCard
          version={active}
          phaseNum={currentPhaseNum}
          ticketsDone={ticketsByVersion.get(active.id) ?? 0}
          selected={isSelected(active.id)}
          onClick={() => onClick(active.id)}
        />
      ) : (
        <div style={emptyHint}>{t('workspace.versions.noActive')}</div>
      )}

      <div style={{ ...sectionLabel, marginTop: 18 }}>
        {t('workspace.versions.past', { count: past.length })}
      </div>
      {past.length === 0 ? (
        <div style={emptyHint}>{t('workspace.versions.noPast')}</div>
      ) : (
        past.map((v) => (
          <PastVersionCard
            key={v.id}
            version={v}
            ticketsDone={ticketsByVersion.get(v.id) ?? 0}
            selected={isSelected(v.id)}
            onClick={() => onClick(v.id)}
          />
        ))
      )}

      {versionsCapped && (
        <div style={capFooter}>{t('workspace.versions.olderHint')}</div>
      )}

      {/* Unassigned bucket — T-P4-086 sub-e: null-version tickets */}
      {unassignedCount > 0 && (
        <div style={{ ...sectionLabel, marginTop: 18 }}>
          <span style={unassignedLabel}>{t('workspace.versions.unassigned')}</span>
          <span style={unassignedBadge}>{unassignedCount}</span>
        </div>
      )}
    </div>
  )
}

interface ActiveCardProps { version: Version; phaseNum: number | undefined; ticketsDone: number; selected: boolean; onClick: () => void }
function ActiveVersionCard({ version, phaseNum, ticketsDone, selected, onClick }: ActiveCardProps) {
  const { t } = useTranslation()
  const phaseLabel: Phase | '?' = (typeof phaseNum === 'number' && PHASE_NAMES[phaseNum]) || '?'
  return (
    <div
      style={selected ? cardActiveSelected : cardActive}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#8B5CF6'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#8B5CF633'
      }}
    >
      <div style={cardIdRow}>
        <span style={cardId}>{version.id}</span>
        <ChevronRight size={12} color="#8B5CF666" style={chevronStyle} />
      </div>
      <div style={cardLine}>
        {t('workspace.versions.phaseLabel')}
        <span style={cardLineValue}>{phaseLabel}{typeof phaseNum === 'number' ? ` (${phaseNum}/5)` : ''}</span>
      </div>
      <div style={cardLine}>
        <span style={cardLineValue}>{t('workspace.versions.ticketsDone', { count: ticketsDone })}</span>
      </div>
      {version.outcome?.north_star && (
        <div style={cardLineMuted}>★ {version.outcome.north_star}</div>
      )}
    </div>
  )
}

interface PastCardProps { version: Version; ticketsDone: number; selected: boolean; onClick: () => void }
function PastVersionCard({ version, ticketsDone, selected, onClick }: PastCardProps) {
  const { t } = useTranslation()
  const closed = version.ended_at ? version.ended_at.slice(0, 10) : '?'
  const observed = version.outcome?.observed_result
  const retro = version.outcome?.retrospective_path
  return (
    <div style={selected ? cardPastSelected : cardPast} onClick={onClick}>
      <div style={cardIdRow}>
        <div style={cardIdMuted}>{version.id}</div>
      </div>
      <div style={cardLineMuted}>{t('workspace.versions.closed', { date: closed })}</div>
      <div style={cardLineMuted}>{t('workspace.versions.tickets', { count: ticketsDone })}</div>
      {version.outcome?.north_star && (
        <div style={cardLineMuted}>★ {version.outcome.north_star}</div>
      )}
      {observed && <div style={cardLineMuted}>→ {observed}</div>}
      {retro && (
        <div style={cardLink} title={retro}>{t('workspace.versions.retro')}</div>
      )}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 12px 12px',
  overflowY: 'auto',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#505050',
  fontWeight: 600,
  marginBottom: 8,
}

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  padding: '8px 0',
}

const cardActive: React.CSSProperties = {
  background: '#1A1030',
  border: '1px solid #8B5CF633',
  borderRadius: 6,
  padding: '12px 14px',
  marginBottom: 6,
  cursor: 'pointer',
  transition: 'border-color 0.12s',
}

const cardActiveSelected: React.CSSProperties = {
  ...{
    background: '#1A1030',
    border: '1px solid #8B5CF6',
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 6,
    cursor: 'pointer',
  },
}

const cardPast: React.CSSProperties = {
  background: '#0F0F0F',
  border: '1px solid #1A1A1A',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 6,
  cursor: 'pointer',
  transition: 'border-color 0.12s',
}

const cardPastSelected: React.CSSProperties = {
  background: '#161616',
  border: '1px solid #505050',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 6,
  cursor: 'pointer',
}

const cardIdRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 4,
}

const chevronStyle: React.CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  transition: 'color 0.12s',
}

const cardId: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#8B5CF6',
  marginBottom: 4,
}

const cardIdMuted: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#A0A0A0',
  marginBottom: 4,
}

const cardLine: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  lineHeight: 1.5,
}

const cardLineValue: React.CSSProperties = {
  color: '#F0F0F0',
  fontWeight: 600,
  marginLeft: 4,
}

const cardLineMuted: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.5,
}

const cardLink: React.CSSProperties = {
  fontSize: 11,
  color: '#8B5CF6',
  marginTop: 4,
  cursor: 'pointer',
  userSelect: 'none',
}

const capFooter: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: '1px dashed #1A1A1A',
  fontSize: 10,
  color: '#505050',
  fontStyle: 'italic',
  lineHeight: 1.4,
}

// Unassigned bucket — T-P4-086: neutral muted styling (non-canonical, no active highlight)
const unassignedLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted, #3A3A3A)',
  fontWeight: 600,
}

const unassignedBadge: React.CSSProperties = {
  marginLeft: 6,
  fontSize: 9,
  fontFamily: 'monospace',
  color: 'var(--text-muted, #3A3A3A)',
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  padding: '0 4px',
}

