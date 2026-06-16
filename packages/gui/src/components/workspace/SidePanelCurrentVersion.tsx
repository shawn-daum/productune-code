/**
 * SidePanelCurrentVersion — "현재 버전" sp-section (T-P4-097, simplified T-P4-099).
 *
 * Always-expanded detail card (no chevron). Shows:
 *   - Version ID pill + Phase badge
 *   - Ticket done/total count (when tickets exist)
 *   - Start date + elapsed days
 *
 * Clickable visual cue = left border accent + hover background (no chevron).
 *
 * Fallback rows:
 *   1. versions[] is empty → "v1 (대기 중)" hint
 *   2. current version closed → "다음 버전 시작 대기 중"
 */

import { useTranslation } from 'react-i18next'
import i18next from '../../i18n'
import type { PoState } from '../../lib/types'
import { PHASE_NAMES } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'
import { formatActivityDate } from './VersionRow'

interface Props {
  poState: PoState | null
  selectedVersionId: string | null
  isFocused: boolean
  onSelect: (id: string) => void
}

/** Returns true when the current version has been closed (transient close). */
function isCurrentVersionClosed(poState: PoState | null): boolean {
  if (!poState?.current_version) return false
  const ver = (poState.versions ?? []).find((v) => v.id === poState.current_version)
  if (!ver) return false
  return !!ver.outcome?.observed_result || !!ver.ended_at
}

/** e.g. "오늘 시작" or "14일째" */
function elapsedLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const start = new Date(isoDate)
  if (isNaN(start.getTime())) return ''
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000)
  if (days === 0) return i18next.t('workspace.versions.startedToday')
  return i18next.t('workspace.versions.daysSince', { n: days })
}

export default function SidePanelCurrentVersion({ poState, selectedVersionId, isFocused, onSelect }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const currentVersionId = poState?.current_version ?? null
  const versions = poState?.versions ?? []
  const isClosed = isCurrentVersionClosed(poState)
  const hasVersions = versions.length > 0 && !!currentVersionId

  const currentVer = currentVersionId ? versions.find((v) => v.id === currentVersionId) : null

  // Phase name (Build / Design / PRD / Deploy / Close)
  const phaseName = PHASE_NAMES[poState?.current_phase ?? 0] ?? null

  // Ticket stats for current version
  const versionTickets = tickets.filter((tk) => tk.version === currentVersionId)
  const doneCount = versionTickets.filter((tk) => tk.status === 'done').length
  // abandoned = terminal-archive; excluded from the denominator (neither total
  // nor done). Mirrors phase-mapping.ts:138 / statusline. blocked stays counted.
  const totalCount = versionTickets.filter((tk) => tk.status !== 'abandoned').length

  // Elapsed duration
  const elapsed = elapsedLabel(currentVer?.started_at)

  const isSelected = selectedVersionId === currentVersionId

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.currentTitle')}</span>
      </div>

      {/* Case 1: no versions → init fallback */}
      {versions.length === 0 && (
        <div style={fallbackRow} aria-disabled="true">
          {t('workspace.versionHistory.sidePanel.currentFallback')}
        </div>
      )}

      {/* Case 2: transient close → next-version fallback */}
      {versions.length > 0 && isClosed && (
        <div style={fallbackRow} aria-disabled="true">
          {t('workspace.versionHistory.sidePanel.currentFallbackTransient')}
        </div>
      )}

      {/* Case 3: always-expanded detail card */}
      {hasVersions && !isClosed && (
        <div
          style={detailCard(isSelected, isFocused)}
          role="button"
          tabIndex={0}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => {
            if (!currentVersionId) return
            onSelect(currentVersionId)
            openTab(
              `ticket-review:${currentVersionId}`,
              'ticket-review',
              { versionFilter: currentVersionId },
              currentVersionId,
            )
          }}
          onMouseEnter={(e) => {
            if (!isSelected)
              (e.currentTarget as HTMLDivElement).style.background = '#181818'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background =
              isSelected ? '#1A1030' : '#141414'
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && currentVersionId) {
              onSelect(currentVersionId)
              openTab(
                `ticket-review:${currentVersionId}`,
                'ticket-review',
                { versionFilter: currentVersionId },
                currentVersionId,
              )
            }
          }}
        >
          {/* Row 1: Version ID pill + Phase badge + PRD affordance (AC-2, T-PATCH-078) */}
          <div style={cardRow}>
            <span style={versionPill}>{currentVersionId}</span>
            {phaseName && <span style={phaseBadge}>{phaseName}</span>}
          </div>

          {/* Row 2: Ticket stats (only when tickets exist) */}
          {totalCount > 0 && (
            <div style={cardRow}>
              <span style={metaKey}>{t('workspace.versions.ticketsLabel')}</span>
              <span style={metaVal}>{doneCount}&thinsp;/&thinsp;{totalCount} done</span>
            </div>
          )}

          {/* Row 3: Start date + elapsed */}
          <div style={cardRow}>
            <span style={metaKey}>{t('workspace.versions.startedLabel')}</span>
            <span style={metaVal}>
              {formatActivityDate(currentVer?.started_at)}
              {elapsed ? ` · ${elapsed}` : ''}
            </span>
          </div>
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

const fallbackRow: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  color: '#3A3A3A',
  lineHeight: 1.4,
  cursor: 'default',
  userSelect: 'none',
  fontStyle: 'italic',
}

function detailCard(isSelected: boolean, isFocused: boolean): React.CSSProperties {
  const borderColor = isSelected
    ? (isFocused ? '#8B5CF6' : '#8B5CF633')
    : '#2A2A2A'
  return {
    margin: '4px 8px 10px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    background: isSelected ? '#1A1030' : '#141414',
    border: '1px solid #222222',
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.1s',
    outline: 'none',
    opacity: isSelected && !isFocused ? 0.4 : 1,
  }
}

const cardRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const versionPill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#8B5CF6',
  background: '#1A1030',
  border: '1px solid #8B5CF650',
  borderRadius: 3,
  padding: '2px 6px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const phaseBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#38BDF8',
  background: '#071523',
  border: '1px solid #38BDF830',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginLeft: 'auto',
}

const metaKey: React.CSSProperties = {
  fontSize: 9,
  color: '#4A4A4A',
  fontFamily: 'monospace',
  flexShrink: 0,
  minWidth: 24,
}

const metaVal: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'monospace',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

