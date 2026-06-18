/**
 * phase-mapping.ts — single source of truth for the 5-phase strip.
 *
 * Maps po-state `current_phase` (1..5) to the 5 user-visible phases
 * 1:1 (no hybrid logic — `current_task.type` no longer participates in
 * phase-strip activation, since phase and ticket-type are distinct axes
 * per v2 doctrine).
 *
 *   PRD / Design / Build / Deploy / Close
 *
 * Color tokens mirror design-system §2.6 Phase (5 hex). Hex values are
 * inlined here for now; CSS-variable migration tracked in design-system §17.
 *
 * Renamed from `stage-mapping.ts` (v2 doctrine sub-b).
 */

import type { PoState, Phase, Ticket, PendingGate } from './types'
import { normalizeStatus } from './useTicketScan'

export interface PhaseDef {
  key: 'prd' | 'design' | 'build' | 'deploy' | 'close'
  /** Display label — English fixed (고유어, no i18n translation needed). */
  label: string
  /** Phase color hex — matches --phase-* CSS var (design-system §2.6). */
  color: string
}

export const PHASE_DEFS: PhaseDef[] = [
  { key: 'prd',     label: 'PRD',     color: '#FB923C' },  // designer alias (T-006 Option B)
  { key: 'design',  label: 'Design',  color: '#F472B6' },  // pink-400
  { key: 'build',   label: 'Build',   color: '#38BDF8' },  // dev alias
  { key: 'deploy',  label: 'Deploy',  color: '#FB923C' },  // orange-400
  { key: 'close',   label: 'Close',   color: '#34D399' },  // emerald-400 (success / qa alias)
]

/**
 * Returns the active phase index (0-4) from `current_phase` (1..5).
 *
 * Fallback chain (T-P4-115):
 *   1. `current_phase` if in range 1..5
 *   2. Latest `phase_history` entry's `phase` if available
 *   3. Default 0 (PRD)
 *
 * Handles paepyeong-style state where current_phase is undefined but
 * phase_history already has entries from a prior manual jq write.
 */
export function getActivePhaseIndex(poState: PoState | null): number {
  const phase = poState?.current_phase
  if (typeof phase === 'number' && phase >= 1 && phase <= 5) return phase - 1

  // Fallback: use latest phase_history entry when current_phase missing/invalid
  const history = poState?.phase_history
  if (Array.isArray(history) && history.length > 0) {
    const latest = history[history.length - 1].phase
    if (typeof latest === 'number' && latest >= 1 && latest <= 5) return latest - 1
  }

  return 0  // default PRD
}

/**
 * Returns the PhaseDef for the currently active phase.
 */
export function getActivePhaseDef(poState: PoState | null): PhaseDef {
  return PHASE_DEFS[getActivePhaseIndex(poState)]
}

export type PhaseItemState = 'done' | 'cur' | 'pending'

export function getItemState(itemIndex: number, activeIndex: number): PhaseItemState {
  if (itemIndex < activeIndex) return 'done'
  if (itemIndex === activeIndex) return 'cur'
  return 'pending'
}

// ── T-PATCH-096 §4.b: ticket `type` → phase bucket (single source of truth) ──
//
// APPROXIMATION, not the doctrine phase axis. There is no reliable per-phase
// attribution in existing data (see ticket §4.b data-source investigation), so
// the only parsed + semantically phase-adjacent axis — ticket `type` — is
// bucketed into the 5 phases for an "approximate" done/total counter.
//
// Bucketed on the raw `type` (tolerant): canonical `TaskType` plus on-disk
// non-canonical types (`feature`, `build`, `bug`, `fix`, `chore`) that appear
// in frontmatter. `doctrine`/`doctrine-*` and any unmapped/legacy composite are
// excluded from all buckets (not product-cycle work).
const TYPE_TO_PHASE: Record<string, Phase> = {
  // PRD
  feature: 'PRD',
  docs: 'PRD',
  // Design
  design: 'Design',
  // Build
  impl: 'Build',
  refactor: 'Build',
  build: 'Build',
  bug: 'Build',
  fix: 'Build',
  chore: 'Build',
  // Deploy
  deploy: 'Deploy',
  // Close
  qa: 'Close',
  test: 'Close',
  close: 'Close',
}

export interface PhaseCount {
  done: number
  total: number
}

export type PhaseCounts = Record<Phase, PhaseCount>

/**
 * Buckets tickets (filtered to `version`) by the `TYPE_TO_PHASE` map and returns
 * per-phase `{ done, total }`.
 *
 * Rules (ticket §4.b):
 *  - scope: only tickets whose `version === version` (current version).
 *  - `abandoned` tickets are dropped (count toward neither done nor total).
 *  - bucket on `t.type ?? t.stage`; unmapped/excluded types contribute nowhere.
 *  - total = bucketed live tickets; done = those whose normalized status === 'done'.
 */
// ── T-PATCH-203: phase-boundary close_gate mapping (boundary-generic) ──────────
//
// Renders an interactive gate marker on the PhaseBreadcrumb boundary between two
// phases. Data-driven: the boundary AFTER `boundaryAfterPhase` (the chevron that
// precedes the next phase) carries the gate. To add a gate to another boundary,
// add an entry here — PhaseBreadcrumb renders it automatically (AC-5).
//
// `items` lists the close_gate steps expected at that boundary, in display order,
// with their i18n label/desc keys. The internal `step` key is immutable (matches
// po-state close_gate[].step and ~/.productune/config/close-gate.p3.json) — only
// the display label is humanized (AC-3). design_review / prd_check / security_6
// keep their real domain terms; backlog_triage gets a plain display label.

/** A close_gate item's resolved state, as written to po-state by the gate hooks. */
export type GateItemStatus = 'done' | 'pending' | 'waived' | 'na'

/** One entry from po-state `close_gate[]` (materialized by prompt-gate-inject.sh). */
export interface CloseGateItem {
  step: string
  status?: GateItemStatus | string
  waivable?: boolean
  type?: string
}

/** Display metadata for a single gate step (i18n keys, immutable internal step key). */
export interface GateItemDef {
  /** Internal close_gate step key — immutable, matches po-state + canonical config. */
  step: string
  /** i18n key for the human-facing label. */
  labelKey: string
  /** i18n key for the 1-line description shown in the popover. */
  descKey: string
}

/** A phase boundary that carries a gate. The marker replaces the chevron that
 *  precedes `boundaryAfterPhase` (i.e. the boundary between it and its predecessor). */
export interface GateBoundaryDef {
  /** The phase whose ENTRY is gated — the marker renders on the chevron before it. */
  boundaryAfterPhase: Phase
  /** po-state `current_phase` number (1..5) of the gated phase — i.e. the gate's
   *  `to_phase`. Its predecessor (`toPhaseNum - 1`) is the `from_phase`. Used to
   *  decide whether a live `pending_gate` envelope points at THIS boundary. */
  toPhaseNum: number
  /** i18n key for the popover heading (conceptual framing of this checkpoint). */
  titleKey: string
  /** Gate steps at this boundary, in display order. */
  items: GateItemDef[]
}

/**
 * Boundary → gate mapping. Currently only the Build→Deploy boundary (P3 close_gate)
 * has a gate, so only the `Deploy` entry exists. Adding another boundary here makes
 * its marker render with no other code change (AC-5).
 */
export const GATE_BOUNDARIES: GateBoundaryDef[] = [
  {
    boundaryAfterPhase: 'Deploy',
    toPhaseNum: 4,  // Build(3) → Deploy(4): the P3 close_gate guards this transition.
    titleKey: 'workspace.gateMarker.deploy.title',
    items: [
      { step: 'backlog_triage', labelKey: 'workspace.gateMarker.items.backlog_triage.label', descKey: 'workspace.gateMarker.items.backlog_triage.desc' },
      { step: 'design_review',  labelKey: 'workspace.gateMarker.items.design_review.label',  descKey: 'workspace.gateMarker.items.design_review.desc' },
      { step: 'prd_check',      labelKey: 'workspace.gateMarker.items.prd_check.label',      descKey: 'workspace.gateMarker.items.prd_check.desc' },
      { step: 'security_6',     labelKey: 'workspace.gateMarker.items.security_6.label',     descKey: 'workspace.gateMarker.items.security_6.desc' },
    ],
  },
]

/** Returns the gate boundary def whose marker should render before `phase`, or null. */
export function getGateBoundary(phase: Phase): GateBoundaryDef | null {
  return GATE_BOUNDARIES.find((b) => b.boundaryAfterPhase === phase) ?? null
}

/** A close_gate item is "satisfied" (no longer blocking) when done/waived/na. */
export function isGateItemSatisfied(status: string | undefined): boolean {
  return status === 'done' || status === 'waived' || status === 'na'
}

export interface GateAggregate {
  /** Satisfied (done/waived/na) item count. */
  satisfied: number
  /** Total items at this boundary. */
  total: number
  /** True when every item is satisfied → the boundary passes. */
  passed: boolean
}

/**
 * Aggregates a boundary's items against the live close_gate slice from po-state.
 *
 * Graceful fallback (AC-6): when `closeGate` is missing/empty/not an array, items
 * default to `pending` (unknown) but the aggregate is treated as PASSED — the
 * marker falls back to pass/no-block rather than showing a false N/M block or
 * crashing. The popover still lists the items with status 'pending'.
 */
export function aggregateGate(
  def: GateBoundaryDef,
  closeGate: CloseGateItem[] | null | undefined,
): GateAggregate {
  const byStep = new Map<string, CloseGateItem>()
  if (Array.isArray(closeGate)) {
    for (const it of closeGate) {
      if (it && typeof it.step === 'string') byStep.set(it.step, it)
    }
  }
  const hasData = byStep.size > 0
  const total = def.items.length
  let satisfied = 0
  for (const item of def.items) {
    const live = byStep.get(item.step)
    if (live && isGateItemSatisfied(typeof live.status === 'string' ? live.status : undefined)) {
      satisfied += 1
    }
  }
  // No live data → pass-fallback (AC-6); otherwise pass only when all satisfied.
  const passed = !hasData || satisfied === total
  return { satisfied, total, passed }
}

/**
 * Whether a boundary's gate is "engaged" — i.e. the project has actually entered
 * the close/transition sequence for this boundary, so the gate marker should
 * replace the plain chevron (T-PATCH-203 follow-up §1, "B trigger").
 *
 * The P3 `close_gate` is instantiated on P3 ENTRY and lives there for the whole
 * Build phase — so its mere *existence* is not a trigger (else `0/4` shows the
 * instant Build opens, implying the user is "behind"). The marker engages only on:
 *
 *   (a) a live `pending_gate` envelope pointing at THIS boundary — the PO emitted
 *       the phase-transition gate (from_phase = toPhaseNum-1, or to_phase =
 *       toPhaseNum), i.e. it is actively asking to cross this boundary; OR
 *   (b) any of this boundary's close_gate items has moved off `pending`
 *       (status !== 'pending') — the close sequence has started/progressed.
 *
 * Neither → return false → caller falls back to a plain chevron. When `closeGate`
 * is absent/empty (graceful AC-6 fallback), only (a) can engage it.
 */
export function isGateEngaged(
  def: GateBoundaryDef,
  closeGate: CloseGateItem[] | null | undefined,
  pendingGate: PendingGate | null | undefined,
): boolean {
  // (a) pending_gate points at this boundary (match on to_phase, or from_phase
  //     when to_phase is absent/null e.g. terminal-phase envelopes).
  if (pendingGate) {
    if (typeof pendingGate.to_phase === 'number' && pendingGate.to_phase === def.toPhaseNum) return true
    if (
      (pendingGate.to_phase == null) &&
      typeof pendingGate.from_phase === 'number' &&
      pendingGate.from_phase === def.toPhaseNum - 1
    ) return true
  }
  // (b) any item at this boundary has left 'pending' (close sequence engaged).
  if (Array.isArray(closeGate)) {
    const steps = new Set(def.items.map((i) => i.step))
    for (const it of closeGate) {
      if (it && typeof it.step === 'string' && steps.has(it.step)) {
        const s = typeof it.status === 'string' ? it.status : undefined
        if (s && s !== 'pending') return true
      }
    }
  }
  return false
}

/** Resolves the live status of a single gate step (default 'pending' if absent). */
export function resolveItemStatus(
  step: string,
  closeGate: CloseGateItem[] | null | undefined,
): GateItemStatus {
  if (Array.isArray(closeGate)) {
    const live = closeGate.find((it) => it && it.step === step)
    const s = live && typeof live.status === 'string' ? live.status : undefined
    if (s === 'done' || s === 'pending' || s === 'waived' || s === 'na') return s
  }
  return 'pending'
}

export function bucketTicketsByPhase(tickets: Ticket[], version: string | null): PhaseCounts {
  const counts: PhaseCounts = {
    PRD: { done: 0, total: 0 },
    Design: { done: 0, total: 0 },
    Build: { done: 0, total: 0 },
    Deploy: { done: 0, total: 0 },
    Close: { done: 0, total: 0 },
  }
  if (!version) return counts

  for (const t of tickets) {
    if (t.version !== version) continue
    const status = normalizeStatus(t.status)
    if (status === 'abandoned') continue
    const rawType = (t.type ?? t.stage) as string | undefined
    if (!rawType) continue
    const phase = TYPE_TO_PHASE[rawType]
    if (!phase) continue  // doctrine / unmapped / legacy composite → excluded
    counts[phase].total += 1
    if (status === 'done') counts[phase].done += 1
  }

  return counts
}
