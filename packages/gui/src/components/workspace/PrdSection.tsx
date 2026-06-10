/**
 * PrdSection — T-PATCH-078 shared component
 *
 * Renders the PRD row for a version. Path is chosen deterministically from
 * whether versionId is the OPEN (current) version or a CLOSED one:
 *   - OPEN / current (or no versionId) → docs/prd/PRD.md (살아있는 master SoT)
 *   - CLOSED                           → docs/prd/versions/<versionId>.md (P5 불변 스냅샷)
 * OPEN vs CLOSED is decided by comparing versionId to po-state current_version,
 * so no snapshot-first guess probe is needed (snapshots only exist post-close).
 * On click opens an artifact-md tab (MarkdownViewer). Missing file → subtle
 * placeholder (graceful empty-state).
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
  const currentVersion = useWorkspace((s) => s.poState?.current_version)
  const projectDir = project?.projectDir ?? ''

  // undefined = checking, null = not found
  const [prd, setPrd] = useState<{ absPath: string; relPath: string } | null | undefined>(undefined)

  useEffect(() => {
    if (!projectDir) { setPrd(null); return }
    let cancelled = false
    const api = (window as any).api
    // OPEN (current version, or no versionId) reads the live master PRD.md;
    // CLOSED versions read the immutable docs/prd/versions/<v>.md snapshot.
    const isOpen = !versionId || versionId === currentVersion
    const relPath = isOpen ? PRD_MASTER_REL : `docs/prd/versions/${versionId}.md`
    const absPath = `${projectDir}/${relPath}`
    // Handler returns null on a missing file (no ENOENT throw) → treat as not-found.
    Promise.resolve(api.artifactsReadFile?.(projectDir, absPath))
      .then((content: string | null | undefined) => {
        if (cancelled) return
        setPrd(content == null ? null : { absPath, relPath })
      })
      .catch(() => { if (!cancelled) setPrd(null) })
    return () => { cancelled = true }
  }, [projectDir, versionId, currentVersion])

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
