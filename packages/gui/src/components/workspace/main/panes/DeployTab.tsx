/**
 * DeployTab — T-P4-022 sub-e + 3rd PR.
 * Singleton tab (tabId = 'deploy:main'). 4 regions:
 *   1. progress — deployment state polling (5s interval)
 *   2. ticket list — candidates passed via props
 *   3. env summary — VERCEL_TOKEN presence placeholder
 *   4. logs — CLI log stream (collapsed default)
 *
 * 3rd PR additions:
 *   - [배포하기] button → deploy:execute IPC
 *   - deploy:progress event subscription
 *   - Error modal with user-friendly messages
 *   - ConflictResolveModal trigger
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeploymentState } from '@productune/core'
import ConflictResolveModal from '../../ConflictResolveModal'
import type { ConflictStrategy } from '../../ConflictResolveModal'
// ConflictStrategy = 'manual' | 'abort' (3rd PR — updated from 3-option to 2-option)

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketSummary {
  ticket_id: string
  title?: string
}

interface DeployTabProps {
  deploymentId?: string
  deploymentUrl?: string
  projectDir?: string
  candidates?: TicketSummary[]
  /** GitHub owner for PR create (3rd PR) */
  owner?: string
  /** GitHub repo name (3rd PR) */
  repo?: string
  /** Branch name to open PR from (3rd PR) */
  branchName?: string
  /** Active ticket id (3rd PR) */
  ticketId?: string
  /** Active ticket title (3rd PR) */
  ticketTitle?: string
  /** Acceptance section markdown (3rd PR) */
  ticketAcceptance?: string
  /** Vercel project name (3rd PR) */
  vercelProject?: string
}

interface Props {
  props?: Record<string, unknown>
}

// ── Deploy progress step type ─────────────────────────────────────────────────
type DeployProgressStep =
  | 'pr-creating'
  | 'pr-created'
  | 'merging'
  | 'merged'
  | 'deploy-triggering'
  | 'deploy-triggered'
  | 'failed'
  | 'idle'

// ── Error message map ─────────────────────────────────────────────────────────
const ERROR_I18N_KEY: Record<string, string> = {
  'github-auth':         'workspace.deploy.error.githubAuth',
  'branch-not-pushed':   'workspace.deploy.error.branchNotPushed',
  'merge-conflict':      'workspace.deploy.error.mergeConflict',
  'api-rate-limit':      'workspace.deploy.error.apiRateLimit',
  'vercel-trigger-fail': 'workspace.deploy.error.vercelTriggerFail',
  'generic':             'workspace.deploy.error.generic',
  'po-turn-blocked':     'workspace.deploy.error.generic',
}

// ── State badge ───────────────────────────────────────────────────────────────

const STATE_COLOR: Record<string, string> = {
  QUEUED:   '#B0B000',
  BUILDING: '#2563EB',
  READY:    '#16A34A',
  ERROR:    '#EF4444',
  CANCELED: '#707070',
}

function StateBadge({ state }: { state: DeploymentState | 'unknown' }) {
  const { t } = useTranslation()
  const label = {
    QUEUED:   t('workspace.deploy.progressQueued'),
    BUILDING: t('workspace.deploy.progressBuilding'),
    READY:    t('workspace.deploy.progressReady'),
    ERROR:    t('workspace.deploy.progressError'),
    CANCELED: 'Canceled',
    unknown:  '—',
  }[state] ?? state
  const color = STATE_COLOR[state] ?? '#707070'
  return (
    <span style={{ ...badge, borderColor: color, color }}>
      {label}
    </span>
  )
}

// ── ANSI strip (minimal) ──────────────────────────────────────────────────────

const ANSI_RE = /\x1B\[[0-9;]*[mGKHF]/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DeployTab({ props }: Props) {
  const { t } = useTranslation()
  const p = (props ?? {}) as DeployTabProps
  const {
    deploymentId,
    deploymentUrl,
    projectDir,
    candidates = [],
    owner,
    repo,
    branchName,
    ticketId,
    ticketTitle,
    ticketAcceptance,
    vercelProject,
  } = p

  const [state, setState] = useState<DeploymentState | 'unknown'>('unknown')
  const [logsOpen, setLogsOpen] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // 3rd PR: deploy execute state
  const [executing, setExecuting] = useState(false)
  const [deployStep, setDeployStep] = useState<DeployProgressStep>('idle')
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployErrorReason, setDeployErrorReason] = useState<string | null>(null)
  const [resultPrUrl, setResultPrUrl] = useState<string | null>(null)

  // 3rd PR: conflict modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [conflictPaths, setConflictPaths] = useState<string[]>([])
  const [conflictCtx, setConflictCtx] = useState<{ owner: string; repo: string; prNumber?: number } | null>(null)

  // Poll deployment state every 5s while QUEUED or BUILDING
  useEffect(() => {
    if (!deploymentId || !projectDir) return
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      const api = (window as any).api
      const res = await api?.deploy?.state({ projectDir, deploymentId })
      if (!cancelled && res?.ok) {
        setState(res.state as DeploymentState)
      }
    }

    poll()
    const id = setInterval(() => {
      if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') return
      poll()
    }, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [deploymentId, projectDir, state])

  // Log stream subscription
  useEffect(() => {
    const api = (window as any).api
    if (!api?.deploy?.onLog) return
    const off = api.deploy.onLog((ev: { deploymentUrl: string; chunk: string }) => {
      if (ev.deploymentUrl !== deploymentUrl) return
      setLogLines((prev) => [...prev, stripAnsi(ev.chunk)])
    })
    return off
  }, [deploymentUrl])

  // Auto-scroll logs
  useEffect(() => {
    if (logsOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logLines, logsOpen])

  const handleToggleLogs = useCallback(async () => {
    const next = !logsOpen
    setLogsOpen(next)
    if (next && !streaming && deploymentUrl && projectDir) {
      const api = (window as any).api
      const res = await api?.deploy?.streamLogs({ deploymentUrl, projectDir })
      if (res?.ok) setStreaming(true)
    }
  }, [logsOpen, streaming, deploymentUrl, projectDir])

  // Stop logs on unmount
  useEffect(() => {
    return () => {
      if (deploymentUrl && streaming) {
        (window as any).api?.deploy?.stopLogs?.(deploymentUrl)
      }
    }
  }, [deploymentUrl, streaming])

  // 3rd PR: subscribe to deploy:progress events
  useEffect(() => {
    const api = (window as any).api
    if (!api?.deploy?.onProgress) return
    const off = api.deploy.onProgress((ev: {
      step: DeployProgressStep
      detail?: string
      prUrl?: string
      deploymentUrl?: string
      deploymentId?: string
      errorReason?: string
    }) => {
      setDeployStep(ev.step)
      if (ev.prUrl) setResultPrUrl(ev.prUrl)
      if (ev.step === 'failed') {
        setExecuting(false)
        const errKey = ev.errorReason ? (ERROR_I18N_KEY[ev.errorReason] ?? ERROR_I18N_KEY.generic) : ERROR_I18N_KEY.generic
        setDeployError(errKey)
        setDeployErrorReason(ev.errorReason ?? 'generic')
      }
      if (ev.step === 'deploy-triggered') {
        setExecuting(false)
      }
    })
    return off
  }, [])

  // 3rd PR: subscribe to deploy:conflict events → open ConflictResolveModal
  useEffect(() => {
    const api = (window as any).api
    if (!api?.deploy?.onConflict) return
    const off = api.deploy.onConflict((ev: {
      owner: string
      repo: string
      prNumber: number | null
      conflictPaths: string[]
      conflictType?: 'trivial' | 'semantic'
    }) => {
      setConflictPaths(ev.conflictPaths ?? [])
      setConflictCtx({
        owner: ev.owner,
        repo: ev.repo,
        prNumber: ev.prNumber ?? undefined,
      })
      setConflictModalOpen(true)
    })
    return off
  }, [])

  // 3rd PR: [배포하기] — user-initiated click only
  const handleProductionDeploy = useCallback(async (e: React.MouseEvent) => {
    // Propagated from a real user click → isTrusted will be true in Electron renderer
    if (executing) return
    if (!projectDir || !owner || !repo || !branchName || !ticketId || !ticketTitle || !vercelProject) {
      setDeployError(ERROR_I18N_KEY.generic)
      return
    }

    setExecuting(true)
    setDeployError(null)
    setDeployErrorReason(null)
    setDeployStep('pr-creating')
    setResultPrUrl(null)

    const api = (window as any).api
    const result = await api?.deploy?.execute({
      projectDir,
      owner,
      repo,
      branchName,
      ticketId,
      ticketTitle,
      ticketAcceptance: ticketAcceptance ?? '',
      personaActivity: [],
      vercelProject,
    })

    if (!result?.ok && result?.errorReason !== 'merge-conflict') {
      // Conflict modal handled by onConflict subscription; other errors show inline
      setExecuting(false)
      if (result?.errorReason) {
        const key = ERROR_I18N_KEY[result.errorReason] ?? ERROR_I18N_KEY.generic
        setDeployError(key)
        setDeployErrorReason(result.errorReason)
      }
    }
  }, [executing, projectDir, owner, repo, branchName, ticketId, ticketTitle, ticketAcceptance, vercelProject])

  // 3rd PR: conflict resolution handler
  // strategy === 'manual': user will manually fix conflict and retry
  // strategy === 'abort': deploy aborted (same as cancel / Esc)
  const handleConflictResolve = useCallback(async (strategy: ConflictStrategy) => {
    setConflictModalOpen(false)
    if (strategy === 'abort') {
      setExecuting(false)
      return
    }
    // 'manual': acknowledge and reset state — user will retry from DeployTab
    const api = (window as any).api
    await api?.deploy?.resolveConflict({
      strategy,
      owner: conflictCtx?.owner ?? '',
      repo: conflictCtx?.repo ?? '',
      prNumber: conflictCtx?.prNumber,
      projectDir: projectDir ?? '',
    })
    setExecuting(false)
  }, [conflictCtx, projectDir])

  const handleConflictCancel = useCallback(() => {
    setConflictModalOpen(false)
    setExecuting(false)
  }, [])

  // Friendly deploy step label (internal — not shown to user as-is; used for internal state badge)
  const deployStepLabel = (step: DeployProgressStep) => {
    const labels: Record<DeployProgressStep, string> = {
      idle:              '',
      'pr-creating':     t('workspace.deploy.stepPrCreating'),
      'pr-created':      t('workspace.deploy.stepPrCreated'),
      merging:           t('workspace.deploy.stepMerging'),
      merged:            t('workspace.deploy.stepMerged'),
      'deploy-triggering': t('workspace.deploy.stepDeployTriggering'),
      'deploy-triggered':  t('workspace.deploy.stepDeployTriggered'),
      failed:            t('workspace.deploy.stepFailed'),
    }
    return labels[step] ?? step
  }

  return (
    <>
      {/* ── ConflictResolveModal (sub-g, 3rd PR) ── */}
      {conflictModalOpen && (
        <ConflictResolveModal
          conflictPaths={conflictPaths}
          onResolve={handleConflictResolve}
          onCancel={handleConflictCancel}
        />
      )}

      <div style={wrap}>
        {/* ── Region 1: Progress ── */}
        <section style={section}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>{t('workspace.deploy.tabTitle')}</span>
            <StateBadge state={state} />
          </div>

          {/* Deploy progress indicator (3rd PR) */}
          {executing && deployStep !== 'idle' && (
            <p style={progressNote}>{deployStepLabel(deployStep)}</p>
          )}

          {/* Result PR link */}
          {resultPrUrl && (
            <a
              href="#"
              style={urlLink}
              onClick={(e) => { e.preventDefault(); (window as any).api?.openExternal?.(resultPrUrl) }}
            >
              {t('workspace.deploy.prCreatedLink')}
            </a>
          )}

          {deploymentUrl && (
            <a
              href="#"
              style={urlLink}
              onClick={(e) => { e.preventDefault(); (window as any).api?.openExternal?.(deploymentUrl) }}
            >
              {deploymentUrl}
            </a>
          )}
          {!deploymentId && !executing && (
            <p style={emptyNote}>{t('workspace.deploy.noDeployment')}</p>
          )}

          {/* Error message (sub-f: user-friendly) */}
          {deployError && !executing && (
            <div style={errorBox}>
              <p style={errorText}>{t(deployError)}</p>
              <div style={errorActions}>
                {deployErrorReason === 'github-auth' && (
                  <button style={errorBtn} onClick={() => {
                    setDeployError(null)
                    ;(window as any).api?.openExternal?.('https://github.com/settings/tokens')
                  }}>
                    {t('workspace.deploy.error.actionReconnect')}
                  </button>
                )}
                {deployErrorReason === 'vercel-trigger-fail' && (
                  <button style={errorBtn} onClick={() => setDeployError(null)}>
                    {t('workspace.deploy.error.actionRetry')}
                  </button>
                )}
                {deployErrorReason === 'api-rate-limit' && (
                  <button style={errorBtn} onClick={() => setDeployError(null)}>
                    {t('workspace.deploy.error.actionWaitRetry')}
                  </button>
                )}
                {(deployErrorReason === 'generic' || !deployErrorReason) && (
                  <button style={errorBtn} onClick={() => setDeployError(null)}>
                    {t('workspace.deploy.error.actionViewLog')}
                  </button>
                )}
                <button style={errorBtnGhost} onClick={() => { setDeployError(null); setDeployErrorReason(null) }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Region 2: Ticket list ── */}
        {candidates.length > 0 && (
          <section style={section}>
            <div style={sectionLabel}>{t('workspace.deploy.ticketsInDeploy')}</div>
            <ul style={ticketList}>
              {candidates.map((tk) => (
                <li key={tk.ticket_id} style={ticketItem}>
                  <span style={ticketIdStyle}>{tk.ticket_id}</span>
                  {tk.title && <span style={ticketTitleStyle}>{tk.title}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Region 3: Env summary ── */}
        <section style={section}>
          <div style={sectionLabel}>{t('workspace.deploy.envSummary')}</div>
          <p style={emptyNote}>{t('workspace.deploy.envConfigured')}</p>
        </section>

        {/* ── Region 4: Logs ── */}
        <section style={section}>
          <button style={logsToggleBtn} onClick={handleToggleLogs}>
            {logsOpen ? t('workspace.deploy.logsExpand') : t('workspace.deploy.logsCollapsed')}
          </button>
          {logsOpen && (
            <div style={logsBox}>
              {logLines.length === 0 && (
                <span style={logsEmpty}>{t('workspace.deploy.logsWaiting')}</span>
              )}
              {logLines.map((line, i) => (
                <div key={i} style={logLine}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </section>

        {/* ── CTA footer ── */}
        <div style={footer}>
          {/* [배포하기] primary CTA — always visible, user-initiated only */}
          <button
            style={{ ...ctaBtn, opacity: executing ? 0.6 : 1 }}
            disabled={executing}
            onClick={handleProductionDeploy}
          >
            {executing
              ? deployStepLabel(deployStep)
              : t('workspace.deploy.executeCtaMain')}
          </button>

          {state === 'ERROR' && (
            <button style={{ ...ctaBtn, background: '#7F1D1D' }} onClick={() => {}}>
              {t('workspace.deploy.retryCta')}
            </button>
          )}
          <button style={cancelBtn} onClick={() => { setDeployError(null); setExecuting(false) }}>
            {t('workspace.deploy.cancelCta')}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  overflow: 'auto',
  padding: '16px 20px',
  background: '#111',
  color: '#D0D0D0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const section: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingBottom: 16,
  borderBottom: '1px solid #1E1E1E',
  marginBottom: 16,
}

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#606060',
}

const badge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 3,
  border: '1px solid',
  fontFamily: 'monospace',
  letterSpacing: '0.05em',
}

const urlLink: React.CSSProperties = {
  fontSize: 11,
  color: '#4B8EF5',
  textDecoration: 'none',
  wordBreak: 'break-all',
}

const emptyNote: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#505050',
}

const ticketList: React.CSSProperties = {
  margin: 0,
  padding: '0 0 0 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const ticketItem: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  fontSize: 12,
}

const ticketIdStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#606060',
  fontFamily: 'monospace',
  flexShrink: 0,
}

const ticketTitleStyle: React.CSSProperties = {
  color: '#A0A0A0',
}

const logsToggleBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2A2A2A',
  color: '#707070',
  fontSize: 11,
  borderRadius: 3,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  alignSelf: 'flex-start',
}

const logsBox: React.CSSProperties = {
  background: '#0A0A0A',
  border: '1px solid #1E1E1E',
  borderRadius: 4,
  padding: '8px 10px',
  maxHeight: 300,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const logsEmpty: React.CSSProperties = {
  fontSize: 11,
  color: '#404040',
  fontFamily: 'monospace',
}

const logLine: React.CSSProperties = {
  fontSize: 11,
  color: '#A0A0A0',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

const footer: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 8,
  marginTop: 'auto',
}

const ctaBtn: React.CSSProperties = {
  height: 28,
  padding: '0 14px',
  background: '#1D4ED8',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const cancelBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: 'transparent',
  color: '#707070',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const progressNote: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: '#A0C0FF',
  fontStyle: 'italic',
}

const errorBox: React.CSSProperties = {
  background: '#1A0A0A',
  border: '1px solid #3A1818',
  borderRadius: 4,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const errorText: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#F87171',
  lineHeight: 1.5,
}

const errorActions: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const errorBtn: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  background: 'transparent',
  color: '#F87171',
  border: '1px solid #3A1818',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const errorBtnGhost: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  background: 'transparent',
  color: '#606060',
  border: 'none',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
