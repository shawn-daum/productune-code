/**
 * stage-mapping.ts — single source of truth for 6-stage strip.
 *
 * Maps po-state `current_phase` + `current_task.stage` to the 6 visual stages:
 *   PRD / Design / Build / QA / Deploy / Operate
 *
 * Color tokens mirror mockup.html CSS variables (--stage-*).
 */

import type { PoState } from './types'

export interface StageDef {
  key: 'prd' | 'design' | 'build' | 'qa' | 'deploy' | 'operate'
  /** Display label — English fixed (고유어, no i18n translation needed). */
  label: string
  /** Stage color hex — matches --stage-* CSS var in mockup. */
  color: string
}

export const STAGE_DEFS: StageDef[] = [
  { key: 'prd',     label: 'PRD',     color: '#A78BFA' },
  { key: 'design',  label: 'Design',  color: '#F472B6' },
  { key: 'build',   label: 'Build',   color: '#38BDF8' },
  { key: 'qa',      label: 'QA',      color: '#34D399' },
  { key: 'deploy',  label: 'Deploy',  color: '#FB923C' },
  { key: 'operate', label: 'Operate', color: '#FBBF24' },
]

/**
 * Returns the active stage index (0-5) based on po-state.
 * Priority: phase 4 → deploy stage → qa stage → build stages → design → PRD (default).
 */
export function getActiveStageIndex(poState: PoState | null): number {
  if (!poState) return 0

  const phase = poState.current_phase
  const taskStage = poState.current_task?.stage

  if (phase === 4) return 5                                               // Operate (Close)
  if (taskStage === 'deploy') return 4                                    // Deploy
  if (taskStage === 'qa') return 3                                        // QA
  if (taskStage === 'impl' || taskStage === 'refactor' || taskStage === 'test') return 2  // Build
  if (phase === 2 || taskStage === 'design') return 1                     // Design
  return 0                                                                // PRD (phase 1 or no state)
}

/**
 * Returns the StageDef for the currently active stage.
 */
export function getActiveStageDef(poState: PoState | null): StageDef {
  return STAGE_DEFS[getActiveStageIndex(poState)]
}

export type StageItemState = 'done' | 'cur' | 'pending'

export function getItemState(itemIndex: number, activeIndex: number): StageItemState {
  if (itemIndex < activeIndex) return 'done'
  if (itemIndex === activeIndex) return 'cur'
  return 'pending'
}
