export default function App() {
  return (
    <div
      style={{
        background: '#0f0f0f',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>⚡</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
        productune
      </div>
      <div style={{ fontSize: 13, color: '#666666', letterSpacing: '0.02em' }}>
        GUI boilerplate · T-P4-003
      </div>
    </div>
  )
}
