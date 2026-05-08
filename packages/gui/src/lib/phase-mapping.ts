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

import type { PoState } from './types'

export interface PhaseDef {
  key: 'prd' | 'design' | 'build' | 'deploy' | 'close'
  /** Display label — English fixed (고유어, no i18n translation needed). */
  label: string
  /** Phase color hex — matches --phase-* CSS var (design-system §2.6). */
  color: string
}

export const PHASE_DEFS: PhaseDef[] = [
  { key: 'prd',     label: 'PRD',     color: '#A78BFA' },  // designer alias
  { key: 'design',  label: 'Design',  color: '#F472B6' },  // pink-400
  { key: 'build',   label: 'Build',   color: '#38BDF8' },  // dev alias
  { key: 'deploy',  label: 'Deploy',  color: '#FB923C' },  // orange-400
  { key: 'close',   label: 'Close',   color: '#34D399' },  // emerald-400 (success / qa alias)
]

/**
 * Returns the active phase index (0-4) from `current_phase` (1..5).
 * Defaults to 0 (PRD) when state absent or `current_phase` out of range.
 */
export function getActivePhaseIndex(poState: PoState | null): number {
  const phase = poState?.current_phase
  if (typeof phase !== 'number') return 0
  if (phase < 1 || phase > 5) return 0
  return phase - 1
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
