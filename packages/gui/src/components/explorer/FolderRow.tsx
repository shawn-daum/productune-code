import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import type { FsNode } from '../../store/explorer'
import ContextMenu from './ContextMenu'

interface Props {
  node: FsNode
  depth: number
  isOpen: boolean
  onToggle: () => void
  onRevealInOS: (absPath: string) => void
  projectDir: string
}

export default function FolderRow({ node, depth, isOpen, onToggle, onRevealInOS, projectDir }: Props) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path)
    setCtxMenu(null)
  }, [node.path])

  const handleCopyRelPath = useCallback(() => {
    const rel = node.path.startsWith(projectDir)
      ? node.path.slice(projectDir.length).replace(/^\//, '')
      : node.path
    navigator.clipboard.writeText(rel)
    setCtxMenu(null)
  }, [node.path, projectDir])

  const relPath = computeRelPath(node.path, projectDir)

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isOpen}
        aria-label={node.name}
        style={rowStyle(depth, hovered)}
        onClick={onToggle}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={relPath}
      >
        <span style={chevronWrap}>
          {isOpen
            ? <ChevronDown size={12} strokeWidth={2} color="#505050" />
            : <ChevronRight size={12} strokeWidth={2} color="#505050" />}
        </span>
        <span style={iconWrap}>
          {isOpen
            ? <FolderOpen size={14} strokeWidth={1.75} color="#d4a754" />
            : <Folder size={14} strokeWidth={1.75} color="#d4a754" />}
        </span>
        <span style={labelStyle}>{node.name}</span>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: t('workspace.explorer.contextReveal'),
              onClick: () => { onRevealInOS(node.path); setCtxMenu(null) },
            },
            {
              label: t('workspace.explorer.contextCopyPath'),
              onClick: handleCopyPath,
            },
            {
              label: t('workspace.explorer.contextCopyRel'),
              onClick: handleCopyRelPath,
            },
          ]}
        />
      )}
    </>
  )
}

function computeRelPath(absPath: string, projectDir: string): string {
  if (absPath.startsWith(projectDir)) {
    return absPath.slice(projectDir.length).replace(/^\//, '') || '.'
  }
  return absPath
}

function rowStyle(depth: number, hovered: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    height: 24,
    paddingLeft: 4 + depth * 16,
    paddingRight: 8,
    cursor: 'pointer',
    background: hovered ? '#1a1a1a' : 'transparent',
    userSelect: 'none',
    gap: 2,
    outline: 'none',
  }
}

const chevronWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  width: 14,
}

const iconWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  marginRight: 4,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#C8C8C8',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}
