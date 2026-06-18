/**
 * ArtifactsPane — T-014, restructured T-PATCH-107
 *
 * Version-tree file list for the artifacts ActivityBar slot.
 * Header label = current version name (poState.current_version).
 * Layout:
 *   - FLAT section: current-version level-1 artifacts (always open, no section header).
 *   - "archive" toggle: current-version archived artifacts (collapsed default).
 *   - "version history" toggle: past versions (po-state versions[]), each nested
 *     with the same flat / archive structure (collapsed default).
 *
 * Data source: artifacts:listTree IPC → { current, past[] }, each version split
 * into flat (root, archive/ + manifest.json excluded) and archived (manifest
 * status:'archived' SoT ∪ archive/ physical scan, basename dedupe).
 *
 * Empty state: DS §8.9 (FolderOpen + headline + helper, no CTA).
 * Load error:  DS §2.8 inline health-error + retry.
 * Read-only invariant: no create/edit affordance.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  Code2,
  GitGraph,
  Braces,
  FolderOpen,
  Loader2,
  AlertOctagon,
  ChevronRight,
  ChevronDown,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react'
import type { Project, PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArtifactEntry {
  relPath: string
  absPath: string
  ext: string
  scopeGroup: 'artifacts'
  /** manifest.json entry when registered (artifact-manifest-schema.md) */
  meta?: { ticket: string | null; kind: string; status: string }
}

interface VersionArtifacts {
  version: string
  flat: ArtifactEntry[]
  archived: ArtifactEntry[]
}

interface ArtifactTree {
  current: VersionArtifacts
  past: VersionArtifacts[]
}

interface Props {
  project: Project
  poState: PoState | null
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

const HEADER_FALLBACK = 'docs/artifacts/'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ArtifactsPane({ project, poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)

  const currentVersion = poState?.current_version ?? null

  // Past version ids in po-state order: (ended_at ?? started_at ?? id) desc,
  // matching SidePanelPastVersions. current_version excluded.
  const pastVersionIds = useMemo(() => {
    const versions = poState?.versions ?? []
    return [...versions]
      .filter((v) => v.id !== currentVersion)
      .sort((a, b) => {
        const ta = a.ended_at ?? a.started_at ?? a.id
        const tb = b.ended_at ?? b.started_at ?? b.id
        return tb.localeCompare(ta)
      })
      .map((v) => v.id)
  }, [poState?.versions, currentVersion])

  // Stable dep key for the version id array.
  const versionIdsKey = pastVersionIds.join('\n')

  const [tree, setTree] = useState<ArtifactTree | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [selectedRelPath, setSelectedRelPath] = useState<string | null>(null)

  // Toggle state — collapsed by default.
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openVersions, setOpenVersions] = useState<Set<string>>(new Set())
  const [openVersionArchives, setOpenVersionArchives] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoadState('loading')
    // T-PATCH-213: guard deref — .catch traps only promise rejection, not the
    // synchronous throw when api is undefined (browser-dev-mode).
    const api = (window as any).api
    if (!api?.artifactsListTree) { setLoadState('error'); return }
    // IPC contract: pass current + past ids; main has no po-state.
    const ids = versionIdsKey ? versionIdsKey.split('\n') : []
    api
      .artifactsListTree(project.projectDir, currentVersion, ids)
      .then((result: ArtifactTree) => {
        setTree(result)
        setLoadState('done')
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [project.projectDir, currentVersion, versionIdsKey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('artifacts:reload', handler)
    return () => window.removeEventListener('artifacts:reload', handler)
  }, [load])

  const handleRowClick = useCallback(
    (entry: ArtifactEntry) => {
      setSelectedRelPath(entry.relPath)
      const tabId = `artifact:${entry.relPath}`
      const title = entry.relPath.split('/').pop() ?? entry.relPath

      if (entry.ext === '.html') {
        openTab(tabId, 'preview', { path: entry.absPath, projectDir: project.projectDir, relPath: entry.relPath }, title)
      } else if (entry.ext === '.mmd' || entry.ext === '.mermaid') {
        openTab(tabId, 'artifact-mermaid', { absPath: entry.absPath, relPath: entry.relPath, projectDir: project.projectDir }, title)
      } else if (entry.ext === '.json') {
        openTab(tabId, 'artifact-json', { absPath: entry.absPath, relPath: entry.relPath, projectDir: project.projectDir }, title)
      } else {
        openTab(tabId, 'artifact-md', { absPath: entry.absPath, relPath: entry.relPath, projectDir: project.projectDir }, title)
      }
    },
    [openTab, project.projectDir],
  )

  const toggleVersion = useCallback((v: string) => {
    setOpenVersions((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }, [])

  const toggleVersionArchive = useCallback((v: string) => {
    setOpenVersionArchives((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }, [])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <div style={centerPane}>
        <Loader2 size={18} style={{ color: '#505050' }} className="pdt-spin" />
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <div style={errorWrap}>
        <div style={errorBanner}>
          <AlertOctagon size={14} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={errorText}>{t('workspace.artifacts.loadError')}</div>
            <button style={retryBtn} onClick={load}>
              <RefreshCwIcon size={11} />
              {t('common.retry')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const current = tree?.current ?? { version: '', flat: [], archived: [] }
  const past = tree?.past ?? []

  // ── Empty state — current version has no flat AND no archived artifacts ──────
  if (current.flat.length === 0 && current.archived.length === 0) {
    return (
      <div style={centerPane}>
        <FolderOpen size={32} style={{ color: '#505050', marginBottom: 10 }} strokeWidth={1.5} />
        <div style={emptyHeadline}>{t('workspace.artifacts.emptyHeadline')}</div>
        <div style={emptyHelper}>{t('workspace.artifacts.emptyHelper')}</div>
      </div>
    )
  }

  const headerLabel = currentVersion ?? HEADER_FALLBACK

  return (
    <div style={listPane}>
      <div style={scrollArea}>
        {/* Header = current version name */}
        <div style={scopeLabel}>{headerLabel}</div>

        {/* FLAT section — current version, always open, no section header */}
        <FileList
          items={current.flat}
          indent={0}
          selectedRelPath={selectedRelPath}
          onRowClick={handleRowClick}
        />

        {/* archive toggle — current version. Hidden when no archived artifacts. */}
        {current.archived.length > 0 && (
          <ArchiveToggle
            count={current.archived.length}
            open={archiveOpen}
            onToggle={() => setArchiveOpen((v) => !v)}
            indent={0}
            label={t('workspace.artifacts.archiveLabel')}
          >
            <FileList
              items={current.archived}
              indent={1}
              selectedRelPath={selectedRelPath}
              onRowClick={handleRowClick}
            />
          </ArchiveToggle>
        )}

        {/* version history toggle — past versions */}
        {past.length > 0 && (
          <SectionToggle
            label={t('workspace.artifacts.versionHistoryLabel')}
            count={past.length}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            indent={0}
          >
            {past.map((ver) => (
              <VersionNode
                key={ver.version}
                ver={ver}
                open={openVersions.has(ver.version)}
                archiveOpen={openVersionArchives.has(ver.version)}
                onToggle={() => toggleVersion(ver.version)}
                onToggleArchive={() => toggleVersionArchive(ver.version)}
                selectedRelPath={selectedRelPath}
                onRowClick={handleRowClick}
                archiveLabel={t('workspace.artifacts.archiveLabel')}
                emptyLabel={t('workspace.artifacts.versionEmpty')}
              />
            ))}
          </SectionToggle>
        )}
      </div>
    </div>
  )
}

// ── Version node (past version, nested flat + archive) ─────────────────────────

interface VersionNodeProps {
  ver: VersionArtifacts
  open: boolean
  archiveOpen: boolean
  onToggle: () => void
  onToggleArchive: () => void
  selectedRelPath: string | null
  onRowClick: (entry: ArtifactEntry) => void
  archiveLabel: string
  emptyLabel: string
}

function VersionNode({
  ver,
  open,
  archiveOpen,
  onToggle,
  onToggleArchive,
  selectedRelPath,
  onRowClick,
  archiveLabel,
  emptyLabel,
}: VersionNodeProps) {
  const isEmpty = ver.flat.length === 0 && ver.archived.length === 0

  return (
    <div>
      <ToggleHeader
        label={ver.version}
        open={open}
        onToggle={onToggle}
        indent={1}
        mono
      />
      {open && (
        <div>
          {isEmpty ? (
            <div style={versionEmptyText}>{emptyLabel}</div>
          ) : (
            <>
              <FileList
                items={ver.flat}
                indent={2}
                selectedRelPath={selectedRelPath}
                onRowClick={onRowClick}
              />
              {ver.archived.length > 0 && (
                <ArchiveToggle
                  count={ver.archived.length}
                  open={archiveOpen}
                  onToggle={onToggleArchive}
                  indent={2}
                  label={archiveLabel}
                >
                  <FileList
                    items={ver.archived}
                    indent={3}
                    selectedRelPath={selectedRelPath}
                    onRowClick={onRowClick}
                  />
                </ArchiveToggle>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Toggle primitives ──────────────────────────────────────────────────────────

interface ToggleHeaderProps {
  label: string
  open: boolean
  onToggle: () => void
  indent: number
  count?: number
  mono?: boolean
}

function ToggleHeader({ label, open, onToggle, indent, count, mono }: ToggleHeaderProps) {
  return (
    <div
      style={{ ...secHdr, paddingLeft: 8 + indent * 14 }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
      aria-expanded={open}
    >
      <span style={chevronWrap}>
        {open
          ? <ChevronDown size={10} strokeWidth={2.5} />
          : <ChevronRight size={10} strokeWidth={2.5} />}
      </span>
      <span style={mono ? secHdrTextMono : secHdrText}>{label}</span>
      {typeof count === 'number' && <span style={countText}>({count})</span>}
    </div>
  )
}

function SectionToggle({
  label,
  count,
  open,
  onToggle,
  indent,
  children,
}: ToggleHeaderProps & { children: React.ReactNode }) {
  return (
    <div style={sectionWrap}>
      <ToggleHeader label={label} open={open} onToggle={onToggle} indent={indent} count={count} />
      {open && <div>{children}</div>}
    </div>
  )
}

function ArchiveToggle({
  label,
  count,
  open,
  onToggle,
  indent,
  children,
}: ToggleHeaderProps & { children: React.ReactNode }) {
  return (
    <div style={sectionWrap}>
      <ToggleHeader label={label} open={open} onToggle={onToggle} indent={indent} count={count} mono />
      {open && <div>{children}</div>}
    </div>
  )
}

// ── File list (shared flat / archive / version renderer) ───────────────────────

interface FileListProps {
  items: ArtifactEntry[]
  indent: number
  selectedRelPath: string | null
  onRowClick: (entry: ArtifactEntry) => void
}

function FileList({ items, indent, selectedRelPath, onRowClick }: FileListProps) {
  return (
    <>
      {items.map((entry) => {
        const isSelected = entry.relPath === selectedRelPath
        const basename = entry.relPath.split('/').pop() ?? entry.relPath
        return (
          <button
            key={entry.relPath}
            style={rowStyle(isSelected, indent)}
            onClick={() => onRowClick(entry)}
            title={entry.relPath}
            type="button"
          >
            <span style={iconWrap(isSelected)}>{getIcon(entry.ext)}</span>
            <span style={rowName}>{basename}</span>
            {entry.meta?.status === 'pending' ? (
              <span style={pendingDot} title="user-gate pending" />
            ) : null}
          </button>
        )
      })}
    </>
  )
}

// ── Icon resolver ─────────────────────────────────────────────────────────────

function getIcon(ext: string) {
  if (ext === '.mmd' || ext === '.mermaid') {
    return <GitGraph size={14} strokeWidth={2} />
  }
  if (ext === '.html') {
    return <Code2 size={14} strokeWidth={2} />
  }
  if (ext === '.json') {
    return <Braces size={14} strokeWidth={2} />
  }
  // .md (default)
  return <FileText size={14} strokeWidth={2} />
}

// ── Styles ────────────────────────────────────────────────────────────────────

const listPane: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const scrollArea: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  paddingTop: 8,
  paddingBottom: 8,
}

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const pendingDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#D97706',
  flexShrink: 0,
  marginLeft: 4,
}

const scopeLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.04em',
  color: '#707070',
  padding: '2px 14px 4px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const secHdr: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '5px 8px 3px',
  gap: 4,
  cursor: 'pointer',
  userSelect: 'none',
}

const chevronWrap: React.CSSProperties = {
  color: '#3A3A3A',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

const secHdrText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const secHdrTextMono: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#A0A0A0',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const countText: React.CSSProperties = {
  marginLeft: 4,
  fontSize: 9,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#505050',
  whiteSpace: 'nowrap',
}

const versionEmptyText: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  padding: '4px 14px 4px 50px',
  fontStyle: 'italic',
}

function rowStyle(selected: boolean, indent: number): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    paddingLeft: 14 + indent * 14,
    width: '100%',
    background: selected ? '#1A1A1A' : 'none',
    border: 'none',
    borderLeft: `2px solid ${selected ? '#8B5CF6' : 'transparent'}`,
    color: selected ? '#F0F0F0' : '#C8C8CC',
    cursor: 'pointer',
    textAlign: 'left',
  }
}

function iconWrap(selected: boolean): React.CSSProperties {
  return {
    color: selected ? '#8B5CF6' : '#A0A0A0',
    flexShrink: 0,
    display: 'flex',
  }
}

const rowName: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
}

const centerPane: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 20px',
  textAlign: 'center',
}

const emptyHeadline: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#C8C8CC',
  lineHeight: 1.3,
  marginBottom: 5,
}

const emptyHelper: React.CSSProperties = {
  fontSize: 13,
  color: '#A0A0A0',
  lineHeight: 1.4,
}

const errorWrap: React.CSSProperties = {
  flex: 1,
  padding: 16,
}

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#1A1A1A',
  borderLeft: '4px solid #EF4444',
  borderRadius: 4,
  padding: '10px 12px',
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8CC',
  lineHeight: 1.5,
}

const retryBtn: React.CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#E8E8EA',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
