import { useEffect } from 'react'
import type { ActivityIcon } from './ActivityBar'
import type { Project, Session } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'

interface Props {
  project: Project
  onBack: () => void
  activeIcon: ActivityIcon
}

export default function LeftSidebar({ project, onBack, activeIcon }: Props) {
  const { messages, setMessages, setClaudeSessionId } = useWorkspace()

  // Mount: load PO session from fs via IPC
  useEffect(() => {
    ;(window as any).api
      .chatGetSession(project.projectDir)
      .then((s: Session) => {
        setMessages(s.messages)
        setClaudeSessionId(s.claude_session_id ?? null)
      })
      .catch(() => {
        setMessages([])
        setClaudeSessionId(null)
      })
  }, [project.projectDir, setMessages, setClaudeSessionId])

  return (
    <div style={wrap}>
      {/* ProjectHeader — slug + ← 홈 */}
      <div style={header}>
        <button style={backBtn} onClick={onBack} title="홈으로">
          ←
        </button>
        <div style={projectSlug}>{project.slug}</div>
      </div>

      {/* 본문 — activeIcon 에 따라 분기 */}
      {activeIcon === 'rooms' && (
        <div style={sessionPanel}>
          <div style={sectionLabel}>PO 세션</div>
          <div style={sessionMeta}>
            메시지 <span style={sessionMetaValue}>{messages.length}</span>
          </div>
          <div style={sessionHint}>
            우측 채팅창에서 PO 와 대화하세요. (Slice 3 에서 streaming 활성화)
          </div>
        </div>
      )}
      {activeIcon === 'artifacts' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>산출물 — 후속 슬라이스에서 추가</span>
        </div>
      )}
      {activeIcon === 'settings' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>설정 — T-P4-024</span>
        </div>
      )}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'sidebar',
  background: '#141414',
  borderRight: '1px solid #2A2A2A',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  height: 44,
  borderBottom: '1px solid #2A2A2A',
  flexShrink: 0,
}

const backBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#707070',
  fontSize: 16,
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: 4,
  lineHeight: 1,
  flexShrink: 0,
}

const projectSlug: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#F0F0F0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const sessionPanel: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 14px 12px',
  gap: 8,
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#505050',
  fontWeight: 600,
}

const sessionMeta: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',
}

const sessionMetaValue: React.CSSProperties = {
  color: '#F0F0F0',
  fontWeight: 600,
  marginLeft: 4,
}

const sessionHint: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  lineHeight: 1.5,
  marginTop: 4,
}

const panelPlaceholder: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const panelPlaceholderText: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  userSelect: 'none',
  textAlign: 'center',
  padding: '0 12px',
}
