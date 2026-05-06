import { useWorkspace } from '../../store/workspace'

export default function ChatPanel() {
  const { messages } = useWorkspace()

  return (
    <div style={wrap}>
      {/* 헤더 */}
      <div style={header}>
        <span style={headerTitle}>PO 세션</span>
        <span style={headerSub}>
          메시지 {messages.length}
        </span>
      </div>

      {/* 본문 */}
      <div style={body}>
        {messages.length === 0 ? (
          <span style={placeholderText}>
            PO 와 대화를 시작하세요. (Slice 3 에서 streaming 활성화)
          </span>
        ) : (
          <span style={placeholderText}>
            메시지 표시 — Slice 3 에서 채워짐
          </span>
        )}
      </div>

      {/* 입력 영역 */}
      <div style={inputArea}>
        <input
          style={inputField}
          type="text"
          placeholder="메시지를 입력하세요… (Slice 3 에서 활성)"
          disabled
        />
        <button style={sendBtn} disabled>
          전송
        </button>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'chat',
  width: 360,
  background: '#141414',
  borderLeft: '1px solid #2A2A2A',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const header: React.CSSProperties = {
  height: 44,
  flexShrink: 0,
  borderBottom: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 14px',
}

const headerTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
}

const headerSub: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  marginLeft: 'auto',
}

const body: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}

const placeholderText: React.CSSProperties = {
  fontSize: 12,
  color: '#3A3A3A',
  userSelect: 'none',
  textAlign: 'center',
  padding: '0 16px',
}

const inputArea: React.CSSProperties = {
  height: 88,
  flexShrink: 0,
  borderTop: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
}

const inputField: React.CSSProperties = {
  flex: 1,
  height: 40,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#505050',
  fontSize: 12,
  padding: '0 10px',
  outline: 'none',
}

const sendBtn: React.CSSProperties = {
  height: 40,
  padding: '0 14px',
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#505050',
  fontSize: 12,
  cursor: 'not-allowed',
  flexShrink: 0,
}
