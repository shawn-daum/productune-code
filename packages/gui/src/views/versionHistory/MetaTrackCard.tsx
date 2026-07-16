/**
 * MetaTrackCard — the meta commit timeline in Version History (T-367).
 *
 * Renders the SAME timeline `prdt meta log` prints (both read core
 * scanMetaHistory — CLI via the meta-cli bridge, GUI via meta:log IPC).
 * Collapsed to a one-line count by default (§1.5.3 Predictability — explicit
 * click to expand, same pattern as TicketCard's autosave track). Absent
 * entirely when the project has no meta split (empty timeline).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitLine } from './types'
import { commitSummaryLine } from './helpers'
import { cardWrap, cardMeta, metaItem, expandBtn, commitList, commitRow, commitDate, commitSummary } from './styles'

export default function MetaTrackCard({ commits }: { commits: CommitLine[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (commits.length === 0) return null

  return (
    <div style={cardWrap}>
      <div style={cardMeta}>
        <span style={metaItem}>{t('workspace.versionHistory.metaTrack.title')}</span>
      </div>
      <button
        style={expandBtn}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded
          ? t('workspace.versionHistory.metaTrack.collapse')
          : t('workspace.versionHistory.metaTrack.count', { n: commits.length })}
      </button>
      {expanded && (
        <div style={commitList}>
          {commits.map((c) => (
            <div key={c.sha} style={commitRow}>
              <span style={commitDate}>{c.authorDate.slice(0, 10)}</span>
              <span style={commitSummary}>{commitSummaryLine(c.subject)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
