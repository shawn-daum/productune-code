/**
 * SidePanelPrdtProjectCard — prdt (v1) project card (T-347).
 *
 * prdt po-state carries a flat `{ stage, version, current_task }` shape with
 * no `versions[]` array, so it can't drive SidePanelCurrentVersion's legacy
 * multi-version card. T-291 (adapter A8) suppressed SidePanelCurrentVersion
 * entirely for prdt projects via `!isPrdt` in LeftSidebar — which also
 * silently dropped ANY project card for prdt projects (the T-347 regression:
 * a prdt project's 프로젝트 tab showed only the .ENV section, no card at all).
 *
 * This renders the prdt-shaped equivalent — slug / version / stage — with
 * graceful skeleton/notice fallbacks when po-state is missing/unparsable, so
 * the card never just disappears (AC: "never silently disappears").
 */

import { useTranslation } from 'react-i18next'
import type { PoState } from '../../lib/types'
import { resolvePrdtProjectCard } from '../../lib/phase-mapping'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'

interface Props {
  poState: PoState | null
  selectedVersionId: string | null
  isFocused: boolean
  onSelect: (id: string) => void
}

export default function SidePanelPrdtProjectCard({ poState, selectedVersionId, isFocused, onSelect }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const project = useWorkspace((s) => s.project)
  // T-PATCH-167 (mirrored for prdt, T-347): corrupt po-state.json → explicit
  // error, not a silently-blank card.
  const poStateError = useWorkspace((s) => s.poStateError)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const { slug, versionId, stageDef, hasCoreData } = resolvePrdtProjectCard(poState, project?.slug ?? null)

  const versionTickets = versionId ? tickets.filter((tk) => tk.version === versionId) : []
  const doneCount = versionTickets.filter((tk) => tk.status === 'done').length
  const totalCount = versionTickets.filter((tk) => tk.status !== 'abandoned').length

  const isSelected = !!versionId && selectedVersionId === versionId

  return (
    <div style={sectionWrap}>
      <div style={secHdrStatic}>
        <span style={secHdrText}>{t('workspace.versionHistory.sidePanel.currentTitle')}</span>
      </div>

      {/* Case 0: po-state parse failure → explicit error, takes precedence. */}
      {poStateError === 'parse' && (
        <div style={errorRow} role="alert">
          {t('workspace.versionHistory.sidePanel.currentParseError')}
        </div>
      )}

      {/* Case 1: no usable data at all → notice, never a blank card. */}
      {!poStateError && !hasCoreData && (
        <div style={fallbackRow} aria-disabled="true">
          {t('workspace.versionHistory.sidePanel.currentPrdtMissing')}
        </div>
      )}

      {/* Case 2: card — render whatever fields ARE available; individual
          pills fall back to a muted placeholder rather than disappearing. */}
      {!poStateError && hasCoreData && (
        <div
          style={detailCard(isSelected, isFocused)}
          role="button"
          tabIndex={0}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => {
            if (!versionId) return
            onSelect(versionId)
            openTab(`ticket-review:${versionId}`, 'ticket-review', { versionFilter: versionId }, versionId)
          }}
          onMouseEnter={(e) => {
            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#181818'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = isSelected ? '#1A1030' : '#141414'
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && versionId) {
              onSelect(versionId)
              openTab(`ticket-review:${versionId}`, 'ticket-review', { versionFilter: versionId }, versionId)
            }
          }}
        >
          {/* Row 1: slug + stage badge */}
          <div style={cardRow}>
            <span style={slugPill}>{slug ?? '—'}</span>
            <span style={stageBadge(stageDef.color)}>{t(stageDef.labelKey)}</span>
          </div>

          {/* Row 2: version pill */}
          <div style={cardRow}>
            <span style={metaKey}>{t('workspace.versions.current')}</span>
            <span style={versionPill}>{versionId ?? '—'}</span>
          </div>

          {/* Row 3: ticket stats (only when tickets exist for this version) */}
          {totalCount > 0 && (
            <div style={cardRow}>
              <span style={metaKey}>{t('workspace.versions.ticketsLabel')}</span>
              <span style={metaVal}>{doneCount}&thinsp;/&thinsp;{totalCount} done</span>
            </div>
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

const fallbackRow: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 10,
  color: '#3A3A3A',
  lineHeight: 1.4,
  cursor: 'default',
  userSelect: 'none',
  fontStyle: 'italic',
}

const errorRow: React.CSSProperties = {
  margin: '4px 8px 10px',
  padding: '8px 10px',
  fontSize: 10,
  color: '#FBBF24',
  background: '#2A1A05',
  border: '1px solid #92400E',
  borderLeft: '3px solid #F59E0B',
  borderRadius: 4,
  lineHeight: 1.4,
  cursor: 'default',
  userSelect: 'none',
  fontWeight: 600,
}

function detailCard(isSelected: boolean, isFocused: boolean): React.CSSProperties {
  const borderColor = isSelected ? (isFocused ? '#8B5CF6' : '#8B5CF633') : '#2A2A2A'
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

const slugPill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#F0F0F0',
  background: '#1E1E1E',
  border: '1px solid #333333',
  borderRadius: 3,
  padding: '2px 6px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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

function stageBadge(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 600,
    color,
    background: '#0000',
    border: `1px solid ${color}30`,
    borderRadius: 3,
    padding: '1px 5px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    marginLeft: 'auto',
  }
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
