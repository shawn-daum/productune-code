import type { PoState, Version, Phase } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'

interface Props {
  poState: PoState | null
}

export default function VersionsPanel({ poState }: Props) {
  const currentVersionId = poState?.current_version
  const currentPhaseNum = poState?.current_phase
  const versions = poState?.versions ?? []

  const active = versions.find((v) => v.id === currentVersionId) ?? null
  const past = versions.filter((v) => v.id !== currentVersionId)

  const ticketsByVersion = new Map<string, number>()
  for (const t of poState?.past_tickets ?? []) {
    if (t.version) ticketsByVersion.set(t.version, (ticketsByVersion.get(t.version) ?? 0) + 1)
  }

  return (
    <div style={panel}>
      <div style={sectionLabel}>Active</div>
      {active ? (
        <ActiveVersionCard version={active} phaseNum={currentPhaseNum} ticketsDone={ticketsByVersion.get(active.id) ?? 0} />
      ) : (
        <div style={emptyHint}>No active Version. Start a new one via PO chat.</div>
      )}

      <div style={{ ...sectionLabel, marginTop: 18 }}>Past Versions ({past.length})</div>
      {past.length === 0 ? (
        <div style={emptyHint}>None yet.</div>
      ) : (
        past.map((v) => (
          <PastVersionCard key={v.id} version={v} ticketsDone={ticketsByVersion.get(v.id) ?? 0} />
        ))
      )}
    </div>
  )
}

function ActiveVersionCard({ version, phaseNum, ticketsDone }: { version: Version; phaseNum: number | undefined; ticketsDone: number }) {
  const phaseLabel: Phase | '?' = (typeof phaseNum === 'number' && PHASE_NAMES[phaseNum]) || '?'
  return (
    <div style={cardActive}>
      <div style={cardId}>{version.id}</div>
      <div style={cardLine}>Phase: <span style={cardLineValue}>{phaseLabel}{typeof phaseNum === 'number' ? ` (${phaseNum}/4)` : ''}</span></div>
      <div style={cardLine}>Tickets: <span style={cardLineValue}>{ticketsDone} done</span></div>
      {version.outcome?.north_star && (
        <div style={cardLineMuted}>★ {version.outcome.north_star}</div>
      )}
    </div>
  )
}

function PastVersionCard({ version, ticketsDone }: { version: Version; ticketsDone: number }) {
  const closed = version.ended_at ? version.ended_at.slice(0, 10) : '?'
  const observed = version.outcome?.observed_result
  const retro = version.outcome?.retrospective_path
  return (
    <div style={cardPast}>
      <div style={cardIdMuted}>{version.id}</div>
      <div style={cardLineMuted}>closed {closed}</div>
      <div style={cardLineMuted}>{ticketsDone} tickets</div>
      {version.outcome?.north_star && (
        <div style={cardLineMuted}>★ {version.outcome.north_star}</div>
      )}
      {observed && <div style={cardLineMuted}>→ {observed}</div>}
      {retro && (
        <div style={cardLink} title={retro}>retrospective ↗</div>
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
}

const cardPast: React.CSSProperties = {
  background: '#0F0F0F',
  border: '1px solid #1A1A1A',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 6,
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
