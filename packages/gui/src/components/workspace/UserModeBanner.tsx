import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface Props {
  onDismiss: () => void
  onOpenSettings: () => void
}

export default function UserModeBanner({ onDismiss, onOpenSettings }: Props) {
  const { t } = useTranslation()

  return (
    <div style={wrap}>
      <span style={text}>{t('workspace.userModeBanner.message')}</span>
      <button style={settingsBtn} onClick={onOpenSettings}>
        {t('workspace.userModeBanner.openSettings')}
      </button>
      <button style={dismissBtn} onClick={onDismiss} aria-label={t('workspace.userModeBanner.dismiss')}>
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#1A1508',
  borderBottom: '1px solid #3A2A08',
  padding: '6px 12px',
  flexShrink: 0,
}

const text: React.CSSProperties = {
  fontSize: 12,
  color: '#FBBF24',
  flex: 1,
  lineHeight: 1.4,
}

const settingsBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #FBBF2466',
  borderRadius: 4,
  color: '#FBBF24',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  flexShrink: 0,
}

const dismissBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#706040',
  cursor: 'pointer',
  padding: 2,
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}
