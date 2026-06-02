/**
 * BaseDirtyModal — base branch dirty 시 사용자에게 선택지 제공 (T-P4-092).
 *
 * 3 CTA (§8.5 footer 순서: [Cancel] [secondary] [primary]):
 *   Cancel    → modal close + worktree 생성 보류 (ticket md 유지 — OQ-T092-3 b)
 *   Save now  → worktree:commitAndCreate IPC (자동 commit 메시지 — OQ-T092-2 a)
 *   Set aside → worktree:stashAndCreate IPC (git stash -u — OQ-T092-1 b)
 *
 * §1.5.5 Esc + 외부 click = Cancel 과 동등.
 * §1.5.4 busy 중 Esc 무시, button spinner.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import type { Message } from '../../lib/types'

interface Props {
  projectDir: string
  ticketId: string
  slug: string
  type: 'feature' | 'fix'
  onClose: () => void
  onSuccess: (worktreePath: string, branchName: string) => void
}

type BusyKind = 'stash' | 'commit' | null

export default function BaseDirtyModal({
  projectDir,
  ticketId,
  slug,
  type,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation()
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const [busy, setBusy] = useState<BusyKind>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, onClose])

  const appendTrace = (text: string) => {
    const trace: Message = {
      id: `worktree-trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'system',
      kind: 'trace',
      text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(trace)
  }

  const handleResult = (result: any) => {
    if (result.ok) {
      appendTrace(t('workspace.worktree.autoCreatedTrace', { ticketId }))
      onSuccess(result.worktreePath, result.branchName)
      onClose()
    } else {
      setInlineError(t('workspace.baseDirty.inlineError'))
    }
  }

  const handleSetAside = async () => {
    if (busy) return
    setBusy('stash')
    setInlineError(null)
    try {
      const api = (window as any).api
      const result = await api.worktree.stashAndCreate({ projectDir, ticketId, slug, type })
      handleResult(result)
    } catch {
      setInlineError(t('workspace.baseDirty.inlineError'))
    } finally {
      setBusy(null)
    }
  }

  const handleSaveNow = async () => {
    if (busy) return
    setBusy('commit')
    setInlineError(null)
    try {
      const api = (window as any).api
      const result = await api.worktree.commitAndCreate({ projectDir, ticketId, slug, type })
      handleResult(result)
    } catch {
      setInlineError(t('workspace.baseDirty.inlineError'))
    } finally {
      setBusy(null)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !busy) onClose()
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="bdm-title" onClick={handleOverlayClick}>
      <div style={modal}>
        <h2 style={titleStyle} id="bdm-title">
          {t('workspace.baseDirty.title')}
        </h2>

        <p style={bodyStyle}>
          {t('workspace.baseDirty.body')}
        </p>

        {inlineError && (
          <p style={errorStyle}>{inlineError}</p>
        )}

        <div style={actions}>
          <button
            ref={cancelRef}
            style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}
            onClick={onClose}
            disabled={!!busy}
          >
            {t('workspace.baseDirty.cancel')}
          </button>

          <button
            style={{ ...btnSecondary, opacity: busy ? 0.5 : 1 }}
            onClick={handleSaveNow}
            disabled={!!busy}
          >
            {busy === 'commit' ? (
              <>
                <Loader2 size={13} className="pdt-spin" />
                {t('common.loading')}
              </>
            ) : t('workspace.baseDirty.saveNow')}
          </button>

          <button
            style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}
            onClick={handleSetAside}
            disabled={!!busy}
          >
            {busy === 'stash' ? (
              <>
                <Loader2 size={13} className="pdt-spin" />
                {t('common.loading')}
              </>
            ) : t('workspace.baseDirty.setAside')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  width: 440,
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
  flexWrap: 'wrap',
}

const btnPrimary: React.CSSProperties = {
  height: 30,
  padding: '0 16px',
  background: '#8B5CF6',
  color: '#0F0F0F',
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
