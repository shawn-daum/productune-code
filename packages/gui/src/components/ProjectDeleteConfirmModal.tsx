/**
 * ProjectDeleteConfirmModal — T-PATCH-134 (b).
 *
 * Strong-confirm modal for the irreversible disk delete of a project folder.
 * Visually + interactionally distinct from the no-confirm "remove from list" (a):
 *   - shows the absolute target path + slug
 *   - states the action cannot be undone
 *   - default focus is the Cancel button; the delete button is danger-colored
 *   - copy flips to a "permanently deleted" warning when the OS trash fell back
 *     to a hard delete (reported by project:delete result.trashed === false)
 *
 * Scaffold/i18n pattern mirrors DeployConfirmModal (no typing confirmation —
 * deliberately excluded as overkill for a local tool with a trash fallback).
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  slug: string
  projectDir: string
  /** Returns the delete result so the modal can surface the trash-vs-hard outcome. */
  onConfirm: () => Promise<{ ok: boolean; trashed?: boolean; alreadyGone?: boolean; error?: string }>
  onClose: () => void
}

export default function ProjectDeleteConfirmModal({ slug, projectDir, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleting, onClose])

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      const result = await onConfirm()
      if (!result?.ok) {
        setError(result?.error ?? t('app.home.delete.errorGeneric'))
        setDeleting(false)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdcm-title"
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onClose() }}
    >
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={titleRow}>
          <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0 }} />
          <h2 style={titleStyle} id="pdcm-title">{t('app.home.delete.title', { slug })}</h2>
        </div>

        <p style={bodyStyle}>{t('app.home.delete.body')}</p>

        <div style={pathBox}>{projectDir}</div>

        <p style={warningStyle}>{t('app.home.delete.irreversible')}</p>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={actions}>
          <button
            ref={cancelRef}
            style={{ ...btnGhost, opacity: deleting ? 0.5 : 1 }}
            onClick={onClose}
            disabled={deleting}
          >
            {t('app.home.delete.cancel')}
          </button>
          <button
            style={{ ...btnDanger, opacity: deleting ? 0.6 : 1 }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 size={14} className="pdt-spin" />
                {t('common.loading')}
              </>
            ) : t('app.home.delete.confirm')}
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
  zIndex: 10002,
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
  fontFamily: 'inherit',
}

const titleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
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

const pathBox: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#B8B8B8',
  background: '#121212',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '8px 10px',
  wordBreak: 'break-all',
}

const warningStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#F87171',
  fontWeight: 600,
  lineHeight: 1.5,
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

const btnDanger: React.CSSProperties = {
  height: 30,
  padding: '0 16px',
  background: '#DC2626',
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
  background: '#242424',
  color: '#E0E0E0',
  border: '1px solid #333',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
