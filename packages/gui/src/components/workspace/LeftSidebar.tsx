import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityIcon } from './ActivityBar'
import type { Project, Session } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import VersionsPanel from './VersionsPanel'
import LanguageSettings from './LanguageSettings'

interface Props {
  project: Project
  activeIcon: ActivityIcon
}

export default function LeftSidebar({ project, activeIcon }: Props) {
  const { t } = useTranslation()
  const { setMessages, setClaudeSessionId, poState } = useWorkspace()

  const TAB_TITLES: Record<ActivityIcon, string> = {
    versions:  t('workspace.sidebar.tabs.versions'),
    tickets:   t('workspace.sidebar.tabs.tickets'),
    artifacts: t('workspace.sidebar.tabs.artifacts'),
    settings:  t('workspace.sidebar.tabs.settings'),
  }

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
      {/* Header — active tab title */}
      <div style={header}>
        <div style={tabTitle}>{TAB_TITLES[activeIcon]}</div>
        <div style={projectSlugMuted} title={project.slug}>{project.slug}</div>
      </div>

      {/* Body — branch by activeIcon */}
      {activeIcon === 'versions' && <VersionsPanel poState={poState} />}
      {activeIcon === 'tickets' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>{t('workspace.sidebar.ticketsHint')}</span>
        </div>
      )}
      {activeIcon === 'artifacts' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>{t('workspace.sidebar.artifactsHint')}</span>
        </div>
      )}
      {activeIcon === 'settings' && (
        <LanguageSettings />
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
