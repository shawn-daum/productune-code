/**
 * MetaTrackSection — meta commit timeline in the Project History sidebar
 * (T-367, QA FAIL 1 fix).
 *
 * The prdt history flow is HistoryPane → history-detail (T-349); the legacy
 * version-history tab is unreachable for prdt projects (T-291 A8), so this is
 * the REACHABLE mount for the meta track. Renders the SAME timeline
 * `prdt meta log` prints — both read core scanMetaHistory (CLI via the
 * meta-cli bridge, GUI via meta:log IPC).
 *
 * Self-hides when the project has no meta split (empty timeline). Collapsed
 * to a one-line count by default (§1.5.3 Predictability — explicit click).
 * Subjects render naturalized (§10 git abstraction — no raw metadata).
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { commitSummaryLine } from '../../views/versionHistory/helpers'

interface CommitLine {
  sha: string
  subject: string
  authorDate: string
}

const LOG_LIMIT = 100

export default function MetaTrackSection({ projectDir }: { projectDir: string }) {
  const { t } = useTranslation()
  const [commits, setCommits] = useState<CommitLine[]>([])
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(() => {
    const api = (window as any).api
    if (!api?.metaLog) return
    api.metaLog(projectDir, LOG_LIMIT)
      .then((entries: CommitLine[]) => setCommits(entries ?? []))
      .catch(() => setCommits([]))
  }, [projectDir])

  useEffect(() => { load() }, [load])

  // Same refresh signal the closed-version list listens to.
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('history:reload', handler)
    return () => window.removeEventListener('history:reload', handler)
  }, [load])

  // No meta split / no commits yet → section absent.
  if (commits.length === 0) return null

  return (
    <div style={sectionWrap}>
      <button
        style={headerBtn}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        type="button"
        data-testid="meta-track-toggle"
      >
        {expanded
          ? <ChevronDown size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          : <ChevronRight size={12} strokeWidth={2} style={{ flexShrink: 0 }} />}
        <span style={headerLabel}>{t('workspace.history.metaTrack.title')}</span>
        <span style={headerCount}>{t('workspace.history.metaTrack.count', { n: commits.length })}</span>
      </button>
      {expanded && (
        <div style={commitListWrap} data-testid="meta-track-list">
          {commits.map((c) => (
            <div key={c.sha} style={commitRow}>
              <span style={commitDate}>{c.authorDate.slice(0, 10)}</span>
              <span style={commitSummary} title={c.subject}>{commitSummaryLine(c.subject)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles — sidebar-density, matches HistoryPane look ───────────────────────

const sectionWrap: React.CSSProperties = {
  borderTop: '1px solid #222',
  marginTop: 8,
  padding: '4px 4px 8px',
  flexShrink: 0,
}

const headerBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  width: '100%',
  padding: '6px 8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#A0A0A0',
  textAlign: 'left',
}

const headerLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#A0A0A0',
}

const headerCount: React.CSSProperties = {
  fontSize: 10,
  color: '#606060',
  marginLeft: 'auto',
}

const commitListWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '0 8px',
  maxHeight: 260,
  overflowY: 'auto',
}

const commitRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  minWidth: 0,
  padding: '2px 0',
}

const commitDate: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#606060',
  flexShrink: 0,
}

const commitSummary: React.CSSProperties = {
  fontSize: 11,
  color: '#C0C0C0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
