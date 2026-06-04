import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

/**
 * Read-only code/text file viewer for generic project files opened from the
 * Explorer (T-PATCH-016). Mirrors CodeSearchTab's monospace + line-gutter
 * renderer but drops the search-match / highlight / scroll-to-line concerns.
 *
 * Loads via the project-dir-scoped `search:readFileLines` IPC (size/line-capped,
 * binary-guarded). A `binary file` result renders a graceful "no preview" state
 * instead of a blank pane — this replaces the old BinaryTab path for the
 * Explorer's unknown-extension fallback.
 *
 * props: { projectDir, path }
 */
interface Props {
  props?: Record<string, unknown>
}

export default function CodeViewTab({ props }: Props) {
  const { t } = useTranslation()
  const projectDir = typeof props?.projectDir === 'string' ? props.projectDir : ''
  const absPath = typeof props?.path === 'string' ? props.path : ''

  const [lines, setLines] = useState<string[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBinary, setIsBinary] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLines(null)
    setError(null)
    setIsBinary(false)
    setTruncated(false)
    if (!absPath || !projectDir) {
      setError(t('workspace.codeView.openError'))
      return
    }
    const api = (window as any).api
    if (!api?.searchReadFileLines) {
      setError(t('workspace.codeView.openError'))
      return
    }
    let cancelled = false
    setLoading(true)
    api.searchReadFileLines(projectDir, absPath)
      .then((res: { ok: boolean; lines?: string[]; truncated?: boolean; error?: string }) => {
        if (cancelled) return
        if (res?.ok && res.lines) {
          setLines(res.lines)
          setTruncated(Boolean(res.truncated))
        } else if (res?.error === 'binary file') {
          setIsBinary(true)
        } else {
          setError(res?.error ?? t('workspace.codeView.openError'))
        }
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? t('workspace.codeView.openError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [absPath, projectDir, t])

  const relPath = projectDir && absPath.startsWith(projectDir)
    ? absPath.slice(projectDir.length).replace(/^\//, '')
    : absPath

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={crumb} title={absPath}>{relPath}</span>
        <span style={roBadge}>
          <Lock size={10} strokeWidth={2} />
          {t('workspace.codeView.readonlyBadge')}
        </span>
      </div>
      <div style={view}>
        {loading ? (
          <p style={hint}>{t('common.loading')}</p>
        ) : isBinary ? (
          <p style={hint}>{t('workspace.codeView.binaryNoPreview')}</p>
        ) : error ? (
          <pre style={{ ...pre, color: '#E04040' }}>{error}</pre>
        ) : lines ? (
          <>
            <div style={code}>
              {lines.map((ln, i) => (
                <div key={i} style={row}>
                  <span style={gutter}>{i + 1}</span>
                  <span style={codeText}>{ln || ' '}</span>
                </div>
              ))}
            </div>
            {truncated ? <p style={truncHint}>{t('workspace.codeView.truncated')}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Styles (mirrors CodeSearchTab) ─────────────────────────────────────────────

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

const roBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
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

const gutter: React.CSSProperties = {
  width: 44,
  textAlign: 'right',
  color: '#505050',
  userSelect: 'none',
  flexShrink: 0,
}

const codeText: React.CSSProperties = {
  color: '#C8C8CC',
  whiteSpace: 'pre',
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
  color: '#707070',
  fontStyle: 'italic',
}

const truncHint: React.CSSProperties = {
  margin: 0,
  padding: '10px 20px',
  fontSize: 11,
  color: '#707070',
  fontFamily: 'monospace',
  borderTop: '1px solid #1A1A1A',
}
