/**
 * StatusBar — bottom workspace chrome (T-P4-059 rewrite; T-PATCH-173 cleanup).
 *
 * Left cluster:  SessionHealthSegment  •  "Session" usage gauges (5h / 7d)
 * Right cluster: BuildSegment (T-PATCH-159 Build/Smoke launcher)
 *
 * T-PATCH-173 (Fork A): the bottom-left project slug (⌄) button + Recent
 * drop-up was removed entirely — it added no value (project switch lives in
 * File>Open / EntryGate). The usage gauges now carry a "Session" label and
 * the per-axis reset time is shown inline again (visibility > compactness).
 */

import { useTranslation } from 'react-i18next'
import SessionHealthSegment from './SessionHealthSegment'
import BuildSegment from './BuildSegment'
import UsageBar from './chat/UsageBar'

interface Props {
  onOpenHealthBanner?: () => void
}

export default function StatusBar({ onOpenHealthBanner }: Props) {
  const { t } = useTranslation()

  return (
    <div style={wrap}>
      {/* Left cluster */}
      <div style={cluster}>
        <SessionHealthSegment onOpenBanner={onOpenHealthBanner} />
        {/* T-PATCH-173: usage gauges(5h/7d) — horizontal inline cluster, statusbar
            variant. Self-renders a leading "Session" label + separator only when
            usage data exists (no dangling label / ·). */}
        <UsageBar statusbar sessionLabel={t('workspace.statusBar.session')} />
      </div>

      {/* Right cluster — Build(+Smoke) launcher (T-PATCH-159) */}
      <BuildSegment />
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'status',
  background: '#111111',
  borderTop: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  overflow: 'visible',
  // T-PATCH-173: bumped 28→34 so the restored inline "resets in …" label fits
  // alongside the gauge + % without crowding. Synced with WorkspaceShell
  // gridTemplateRows status row.
  height: 34,
  flexShrink: 0,
  position: 'relative',
}

const cluster: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  flex: 1,
  overflow: 'visible',
}
