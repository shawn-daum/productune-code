/**
 * PhaseStrip — reusable phase visualization component (v2: 5 phase).
 *
 * variant="strip"  — Project tab sidebar.
 *                    Default = 1 dot (current phase, label + color only).
 *                    Hover  → 0.2s ease expand to 5 dots (active highlight).
 *                    Mouse leave → collapse back to 1 dot.
 * variant="chip"   — single pill showing the current phase (rp-ctx).
 *                    Always 1 chip. No hover expand.
 *
 * Both variants read po-state via prop (no internal store access — caller
 * controls the data source, single selector, no duplicate state).
 *
 * Renamed from StageStrip (v2 doctrine sub-b).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PHASE_DEFS,
  getActivePhaseIndex,
  getItemState,
  type PhaseItemState,
} from '../../lib/phase-mapping'
import type { PoState } from '../../lib/types'

interface Props {
  poState: PoState | null
  variant?: 'strip' | 'chip'
  /** When true, always render the 5-dot expanded form and disable mouse events.
   *  Used by VersionRow CSS-only hover popover (parent CSS drives visibility). */
  forceExpanded?: boolean
}

export default function PhaseStrip({ poState, variant = 'strip', forceExpanded = false }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const activeIndex = getActivePhaseIndex(poState)

  if (variant === 'chip') {
    const active = PHASE_DEFS[activeIndex]
    return (
      <span
        style={{ ...chipBase, color: active.color }}
        title={t('workspace.phaseStrip.chipAriaLabel', { phase: active.label })}
        aria-label={t('workspace.phaseStrip.chipAriaLabel', { phase: active.label })}
      >
        {active.label}
      </span>
    )
  }

  // variant=strip — default 1 dot, hover expand 5 dot
  const active = PHASE_DEFS[activeIndex]
  const isExpanded = forceExpanded || expanded

  return (
    <div
      style={stripWrap}
      aria-label={t('workspace.phaseStrip.stripAriaLabel')}
      role="list"
      onMouseEnter={forceExpanded ? undefined : () => setExpanded(true)}
      onMouseLeave={forceExpanded ? undefined : () => setExpanded(false)}
    >
      {!isExpanded ? (
        // Default: single dot + label of the current phase
        <div key={active.key} style={itemGroup} role="listitem">
          <span
            style={itemStyle('cur', active.color)}
            aria-current="step"
            title={t(`workspace.phaseStrip.phaseTooltip.${active.key}`)}
          >
            <span style={dotStyle('cur', active.color)} aria-hidden="true" />
            {active.label}
          </span>
        </div>
      ) : (
        // Expanded: full 5-dot row with active highlight
        PHASE_DEFS.map((def, i) => {
          const state: PhaseItemState = getItemState(i, activeIndex)
          const isLast = i === PHASE_DEFS.length - 1
          return (
            <div key={def.key} style={itemGroup} role="listitem">
              <span
                style={itemStyle(state, def.color)}
                aria-current={state === 'cur' ? 'step' : undefined}
                title={t(`workspace.phaseStrip.phaseTooltip.${def.key}`)}
              >
                <span style={dotStyle(state, def.color)} aria-hidden="true" />
                {def.label}
              </span>
              {!isLast && (
                <span style={separatorStyle} aria-hidden="true">›</span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const stripWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  padding: '5px 8px',
  overflowX: 'auto',
  flexWrap: 'nowrap',
  // hide scrollbar visually but keep scroll functional
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  // smooth expand/collapse transition (the children re-flow naturally)
  transition: 'all 0.2s ease',
} as React.CSSProperties

const itemGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  flexShrink: 0,
}

const separatorStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#333',
  padding: '0 1px',
  flexShrink: 0,
}

function dotStyle(state: PhaseItemState, color: string): React.CSSProperties {
  const dotColor =
    state === 'cur'     ? color :
    state === 'done'    ? '#555555' :
    '#404040'  // pending

  return {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: dotColor,
    flexShrink: 0,
    display: 'inline-block',
    verticalAlign: 'middle',
    marginRight: 3,
  }
}

function itemStyle(state: PhaseItemState, color: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    padding: '2px 4px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    cursor: 'default',
    userSelect: 'none',
  }

  if (state === 'cur') {
    return {
      ...base,
      color: '#e8e8e8',
      background: '#1f2a3a',
      fontWeight: 600,
    }
  }
  if (state === 'done') {
    return {
      ...base,
      color: '#555555',
    }
  }
  // pending
  return {
    ...base,
    color: '#4a4a4a',
  }
}

// chip variant styles
const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  background: '#1f2a3a',
  letterSpacing: 0.4,
  flexShrink: 0,
  cursor: 'default',
  userSelect: 'none',
}
