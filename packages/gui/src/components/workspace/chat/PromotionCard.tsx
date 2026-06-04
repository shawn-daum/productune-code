/**
 * PromotionCard — T-013 (c)
 *
 * Renders when message.kind === 'promotion-candidate'.
 * Shows approve / reject CTA inline in the chat transcript.
 *
 * State machine:
 *   idle → (approve) → approving → resolved:approved
 *   idle → (reject)  → confirming-reject → (confirm) → resolved:rejected
 *                                         → (cancel)  → idle
 *
 * IPC: chat:resolvePromotion — sends outcome to main process.
 * Stub-safe: if IPC is absent, resolves locally (follow-up per T-013 Plan §5).
 *
 * §1.5.5 escape: inline confirm for reject — Esc key disabled, [Cancel] explicit.
 * Idempotency: payload.resolved drives resolved render on re-mount.
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, ChevronRight } from 'lucide-react'
import type { Message, PromotionPayload } from '../../../lib/types'
import { useWorkspace } from '../../../store/workspace'

interface Props {
  message: Message
}

export default function PromotionCard({ message }: Props) {
  const payload = message.payload as PromotionPayload | undefined
  if (!payload) return null

  if (payload.resolved) {
    return (
      <div style={{ paddingLeft: 8, margin: '4px 0' }}>
        <ResolvedCard outcome={payload.resolved.outcome} payload={payload} />
      </div>
    )
  }

  return <LiveCard message={message} payload={payload} />
}

// ── Live card ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'approving' | 'confirming-reject' | 'rejecting'

function LiveCard({ message, payload }: { message: Message; payload: PromotionPayload }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const setMessages = useWorkspace((s) => s.setMessages)
  const project = useWorkspace((s) => s.project)

  // §1.5.5: Esc must NOT dismiss the inline confirm (destructive pattern)
  // We only need this to block Esc from closing any parent overlay.
  useEffect(() => {
    if (phase !== 'confirming-reject') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [phase])

  const resolveInStore = (outcome: 'approved' | 'rejected') => {
    const msgs = useWorkspace.getState().messages
    const patched = msgs.map((m) =>
      m.id === message.id
        ? {
            ...m,
            payload: {
              ...(m.payload as PromotionPayload),
              resolved: { outcome },
            },
          }
        : m,
    )
    setMessages(patched)
  }

  const appendSystemLine = (outcome: 'approved' | 'rejected') => {
    const text =
      outcome === 'approved'
        ? t('workspace.promotion.promoted', { tier: payload.targetTier })
        : t('workspace.promotion.rejected')
    const sysMsg: Message = {
      id: `sys-${Date.now()}`,
      role: 'assistant',
      kind: 'trace',
      text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(sysMsg)
    const api = (window as any).api
    if (api?.chatAppendMessage && project) {
      try { api.chatAppendMessage(project.projectDir, sysMsg) } catch { /* noop */ }
    }
  }

  const ipcResolve = async (outcome: 'approved' | 'rejected') => {
    const api = (window as any).api
    if (api?.chatResolvePromotion && project) {
      try {
        await api.chatResolvePromotion({
          projectDir: project.projectDir,
          messageId: message.id,
          outcome,
        })
      } catch { /* stub — continue */ }
    }
  }

  const handleApprove = async () => {
    if (phase !== 'idle') return
    setPhase('approving')
    await ipcResolve('approved')
    resolveInStore('approved')
    appendSystemLine('approved')
  }

  const handleRejectRequest = () => {
    if (phase !== 'idle') return
    setPhase('confirming-reject')
  }

  const handleRejectConfirm = async () => {
    setPhase('rejecting')
    await ipcResolve('rejected')
    resolveInStore('rejected')
    appendSystemLine('rejected')
  }

  const handleRejectCancel = () => {
    setPhase('idle')
  }

  return (
    <div style={{ paddingLeft: 8, margin: '4px 0' }}>
      <div className="action-card">
        {/* Card body */}
        <div className="promo-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: '#E8E8EA', lineHeight: 1.5 }}>
            {payload.candidateSummary}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill tier">
              <ChevronRight size={10} />
              {payload.targetTier}
            </span>
            <span className="pill">{payload.sourceTicketId}</span>
          </div>
          <div style={{ fontSize: 12, color: '#A0A0A0', lineHeight: 1.4 }}>
            {payload.rationale}
          </div>
        </div>

        {/* CTA row — primary right per §1.5.3 */}
        {(phase === 'idle' || phase === 'approving') && (
          <div className="cta-row">
            <button
              className="btn btn-ghost"
              onClick={handleRejectRequest}
              disabled={phase === 'approving'}
            >
              {t('workspace.promotion.rejectCta')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={phase === 'approving'}
            >
              {phase === 'approving' ? (
                <Loader2 size={13} className="pdt-spin" />
              ) : null}
              {t('workspace.promotion.approveCta')}
            </button>
          </div>
        )}

        {/* Inline reject confirm — §1.5.5 destructive pattern */}
        {(phase === 'confirming-reject' || phase === 'rejecting') && (
          <div
            style={{
              background: '#141414',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              padding: '10px 12px',
              fontSize: 12,
              color: '#C8C8CC',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span>{t('workspace.promotion.rejectConfirm')}</span>
            <div className="cta-row">
              <button
                className="btn btn-ghost"
                onClick={handleRejectCancel}
                disabled={phase === 'rejecting'}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRejectConfirm}
                disabled={phase === 'rejecting'}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  background: '#EF4444',
                }}
              >
                {phase === 'rejecting' ? (
                  <Loader2 size={12} className="pdt-spin" />
                ) : null}
                {t('workspace.promotion.rejectCta')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resolved card ─────────────────────────────────────────────────────────────

function ResolvedCard({
  outcome,
  payload,
}: {
  outcome: 'approved' | 'rejected'
  payload: PromotionPayload
}) {
  return (
    <div className={`action-card ${outcome === 'approved' ? 'resolved-approve' : 'resolved-reject'}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="pill tier">{payload.targetTier}</span>
        <span className="pill">{payload.sourceTicketId}</span>
      </div>
      {outcome === 'approved' ? (
        <span className="resolved-label ok">
          <Check size={14} strokeWidth={2.5} />
          promoted
        </span>
      ) : (
        <span className="resolved-label no">
          rejected
        </span>
      )}
    </div>
  )
}
