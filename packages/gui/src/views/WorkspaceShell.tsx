import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import { useSessionHealth } from '../store/sessionHealth'
import PhaseBreadcrumb from '../components/workspace/PhaseBreadcrumb'
import LeftSidebar from '../components/workspace/LeftSidebar'
import MainPanel from '../components/workspace/main/MainPanel'
import StatusBar from '../components/workspace/StatusBar'
import ActivityBar, { type ActivityIcon } from '../components/workspace/ActivityBar'
import ChatPanel from '../components/workspace/ChatPanel'
import SessionHealthBanner from '../components/workspace/SessionHealthBanner'
import RestartSessionModal from '../components/workspace/RestartSessionModal'
import PendingPromotionDrain from '../components/workspace/PendingPromotionDrain'
import QuickOpenPalette, { type QuickOpenItem } from '../components/workspace/QuickOpenPalette'
import ColumnResizeHandle from '../components/workspace/ColumnResizeHandle'
import { usePoChat } from '../store/poChat'
import { useTicketScan } from '../lib/useTicketScan'
import DeployConfirmModal from '../components/workspace/DeployConfirmModal'
import type { DeployTicketSummary } from '../components/workspace/DeployConfirmModal'
import BaseDirtyModal from '../components/workspace/BaseDirtyModal'
import type { Message } from '../lib/types'
import type { Pane, LeafPaneNode } from '../store/workspace'

interface Props {
  project: Project
  onBack: () => void
}

const CHORD_TIMEOUT_MS      = 1000
const ACTIVITY_BAR_WIDTH    = 48
const RESIZE_HANDLE_WIDTH   = 4
const SIDEBAR_MIN_WIDTH     = 200
const SIDEBAR_MAX_WIDTH     = 420
const SIDEBAR_DEFAULT_WIDTH = 240
const PO_CHAT_MIN_WIDTH     = 280
const PO_CHAT_MAX_WIDTH     = 560
const PO_CHAT_DEFAULT_WIDTH = 340
const CENTER_MIN_WIDTH      = 480
const SIDEBAR_STORAGE_KEY   = 'workspace.shell.sidebarWidth'
const PO_CHAT_STORAGE_KEY   = 'workspace.shell.poChatWidth'

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
  const setClaudeSessionId = useWorkspace((s) => s.setClaudeSessionId)
  const messages = useWorkspace((s) => s.messages)
  const appendMessage = useWorkspace((s) => s.appendMessage)

  const setHealth = useSessionHealth((s) => s.setHealth)
  const clearHealth = useSessionHealth((s) => s.clearHealth)

  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('project')
  const [drainVisible, setDrainVisible] = useState(true)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [quickOpenFiles, setQuickOpenFiles] = useState<Array<{ path: string; ext: string }>>([])
  const chordRef = useRef<{ kind: 'cmd-k'; timer: number } | null>(null)
  // T-P4-114 §A: artifact overflow toast (shown when >3 files would auto-open)
  const [artifactToast, setArtifactToast] = useState<string | null>(null)
  const artifactToastTimerRef = useRef<number | null>(null)

  // ── Drag-resize width state (T-P4-117) ──────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH),
  )
  const [poChatWidth, setPoChatWidth] = useState(() =>
    readStoredWidth(PO_CHAT_STORAGE_KEY, PO_CHAT_DEFAULT_WIDTH, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH),
  )
  const [activeResizeHandle, setActiveResizeHandle] = useState<'sidebar' | 'chat' | null>(null)

  // ── Deploy confirm modal state (T-P4-022 3rd PR) ────────────────────────────
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [deployModalPayload, setDeployModalPayload] = useState<{
    tickets: DeployTicketSummary[]
    gitRef: string
    project: string
    projectDir?: string
    owner?: string
    repo?: string
    branchName?: string
    ticketId?: string
    ticketTitle?: string
    ticketAcceptance?: string
    vercelProject?: string
  } | null>(null)

  // ── BaseDirtyModal state (T-P4-092) ─────────────────────────────────────────
  const [baseDirtyModal, setBaseDirtyModal] = useState<{
    projectDir: string
    ticketId: string
    slug: string
    type: 'feature' | 'fix'
  } | null>(null)

  const chatPanelVisible = usePoChat((s) => s.panelVisible)
  const restartModalOpen = usePoChat((s) => s.restartModalOpen)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  // ── Drag-resize refs (T-P4-117) ──────────────────────────────────────────────
  const shellRef            = useRef<HTMLDivElement>(null)
  const sidebarWidthRef     = useRef(sidebarWidth)
  const poChatWidthRef      = useRef(poChatWidth)
  const chatPanelVisibleRef = useRef(false)
  const dragStateRef        = useRef<{ kind: 'sidebar' | 'chat'; startX: number; startWidth: number } | null>(null)
  const bodyStyleRef        = useRef<{ cursor: string; userSelect: string } | null>(null)

  // ── Ref sync effects (T-P4-117) ─────────────────────────────────────────────
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    poChatWidthRef.current = poChatWidth
  }, [poChatWidth])

  useEffect(() => {
    chatPanelVisibleRef.current = chatPanelVisible
  }, [chatPanelVisible])

  // ── Viewport sync (T-P4-117) ────────────────────────────────────────────────
  const syncLayoutWidthsToViewport = () => {
    const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0
    if (shellWidth <= 0) return

    let nextSidebar = clampSidebarWidth(
      sidebarWidthRef.current,
      shellWidth,
      poChatWidthRef.current,
      chatPanelVisibleRef.current,
    )
    let nextChat = chatPanelVisibleRef.current
      ? clampPoChatWidth(poChatWidthRef.current, shellWidth, nextSidebar)
      : poChatWidthRef.current

    if (chatPanelVisibleRef.current) {
      nextSidebar = clampSidebarWidth(nextSidebar, shellWidth, nextChat, true)
      nextChat = clampPoChatWidth(nextChat, shellWidth, nextSidebar)
    }

    if (nextSidebar !== sidebarWidthRef.current) {
      sidebarWidthRef.current = nextSidebar
      setSidebarWidth(nextSidebar)
    }
    if (nextChat !== poChatWidthRef.current) {
      poChatWidthRef.current = nextChat
      setPoChatWidth(nextChat)
    }
  }

  useEffect(() => {
    syncLayoutWidthsToViewport()
    window.addEventListener('resize', syncLayoutWidthsToViewport)
    return () => window.removeEventListener('resize', syncLayoutWidthsToViewport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    syncLayoutWidthsToViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPanelVisible])

  // ── Drag mousemove / mouseup handler (T-P4-117) ─────────────────────────────
  useEffect(() => {
    const finishDrag = (shouldUpdateState = true) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      if (dragState.kind === 'sidebar') {
        persistWidth(SIDEBAR_STORAGE_KEY, sidebarWidthRef.current)
      } else {
        persistWidth(PO_CHAT_STORAGE_KEY, poChatWidthRef.current)
      }

      dragStateRef.current = null
      if (shouldUpdateState) {
        setActiveResizeHandle(null)
      }

      const previousBodyStyle = bodyStyleRef.current
      if (previousBodyStyle) {
        document.body.style.cursor = previousBodyStyle.cursor
        document.body.style.userSelect = previousBodyStyle.userSelect
        bodyStyleRef.current = null
      } else {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    const stopDrag = () => {
      finishDrag(true)
    }

    const onMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      event.preventDefault()
      const shellWidth = shellRef.current?.getBoundingClientRect().width ?? 0
      if (shellWidth <= 0) return

      const delta = event.clientX - dragState.startX
      if (dragState.kind === 'sidebar') {
        const nextWidth = clampSidebarWidth(
          dragState.startWidth + delta,
          shellWidth,
          poChatWidthRef.current,
          chatPanelVisibleRef.current,
        )
        if (nextWidth !== sidebarWidthRef.current) {
          sidebarWidthRef.current = nextWidth
          setSidebarWidth(nextWidth)
        }
        return
      }

      const nextWidth = clampPoChatWidth(
        dragState.startWidth - delta,
        shellWidth,
        sidebarWidthRef.current,
      )
      if (nextWidth !== poChatWidthRef.current) {
        poChatWidthRef.current = nextWidth
        setPoChatWidth(nextWidth)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDrag)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDrag)
      finishDrag(false)
    }
  }, [])

  const startResize = (kind: 'sidebar' | 'chat', event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    bodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    dragStateRef.current = {
      kind,
      startX: event.clientX,
      startWidth: kind === 'sidebar' ? sidebarWidthRef.current : poChatWidthRef.current,
    }
    setActiveResizeHandle(kind)
  }

  // ── Ticket source for Quick Open ────────────────────────────────────────────
  const { tickets: scannedTickets } = useTicketScan(project.projectDir)

  // Sync project into store on mount / change
  useEffect(() => {
    setProject(project)
  }, [project, setProject])

  // Load po-state on mount; watcher added in later slice
  useEffect(() => {
    ;(window as any).api.readPoState(project.projectDir)
      .then((s: unknown) => setPoState(s as any))
      .catch(() => setPoState(null))
  }, [project.projectDir, setPoState])

  // Re-show drain after each PO turn completes (new assistant message landed)
  const streaming = useWorkspace((s) => s.streaming)
  useEffect(() => {
    if (!streaming) {
      // Turn just finished — re-enable drain so newly queued items surface
      setDrainVisible(true)
    }
  }, [streaming])

  // ── Quick Open listener (T-P4-047) ─────────────────────────────────────────
  useEffect(() => {
    const onQuickOpen = () => setQuickOpenVisible((v) => !v)
    window.addEventListener('productune:quick-open', onQuickOpen)
    return () => window.removeEventListener('productune:quick-open', onQuickOpen)
  }, [])

  // Fetch file list when palette opens (1x per open, disposed on close).
  useEffect(() => {
    if (!quickOpenVisible) {
      setQuickOpenFiles([])
      return
    }
    const api = (window as any).api
    if (!api?.listProjectFiles) return
    api.listProjectFiles(project.projectDir)
      .then((files: Array<{ path: string; ext: string }>) => setQuickOpenFiles(files))
      .catch(() => setQuickOpenFiles([]))
  }, [quickOpenVisible, project.projectDir])

  // Native menubar → renderer: Open / New Project send the user back to HomeView.
  useEffect(() => {
    const api = (window as any).api
    const offNew = api.onMenuNewProject?.(() => onBack())
    const offOpen = api.onMenuOpenProject?.(() => onBack())
    return () => { offNew?.(); offOpen?.() }
  }, [onBack])

  // ── Session health IPC subscription (T-P4-059) ──────────────────────────────
  useEffect(() => {
    const api = (window as any).api
    if (!api?.poOnHealth) return

    const offHealth = api.poOnHealth((event: any) => {
      setHealth(event)
    })

    const offRestarted = api.poOnSessionRestarted?.(() => {
      setClaudeSessionId(null)
      clearHealth()
    })

    return () => {
      offHealth?.()
      offRestarted?.()
    }
  }, [setHealth, clearHealth, setClaudeSessionId])

  // ── Deploy modal IPC subscription (T-P4-022 3rd PR) ───────────────────────
  // PO emits state:openDeployModal → main sends deploy:openModal → renderer opens modal.
  useEffect(() => {
    const api = (window as any).api
    const off = api.onDeployModal?.((payload: typeof deployModalPayload) => {
      if (!payload) return
      setDeployModalPayload(payload)
      setDeployModalOpen(true)
    })
    return () => off?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Ticket focus IPC subscription (T-P4-114 §B) ────────────────────────────
  // Opens ticket-review tab when PO issues / dispatches a ticket.
  useEffect(() => {
    const api = (window as any).api
    if (!api?.poOnTicketFocus) return
    const off = api.poOnTicketFocus(({ ticketId }: { ticketId: string }) => {
      // openTab dedupe: already-open tab → focus only
      openTab(`ticket-review:${ticketId}`, 'ticket-review', { ticketId }, ticketId)
    })
    return () => off?.()
  }, [openTab])

  // ── Artifact auto-open IPC subscription (T-P4-114 §A) ──────────────────────
  // Opens .md / spec tabs (max 3) when changed_files[] detected in PO envelope.
  useEffect(() => {
    const api = (window as any).api
    if (!api?.poOnArtifactOpen) return

    const off = api.poOnArtifactOpen(({ files }: { files: string[] }) => {
      const openable = files.flatMap((f) => {
        const result = artifactOpenType(f)
        return result ? [{ file: f, type: result }] : []
      })

      const toOpen = openable.slice(0, ARTIFACT_OPEN_CAP)

      for (const { file, type } of toOpen) {
        const name = file.split('/').pop() ?? file
        if (type === 'markdown') {
          openTab(`markdown:${file}`, 'markdown', { path: file }, name)
        } else {
          openTab(`qa-result:${file}`, 'qa-result', { path: file }, name)
        }
      }

      // Show overflow toast when total openable > cap
      if (openable.length > ARTIFACT_OPEN_CAP) {
        const msg = t('workspace.artifacts.autoOpenToast', { count: files.length })
        if (artifactToastTimerRef.current !== null) {
          window.clearTimeout(artifactToastTimerRef.current)
        }
        setArtifactToast(msg)
        artifactToastTimerRef.current = window.setTimeout(() => {
          setArtifactToast(null)
          artifactToastTimerRef.current = null
        }, 5000)
      }
    })
    return () => off?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab, t])

  // ── Worktree create result IPC subscription (T-P4-092) ─────────────────────
  // main emits worktree:createResult → show trace or BaseDirtyModal.
  useEffect(() => {
    const api = (window as any).api
    const off = api.worktree?.onCreateResult?.((payload: {
      result: any
      ticketId: string
      slug: string
      type: string
      projectDir: string
    }) => {
      const { result, ticketId, slug, type, projectDir: pDir } = payload

      const appendTrace = (text: string) => {
        const trace: Message = {
          id: `wt-trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'system',
          kind: 'trace',
          text,
          status: 'done',
          created_at: new Date().toISOString(),
        }
        appendMessage(trace)
      }

      if (result.ok) {
        appendTrace(t('workspace.worktree.autoCreatedTrace'))
        return
      }

      switch (result.reason) {
        case 'base-dirty':
          setBaseDirtyModal({
            projectDir: pDir,
            ticketId,
            slug,
            type: type === 'fix' ? 'fix' : 'feature',
          })
          break
        case 'branch-exists':
          appendTrace(t('workspace.worktree.branchExistsTrace'))
          break
        case 'hook-not-installed':
          appendTrace(t('workspace.worktree.hookMissingTrace'))
          break
        default:
          appendTrace(t('workspace.worktree.gitErrorTrace'))
      }
    })
    return () => off?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, appendMessage])

  // Open a Tickets tab when user clicks the tickets activity icon.
  // If current_version is set, open the version-scoped tab; otherwise fall back to board.
  // Subsequent clicks dedupe via openTab's existing-id check.
  const onSelectActivity = (icon: ActivityIcon) => {
    setActiveIcon(icon)
    if (icon === 'tickets') {
      const cv = useWorkspace.getState().poState?.current_version
      if (cv) {
        openTab(`ticket-review:${cv}`, 'ticket-review', { versionFilter: cv }, cv)
      } else {
        openTab('ticket-review:board', 'ticket-review', undefined, 'Tickets')
      }
    }
  }

  // Auto-open the current version ticket tab on first mount (if current_version is set).
  // If no current_version, do nothing — EmptyPane greets the user instead.
  useEffect(() => {
    const cv = useWorkspace.getState().poState?.current_version
    if (cv) {
      openTab(`ticket-review:${cv}`, 'ticket-review', { versionFilter: cv }, cv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Retry handler: re-send the last user message ─────────────────────────────
  const handleRetry = () => {
    // Find the last user message in chat history.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || !project) return

    const api = (window as any).api
    const claudeSessionId = useWorkspace.getState().claudeSessionId

    // Re-invoke the streaming turn with the same text + resume sessionId.
    api.poSendMessage?.({
      projectDir: project.projectDir,
      text: lastUser.text,
      persona: 'pdt-po',
      resume: claudeSessionId,
    })
  }

  // ── View log handler ─────────────────────────────────────────────────────────
  const handleViewLog = () => {
    // T-P4-046 dispatcher: open terminal tab.
    // Fallback: dispatch custom event for future integration.
    openTab('terminal:po-log', 'terminal', { logPath: `${project.projectDir}/.productune/logs/po-session.log` }, 'PO Log')
  }

  // Keyboard: Cmd+W close active tab; Cmd+\ split right; Cmd+K Cmd+\ split down.
  useEffect(() => {
    const isModifier = (e: KeyboardEvent) => e.metaKey || e.ctrlKey
    const targetIsEditable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (t as HTMLElement).isContentEditable
    }

    const clearChord = () => {
      if (chordRef.current) {
        window.clearTimeout(chordRef.current.timer)
        chordRef.current = null
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isModifier(e)) return
      if (targetIsEditable(e) && e.key !== 'w' && e.key !== '\\') {
        if (!(e.key === 'p' || e.key === 'k' || e.key.toLowerCase() === 't')) return
        if (targetIsEditable(e)) return
      }
      const key = e.key.toLowerCase()

      // Chord pending — Cmd+K then Cmd+\ → split down
      if (chordRef.current?.kind === 'cmd-k') {
        if (key === '\\') {
          e.preventDefault()
          const { activePaneId } = useWorkspace.getState()
          splitDown(activePaneId)
          clearChord()
          return
        }
        clearChord()
      }

      if (key === 'w') {
        e.preventDefault()
        const s = useWorkspace.getState()
        const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
        if (leaf && leaf.tabs.length > 0 && leaf.activeTabId) {
          closeTab(s.activePaneId, leaf.activeTabId)
        } else {
          // Empty pane group → close the pane itself
          closePane(s.activePaneId)
        }
        return
      }
      if (key === '\\') {
        e.preventDefault()
        const { activePaneId } = useWorkspace.getState()
        splitRight(activePaneId)
        return
      }
      if (key === 't') {
        e.preventDefault()
        const { activePaneId } = useWorkspace.getState()
        addNewTab(activePaneId)
        return
      }
      if (key === 'k') {
        e.preventDefault()
        clearChord()
        const timer = window.setTimeout(clearChord, CHORD_TIMEOUT_MS)
        chordRef.current = { kind: 'cmd-k', timer }
        return
      }
      if (key === 'p') {
        e.preventDefault()
        // Listener for Quick Open is added by T-P4-047. Dispatch a custom event
        // so when that lands, no further wiring is needed here.
        window.dispatchEvent(new CustomEvent('productune:quick-open'))
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [closeTab, closePane, splitRight, splitDown, addNewTab])

  // ── Quick Open items (T-P4-047) ─────────────────────────────────────────────
  // Built inline so files/tickets/personas are all in scope without extra hooks.
  const quickOpenItems: QuickOpenItem[] = (() => {
    const items: QuickOpenItem[] = []

    // -- File source (priority 50; .md=60; prd.md=80) --
    const FILE_EXT_WHITELIST = new Set(['.md', '.json', '.html', '.txt'])
    for (const f of quickOpenFiles) {
      if (!FILE_EXT_WHITELIST.has(f.ext)) continue
      const name = fileBasename(f.path)
      const relPath = f.path.startsWith(project.projectDir)
        ? f.path.slice(project.projectDir.length).replace(/^\//, '')
        : f.path
      let priority = 50
      if (f.ext === '.md') priority = name.toLowerCase().includes('prd') ? 80 : 60
      items.push({
        id: `file:${f.path}`,
        source: 'file',
        label: name,
        sublabel: relPath,
        priority,
        open: () => openTab(`markdown:${f.path}`, 'markdown', { path: f.path }, name),
      })
    }

    // -- Ticket source (open=70, closed=40) --
    for (const t of scannedTickets) {
      const isClosed = t.status === 'done' || t.status === 'abandoned'
      const priority = isClosed ? 40 : 70
      const round = t.version ?? ''
      const sublabel = [round, t.status].filter(Boolean).join(' · ')
      items.push({
        id: `ticket:${t.ticket_id}`,
        source: 'ticket',
        label: t.ticket_id + (t.title ? ` — ${t.title}` : ''),
        sublabel,
        priority,
        open: () => openTab(`ticket-review:${t.ticket_id}`, 'ticket-review', { ticketId: t.ticket_id }, t.ticket_id),
      })
    }

    // -- Persona source (priority 30) --
    const PERSONAS = [
      'pdt-po',
      'pdt-designer',
      'pdt-developer',
      'pdt-qa',
      'pdt-wiki-keeper',
    ]
    for (const slug of PERSONAS) {
      items.push({
        id: `persona:${slug}`,
        source: 'persona',
        label: slug,
        sublabel: 'persona',
        priority: 30,
        open: () => openTab(`persona-def:${slug}`, 'persona-def', { personaSlug: slug }, slug),
      })
    }

    // -- Skill source (priority 30, Phase 5 placeholder — empty) --

    return items
  })()

  // Dynamic grid: 6-column layout with drag-resizable sidebar + PO chat (T-P4-117).
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
        <ColumnResizeHandle
          active={activeResizeHandle === 'sidebar'}
          ariaLabel="Resize left sidebar"
          onMouseDown={(event) => startResize('sidebar', event)}
        />
      </div>

      <div style={breadcrumbArea}>
        {/* Session health banner — severity error only, above breadcrumb */}
        <SessionHealthBanner
          onRestartSession={() => setRestartModalOpen(true)}
          onRetry={handleRetry}
          onViewLog={handleViewLog}
        />
        <PhaseBreadcrumb phase={phase} />
        {/* Pending promotion drain — turn-start surface (T-P4-066) */}
        {drainVisible && project && (
          <PendingPromotionDrain
            projectDir={project.projectDir}
            claudeSessionId={useWorkspace.getState().claudeSessionId}
            onDone={() => setDrainVisible(false)}
          />
        )}
      </div>

      <MainPanel />

      <StatusBar onOpenHealthBanner={() => setRestartModalOpen(true)} />
      {chatPanelVisible && (
        <div style={chatResizeArea}>
          <ColumnResizeHandle
            active={activeResizeHandle === 'chat'}
            ariaLabel="Resize PO chat"
            onMouseDown={(event) => startResize('chat', event)}
          />
        </div>
      )}
      <ChatPanel />

      {restartModalOpen && (
        <RestartSessionModal onClose={() => setRestartModalOpen(false)} />
      )}

      {/* ── Deploy confirm modal (T-P4-022 3rd PR) — PO-triggered ── */}
      {deployModalOpen && deployModalPayload && (
        <DeployConfirmModal
          tickets={deployModalPayload.tickets}
          gitRef={deployModalPayload.gitRef}
          project={deployModalPayload.project}
          projectDir={deployModalPayload.projectDir}
          owner={deployModalPayload.owner}
          repo={deployModalPayload.repo}
          branchName={deployModalPayload.branchName}
          ticketId={deployModalPayload.ticketId}
          ticketTitle={deployModalPayload.ticketTitle}
          ticketAcceptance={deployModalPayload.ticketAcceptance}
          vercelProject={deployModalPayload.vercelProject}
          onClose={() => {
            setDeployModalOpen(false)
            setDeployModalPayload(null)
          }}
        />
      )}

      {/* ── BaseDirtyModal (T-P4-092) — base branch dirty on worktree create ── */}
      {baseDirtyModal && (
        <BaseDirtyModal
          projectDir={baseDirtyModal.projectDir}
          ticketId={baseDirtyModal.ticketId}
          slug={baseDirtyModal.slug}
          type={baseDirtyModal.type}
          onClose={() => setBaseDirtyModal(null)}
          onSuccess={() => {
            setBaseDirtyModal(null)
          }}
        />
      )}

      {quickOpenVisible && (
        <QuickOpenPalette
          items={quickOpenItems}
          onClose={() => setQuickOpenVisible(false)}
          onPick={(item) => {
            item.open()
            setQuickOpenVisible(false)
          }}
        />
      )}

      {/* T-P4-114 §A: artifact overflow toast */}
      {artifactToast && (
        <div style={artifactToastStyle}>
          {artifactToast}
        </div>
      )}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fileBasename(p: string): string {
  return p.split('/').pop() ?? p
}

function findLeafByIdLocal(root: Pane, paneId: string): LeafPaneNode | null {
  if (root.type === 'leaf') return root.paneId === paneId ? root : null
  return findLeafByIdLocal(root.children[0], paneId) ?? findLeafByIdLocal(root.children[1], paneId)
}

// ── T-P4-114 §A: artifact auto-open helpers ───────────────────────────────────

const ARTIFACT_OPEN_CAP = 3

/**
 * Decide whether a changed file should auto-open and which tab type to use.
 * Returns null to skip (src/**, scripts/**, lock files).
 */
function artifactOpenType(filePath: string): 'markdown' | 'qa-result' | null {
  if (/^docs\/(design|tickets|qa)\/.*\.md$/.test(filePath)) return 'markdown'
  if (/\.(spec|test)\.ts$/.test(filePath)) return 'qa-result'
  return null
}

// ── T-P4-117: drag-resize localStorage helpers ────────────────────────────────

function readStoredWidth(key: string, defaultWidth: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return defaultWidth
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return defaultWidth
    }
    return parsed
  } catch {
    return defaultWidth
  }
}

function persistWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(width)))
  } catch {
    // ignore storage failures
  }
}

function clampSidebarWidth(
  requestedWidth: number,
  shellWidth: number,
  poChatWidth: number,
  chatPanelVisible: boolean,
): number {
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_WIDTH
    - (chatPanelVisible ? RESIZE_HANDLE_WIDTH + poChatWidth : 0)

  return clampPanelWidth(requestedWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, availableMax)
}

function clampPoChatWidth(
  requestedWidth: number,
  shellWidth: number,
  sidebarWidth: number,
): number {
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - sidebarWidth
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_WIDTH

  return clampPanelWidth(requestedWidth, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH, availableMax)
}

function clampPanelWidth(requestedWidth: number, min: number, max: number, availableMax: number): number {
  const boundedMax = Math.min(max, availableMax)
  if (boundedMax <= 0) return 0
  if (boundedMax < min) return clamp(requestedWidth, 0, boundedMax)
  return clamp(requestedWidth, min, boundedMax)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── styles ────────────────────────────────────────────────────────────────────

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '44px 1fr 28px',
  flex: 1,
  minHeight: 0,
  background: '#0F0F0F',
  color: '#F0F0F0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  overflow: 'hidden',
}

const breadcrumbArea: React.CSSProperties = {
  gridArea: 'breadcrumb',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const sidebarResizeArea: React.CSSProperties = {
  gridArea: 'sidebarResize',
  overflow: 'hidden',
}

const chatResizeArea: React.CSSProperties = {
  gridArea: 'chatResize',
  overflow: 'hidden',
}

const artifactToastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 36,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1E1E1E',
  border: '1px solid #3A3A3A',
  borderRadius: 6,
  color: '#C8C8CC',
  fontSize: 12,
  padding: '8px 16px',
  zIndex: 9999,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
}
