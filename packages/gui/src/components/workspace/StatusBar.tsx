/**
 * StatusBar — bottom 28px workspace chrome (T-P4-059 rewrite).
 *
 * Left cluster:  project name (clickable → Recent dropdown)  •  SessionHealthSegment
 * Right cluster: placeholder (auto-save / run status — future slices)
 *
 * T-009 flow-c: project slug is now a button that opens a Recent projects dropdown.
 * Dropdown fetches via api.listProjects() (projects:list IPC) — same source as HomeView.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import SessionHealthSegment from './SessionHealthSegment'

interface RecentEntry {
  slug: string
  created_at: string
  path: string
}

interface Props {
  onOpenHealthBanner?: () => void
  onOpenRecent?: (projectDir: string, slug: string) => void
}

export default function StatusBar({ onOpenHealthBanner, onOpenRecent }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [dropdownOpen])

  async function handleSlugClick() {
    if (!project) return
    try {
      const list: RecentEntry[] = await (window as any).api.listProjects?.() ?? []
      setRecents(list)
      setDropdownOpen((v) => !v)
    } catch {
      setDropdownOpen((v) => !v)
    }
  }

  function handleSelectRecent(entry: RecentEntry) {
    setDropdownOpen(false)
    if (!project || entry.path === project.projectDir) return
    onOpenRecent?.(entry.path, entry.slug)
  }

  return (
    <div style={wrap}>
      {/* Left cluster */}
      <div style={cluster}>
        {project && (
          <div ref={dropdownRef} style={slugWrap}>
            <button style={slugBtn} onClick={handleSlugClick} title={t('workspace.statusBar.recentProjects')}>
              {project.slug}
              <ChevronDown size={10} style={{ marginLeft: 3, flexShrink: 0 }} />
            </button>

            {dropdownOpen && (
              <div style={dropdownPanel}>
                {recents.length === 0 ? (
                  <div style={dropdownEmpty}>no recent projects</div>
                ) : (
                  recents.map((entry) => {
                    const isCurrent = entry.path === project.projectDir
                    return (
                      <button
                        key={entry.path}
                        style={isCurrent ? { ...dropdownItem, ...dropdownItemDimmed } : dropdownItem}
                        disabled={isCurrent}
                        onClick={() => handleSelectRecent(entry)}
                      >
                        {entry.slug}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
        {project && <span style={sep}>·</span>}
        <SessionHealthSegment onOpenBanner={onOpenHealthBanner} />
      </div>

      {/* Right cluster — future: auto-save / deploy status */}
      <span style={placeholder}>
        {t('workspace.statusBar.placeholder')}
      </span>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'status',
  background: '#111111',
  borderTop: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  overflow: 'visible',
  height: 28,
  flexShrink: 0,
  position: 'relative',
}

const cluster: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  flex: 1,
  overflow: 'visible',
}

const slugWrap: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

const slugBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  padding: '0 2px',
  cursor: 'pointer',
  fontSize: 10,
  color: '#5A5A5A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  borderRadius: 3,
}

const sep: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  flexShrink: 0,
}

const placeholder: React.CSSProperties = {
  fontSize: 10,
  color: '#3A3A3A',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
  marginLeft: 8,
}

const dropdownPanel: React.CSSProperties = {
  position: 'absolute',
  bottom: 28,
  left: 0,
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  minWidth: 160,
  maxWidth: 280,
  zIndex: 9999,
  padding: '4px 0',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
}

const dropdownItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  padding: '5px 10px',
  fontSize: 11,
  color: '#C8C8CC',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  borderRadius: 0,
}

const dropdownItemDimmed: React.CSSProperties = {
  color: '#505050',
  cursor: 'default',
}

const dropdownEmpty: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  color: '#505050',
  userSelect: 'none',
}
