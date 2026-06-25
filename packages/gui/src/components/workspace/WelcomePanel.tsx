/**
 * WelcomePanel — T-PATCH-269 #11 (chat-only layout, scene 1)
 *
 * Replaces the Sidebar + MainPanel + StatusBar regions while po-state has no
 * current_version (or its PRD isn't ready yet). During the PRD interview the
 * Versions/Tickets/PRD/Artifacts panels are all empty — confusing for a
 * non-developer — so we hide them and show a single welcome face that points
 * the user at the PO chat on the right. Purely presentational; no live state.
 *
 * Reversible: WorkspaceShell swaps this out for the full panel layout the moment
 * current_version becomes non-null (the pane/tab tree is preserved underneath,
 * just unmounted from view).
 */
import { useTranslation } from 'react-i18next'

const STAGES = ['PRD', 'Design', 'Build', 'Deploy', 'Close'] as const

export default function WelcomePanel() {
  const { t } = useTranslation()
  return (
    <main style={wrap}>
      <div style={glyph}>
        <span style={{ color: '#A78BFA' }}>{'{'}</span>
        <span>&nbsp;</span>
        <span style={{ color: '#5EEAD4' }}>{'}'}</span>
      </div>
      <h3 style={headline}>{t('workspace.welcome.headline')}</h3>
      <p style={supporting}>{t('workspace.welcome.supporting')}</p>
      <div style={steps}>
        {STAGES.map((s, i) => (
          <span key={s} style={i === 0 ? stepOn : step}>{s}</span>
        ))}
      </div>
    </main>
  )
}

// ── styles ──────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'welcome',
  background: '#0F0F0F',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: 32,
  textAlign: 'center',
  overflow: 'hidden',
}

const glyph: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 48,
  fontWeight: 600,
  lineHeight: 1,
  marginBottom: 4,
}

const headline: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: '#C8C8CC',
}

const supporting: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#808086',
  maxWidth: '42ch',
  lineHeight: 1.6,
}

const steps: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 6,
}

const step: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#505057',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '3px 9px',
}

const stepOn: React.CSSProperties = {
  ...step,
  color: '#A78BFA',
  borderColor: 'rgba(167, 139, 250, 0.5)',
}
