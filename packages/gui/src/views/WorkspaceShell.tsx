import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, Message } from '../lib/types'
import { useWorkspace } from '../store/workspace'
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
import { useResizeLayout } from './workspace/shell/useResizeLayout'
import { useKeyboardShortcuts } from './workspace/shell/useKeyboardShortcuts'
import { useIpcSubscriptions } from './workspace/shell/useIpcSubscriptions'
import { grid, breadcrumbArea, sidebarResizeArea, chatResizeArea, artifactToastStyle } from './workspace/shell/styles'
import { buildQuickOpenItems } from './workspace/shell/helpers'
import { ACTIVITY_BAR_WIDTH, RESIZE_HANDLE_WIDTH } from './workspace/shell/constants'

interface Props { project: Project; onBack: () => void }

export default function WorkspaceShell({ project, onBack }: Props) {
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
  const messages = useWorkspace((s) => s.messages)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const streaming = useWorkspace((s) => s.streaming)

  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('project')
  const [drainVisible, setDrainVisible] = useState(true)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [quickOpenFiles, setQuickOpenFiles] = useState<Array<{ path: string; ext: string }>>([])

  const chatPanelVisible = usePoChat((s) => s.panelVisible)
  const restartModalOpen = usePoChat((s) => s.restartModalOpen)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  const { shellRef, sidebarWidth, poChatWidth, activeResizeHandle, startResize } = useResizeLayout(chatPanelVisible)
  useKeyboardShortcuts({ closeTab, closePane, splitRight, splitDown, addNewTab })
  const { deployModalOpen, deployModalPayload, baseDirtyModal, artifactToast,
    setDeployModalOpen, setDeployModalPayload, setBaseDirtyModal } =
    useIpcSubscriptions(openTab, appendMessage, t)

  const { tickets: scannedTickets } = useTicketScan(project.projectDir)

  useEffect(() => { setProject(project) }, [project, setProject])

  useEffect(() => {
    ;(window as any).api.readPoState(project.projectDir)
      .then((s: unknown) => setPoState(s as any))
      .catch(() => setPoState(null))
  }, [project.projectDir, setPoState])

  useEffect(() => { if (!streaming) setDrainVisible(true) }, [streaming])

  useEffect(() => {
    const onQuickOpen = () => setQuickOpenVisible((v) => !v)
    window.addEventListener('productune:quick-open', onQuickOpen)
    return () => window.removeEventListener('productune:quick-open', onQuickOpen)
  }, [])

  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenFiles([]); return }
    const api = (window as any).api
    if (!api?.listProjectFiles) return
    api.listProjectFiles(project.projectDir)
      .then((files: Array<{ path: string; ext: string }>) => setQuickOpenFiles(files))
      .catch(() => setQuickOpenFiles([]))
  }, [quickOpenVisible, project.projectDir])

  useEffect(() => {
    const api = (window as any).api
    const offNew = api.onMenuNewProject?.(() => onBack())
    const offOpen = api.onMenuOpenProject?.(() => onBack())
    return () => { offNew?.(); offOpen?.() }
  }, [onBack])

  useEffect(() => {
    const cv = useWorkspace.getState().poState?.current_version
    if (cv) openTab(`ticket-review:${cv}`, 'ticket-review', { versionFilter: cv }, cv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const quickOpenItems = buildQuickOpenItems(quickOpenFiles, scannedTickets, project.projectDir, openTab)

  const dynamicGrid: React.CSSProperties = {
    ...grid,
    gridTemplateAreas: `
      "activity sidebar sidebarResize breadcrumb chatResize chat"
      "activity sidebar sidebarResize center     chatResize chat"
      "activity sidebar sidebarResize status     chatResize chat"
    `,
    gridTemplateColumns: chatPanelVisible
      ? `${ACTIVITY_BAR_WIDTH}px ${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${poChatWidth}px`
      : `${ACTIVITY_BAR_WIDTH}px ${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr) 0px 0px`,
  }

  return (
    <div ref={shellRef} style={dynamicGrid}>
      <ActivityBar active={activeIcon} onSelect={onSelectActivity} />
      <LeftSidebar project={project} activeIcon={activeIcon} />
      <div style={sidebarResizeArea}>
        <ColumnResizeHandle active={activeResizeHandle === 'sidebar'} ariaLabel="Resize left sidebar"
          onMouseDown={(event) => startResize('sidebar', event)} />
      </div>

      <div style={breadcrumbArea}>
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
      <StatusBar onOpenHealthBanner={() => setRestartModalOpen(true)} />

      {chatPanelVisible && (
        <div style={chatResizeArea}>
          <ColumnResizeHandle active={activeResizeHandle === 'chat'} ariaLabel="Resize PO chat"
            onMouseDown={(event) => startResize('chat', event)} />
        </div>
      )}
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
        <QuickOpenPalette items={quickOpenItems} onClose={() => setQuickOpenVisible(false)}
          onPick={(item) => { item.open(); setQuickOpenVisible(false) }} />
      )}

      {artifactToast && <div style={artifactToastStyle}>{artifactToast}</div>}
    </div>
  )
}
