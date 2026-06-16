import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { useExplorer } from '../../store/explorer'
import { useWorkspace } from '../../store/workspace'
import type { TabType } from '../../store/workspace'
import FileTree from './FileTree'
import SearchPane from './SearchPane'

// ── dispatcher helper ──────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const TEXT_EXTS  = new Set([
  '.yml', '.yaml', '.txt', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.sh', '.env',
])
const MD_EXTS    = new Set(['.md', '.mdx'])
const HTML_EXTS  = new Set(['.html', '.htm'])

function resolveTabKind(filePath: string): { type: TabType; readonly?: boolean } {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (MD_EXTS.has(ext))    return { type: 'markdown' }
  if (HTML_EXTS.has(ext))  return { type: 'preview' }
  if (IMAGE_EXTS.has(ext)) return { type: 'image' }
  // .json → artifacts와 동일한 JSON 트리 뷰어(ArtifactJsonTab). (T-PATCH-160)
  if (ext === '.json')     return { type: 'artifact-json' }
  if (TEXT_EXTS.has(ext))  return { type: 'code-view', readonly: true }
  // Unknown/extensionless: route to the code viewer and let the IPC's
  // looksBinary guard decide whether to show the no-preview state. (T-PATCH-016)
  return { type: 'code-view', readonly: true }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExplorerPane() {
  const { t } = useTranslation()
  const { project, openTab } = useWorkspace()
  const { showHidden, resetTree } = useExplorer()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectDir = project?.projectDir ?? null

  // Reset tree state on projectDir change; start/stop watcher.
  useEffect(() => {
    resetTree()
    const api = (window as any).api
    if (projectDir) {
      api?.explorerWatch?.(projectDir)
    }
    return () => {
      api?.explorerUnwatch?.()
    }
  }, [projectDir, resetTree])

  // Subscribe to fs-changed events from main process.
  const handleFsChanged = useCallback(
    (payload: { type: string; path: string }, dirInvalidator: (abs: string) => void) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        // Invalidate parent dir for the changed path.
        const parentDir = payload.path.includes('/')
          ? payload.path.slice(0, payload.path.lastIndexOf('/'))
          : payload.path
        dirInvalidator(parentDir)
      }, 500)
    },
    [],
  )

  const { invalidateDir } = useExplorer()

  useEffect(() => {
    const api = (window as any).api
    if (!api?.explorerOnFsChanged || !projectDir) return
    const unsub = api.explorerOnFsChanged(
      (payload: { type: string; path: string }) => handleFsChanged(payload, invalidateDir),
    )
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      unsub?.()
    }
  }, [projectDir, handleFsChanged, invalidateDir])

  // Open tab on file click.
  const handleOpenFile = useCallback(
    (absPath: string) => {
      const fileName = absPath.split('/').pop() ?? absPath
      const { type, readonly } = resolveTabKind(absPath)
      const tabId = `file:${absPath}`
      // artifact-json (JSON tree viewer) takes a different prop contract than the
      // path-based viewers: { absPath, relPath, projectDir }, loaded via the
      // project-scoped artifactsReadFile IPC (same as ArtifactsPane). (T-PATCH-160)
      if (type === 'artifact-json' && projectDir) {
        const relPath = absPath.startsWith(projectDir + '/')
          ? absPath.slice(projectDir.length + 1)
          : absPath
        openTab(tabId, type, { absPath, relPath, projectDir }, fileName)
        return
      }
      const props: Record<string, unknown> = { path: absPath }
      if (readonly) props.readonly = true
      // code-view reads via the project-dir-scoped search:readFileLines IPC
      // (path-traversal + size + binary guards), so it needs projectDir. (T-PATCH-016)
      if (type === 'code-view' && projectDir) props.projectDir = projectDir
      // preview (local .html/.htm → HtmlViewer) reads + writes via the
      // project-scoped html:readFile / html:writeFile IPC, so it needs
      // projectDir to scope + path-guard the file. (T-PATCH-032)
      if (type === 'preview' && projectDir) props.projectDir = projectDir
      openTab(tabId, type, props, fileName)
    },
    [openTab, projectDir],
  )

  // Reveal in OS via IPC.
  const handleRevealInOS = useCallback((absPath: string) => {
    const api = (window as any).api
    api?.explorerRevealInOS?.(absPath)
  }, [])

  // Manual refresh — reset whole tree.
  const handleRefresh = useCallback(() => {
    resetTree()
  }, [resetTree])

  if (!projectDir) {
    return (
      <div style={emptyWrap}>
        <span style={emptyText}>{t('workspace.explorer.noFolder')}</span>
      </div>
    )
  }

  const dirBasename = projectDir.split('/').filter(Boolean).pop() ?? projectDir

  return (
    <div style={paneWrap}>
      {/* Header */}
      <div style={headerWrap}>
        <span style={headerTitle} title={projectDir}>{dirBasename}</span>
        <div style={headerActions}>
          <button
            style={iconBtn}
            title={t('workspace.explorer.refresh')}
            aria-label={t('workspace.explorer.refresh')}
            onClick={handleRefresh}
          >
            <RefreshCw size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Content search section (T-024) */}
      <SearchPane projectDir={projectDir} />

      {/* Tree */}
      <div style={treeScroll} id="explorer-body" aria-label={t('workspace.explorer.title')}>
        <FileTree
          rootDir={projectDir}
          showHidden={showHidden}
          onOpenFile={handleOpenFile}
          onRevealInOS={handleRevealInOS}
          projectDir={projectDir}
        />
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const paneWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
}

const headerWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 8px 0 12px',
  height: 32,
  flexShrink: 0,
  borderBottom: '1px solid #1e1e1e',
}

const headerTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#707070',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  userSelect: 'none',
}

const headerActions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#505050',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 4,
  padding: 0,
}

const treeScroll: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
}

const emptyWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
}

const emptyText: React.CSSProperties = {
  fontSize: 12,
  color: '#404040',
  textAlign: 'center',
  userSelect: 'none',
}
