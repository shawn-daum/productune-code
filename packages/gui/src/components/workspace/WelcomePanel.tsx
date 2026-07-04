/**
 * WelcomePanel — empty-state intro for the MainPanel (T-PATCH-275 #18 correction).
 *
 * Shown inside the MainPanel (the full 4-region shell is ALWAYS rendered) while
 * po-state has no current_version yet AND no tab is open — i.e. during the PRD
 * interview, when the Versions/Tickets/PRD/Artifacts surfaces would otherwise be
 * empty. Points the user at the PO chat on the right. Purely presentational.
 *
 * Replaced by the pane tree the moment a version exists or a tab opens (e.g. the
 * #14 PRD auto-open) — the pane/tab state is untouched underneath.
 */
import { useTranslation } from 'react-i18next'
import { STAGE_DEFS } from '../../lib/phase-mapping'

const STAGES = ['PRD', 'Design', 'Build', 'Deploy', 'Close'] as const

interface Props {
  // T-291 (adapter A8, QA fix): prdt projects show the 4-stage prdt lifecycle
  // (define/build/ship/retro, labels from STAGE_DEFS i18n keys) instead of the
  // legacy 5-phase row. Absent → legacy row, byte-identical to before.
  variant?: 'legacy' | 'prdt'
  // Active step index (into whichever row renders). Default 0.
  activeIndex?: number
}

export default function WelcomePanel({ variant = 'legacy', activeIndex = 0 }: Props) {
  const { t } = useTranslation()
  const labels: readonly string[] =
    variant === 'prdt' ? STAGE_DEFS.map((d) => t(d.labelKey)) : STAGES
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
        {labels.map((s, i) => (
          <span key={s} style={i === activeIndex ? stepOn : step}>{s}</span>
        ))}
      </div>
    </main>
  )
}

// ── styles ──────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
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
