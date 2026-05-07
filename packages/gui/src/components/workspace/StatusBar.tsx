import { useTranslation } from 'react-i18next'

export default function StatusBar() {
  const { t } = useTranslation()
  return (
    <div style={wrap}>
      <span style={text}>{t('workspace.statusBar.placeholder')}</span>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'status',
  background: '#111111',
  borderTop: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  overflow: 'hidden',
}

const text: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
