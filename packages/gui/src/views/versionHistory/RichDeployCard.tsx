import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { FetchedDeployEvent } from './types'
import {
  cardWrap, cardHeader, cardTitle, cardMeta, metaItem,
  deployPill, expandBtn, commitList, commitRow, commitSummary,
} from './styles'

interface RichDeployCardProps {
  deploy: FetchedDeployEvent
}

export default function RichDeployCard({ deploy }: RichDeployCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()

  const durationLabel = useMemo(() => {
    if (!deploy.readyAt || !deploy.createdAt) return null
    const start = new Date(deploy.createdAt)
    const end = new Date(deploy.readyAt)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    const diffMs = end.getTime() - start.getTime()
    const mins = Math.floor(diffMs / (1000 * 60))
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000)
    if (mins > 0) return `${mins}분 ${secs}초`
    return `${secs}초`
  }, [deploy.createdAt, deploy.readyAt])

  return (
    <div style={{ ...cardWrap, borderLeft: '2px solid #22C55E40' }}>
      <div style={cardHeader}>
        <span style={deployPill}>배포</span>
        <span style={cardTitle}>{deploy.createdAt.slice(0, 10)}</span>
        <span style={{ ...deployPill, background: deploy.state === 'READY' ? '#0A2A0A' : '#1A0808', color: deploy.state === 'READY' ? '#22C55E' : '#E04040' }}>
          {deploy.state}
        </span>
        {durationLabel && <span style={metaItem}>{durationLabel} 소요</span>}
      </div>

      {deploy.includedTickets.length > 0 && (
        <div style={cardMeta}>
          {deploy.includedTickets.map((tid) => (
            <span key={tid} style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#FF6B2B', flexShrink: 0 }}>{tid}</span>
          ))}
        </div>
      )}

      {deploy.includedTickets.length === 0 && (
        <div style={cardMeta}>
          <span style={metaItem}>{t('workspace.versionHistory.deploy.empty')}</span>
        </div>
      )}

      <button
        style={expandBtn}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? '▲ 접기' : `▼ 배포 URL`}
      </button>

      {expanded && (
        <div style={commitList}>
          <div style={commitRow}>
            <span style={{ color: '#C0C0C0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deploy.url}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function DeployLoadingSkeleton() {
  const { t } = useTranslation()
  return (
    <div style={{ ...cardWrap, borderLeft: '2px solid #22C55E20', opacity: 0.5 }}>
      <div style={cardHeader}>
        <span style={deployPill}>{t('workspace.versionHistory.deploy.loading')}</span>
      </div>
    </div>
  )
}
