/**
 * SidePanelArtifacts — Project tab "아티팩트" section (T-P4-112, restructured T-349).
 *
 * T-349 (spec §1.4-3): the old artifacts ActivityBar tab was absorbed INTO the
 * Project tab. This section merges what were two "artifacts" UIs into one:
 *   ① the old session-only list (files opened this session) — now a dim overlay
 *   ② ArtifactsPane's disk tree — now the section's actual content
 * The header count is the CURRENT VERSION's flat+archived file count (survives
 * app restart), not "files opened this session" — so the section shows whenever
 * artifacts exist on disk (the old `files.length===0 → return null` bug is gone).
 *
 * Scope: CURRENT version only (flat + archive toggle). Past-version artifacts
 * live in the Project History tab per version (§2.4) — no "version history"
 * toggle here (that duplicated the same data in two places).
 *
 * Data: artifacts:listTree(projectDir, currentVersion, []) → tree.current.
 * Session-opened files (useArtifacts store) render dim (opacity 0.45) as an
 * overlay on the matching disk rows.
 *
 * T-351: section now sits below the env section (was above) and defaults
 * expanded (was collapsed); the collapse/expand chevron moved from leading
 * the title to trailing it (right-aligned in the header row).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Code2,
  GitGraph,
  Braces,
} from 'lucide-react'
import { useArtifacts } from '../../store/useArtifacts'
import { useWorkspace } from '../../store/workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArtifactEntry {
  relPath: string
  absPath: string
  ext: string
  meta?: { ticket: string | null; kind: string; status: string }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  return seg[seg.length - 1] ?? p
}

function iconFor(ext: string) {
  if (ext === '.mmd' || ext === '.mermaid') return <GitGraph size={12} strokeWidth={2} />
  if (ext === '.html') return <Code2 size={12} strokeWidth={2} />
  if (ext === '.json') return <Braces size={12} strokeWidth={2} />
  return <FileText size={12} strokeWidth={2} />
}

const AUTO_OPEN_LIMIT = 3

// ── Component ─────────────────────────────────────────────────────────────────

export default function SidePanelArtifacts() {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const currentVersion = useWorkspace((s) => s.poState?.current_version ?? null)
  const openTab = useWorkspace((s) => s.openTab)
  const sessionFiles = useArtifacts((s) => s.files)
  const markOpened = useArtifacts((s) => s.markOpened)

  const projectDir = project?.projectDir ?? null

  const [flat, setFlat] = useState<ArtifactEntry[]>([])
  const [archived, setArchived] = useState<ArtifactEntry[]>([])
  // T-351: section now defaults open (was collapsed) — artifacts are a
  // frequently-checked result, not plumbing.
  const [expanded, setExpanded] = useState(true)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [openAllHover, setOpenAllHover] = useState(false)

  const load = useCallback(() => {
    const api = (window as any).api
    if (!api?.artifactsListTree || !projectDir) { setFlat([]); setArchived([]); return }
    api
      .artifactsListTree(projectDir, currentVersion, [])
      .then((tree: { current?: { flat?: ArtifactEntry[]; archived?: ArtifactEntry[] } }) => {
        setFlat(tree?.current?.flat ?? [])
        setArchived(tree?.current?.archived ?? [])
      })
      .catch(() => { setFlat([]); setArchived([]) })
  }, [projectDir, currentVersion])

  useEffect(() => { load() }, [load])

  // Auto-surface flows dispatch this after adding artifacts (T-P4-112).
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('artifacts:reload', handler)
    return () => window.removeEventListener('artifacts:reload', handler)
  }, [load])

  // Session-opened basenames — the dim overlay (spec §1.4-3: "사라지는 게 아니라
  // 더 큰 목록 위에 얹는 오버레이 상태"). Matched by basename so a session path in a
  // slightly different shape than the disk relPath still dims.
  const openedBasenames = useMemo(() => {
    const s = new Set<string>()
    for (const f of sessionFiles) if (f.opened) s.add(basename(f.path))
    return s
  }, [sessionFiles])

  const totalCount = flat.length + archived.length

  const handleOpen = useCallback(
    (entry: ArtifactEntry) => {
      if (!projectDir) return
      const tabId = `artifact:${entry.relPath}`
      const title = basename(entry.relPath)
      if (entry.ext === '.html') {
        openTab(tabId, 'preview', { path: entry.absPath, projectDir, relPath: entry.relPath }, title)
      } else if (entry.ext === '.mmd' || entry.ext === '.mermaid') {
        openTab(tabId, 'artifact-mermaid', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
      } else if (entry.ext === '.json') {
        openTab(tabId, 'artifact-json', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
      } else {
        openTab(tabId, 'artifact-md', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
      }
      markOpened(entry.relPath)
    },
    [openTab, projectDir, markOpened],
  )

  const hasOverflow = flat.length > AUTO_OPEN_LIMIT
  const badgeColor = totalCount > 0 ? 'var(--health-warn, #F59E0B)' : 'transparent'

  return (
    <div style={sectionWrap}>
      {/* Collapsible header — count = current version's on-disk file total.
          T-351: toggle chevron moved to the right of the title text (was
          leading); title no longer flex-stretches so the badge + chevron sit
          right after it, with a spacer pushing the chevron to the row edge. */}
      <div
        style={secHdr}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v) }}
        aria-expanded={expanded}
      >
        <span style={secHdrText}>{t('workspace.artifacts.sectionLabel', 'Artifacts')}</span>
        {totalCount > 0 ? (
          <span style={{ ...countBadge, background: badgeColor }}>{totalCount}</span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span style={{ color: '#3A3A3A', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={10} strokeWidth={2.5} /> : <ChevronRight size={10} strokeWidth={2.5} />}
        </span>
      </div>

      {expanded && (
        <div style={{ paddingBottom: 4 }}>
          {/* Empty state — section header stays; only the body says "none" */}
          {totalCount === 0 ? (
            <div style={emptyBody}>
              <div style={emptyHeadline}>{t('workspace.artifacts.emptyHeadline')}</div>
              <div style={emptyHelper}>{t('workspace.artifacts.emptyHelper')}</div>
            </div>
          ) : (
            <>
              {flat.map((entry) => (
                <ArtifactRow
                  key={entry.relPath}
                  entry={entry}
                  dim={openedBasenames.has(basename(entry.relPath))}
                  onOpen={handleOpen}
                />
              ))}

              {/* archive sub-toggle — current version only, collapsed default */}
              {archived.length > 0 && (
                <>
                  <div
                    style={archiveToggle}
                    onClick={() => setArchiveOpen((v) => !v)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setArchiveOpen((v) => !v) }}
                    aria-expanded={archiveOpen}
                  >
                    <span style={{ color: '#3A3A3A', display: 'flex' }}>
                      {archiveOpen ? <ChevronDown size={10} strokeWidth={2.5} /> : <ChevronRight size={10} strokeWidth={2.5} />}
                    </span>
                    <span>{t('workspace.artifacts.archiveLabel')}</span>
                    <span style={archiveCount}>({archived.length})</span>
                  </div>
                  {archiveOpen && archived.map((entry) => (
                    <ArtifactRow
                      key={entry.relPath}
                      entry={entry}
                      dim={openedBasenames.has(basename(entry.relPath))}
                      indent
                      onOpen={handleOpen}
                    />
                  ))}
                </>
              )}

              {/* "open all" — only when > 3 flat files (parity with old behaviour) */}
              {hasOverflow && (
                <div
                  style={{ ...openAllRow, color: openAllHover ? '#F59E0B' : '#606060' }}
                  onMouseEnter={() => setOpenAllHover(true)}
                  onMouseLeave={() => setOpenAllHover(false)}
                  onClick={() => flat.forEach(handleOpen)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') flat.forEach(handleOpen) }}
                >
                  {t('workspace.artifacts.openAll', '+ open all ({{count}})', { count: flat.length })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  entry: ArtifactEntry
  dim: boolean
  indent?: boolean
  onOpen: (entry: ArtifactEntry) => void
}

function ArtifactRow({ entry, dim, indent, onOpen }: RowProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: indent ? '3px 8px 3px 34px' : '3px 8px 3px 20px',
        cursor: 'pointer',
        opacity: dim ? 0.45 : 1,
        background: hovered ? '#1A1A1A' : 'transparent',
        transition: 'background 0.1s ease',
        borderRadius: 3,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(entry)}
      title={entry.relPath}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(entry) }}
    >
      <span style={{ color: '#606060', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {iconFor(entry.ext)}
      </span>
      <span style={{
        fontSize: 11,
        color: hovered ? '#D0D0D0' : '#A0A0A0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        transition: 'color 0.1s ease',
      }}>
        {basename(entry.relPath)}
      </span>
      {entry.meta?.status === 'pending' ? <span style={pendingDot} title="user-gate pending" /> : null}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #1E1E1E',
}

const secHdr: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '5px 8px 3px',
  gap: 4,
  cursor: 'pointer',
  userSelect: 'none',
}

const secHdrText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const countBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#0F0F0F',
  borderRadius: 3,
  padding: '1px 4px',
  lineHeight: 1.4,
  minWidth: 14,
  textAlign: 'center',
}

const archiveToggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px 4px 20px',
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  userSelect: 'none',
}

const archiveCount: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#505050',
}

const openAllRow: React.CSSProperties = {
  padding: '4px 8px 2px 20px',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  transition: 'color 0.12s ease',
}

const emptyBody: React.CSSProperties = {
  padding: '4px 10px 8px 20px',
}

const emptyHeadline: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  fontStyle: 'italic',
}

const emptyHelper: React.CSSProperties = {
  fontSize: 9,
  color: '#2A2A2A',
  marginTop: 3,
  lineHeight: 1.4,
}

const pendingDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#D97706',
  flexShrink: 0,
  marginLeft: 4,
}
