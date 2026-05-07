import { useTranslation } from 'react-i18next'
import type { TabType } from '../../../../store/workspace'

/**
 * Generic placeholder for tab types whose body is filled in by sibling tickets
 * (T-P4-04X). Renders the tab type label + the filling ticket id from a small
 * static map. T-P4-046 ships markdown / version-detail / ticket-review wired;
 * the remaining 8 types stay placeholder until their tickets land.
 */
const FILLED_BY: Record<string, string> = {
  'design-gate':  'T-P4-047',
  'qa-result':    'T-P4-048',
  'persona-def':  'T-P4-050',
  'env-view':     'T-P4-051',
  'skill-matrix': 'T-P4-052',
  'preview':      'T-P4-053',
  'terminal':     'T-P4-054',
  'browser':      'T-P4-055',
}

interface Props {
  type: TabType
  props?: Record<string, unknown>
}

export default function PlaceholderTab({ type }: Props) {
  const { t } = useTranslation()
  const filledBy = FILLED_BY[type] ?? '?'
  return (
    <div style={wrap}>
      <div style={icon}>{type}</div>
      <div style={body}>{t('workspace.tab.placeholder.body', { ticket: filledBy })}</div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: 24,
  color: '#505050',
}

const icon: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#3A3A3A',
}

const body: React.CSSProperties = {
  fontSize: 13,
  textAlign: 'center',
  maxWidth: 360,
  lineHeight: 1.6,
}
