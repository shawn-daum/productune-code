/**
 * GenericDirtyModal — T-PATCH-022 AC-4
 *
 * A generic unsaved-changes confirmation. Reuses the BaseDirtyModal VISUAL
 * pattern (overlay, dark modal, footer order `[Cancel] [secondary] [primary]`,
 * Esc / backdrop = Cancel) but carries NO worktree IPC coupling — it is purely
 * three callbacks. Used when a dirty doctrine-file tab is being closed.
 *
 * Footer (per §8.5): [취소] [버리고 닫기] [저장]
 *   취소(Cancel)      → keep the tab open, no change.
 *   버리고 닫기(Discard) → close the tab, drop the unsaved draft.
 *   저장(Save)         → re-open the save-choice dialog (AC-1).
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

interface Props {
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export default function GenericDirtyModal({ onCancel, onDiscard, onSave }: Props) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle} id="gdm-title">
          <AlertTriangle size={15} style={{ color: '#E0A030', flexShrink: 0 }} />
          {t('workspace.doctrine.dirtyTitle')}
        </h2>

        <p style={bodyStyle}>{t('workspace.doctrine.dirtyBody')}</p>

        <div style={actions}>
          <button ref={cancelRef} style={btnGhost} onClick={onCancel}>
            {t('workspace.doctrine.dirtyCancel')}
          </button>
          <button style={btnSecondary} onClick={onDiscard}>
            {t('workspace.doctrine.dirtyDiscard')}
          </button>
          <button style={btnPrimary} onClick={onSave}>
            {t('workspace.doctrine.dirtySave')}
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
  display: 'flex',
  alignItems: 'center',
  gap: 8,
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
