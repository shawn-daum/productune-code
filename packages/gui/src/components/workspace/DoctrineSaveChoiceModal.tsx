/**
 * DoctrineSaveChoiceModal — T-PATCH-022 AC-1
 *
 * Opened on every Save of an editable (T1/T2) doctrine file. Per the
 * user-firm SAVE decision, the user picks the persistence path each time:
 *
 *   [취소]            Cancel       → close, keep editing.
 *   [PO 검토 요청]    Request review → enqueue a curated pending-promotion;
 *                                     the live file is NOT written now (AC-3).
 *   [바로 저장]       Save directly → whole-file replace via doctrineWriteFile,
 *                                     conflict-aware (AC-2).
 *
 * Footer order [Cancel] [secondary] [primary] and dark-theme styling mirror
 * BaseDirtyModal.tsx / ConflictResolveModal.tsx. lucide icons, no color emoji.
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save, Send } from 'lucide-react'

export type SaveChoice = 'direct' | 'review'

interface Props {
  /** Disables actions + spinners the chosen button while an IPC call runs. */
  busy: SaveChoice | null
  /**
   * Whether the PO-review path is applicable (T-PATCH-031). PO review enqueues a
   * pending-promotion against a project, so it requires a projectDir. For a T2
   * personal-memory file opened without a project (no projectDir), review is
   * inapplicable and the option is hidden — only direct save is offered. The
   * dialog body also swaps to a single-path explanation in that case.
   */
  showReview?: boolean
  onCancel: () => void
  onChoose: (choice: SaveChoice) => void
}

export default function DoctrineSaveChoiceModal({ busy, showReview = true, onCancel, onChoose }: Props) {
  const { t } = useTranslation()
  const directRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    directRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, onCancel])

  const isBusy = busy !== null

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dscm-title"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onCancel() }}
    >
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle} id="dscm-title">
          {t('workspace.doctrine.save.title')}
        </h2>

        <p style={bodyStyle}>
          {t(showReview ? 'workspace.doctrine.save.body' : 'workspace.doctrine.save.bodyDirectOnly')}
        </p>

        <div style={actions}>
          <button
            style={{ ...btnGhost, opacity: isBusy ? 0.5 : 1 }}
            onClick={onCancel}
            disabled={isBusy}
          >
            {t('workspace.doctrine.save.cancel')}
          </button>

          {showReview && (
            <button
              style={{ ...btnSecondary, opacity: isBusy ? 0.5 : 1 }}
              onClick={() => onChoose('review')}
              disabled={isBusy}
            >
              {busy === 'review' ? (
                <Loader2 size={13} className="pdt-spin" />
              ) : (
                <Send size={13} />
              )}
              {t('workspace.doctrine.save.requestReview')}
            </button>
          )}

          <button
            ref={directRef}
            style={{ ...btnPrimary, opacity: isBusy ? 0.6 : 1 }}
            onClick={() => onChoose('direct')}
            disabled={isBusy}
          >
            {busy === 'direct' ? (
              <Loader2 size={13} className="pdt-spin" />
            ) : (
              <Save size={13} />
            )}
            {t('workspace.doctrine.save.direct')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles (BaseDirtyModal visual pattern) ──────────────────────────────────────

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
