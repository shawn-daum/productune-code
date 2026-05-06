export default function StatusBar() {
  return (
    <div style={wrap}>
      <span style={text}>자동저장 / 실행 상태 / 외부 도구 — Slice 6 에서 채워짐</span>
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
