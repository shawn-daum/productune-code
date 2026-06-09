/**
 * PrdSection — T-PATCH-078 shared component
 *
 * Checks docs/artifacts/<versionId>/PRD.html via artifactsListScoped.
 * On click opens as preview tab (artifact:<relPath>, deduped by tabId).
 * No PRD.html → subtle placeholder.
 *
 * Used in:
 *   - VersionDetailView (version-detail tab)
 *   - TicketReviewTab   (ticket-review tab, above kanban)
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'

interface Props {
  versionId: string
}

export default function PrdSection({ versionId }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? ''

  // undefined = checking, null = not found, string = found absPath
  const [prdAbsPath, setPrdAbsPath] = useState<string | null | undefined>(undefined)
  const [prdRelPath, setPrdRelPath] = useState<string>('')

  useEffect(() => {
    if (!projectDir || !versionId) { setPrdAbsPath(null); return }
    let cancelled = false
    const api = (window as any).api
    const expectedRel = `docs/artifacts/${versionId}/PRD.html`
    api.artifactsListScoped?.(projectDir, versionId)
      .then((entries: Array<{ relPath: string; absPath: string; ext: string }>) => {
        if (cancelled) return
        const match = entries.find(
          (e: { relPath: string; absPath: string; ext: string }) => e.relPath === expectedRel,
        )
        if (match) {
          setPrdAbsPath(match.absPath)
          setPrdRelPath(match.relPath)
        } else {
          setPrdAbsPath(null)
        }
      })
      .catch(() => { if (!cancelled) setPrdAbsPath(null) })
    return () => { cancelled = true }
  }, [projectDir, versionId])

  const openPrd = useCallback(() => {
    if (!prdAbsPath || !projectDir) return
    openTab(
      `artifact:${prdRelPath}`,
      'preview',
      { path: prdAbsPath, projectDir, relPath: prdRelPath },
      `${versionId}/PRD.html`,
    )
  }, [prdAbsPath, prdRelPath, projectDir, versionId, openTab])

  return (
    <section style={section}>
      <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionPrd')}</h3>
      {prdAbsPath === undefined ? null : prdAbsPath === null ? (
        <div style={prdNonePlaceholder}>{t('workspace.versionDetail.prdNone')}</div>
      ) : (
        <button
          style={prdRowStyle}
          onClick={openPrd}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2A2A'
            ;(e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#1A1A1A'
            ;(e.currentTarget as HTMLButtonElement).style.background = '#141414'
          }}
        >
          <FileText size={12} style={{ color: '#505050', flexShrink: 0 }} />
          <span style={prdRowLabel}>{versionId}/PRD.html</span>
          <span style={prdRowArrow}>↗</span>
        </button>
      )}
    </section>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const section: React.CSSProperties = {
  marginBottom: 28,
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 18,
  fontWeight: 600,
  color: '#F0F0F0',
}

const prdNonePlaceholder: React.CSSProperties = {
  fontSize: 12,
  color: '#3A3A3A',
  marginLeft: 8,
}

const prdRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 10px',
  background: '#141414',
  border: '1px solid #1A1A1A',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  fontFamily: 'inherit',
  transition: 'border-color 0.1s, background 0.1s',
}

const prdRowLabel: React.CSSProperties = {
  color: '#A0A0A0',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 11,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const prdRowArrow: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  flexShrink: 0,
}
