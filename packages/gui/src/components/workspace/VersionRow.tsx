/**
 * VersionRow — shared row component for SidePanelCurrentVersion + SidePanelPastVersions.
 *
 * 2-token layout (T-P4-099):
 *  - Current row:  [id pill] + flex gap + [date]
 *  - Past row:     [id pill] + flex gap + [close badge] (only if isClosed)
 *  - Unassigned:   [미배정 pill] + flex gap + [count]  (rendered inline by SidePanelPastVersions)
 *
 * Phase hover popover removed. No PhaseStrip import.
 * Close badge reuses PhaseStrip currentBadge shape (same borderRadius/fontSize/padding) with neutral gray.
 */

// ── Date helper ───────────────────────────────────────────────────────────────

export function formatActivityDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (isToday) return '오늘'
  return date.toISOString().slice(0, 10)
}

// ── Shared pill styles ────────────────────────────────────────────────────────

export const pillLatest: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#8B5CF6',
  background: '#120A2A',
  border: '1px solid #8B5CF650',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export const pillPast: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: 'monospace',
  color: '#FB923C',
  background: '#261008',
  border: '1px solid #FB923C40',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export const pillUnassigned: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: 'monospace',
  color: '#707070',
  background: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

// ── Row style ─────────────────────────────────────────────────────────────────

export function rowStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 26,
    padding: '0 8px',
    gap: 6,
    background: isSelected ? '#120A2A' : 'transparent',
    border: 'none',
    borderLeft: isSelected ? '2px solid #8B5CF6' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  }
}

// ── VersionRow component ──────────────────────────────────────────────────────

export interface VersionRowProps {
  versionId: string
  /** Only rendered on isCurrent=true rows. */
  latestActivityDate?: string | null
  isCurrent: boolean
  /** Past rows only: show "close" badge when true. */
  isClosed?: boolean
  isSelected: boolean
  onClick: () => void
}

export default function VersionRow({
  versionId,
  latestActivityDate,
  isCurrent,
  isClosed,
  isSelected,
  onClick,
}: VersionRowProps) {
  return (
    <button
      style={rowStyle(isSelected)}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = isSelected ? '#120A2A' : 'transparent'
      }}
      aria-current={isSelected ? 'true' : undefined}
    >
      {/* Version id pill */}
      <span style={isCurrent ? pillLatest : pillPast}>
        {versionId}
      </span>

      {/* Flex gap */}
      <span style={flexGap} />

      {/* Right side: date (current) OR close badge (past, if closed) */}
      {isCurrent && latestActivityDate && (
        <span style={dateText}>{formatActivityDate(latestActivityDate)}</span>
      )}
      {!isCurrent && isClosed && (
        <span style={closeBadgeStyle}>close</span>
      )}
    </button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const flexGap: React.CSSProperties = {
  flex: 1,
}

const dateText: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

/**
 * Close badge — reuses PhaseStrip itemStyle('cur') shape:
 * same borderRadius(3) / fontSize(10) / padding('2px 4px') / fontWeight(600).
 * Color = neutral gray (not phase-current blue).
 */
const closeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 4px',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  background: '#1A1A1A',
  color: '#808080',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  cursor: 'default',
  userSelect: 'none',
}
