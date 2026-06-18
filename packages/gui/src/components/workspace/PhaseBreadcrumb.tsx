import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Lock, Check } from 'lucide-react'
import type { Phase } from '../../lib/types'
import {
  type PhaseCounts,
  type CloseGateItem,
  type GateItemStatus,
  getGateBoundary,
  aggregateGate,
  resolveItemStatus,
} from '../../lib/phase-mapping'

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
  // T-PATCH-203: live close_gate slice from po-state (materialized by the gate
  // hooks). Drives the boundary gate marker. Absent/empty → graceful pass-fallback.
  closeGate?: CloseGateItem[] | null
}

export default function PhaseBreadcrumb({ phase, version, phaseCounts, closeGate }: Props) {
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
        // T-PATCH-203: a boundary gate renders before phase `p` when the mapping
        // table has an entry for it (AC-5 — data-driven). Otherwise plain chevron.
        const gateBoundary = i > 0 ? getGateBoundary(p) : null
        return (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && (
              gateBoundary
                ? <GateMarker boundaryPhase={p} closeGate={closeGate} />
                : <span style={chevron}>›</span>
            )}
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

// ── GateMarker (T-PATCH-203) ────────────────────────────────────────────────────
//
// Replaces the boundary chevron with an interactive close_gate marker:
//   - blocked (some item unsatisfied) → lock + `N/M` (amber/purple)
//   - passed  (all done/waived/na, or no live data → fallback) → check (muted)
// Click toggles a popover anchored to the marker listing each item's label,
// status and 1-line description.

interface GateMarkerProps {
  boundaryPhase: Phase
  closeGate?: CloseGateItem[] | null
}

function GateMarker({ boundaryPhase, closeGate }: GateMarkerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // T-PATCH-203 fix: the popover is rendered via a portal to document.body so it
  // escapes the breadcrumb grid cell's `overflow:hidden` (and the shell grid's
  // own `overflow:hidden`) — otherwise it is clipped below the strip, behind the
  // main pane. We anchor it with fixed positioning off the marker's bounding rect.
  const [rect, setRect] = useState<DOMRect | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // getGateBoundary is guaranteed non-null by the caller, but re-resolve so the
  // component is self-contained and the type narrows.
  const def = getGateBoundary(boundaryPhase)

  // Close on outside click / Escape (AC-2 popover lifecycle). With the portal the
  // popover lives outside the anchor subtree, so the outside-click test must also
  // spare clicks that land inside the popover itself.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Keep the fixed-positioned popover glued to the marker while it is open:
  // recompute the anchor rect on window resize / scroll (capture phase catches
  // inner scroll containers too). Position is also computed on open via toggle().
  useEffect(() => {
    if (!open) return
    const recompute = () => setRect(anchorRef.current?.getBoundingClientRect() ?? null)
    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [open])

  if (!def) return <span style={chevron}>›</span>

  const agg = aggregateGate(def, closeGate)
  const blocked = !agg.passed

  const markerLabel = blocked
    ? t('workspace.gateMarker.blockedAria', { satisfied: agg.satisfied, total: agg.total })
    : t('workspace.gateMarker.passedAria')

  const toggle = () => {
    if (!open) setRect(anchorRef.current?.getBoundingClientRect() ?? null)
    setOpen((v) => !v)
  }

  return (
    <div ref={anchorRef} style={markerAnchor}>
      <button
        type="button"
        aria-label={markerLabel}
        aria-expanded={open}
        title={markerLabel}
        onClick={toggle}
        style={blocked ? markerBtnBlocked : markerBtnPassed}
      >
        {blocked ? <Lock size={11} strokeWidth={2.4} /> : <Check size={12} strokeWidth={2.6} />}
        {blocked && (
          <span style={markerCount}>{agg.satisfied}/{agg.total}</span>
        )}
      </button>
      {open && rect && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t(def.titleKey)}
          style={{
            ...popover,
            // Anchored just below the marker, horizontally centered on it, then
            // clamped to the viewport so a marker near the right edge does not push
            // the popover off-screen.
            top: rect.bottom + 8,
            left: clampPopoverLeft(rect.left + rect.width / 2),
          }}
        >
          <div style={popoverTitle}>{t(def.titleKey)}</div>
          <div style={popoverList}>
            {def.items.map((item) => {
              const status = resolveItemStatus(item.step, closeGate)
              return (
                <div key={item.step} style={popoverItem}>
                  <div style={popoverItemHead}>
                    <span style={popoverItemLabel}>{t(item.labelKey)}</span>
                    <StatusBadge status={status} />
                  </div>
                  <div style={popoverItemDesc}>{t(item.descKey)}</div>
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Center the 320px popover on `centerX` (viewport coord), then keep an 8px gutter
// on both edges. translateX(-50%) on the popover style handles the centering; this
// only clamps the center point so the box stays fully on-screen.
const POPOVER_WIDTH = 320
function clampPopoverLeft(centerX: number): number {
  const half = POPOVER_WIDTH / 2
  const min = half + 8
  const max = window.innerWidth - half - 8
  if (max < min) return window.innerWidth / 2
  return Math.min(Math.max(centerX, min), max)
}

function StatusBadge({ status }: { status: GateItemStatus }) {
  const { t } = useTranslation()
  const style = STATUS_BADGE_STYLE[status]
  return <span style={style}>{t(`workspace.gateMarker.status.${status}`)}</span>
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

// ── T-PATCH-203 gate marker + popover styles ─────────────────────────────────────

const markerAnchor: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  margin: '0 3px',
}

const markerBtnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  height: 20,
  padding: '0 6px',
  borderRadius: 4,
  cursor: 'pointer',
  lineHeight: 1,
  fontSize: 11,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

// blocked: amber lock + purple-tinted surface (the "wall" between phases).
const markerBtnBlocked: React.CSSProperties = {
  ...markerBtnBase,
  color: '#FBBF24',          // amber-400
  background: '#241A33',     // purple-tinted surface
  border: '1px solid #4C2F6B',
}

// passed: muted check, low-contrast — no longer a focal point.
const markerBtnPassed: React.CSSProperties = {
  ...markerBtnBase,
  color: '#6B7280',          // muted gray
  background: 'transparent',
  border: '1px solid #2A2A2A',
}

const markerCount: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
}

const popover: React.CSSProperties = {
  // Portaled to document.body → fixed positioning off the marker rect (top/left
  // injected at render time). translateX(-50%) re-centers the 320px box on the
  // clamped center point. zIndex sits above modals' backdrop tier so the strip
  // popover is never occluded by the main pane.
  position: 'fixed',
  transform: 'translateX(-50%)',
  zIndex: 950,
  width: POPOVER_WIDTH,
  maxWidth: '80vw',
  background: '#1C1C20',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
  padding: '12px 14px',
  cursor: 'default',
}

const popoverTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#E5E5E5',
  marginBottom: 10,
}

const popoverList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const popoverItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const popoverItemHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const popoverItemLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#D4D4D8',
}

const popoverItemDesc: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  color: '#8A8A90',
}

const statusBadgeBase: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 3,
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const STATUS_BADGE_STYLE: Record<GateItemStatus, React.CSSProperties> = {
  done:    { ...statusBadgeBase, color: '#34D399', background: '#11271F' },  // emerald
  pending: { ...statusBadgeBase, color: '#FBBF24', background: '#241A33' },  // amber
  waived:  { ...statusBadgeBase, color: '#A0A0A8', background: '#26262B' },  // muted
  na:      { ...statusBadgeBase, color: '#707078', background: '#1F1F23' },  // dimmest
}
