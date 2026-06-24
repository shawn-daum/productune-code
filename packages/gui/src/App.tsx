import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18next from './i18n'
import NewProjectModal from './components/NewProjectModal'
import HomeView from './views/HomeView'
import OnboardingWizard from './views/OnboardingWizard'
import EntryGate from './components/EntryGate'
import Titlebar from './components/workspace/Titlebar'
import QuitGuardToast from './components/workspace/QuitGuardToast'
import type { Project } from './lib/types'
import './store/poEvents' // T-P4-119: PO IPC subscriptions registered at module load.
import { initTrayBridge } from './store/trayBridge' // T-PATCH-177: persona→tray sync.

interface DescendantEntry {
  path: string
  config: { slug: string; created_at?: string; [k: string]: any }
}

type OpenPrompt =
  | { kind: 'install'; dir: string }
  | { kind: 'legacy'; dir: string; hints: string[] }
  | { kind: 'descendant'; dir: string; descendants: DescendantEntry[] }
  // T-PATCH-135: a productune root was found in a PARENT dir of the opened folder.
  | { kind: 'ancestor'; dir: string; ancestorRoot: string; distance: number; config: { slug: string; [k: string]: any } }

export default function App() {
  const { t } = useTranslation()
  const [envChecked, setEnvChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Lazy init — read last opened project from localStorage at first render
  // so Cmd+R / app relaunch immediately mounts WorkspaceShell, no flash to HomeView.
  const [project, setProject] = useState<Project | null>(() => {
    try {
      const raw = localStorage.getItem('productune.lastProject')
      if (raw) {
        const saved = JSON.parse(raw) as Project
        if (saved?.projectDir && saved?.slug) return saved
      }
    } catch { /* localStorage unavailable or corrupt — start fresh */ }
    return null
  })
  const [showNewModal, setShowNewModal] = useState(false)
  const [openPrompt, setOpenPrompt] = useState<OpenPrompt | null>(null)

  // Persist last opened project across Cmd+R reload.
  useEffect(() => {
    try {
      if (project) localStorage.setItem('productune.lastProject', JSON.stringify(project))
      else localStorage.removeItem('productune.lastProject')
    } catch { /* localStorage may be unavailable */ }
  }, [project])

  // T-PATCH-177: init the persona→tray bridge once at App mount. Subscribes
  // personaPresence + workspace.streaming → derived snapshot → window.api.trayUpdate.
  useEffect(() => {
    const teardown = initTrayBridge()
    return teardown
  }, [])

  // (T-P4-091 §A) Stale last-project guard — runs once on mount after lazy init.
  // If lazy init loaded a projectDir from localStorage, verify it still exists on disk.
  // false → clear localStorage + fall back to HomeView (silent recovery).
  // In browser-dev-mode (window.api absent) the property access throws and the
  // catch below swallows it — current state is kept, no boot crash. (T-PATCH-213)
  useEffect(() => {
    const dir = project?.projectDir
    if (!dir) return
    ;(async () => {
      try {
        const exists: boolean = await (window as any).api.checkProjectExists(dir)
        if (!exists) {
          try { localStorage.removeItem('productune.lastProject') } catch { /* unavailable */ }
          setProject(null)
        }
      } catch { /* IPC unavailable in browser dev mode — keep current state */ }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: load saved language + check if onboarding is needed + restore last project
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
        if (!envExists || !hasLangPref) {
          // (T-P4-091 §C) Onboarding entry = full reset intent. Clear stale lastProject so
          // onboarding completion always lands on HomeView, not a deleted/stale project.
          try { localStorage.removeItem('productune.lastProject') } catch { /* unavailable */ }
          setProject(null)
          setShowOnboarding(true)
        } else {
          setShowOnboarding(false)
        }
      } catch {
        // IPC unavailable (browser dev mode) — skip wizard
      }

      // (Restore last opened project handled in useState lazy init above)

      setEnvChecked(true)
    }
    init()
  }, [])

  async function handleOpenFolder() {
    const result = await (window as any).api.openFolder()
    if (!result) return
    if (result.kind === 'self') {
      setProject({ slug: result.config.slug, projectDir: result.dir })
    } else if (result.kind === 'self-legacy') {
      setOpenPrompt({ kind: 'legacy', dir: result.dir, hints: result.hints })
    } else if (result.kind === 'ancestor') {
      setOpenPrompt({ kind: 'ancestor', dir: result.dir, ancestorRoot: result.ancestorRoot, distance: result.distance, config: result.config })
    } else if (result.kind === 'descendant') {
      setOpenPrompt({ kind: 'descendant', dir: result.dir, descendants: result.descendants })
    } else {
      setOpenPrompt({ kind: 'install', dir: result.dir })
    }
  }

  // Open Recent → macOS `open-file` IPC → no dialog, just detect + open (T-P4-111)
  async function handleOpenKnownDir(dirPath: string) {
    try {
      const result = await (window as any).api.openKnownDir?.(dirPath)
      if (!result) return
      if (result.kind === 'self') {
        setProject({ slug: result.config.slug, projectDir: result.dir })
      } else if (result.kind === 'self-legacy') {
        setOpenPrompt({ kind: 'legacy', dir: result.dir, hints: result.hints })
      } else if (result.kind === 'ancestor') {
        setOpenPrompt({ kind: 'ancestor', dir: result.dir, ancestorRoot: result.ancestorRoot, distance: result.distance, config: result.config })
      } else if (result.kind === 'descendant') {
        setOpenPrompt({ kind: 'descendant', dir: result.dir, descendants: result.descendants })
      } else {
        setOpenPrompt({ kind: 'install', dir: result.dir })
      }
    } catch (e) {
      console.error('handleOpenKnownDir failed', e)
    }
  }

  // Subscribe to macOS Open Recent item click events (T-P4-111)
  useEffect(() => {
    const unsub = (window as any).api?.onOpenRecentProject?.((dirPath: string) => {
      handleOpenKnownDir(dirPath)
    })
    return () => unsub?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // (T-009 flow-a) File → Open Project: bypass home screen, open dialog directly.
  useEffect(() => {
    const unsub = (window as any).api?.onMenuOpenProject?.(() => {
      handleOpenFolder()
    })
    return () => unsub?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // (T-009 flow-b) File → New Window: new window always starts at HomeView.
  useEffect(() => {
    const unsub = (window as any).api?.onResetToHome?.(() => {
      try { localStorage.removeItem('productune.lastProject') } catch { /* unavailable */ }
      setProject(null)
    })
    return () => unsub?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openRecent(projectDir: string, slug: string) {
    // T-PATCH-050: always add to recents when opening via any path
    ;(window as any).api.addRecent?.({ projectDir, slug }).catch(() => {})
    setProject({ slug, projectDir })
  }

  function openDescendant(entry: DescendantEntry) {
    setOpenPrompt(null)
    // T-PATCH-050: add to recents for descendant open path
    ;(window as any).api.addRecent?.({ projectDir: entry.path, slug: entry.config.slug }).catch(() => {})
    setProject({ slug: entry.config.slug, projectDir: entry.path })
  }

  // T-PATCH-135: open the productune root found in a parent dir. Re-resolves via
  // openKnownDir so it opens as self-current (heals config-less roots on the way).
  async function openAncestorRoot() {
    if (!openPrompt || openPrompt.kind !== 'ancestor') return
    const root = openPrompt.ancestorRoot
    setOpenPrompt(null)
    try {
      const result = await (window as any).api.openKnownDir?.(root)
      if (result?.kind === 'self') {
        setProject({ slug: result.config.slug, projectDir: result.dir })
      } else if (result?.kind === 'self-legacy') {
        setOpenPrompt({ kind: 'legacy', dir: result.dir, hints: result.hints })
      } else {
        // Defensive: root vanished/changed between detect and open.
        setProject({ slug: openPrompt.config.slug, projectDir: root })
      }
    } catch (e) {
      console.error('openAncestorRoot failed', e)
    }
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

  async function migrateLegacyDir() {
    if (!openPrompt || openPrompt.kind !== 'legacy') return
    const dir = openPrompt.dir
    setOpenPrompt(null)
    try {
      const result = await (window as any).api.migrateLegacy({ projectDir: dir })
      setProject({ slug: result.config.slug, projectDir: dir })
    } catch (e: any) {
      console.error('migrateLegacy failed', e)
    }
  }

  // Wait for env check to avoid layout flash
  if (!envChecked) {
    return (
      <div style={appShell}>
        <Titlebar title="Productune" />
      </div>
    )
  }

  const titleText =
    showOnboarding ? t('app.onboardingTitle')
    : project ? project.slug
    : 'Productune'

  return (
    <div style={appShell}>
      <Titlebar title={titleText} />

      <div style={viewport}>
        {showOnboarding ? (
          <OnboardingWizard onDone={() => setShowOnboarding(false)} />
        ) : project ? (
          /* T-P4-101: EntryGate reads onboarding.json and routes to
             FreshComposer (pending) or WorkspaceShell (done/legacy). */
          <EntryGate project={project} onBack={() => setProject(null)} />
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

      {openPrompt?.kind === 'legacy' && (
        <LegacyMigrateDialog
          dir={openPrompt.dir}
          hints={openPrompt.hints}
          onConfirm={migrateLegacyDir}
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

      {openPrompt?.kind === 'ancestor' && (
        <AncestorPromptDialog
          dir={openPrompt.dir}
          ancestorRoot={openPrompt.ancestorRoot}
          distance={openPrompt.distance}
          onOpenAncestor={openAncestorRoot}
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

      {/* T-PATCH-254: single app-level quit-guard toast. position:fixed escapes
          layout; sits outside the onboarding/HomeView/WorkspaceShell switch so the
          first-⌘Q guidance shows on every screen. Self-contained IPC subscription. */}
      <QuitGuardToast />
    </div>
  )
}

function InstallPromptDialog({ dir, onConfirm, onCancel }: { dir: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={overlay}>
      <div style={modalCard}>
        <div style={modalTitle}>{t('app.install.title')}</div>
        <div style={modalPath}>{dir}</div>
        <div style={modalBody}>
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

function LegacyMigrateDialog({ dir, hints, onConfirm, onCancel }: { dir: string; hints: string[]; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={overlay}>
      <div style={modalCard}>
        <div style={modalTitle}>{t('app.migrate.title')}</div>
        <div style={modalPath}>{dir}</div>
        <div style={modalBody}>
          {t('app.migrate.description', { hints: hints.join(', ') })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnSecondary} onClick={onCancel}>{t('app.migrate.cancel')}</button>
          <button style={btnPrimary} onClick={onConfirm}>{t('app.migrate.confirm')}</button>
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
      <div style={{ ...modalCard, width: 480 }}>
        <div style={modalTitle}>
          {t('app.descendant.title')}
        </div>
        <div style={modalPath}>{dir}</div>
        <div style={{ ...modalBody, marginBottom: 16 }}>
          {t('app.descendant.prompt')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {descendants.map(entry => (
            <button
              key={entry.path}
              style={descendantItem}
              onClick={() => onOpen(entry)}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E8EA', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpen size={14} color="#8B5CF6" strokeWidth={2} />
                {entry.config.slug}
              </div>
              <div style={{ fontSize: 11, color: '#C8C8CC', fontFamily: 'monospace', marginTop: 2 }}>
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

// T-PATCH-135: a productune root exists in a PARENT dir of the opened folder.
// 3-button choice: open that root (default) / install here / cancel.
function AncestorPromptDialog({
  dir, ancestorRoot, distance, onOpenAncestor, onInstallHere, onCancel,
}: {
  dir: string
  ancestorRoot: string
  distance: number
  onOpenAncestor: () => void
  onInstallHere: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div style={overlay}>
      <div style={{ ...modalCard, width: 480 }}>
        <div style={modalTitle}>{t('app.ancestor.title')}</div>
        <div style={modalPath}>{ancestorRoot}</div>
        <div style={{ ...modalBody, marginBottom: 16 }}>
          {t('app.ancestor.prompt', { dir, distance })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button style={btnGhost} onClick={onInstallHere}>{t('app.ancestor.installHere')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnSecondary} onClick={onCancel}>{t('app.ancestor.cancel')}</button>
            <button style={btnPrimary} onClick={onOpenAncestor}>{t('app.ancestor.openAncestor')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Design tokens ─────────────────────────────────────────────────────────────
// --surface-app:   #0F0F11
// --surface-modal: #1C1C20   (contrast vs --text-primary #E8E8EA → 12.6:1 AAA)
// --text-primary:  #E8E8EA   (body text — WCAG AAA on --surface-modal)
// --text-muted:    #C8C8CC   (path / meta — WCAG AAA on --surface-modal)
// --border-modal:  rgba(255,255,255,0.10)
// --shadow-modal:  0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)

// ── styles ────────────────────────────────────────────────────────────────────

const appShell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  width: '100vw', height: '100vh',
  background: '#0F0F0F', /* --surface-body */
  overflow: 'hidden',
}
const viewport: React.CSSProperties = {
  flex: 1, display: 'flex', minHeight: 0, position: 'relative',
}
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
}
// Updated modal card — design system aligned, WCAG AA+
const modalCard: React.CSSProperties = {
  background: '#1C1C20',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.10)',
  padding: '24px 28px',
  width: 420,
  boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
}
const modalTitle: React.CSSProperties = {
  fontWeight: 600, fontSize: 15, color: '#E8E8EA', marginBottom: 8,
}
const modalPath: React.CSSProperties = {
  fontSize: 12, color: '#C8C8CC', fontFamily: 'monospace', marginBottom: 16,
}
const modalBody: React.CSSProperties = {
  fontSize: 14, color: '#E8E8EA', lineHeight: 1.55, marginBottom: 20,
}
const btnPrimary: React.CSSProperties = {
  background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
}
const btnSecondary: React.CSSProperties = {
  background: '#1C1C20', color: '#E8E8EA', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, /* --surface-modal */
  padding: '10px 16px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#C8C8CC', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4,
  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
}
const descendantItem: React.CSSProperties = {
  background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, /* --surface-panel */
  padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
  transition: 'border-color 0.15s, background 0.15s',
}
