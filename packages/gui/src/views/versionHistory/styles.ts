import type { StatusKey } from './types'

export const viewWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#0F0F0F',
}

export const headerWrap: React.CSSProperties = {
  flexShrink: 0,
  padding: '14px 16px 10px',
  borderBottom: '1px solid #1E1E1E',
}

export const headerTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#F0F0F0',
  marginBottom: 4,
}

export const headerSubtitle: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
}

export const cardListWrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

export const cardWrap: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #1F1F1F',
  borderLeft: '2px solid #FF6B2B30',
  borderRadius: 6,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

export const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

export const cardTicketId: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#FF6B2B',
  flexShrink: 0,
}

export const cardTitle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#E0E0E0',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const cardMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

export const metaItem: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#606060',
}

export const deployPill: React.CSSProperties = {
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

export const activityList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginTop: 2,
}

export const activityRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontSize: 10,
}

export const activityPersona: React.CSSProperties = {
  color: '#9B7FD4',
  fontFamily: 'monospace',
  flexShrink: 0,
  minWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const activityResult: React.CSSProperties = {
  color: '#A0A0A0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

export const expandBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 10,
  color: '#505050',
  textAlign: 'left',
  padding: '2px 0',
  marginTop: 2,
}

export const commitList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginTop: 4,
  padding: '6px 8px',
  background: '#0A0A0A',
  borderRadius: 4,
}

export const commitRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 10,
}

export const commitDate: React.CSSProperties = {
  color: '#505050',
  fontFamily: 'monospace',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

export const commitSummary: React.CSSProperties = {
  color: '#C0C0C0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const emptyWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  color: '#3A3A3A',
  padding: '40px 20px',
}

export const emptyIcon: React.CSSProperties = {
  fontSize: 32,
  color: '#2A2A2A',
}

export const emptyText: React.CSSProperties = {
  fontSize: 13,
  color: '#505050',
  textAlign: 'center',
  lineHeight: 1.5,
}

export function statusPill(status: StatusKey): React.CSSProperties {
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

export const filterBar: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 16px',
  borderBottom: '1px solid #1A1A1A',
  flexWrap: 'wrap',
}

export const filterGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

export function personaChipBtn(active: boolean, color: string): React.CSSProperties {
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

export const dateLabel: React.CSSProperties = {
  fontSize: 9,
  color: '#505050',
  fontFamily: 'monospace',
  flexShrink: 0,
}

export const dateInput: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  color: '#C0C0C0',
  fontSize: 10,
  fontFamily: 'monospace',
  padding: '2px 4px',
  cursor: 'pointer',
}

export const resetBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  color: '#505050',
  fontSize: 9,
  fontFamily: 'monospace',
  padding: '2px 6px',
  cursor: 'pointer',
}
