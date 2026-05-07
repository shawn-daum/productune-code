/**
 * StageStrip — reusable stage visualization component.
 *
 * variant="strip"  — full 6-stage strip with dots + labels (Project tab).
 *                    Horizontal scroll when width < all items.
 * variant="chip"   — single pill showing the current stage (rp-ctx).
 *
 * Both variants read from the same po-state via props (no internal store access
 * so callers control the data source — single selector, no duplicate state).
 */

import { useTranslation } from 'react-i18next'
import {
  STAGE_DEFS,
  getActiveStageIndex,
  getItemState,
  type StageItemState,
} from '../../lib/stage-mapping'
import type { PoState } from '../../lib/types'

interface Props {
  poState: PoState | null
  variant?: 'strip' | 'chip'
}

export default function StageStrip({ poState, variant = 'strip' }: Props) {
  const { t } = useTranslation()
  const activeIndex = getActiveStageIndex(poState)

  if (variant === 'chip') {
    const active = STAGE_DEFS[activeIndex]
    return (
      <span
        style={{ ...chipBase, color: active.color }}
        title={t('workspace.stageStrip.chipAriaLabel', { stage: active.label })}
        aria-label={t('workspace.stageStrip.chipAriaLabel', { stage: active.label })}
      >
        {active.label}
      </span>
    )
  }

  return (
    <div
      style={stripWrap}
      aria-label={t('workspace.stageStrip.stripAriaLabel')}
      role="list"
    >
      {STAGE_DEFS.map((def, i) => {
        const state: StageItemState = getItemState(i, activeIndex)
        const isLast = i === STAGE_DEFS.length - 1
        return (
          <div key={def.key} style={itemGroup} role="listitem">
            <span
              style={itemStyle(state, def.color)}
              aria-current={state === 'cur' ? 'step' : undefined}
              title={t(`workspace.stageStrip.stageTooltip.${def.key}`)}
            >
              {/* dot */}
              <span style={dotStyle(state, def.color)} aria-hidden="true" />
              {/* label */}
              {def.label}
            </span>
            {/* separator */}
            {!isLast && (
              <span style={separatorStyle} aria-hidden="true">›</span>
            )}
          </div>
        )
      })}
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

function dotStyle(state: StageItemState, color: string): React.CSSProperties {
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

function itemStyle(state: StageItemState, color: string): React.CSSProperties {
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
