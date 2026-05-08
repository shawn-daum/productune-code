import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { File, FileText, FileCode, FileImage } from 'lucide-react'
import type { FsNode } from '../../store/explorer'
import ContextMenu from './ContextMenu'

interface Props {
  node: FsNode
  depth: number
  onOpen: (absPath: string) => void
  onRevealInOS: (absPath: string) => void
  projectDir: string
}

// ── Icon resolver ─────────────────────────────────────────────────────────────

function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.log') {
    return <FileText size={14} strokeWidth={1.75} color="#8ab4f8" />
  }
  if (ext === '.html' || ext === '.htm' || ext === '.ts' || ext === '.tsx' ||
      ext === '.js' || ext === '.jsx' || ext === '.css' || ext === '.json' ||
      ext === '.yml' || ext === '.yaml') {
    return <FileCode size={14} strokeWidth={1.75} color="#8ab4f8" />
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
    return <FileImage size={14} strokeWidth={1.75} color="#8ab4f8" />
  }
  return <File size={14} strokeWidth={1.75} color="#606060" />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FileRow({ node, depth, onOpen, onRevealInOS, projectDir }: Props) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleOpen = useCallback(() => {
    onOpen(node.path)
  }, [node.path, onOpen])

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

  const relPath = node.path.startsWith(projectDir)
    ? node.path.slice(projectDir.length).replace(/^\//, '')
    : node.path

  return (
    <>
      <div
        role="treeitem"
        aria-label={node.name}
        style={rowStyle(depth, hovered)}
        onClick={handleOpen}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={relPath}
      >
        {/* indent spacer to align with folder chevron + icon */}
        <span style={spacer} />
        <span style={iconWrap}>{fileIcon(node.name)}</span>
        <span style={labelStyle}>{node.name}</span>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: t('workspace.explorer.contextOpen'),
              onClick: () => { handleOpen(); setCtxMenu(null) },
            },
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

// 14px spacer to align files with folder icons (chevron area).
const spacer: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  flexShrink: 0,
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
