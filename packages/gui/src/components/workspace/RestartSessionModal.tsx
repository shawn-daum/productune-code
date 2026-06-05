/**
 * RestartSessionModal — confirmation dialog for session restart (T-P4-059).
 *
 * Shown when user clicks "Restart session" CTA on permission-blocked banner.
 * Two footer CTAs (§1.5.1 ≤2 rule, §1.5.3 order fix — T-P4-069):
 *   Cancel         → modal close only, banner preserved   [left ghost]
 *   Restart now    → po:restartSession IPC → renderer sessionId = null   [right primary]
 * Open settings → demoted to text link in body (§1.5.1 CTA count fix).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionHealth } from '../../store/sessionHealth'
import { useWorkspace } from '../../store/workspace'

interface Props {
  onClose: () => void
}

export default function RestartSessionModal({ onClose }: Props) {
  const { t } = useTranslation()
  const [restarting, setRestarting] = useState(false)
  const clearHealth   = useSessionHealth((s) => s.clearHealth)
  const setClaudeSessionId = useWorkspace((s) => s.setClaudeSessionId)
  const project = useWorkspace((s) => s.project)

  const handleRestartNow = async () => {
    if (restarting) return
    setRestarting(true)
    try {
      const api = (window as any).api
      // T-PATCH-040: pass projectDir so main re-snapshots the fresh-cycle window.
      await api.poRestartSession?.(project?.projectDir)
      // Reset renderer session state.
      setClaudeSessionId(null)
      clearHealth()
    } catch {
      // Ignore — main process will have already killed the child.
    } finally {
      setRestarting(false)
      onClose()
    }
  }

  const handleOpenSettings = () => {
    // T-P4-058 land: navigate to Settings / Permissions sub-tab.
    // For now, dispatch a custom event that the workspace can listen to.
    window.dispatchEvent(new CustomEvent('productune:open-settings', { detail: { tab: 'permissions' } }))
    onClose()
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="rsm-title">
      <div style={modal}>
        <h2 style={title} id="rsm-title">{t('workspace.restartModal.title')}</h2>

        <p style={body}>{t('workspace.restartModal.body')}</p>

        {/* Open settings — demoted to text link (§1.5.1 ≤2 CTA rule) */}
        <p style={settingsLinkRow}>
          <button style={btnSettingsLink} onClick={handleOpenSettings}>
            {t('workspace.restartModal.openSettings')} ↗
          </button>
        </p>

        {/* Footer: [Cancel] left, [Restart Now] right — §1.5.3 order */}
        <div style={actions}>
          <button style={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            style={{ ...btnPrimary, opacity: restarting ? 0.6 : 1 }}
            onClick={handleRestartNow}
            disabled={restarting}
          >
            {restarting ? t('common.loading') : t('workspace.restartModal.restartNow')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
}

const modal: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  padding: '24px 28px',
  width: 420,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const body: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#C0C0C0',
  lineHeight: 1.55,
}

const settingsLinkRow: React.CSSProperties = {
  margin: 0,
}

const btnSettingsLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#707070',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
  textDecoration: 'underline',
  textDecorationColor: '#404040',
}

const actions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 4,
  justifyContent: 'flex-end',
}

const btnPrimary: React.CSSProperties = {
  height: 30,
  padding: '0 16px',
  background: '#EF4444',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnGhost: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  background: 'transparent',
  color: '#707070',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
