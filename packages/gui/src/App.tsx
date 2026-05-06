import { useEffect, useState } from 'react'
import NewProjectModal from './components/NewProjectModal'
import HomeView from './views/HomeView'
import OnboardingWizard from './views/OnboardingWizard'
import WorkspaceShell from './views/WorkspaceShell'
import Titlebar from './components/workspace/Titlebar'
import type { Project } from './lib/types'

interface DescendantEntry {
  path: string
  config: { slug: string; created_at?: string; [k: string]: any }
}

type OpenPrompt =
  | { kind: 'install'; dir: string }
  | { kind: 'descendant'; dir: string; descendants: DescendantEntry[] }

export default function App() {
  const [envChecked, setEnvChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [openPrompt, setOpenPrompt] = useState<OpenPrompt | null>(null)

  // Check for productune.env on mount — show wizard if missing
  useEffect(() => {
    ;(window as any).api.checkEnv()
      .then((exists: boolean) => {
        setShowOnboarding(!exists)
        setEnvChecked(true)
      })
      .catch(() => {
        // If IPC fails (e.g. dev without Electron), skip wizard
        setEnvChecked(true)
      })
  }, [])

  async function handleOpenFolder() {
    const result = await (window as any).api.openFolder()
    if (!result) return
    if (result.kind === 'self') {
      setProject({ slug: result.config.slug, projectDir: result.dir })
    } else if (result.kind === 'descendant') {
      setOpenPrompt({ kind: 'descendant', dir: result.dir, descendants: result.descendants })
    } else {
      setOpenPrompt({ kind: 'install', dir: result.dir })
    }
  }

  function openRecent(projectDir: string, slug: string) {
    setProject({ slug, projectDir })
  }

  function openDescendant(entry: DescendantEntry) {
    setOpenPrompt(null)
    setProject({ slug: entry.config.slug, projectDir: entry.path })
  }

  async function installAtPromptDir() {
    if (!openPrompt) return
    const dir = openPrompt.dir
    setOpenPrompt(null)
    try {
      const result = await (window as any).api.installAt({ projectDir: dir })
      setProject({ slug: result.config.slug, projectDir: dir })
    } catch (e: any) {
      console.error('installAt failed', e)
    }
  }

  // Wait for env check to avoid layout flash
  if (!envChecked) {
    return (
      <div style={appShell}>
        <Titlebar title="productune" />
      </div>
    )
  }

  const titleText =
    showOnboarding ? 'productune 초기 설정'
    : project ? project.slug
    : 'productune'

  return (
    <div style={appShell}>
      <Titlebar title={titleText} />

      <div style={viewport}>
        {showOnboarding ? (
          <OnboardingWizard onDone={() => setShowOnboarding(false)} />
        ) : project ? (
          <WorkspaceShell project={project} onBack={() => setProject(null)} />
        ) : (
          <HomeView
            onNewProject={() => setShowNewModal(true)}
            onOpenFolder={handleOpenFolder}
            onOpenRecent={openRecent}
          />
        )}
      </div>

      {openPrompt?.kind === 'install' && (
        <InstallPromptDialog
          dir={openPrompt.dir}
          onConfirm={installAtPromptDir}
          onCancel={() => setOpenPrompt(null)}
        />
      )}

      {openPrompt?.kind === 'descendant' && (
        <DescendantPromptDialog
          dir={openPrompt.dir}
          descendants={openPrompt.descendants}
          onOpen={openDescendant}
          onInstallHere={installAtPromptDir}
          onCancel={() => setOpenPrompt(null)}
        />
      )}

      {showNewModal && (
        <NewProjectModal
          onCreated={(projectDir, slug) => { setShowNewModal(false); setProject({ slug, projectDir }) }}
          onCancel={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}

function InstallPromptDialog({ dir, onConfirm, onCancel }: { dir: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={overlay}>
      <div style={bannerCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>이 폴더에서 productune을 시작할까요?</div>
        <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginBottom: 16 }}>{dir}</div>
        <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 20 }}>
          이 폴더에는 아직 productune 프로젝트가 설정되지 않았습니다. 지금 설치하면 PRD·디자인·티켓을 이 폴더에서 관리할 수 있습니다.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnSecondary} onClick={onCancel}>취소</button>
          <button style={btnPrimary} onClick={onConfirm}>설치하고 시작</button>
        </div>
      </div>
    </div>
  )
}

function DescendantPromptDialog({
  dir, descendants, onOpen, onInstallHere, onCancel,
}: {
  dir: string
  descendants: { path: string; config: { slug: string; created_at?: string; [k: string]: any } }[]
  onOpen: (entry: { path: string; config: { slug: string; [k: string]: any } }) => void
  onInstallHere: () => void
  onCancel: () => void
}) {
  return (
    <div style={overlay}>
      <div style={{ ...bannerCard, width: 480 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
          선택한 폴더 안에 productune 프로젝트가 있습니다.
        </div>
        <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginBottom: 16 }}>{dir}</div>
        <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 16 }}>
          어떤 폴더를 열까요?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {descendants.map(entry => (
            <button
              key={entry.path}
              style={descendantItem}
              onClick={() => onOpen(entry)}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0' }}>
                <span style={{ color: '#FF6B2B', marginRight: 6 }}>⚡</span>
                {entry.config.slug}
              </div>
              <div style={{ fontSize: 11, color: '#707070', fontFamily: 'monospace', marginTop: 2 }}>
                {entry.path}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button style={btnGhost} onClick={onInstallHere}>현재 폴더에 새로 설치</button>
          <button style={btnSecondary} onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const appShell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  width: '100vw', height: '100vh',
  background: '#0A0A0A',
  overflow: 'hidden',
}
const viewport: React.CSSProperties = {
  flex: 1, display: 'flex', minHeight: 0, position: 'relative',
}
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
}
const bannerCard: React.CSSProperties = {
  background: '#1A1A1A', borderRadius: 12, border: '1px solid #333',
  padding: '24px', width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
}
const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
}
const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#A0A0A0', border: '1px solid #333', borderRadius: 4,
  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
}
const descendantItem: React.CSSProperties = {
  background: '#161616', border: '1px solid #2A2A2A', borderRadius: 6,
  padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
  transition: 'border-color 0.15s, background 0.15s',
}
