/**
 * SidePanelCurrentVersion — "현재 버전" sp-section (T-P4-097, simplified T-P4-099).
 *
 * Shows exactly 1 row for the active (current) version, or a read-only
 * fallback row in two cases:
 *   1. versions[] is empty → "v1 (대기 중)" hint (PRD not yet started)
 *   2. current version has outcome.observed_result|ended_at set → transient-close fallback
 *      (planning-time outcome object with north_star/input_metrics is NOT a close trigger)
 *      ("다음 버전 시작 대기 중")
 *
 * Auto-selects + opens tab on mount when a non-closed current version exists.
 * Phase dot removed (T-P4-099) — phase info is shown by PhaseStrip at sidebar top.
 */

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
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
  return !!ver.outcome?.observed_result || !!ver.ended_at
}

export default function SidePanelCurrentVersion({ poState, selectedVersionId, onSelect }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)

  const currentVersionId = poState?.current_version ?? null
  const versions = poState?.versions ?? []
  const isClosed = isCurrentVersionClosed(poState)
  const hasVersions = versions.length > 0 && !!currentVersionId

  // Latest activity date for current version row
  const currentVer = currentVersionId ? versions.find((v) => v.id === currentVersionId) : null
  const latestDate = currentVer?.ended_at ?? currentVer?.started_at ?? null

  // Auto-select + open tab on mount when non-closed current version exists
  useEffect(() => {
    if (!currentVersionId || isClosed) return
    if (selectedVersionId) return  // already selected externally
    onSelect(currentVersionId)
    openTab(
      `ticket-review:${currentVersionId}`,
      'ticket-review',
      { versionFilter: currentVersionId },
      currentVersionId,
    )
    window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId: currentVersionId } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersionId])

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.currentTitle')}</span>
        {/* Right meta: empty (phase dot removed — phase shown by PhaseStrip only) */}
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
          latestActivityDate={latestDate}
          isCurrent={true}
          isSelected={selectedVersionId === currentVersionId}
          onClick={() => onSelect(currentVersionId!)}
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

const fallbackRow: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  color: '#3A3A3A',
  lineHeight: 1.4,
  cursor: 'default',
  userSelect: 'none',
  fontStyle: 'italic',
}
