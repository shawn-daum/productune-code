/**
 * DeployConfirmModal — T-P4-022 sub-d.
 *
 * Shown by PO when ≥1 ticket is done+qa-passed and conditions are met (§2).
 * User confirms → deploy:create IPC + ChatPanel trace.
 * User dismisses → caller handles 30-min snooze (2nd PR sub-b).
 *
 * Manual test path (1st PR): import and render with mock tickets prop.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import { useUserMode } from '../../store/useUserMode'
import type { Message } from '../../lib/types'

export interface DeployTicketSummary {
  id: string
  title: string
}

interface Props {
  tickets: DeployTicketSummary[]
  gitRef: string
  project: string
  onClose: () => void
}

export default function DeployConfirmModal({ tickets, gitRef, project, onClose }: Props) {
  const { t } = useTranslation()
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)

  const appendMessage = useWorkspace((s) => s.appendMessage)
  const projectStore  = useWorkspace((s) => s.project)
  const userMode      = useUserMode((s) => s.mode)
  const isDev         = userMode === 'developer'

  // Esc dismiss — not while deploying
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deploying) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deploying, onClose])

  useEffect(() => {
    dismissRef.current?.focus()
  }, [])

  const injectTrace = (key: string, vars?: Record<string, string>) => {
    const msg: Message = {
      id: `trace-deploy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'system',
      kind: 'trace',
      text: t(key, vars ?? {}),
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(msg)
  }

  const handleDeploy = async () => {
    if (deploying) return
    setDeploying(true)
    setError(null)

    const projectDir = projectStore?.projectDir ?? ''
    injectTrace('workspace.deploy.startTrace', { count: String(tickets.length) })

    const api = (window as any).api
    const started = Date.now()

    try {
      const result = await api.deploy?.create({
        projectDir,
        project,
        gitRef,
        options: { target: 'production' as const },
      })

      if (!result?.ok) {
        const errMsg = result?.code === 'auth'
          ? t('workspace.deploy.errorAuth')
          : (result?.error ?? t('workspace.deploy.errorGeneric'))
        injectTrace('workspace.deploy.failedTrace', { reason: errMsg })
        setError(errMsg)
        setDeploying(false)
        return
      }

      const elapsed = Math.round((Date.now() - started) / 1000)
      const mins = Math.floor(elapsed / 60)
      const secs = elapsed % 60
      injectTrace('workspace.deploy.completeTrace', {
        minutes: String(mins),
        seconds: String(secs),
      })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      injectTrace('workspace.deploy.failedTrace', { reason: msg })
      setError(msg)
      setDeploying(false)
    }
  }

  const title = isDev
    ? t('workspace.deploy.confirmTitle.dev', { count: tickets.length })
    : t('workspace.deploy.confirmTitle.planner', { count: tickets.length })

  const bodyIntro = isDev
    ? t('workspace.deploy.confirmBody.dev', { ids: tickets.map((tk) => tk.id).join(', ') })
    : t('workspace.deploy.confirmBody.planner', { count: tickets.length })

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="dcm-title">
      <div style={modal}>
        <h2 style={titleStyle} id="dcm-title">{title}</h2>

        <p style={bodyStyle}>{bodyIntro}</p>

        <ul style={ticketList}>
          {tickets.map((tk) => (
            <li key={tk.id} style={ticketItem}>
              {isDev && <span style={ticketId}>{tk.id}</span>}
              <span style={ticketTitle}>{tk.title}</span>
            </li>
          ))}
        </ul>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={actions}>
          <button
            ref={dismissRef}
            style={{ ...btnGhost, opacity: deploying ? 0.5 : 1 }}
            onClick={onClose}
            disabled={deploying}
          >
            {t('workspace.deploy.confirmDismiss')}
          </button>

          <button
            style={{ ...btnPrimary, opacity: deploying ? 0.6 : 1 }}
            onClick={handleDeploy}
            disabled={deploying}
          >
            {deploying ? (
              <>
                <Loader2 size={14} className="pdt-spin" />
                {t('common.loading')}
              </>
            ) : t('workspace.deploy.confirmCta')}
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
  width: 460,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#C0C0C0',
  lineHeight: 1.55,
}

const ticketList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const ticketItem: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',
  display: 'flex',
  gap: 6,
  alignItems: 'baseline',
}

const ticketId: React.CSSProperties = {
  fontSize: 10,
  color: '#606060',
  fontFamily: 'monospace',
  flexShrink: 0,
}

const ticketTitle: React.CSSProperties = {
  color: '#C0C0C0',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: '#EF4444',
  lineHeight: 1.4,
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
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
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
