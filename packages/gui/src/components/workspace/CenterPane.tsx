export default function CenterPane() {
  return (
    <div style={wrap}>
      <p style={placeholder}>티켓 보드 / 디자인 / 배포 — Slice 4 부터 채워짐</p>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'center',
  background: '#0F0F0F',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const placeholder: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#3A3A3A',
  userSelect: 'none',
}
