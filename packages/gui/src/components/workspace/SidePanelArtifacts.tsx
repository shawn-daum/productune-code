/**
 * SidePanelArtifacts — Project tab "산출물" sub-section (T-P4-112).
 *
 * Shows dev/designer persona output artifact files from the current session.
 * Inserted in the Project tab below SidePanelPastVersions (spec §A-5).
 *
 * UX:
 *  - Collapsible pp-sec-hdr with file count badge (amber when > 0).
 *  - One row per file: lucide-react icon + filename + click → openTab.
 *  - Opened files rendered at opacity 0.5 (dim feedback).
 *  - When > 3 files, "open all" link at bottom.
 *  - clearSession() called on PO "close version" event (not here — in ChatPanel).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, FileText, FileCode, Globe, File } from 'lucide-react'
import { useArtifacts } from '../../store/useArtifacts'
import { useWorkspace } from '../../store/workspace'
import type { ArtifactFile } from '../../store/useArtifacts'

// ── Icon helper ───────────────────────────────────────────────────────────────

function ArtifactIcon({ path, size = 12 }: { path: string; size?: number }) {
  if (path.endsWith('.md') || path.endsWith('.txt')) {
    return <FileText size={size} strokeWidth={2} />
  }
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|cs|rb|sh|json|yaml|yml|toml)$/.test(path)) {
    return <FileCode size={size} strokeWidth={2} />
  }
  if (path.endsWith('.html') || path.endsWith('.htm')) {
    return <Globe size={size} strokeWidth={2} />
  }
  return <File size={size} strokeWidth={2} />
}

// ── Filename helper ───────────────────────────────────────────────────────────

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  return seg[seg.length - 1] ?? p
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  file: ArtifactFile
  onOpen: (file: ArtifactFile) => void
}

function ArtifactRow({ file, onOpen }: RowProps) {
  const [hovered, setHovered] = useState(false)
  const name = basename(file.path)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px 3px 20px',
        cursor: 'pointer',
        opacity: file.opened ? 0.45 : 1,
        background: hovered ? '#1A1A1A' : 'transparent',
        transition: 'background 0.1s ease',
        borderRadius: 3,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(file)}
      title={file.path}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(file) }}
    >
      <span style={{ color: '#606060', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <ArtifactIcon path={file.path} size={12} />
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
        {name}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const AUTO_OPEN_LIMIT = 3

export default function SidePanelArtifacts() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [openAllHover, setOpenAllHover] = useState(false)

  const files = useArtifacts((s) => s.files)
  const markOpened = useArtifacts((s) => s.markOpened)
  const openTab = useWorkspace((s) => s.openTab)

  // Don't render section if no artifacts this session
  if (files.length === 0) return null

  const openCount = files.length
  const hasOverflow = openCount > AUTO_OPEN_LIMIT

  function handleOpen(file: ArtifactFile) {
    openTab(file.path, file.tabType, { path: file.path }, basename(file.path))
    markOpened(file.path)
  }

  function handleOpenAll() {
    for (const f of files) {
      openTab(f.path, f.tabType, { path: f.path }, basename(f.path))
      markOpened(f.path)
    }
  }

  const badgeColor = openCount > 0 ? 'var(--health-warn, #F59E0B)' : 'transparent'

  return (
    <div style={sectionWrap}>
      {/* Collapsible section header */}
      <div
        style={secHdr}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v) }}
        aria-expanded={expanded}
      >
        <span style={{ color: '#3A3A3A', display: 'flex', alignItems: 'center' }}>
          {expanded
            ? <ChevronDown size={10} strokeWidth={2.5} />
            : <ChevronRight size={10} strokeWidth={2.5} />}
        </span>
        <span style={secHdrText}>{t('workspace.artifacts.sectionLabel', 'Artifacts')}</span>
        {/* Count badge */}
        <span style={{ ...countBadge, background: badgeColor }}>
          {openCount}
        </span>
      </div>

      {/* File list */}
      {expanded && (
        <div style={{ paddingBottom: 4 }}>
          {files.map((f) => (
            <ArtifactRow key={f.path} file={f} onOpen={handleOpen} />
          ))}

          {/* "Open all" link — only when > 3 files */}
          {hasOverflow && (
            <div
              style={{
                padding: '4px 8px 2px 20px',
                fontSize: 10,
                color: openAllHover ? '#F59E0B' : '#606060',
                cursor: 'pointer',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={() => setOpenAllHover(true)}
              onMouseLeave={() => setOpenAllHover(false)}
              onClick={handleOpenAll}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenAll() }}
            >
              {t('workspace.artifacts.openAll', '+ open all {{count}}', { count: openCount })}
            </div>
          )}
        </div>
      )}
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
  flex: 1,
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
