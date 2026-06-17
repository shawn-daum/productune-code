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

interface UsageBarProps {
  /**
   * T-PATCH-051: when true, renders without the top border / dark background —
   * used when embedded inline in the input row (wide panel layout).
   */
  inline?: boolean
  /**
   * T-PATCH-061: when true, renders both UsageRow items side-by-side in a
   * horizontal flex row above the textarea input area.
   */
  horizontal?: boolean
  /**
   * T-PATCH-173: bare horizontal cluster for embedding in the bottom StatusBar.
   * No border/background, compact 60px track, 5h/7d side-by-side. The per-axis
   * "resets in …" label is shown inline (restored — visibility over compactness;
   * the 34px status row accommodates it).
   */
  statusbar?: boolean
  /**
   * T-PATCH-173: optional leading label (e.g. "Session") prefixing the gauge
   * cluster in statusbar mode so users understand what the bars represent.
   * Rendered only when usage data is present (no dangling label).
   */
  sessionLabel?: string
}

export default function UsageBar({
  inline = false,
  horizontal = false,
  statusbar = false,
  sessionLabel,
}: UsageBarProps) {
  const [payload, setPayload] = useState<UsagePayload | null>(null)

  useEffect(() => {
    const api = (window as any).api
    if (!api?.onUsageUpdate) return
    const unsub = api.onUsageUpdate((p: UsagePayload) => setPayload(p))
    return unsub
  }, [])

  // Render nothing when no data (non-subscriber / fully idle).
  if (!payload || (!payload.five_hour && !payload.seven_day)) return null

  const containerStyle = statusbar
    ? containerStatusbar
    : horizontal
      ? containerHorizontal
      : inline
        ? containerInline
        : container

  return (
    <div style={containerStyle}>
      {/* T-PATCH-173: leading separator + "Session" label only in statusbar mode
          (data present) so the gauge cluster is self-explanatory. */}
      {statusbar && <span style={statusbarSep}>·</span>}
      {statusbar && sessionLabel && (
        <span style={sessionLabelStyle}>
          <Clock size={10} strokeWidth={2} style={{ color: '#6A6A78', flexShrink: 0 }} />
          {sessionLabel}
        </span>
      )}
      {payload.five_hour && (
        <UsageRow
          icon={<Clock size={10} strokeWidth={2} style={{ color: '#8B8B9E', flexShrink: 0 }} />}
          label="5h"
          axis={payload.five_hour}
          compact={statusbar}
        />
      )}
      {payload.seven_day && (
        <UsageRow
          icon={<CalendarDays size={10} strokeWidth={2} style={{ color: '#8B8B9E', flexShrink: 0 }} />}
          label="7d"
          axis={payload.seven_day}
          compact={statusbar}
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
  /**
   * T-PATCH-173: compact (statusbar) mode — narrower track. The inline
   * "resets in …" label is RESTORED (shown next to the %) per user request;
   * the 34px status row gives it room. Still mirrored on the row `title` for
   * the full string on hover when truncated.
   */
  compact?: boolean
}

function UsageRow({ icon, label, axis, compact = false }: UsageRowProps) {
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
    <div
      style={rowWrap}
      title={resetLabel ? `${label} ${pct}% — ${resetLabel}` : undefined}
    >
      {icon}
      <span style={labelStyle}>{label}</span>
      {/* track — fixed width so 5h/7d rows share the same scale (comparable) */}
      <div style={compact ? trackCompact : track}>
        <div style={{ ...fill, width: `${pct}%`, background: barColor }} />
      </div>
      <span style={compact ? pctLabelCompact : pctLabel}>{pct}%</span>
      {/* T-PATCH-173: reset label restored in BOTH modes. In compact (statusbar)
          mode a leading "·" separates % from the reset time → "34% · resets 4h 35m". */}
      {resetLabel && (
        <span style={compact ? resetStyleCompact : resetStyle}>
          {compact ? `· ${resetLabel}` : resetLabel}
        </span>
      )}
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

// T-PATCH-051: inline variant — no border-top/background; embedded in input row
const containerInline: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '4px 8px',
}

// T-PATCH-061: horizontal variant — both rows side-by-side above the textarea
const containerHorizontal: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 16,
  padding: '4px 12px',
  alignItems: 'center',
  borderTop: '1px solid #1C1C1C',
  background: '#0F0F0F',
  flexShrink: 0,
}

// T-PATCH-173: bare horizontal cluster for the bottom StatusBar — no border /
// background (StatusBar provides chrome), rows side-by-side, no own padding.
const containerStatusbar: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 14,
  alignItems: 'center',
  flexShrink: 0,
  minWidth: 0,
}

// T-PATCH-173: separator matching StatusBar's `sep` tone
const statusbarSep: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  flexShrink: 0,
  marginRight: 2,
}

// T-PATCH-173: leading "Session" label (clock icon + text) for statusbar cluster
const sessionLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: '#6A6A78',
  textTransform: 'uppercase',
  userSelect: 'none',
  flexShrink: 0,
  marginRight: 2,
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

// T-PATCH-173: compact track for statusbar embedding (no reset label → narrower)
const trackCompact: React.CSSProperties = {
  ...track,
  width: 60,
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

// T-PATCH-173: compact %-label — no right-padding reservation for reset label
const pctLabelCompact: React.CSSProperties = {
  ...pctLabel,
  width: 26,
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

// T-PATCH-173: compact reset label for the statusbar row — no flex-grow (would
// push BuildSegment); sits snug after the % with its leading "· " separator.
const resetStyleCompact: React.CSSProperties = {
  fontSize: 9,
  color: '#505060',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  marginLeft: 2,
}
