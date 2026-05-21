export const wrap: React.CSSProperties = {
  flex: 1, minHeight: 0,
  background: '#0A0A0A',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  userSelect: 'none',
  color: '#F0F0F0',
}
export const card: React.CSSProperties = {
  background: '#141414', border: '1px solid #2A2A2A',
  borderRadius: 14, width: 460,
  boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
  overflow: 'hidden',
}
export const header: React.CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid #222',
  display: 'flex', alignItems: 'center',
}
export const stepIndicator: React.CSSProperties = {
  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
}
export const stepDot: React.CSSProperties = {
  height: 8, borderRadius: 9999,
  transition: 'width 0.2s, background 0.2s',
}
export const body: React.CSSProperties = {
  padding: '20px 20px 8px',
  display: 'flex', flexDirection: 'column', gap: 4,
  minHeight: 200,
}
export const footer: React.CSSProperties = {
  padding: '12px 20px 16px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
export const stepLabel: React.CSSProperties = {
  fontSize: 11, color: '#505050', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 8,
}
export const stepIntro: React.CSSProperties = {
  fontSize: 12.5, color: '#B0B0B0', lineHeight: 1.55,
  marginBottom: 12,
}
export const hint: React.CSSProperties = { fontSize: 12, color: '#505050', marginTop: 8 }
export const hwBadgeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
}
export const hwSpinner: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  minHeight: 160, gap: 4,
}
export const engineRow: React.CSSProperties = {
  background: '#161616', border: '1px solid #2A2A2A',
  borderRadius: 8, padding: '10px 12px',
}
export const dockerBox: React.CSSProperties = {
  marginTop: 8, padding: '10px 12px',
  background: '#1A1208', border: '1px solid #FBBF2444',
  borderRadius: 6,
}
export const logArea: React.CSSProperties = {
  marginTop: 8,
  background: '#0A0A0A', border: '1px solid #222', borderRadius: 4,
  padding: '8px 10px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11, lineHeight: 1.6,
  maxHeight: 120, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 1,
}
export const btnEngineAction: React.CSSProperties = {
  background: '#1E1E2E', color: '#818CF8',
  border: '1px solid #818CF844', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}
export const btnDockerInstall: React.CSSProperties = {
  background: '#2A1E00', color: '#FBBF24',
  border: '1px solid #FBBF2466', borderRadius: 4,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
export const btnRedetect: React.CSSProperties = {
  background: '#1A1A1A', color: '#A0A0A0',
  border: '1px solid #333', borderRadius: 4,
  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  transition: 'opacity 0.15s',
}
export const optionCard: React.CSSProperties = {
  border: '1px solid #2A2A2A', borderRadius: 8,
  padding: '10px 12px', cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
}
export const radio: React.CSSProperties = {
  width: 14, height: 14, borderRadius: 9999,
  border: '2px solid #FF6B2B', flexShrink: 0,
  transition: 'background 0.15s',
}
export const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 4,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
export const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
export const btnSkip: React.CSSProperties = {
  background: 'transparent', color: '#606060', border: 'none',
  fontSize: 12, cursor: 'pointer', padding: '8px 10px',
}
export const btnReset: React.CSSProperties = {
  background: 'transparent', color: '#505050', border: 'none',
  fontSize: 11, cursor: 'pointer', padding: '4px 8px',
  display: 'flex', alignItems: 'center',
}
export const tierBBox: React.CSSProperties = {
  marginTop: 8, padding: '10px 12px',
  background: '#1A1200', border: '1px solid #FBBF2444',
  borderRadius: 6,
}
