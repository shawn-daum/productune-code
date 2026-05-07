/**
 * RestartSessionModal — confirmation dialog for session restart (T-P4-059).
 *
 * Shown when user clicks "Restart session" CTA on permission-blocked banner.
 * Three actions:
 *   Restart now    → po:restartSession IPC → renderer sessionId = null
 *   Open settings  → navigate to Settings tab (T-P4-058 land target)
 *   Cancel         → modal close only, banner preserved
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

  const handleRestartNow = async () => {
    if (restarting) return
    setRestarting(true)
    try {
      const api = (window as any).api
      await api.poRestartSession?.()
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
        <h2 style={title} id="rsm-title">Restart PO session</h2>

        <p style={body}>
          The current session was stopped by a permission rule. Restarting will
          start a new claude session — your chat history is preserved on disk.
        </p>

        <p style={bodySub}>
          Common cause: another user&apos;s path glob in{' '}
          <code style={code}>.claude/settings.local.json</code>. See settings
          hygiene (T-P4-058) for the auto-fix.
        </p>

        <div style={actions}>
          <button
            style={{ ...btnPrimary, opacity: restarting ? 0.6 : 1 }}
            onClick={handleRestartNow}
            disabled={restarting}
          >
            {restarting ? t('common.loading') : 'Restart now'}
          </button>

          <button style={btnSecondary} onClick={handleOpenSettings}>
            {t('workspace.sessionHealth.permissionBlocked.cta').includes('설정')
              ? '설정 열기 ↗'
              : 'Open settings ↗'}
          </button>

          <button style={btnGhost} onClick={onClose}>
            {t('common.cancel')}
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

const bodySub: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: '#909090',
  lineHeight: 1.5,
}

const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  background: '#2A2A2A',
  borderRadius: 3,
  padding: '1px 4px',
}

const actions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 4,
  flexWrap: 'wrap',
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

const btnSecondary: React.CSSProperties = {
  height: 30,
  padding: '0 14px',
  background: 'transparent',
  color: '#C0C0C0',
  border: '1px solid #3A3A3A',
  borderRadius: 4,
  fontSize: 12,
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
