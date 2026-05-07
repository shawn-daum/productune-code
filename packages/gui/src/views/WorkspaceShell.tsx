import { useEffect, useRef, useState } from 'react'
import type { Project } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import PhaseBreadcrumb from '../components/workspace/PhaseBreadcrumb'
import LeftSidebar from '../components/workspace/LeftSidebar'
import MainPanel from '../components/workspace/main/MainPanel'
import StatusBar from '../components/workspace/StatusBar'
import ActivityBar, { type ActivityIcon } from '../components/workspace/ActivityBar'
import ChatPanel from '../components/workspace/ChatPanel'

interface Props {
  project: Project
  onBack: () => void
}

const CHORD_TIMEOUT_MS = 1000

export default function WorkspaceShell({ project, onBack }: Props) {
  const phase = useWorkspace((s) => s.phase)
  const setProject = useWorkspace((s) => s.setProject)
  const setPoState = useWorkspace((s) => s.setPoState)
  const openTab = useWorkspace((s) => s.openTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const closePane = useWorkspace((s) => s.closePane)
  const splitRight = useWorkspace((s) => s.splitRight)
  const splitDown = useWorkspace((s) => s.splitDown)
  const addNewTab = useWorkspace((s) => s.addNewTab)

  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('tickets')
  const chordRef = useRef<{ kind: 'cmd-k'; timer: number } | null>(null)

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

  // Native menubar → renderer: Open / New Project send the user back to HomeView.
  useEffect(() => {
    const api = (window as any).api
    const offNew = api.onMenuNewProject?.(() => onBack())
    const offOpen = api.onMenuOpenProject?.(() => onBack())
    return () => { offNew?.(); offOpen?.() }
  }, [onBack])

  // Open a Tickets board tab when user clicks the tickets activity icon.
  // Subsequent clicks dedupe via openTab's existing-id check.
  const onSelectActivity = (icon: ActivityIcon) => {
    setActiveIcon(icon)
    if (icon === 'tickets') {
      openTab('ticket-review:board', 'ticket-review', undefined, 'Tickets')
    }
  }

  // Auto-open the board on first mount so the empty pane doesn't greet a fresh user.
  useEffect(() => {
    openTab('ticket-review:board', 'ticket-review', undefined, 'Tickets')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return (
    <div style={grid}>
      <ActivityBar active={activeIcon} onSelect={onSelectActivity} />
      <LeftSidebar project={project} activeIcon={activeIcon} />

      <div style={breadcrumbArea}>
        <PhaseBreadcrumb phase={phase} />
      </div>

      <MainPanel />

      <StatusBar />
      <ChatPanel />
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────

import type { Pane, LeafPaneNode } from '../store/workspace'

function findLeafByIdLocal(root: Pane, paneId: string): LeafPaneNode | null {
  if (root.type === 'leaf') return root.paneId === paneId ? root : null
  return findLeafByIdLocal(root.children[0], paneId) ?? findLeafByIdLocal(root.children[1], paneId)
}

// ── styles ────────────────────────────────────────────────────────────────────

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '48px 240px 1fr 360px',
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
}
