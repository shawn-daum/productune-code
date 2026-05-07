/**
 * PoFab — bottom-right floating button shown when the PO chat panel is
 * minimized/closed (T-P4-041). Click → restore panel.
 */

import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import { usePoChat } from '../../../store/poChat'

export default function PoFab() {
  const { t } = useTranslation()
  const setPanelVisible = usePoChat((s) => s.setPanelVisible)
  const visible = usePoChat((s) => s.panelVisible)

  if (visible) return null

  return (
    <button
      style={fabStyle}
      onClick={() => setPanelVisible(true)}
      aria-label={t('workspace.chat.restore')}
      title={t('workspace.chat.restore')}
    >
      <MessageSquare size={16} strokeWidth={2} />
      <span style={fabLabel}>PO</span>
    </button>
  )
}

const fabStyle: React.CSSProperties = {
  position: 'fixed',
  right: 18,
  bottom: 18,
  zIndex: 9999,
  height: 40,
  padding: '0 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#FF6B2B',
  color: '#0F0F0F',
  border: 'none',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
}

const fabLabel: React.CSSProperties = {
  letterSpacing: 0.3,
}
