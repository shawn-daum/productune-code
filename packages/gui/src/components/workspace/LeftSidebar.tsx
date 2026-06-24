import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import type { ActivityIcon } from './ActivityBar'
import type { Project, Session } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import VersionsPanel from './VersionsPanel'
import SettingsView from './SettingsView'
import TeamPanel from './TeamPanel'
import ExplorerPane from '../explorer/ExplorerPane'
import SidePanelCurrentVersion from './SidePanelCurrentVersion'
import SidePanelPastVersions from './SidePanelPastVersions'
import SidePanelArtifacts from './SidePanelArtifacts'
import SidePanelProjectEnv from './SidePanelProjectEnv'
import ArtifactsPane from './ArtifactsPane'

interface Props {
  project: Project
  activeIcon: ActivityIcon
}

export default function LeftSidebar({ project, activeIcon }: Props) {
  const { t } = useTranslation()
  const { setMessages, setClaudeSessionId, poState } = useWorkspace()
  const openTab = useWorkspace((s) => s.openTab)
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const setSelectedVersionId = useWorkspace((s) => s.setSelectedVersionId)
  const updateTabId = useWorkspace((s) => s.updateTabId)

  // Track previous current_version id for rename guard
  const prevCurrentVersionRef = useRef<string | null>(null)

  const TAB_TITLES: Partial<Record<ActivityIcon, string>> = {
    explorer:  t('workspace.activityBar.explorer'),
    project:   t('workspace.activityBar.project'),
    team:      t('workspace.activityBar.team'),
    settings:  t('workspace.activityBar.settings'),
    versions:  t('workspace.sidebar.tabs.versions'),
    tickets:   t('workspace.sidebar.tabs.tickets'),
    artifacts: t('workspace.sidebar.tabs.artifacts'),
  }

  // Mount: load PO session from fs via IPC
  useEffect(() => {
    // T-PATCH-256: don't clobber an in-flight first turn. LeftSidebar mounts on the
    // WorkspaceShell boot path alongside ChatPanel and independently reloads
    // chat.json into the SAME store. On the FreshComposer first-turn reveal the
    // store already holds the live (streaming) conversation, but chat.json only has
    // the user message until onDone persists the reply — so this setMessages would
    // overwrite the streaming assistant placeholder, and tokens arriving after the
    // overwrite target a now-missing id and get dropped (blank chat + nothing
    // persisted). Skip the disk reload while a turn is in flight (store owns the
    // live session). Mirrors the ChatPanel guard. A real A→B switch still reloads:
    // setProject's isSwitch branch resets streaming:false in the same atomic update
    // that flips `project`, so by the time this effect re-runs the guard is open.
    const ws = useWorkspace.getState()
    if ((ws.streaming || ws.inFlightMsgId) && ws.messages.length > 0) return
    // T-PATCH-213: browser-dev-mode → api undefined. LeftSidebar mounts on the
    // WorkspaceShell boot path; guard the deref ( .catch below only traps promise
    // rejection, not the synchronous throw ) so cold boot is a clean no-op.
    const api = (window as any).api
    if (!api?.chatGetSession) return
    api
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

  // Rename guard: when current_version id changes (PO rename), swap
  // selectedVersionId + in-place tab id swap — no close+reopen (T-P4-097 §E).
  useEffect(() => {
    const cv = poState?.current_version
    const versions = poState?.versions ?? []
    const prev = prevCurrentVersionRef.current

    if (cv && prev && cv !== prev) {
      // current_version id has changed — this is a rename (not a version cycle)
      // Only swap if selectedVersionId was the old id
      if (selectedVersionId === prev) {
        setSelectedVersionId(cv)
      }
      updateTabId(`ticket-review:${prev}`, `ticket-review:${cv}`, cv)
    }

    prevCurrentVersionRef.current = cv ?? null
  }, [poState?.current_version])  // eslint-disable-line react-hooks/exhaustive-deps

  // Tab dispatch for past-version row clicks only.
  // Current-version card click is handled directly in SidePanelCurrentVersion
  // (openTab only — never touches selectedVersionId).
  function handleVersionClick(versionId: string) {
    setSelectedVersionId(versionId)
    if (versionId === '__unassigned__') {
      openTab(
        'version-unassigned:main',
        'version-history',
        { mode: 'past' },
        t('workspace.versionHistory.unassigned.label'),
      )
    } else {
      openTab(
        'version-history:main',
        'version-history',
        { mode: 'past' },
        t('workspace.versionHistory.title'),
      )
    }
    window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId } }))
  }

  const isFocused = activeIcon === 'project'

  // T-PATCH-010 #8: hide past-versions section when there are no past versions.
  // A version is "past" if it is not the current active version, OR if it is the
  // current version but has been transient-closed.
  const hasPastVersions = (() => {
    const cv = poState?.current_version ?? null
    const versions = poState?.versions ?? []
    return versions.some((v) => {
      if (v.id !== cv) return true
      // transient-closed current version counts as past
      return !!(v.outcome?.observed_result || v.ended_at)
    })
  })()

  // Header action slot: RefreshCw for artifacts tab
  const headerAction = activeIcon === 'artifacts' ? (
    <button
      style={headerActionBtn}
      title={t('workspace.sidebar.refresh')}
      aria-label={t('workspace.sidebar.refresh')}
      onClick={() => window.dispatchEvent(new CustomEvent('artifacts:reload'))}
    >
      <RefreshCw size={13} strokeWidth={2} />
    </button>
  ) : null

  return (
    <div style={wrap}>
      {/* Header — active tab title */}
      <div style={header}>
        <div style={tabTitle}>{TAB_TITLES[activeIcon] ?? activeIcon}</div>
        <div style={headerActionSlot}>{headerAction}</div>
      </div>

      {/* Body — branch by activeIcon */}
      {activeIcon === 'project' && (
        <div style={projectBody}>
          {/* Versions section — 2 sp-section split (T-P4-097) */}
          <SidePanelCurrentVersion
            poState={poState}
            selectedVersionId={selectedVersionId}
            isFocused={isFocused}
            // T-PATCH-013 B1: current-version card click must ONLY set selection;
            // it must NOT go through handleVersionClick (which opens version-history
            // and dispatches version-select). The card opens its own ticket-review tab.
            onSelect={(id) => setSelectedVersionId(id)}
          />
          {/* T-PATCH-076: project .env viewer/editor — directly below current-version card */}
          <SidePanelProjectEnv />
          {hasPastVersions && (
            <SidePanelPastVersions
              poState={poState}
              selectedVersionId={selectedVersionId}
              onSelect={(id) => handleVersionClick(id)}
            />
          )}
          {/* T-P4-112: Artifact auto-display — session artifacts from dev/designer */}
          <SidePanelArtifacts />
        </div>
      )}
      {activeIcon === 'explorer' && (
        <ExplorerPane />
      )}
      {activeIcon === 'team' && (
        <TeamPanel poState={poState} />
      )}
      {activeIcon === 'versions' && <VersionsPanel poState={poState} />}
      {activeIcon === 'tickets' && (
        <div style={panelPlaceholder}>
          <span style={panelPlaceholderText}>{t('workspace.sidebar.ticketsHint')}</span>
        </div>
      )}
      {activeIcon === 'artifacts' && (
        <ArtifactsPane project={project} poState={poState} />
      )}
      {activeIcon === 'settings' && (
        <SettingsView />
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

const headerActionSlot: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const headerActionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'none',
  border: 'none',
  borderRadius: 4,
  color: '#707070',
  cursor: 'pointer',
  padding: 0,
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

const projectBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

