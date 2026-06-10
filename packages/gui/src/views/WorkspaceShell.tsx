import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { Project, Message } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import type { Tab, Pane } from '../store/workspace'
import PhaseBreadcrumb from '../components/workspace/PhaseBreadcrumb'
import LeftSidebar from '../components/workspace/LeftSidebar'
import MainPanel from '../components/workspace/main/MainPanel'
import StatusBar from '../components/workspace/StatusBar'
import ActivityBar, { type ActivityIcon } from '../components/workspace/ActivityBar'
import ChatPanel from '../components/workspace/ChatPanel'
import SessionHealthBanner from '../components/workspace/SessionHealthBanner'
import RestartSessionModal from '../components/workspace/RestartSessionModal'
import PendingPromotionDrain from '../components/workspace/PendingPromotionDrain'
import QuickOpenPalette from '../components/workspace/QuickOpenPalette'
import ColumnResizeHandle from '../components/workspace/ColumnResizeHandle'
import { usePoChat } from '../store/poChat'
import { useTicketScan } from '../lib/useTicketScan'
import DeployConfirmModal from '../components/workspace/DeployConfirmModal'
import BaseDirtyModal from '../components/workspace/BaseDirtyModal'
import QuitGuardToast from '../components/workspace/QuitGuardToast'
import { useResizeLayout } from './workspace/shell/useResizeLayout'
import { useKeyboardShortcuts } from './workspace/shell/useKeyboardShortcuts'
import { useIpcSubscriptions } from './workspace/shell/useIpcSubscriptions'
import { useAutoSurfaceArtifacts } from './workspace/shell/useAutoSurfaceArtifacts'
import { grid, breadcrumbArea, sidebarResizeArea, chatResizeArea, artifactToastStyle } from './workspace/shell/styles'
import { buildQuickOpenItems, collectAllTabs, type McpServerEntry, type ArtifactEntry } from './workspace/shell/helpers'
import {
  ACTIVITY_BAR_WIDTH, RESIZE_HANDLE_WIDTH,
  SIDEBAR_MIN_WIDTH, CENTER_MIN_LAYOUT, PO_CHAT_MIN_WIDTH,
} from './workspace/shell/constants'

// T-PATCH-085 QA fix: sum of column minimums → below this the scroll wrapper
// triggers overflowX instead of visually crushing the grid columns.
// = ACTIVITY_BAR_WIDTH(48) + SIDEBAR_MIN_WIDTH(200) + RESIZE_HANDLE_WIDTH(4)
// + CENTER_MIN_LAYOUT(320) + RESIZE_HANDLE_WIDTH(4) + PO_CHAT_MIN_WIDTH(280) = 856
const SHELL_MIN_WIDTH =
  ACTIVITY_BAR_WIDTH + SIDEBAR_MIN_WIDTH + RESIZE_HANDLE_WIDTH +
  CENTER_MIN_LAYOUT + RESIZE_HANDLE_WIDTH + PO_CHAT_MIN_WIDTH

interface Props {
  project: Project
  onBack: () => void
  onOpenRecent?: (projectDir: string, slug: string) => void
}

// ── HeaderSearchBar ───────────────────────────────────────────────────────────

interface HeaderSearchBarProps {
  onClick: () => void
}

function HeaderSearchBar({ onClick }: HeaderSearchBarProps) {
  const { t } = useTranslation()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('workspace.quickOpen.ariaLabel')}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      style={headerSearchBarStyle}
    >
      <Search size={14} color="currentColor" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: '#707070' }}>
        {t('workspace.quickOpen.searchHint')}
      </span>
      <kbd style={headerKbdStyle}>⌘P</kbd>
    </div>
  )
}

const headerSearchBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 420,
  margin: '4px auto',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '6px 10px',
  color: '#707070',
  cursor: 'text',
}

const headerKbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  color: '#A0A0A0',
  border: '1px solid #2A2A2A',
  borderRadius: 2,
  padding: '1px 4px',
  lineHeight: 1.5,
  background: '#141414',
}

// T-PATCH-013 B3: a "fresh" workspace = single empty leaf, no tabs anywhere.
// Used to tell a rehydrated pane tree (has tabs) from the initial empty state,
// so a cmd-R reload for the same project does not get treated as a switch.
function isEmptyPaneTree(root: Pane): boolean {
  if (root.type === 'leaf') return root.tabs.length === 0
  return isEmptyPaneTree(root.children[0]) && isEmptyPaneTree(root.children[1])
}

// ── WorkspaceShell ────────────────────────────────────────────────────────────

export default function WorkspaceShell({ project, onBack, onOpenRecent }: Props) {
  const { t } = useTranslation()
  const phase = useWorkspace((s) => s.phase)
  const setProject = useWorkspace((s) => s.setProject)
  const setPoState = useWorkspace((s) => s.setPoState)
  const openTab = useWorkspace((s) => s.openTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const closePane = useWorkspace((s) => s.closePane)
  const splitRight = useWorkspace((s) => s.splitRight)
  const splitDown = useWorkspace((s) => s.splitDown)
  const addNewTab = useWorkspace((s) => s.addNewTab)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const messages = useWorkspace((s) => s.messages)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const streaming = useWorkspace((s) => s.streaming)

  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('project')
  const [drainVisible, setDrainVisible] = useState(true)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [quickOpenFiles, setQuickOpenFiles] = useState<Array<{ path: string; ext: string }>>([])

  // ── New index sources (T-015 A6) ──────────────────────────────────────────
  const [quickOpenTabs, setQuickOpenTabs] = useState<Tab[]>([])
  const [quickOpenMcp, setQuickOpenMcp] = useState<McpServerEntry[]>([])
  const [quickOpenArtifacts, setQuickOpenArtifacts] = useState<ArtifactEntry[]>([])

  const restartModalOpen = usePoChat((s) => s.restartModalOpen)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  const { shellRef, sidebarWidth, poChatWidth, activeResizeHandle, startResize } = useResizeLayout()
  useKeyboardShortcuts({ closeTab, closePane, splitRight, splitDown, addNewTab, setActiveTab })
  const { deployModalOpen, deployModalPayload, baseDirtyModal, artifactToast,
    setDeployModalOpen, setDeployModalPayload, setBaseDirtyModal } =
    useIpcSubscriptions(openTab, appendMessage, t)

  const { tickets: scannedTickets } = useTicketScan(project.projectDir)

  const poStateVersion = useWorkspace((s) => s.poState?.current_version ?? null)

  useAutoSurfaceArtifacts({
    projectDir: project.projectDir,
    currentVersion: poStateVersion,
    tickets: scannedTickets,
  })

  // T-PATCH-010 #3: track whether this render is a project switch so the
  // current-version tab opens after poState loads (switch only, not icon-click).
  const prevProjectDirRef = useRef<string | null>(null)
  const pendingSwitchTabRef = useRef(false)

  useEffect(() => {
    const prevDir = prevProjectDirRef.current
    prevProjectDirRef.current = project.projectDir

    // T-PATCH-013 B3: distinguish a genuine project switch from a cmd-R reload
    // rehydrate for the SAME project. On first mount after reload, prevDir is
    // null; if the rehydrated workspace state (sessionStorage) already belongs to
    // this projectDir AND has restored panes, this is a rehydrate — NOT a switch.
    // We must not reset panes nor auto-open a duplicate current-version tab (AC-5),
    // nor force the ActivityBar icon (B2 guard).
    const rehydrated = useWorkspace.getState()
    const isRehydrateSameProject =
      prevDir === null &&
      rehydrated.persistedProjectDir === project.projectDir &&
      !isEmptyPaneTree(rehydrated.panes)

    const isSwitch = prevDir !== project.projectDir && !isRehydrateSameProject
    if (isSwitch) {
      pendingSwitchTabRef.current = true
      // T-PATCH-013 B2: re-assert the ActivityBar 'project' icon on a real switch,
      // regardless of which icon was active before. Skipped on reload-rehydrate.
      setActiveIcon('project')
    }
    setProject(project)
  }, [project, setProject])

  useEffect(() => {
    ;(window as any).api.readPoState(project.projectDir)
      .then((s: unknown) => {
        setPoState(s as any)
        // T-PATCH-010 #3: on project switch, open the new project's current-version
        // tab once after poState loads. Clear the flag so repeated setPoState calls
        // (live updates) don't re-open the tab.
        if (pendingSwitchTabRef.current) {
          pendingSwitchTabRef.current = false
          const cv = (s as any)?.current_version as string | undefined
          if (cv) {
            useWorkspace.getState().openTab(
              `ticket-review:${cv}`,
              'ticket-review',
              { versionFilter: cv },
              cv,
            )
          }
        }
      })
      .catch(() => setPoState(null))
  }, [project.projectDir, setPoState])

  useEffect(() => { if (!streaming) setDrainVisible(true) }, [streaming])

  useEffect(() => {
    const onQuickOpen = () => setQuickOpenVisible((v) => !v)
    window.addEventListener('productune:quick-open', onQuickOpen)
    return () => window.removeEventListener('productune:quick-open', onQuickOpen)
  }, [])

  // File list
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenFiles([]); return }
    const api = (window as any).api
    if (!api?.listProjectFiles) return
    api.listProjectFiles(project.projectDir)
      .then((files: Array<{ path: string; ext: string }>) => setQuickOpenFiles(files))
      .catch(() => setQuickOpenFiles([]))
  }, [quickOpenVisible, project.projectDir])

  // Tabs: read synchronously from store pane tree
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenTabs([]); return }
    const allTabs = collectAllTabs(useWorkspace.getState().panes)
    setQuickOpenTabs(allTabs)
  }, [quickOpenVisible])

  // MCP servers
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenMcp([]); return }
    const api = (window as any).api
    api?.mcpGetServers?.(project.projectDir)
      .then((servers: McpServerEntry[]) => setQuickOpenMcp(servers))
      .catch(() => setQuickOpenMcp([]))
  }, [quickOpenVisible, project.projectDir])

  // Artifacts
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenArtifacts([]); return }
    const api = (window as any).api
    const version = useWorkspace.getState().poState?.current_version ?? null
    api?.artifactsListScoped?.(project.projectDir, version)
      .then((entries: ArtifactEntry[]) => setQuickOpenArtifacts(entries))
      .catch(() => setQuickOpenArtifacts([]))
  }, [quickOpenVisible, project.projectDir])

  useEffect(() => {
    const api = (window as any).api
    const offNew = api.onMenuNewProject?.(() => onBack())
    return () => { offNew?.() }
  }, [onBack])

  const onSelectActivity = (icon: ActivityIcon) => {
    setActiveIcon(icon)
    if (icon === 'tickets') {
      const cv = useWorkspace.getState().poState?.current_version
      cv ? openTab(`ticket-review:${cv}`, 'ticket-review', { versionFilter: cv }, cv)
         : openTab('ticket-review:board', 'ticket-review', undefined, 'Tickets')
    }
  }

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const api = (window as any).api
    api.poSendMessage?.({ projectDir: project.projectDir, text: lastUser.text,
      persona: 'pdt-po', resume: useWorkspace.getState().claudeSessionId })
  }

  const handleViewLog = () =>
    openTab('terminal:po-log', 'terminal', { logPath: `${project.projectDir}/.productune/logs/po-session.log` }, 'PO Log')

  const quickOpenItems = buildQuickOpenItems(
    quickOpenFiles,
    scannedTickets,
    quickOpenTabs,
    quickOpenMcp,
    quickOpenArtifacts,
    project.projectDir,
    openTab,
  )

  const dynamicGrid: React.CSSProperties = {
    ...grid,
    // T-PATCH-085 QA fix: minWidth = sum of column minimums (856 px).
    // Forces the grid element to be at least 856 px wide so that:
    //   (a) shellRef.getBoundingClientRect().width never reports < 856 → clamp
    //       functions always see enough space to protect sidebar at 200 px floor.
    //   (b) when the viewport is < 856 px, the grid overflows its scroll-wrapper
    //       and overflowX:auto on the wrapper shows a horizontal scrollbar instead
    //       of visually crushing the sidebar column.
    minWidth: SHELL_MIN_WIDTH,
    gridTemplateAreas: `
      "activity sidebar sidebarResize breadcrumb chatResize chat"
      "activity sidebar sidebarResize center     chatResize chat"
      "activity sidebar sidebarResize status     chatResize chat"
    `,
    gridTemplateColumns: `${ACTIVITY_BAR_WIDTH}px ${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${poChatWidth}px`,
  }

  return (
    // Scroll wrapper: constrained to viewport width, lets the grid overflow
    // horizontally at very small windows (<856 px) → scrollbar instead of crush.
    <div style={shellScrollWrapper}>
      <div ref={shellRef} style={dynamicGrid}>
      <ActivityBar active={activeIcon} onSelect={onSelectActivity} />
      <LeftSidebar project={project} activeIcon={activeIcon} />
      <div style={sidebarResizeArea}>
        <ColumnResizeHandle active={activeResizeHandle === 'sidebar'} ariaLabel="Resize left sidebar"
          onMouseDown={(event) => startResize('sidebar', event)} />
      </div>

      <div style={breadcrumbArea}>
        {/* T-015 A6: always-visible inline header search bar */}
        <HeaderSearchBar onClick={() => setQuickOpenVisible(true)} />
        <SessionHealthBanner onRestartSession={() => setRestartModalOpen(true)}
          onRetry={handleRetry} onViewLog={handleViewLog} />
        <PhaseBreadcrumb phase={phase} />
        {drainVisible && project && (
          <PendingPromotionDrain projectDir={project.projectDir}
            claudeSessionId={useWorkspace.getState().claudeSessionId}
            onDone={() => setDrainVisible(false)} />
        )}
      </div>

      <MainPanel />
      <StatusBar onOpenHealthBanner={() => setRestartModalOpen(true)} onOpenRecent={onOpenRecent} />

      <div style={chatResizeArea}>
        <ColumnResizeHandle active={activeResizeHandle === 'chat'} ariaLabel="Resize PO chat"
          onMouseDown={(event) => startResize('chat', event)} />
      </div>
      <ChatPanel />

      {restartModalOpen && <RestartSessionModal onClose={() => setRestartModalOpen(false)} />}

      {deployModalOpen && deployModalPayload && (
        <DeployConfirmModal
          tickets={deployModalPayload.tickets} gitRef={deployModalPayload.gitRef}
          project={deployModalPayload.project} projectDir={deployModalPayload.projectDir}
          owner={deployModalPayload.owner} repo={deployModalPayload.repo}
          branchName={deployModalPayload.branchName} ticketId={deployModalPayload.ticketId}
          ticketTitle={deployModalPayload.ticketTitle} ticketAcceptance={deployModalPayload.ticketAcceptance}
          vercelProject={deployModalPayload.vercelProject}
          onClose={() => { setDeployModalOpen(false); setDeployModalPayload(null) }}
        />
      )}

      {baseDirtyModal && (
        <BaseDirtyModal projectDir={baseDirtyModal.projectDir} ticketId={baseDirtyModal.ticketId}
          slug={baseDirtyModal.slug} type={baseDirtyModal.type}
          onClose={() => setBaseDirtyModal(null)} onSuccess={() => setBaseDirtyModal(null)} />
      )}

      {quickOpenVisible && (
        <QuickOpenPalette
          items={quickOpenItems}
          onClose={() => setQuickOpenVisible(false)}
          onPick={(item) => { item.open(); setQuickOpenVisible(false) }}
        />
      )}

      {artifactToast && <div style={artifactToastStyle}>{artifactToast}</div>}
      </div>
      {/* T-PATCH-086: quit guard overlay. position:fixed escapes the grid; always
          in the DOM so the IPC subscription is registered from first render. */}
      <QuitGuardToast />
    </div>
  )
}

// Scroll wrapper that sits between the flex viewport and the grid element.
// Must be a flex container so the grid's flex:1 fills it. At window < 856 px
// the grid (minWidth:856) overflows this wrapper → overflowX:auto shows the
// horizontal scrollbar without affecting the vertical layout.
const shellScrollWrapper: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  overflowX: 'auto',
  overflowY: 'hidden',
  background: '#0F0F0F', // match grid background so scrollbar gutter is themed
}
