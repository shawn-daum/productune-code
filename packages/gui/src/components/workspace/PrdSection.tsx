/**
 * PrdSection — T-PATCH-078 shared component
 *
 * Renders the PRD row for a version (md-single-SoT decision, 2026-06-10):
 *   1. closed version → docs/prd/versions/<versionId>.md (P5 close 불변 스냅샷)
 *   2. fallback       → docs/prd/PRD.md (살아있는 master — current version)
 * Snapshot-first probe via artifactsReadFile (throws on missing file), so the
 * component needs no "which version is current" knowledge. On click opens an
 * artifact-md tab (MarkdownViewer). Neither file → subtle placeholder.
 *
 * Used in:
 *   - VersionDetailView (version-detail tab)
 *   - TicketReviewTab   (ticket-review tab, above kanban)
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'

const PRD_MASTER_REL = 'docs/prd/PRD.md'

interface Props {
  versionId?: string
}

export default function PrdSection({ versionId }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? ''

  // undefined = checking, null = not found
  const [prd, setPrd] = useState<{ absPath: string; relPath: string } | null | undefined>(undefined)

  useEffect(() => {
    if (!projectDir) { setPrd(null); return }
    let cancelled = false
    const api = (window as any).api
    const probe = (relPath: string) => {
      const absPath = `${projectDir}/${relPath}`
      return api.artifactsReadFile?.(projectDir, absPath).then(() => ({ absPath, relPath }))
    }
    const snapshotRel = versionId ? `docs/prd/versions/${versionId}.md` : null
    ;(snapshotRel ? probe(snapshotRel).catch(() => probe(PRD_MASTER_REL)) : probe(PRD_MASTER_REL))
      .then((found: { absPath: string; relPath: string }) => { if (!cancelled) setPrd(found) })
      .catch(() => { if (!cancelled) setPrd(null) })
    return () => { cancelled = true }
  }, [projectDir, versionId])

  const openPrd = useCallback(() => {
    if (!prd || !projectDir) return
    openTab(
      `artifact:${prd.relPath}`,
      'artifact-md',
      { absPath: prd.absPath, relPath: prd.relPath, projectDir },
      prd.relPath.split('/').pop() ?? 'PRD.md',
    )
  }, [prd, projectDir, openTab])

  return (
    <section style={section}>
      <h3 style={sectionTitle}>{t('workspace.versionDetail.sectionPrd')}</h3>
      {prd === undefined ? null : prd === null ? (
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
          <span style={prdRowLabel}>{prd.relPath}</span>
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
