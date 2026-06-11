/**
 * PromotionQuestionCard — T-PATCH-097
 *
 * Renders a USER-REQUESTED promotion gate (PromotionPayload.origin ===
 * 'user-requested') as a question-style surface — the same vertical option-stack
 * (row + checkmark) UX as AskUserQuestionCard — instead of the classic approve/
 * reject CTA layout in PromotionCard.
 *
 * Auto-surfaced candidates (origin absent or 'auto') keep rendering through
 * PromotionCard; the render branch lives in MessageBubble.
 *
 * Downstream actions are IDENTICAL to PromotionCard: both surfaces call
 * usePromotionResolve(), so approve/reject fire the same IPC + store-patch +
 * system-line effects (AC-5). Only the visuals differ.
 *
 * Reject parity: PromotionCard guards reject behind an inline confirm
 * (§1.5.5 destructive pattern). The question surface preserves that — selecting
 * the Reject option moves into a confirm step (confirm / cancel) before the
 * destructive resolve fires, so the question UX never makes reject one-tap.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, ChevronRight } from 'lucide-react'
import type { Message, PromotionPayload } from '../../../lib/types'
import { usePromotionResolve } from './PromotionCard'

interface Props {
  message: Message
}

export default function PromotionQuestionCard({ message }: Props) {
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

// ── Live question card ─────────────────────────────────────────────────────────

type OptKey = 'approve' | 'reject'

function LiveCard({ message, payload }: { message: Message; payload: PromotionPayload }) {
  const { t } = useTranslation()
  const { phase, approve, requestReject, confirmReject, cancelReject } =
    usePromotionResolve(message, payload)

  // Which option the user has committed to (drives selected/dimmed visuals).
  const [chosen, setChosen] = useState<OptKey | null>(null)

  const inFlight = phase === 'approving' || phase === 'rejecting'
  const confirming = phase === 'confirming-reject'
  const locked = chosen !== null || inFlight

  const handleSelect = (key: OptKey) => {
    if (locked) return
    setChosen(key)
    if (key === 'approve') {
      approve()
    } else {
      requestReject()
    }
  }

  const handleRejectCancel = () => {
    cancelReject()
    setChosen(null)
  }

  const options: Array<{
    key: OptKey
    title: string
    description: string
  }> = [
    {
      key: 'approve',
      title: t('workspace.promotion.approveCta'),
      description: t('workspace.promotion.question.approveDesc', {
        tier: payload.targetTier,
      }),
    },
    {
      key: 'reject',
      title: t('workspace.promotion.rejectCta'),
      description: t('workspace.promotion.question.rejectDesc'),
    },
  ]

  return (
    <div style={{ paddingLeft: 8, margin: '4px 0' }}>
      <div className="action-card">
        {/* Question prompt + the promotion's core context (no info loss — AC-4) */}
        <div style={{ fontSize: 13, color: '#E8E8EA', lineHeight: 1.5 }}>
          {t('workspace.promotion.question.prompt')}
        </div>
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

        {/* Vertical option stack (AskUserQuestionCard-family UX) */}
        <div className="opt-stack">
          {options.map((opt) => {
            const isSelected = chosen === opt.key
            const isDimmed = locked && !isSelected
            const showSpinner =
              isSelected &&
              ((opt.key === 'approve' && phase === 'approving') ||
                (opt.key === 'reject' && phase === 'rejecting'))
            const showCheck = isSelected && !showSpinner
            return (
              <button
                key={opt.key}
                className={`opt${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`}
                onClick={() => handleSelect(opt.key)}
                disabled={locked}
              >
                <span className="opt-key">{opt.key === 'approve' ? 'Y' : 'N'}</span>
                <span className="opt-body">
                  <span className="opt-title">{opt.title}</span>
                  <span className="opt-desc">{opt.description}</span>
                </span>
                <span className="opt-check">
                  {showSpinner && (
                    <Loader2 size={12} className="pdt-spin" style={{ color: '#8B5CF6' }} />
                  )}
                  {showCheck && <Check size={12} style={{ color: '#34D399' }} />}
                </span>
              </button>
            )
          })}
        </div>

        {/* Reject confirm — §1.5.5 destructive pattern, parity with PromotionCard */}
        {confirming && (
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
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmReject}
                style={{ fontSize: 12, padding: '6px 12px', background: '#EF4444' }}
              >
                {t('workspace.promotion.rejectCta')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resolved card ───────────────────────────────────────────────────────────────

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
        <span className="resolved-label no">rejected</span>
      )}
    </div>
  )
}
