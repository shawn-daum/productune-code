import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Read-only file viewer opened from a search result (T-024 AC-3).
 * Reads the file via the search:readFileLines IPC, renders it with line
 * numbers, and scrolls to + highlights the matched line. The hit line uses the
 * design-system accent (no amber). Match column ranges within the hit line are
 * marked with an accent-tinted <mark>.
 *
 * props: { projectDir, path, line, ranges? }
 *   - line is 1-based; ranges (0-based char offsets) come from the search match.
 */
interface MatchRange { start: number; end: number }

interface Props {
  props?: Record<string, unknown>
}

export default function CodeSearchTab({ props }: Props) {
  const { t } = useTranslation()
  const projectDir = typeof props?.projectDir === 'string' ? props.projectDir : ''
  const absPath = typeof props?.path === 'string' ? props.path : ''
  const targetLine = typeof props?.line === 'number' ? props.line : 1
  const ranges = Array.isArray(props?.ranges) ? (props!.ranges as MatchRange[]) : []

  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hitRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLines(null)
    setError(null)
    if (!absPath || !projectDir) {
      setError(t('workspace.search.openError'))
      return
    }
    const api = (window as any).api
    if (!api?.searchReadFileLines) {
      setError(t('workspace.search.openError'))
      return
    }
    let cancelled = false
    setLoading(true)
    api.searchReadFileLines(projectDir, absPath)
      .then((res: { ok: boolean; lines?: string[]; error?: string }) => {
        if (cancelled) return
        if (res?.ok && res.lines) setLines(res.lines)
        else setError(res?.error ?? t('workspace.search.openError'))
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? t('workspace.search.openError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [absPath, projectDir, t])

  // Scroll to the hit line once content is rendered.
  useLayoutEffect(() => {
    if (lines && hitRef.current) {
      hitRef.current.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }, [lines, targetLine])

  const relPath = projectDir && absPath.startsWith(projectDir)
    ? absPath.slice(projectDir.length).replace(/^\//, '')
    : absPath

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={crumb} title={absPath}>{relPath}</span>
        <span style={lineBadge}>{t('workspace.search.lineLabel', { line: targetLine })}</span>
      </div>
      <div style={view}>
        {loading ? (
          <p style={hint}>{t('common.loading')}</p>
        ) : error ? (
          <pre style={{ ...pre, color: '#E04040' }}>{error}</pre>
        ) : lines ? (
          <div style={code}>
            {lines.map((ln, i) => {
              const lineNo = i + 1
              const isHit = lineNo === targetLine
              return (
                <div
                  key={i}
                  ref={isHit ? hitRef : undefined}
                  style={isHit ? hitRow : row}
                >
                  <span style={isHit ? hitGutter : gutter}>{lineNo}</span>
                  <span style={codeText}>
                    {isHit && ranges.length > 0 ? renderHighlighted(ln, ranges) : (ln || ' ')}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Render a line with the match ranges wrapped in accent <mark>s. */
function renderHighlighted(line: string, ranges: MatchRange[]): React.ReactNode[] {
  // Sort + clamp ranges defensively.
  const sorted = [...ranges]
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(line.length, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  if (sorted.length === 0) return [line || ' ']

  const out: React.ReactNode[] = []
  let cursor = 0
  sorted.forEach((r, idx) => {
    if (r.start < cursor) return // overlap guard
    if (r.start > cursor) out.push(line.slice(cursor, r.start))
    out.push(<mark key={`m${idx}`} style={mark}>{line.slice(r.start, r.end)}</mark>)
    cursor = r.end
  })
  if (cursor < line.length) out.push(line.slice(cursor))
  return out
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '6px 14px',
  borderBottom: '1px solid #1A1A1A',
  background: '#0F0F0F',
  flexShrink: 0,
}

const crumb: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const lineBadge: React.CSSProperties = {
  fontSize: 10,
  color: '#8B5CF6',
  fontFamily: 'monospace',
  flexShrink: 0,
  fontWeight: 600,
}

const view: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  background: '#0F0F0F',
  padding: '8px 0',
}

const code: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.65,
}

const row: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '0 16px',
}

const hitRow: React.CSSProperties = {
  ...row,
  background: 'color-mix(in oklab, #8B5CF6 14%, transparent)',
  boxShadow: 'inset 2px 0 0 #8B5CF6',
}

const gutter: React.CSSProperties = {
  width: 44,
  textAlign: 'right',
  color: '#505050',
  userSelect: 'none',
  flexShrink: 0,
}

const hitGutter: React.CSSProperties = {
  ...gutter,
  color: '#8B5CF6',
}

const codeText: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'pre',
}

const mark: React.CSSProperties = {
  background: 'color-mix(in oklab, #8B5CF6 55%, transparent)',
  color: '#F0F0F0',
  borderRadius: 2,
  padding: '0 1px',
}

const pre: React.CSSProperties = {
  margin: 0,
  padding: '16px 20px',
  fontSize: 12,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
}

const hint: React.CSSProperties = {
  margin: 0,
  padding: '16px 20px',
  fontSize: 12,
  color: '#3A3A3A',
  fontStyle: 'italic',
}
