import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useExplorer } from '../../store/explorer'
import type { FsNode } from '../../store/explorer'
import FileRow from './FileRow'
import FolderRow from './FolderRow'

// ── Baseline excludes ─────────────────────────────────────────────────────────

const BASELINE_EXCLUDE = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'dist-electron',
  'build',
  'out',
  '.turbo',
  '.cache',
  '.DS_Store',
])

function isExcluded(name: string): boolean {
  return BASELINE_EXCLUDE.has(name)
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchDir(absPath: string): Promise<FsNode[]> {
  const api = (window as any).api
  if (!api?.explorerListDir) return []
  const nodes: FsNode[] = await api.explorerListDir(absPath)
  return nodes.filter((n) => !isExcluded(n.name))
}

// ── FileTree (recursive) ──────────────────────────────────────────────────────

interface Props {
  rootDir: string
  showHidden: boolean
  onOpenFile: (absPath: string) => void
  onRevealInOS: (absPath: string) => void
  projectDir: string
}

export default function FileTree({ rootDir, showHidden, onOpenFile, onRevealInOS, projectDir }: Props) {
  const { cache, expanded, setDirEntry, setExpanded } = useExplorer()
  const { t } = useTranslation()

  // Root fetch.
  useEffect(() => {
    const entry = cache.get(rootDir)
    if (entry) return
    setDirEntry(rootDir, { nodes: [], loading: true, error: null })
    fetchDir(rootDir).then((nodes) => {
      setDirEntry(rootDir, { nodes, loading: false, error: null })
    }).catch((e: any) => {
      setDirEntry(rootDir, { nodes: [], loading: false, error: e?.message ?? 'error' })
    })
  }, [rootDir, cache, setDirEntry])

  const rootEntry = cache.get(rootDir)

  if (!rootEntry || rootEntry.loading) {
    return (
      <div style={muteRow}>
        <span style={muteText}>{t('common.loading')}</span>
      </div>
    )
  }

  if (rootEntry.error) {
    return (
      <div style={muteRow}>
        <span style={{ ...muteText, color: '#c04040' }}>{t('workspace.explorer.readError')}</span>
        <button
          style={retryBtn}
          onClick={() => {
            setDirEntry(rootDir, { nodes: [], loading: true, error: null })
            fetchDir(rootDir).then((nodes) => {
              setDirEntry(rootDir, { nodes, loading: false, error: null })
            }).catch((e: any) => {
              setDirEntry(rootDir, { nodes: [], loading: false, error: e?.message ?? 'error' })
            })
          }}
        >
          {t('workspace.explorer.retry')}
        </button>
      </div>
    )
  }

  const visible = filterNodes(rootEntry.nodes, showHidden)

  if (visible.length === 0) {
    return (
      <div style={muteRow}>
        <span style={muteText}>{t('workspace.explorer.empty')}</span>
      </div>
    )
  }

  return (
    <DirChildren
      nodes={visible}
      depth={0}
      showHidden={showHidden}
      onOpenFile={onOpenFile}
      onRevealInOS={onRevealInOS}
      projectDir={projectDir}
      cache={cache}
      expanded={expanded}
      setDirEntry={setDirEntry}
      setExpanded={setExpanded}
    />
  )
}

// ── DirChildren (recursive pane) ──────────────────────────────────────────────

interface ChildrenProps {
  nodes: FsNode[]
  depth: number
  showHidden: boolean
  onOpenFile: (absPath: string) => void
  onRevealInOS: (absPath: string) => void
  projectDir: string
  cache: Map<string, import('../../store/explorer').DirEntry>
  expanded: Set<string>
  setDirEntry: (absPath: string, entry: import('../../store/explorer').DirEntry) => void
  setExpanded: (absPath: string, val: boolean) => void
}

function DirChildren({
  nodes,
  depth,
  showHidden,
  onOpenFile,
  onRevealInOS,
  projectDir,
  cache,
  expanded,
  setDirEntry,
  setExpanded,
}: ChildrenProps) {
  const { t } = useTranslation()

  return (
    <>
      {nodes.map((node) => {
        if (node.isDir) {
          const isOpen = expanded.has(node.path)
          const childEntry = cache.get(node.path)

          const handleToggle = () => {
            const nowOpen = !isOpen
            setExpanded(node.path, nowOpen)
            if (nowOpen && !childEntry) {
              setDirEntry(node.path, { nodes: [], loading: true, error: null })
              fetchDir(node.path).then((childNodes) => {
                setDirEntry(node.path, { nodes: childNodes, loading: false, error: null })
              }).catch((e: any) => {
                setDirEntry(node.path, { nodes: [], loading: false, error: e?.message ?? 'error' })
              })
            }
          }

          const childNodes = childEntry ? filterNodes(childEntry.nodes, showHidden) : []

          return (
            <div key={node.path} role="treeitem" aria-expanded={isOpen} aria-level={depth + 1}>
              <FolderRow
                node={node}
                depth={depth}
                isOpen={isOpen}
                onToggle={handleToggle}
                onRevealInOS={onRevealInOS}
                projectDir={projectDir}
              />
              {isOpen && (
                <>
                  {childEntry?.loading && (
                    <div style={{ paddingLeft: 16 * (depth + 1) + 8 }}>
                      <span style={muteText}>{t('common.loading')}</span>
                    </div>
                  )}
                  {childEntry?.error && (
                    <div style={{ paddingLeft: 16 * (depth + 1) + 8 }}>
                      <span style={{ ...muteText, color: '#c04040' }}>
                        {t('workspace.explorer.readError')}
                      </span>
                    </div>
                  )}
                  {childEntry && !childEntry.loading && !childEntry.error && childNodes.length === 0 && (
                    <div style={{ paddingLeft: 16 * (depth + 1) + 8 }}>
                      <span style={muteText}>{t('workspace.explorer.empty')}</span>
                    </div>
                  )}
                  {childEntry && !childEntry.loading && childNodes.length > 0 && (
                    <DirChildren
                      nodes={childNodes}
                      depth={depth + 1}
                      showHidden={showHidden}
                      onOpenFile={onOpenFile}
                      onRevealInOS={onRevealInOS}
                      projectDir={projectDir}
                      cache={cache}
                      expanded={expanded}
                      setDirEntry={setDirEntry}
                      setExpanded={setExpanded}
                    />
                  )}
                </>
              )}
            </div>
          )
        }

        return (
          <div key={node.path} role="treeitem" aria-level={depth + 1}>
            <FileRow
              node={node}
              depth={depth}
              onOpen={onOpenFile}
              onRevealInOS={onRevealInOS}
              projectDir={projectDir}
            />
          </div>
        )
      })}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterNodes(nodes: FsNode[], showHidden: boolean): FsNode[] {
  let result = nodes
  if (!showHidden) result = result.filter((n) => !n.name.startsWith('.'))
  // Sort: dirs first, then files, each alpha.
  return [...result].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

const muteRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '6px 12px',
  gap: 4,
}

const muteText: React.CSSProperties = {
  fontSize: 12,
  color: '#404040',
  userSelect: 'none',
  fontStyle: 'italic',
}

const retryBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #333',
  color: '#707070',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
}
