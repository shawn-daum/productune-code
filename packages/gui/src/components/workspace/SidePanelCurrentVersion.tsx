/**
 * SidePanelCurrentVersion — "현재 버전" sp-section (T-P4-097 sub-area A).
 *
 * Shows exactly 1 row for the active (current) version, or a read-only
 * fallback row in two cases:
 *   1. versions[] is empty → "v1 (대기 중)" hint (PRD not yet started)
 *   2. current version has outcome|ended_at set → transient-close fallback
 *      ("다음 버전 시작 대기 중")
 *
 * Auto-selects + opens tab on mount when a non-closed current version exists.
 */

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { getActivePhaseDef } from '../../lib/phase-mapping'
import { useTicketScan } from '../../lib/useTicketScan'
import VersionRow from './VersionRow'

interface Props {
  poState: PoState | null
  selectedVersionId: string | null
  onSelect: (id: string) => void
}

/** Returns true when the current version has been closed (transient close). */
function isCurrentVersionClosed(poState: PoState | null): boolean {
  if (!poState?.current_version) return false
  const ver = (poState.versions ?? []).find((v) => v.id === poState.current_version)
  if (!ver) return false
  return !!ver.outcome || !!ver.ended_at
}

export default function SidePanelCurrentVersion({ poState, selectedVersionId, onSelect }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const currentVersionId = poState?.current_version ?? null
  const versions = poState?.versions ?? []
  const isClosed = isCurrentVersionClosed(poState)
  const hasVersions = versions.length > 0 && !!currentVersionId

  // Ticket count for current version
  const ticketCount = currentVersionId
    ? tickets.filter((tk) => tk.version === currentVersionId).length
    : 0

  // Phase for current version
  const activePhaseDef = getActivePhaseDef(poState)

  // Latest activity date
  const currentVer = currentVersionId ? versions.find((v) => v.id === currentVersionId) : null
  const latestDate = currentVer?.ended_at ?? currentVer?.started_at ?? null

  // Auto-select + open tab on mount when non-closed current version exists
  useEffect(() => {
    if (!currentVersionId || isClosed) return
    if (selectedVersionId) return  // already selected externally
    onSelect(currentVersionId)
    openTab(
      `version-current:${currentVersionId}`,
      'version-history',
      { mode: 'current' },
      currentVersionId,
    )
    window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId: currentVersionId } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersionId])

  // Sec-hdr phase dot color
  const phaseColor = activePhaseDef.color

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.currentTitle')}</span>
        {/* Right side: phase color dot only */}
        {hasVersions && !isClosed && (
          <span style={{ ...phaseDot, background: phaseColor }} title={activePhaseDef.label} />
        )}
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

      {/* Case 3: active current version row */}
      {hasVersions && !isClosed && (
        <VersionRow
          versionId={currentVersionId!}
          phaseLabel={activePhaseDef.label}
          phaseColor={activePhaseDef.color}
          ticketCount={ticketCount}
          deployCount={0}
          latestActivityDate={latestDate}
          isCurrent={true}
          isSelected={selectedVersionId === currentVersionId}
          onClick={() => onSelect(currentVersionId!)}
          poState={poState}
        />
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

const phaseDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'inline-block',
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
