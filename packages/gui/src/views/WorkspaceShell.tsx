import { useEffect, useState } from 'react'
import type { Project } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import PhaseBreadcrumb from '../components/workspace/PhaseBreadcrumb'
import LeftSidebar from '../components/workspace/LeftSidebar'
import CenterPane from '../components/workspace/CenterPane'
import StatusBar from '../components/workspace/StatusBar'
import ActivityBar, { type ActivityIcon } from '../components/workspace/ActivityBar'
import ChatPanel from '../components/workspace/ChatPanel'

interface Props {
  project: Project
  onBack: () => void
}

export default function WorkspaceShell({ project, onBack }: Props) {
  const { phase, setProject, setPoState } = useWorkspace()
  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('rooms')

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

  return (
    <div style={grid}>
      {/* 좌 48px ActivityBar */}
      <ActivityBar active={activeIcon} onSelect={setActiveIcon} />

      {/* 좌 240px LeftSidebar — activeIcon 따라 내용 분기 */}
      <LeftSidebar project={project} onBack={onBack} activeIcon={activeIcon} />

      {/* breadcrumb — top-center */}
      <div style={breadcrumbArea}>
        <PhaseBreadcrumb phase={phase} />
      </div>

      {/* center pane */}
      <CenterPane />

      {/* status bar */}
      <StatusBar />

      {/* 우 360px ChatPanel — Slice 3 streaming 자리 */}
      <ChatPanel />
    </div>
  )
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
