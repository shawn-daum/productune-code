/**
 * @deprecated T-P4-097: Replaced by SidePanelCurrentVersion + SidePanelPastVersions.
 * This file is kept for reference only. It is no longer imported anywhere.
 * Safe to delete after T-P4-097 QA passes.
 *
 * SidePanelVersionList — Project tab sp-section "버전 히스토리".
 *
 * Master side of the master-detail pattern (T-P4-023).
 * Renders a collapsible section below "작업" with one row per version:
 *   [Version pill]  [ticketCount · deployCount]   [date]
 *
 * Row click → setSelectedVersionId + openTab version-history + dispatches
 * "version-select" custom event for any other listeners.
 *
 * First mount auto-selects the latest version (index 0).
 */

import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from '../../i18n'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'

interface Props {
  poState: PoState | null
}

// ── Date formatting helpers ───────────────────────────────────────────────────

function formatActivityDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (isToday) return i18next.t('workspace.versions.today')
  // YYYY-MM-DD
  return date.toISOString().slice(0, 10)
}

// ── Version pill ──────────────────────────────────────────────────────────────

interface VersionPillProps {
  label: string
  isLatest: boolean
}

function VersionPill({ label, isLatest }: VersionPillProps) {
  return (
    <span style={isLatest ? pillLatest : pillPast}>
      {label}
    </span>
  )
}

// ── Version row ───────────────────────────────────────────────────────────────

interface VersionRowProps {
  versionId: string
  ticketCount: number
  deployCount: number
  latestActivityDate: string | null
  isLatest: boolean
  isSelected: boolean
  onClick: () => void
}

function VersionRow({
  versionId,
  ticketCount,
  deployCount,
  latestActivityDate,
  isLatest,
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
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
      aria-current={isSelected ? 'true' : undefined}
    >
      <VersionPill label={versionId} isLatest={isLatest} />
      <span style={countText}>
        {ticketCount} · {deployCount}
      </span>
      <span style={dateText}>{formatActivityDate(latestActivityDate)}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SidePanelVersionList({ poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const setSelectedVersionId = useWorkspace((s) => s.setSelectedVersionId)
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const versions = useMemo(() => {
    const raw = poState?.versions ?? []
    // Sort: newest first (by started_at desc)
    return [...raw].sort((a, b) => {
      const ta = a.started_at ?? a.id
      const tb = b.started_at ?? b.id
      return tb.localeCompare(ta)
    })
  }, [poState?.versions])

  // Ticket count per version from fs-scan
  const ticketsByVersion = useMemo(() => {
    const map = new Map<string, number>()
    for (const tk of tickets) {
      if (!tk.version) continue
      map.set(tk.version, (map.get(tk.version) ?? 0) + 1)
    }
    return map
  }, [tickets])

  // Unassigned ticket count (version=null tickets)
  const unassignedCount = useMemo(
    () => tickets.filter((tk) => !tk.version).length,
    [tickets],
  )

  // Deploy count: derive from version.outcome or default 0 (Vercel REST deferred to 2nd PR)
  const deployCountForVersion = (_versionId: string): number => 0

  // Latest activity date: prefer version.ended_at then started_at
  const latestDateForVersion = (versionId: string): string | null => {
    const ver = versions.find((v) => v.id === versionId)
    return ver?.ended_at ?? ver?.started_at ?? null
  }

  // Header badge: total ticket + deploy counts across all versions
  const totalTickets = tickets.length
  const totalDeploys = 0  // deferred to 2nd PR
  const headerRight = versions.length > 0
    ? t('workspace.versions.ticketDeploySummary', { tickets: totalTickets, deploys: totalDeploys })
    : undefined

  // Auto-select first (latest) version on first mount
  useEffect(() => {
    if (versions.length > 0 && !selectedVersionId) {
      const firstId = versions[0].id
      setSelectedVersionId(firstId)
      // Open the tab proactively
      openTab('version-history:main', 'version-history', {}, t('workspace.versionHistory.title'))
      window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId: firstId } }))
    }
    // Only run once on mount (versions may be empty on first render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions.length > 0 ? versions[0]?.id : null])

  const handleRowClick = (versionId: string) => {
    setSelectedVersionId(versionId)
    openTab('version-history:main', 'version-history', {}, t('workspace.versionHistory.title'))
    window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId } }))
  }

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.title')}</span>
        {headerRight && <span style={secHdrRight}><span style={headerCountText}>{headerRight}</span></span>}
      </div>
      {versions.length === 0 ? (
        <div style={emptyState}>
          {t('workspace.versionHistory.sidePanel.empty')}
        </div>
      ) : (
        <div style={listWrap}>
          {versions.map((ver, idx) => (
            <VersionRow
              key={ver.id}
              versionId={ver.id}
              ticketCount={ticketsByVersion.get(ver.id) ?? 0}
              deployCount={deployCountForVersion(ver.id)}
              latestActivityDate={latestDateForVersion(ver.id)}
              isLatest={idx === 0}
              isSelected={selectedVersionId === ver.id}
              onClick={() => handleRowClick(ver.id)}
            />
          ))}
          {/* Unassigned bucket (T-P4-023 sub-b / OQ-6) — always at bottom */}
          {unassignedCount > 0 && (
            <button
              style={rowStyle(selectedVersionId === '__unassigned__')}
              onClick={() => handleRowClick('__unassigned__')}
              onMouseEnter={(e) => {
                if (selectedVersionId !== '__unassigned__')
                  (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
              }}
              onMouseLeave={(e) => {
                if (selectedVersionId !== '__unassigned__')
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
              aria-current={selectedVersionId === '__unassigned__' ? 'true' : undefined}
            >
              <span style={pillUnassigned}>{t('workspace.versionHistory.unassigned.label')}</span>
              <span style={countText}>{unassignedCount}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #1E1E1E',
}

const secHdrStatic: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '5px 8px 3px',
  gap: 4,
}

const secHdrText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  userSelect: 'none',
  flex: 1,
}

const secHdrRight: React.CSSProperties = {
  marginLeft: 'auto',
}

const headerCountText: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  whiteSpace: 'nowrap',
}

const listWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

function rowStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 26,
    padding: '0 8px',
    gap: 6,
    background: isSelected ? '#1A1030' : 'transparent',
    border: 'none',
    borderLeft: isSelected ? '2px solid #8B5CF6' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  }
}

const pillLatest: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#8B5CF6',
  background: '#1A1030',
  border: '1px solid #8B5CF650',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const pillPast: React.CSSProperties = {
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

const emptyState: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  color: '#3A3A3A',
  lineHeight: 1.4,
}

// Unassigned bucket pill — neutral grey (no version association)
const pillUnassigned: React.CSSProperties = {
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
