import { useTranslation } from 'react-i18next'

/**
 * Body shown when a leaf pane has zero tabs. Mirrors VS Code's "Welcome" pane:
 * 28px logo at 0.25 opacity, escape title, keyboard hints, + primary CTA.
 * §1.5.3 CTA added (T-P4-069 fix C-1): [Quick Open] button dispatches ⌘P.
 */
export default function EmptyPane() {
  const { t } = useTranslation()

  const handleQuickOpen = () => {
    window.dispatchEvent(new CustomEvent('productune:quick-open'))
  }

  return (
    <div style={wrap}>
      <div style={logo} aria-hidden>P</div>
      <div style={title}>{t('workspace.emptyPane.title')}</div>
      <div style={kbdList}>
        <KbdRow chord={['⌘', 'P']} label={t('workspace.kbd.quickOpen')} />
        <KbdRow chord={['⌘', 'T']} label={t('workspace.kbd.newTab')} />
        <KbdRow chord={['⌘', '\\']} label={t('workspace.kbd.splitRight')} />
        <KbdRow chord={['⌘', 'W']} label={t('workspace.kbd.closeTab')} />
        <KbdRow chord={['⌘', '⇧', 'T']} label={t('workspace.kbd.reopenTab')} />
        <KbdRow chord={['⌘', 'L']} label={t('workspace.kbd.focusUrl')} />
        <KbdRow chord={['⌘', '[', '/', ']']} label={t('workspace.kbd.navBackForward')} />
        <KbdRow chord={['⌃', 'Tab']} label={t('workspace.kbd.cycleTab')} />
      </div>
      <button style={ctaBtn} onClick={handleQuickOpen}>
        {t('workspace.emptyPane.ctaLabel')}
      </button>
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
  background: '#8B5CF6',
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

const ctaBtn: React.CSSProperties = {
  marginTop: 8,
  height: 28,
  padding: '0 16px',
  background: '#8B5CF6',
  color: '#0F0F0F',
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  letterSpacing: 0.2,
}
