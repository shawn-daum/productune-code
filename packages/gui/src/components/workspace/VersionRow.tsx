/**
 * VersionRow — shared row component for SidePanelCurrentVersion + SidePanelPastVersions.
 *
 * Props:
 *  - isCurrent  (renamed from isLatest) — orange pill vs purple pill
 *  - phaseLabel  — 'Build' | 'PRD' | ... | '완료'
 *  - phaseColor  — hex color matching phase token
 *  - poState     — for PhaseStrip hover popover (forceExpanded)
 *
 * CSS-only hover popover: .vr-row:hover .vr-popover → opacity 0→1, no re-render.
 * Requires version-row.css (imported here).
 */

import './version-row.css'
import PhaseStrip from './PhaseStrip'
import type { PoState } from '../../lib/types'

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
  color: '#FF6B2B',
  background: '#1A0E05',
  border: '1px solid #FF6B2B50',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export const pillPast: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: 'monospace',
  color: '#9B7FD4',
  background: '#120F1A',
  border: '1px solid #9B7FD440',
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

/** "완료" pill — neutral gray-on-dark. Ticket §2-C. */
export const pillClosed: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: 'monospace',
  color: '#606060',
  background: '#1A1A1A',
  border: '1px solid #303030',
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
    background: isSelected ? '#1A1208' : 'transparent',
    border: 'none',
    borderLeft: isSelected ? '2px solid #FF6B2B' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
    // position:relative is in .vr-row CSS class (needed for popover absolute child)
  }
}

// ── VersionRow component ──────────────────────────────────────────────────────

export interface VersionRowProps {
  versionId: string
  phaseLabel: string
  phaseColor: string
  ticketCount: number
  deployCount: number
  latestActivityDate: string | null
  isCurrent: boolean
  isSelected: boolean
  onClick: () => void
  /** Used by PhaseStrip forceExpanded popover. Pass poState for live phase data. */
  poState?: PoState | null
}

export default function VersionRow({
  versionId,
  phaseLabel,
  phaseColor,
  ticketCount,
  deployCount,
  latestActivityDate,
  isCurrent,
  isSelected,
  onClick,
  poState,
}: VersionRowProps) {
  return (
    <button
      className="vr-row"
      style={rowStyle(isSelected)}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = isSelected ? '#1A1208' : 'transparent'
      }}
      aria-current={isSelected ? 'true' : undefined}
    >
      {/* Version pill */}
      <span style={isCurrent ? pillLatest : pillPast}>
        {versionId}
      </span>

      {/* Phase label */}
      <span style={{ ...phaseLabelStyle, color: phaseColor }}>
        {phaseLabel}
      </span>

      {/* Ticket · deploy count */}
      <span style={countText}>
        {ticketCount} · {deployCount}
      </span>

      {/* Date */}
      <span style={dateText}>{formatActivityDate(latestActivityDate)}</span>

      {/* CSS-only hover popover — PhaseStrip forceExpanded (no state mutation, 0 re-renders) */}
      <span className="vr-popover">
        <PhaseStrip poState={poState ?? null} variant="strip" forceExpanded />
      </span>
    </button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const phaseLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const countText: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#707070',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const dateText: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}
