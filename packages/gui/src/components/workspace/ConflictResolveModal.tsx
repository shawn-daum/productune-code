/**
 * ConflictResolveModal — T-P4-022 sub-e
 *
 * Two modes (auto-detected from conflictType):
 *   - trivial: whitespace / lockfile only → single "자동 정리" CTA
 *   - semantic: real code conflicts → conversational 3-action UI
 *
 * External vocabulary ZERO — "작업", "같은 파일", "이번 작업" only.
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export type ConflictStrategy = 'theirs' | 'ours' | 'manual'

export interface ConflictResolveModalProps {
  /** 'trivial' = lockfile/whitespace only; 'semantic' = real code conflicts */
  conflictType: 'trivial' | 'semantic'
  /** Relative file paths with conflicts (user-friendlified by modal) */
  conflictPaths?: string[]
  onResolve: (strategy: ConflictStrategy) => void
  onCancel: () => void
}

// ── File name friendlification ─────────────────────────────────────────────────
// Strip path prefix, return base name only (no git internal terms).
function friendlyFileName(p: string): string {
  return p.split('/').pop() ?? p
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConflictResolveModal({
  conflictType,
  conflictPaths = [],
  onResolve,
  onCancel,
}: ConflictResolveModalProps) {
  const { t } = useTranslation()
  const primaryRef = useRef<HTMLButtonElement>(null)

  // Esc → cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  // Focus primary action
  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  const fileNames = conflictPaths.map(friendlyFileName)
  const fileCount = conflictPaths.length

  if (conflictType === 'trivial') {
    return (
      <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="crm-title">
        <div style={modal}>
          <h2 style={titleStyle} id="crm-title">
            {t('workspace.deploy.conflict.trivialTitle')}
          </h2>
          <p style={bodyStyle}>
            {t('workspace.deploy.conflict.trivialBody')}
          </p>
          <div style={actions}>
            <button style={btnGhost} onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              ref={primaryRef}
              style={btnPrimary}
              onClick={() => onResolve('theirs')}
            >
              {t('workspace.deploy.conflict.trivialCta')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Semantic mode
  const bodyText = fileCount > 0
    ? t('workspace.deploy.conflict.semanticBodyFiles', {
        files: fileNames.slice(0, 3).join(', '),
        count: fileCount,
      })
    : t('workspace.deploy.conflict.semanticBodyNoFiles')

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="crm-title">
      <div style={modal}>
        <h2 style={titleStyle} id="crm-title">
          {t('workspace.deploy.conflict.semanticTitle')}
        </h2>
        <p style={bodyStyle}>{bodyText}</p>

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
          <button style={btnGhost} onClick={() => onResolve('manual')}>
            {t('workspace.deploy.conflict.actionManual')}
          </button>
          <button style={btnSecondary} onClick={() => onResolve('theirs')}>
            {t('workspace.deploy.conflict.actionTheirs')}
          </button>
          <button
            ref={primaryRef}
            style={btnPrimary}
            onClick={() => onResolve('ours')}
          >
            {t('workspace.deploy.conflict.actionOurs')}
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
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
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
