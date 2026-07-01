import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ListChecks, Check } from 'lucide-react'
import type { Phase, PendingGate } from '../../lib/types'
import {
  type PhaseCounts,
  type CloseGateItem,
  type GateItemStatus,
  getGateBoundary,
  aggregateGate,
  resolveItemStatus,
  isGateEngaged,
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
  // T-PATCH-203 follow-up §1: live pending_gate envelope from po-state. Used (with
  // closeGate) to decide whether a boundary's gate is "engaged" — i.e. show the
  // marker — vs. dormant (close_gate exists from P3 entry but untouched) → chevron.
  pendingGate?: PendingGate | null
  // T-PATCH-276 (#22): click a phase pill → open its document in a main tab. Fired
  // only for phases that have a mapped destination (see clickablePhases). Absent →
  // pills are non-interactive (legacy behavior).
  onPhaseClick?: (phase: Phase) => void
  // T-PATCH-276: the subset of phases that resolve to an openable destination. A
  // phase not in this set renders as a plain (non-clickable) pill. PRD is the
  // minimum; others are added as their destinations get wired.
  clickablePhases?: ReadonlySet<Phase>
}

export default function PhaseBreadcrumb({ phase, version, phaseCounts, closeGate, pendingGate, onPhaseClick, clickablePhases }: Props) {
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
        // T-PATCH-203: a boundary gate is defined before phase `p` when the mapping
        // table has an entry for it (AC-5 — data-driven). T-PATCH-203 follow-up §1:
        // it only RENDERS as a marker once the gate is "engaged" (pending_gate
        // points here, or a close_gate item left 'pending'); otherwise — including
        // the whole P3 build before the close sequence starts — a plain chevron.
        const gateBoundary = i > 0 ? getGateBoundary(p) : null
        const showGate = !!gateBoundary && isGateEngaged(gateBoundary, closeGate, pendingGate)
        return (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && (
              showGate
                ? <GateMarker boundaryPhase={p} closeGate={closeGate} />
                : <span style={chevron}>›</span>
            )}
            {(() => {
              // T-PATCH-276 (#22): render a clickable button when this phase has a
              // mapped destination; otherwise the original non-interactive span.
              // Active-phase highlight (activeNode) is preserved in both forms.
              const isActive = p === phase
              const baseStyle = isActive ? activeNode : inactiveNode
              const clickable = !!onPhaseClick && (clickablePhases?.has(p) ?? false)
              const countEl = showCount && (
                // T-PATCH-096 §4.b AC-4b: muted, subordinate, tabular-nums,
                // opacity 0.7 + tooltip — honestly marks the count as approximate.
                <span style={counterNode} title="approximate — by ticket type, current version">
                  ({count.done}/{count.total})
                </span>
              )
              if (clickable) {
                return (
                  <button
                    type="button"
                    style={{ ...baseStyle, ...phaseButtonReset, cursor: 'pointer' }}
                    onClick={() => onPhaseClick!(p)}
                    title={`Open ${p}`}
                    aria-label={`Open ${p}`}
                  >
                    {p}
                    {countEl}
                  </button>
                )
              }
              return (
                <span style={baseStyle}>
                  {p}
                  {countEl}
                </span>
              )
            })()}
          </span>
        )
      })}
    </div>
  )
}

// ── GateMarker (T-PATCH-203) ────────────────────────────────────────────────────
//
// Replaces the boundary chevron with an interactive close_gate marker. It sits
// AT the phase boundary, so it reads as "<icon> N/M ›" — the trailing chevron is
// the same boundary glyph the non-gate boundaries use:
//   - blocked (some item unsatisfied) → checklist icon + `N/M` + `›` (amber/purple)
//   - passed  (all done/waived/na, or no live data → fallback) → check + `›` (muted)
// The checklist icon (lucide ListChecks) reads as "inspection / review", NOT
// "locked" — these are review checkpoints, not access gates.
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
        {/* T-PATCH-203 redesign: checklist icon ("inspection") replaces the lock
            ("locked"). Sized ~1em so it stays compact in the horizontal strip. */}
        {blocked
          ? <ListChecks size={13} strokeWidth={2} />
          : <Check size={13} strokeWidth={2.6} />}
        {blocked && (
          <span style={markerCount}>{agg.satisfied}/{agg.total}</span>
        )}
        {/* Trailing boundary chevron — same glyph the non-gate boundaries use, so
            the marker reads as "<icon> N/M ›" sitting AT the phase boundary. */}
        <span style={markerChevron}>›</span>
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
                    {/* T-PATCH-203 follow-up §2: localized label + immutable canonical
                        step key as a small monospace tag (searchability — the key is
                        what appears in po-state / close-gate config). */}
                    <span style={popoverItemLabelWrap}>
                      <span style={popoverItemLabel}>{t(item.labelKey)}</span>
                      <code style={popoverItemKey}>{item.step}</code>
                    </span>
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

// T-PATCH-276 (#22): neutralize default <button> chrome so a clickable phase pill
// looks identical to the span form (only the cursor + hover affordance differ).
const phaseButtonReset: React.CSSProperties = {
  border: 'none',
  font: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
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

// blocked: amber checklist icon + count + purple-tinted surface (the checkpoint
// at the boundary — "review pending", not "locked").
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

// Trailing boundary chevron rendered inside the marker button. Same `›` glyph and
// ~size as the non-gate boundary chevron, but `currentColor`/dimmed so it reads as
// a subordinate separator on either the amber (blocked) or muted (passed) surface
// rather than competing with the icon + count.
const markerChevron: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1,
  color: 'currentColor',
  opacity: 0.55,
  marginLeft: 1,
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

const popoverItemLabelWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  minWidth: 0,
  flexWrap: 'wrap',
}

const popoverItemLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#D4D4D8',
}

// T-PATCH-203 follow-up §2: canonical close_gate step key — small, dim, monospace.
// Subordinate to the localized label; preserves the raw key for searchability.
const popoverItemKey: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9.5,
  color: '#6B6B72',
  background: '#202024',
  border: '1px solid #2C2C30',
  borderRadius: 3,
  padding: '0 4px',
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
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
