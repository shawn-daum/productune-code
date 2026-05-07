import { useTranslation } from 'react-i18next'

/**
 * Body shown when a leaf pane has zero tabs. Mirrors VS Code's "Welcome" pane:
 * 28px logo at 0.25 opacity, escape title, three keyboard hints.
 */
export default function EmptyPane() {
  const { t } = useTranslation()
  return (
    <div style={wrap}>
      <div style={logo} aria-hidden>P</div>
      <div style={title}>{t('workspace.emptyPane.title')}</div>
      <div style={kbdList}>
        <KbdRow chord={['⌘', 'P']} label={t('workspace.kbd.quickOpen')} />
        <KbdRow chord={['⌘', 'T']} label={t('workspace.kbd.newTab')} />
        <KbdRow chord={['⌘', '\\']} label={t('workspace.kbd.splitRight')} />
        <KbdRow chord={['⌘', 'W']} label={t('workspace.kbd.closeTab')} />
      </div>
    </div>
  )
}

function KbdRow({ chord, label }: { chord: string[]; label: string }) {
  return (
    <div style={row}>
      <div style={chordWrap}>
        {chord.map((k, i) => (
          <span key={i} style={kbd}>{k}</span>
        ))}
      </div>
      <span style={rowLabel}>{label}</span>
    </div>
  )
}

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
  padding: 24,
  userSelect: 'none',
}

const logo: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: '#FF6B2B',
  color: '#0A0A0A',
  fontSize: 18,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.25,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
}

const title: React.CSSProperties = {
  fontSize: 13,
  color: '#505050',
  textAlign: 'center',
}

const kbdList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 6,
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: 11,
  color: '#3A3A3A',
}

const chordWrap: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  minWidth: 64,
  justifyContent: 'flex-end',
}

const kbd: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 18,
  height: 18,
  padding: '0 4px',
  border: '1px solid #2A2A2A',
  borderRadius: 3,
  background: '#141414',
  color: '#707070',
  fontSize: 10,
  fontFamily: 'monospace',
}

const rowLabel: React.CSSProperties = {
  color: '#505050',
}
