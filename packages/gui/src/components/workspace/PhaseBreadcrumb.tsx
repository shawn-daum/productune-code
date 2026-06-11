import type { Phase } from '../../lib/types'
import type { PhaseCounts } from '../../lib/phase-mapping'

const PHASES: Phase[] = ['PRD', 'Design', 'Build', 'Deploy', 'Close']

interface Props {
  phase: Phase
  // T-PATCH-096 AC-1: optional version label rendered before the phase list.
  // When null/undefined the label is omitted (no empty segment).
  version?: string | null
  // T-PATCH-096 §4.b: per-phase (done/total) counts, computed upstream
  // (WorkspaceShell) from useTicketScan via bucketTicketsByPhase. Presentational
  // only — PhaseBreadcrumb does not call the hook. Omitted phases render no counter.
  phaseCounts?: PhaseCounts
}

export default function PhaseBreadcrumb({ phase, version, phaseCounts }: Props) {
  return (
    <div style={wrap}>
      {version && (
        // T-PATCH-096 §4.b AC-1b: version badge stands alone — no chevron between
        // it and the first phase. Phase-to-phase separators (below) are unchanged.
        <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={versionNode}>{version}</span>
        </span>
      )}
      {PHASES.map((p, i) => {
        const count = phaseCounts?.[p]
        // AC-3b: total === 0 → render no counter (no "(0/0)").
        const showCount = !!count && count.total > 0
        return (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && <span style={chevron}>›</span>}
            <span style={p === phase ? activeNode : inactiveNode}>
              {p}
              {showCount && (
                // T-PATCH-096 §4.b AC-4b: muted, subordinate, tabular-nums,
                // opacity 0.7 + tooltip — honestly marks the count as approximate.
                <span
                  style={counterNode}
                  title="approximate — by ticket type, current version"
                >
                  ({count.done}/{count.total})
                </span>
              )}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  // T-PATCH-071: width:100% ensures the borderBottom spans the full panel width when
  // the chat panel is wide. Without this, the flex item is content-sized inside ctxRow
  // (flex row), so the divider line is cut short at wide widths.
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  // T-PATCH-096 AC-2: wider/taller header — larger horizontal+vertical padding.
  padding: '10px 28px',
  minHeight: 48,
  background: '#151515',
  borderBottom: '1px solid #2A2A2A',
  userSelect: 'none',
}

const baseNode: React.CSSProperties = {
  // T-PATCH-096 AC-2: larger phase text for header hierarchy.
  fontSize: 14,
  padding: '5px 12px',
  borderRadius: 4,
  cursor: 'default',
  whiteSpace: 'nowrap',
}

const activeNode: React.CSSProperties = {
  ...baseNode,
  background: '#1A1030',
  color: '#8B5CF6',
  fontWeight: 600,
}

const inactiveNode: React.CSSProperties = {
  ...baseNode,
  color: '#707070',
  background: 'transparent',
}

// T-PATCH-096 AC-3: version is a secondary hierarchy — muted/neutral so it does
// not compete with the phase active purple (#8B5CF6).
const versionNode: React.CSSProperties = {
  ...baseNode,
  color: '#9A9AA0',
  background: '#1E1E1E',
  border: '1px solid #2F2F2F',
  fontWeight: 600,
}

const chevron: React.CSSProperties = {
  color: '#3A3A3A',
  fontSize: 16,
  margin: '0 3px',
  lineHeight: 1,
}

// T-PATCH-096 §4.b AC-4b: per-phase (done/total) counter — subordinate metadata.
// Single neutral muted token for all phases (never purple-on-inactive, never bold);
// opacity 0.7 + the title tooltip flag the count as an approximation.
const counterNode: React.CSSProperties = {
  marginLeft: 4,
  fontSize: 10,
  fontWeight: 400,
  color: '#707070',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.7,
  whiteSpace: 'nowrap',
}
