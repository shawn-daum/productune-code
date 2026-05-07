import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from './i18n'
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
  const { t } = useTranslation()
  const [envChecked, setEnvChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [openPrompt, setOpenPrompt] = useState<OpenPrompt | null>(null)

  // On mount: load saved language + check if onboarding is needed
  useEffect(() => {
    async function init() {
      // 1. Load persisted language preference
      try {
        const hasLangPref: boolean = await (window as any).api.hasLanguagePref()
        if (hasLangPref) {
          const lng: 'en' | 'ko' = await (window as any).api.getUiLanguage()
          await i18next.changeLanguage(lng)
        }
      } catch { /* IPC unavailable in browser dev mode — keep default 'en' */ }

      // 2. Check if productune.env exists (legacy onboarding signal)
      try {
        const envExists: boolean = await (window as any).api.checkEnv()
        // Show onboarding wizard when either:
        // - productune.env missing (first run), OR
        // - settings.json has no language pref yet (migration: existing user hasn't seen step 0)
        const hasLangPref: boolean = await (window as any).api.hasLanguagePref().catch(() => false)
        setShowOnboarding(!envExists || !hasLangPref)
      } catch {
        // IPC unavailable (browser dev mode) — skip wizard
      }
      setEnvChecked(true)
    }
    init()
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
    showOnboarding ? t('app.onboardingTitle')
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
  const { t } = useTranslation()
  return (
    <div style={overlay}>
      <div style={bannerCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t('app.install.title')}</div>
        <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginBottom: 16 }}>{dir}</div>
        <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 20 }}>
          {t('app.install.description')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnSecondary} onClick={onCancel}>{t('app.install.cancel')}</button>
          <button style={btnPrimary} onClick={onConfirm}>{t('app.install.confirm')}</button>
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
  const { t } = useTranslation()
  return (
    <div style={overlay}>
      <div style={{ ...bannerCard, width: 480 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
          {t('app.descendant.title')}
        </div>
        <div style={{ fontSize: 12, color: '#505050', fontFamily: 'monospace', marginBottom: 16 }}>{dir}</div>
        <div style={{ fontSize: 13, color: '#A0A0A0', marginBottom: 16 }}>
          {t('app.descendant.prompt')}
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
          <button style={btnGhost} onClick={onInstallHere}>{t('app.descendant.installHere')}</button>
          <button style={btnSecondary} onClick={onCancel}>{t('app.descendant.cancel')}</button>
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
