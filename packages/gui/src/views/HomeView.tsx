import { useEffect, useState } from 'react'
import { Zap, Plus, FolderOpen } from 'lucide-react'

interface RecentProject {
  slug: string
  created_at: string
  path: string
}

interface Props {
  onNewProject: () => void
  onOpenFolder: () => void
  onOpenRecent: (projectDir: string, slug: string) => void
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  return `${days}일 전`
}

export default function HomeView({ onNewProject, onOpenFolder, onOpenRecent }: Props) {
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => {
    ;(window as any).api.listProjects().then(setRecents).catch(() => {})
  }, [])

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <Zap size={48} strokeWidth={1.5} color="#8B5CF6" />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
        productune
      </div>
      <div style={{ fontSize: 12, color: '#505050', marginBottom: 40 }}>phase 4 GUI MVP</div>

      <div style={btnGroup}>
        <button style={btnPrimary} onClick={onNewProject}>
          <Plus size={14} strokeWidth={2.25} />
          <span>새 프로젝트 만들기</span>
        </button>
        <button style={btnSecondary} onClick={onOpenFolder}>
          <FolderOpen size={14} strokeWidth={2} />
          <span>기존 폴더 열기</span>
        </button>
      </div>

      {recents.length > 0 && (
        <div style={recentSection}>
          <div style={recentLabel}>Recent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recents.map(p => (
              <div
                key={p.path}
                style={recentCard}
                onClick={() => onOpenRecent(p.path, p.slug)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#F0F0F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.slug}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#505050', flexShrink: 0 }}>{relativeDate(p.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recents.length === 0 && (
        <div style={{ marginTop: 40, color: '#505050', fontSize: 13 }}>최근 프로젝트 없음</div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = {
  background: '#0F0F0F', flex: 1, minHeight: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  color: '#F0F0F0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  userSelect: 'none',
}
const btnGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, width: 240 }
const recentSection: React.CSSProperties = { marginTop: 40, width: 340 }
const recentLabel: React.CSSProperties = {
  fontSize: 11, color: '#505050', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
}
const recentCard: React.CSSProperties = {
  background: '#1A1A1A', border: '1px solid #222', borderRadius: 6,
  padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  transition: 'border-color 0.15s',
}
const btnPrimary: React.CSSProperties = {
  background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
  display: 'flex', alignItems: 'center', gap: 8,
}
const btnSecondary: React.CSSProperties = {
  background: '#242424', color: '#F0F0F0', border: '1px solid #333', borderRadius: 4,
  padding: '10px 16px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
  display: 'flex', alignItems: 'center', gap: 8,
}
