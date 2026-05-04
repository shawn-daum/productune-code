import { useEffect, useState } from 'react'
import NewProjectModal from './components/NewProjectModal'
import HomeView from './views/HomeView'
import OnboardingWizard from './views/OnboardingWizard'

interface Project {
  slug: string
  projectDir: string
}

interface InitBanner {
  dir: string
}

export default function App() {
  const [envChecked, setEnvChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [initBanner, setInitBanner] = useState<InitBanner | null>(null)

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
    if (result.hasProductune && result.config) {
      setProject({ slug: result.config.slug, projectDir: result.dir })
    } else {
      setInitBanner({ dir: result.dir })
    }
  }

  function openRecent(projectDir: string, slug: string) {
    setProject({ slug, projectDir })
  }

  // Wait for env check to avoid layout flash
  if (!envChecked) {
    return <div style={splashScreen} />
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onDone={() => setShowOnboarding(false)}
      />
    )
  }

  if (project) {
    return <WorkspaceView project={project} onBack={() => setProject(null)} />
  }

  return (
    <>
      <HomeView
        onNewProject={() => setShowNewModal(true)}
        onOpenFolder={handleOpenFolder}
        onOpenRecent={openRecent}
      />

      {initBanner && (
        <InitPromptBanner
          banner={initBanner}
          onConfirm={() => { setInitBanner(null); setShowNewModal(true) }}
          onCancel={() => setInitBanner(null)}
        />
      )}

      {showNewModal && (
        <NewProjectModal
          onCreated={(projectDir, slug) => { setShowNewModal(false); setProject({ slug, projectDir }) }}
          onCancel={() => setShowNewModal(false)}
        />
      )}
    </>
  )
}

function InitPromptBanner({ banner, onConfirm, onCancel }: { banner: InitBanner; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={overlay}>
      <div style={bannerCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>이 폴더에 productune 시작하기?</div>
        <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginBottom: 16 }}>{banner.dir}</div>
        <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 20 }}>
          .productune/ 폴더가 없습니다. 지금 초기화하면 이 폴더에서 productune을 시작할 수 있습니다.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnSecondary} onClick={onCancel}>취소</button>
          <button style={btnPrimary} onClick={onConfirm}>확인</button>
        </div>
      </div>
    </div>
  )
}

function WorkspaceView({ project, onBack }: { project: Project; onBack: () => void }) {
  return (
    <div style={workspaceWrap}>
      <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 4 }}>
        <span style={{ color: '#FF6B2B' }}>⚡</span> {project.slug}
      </div>
      <div style={{ fontSize: 11, color: '#505050', fontFamily: 'monospace', marginBottom: 32 }}>
        {project.projectDir}
      </div>
      <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>프로젝트 생성 완료</div>
      <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 32 }}>
        .productune/config.json 생성됨
      </div>
      <button style={btnSecondary} onClick={onBack}>← 홈으로</button>
    </div>
  )
}

// --- styles ---
const splashScreen: React.CSSProperties = {
  background: '#0A0A0A', width: '100vw', height: '100vh',
}
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
}
const bannerCard: React.CSSProperties = {
  background: '#1A1A1A', borderRadius: 12, border: '1px solid #333',
  padding: '24px', width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
}
const workspaceWrap: React.CSSProperties = {
  background: '#0F0F0F', width: '100vw', height: '100vh',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  color: '#F0F0F0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  userSelect: 'none',
}
const btnPrimary: React.CSSProperties = {
  background: '#FF6B2B', color: '#fff', border: 'none', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
}
const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
}
