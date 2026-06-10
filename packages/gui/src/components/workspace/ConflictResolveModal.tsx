/**
 * ConflictResolveModal — T-P4-022 sub-g (3rd PR)
 *
 * Shown when the source branch has conflicts with base that cannot be
 * auto-resolved. Presents 3 actions per design service-flow §9 Error 패턴:
 *   [수정 후 다시 시도] — user will manually fix the conflict and retry
 *   [다른 작업으로 전환] — abort this deploy, switch to another task
 *   [도움말]            — open help documentation
 *
 * OQ-T022-5 (a): Esc / backdrop click = deploy abort + state preserved
 * (same as [다른 작업으로 전환]).
 *
 * External vocabulary ZERO in UI text — "작업", "같은 위치", etc. only.
 * `conflict` word visible in dev mode only (per R2 §4.1.1).
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export type ConflictStrategy = 'manual' | 'abort'

export interface ConflictResolveModalProps {
  /** Relative file paths with conflicts (shown as basename only). */
  conflictPaths?: string[]
  /** Called when user chooses to fix and retry. */
  onResolve: (strategy: ConflictStrategy) => void
  /** Called when user chooses to abort deploy (or presses Esc/backdrop). */
  onCancel: () => void
}

// ── File name friendlification ─────────────────────────────────────────────────
function friendlyFileName(p: string): string {
  return p.split('/').pop() ?? p
}

const HELP_URL = 'https://productune.dev/docs/deploy-conflict'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConflictResolveModal({
  conflictPaths = [],
  onResolve,
  onCancel,
}: ConflictResolveModalProps) {
  const { t } = useTranslation()
  const retryRef = useRef<HTMLButtonElement>(null)

  // Esc → abort (OQ-T022-5 (a): deploy abort + state 보존)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  // Focus primary action on mount
  useEffect(() => {
    retryRef.current?.focus()
  }, [])

  const fileNames = conflictPaths.map(friendlyFileName)
  const fileCount = conflictPaths.length

  const bodyText = fileCount > 0
    ? t('workspace.deploy.conflict.semanticBodyFiles', {
        files: fileNames.slice(0, 3).join(', '),
        count: fileCount,
      })
    : t('workspace.deploy.conflict.semanticBodyNoFiles')

  return (
    // Backdrop click → abort (OQ-T022-5 (a))
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle} id="crm-title">
          {t('workspace.deploy.conflict.semanticTitle')}
        </h2>

        <p style={bodyStyle}>{bodyText}</p>

        {/* File list — shows which files have conflicts (basename only) */}
        {fileCount > 0 && (
          <ul style={fileList}>
            {fileNames.slice(0, 5).map((f, i) => (
              <li key={i} style={fileItem}>{f}</li>
            ))}
            {fileCount > 5 && (
              <li style={{ ...fileItem, color: '#606060' }}>
                {t('workspace.deploy.conflict.moreFiles', { count: fileCount - 5 })}
              </li>
            )}
          </ul>
        )}

        <div style={actions}>
          {/* [도움말] — leftmost, ghost */}
          <button
            style={btnGhost}
            onClick={() => (window as any).api?.openExternal?.(HELP_URL)}
          >
            {t('workspace.deploy.conflict.actionHelp')}
          </button>

          <div style={actionsRight}>
            {/* [다른 작업으로 전환] — secondary */}
            <button style={btnSecondary} onClick={onCancel}>
              {t('workspace.deploy.conflict.actionSwitch')}
            </button>

            {/* [수정 후 다시 시도] — primary */}
            <button
              ref={retryRef}
              style={btnPrimary}
              onClick={() => onResolve('manual')}
            >
              {t('workspace.deploy.conflict.actionRetry')}
            </button>
          </div>
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
  zIndex: 10001,
}

const modal: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  padding: '24px 28px',
  width: 480,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
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
  fontSize: 13,
  color: '#C0C0C0',
  lineHeight: 1.6,
}

const fileList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
}

const fileItem: React.CSSProperties = {
  fontSize: 12,
  color: '#A0A0A0',
  fontFamily: 'monospace',
}

const actions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  paddingTop: 4,
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
}

const actionsRight: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
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
