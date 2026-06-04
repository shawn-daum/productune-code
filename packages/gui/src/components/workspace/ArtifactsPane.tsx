/**
 * ArtifactsPane — T-014
 *
 * Scoped file list for the artifacts ActivityBar slot.
 * Scans: docs/artifacts/<version>/
 * On file row click → openTab with extension-based routing.
 *
 * Empty state: DS §8.9 (FolderOpen + headline + helper, no CTA).
 * Load error:  DS §2.8 inline health-error + retry.
 * Read-only invariant: no create/edit affordance.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  Code2,
  GitGraph,
  FolderOpen,
  Loader2,
  AlertOctagon,
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
}

interface Props {
  project: Project
  poState: PoState | null
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<ArtifactEntry['scopeGroup'], string> = {
  artifacts: 'docs/artifacts/',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ArtifactsPane({ project, poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)

  const [entries, setEntries] = useState<ArtifactEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [selectedRelPath, setSelectedRelPath] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadState('loading')
    const api = (window as any).api
    api
      .artifactsListScoped(
        project.projectDir,
        poState?.current_version ?? null,
      )
      .then((result: ArtifactEntry[]) => {
        setEntries(result)
        setLoadState('done')
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [project.projectDir, poState?.current_version])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('artifacts:reload', handler)
    return () => window.removeEventListener('artifacts:reload', handler)
  }, [load])

  function handleRowClick(entry: ArtifactEntry) {
    setSelectedRelPath(entry.relPath)
    const tabId = `artifact:${entry.relPath}`
    const title = entry.relPath.split('/').pop() ?? entry.relPath

    if (entry.ext === '.html') {
      openTab(tabId, 'browser', { url: `file://${entry.absPath}` }, title)
    } else if (entry.ext === '.mmd' || entry.ext === '.mermaid') {
      openTab(tabId, 'artifact-mermaid', { absPath: entry.absPath, relPath: entry.relPath, projectDir: project.projectDir }, title)
    } else {
      // .md
      openTab(tabId, 'artifact-md', { absPath: entry.absPath, relPath: entry.relPath, projectDir: project.projectDir }, title)
    }
  }

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

  // ── Empty state ────────────────────────────────────────────────────────────
  if (entries.length === 0) {
    return (
      <div style={centerPane}>
        <FolderOpen size={32} style={{ color: '#505050', marginBottom: 10 }} strokeWidth={1.5} />
        <div style={emptyHeadline}>{t('workspace.artifacts.emptyHeadline')}</div>
        <div style={emptyHelper}>{t('workspace.artifacts.emptyHelper')}</div>
      </div>
    )
  }

  // ── File list ──────────────────────────────────────────────────────────────
  // All entries belong to 'artifacts' scope
  const groups: Array<{ scope: ArtifactEntry['scopeGroup']; items: ArtifactEntry[] }> = [
    { scope: 'artifacts', items: entries },
  ]

  return (
    <div style={listPane}>
      <div style={scrollArea}>
        {groups.map(({ scope, items }) => (
          <div key={scope} style={scopeGroup}>
            <div style={scopeLabel}>{SCOPE_LABELS[scope]}</div>
            {items.map((entry) => {
              const isSelected = entry.relPath === selectedRelPath
              const basename = entry.relPath.split('/').pop() ?? entry.relPath
              return (
                <button
                  key={entry.relPath}
                  style={rowStyle(isSelected)}
                  onClick={() => handleRowClick(entry)}
                  title={entry.relPath}
                  type="button"
                >
                  <span style={iconWrap(isSelected)}>
                    {getIcon(entry.ext)}
                  </span>
                  <span style={rowName}>{basename}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
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
}

const scopeGroup: React.CSSProperties = {
  paddingTop: 8,
  paddingBottom: 2,
}

const scopeLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.04em',
  color: '#707070',
  padding: '2px 14px 4px',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

function rowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
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
