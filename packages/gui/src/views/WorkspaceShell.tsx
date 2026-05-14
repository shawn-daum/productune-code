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
import { usePoChat } from '../store/poChat'
import { useTicketScan } from '../lib/useTicketScan'
import DeployConfirmModal from '../components/workspace/DeployConfirmModal'
import type { DeployTicketSummary } from '../components/workspace/DeployConfirmModal'
import BaseDirtyModal from '../components/workspace/BaseDirtyModal'
import type { Message } from '../lib/types'

interface Props {
  project: Project
  onBack: () => void
}

const CHORD_TIMEOUT_MS = 1000

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

  // Collapse the right column when PO chat is minimized.
  const dynamicGrid: React.CSSProperties = {
    ...grid,
    gridTemplateColumns: chatPanelVisible
      ? '48px 240px 1fr 340px'
      : '48px 240px 1fr 0px',
  }

  return (
    <div style={dynamicGrid}>
      <ActivityBar active={activeIcon} onSelect={onSelectActivity} />
      <LeftSidebar project={project} activeIcon={activeIcon} />

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
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

import type { Pane, LeafPaneNode } from '../store/workspace'

function fileBasename(p: string): string {
  return p.split('/').pop() ?? p
}

function findLeafByIdLocal(root: Pane, paneId: string): LeafPaneNode | null {
  if (root.type === 'leaf') return root.paneId === paneId ? root : null
  return findLeafByIdLocal(root.children[0], paneId) ?? findLeafByIdLocal(root.children[1], paneId)
}

// ── styles ────────────────────────────────────────────────────────────────────

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '48px 240px 1fr 340px',
  gridTemplateRows: '44px 1fr 28px',
  gridTemplateAreas: `
    "activity sidebar breadcrumb chat"
    "activity sidebar center     chat"
    "activity sidebar status     chat"
  `,
  flex: 1, minHeight: 0,
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
