import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Eye, EyeOff } from 'lucide-react'
import { useExplorer } from '../../store/explorer'
import { useWorkspace } from '../../store/workspace'
import type { TabType } from '../../store/workspace'
import FileTree from './FileTree'

// ── dispatcher helper ──────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const TEXT_EXTS  = new Set([
  '.json', '.yml', '.yaml', '.txt', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.sh', '.env',
])
const MD_EXTS    = new Set(['.md', '.mdx'])
const HTML_EXTS  = new Set(['.html', '.htm'])

function resolveTabKind(filePath: string): { type: TabType; readonly?: boolean } {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (MD_EXTS.has(ext))    return { type: 'markdown' }
  if (HTML_EXTS.has(ext))  return { type: 'preview' }
  if (IMAGE_EXTS.has(ext)) return { type: 'image' }
  if (TEXT_EXTS.has(ext))  return { type: 'markdown', readonly: true }
  return { type: 'binary' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExplorerPane() {
  const { t } = useTranslation()
  const { project, openTab } = useWorkspace()
  const { showHidden, toggleShowHidden, resetTree } = useExplorer()
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
      const props: Record<string, unknown> = { path: absPath }
      if (readonly) props.readonly = true
      openTab(tabId, type, props, fileName)
    },
    [openTab],
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
          <button
            style={iconBtn}
            title={showHidden ? t('workspace.explorer.hideHidden') : t('workspace.explorer.showHidden')}
            aria-label={showHidden ? t('workspace.explorer.hideHidden') : t('workspace.explorer.showHidden')}
            onClick={toggleShowHidden}
          >
            {showHidden ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
          </button>
        </div>
      </div>

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
