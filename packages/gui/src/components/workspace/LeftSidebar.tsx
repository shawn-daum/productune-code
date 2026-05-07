import { useEffect } from 'react'
import type { ActivityIcon } from './ActivityBar'
import type { Project, Session } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import VersionsPanel from './VersionsPanel'

interface Props {
  project: Project
  onBack: () => void
  activeIcon: ActivityIcon
}

const TAB_TITLES: Record<ActivityIcon, string> = {
  rooms:     'PO session',
  versions:  'Versions',
  tickets:   'Tickets',
  artifacts: 'Artifacts',
  settings:  'Settings',
}

export default function LeftSidebar({ project, onBack, activeIcon }: Props) {
  const { messages, setMessages, setClaudeSessionId, poState } = useWorkspace()

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
      {/* Header — active tab title (back-to-home moved to native menubar) */}
      <div style={header}>
        <div style={tabTitle}>{TAB_TITLES[activeIcon]}</div>
        <div style={projectSlugMuted} title={project.slug}>{project.slug}</div>
      </div>

      {/* 본문 — activeIcon 에 따라 분기 */}
      {activeIcon === 'rooms' && (
        <div style={sessionPanel}>
          <div style={sectionLabel}>PO session</div>
          <div style={sessionMeta}>
            messages <span style={sessionMetaValue}>{messages.length}</span>
          </div>
          <div style={sessionHint}>
            Talk to PO in the chat panel on the right. (Streaming wired in Slice 3.)
          </div>
        </div>
      )}
      {activeIcon === 'versions' && <VersionsPanel poState={poState} />}
      {activeIcon === 'artifacts' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>Artifacts — coming in a later slice</span>
        </div>
      )}
      {activeIcon === 'settings' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>Settings — T-P4-024</span>
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
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
  padding: '0 14px',
  height: 44,
  borderBottom: '1px solid #2A2A2A',
  flexShrink: 0,
}

const tabTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#F0F0F0',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const projectSlugMuted: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 110,
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
