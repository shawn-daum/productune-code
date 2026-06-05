/**
 * UsageBar — near-live Claude session / weekly usage display (T-025).
 *
 * Renders a compact two-row indicator below the chat input showing:
 *   - 5-hour session usage:   % fill progress bar + "resets in Xh Ym"
 *   - 7-day weekly usage:     % fill progress bar + "resets in Xd Xh"
 *
 * Data source: ~/.productune/usage-state.json written by the statusLine hook.
 * Updates via IPC channel `productune:usage-update` (main → renderer).
 *
 * Caveats:
 *   - Data is only available for claude.ai / firstParty subscribers. The
 *     component renders nothing when no data is present (free-tier / API-key
 *     users are unaffected — chat layout unchanged).
 *   - Updates occur only when Claude Code refreshes its statusline (active
 *     session). Fully idle sessions will show the last known state.
 *   - `resets_at` may be a unix epoch number (from statusline hook) or an ISO
 *     string. Both are handled.
 *
 * Design: design-system tokens, lucide-react only, no amber color.
 */

import { useEffect, useRef, useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageAxis {
  used_percentage: number
  resets_at?: string | number
}

interface UsagePayload {
  five_hour?: UsageAxis
  seven_day?: UsageAxis
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UsageBar() {
  const [payload, setPayload] = useState<UsagePayload | null>(null)

  useEffect(() => {
    const api = (window as any).api
    if (!api?.onUsageUpdate) return
    const unsub = api.onUsageUpdate((p: UsagePayload) => setPayload(p))
    return unsub
  }, [])

  // Render nothing when no data (non-subscriber / fully idle).
  if (!payload || (!payload.five_hour && !payload.seven_day)) return null

  return (
    <div style={container}>
      {payload.five_hour && (
        <UsageRow
          icon={<Clock size={10} strokeWidth={2} style={{ color: '#8B8B9E', flexShrink: 0 }} />}
          label="5h"
          axis={payload.five_hour}
        />
      )}
      {payload.seven_day && (
        <UsageRow
          icon={<CalendarDays size={10} strokeWidth={2} style={{ color: '#8B8B9E', flexShrink: 0 }} />}
          label="7d"
          axis={payload.seven_day}
        />
      )}
    </div>
  )
}

// ── UsageRow ──────────────────────────────────────────────────────────────────

interface UsageRowProps {
  icon: React.ReactNode
  label: string
  axis: UsageAxis
}

function UsageRow({ icon, label, axis }: UsageRowProps) {
  // Clamp 0..100, then round to an integer (kill float artifacts like
  // "55.00000000000001%"). Math.round (not ceil) so a remaining-% never
  // rounds UP past the actual value.
  const pct = Math.round(Math.max(0, Math.min(100, axis.used_percentage)))
  const resetLabel = useResetLabel(axis.resets_at)

  // Color: green below 70%, yellow-green 70-89%, red 90%+.
  // No amber (#FBBF24) per ticket spec.
  const barColor =
    pct >= 90 ? '#EF4444'  // --health-error red
    : pct >= 70 ? '#84CC16'  // lime-500
    : '#22C55E'              // green-500

  return (
    <div style={rowWrap}>
      {icon}
      <span style={labelStyle}>{label}</span>
      {/* track — fixed width so 5h/7d rows share the same scale (comparable) */}
      <div style={track}>
        <div style={{ ...fill, width: `${pct}%`, background: barColor }} />
      </div>
      <span style={pctLabel}>{pct}%</span>
      {resetLabel && <span style={resetStyle}>{resetLabel}</span>}
    </div>
  )
}

// ── Reset label hook ──────────────────────────────────────────────────────────

/**
 * Derives a human-readable "resets in Xh" / "resets in Xd Xh" string.
 * Ticks every minute (low overhead). Returns null when resets_at is absent.
 */
function useResetLabel(resetsAt: string | number | undefined): string | null {
  const [label, setLabel] = useState<string | null>(() => computeLabel(resetsAt))
  // Keep resetsAt in a ref so the interval closure always sees the latest value.
  const resetsAtRef = useRef(resetsAt)
  resetsAtRef.current = resetsAt

  useEffect(() => {
    if (resetsAt == null) {
      setLabel(null)
      return
    }
    setLabel(computeLabel(resetsAtRef.current))
    const id = setInterval(() => setLabel(computeLabel(resetsAtRef.current)), 60_000)
    return () => clearInterval(id)
  }, [resetsAt])

  return label
}

function computeLabel(resetsAt: string | number | undefined): string | null {
  if (resetsAt == null) return null
  let epochMs: number
  if (typeof resetsAt === 'number') {
    // Unix epoch seconds (from statusline hook) vs ms: values < 1e12 are seconds.
    epochMs = resetsAt < 1e12 ? resetsAt * 1_000 : resetsAt
  } else {
    epochMs = Date.parse(resetsAt)
  }
  if (isNaN(epochMs)) return null
  const diffSec = Math.max(0, Math.round((epochMs - Date.now()) / 1_000))
  if (diffSec === 0) return 'resetting'
  const days = Math.floor(diffSec / 86_400)
  const hours = Math.floor((diffSec % 86_400) / 3_600)
  const mins = Math.floor((diffSec % 3_600) / 60)
  if (days > 0) {
    return hours > 0 ? `resets in ${days}d ${hours}h` : `resets in ${days}d`
  }
  if (hours > 0) {
    return mins > 0 ? `resets in ${hours}h ${mins}m` : `resets in ${hours}h`
  }
  return `resets in ${mins}m`
}

// ── Styles ────────────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '4px 12px',
  borderTop: '1px solid #1C1C1C',
  background: '#0F0F0F',
}

const rowWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: 16,
  minWidth: 0,
}

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#606070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  flexShrink: 0,
  width: 16,
  textAlign: 'right',
}

const track: React.CSSProperties = {
  // Fixed width (not flex) → both rows render an identical-length track so
  // the 5h vs 7d fills are visually comparable regardless of reset-label text.
  width: 120,
  height: 4,
  background: '#252530',
  borderRadius: 2,
  overflow: 'hidden',
  flexShrink: 0,
}

const fill: React.CSSProperties = {
  height: '100%',
  borderRadius: 2,
  transition: 'width 0.4s ease',
}

const pctLabel: React.CSSProperties = {
  fontSize: 9,
  color: '#606070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  flexShrink: 0,
  width: 28,
  textAlign: 'right',
}

const resetStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#505060',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
