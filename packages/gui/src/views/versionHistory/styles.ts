import type { StatusKey } from './types'

export const viewWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--bg-surface-base)',
}

export const headerWrap: React.CSSProperties = {
  flexShrink: 0,
  padding: '14px 16px 10px',
  borderBottom: '1px solid var(--border-section)',
}

export const headerTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: 4,
}

export const headerSubtitle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-quaternary)',
  fontFamily: 'monospace',
}

// PRD section wrapper — horizontal padding aligns PrdSection with the 16px
// gutter of sibling rows (headerWrap/cardListWrap). T-PATCH-178.
export const prdWrap: React.CSSProperties = {
  flexShrink: 0,
  padding: '12px 16px 0',
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
  background: 'var(--bg-surface-on)',
  border: '1px solid var(--border-section)',
  borderLeft: '2px solid var(--accent)',
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

// Clickable id/title region inside the header — opens ticket-detail (T-PATCH-103).
// Resets native <button> chrome so it reads as inline text but stays keyboard-focusable.
export const cardHeaderOpen: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
}

export const cardTicketId: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: 'var(--accent)',
  flexShrink: 0,
}

export const cardTitle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: 'var(--text-primary)',
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
  color: 'var(--text-quaternary)',
}

export const deployPill: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: 'var(--health-success)',
  background: 'var(--health-success-subtle)',
  border: '1px solid var(--health-success)',
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
  color: 'var(--persona-designer)',
  fontFamily: 'monospace',
  flexShrink: 0,
  minWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const activityResult: React.CSSProperties = {
  color: 'var(--text-tertiary)',
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
  color: 'var(--text-disabled)',
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
  background: 'var(--bg-base)',
  borderRadius: 4,
}

export const commitRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 10,
}

export const commitDate: React.CSSProperties = {
  color: 'var(--text-disabled)',
  fontFamily: 'monospace',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

export const commitSummary: React.CSSProperties = {
  color: 'var(--text-secondary)',
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
  color: 'var(--text-ghost)',
  padding: '40px 20px',
}

export const emptyIcon: React.CSSProperties = {
  fontSize: 32,
  color: 'var(--text-ghost)',
}

export const emptyText: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-disabled)',
  textAlign: 'center',
  lineHeight: 1.5,
}

export function statusPill(status: StatusKey): React.CSSProperties {
  const palette: Record<string, { fg: string; bg: string }> = {
    'todo':        { fg: 'var(--text-quaternary)', bg: 'var(--bg-surface-onlayer)' },
    'in-progress': { fg: 'var(--health-info)', bg: 'var(--health-info-subtle)' },
    'review':      { fg: 'var(--status-review)', bg: 'var(--health-warn-subtle)' },
    'done':        { fg: 'var(--health-success)', bg: 'var(--health-success-subtle)' },
    'blocked':     { fg: 'var(--status-blocked)', bg: 'var(--health-error-subtle)' },
    'abandoned':   { fg: 'var(--text-disabled)', bg: 'var(--bg-surface-on)' },
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
  borderBottom: '1px solid var(--border-item)',
  flexWrap: 'wrap',
}

export const filterGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

export function personaChipBtn(active: boolean, color: string): React.CSSProperties {
  // T-417 #2: `color` is a var(--…) string post-reskin, so the old `color + '80'`
  // alpha-suffix produced invalid CSS ('var(--persona-po)80') and the whole
  // border/background declaration was dropped. color-mix() is valid for both
  // var() and hex color inputs. 0x80≈50%, 0x18≈9%.
  const activeBorder = `color-mix(in srgb, ${color} 50%, transparent)`
  return {
    padding: '2px 8px',
    borderRadius: 3,
    border: `1px solid ${active ? activeBorder : 'var(--text-ghost)'}`,
    background: active ? `color-mix(in srgb, ${color} 9%, transparent)` : 'transparent',
    color: active ? color : 'var(--text-disabled)',
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
  color: 'var(--text-disabled)',
  fontFamily: 'monospace',
  flexShrink: 0,
}

export const dateInput: React.CSSProperties = {
  background: 'var(--bg-surface-on)',
  border: '1px solid var(--border-inline)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  fontSize: 10,
  fontFamily: 'monospace',
  padding: '2px 4px',
  cursor: 'pointer',
}

export const resetBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-inline)',
  borderRadius: 3,
  color: 'var(--text-disabled)',
  fontSize: 9,
  fontFamily: 'monospace',
  padding: '2px 6px',
  cursor: 'pointer',
}
