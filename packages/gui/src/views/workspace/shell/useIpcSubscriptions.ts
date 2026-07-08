import { useState, useEffect, useRef } from 'react'
import type { TFunction } from 'i18next'
import type { DeployTicketSummary } from '../../../components/workspace/DeployConfirmModal'
import type { Message } from '../../../lib/types'
import type { TabType } from '../../../store/workspace'
import { artifactOpenType } from './helpers'
import { ARTIFACT_OPEN_CAP } from './constants'
import { useSessionHealth } from '../../../store/sessionHealth'

export type DeployModalPayload = {
  tickets: DeployTicketSummary[]
  gitRef: string
  project: string
  projectDir?: string
  owner?: string
  repo?: string
  branchName?: string
  ticketId?: string
  ticketTitle?: string
  ticketAcceptance?: string
  vercelProject?: string
}

export type BaseDirtyModalPayload = {
  projectDir: string
  ticketId: string
  slug: string
  type: 'feature' | 'fix'
}

export interface IpcSubscriptionsResult {
  deployModalOpen: boolean
  deployModalPayload: DeployModalPayload | null
  baseDirtyModal: BaseDirtyModalPayload | null
  artifactToast: string | null
  setDeployModalOpen: (v: boolean) => void
  setDeployModalPayload: (v: DeployModalPayload | null) => void
  setBaseDirtyModal: (v: BaseDirtyModalPayload | null) => void
}

export function useIpcSubscriptions(
  openTab: (tabId: string, type: TabType, meta?: Record<string, unknown>, label?: string) => void,
  appendMessage: (msg: Message) => void,
  t: TFunction,
  projectDir: string,
): IpcSubscriptionsResult {
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [deployModalPayload, setDeployModalPayload] = useState<DeployModalPayload | null>(null)
  const [baseDirtyModal, setBaseDirtyModal] = useState<BaseDirtyModalPayload | null>(null)
  const [artifactToast, setArtifactToast] = useState<string | null>(null)
  const artifactToastTimerRef = useRef<number | null>(null)

  // ── T-PATCH-231: health smoke result subscription ─────────────────────────
  // Subscribes once; pushed from main after a failing PO turn. 'ok' results are
  // ignored (smoke passed → no actionable message needed).
  const setSmokeResult = useSessionHealth((s) => s.setSmokeResult)
  useEffect(() => {
    const api = (window as any).api
    const off = api?.poOnSmokeResult?.((result: {
      classification: 'auth' | 'not-installed' | 'incompatible' | 'ok'
      rawError?: string
    }) => {
      if (result.classification !== 'ok') {
        setSmokeResult(result)
      }
    })
    return () => { if (typeof off === 'function') off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Browser window.open → new in-app browser tab (T-PATCH-191) ────────────
  useEffect(() => {
    const api = (window as any).api
    const off = api?.onBrowserOpenUrl?.(({ url }: { url: string }) => {
      if (!url) return
      let host = 'Browser'
      try { host = new URL(url).hostname || 'Browser' } catch { /* keep default */ }
      openTab(`browser:${url}`, 'browser', { url }, host)
    })
    return () => { if (typeof off === 'function') off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab])

  // ── Deploy modal IPC subscription (T-P4-022 3rd PR) ───────────────────────
  useEffect(() => {
    const api = (window as any).api
    const off = api?.onDeployModal?.((payload: DeployModalPayload | null) => {
      if (!payload) return
      setDeployModalPayload(payload)
      setDeployModalOpen(true)
    })
    return () => { if (typeof off === 'function') off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Artifact auto-open IPC subscription (T-P4-114 §A) ──────────────────────
  useEffect(() => {
    const api = (window as any).api
    if (!api?.poOnArtifactOpen) return

    const off = api.poOnArtifactOpen(({ files }: { files: string[] }) => {
      const openable = files.flatMap((f) => {
        const result = artifactOpenType(f)
        return result ? [{ file: f, type: result }] : []
      })

      const toOpen = openable.slice(0, ARTIFACT_OPEN_CAP)

      for (const { file, type } of toOpen) {
        const name = file.split('/').pop() ?? file
        if (type === 'markdown') {
          openTab(`markdown:${file}`, 'markdown', { path: file }, name)
        } else if (type === 'html') {
          // T-328: design HTML artifact → BrowserTab via file://, same
          // 'browser' + file:// routing QuickOpen already uses for
          // docs/artifacts/*.html entries (helpers.ts extToTabType).
          const url = `file://${projectDir}/${file}`
          openTab(`browser:${url}`, 'browser', { url }, name)
        } else {
          openTab(`qa-result:${file}`, 'qa-result', { path: file }, name)
        }
      }

      // Show overflow toast when total openable > cap
      if (openable.length > ARTIFACT_OPEN_CAP) {
        const msg = t('workspace.artifacts.autoOpenToast', { count: files.length })
        if (artifactToastTimerRef.current !== null) {
          window.clearTimeout(artifactToastTimerRef.current)
        }
        setArtifactToast(msg)
        artifactToastTimerRef.current = window.setTimeout(() => {
          setArtifactToast(null)
          artifactToastTimerRef.current = null
        }, 5000)
      }
    })
    return () => { if (typeof off === 'function') off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab, t, projectDir])

  // ── Worktree create result IPC subscription (T-P4-092) ─────────────────────
  useEffect(() => {
    const api = (window as any).api
    const off = api?.worktree?.onCreateResult?.((payload: {
      result: any
      ticketId: string
      slug: string
      type: string
      projectDir: string
    }) => {
      const { result, ticketId, slug, type, projectDir: pDir } = payload

      const appendTrace = (text: string) => {
        const trace: Message = {
          id: `wt-trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'system',
          kind: 'trace',
          text,
          status: 'done',
          created_at: new Date().toISOString(),
        }
        appendMessage(trace)
      }

      if (result.ok) {
        appendTrace(t('workspace.worktree.autoCreatedTrace'))
        return
      }

      switch (result.reason) {
        case 'base-dirty':
          setBaseDirtyModal({
            projectDir: pDir,
            ticketId,
            slug,
            type: type === 'fix' ? 'fix' : 'feature',
          })
          break
        case 'branch-exists':
          appendTrace(t('workspace.worktree.branchExistsTrace'))
          break
        case 'hook-not-installed':
          appendTrace(t('workspace.worktree.hookMissingTrace'))
          break
        default:
          appendTrace(t('workspace.worktree.gitErrorTrace'))
      }
    })
    return () => { if (typeof off === 'function') off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, appendMessage])

  return {
    deployModalOpen,
    deployModalPayload,
    baseDirtyModal,
    artifactToast,
    setDeployModalOpen,
    setDeployModalPayload,
    setBaseDirtyModal,
  }
}
