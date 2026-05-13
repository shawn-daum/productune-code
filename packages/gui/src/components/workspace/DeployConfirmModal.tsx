/**
 * DeployConfirmModal — T-P4-022 sub-d (updated for 3rd PR).
 *
 * Shown by PO when ≥1 ticket is done+qa-passed and conditions are met (§2).
 * [지금 배포] → opens deploy tab (singleton) + calls deploy:execute IPC.
 * [나중에] / Esc / backdrop → caller handles 30-min snooze.
 *
 * 3rd PR additions:
 *   - Extended Props to include deploy execution context (owner/repo/branchName etc.)
 *   - handleDeploy now calls api.deploy.execute (replaces api.deploy.create stub)
 *   - Opens deploy tab immediately on confirm (singleton via tabId='deploy:main')
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
  /** Git ref used for deploy (e.g. 'main' or a SHA) */
  gitRef: string
  /** Vercel project name */
  project: string
  onClose: () => void
  // 3rd PR: deploy execution context
  projectDir?: string
  owner?: string
  repo?: string
  branchName?: string
  ticketId?: string
  ticketTitle?: string
  ticketAcceptance?: string
  /** Vercel project id (may differ from `project` display name) */
  vercelProject?: string
}

export default function DeployConfirmModal({
  tickets, gitRef, project, onClose,
  projectDir, owner, repo, branchName,
  ticketId, ticketTitle, ticketAcceptance, vercelProject,
}: Props) {
  const { t } = useTranslation()
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)

  const appendMessage = useWorkspace((s) => s.appendMessage)
  const openTab       = useWorkspace((s) => s.openTab)
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

    const effectiveProjectDir = projectDir ?? projectStore?.projectDir ?? ''
    injectTrace('workspace.deploy.startTrace', { count: String(tickets.length) })

    // 1. Open deploy tab immediately (singleton — deduped by tabId)
    openTab(
      'deploy:main',
      'deploy',
      {
        candidates: tickets.map((tk) => ({ ticket_id: tk.id, title: tk.title })),
        projectDir: effectiveProjectDir,
        owner: owner ?? '',
        repo: repo ?? '',
        branchName: branchName ?? '',
        ticketId: ticketId ?? tickets[0]?.id ?? '',
        ticketTitle: ticketTitle ?? tickets[0]?.title ?? '',
        ticketAcceptance: ticketAcceptance ?? '',
        vercelProject: vercelProject ?? project,
      },
      t('workspace.deploy.tabTitle'),
    )

    const api = (window as any).api

    // 2. Call deploy:execute — PR create + squash merge + Vercel deploy
    try {
      const result = await api.deploy?.execute({
        projectDir: effectiveProjectDir,
        owner: owner ?? '',
        repo: repo ?? '',
        branchName: branchName ?? '',
        ticketId: ticketId ?? tickets[0]?.id ?? '',
        ticketTitle: ticketTitle ?? tickets[0]?.title ?? '',
        ticketAcceptance: ticketAcceptance ?? '',
        vercelProject: vercelProject ?? project,
      })

      if (!result?.ok) {
        // Conflict is handled by ConflictResolveModal in DeployTab
        if (result?.errorReason === 'conflict') {
          // Modal stays open for context — user switches to deploy tab
          setDeploying(false)
          onClose()
          return
        }
        const errMsg = result?.code === 'auth'
          ? t('workspace.deploy.errorAuth')
          : (result?.error ?? t('workspace.deploy.errorGeneric'))
        injectTrace('workspace.deploy.failedTrace', { reason: errMsg })
        setError(errMsg)
        setDeploying(false)
        return
      }

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
    // Backdrop click → dismiss (§5.2.2: same as "나중에")
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dcm-title"
      onClick={(e) => { if (e.target === e.currentTarget && !deploying) onClose() }}
    >
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle} id="dcm-title">{title}</h2>

        <p style={bodyStyle}>{bodyIntro}</p>

        <ul style={ticketList}>
          {tickets.slice(0, 5).map((tk) => (
            <li key={tk.id} style={ticketItem}>
              {isDev && <span style={ticketId_}>{tk.id}</span>}
              <span style={ticketTitle_}>{tk.title}</span>
            </li>
          ))}
          {tickets.length > 5 && (
            <li style={{ ...ticketItem, color: '#505050' }}>
              ... +{tickets.length - 5}
            </li>
          )}
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

const ticketId_: React.CSSProperties = {
  fontSize: 10,
  color: '#606060',
  fontFamily: 'monospace',
  flexShrink: 0,
}

const ticketTitle_: React.CSSProperties = {
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
