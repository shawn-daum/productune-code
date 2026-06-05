import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import MdRenderer from '../../chat/MdRenderer'

/**
 * Generic markdown tab — toolbar (crumb + read-only badge) + rendered viewer.
 *
 * Read-only by design: this is the catch-all viewer for any `markdown` tab
 * opener (Explorer helpers, TodoListPanel, useIpcSubscriptions, MdRenderer
 * `ptn:file/...` links). Rich rendering goes through MdRenderer (T-013) — the
 * same renderer ArtifactMdTab / DoctrineFileTab use — so headings, tables,
 * lists, and code fences render instead of showing raw markdown source. Editing
 * doctrine tier files lives in DoctrineFileTab, not here (T-PATCH-027).
 *
 * T-PATCH-009 #11: when given a `~/.productune/...` path and no inline `body`,
 * fetch the file via the memory:readFile IPC so the viewer shows the file.
 */
interface Props {
  props?: Record<string, unknown>
}

export default function MarkdownTab({ props }: Props) {
  const { t } = useTranslation()
  const path = (props?.path as string) ?? null
  const inlineBody = (props?.body as string) ?? null

  const [fetched, setFetched] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch Tier-2 memory file content when given a ~/.productune path + no body.
  useEffect(() => {
    setFetched(null)
    setError(null)
    if (inlineBody !== null || !path || !path.startsWith('~/.productune/')) return
    const api = (window as any).api
    if (!api?.readMemoryFile) return
    let cancelled = false
    setLoading(true)
    api.readMemoryFile(path)
      .then((res: { ok: boolean; content?: string; exists?: boolean; error?: string }) => {
        if (cancelled) return
        if (res?.ok) setFetched(res.exists === false ? '' : (res.content ?? ''))
        else setError(res?.error ?? 'read failed')
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? 'read failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, inlineBody])

  const body = inlineBody ?? fetched
  const isEmptyMemory = fetched === '' && !error

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <span style={crumb}>{path ?? t('workspace.tab.markdown.crumbUntitled')}</span>
        <div style={roBadge}>
          <Lock size={11} style={{ flexShrink: 0 }} />
          <span>{t('workspace.common.readOnly')}</span>
        </div>
      </div>
      <div style={view}>
        {loading ? (
          <p style={hint}>{t('common.loading')}</p>
        ) : error ? (
          <pre style={{ ...pre, color: '#E04040' }}>{error}</pre>
        ) : body ? (
          <div style={viewerWrap}>
            <MdRenderer text={body} />
          </div>
        ) : isEmptyMemory ? (
          <p style={hint}>{t('workspace.tab.markdown.emptyFile')}</p>
        ) : (
          <p style={hint}>{t('workspace.tab.markdown.placeholder')}</p>
        )}
      </div>
    </div>
  )
}

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
  padding: '8px 14px',
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
  color: '#707070',
  padding: '1px 6px',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const view: React.CSSProperties = {
  flex: 1,
  padding: '16px 20px',
  overflow: 'auto',
  background: '#0F0F0F',
}

// Block-layout wrapper for MdRenderer (whose own root is display:inline, tuned
// for the chat bubble). Mirrors ArtifactMdTab / DoctrineFileTab viewerWrap so
// headings / tables / lists lay out as blocks here too.
const viewerWrap: React.CSSProperties = {
  maxWidth: 780,
  lineHeight: 1.65,
  fontSize: 13,
}

const pre: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#E0E0E0',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
}

const hint: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#3A3A3A',
  fontStyle: 'italic',
}
