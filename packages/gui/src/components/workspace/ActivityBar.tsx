import type { LucideIcon } from 'lucide-react'
import { FolderOpen, Layers, KanbanSquare, Settings } from 'lucide-react'

export type ActivityIcon = 'versions' | 'tickets' | 'artifacts' | 'settings'

interface Props {
  active: ActivityIcon
  onSelect: (icon: ActivityIcon) => void
}

interface IconDef {
  id: ActivityIcon
  Icon: LucideIcon
  title: string
}

const ICONS: IconDef[] = [
  { id: 'tickets',   Icon: KanbanSquare,  title: '티켓' },
  { id: 'artifacts', Icon: FolderOpen,    title: '산출물' },
  { id: 'versions',  Icon: Layers,        title: 'Versions' },
  { id: 'settings',  Icon: Settings,      title: '설정' },
]

export default function ActivityBar({ active, onSelect }: Props) {
  return (
    <div style={wrap}>
      {ICONS.map(({ id, Icon, title }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            style={btnStyle(isActive)}
            title={title}
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
