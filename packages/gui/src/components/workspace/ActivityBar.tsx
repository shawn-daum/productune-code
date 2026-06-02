import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { FolderOpen, LayoutDashboard, Users, Layers, KanbanSquare, Settings, Package } from 'lucide-react'

/** Primary activity icons — Project / Artifacts / Team / Explorer / Settings */
export type ActivityIcon = 'explorer' | 'project' | 'team' | 'settings' | 'versions' | 'tickets' | 'artifacts'

interface Props {
  active: ActivityIcon
  onSelect: (icon: ActivityIcon) => void
}

interface IconDef {
  id: ActivityIcon
  Icon: LucideIcon
  titleKey: string
}

const ICONS: IconDef[] = [
  { id: 'project',   Icon: LayoutDashboard,  titleKey: 'workspace.activityBar.project'   },
  { id: 'artifacts', Icon: Package,          titleKey: 'workspace.activityBar.artifacts' },
  { id: 'team',      Icon: Users,            titleKey: 'workspace.activityBar.team'      },
  { id: 'explorer',  Icon: FolderOpen,       titleKey: 'workspace.activityBar.explorer'  },
  { id: 'settings',  Icon: Settings,         titleKey: 'workspace.activityBar.settings'  },
]

export default function ActivityBar({ active, onSelect }: Props) {
  const { t } = useTranslation()
  return (
    <div style={wrap}>
      {ICONS.map(({ id, Icon, titleKey }) => {
        const isActive = id === active
        const title = t(titleKey)
        return (
          <button
            key={id}
            style={btnStyle(isActive)}
            title={title}
            aria-label={title}
            onClick={() => onSelect(id)}
            onMouseEnter={(e) => {
              if (!isActive) {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
                ;(e.currentTarget as HTMLButtonElement).style.color = '#E0E0E0'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLButtonElement).style.color = '#707070'
              }
            }}
          >
            <Icon size={20} strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'activity',
  width: 48,
  background: '#0A0A0A',
  borderRight: '1px solid #1A1A1A',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: 12,
  gap: 4,
  overflow: 'hidden',
}

function btnStyle(isActive: boolean): React.CSSProperties {
  return {
    background: isActive ? '#FFFFFF' : 'transparent',
    border: 'none',
    borderRadius: 8,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: isActive ? '#0A0A0A' : '#707070',
    padding: 0,
    transition: 'color 0.12s, background 0.12s',
    flexShrink: 0,
  }
}
