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

import type { PoState, Phase, Ticket } from './types'
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
