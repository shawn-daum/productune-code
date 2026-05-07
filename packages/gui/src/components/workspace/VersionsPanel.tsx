import { useTranslation } from 'react-i18next'
import type { PoState, Version, Phase } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'
import { useWorkspace, paneTreeUtil } from '../../store/workspace'

interface Props {
  poState: PoState | null
}

function tabIdForVersion(id: string): string {
  return `version-detail:${id}`
}

export default function VersionsPanel({ poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
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

  const active = versions.find((v) => v.id === currentVersionId) ?? null
  const past = versions
    .filter((v) => v.id !== currentVersionId)
    .slice()
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''))

  const ticketsByVersion = new Map<string, number>()
  for (const tk of poState?.past_tickets ?? []) {
    if (tk.version) ticketsByVersion.set(tk.version, (ticketsByVersion.get(tk.version) ?? 0) + 1)
  }

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
    </div>
  )
}

interface ActiveCardProps { version: Version; phaseNum: number | undefined; ticketsDone: number; selected: boolean; onClick: () => void }
function ActiveVersionCard({ version, phaseNum, ticketsDone, selected, onClick }: ActiveCardProps) {
  const { t } = useTranslation()
  const phaseLabel: Phase | '?' = (typeof phaseNum === 'number' && PHASE_NAMES[phaseNum]) || '?'
  return (
    <div style={selected ? cardActiveSelected : cardActive} onClick={onClick}>
      <div style={cardId}>{version.id}</div>
      <div style={cardLine}>
        {t('workspace.versions.phaseLabel')}
        <span style={cardLineValue}>{phaseLabel}{typeof phaseNum === 'number' ? ` (${phaseNum}/4)` : ''}</span>
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
      <div style={cardIdMuted}>{version.id}</div>
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
  background: '#1A1208',
  border: '1px solid #FF6B2B33',
  borderRadius: 6,
  padding: '10px 12px',
  marginBottom: 6,
  cursor: 'pointer',
  transition: 'border-color 0.12s',
}

const cardActiveSelected: React.CSSProperties = {
  ...{
    background: '#1A1208',
    border: '1px solid #FF6B2B',
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

const cardId: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#FF6B2B',
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
  color: '#FF6B2B',
  marginTop: 4,
  cursor: 'pointer',
  userSelect: 'none',
}
