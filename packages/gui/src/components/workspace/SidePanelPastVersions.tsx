/**
 * SidePanelPastVersions — "지난 버전" sp-section (T-P4-097, simplified T-P4-099).
 *
 * Renders all versions EXCEPT the active current one.
 * Transient-closed current version also moves here.
 *
 * Row layout (T-P4-099 2-token):
 *  - Past row: [id pill] + gap + [close badge if closed]
 *  - Unassigned bucket: [미배정 pill] + gap + [count]
 *
 * Sort: (ended_at ?? started_at) desc — closed version immediately rises to top.
 * Unassigned bucket ([지정 없음]) always at bottom.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'
import VersionRow, { pillUnassigned, rowStyle } from './VersionRow'

interface Props {
  poState: PoState | null
  selectedVersionId: string | null
  onSelect: (id: string) => void
}

/** Returns true when a version is considered closed.
 *  Close = ended_at set OR outcome.observed_result set (measured result populated).
 *  Planning-time outcome object (north_star / input_metrics / validation_method) is NOT a close trigger.
 */
function isVersionClosed(ver: NonNullable<PoState['versions']>[number]): boolean {
  return !!ver.outcome?.observed_result || !!ver.ended_at
}

export default function SidePanelPastVersions({ poState, selectedVersionId, onSelect }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const currentVersionId = poState?.current_version ?? null
  const rawVersions = poState?.versions ?? []

  // Versions to show in this section:
  //   - exclude the current version UNLESS it is transient-closed
  const pastVersions = useMemo(() => {
    return rawVersions.filter((v) => {
      if (v.id !== currentVersionId) return true
      return isVersionClosed(v)
    })
  }, [rawVersions, currentVersionId])

  // Sort: (ended_at ?? started_at) desc
  const sortedVersions = useMemo(() => {
    return [...pastVersions].sort((a, b) => {
      const ta = a.ended_at ?? a.started_at ?? a.id
      const tb = b.ended_at ?? b.started_at ?? b.id
      return tb.localeCompare(ta)
    })
  }, [pastVersions])

  // Unassigned count
  const unassignedCount = useMemo(
    () => tickets.filter((tk) => !tk.version).length,
    [tickets],
  )

  // Header meta: "{N}개 배포 {M}" (가운뎃점 없음 — ko mockup verbatim)
  const pastCount = sortedVersions.length
  const totalDeploys = 0  // Vercel REST deferred
  const headerRight = pastCount > 0
    ? t('workspace.versionHistory.sidePanel.headerMeta', {
        count: pastCount,
        deploys: totalDeploys,
      })
    : undefined

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        {/* "지난 버전" — label changed from "버전 히스토리" (T-P4-099) */}
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.title')}</span>
        {headerRight && (
          <span style={secHdrRight}>
            <span style={headerCountText}>{headerRight}</span>
          </span>
        )}
      </div>

      {sortedVersions.length === 0 && unassignedCount === 0 ? (
        <div style={emptyState}>{t('workspace.versionHistory.sidePanel.empty')}</div>
      ) : (
        <div style={listWrap}>
          {sortedVersions.map((ver) => (
            <VersionRow
              key={ver.id}
              versionId={ver.id}
              isCurrent={false}
              isClosed={isVersionClosed(ver)}
              isSelected={selectedVersionId === ver.id}
              onClick={() => onSelect(ver.id)}
            />
          ))}

          {/* Unassigned bucket — always at bottom */}
          {unassignedCount > 0 && (
            <button
              style={rowStyle(selectedVersionId === '__unassigned__')}
              onClick={() => onSelect('__unassigned__')}
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

const countText: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#707070',
  whiteSpace: 'nowrap',
}

const emptyState: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  color: '#3A3A3A',
  lineHeight: 1.4,
}
